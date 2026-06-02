"""
Writing Analyzer – main Flet application.

Entry point: python app.py
Bundle:     pyinstaller app.spec  (see README for full command)
"""

import json
import threading
from datetime import datetime
from pathlib import Path

import flet as ft

# _border() was removed in Flet 0.80+; use this helper everywhere instead
def _border(width: int, color=None) -> ft.Border:
    side = ft.BorderSide(width, color)
    return ft.Border(left=side, right=side, top=side, bottom=side)

import subprocess

import database as db
import storage
import settings as app_settings
import coder as coder_engine
from classifier import ClassificationModel
from diff_engine import DiffChange, DiffResult, Span, condensed_spans, diff_texts
from text_extraction import ExtractionError, extract_text

# ── Colour palette for diff spans ─────────────────────────────────────────────
_C = {
    "insert":       ft.colors.GREEN_300,
    "insert_bg":    ft.colors.GREEN_900,
    "delete":       ft.colors.RED_300,
    "delete_bg":    ft.colors.RED_900,
    "move_from":    ft.colors.AMBER_300,
    "move_from_bg": ft.colors.AMBER_900,
    "move_to":      ft.colors.AMBER_300,
    "move_to_bg":   ft.colors.AMBER_800,
    "context_skip": ft.colors.GREY_500,
    "equal":        None,
}

# Classification badge colours
_TYPE_COLOR = {
    "surface":       (ft.colors.BLUE_700,   "Surface"),
    "developmental": (ft.colors.GREEN_700,  "Developmental"),
    "structural":    (ft.colors.ORANGE_700, "Structural"),
}


def _badge(label: str, count: int, color: str) -> ft.Container:
    return ft.Container(
        content=ft.Text(f"{label}: {count}", color=ft.colors.WHITE, size=13, weight=ft.FontWeight.W_500),
        bgcolor=color,
        padding=ft.padding.symmetric(horizontal=12, vertical=6),
        border_radius=16,
    )


def _code_badge(label: str, hex_color: str) -> ft.Container:
    """Small coloured pill for the coder legend / summary."""
    flet_color = f"#{hex_color}"
    return ft.Container(
        content=ft.Text(label, color=ft.colors.WHITE, size=11),
        bgcolor=flet_color,
        padding=ft.padding.symmetric(horizontal=8, vertical=4),
        border_radius=10,
    )


def _spans_to_flet(spans: list[Span]) -> ft.Text:
    text_spans = []
    for s in spans:
        if s.kind == "equal":
            text_spans.append(ft.TextSpan(s.text))
        elif s.kind == "context_skip":
            text_spans.append(ft.TextSpan(
                s.text,
                style=ft.TextStyle(color=_C["context_skip"], italic=True, size=11),
            ))
        elif s.kind == "delete":
            text_spans.append(ft.TextSpan(
                s.text,
                style=ft.TextStyle(
                    color=_C["delete"],
                    bgcolor=_C["delete_bg"],
                    decoration=ft.TextDecoration.LINE_THROUGH,
                    decoration_color=_C["delete"],
                ),
            ))
        elif s.kind == "insert":
            text_spans.append(ft.TextSpan(
                s.text,
                style=ft.TextStyle(color=_C["insert"], bgcolor=_C["insert_bg"]),
            ))
        elif s.kind == "move_from":
            text_spans.append(ft.TextSpan(
                s.text,
                style=ft.TextStyle(
                    color=_C["move_from"],
                    bgcolor=_C["move_from_bg"],
                    decoration=ft.TextDecoration.LINE_THROUGH,
                    decoration_color=_C["move_from"],
                ),
            ))
        elif s.kind == "move_to":
            text_spans.append(ft.TextSpan(
                s.text,
                style=ft.TextStyle(color=_C["move_to"], bgcolor=_C["move_to_bg"]),
            ))
    return ft.Text(spans=text_spans, selectable=True, size=13)


class WritingAnalyzerApp:
    def __init__(self, page: ft.Page):
        self.page = page
        self.classifier = ClassificationModel.get()

        # Roster state
        self.roster_class_id: int | None = None
        self.roster_student_id: int | None = None

        # Upload state
        self.upload_text: str | None = None
        self.upload_filename: str | None = None
        self.upload_class_id: int | None = None

        # Compare state
        self.cmp_left_text: str | None = None
        self.cmp_left_filename: str | None = None
        self.cmp_right_text: str | None = None
        self.cmp_right_filename: str | None = None

        # File pickers — must be in page.overlay before use (flet 0.24.x)
        self._upload_picker = ft.FilePicker(on_result=self._on_upload_file)
        self._cmp_left_picker = ft.FilePicker(on_result=self._on_cmp_left)
        self._cmp_right_picker = ft.FilePicker(on_result=self._on_cmp_right)

        # Dynamic content references
        self._content = ft.Ref[ft.Column]()
        self._nav = ft.Ref[ft.NavigationRail]()

        # Per-view dynamic refs (reset when view changes)
        self._upload_zone_ref = ft.Ref[ft.Container]()
        self._upload_status_ref = ft.Ref[ft.Text]()
        self._upload_class_dd = ft.Ref[ft.Dropdown]()
        self._upload_student_dd = ft.Ref[ft.Dropdown]()
        self._upload_assign_dd = ft.Ref[ft.Dropdown]()
        self._upload_type_rg = ft.Ref[ft.RadioGroup]()

        self._cmp_left_zone_ref = ft.Ref[ft.Container]()
        self._cmp_right_zone_ref = ft.Ref[ft.Container]()
        self._cmp_left_label = ft.Ref[ft.Text]()
        self._cmp_right_label = ft.Ref[ft.Text]()
        self._cmp_results_col = ft.Ref[ft.Column]()
        self._cmp_compare_btn = ft.Ref[ft.ElevatedButton]()

        self._roster_students_col = ft.Ref[ft.Column]()
        self._roster_subs_col = ft.Ref[ft.Column]()

        # Assignments view state
        self.assignments_selected_id: int | None = None
        self._assignments_subs_col = ft.Ref[ft.Column]()

        # Coder view state
        self._coder_queue_col = ft.Ref[ft.Column]()
        self._coder_progress_text = ft.Ref[ft.Text]()
        self._coder_lock = threading.Lock()
        self._coder_running = False
        self._pending_save_job_id: int | None = None
        self._pending_save_source: str | None = None
        self._coder_picker = ft.FilePicker(on_result=self._on_coder_file)
        self._coder_save_picker = ft.FilePicker(on_result=self._on_coder_save)

    # ── Setup ──────────────────────────────────────────────────────────────────

    def setup(self):
        p = self.page
        p.title = "Writing Analyzer"
        p.theme_mode = ft.ThemeMode.DARK
        p.padding = 0
        p.window_width = 1280
        p.window_height = 820
        p.window_min_width = 960
        p.window_min_height = 640

        # Register file pickers in the overlay so they can open native dialogs
        p.overlay.extend([
            self._upload_picker,
            self._cmp_left_picker,
            self._cmp_right_picker,
            self._coder_picker,
            self._coder_save_picker,
        ])

        nav = ft.NavigationRail(
            ref=self._nav,
            selected_index=0,
            label_type=ft.NavigationRailLabelType.ALL,
            min_width=90,
            group_alignment=-0.9,
            destinations=[
                ft.NavigationRailDestination(
                    icon=ft.icons.PEOPLE_OUTLINE,
                    selected_icon=ft.icons.PEOPLE,
                    label="Roster",
                ),
                ft.NavigationRailDestination(
                    icon=ft.icons.UPLOAD_FILE_OUTLINED,
                    selected_icon=ft.icons.UPLOAD_FILE,
                    label="Upload",
                ),
                ft.NavigationRailDestination(
                    icon=ft.icons.COMPARE_ARROWS_OUTLINED,
                    selected_icon=ft.icons.COMPARE_ARROWS,
                    label="Compare",
                ),
                ft.NavigationRailDestination(
                    icon=ft.icons.ASSIGNMENT_OUTLINED,
                    selected_icon=ft.icons.ASSIGNMENT,
                    label="Assignments",
                ),
                ft.NavigationRailDestination(
                    icon=ft.icons.SPELLCHECK_OUTLINED,
                    selected_icon=ft.icons.SPELLCHECK,
                    label="Code",
                ),
            ],
            on_change=self._nav_changed,
        )

        # No scroll on the outer column — each view manages its own scrolling.
        # Removing it here is what prevents the roster from jumping on class select.
        content_col = ft.Column(
            ref=self._content,
            expand=True,
            spacing=0,
        )

        p.add(
            ft.Row(
                [nav, ft.VerticalDivider(width=1), content_col],
                expand=True,
                spacing=0,
            )
        )

        self._show_roster()

        # Load model in background; show status snack
        self._snack("Loading AI model in background — diff works now…", ft.colors.BLUE_800)
        self.classifier.load_async(
            on_ready=lambda: self._snack("AI model ready.", ft.colors.GREEN_800),
            on_error=lambda msg: self._snack(f"AI model failed: {msg}", ft.colors.RED_800),
        )

    # ── Navigation ─────────────────────────────────────────────────────────────

    def _nav_changed(self, e):
        idx = e.control.selected_index
        if idx == 0:
            self._show_roster()
        elif idx == 1:
            self._show_upload()
        elif idx == 2:
            self._show_compare()
        elif idx == 3:
            self._show_assignments()
        elif idx == 4:
            self._show_coder()

    def _set_content(self, controls: list):
        col = self._content.current
        col.controls = controls
        col.update()

    # ── Roster View ────────────────────────────────────────────────────────────

    # ── Roster helpers ─────────────────────────────────────────────────────────

    def _show_dialog(self, dialog: ft.AlertDialog):
        self.page.dialog = dialog
        dialog.open = True
        self.page.update()

    def _close_dialog(self, e=None):
        if self.page.dialog:
            self.page.dialog.open = False
            self.page.update()

    # ── Roster view ────────────────────────────────────────────────────────────

    def _show_roster(self):
        classes = db.get_classes()

        class_tiles = []
        for cls in classes:
            selected = self.roster_class_id == cls["id"]
            class_tiles.append(self._class_row(cls, selected))

        # "+ Add Class" button at the bottom of the class list
        add_class_btn = ft.TextButton(
            "+ Add Class",
            icon=ft.icons.ADD,
            on_click=self._dlg_add_class,
        )

        class_panel = ft.Container(
            content=ft.Column(
                [ft.Text("Classes", size=14, weight=ft.FontWeight.W_700, color=ft.colors.PRIMARY)]
                + class_tiles
                + [add_class_btn],
                spacing=0,
                tight=True,
            ),
            width=210,
            bgcolor=ft.colors.SURFACE,
            border=_border(1, ft.colors.OUTLINE_VARIANT),
            border_radius=8,
            padding=8,
        )

        students_col = ft.Column(ref=self._roster_students_col, spacing=4, expand=True)
        subs_col = ft.Column(ref=self._roster_subs_col, spacing=8, expand=True)

        cls_name = ""
        if self.roster_class_id:
            for c in classes:
                if c["id"] == self.roster_class_id:
                    cls_name = c["name"]
                    break

        students_header = ft.Row(
            [
                ft.Text(
                    f"Students — {cls_name}" if cls_name else "Students",
                    size=14, weight=ft.FontWeight.W_700, color=ft.colors.PRIMARY,
                    expand=True,
                ),
                ft.IconButton(
                    ft.icons.PERSON_ADD_OUTLINED,
                    icon_size=18,
                    tooltip="Add student",
                    on_click=self._dlg_add_student,
                    disabled=self.roster_class_id is None,
                ),
            ],
        )

        self._set_content([
            ft.Container(
                content=ft.Row(
                    [
                        class_panel,
                        ft.Container(
                            content=ft.Column(
                                [students_header, students_col],
                                spacing=8,
                                expand=True,
                            ),
                            expand=True,
                            border=_border(1, ft.colors.OUTLINE_VARIANT),
                            border_radius=8,
                            bgcolor=ft.colors.SURFACE,
                            padding=8,
                        ),
                        ft.Container(
                            content=ft.Column(
                                [
                                    ft.Text("Submissions", size=14, weight=ft.FontWeight.W_700, color=ft.colors.PRIMARY),
                                    subs_col,
                                ],
                                spacing=8,
                                expand=True,
                                scroll=ft.ScrollMode.AUTO,
                            ),
                            expand=True,
                            border=_border(1, ft.colors.OUTLINE_VARIANT),
                            border_radius=8,
                            bgcolor=ft.colors.SURFACE,
                            padding=8,
                        ),
                    ],
                    expand=True,
                    spacing=12,
                    vertical_alignment=ft.CrossAxisAlignment.START,
                ),
                expand=True,
                padding=16,
            )
        ])

        if self.roster_class_id is not None:
            self._populate_roster_students()
        if self.roster_student_id is not None:
            self._populate_roster_subs()

    def _class_row(self, cls, selected: bool) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                [
                    ft.Text(
                        cls["name"],
                        expand=True,
                        size=13,
                        weight=ft.FontWeight.W_600 if selected else ft.FontWeight.NORMAL,
                    ),
                    ft.IconButton(
                        ft.icons.EDIT_OUTLINED,
                        icon_size=14,
                        tooltip="Rename class",
                        on_click=lambda e, cid=cls["id"], cname=cls["name"]: self._dlg_rename_class(cid, cname),
                    ),
                    ft.IconButton(
                        ft.icons.DELETE_OUTLINE,
                        icon_size=14,
                        tooltip="Delete class",
                        icon_color=ft.colors.RED_400,
                        on_click=lambda e, cid=cls["id"], cname=cls["name"]: self._dlg_delete_class(cid, cname),
                    ),
                ],
                spacing=0,
            ),
            bgcolor=ft.colors.SURFACE_VARIANT if selected else None,
            border_radius=6,
            padding=ft.padding.symmetric(horizontal=4, vertical=2),
            on_click=lambda e, cid=cls["id"]: self._roster_select_class(cid),
            ink=True,
        )

    def _roster_select_class(self, class_id: int):
        self.roster_class_id = class_id
        self.roster_student_id = None
        self._show_roster()

    def _populate_roster_students(self):
        students = db.get_students(self.roster_class_id)
        col = self._roster_students_col.current
        col.controls = []
        for s in students:
            col.controls.append(self._student_row(s))
        if not students:
            col.controls = [ft.Text("No students yet. Click + to add one.", color=ft.colors.GREY_500, italic=True)]
        col.update()

    def _student_row(self, student) -> ft.Control:
        name_text = ft.Text(student["name"], size=13, weight=ft.FontWeight.W_500, expand=True)
        name_field = ft.TextField(value=student["name"], dense=True, border_radius=4, visible=False, expand=True)

        def start_edit(e):
            name_text.visible = False
            name_field.value = name_text.value
            name_field.visible = True
            name_field.focus()
            row.update()

        def commit_edit(e):
            new_name = name_field.value.strip() or name_text.value
            db.rename_student(student["id"], new_name)
            name_text.value = new_name
            name_text.visible = True
            name_field.visible = False
            row.update()

        name_field.on_submit = commit_edit
        name_field.on_blur = commit_edit

        selected = self.roster_student_id == student["id"]
        row = ft.Row(
            [
                name_text,
                name_field,
                ft.IconButton(ft.icons.EDIT_OUTLINED, icon_size=14, on_click=start_edit, tooltip="Rename"),
                ft.IconButton(
                    ft.icons.DRIVE_FILE_MOVE_OUTLINED,
                    icon_size=14,
                    tooltip="Move to another class",
                    on_click=lambda e, sid=student["id"], sname=student["name"]: self._dlg_move_student(sid, sname),
                ),
                ft.IconButton(
                    ft.icons.PERSON_REMOVE_OUTLINED,
                    icon_size=14,
                    icon_color=ft.colors.RED_400,
                    tooltip="Remove student",
                    on_click=lambda e, sid=student["id"], sname=student["name"]: self._dlg_delete_student(sid, sname),
                ),
            ],
            spacing=0,
        )

        return ft.Container(
            content=row,
            bgcolor=ft.colors.PRIMARY_CONTAINER if selected else None,
            border_radius=6,
            padding=ft.padding.symmetric(horizontal=6, vertical=2),
            on_click=lambda e, sid=student["id"]: self._roster_select_student(sid),
            ink=True,
        )

    def _roster_select_student(self, student_id: int):
        self.roster_student_id = student_id
        self._populate_roster_students()
        self._populate_roster_subs()

    # ── Roster dialogs ─────────────────────────────────────────────────────────

    def _dlg_add_class(self, e):
        field = ft.TextField(label="Class name", autofocus=True)

        def save(e):
            name = field.value.strip()
            if not name:
                return
            db.add_class(name)
            self._close_dialog()
            self._show_roster()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("Add Class"),
            content=field,
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Add", on_click=save),
            ],
        ))

    def _dlg_rename_class(self, class_id: int, current_name: str):
        field = ft.TextField(label="Class name", value=current_name, autofocus=True)

        def save(e):
            name = field.value.strip()
            if not name:
                return
            db.rename_class(class_id, name)
            self._close_dialog()
            self._show_roster()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("Rename Class"),
            content=field,
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Save", on_click=save),
            ],
        ))

    def _dlg_delete_class(self, class_id: int, class_name: str):
        def confirm(e):
            if self.roster_class_id == class_id:
                self.roster_class_id = None
                self.roster_student_id = None
            db.delete_class(class_id)
            self._close_dialog()
            self._show_roster()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("Delete Class"),
            content=ft.Text(f'Delete "{class_name}" and all its students and submissions? This cannot be undone.'),
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Delete", on_click=confirm, style=ft.ButtonStyle(bgcolor=ft.colors.RED_700)),
            ],
        ))

    def _dlg_add_student(self, e):
        if not self.roster_class_id:
            return
        field = ft.TextField(label="Student name", autofocus=True)

        def save(e):
            name = field.value.strip()
            if not name:
                return
            db.add_student(self.roster_class_id, name)
            self._close_dialog()
            self._populate_roster_students()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("Add Student"),
            content=field,
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Add", on_click=save),
            ],
        ))

    def _dlg_delete_student(self, student_id: int, student_name: str):
        def confirm(e):
            if self.roster_student_id == student_id:
                self.roster_student_id = None
            db.delete_student(student_id)
            self._close_dialog()
            self._populate_roster_students()
            subs_col = self._roster_subs_col.current
            subs_col.controls = []
            subs_col.update()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("Remove Student"),
            content=ft.Text(f'Remove "{student_name}" and all their submissions? This cannot be undone.'),
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Remove", on_click=confirm, style=ft.ButtonStyle(bgcolor=ft.colors.RED_700)),
            ],
        ))

    def _dlg_move_student(self, student_id: int, student_name: str):
        classes = db.get_classes()
        options = [
            ft.dropdown.Option(key=str(c["id"]), text=c["name"])
            for c in classes if c["id"] != self.roster_class_id
        ]
        dd = ft.Dropdown(label="Move to class", options=options, width=260)

        def confirm(e):
            if not dd.value:
                return
            new_class_id = int(dd.value)
            if self.roster_student_id == student_id:
                self.roster_student_id = None
            db.move_student(student_id, new_class_id)
            self._close_dialog()
            self._populate_roster_students()
            subs_col = self._roster_subs_col.current
            subs_col.controls = []
            subs_col.update()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text(f'Move "{student_name}"'),
            content=dd,
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Move", on_click=confirm),
            ],
        ))

    # ── Assignments View ────────────────────────────────────────────────────────

    def _show_assignments(self):
        assignments = db.get_assignments()

        tiles = []
        for a in assignments:
            selected = self.assignments_selected_id == a["id"]
            tiles.append(self._assignment_row(a, selected))

        add_btn = ft.TextButton("+ Add Assignment", icon=ft.icons.ADD, on_click=self._dlg_add_assignment)

        assign_panel = ft.Container(
            content=ft.Column(
                [ft.Text("Assignments", size=14, weight=ft.FontWeight.W_700, color=ft.colors.PRIMARY)]
                + tiles
                + [add_btn],
                spacing=0,
                tight=True,
                scroll=ft.ScrollMode.AUTO,
                expand=True,
            ),
            width=250,
            expand=False,
            bgcolor=ft.colors.SURFACE,
            border=_border(1, ft.colors.OUTLINE_VARIANT),
            border_radius=8,
            padding=8,
        )

        subs_col = ft.Column(
            ref=self._assignments_subs_col,
            spacing=8,
            expand=True,
            scroll=ft.ScrollMode.AUTO,
        )

        self._set_content([
            ft.Container(
                content=ft.Row(
                    [
                        assign_panel,
                        ft.Container(
                            content=ft.Column(
                                [
                                    ft.Text(
                                        "Submissions",
                                        size=14, weight=ft.FontWeight.W_700, color=ft.colors.PRIMARY,
                                    ),
                                    subs_col,
                                ],
                                spacing=8,
                                expand=True,
                            ),
                            expand=True,
                            border=_border(1, ft.colors.OUTLINE_VARIANT),
                            border_radius=8,
                            bgcolor=ft.colors.SURFACE,
                            padding=8,
                        ),
                    ],
                    expand=True,
                    spacing=12,
                    vertical_alignment=ft.CrossAxisAlignment.START,
                ),
                expand=True,
                padding=16,
            )
        ])

        if self.assignments_selected_id is not None:
            self._populate_assignments_subs()

    def _assignment_row(self, assign, selected: bool) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                [
                    ft.Text(
                        assign["name"],
                        expand=True,
                        size=13,
                        weight=ft.FontWeight.W_600 if selected else ft.FontWeight.NORMAL,
                    ),
                    ft.IconButton(
                        ft.icons.EDIT_OUTLINED, icon_size=14, tooltip="Rename",
                        on_click=lambda e, aid=assign["id"], aname=assign["name"]: self._dlg_rename_assignment(aid, aname),
                    ),
                    ft.IconButton(
                        ft.icons.DELETE_OUTLINE, icon_size=14, tooltip="Delete",
                        icon_color=ft.colors.RED_400,
                        on_click=lambda e, aid=assign["id"], aname=assign["name"]: self._dlg_delete_assignment(aid, aname),
                    ),
                ],
                spacing=0,
            ),
            bgcolor=ft.colors.SURFACE_VARIANT if selected else None,
            border_radius=6,
            padding=ft.padding.symmetric(horizontal=4, vertical=2),
            on_click=lambda e, aid=assign["id"]: self._assignments_select(aid),
            ink=True,
        )

    def _assignments_select(self, assignment_id: int):
        self.assignments_selected_id = assignment_id
        self._show_assignments()

    def _populate_assignments_subs(self):
        col = self._assignments_subs_col.current
        subs = db.get_submissions_for_assignment(self.assignments_selected_id)
        col.controls = []
        if not subs:
            col.controls = [ft.Text("No submissions for this assignment yet.", color=ft.colors.GREY_500, italic=True)]
        else:
            for sub in subs:
                col.controls.append(self._assignment_sub_card(sub))
        col.update()

    def _assignment_sub_card(self, sub) -> ft.Control:
        """Submission card that includes student name and class — used in the Assignments view."""
        tag_color = ft.colors.AMBER_700 if sub["type_tag"] == "baseline" else ft.colors.BLUE_700
        date_str = sub["upload_date"][:10]

        summary_chips = []
        if sub["classification_results"]:
            try:
                results = json.loads(sub["classification_results"])
                summ = results.get("summary", {})
                for t, (col, label) in _TYPE_COLOR.items():
                    n = summ.get(t, 0)
                    if n:
                        summary_chips.append(
                            ft.Container(
                                content=ft.Text(f"{label[0]}: {n}", size=11, color=ft.colors.WHITE),
                                bgcolor=col,
                                padding=ft.padding.symmetric(horizontal=6, vertical=2),
                                border_radius=10,
                            )
                        )
            except (json.JSONDecodeError, KeyError):
                pass

        return ft.Container(
            content=ft.Column(
                [
                    ft.Row(
                        [
                            ft.Text(
                                f"{sub['class_name']}  ·  {sub['student_name']}",
                                size=13, weight=ft.FontWeight.W_600, expand=True,
                            ),
                            ft.Container(
                                content=ft.Text(sub["type_tag"], size=11, color=ft.colors.WHITE),
                                bgcolor=tag_color,
                                padding=ft.padding.symmetric(horizontal=6, vertical=2),
                                border_radius=10,
                            ),
                        ]
                    ),
                    ft.Text(f"{sub['filename']}  ·  {date_str}", size=11, color=ft.colors.GREY_500),
                    ft.Row(summary_chips, wrap=True, spacing=4) if summary_chips else ft.Text(
                        "No classification yet", size=11, color=ft.colors.GREY_600, italic=True,
                    ),
                ],
                spacing=4,
                tight=True,
            ),
            border=_border(1, ft.colors.OUTLINE_VARIANT),
            border_radius=8,
            padding=10,
        )

    # ── Assignment dialogs ─────────────────────────────────────────────────────

    def _dlg_add_assignment(self, e):
        field = ft.TextField(label="Assignment name", autofocus=True)

        def save(ev):
            name = field.value.strip()
            if not name:
                return
            db.add_assignment(name)
            self._close_dialog()
            self._show_assignments()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("New Assignment"),
            content=field,
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Add", on_click=save),
            ],
        ))

    def _dlg_rename_assignment(self, assignment_id: int, current_name: str):
        field = ft.TextField(label="Assignment name", value=current_name, autofocus=True)

        def save(ev):
            name = field.value.strip()
            if not name:
                return
            db.rename_assignment(assignment_id, name)
            self._close_dialog()
            self._show_assignments()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("Rename Assignment"),
            content=field,
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Save", on_click=save),
            ],
        ))

    def _dlg_delete_assignment(self, assignment_id: int, assignment_name: str):
        def confirm(ev):
            if self.assignments_selected_id == assignment_id:
                self.assignments_selected_id = None
            db.delete_assignment(assignment_id)
            self._close_dialog()
            self._show_assignments()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("Delete Assignment"),
            content=ft.Text(
                f'Delete "{assignment_name}"? Submissions linked to it will remain but lose the assignment label.'
            ),
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Delete", on_click=confirm, style=ft.ButtonStyle(bgcolor=ft.colors.RED_700)),
            ],
        ))

    def _populate_roster_subs(self):
        col = self._roster_subs_col.current
        col.controls = []
        subs = db.get_submissions_for_student(self.roster_student_id)
        if not subs:
            col.controls = [ft.Text("No submissions yet.", color=ft.colors.GREY_500, italic=True)]
            col.update()
            return
        for sub in subs:
            col.controls.append(self._sub_card(sub))
        col.update()

    def _sub_card(self, sub) -> ft.Control:
        tag_color = ft.colors.AMBER_700 if sub["type_tag"] == "baseline" else ft.colors.BLUE_700
        date_str = sub["upload_date"][:10]
        assign = sub["assignment_name"] or "No assignment"

        summary_chips = []
        if sub["classification_results"]:
            try:
                results = json.loads(sub["classification_results"])
                summ = results.get("summary", {})
                for t, (col, label) in _TYPE_COLOR.items():
                    n = summ.get(t, 0)
                    if n:
                        summary_chips.append(
                            ft.Container(
                                content=ft.Text(f"{label[0]}: {n}", size=11, color=ft.colors.WHITE),
                                bgcolor=col,
                                padding=ft.padding.symmetric(horizontal=6, vertical=2),
                                border_radius=10,
                            )
                        )
            except (json.JSONDecodeError, KeyError):
                pass

        return ft.Container(
            content=ft.Column(
                [
                    ft.Row(
                        [
                            ft.Text(assign, size=13, weight=ft.FontWeight.W_600, expand=True),
                            ft.Container(
                                content=ft.Text(sub["type_tag"], size=11, color=ft.colors.WHITE),
                                bgcolor=tag_color,
                                padding=ft.padding.symmetric(horizontal=6, vertical=2),
                                border_radius=10,
                            ),
                        ]
                    ),
                    ft.Text(f"{sub['filename']}  ·  {date_str}", size=11, color=ft.colors.GREY_500),
                    ft.Row(summary_chips, wrap=True, spacing=4) if summary_chips else ft.Text(
                        "No classification yet", size=11, color=ft.colors.GREY_600, italic=True
                    ),
                ],
                spacing=4,
                tight=True,
            ),
            border=_border(1, ft.colors.OUTLINE_VARIANT),
            border_radius=8,
            padding=10,
        )

    # ── Upload View ────────────────────────────────────────────────────────────

    def _show_upload(self):
        classes = db.get_classes()
        assignments = db.get_assignments()

        class_opts = [ft.dropdown.Option(key=str(c["id"]), text=c["name"]) for c in classes]
        assign_opts = [ft.dropdown.Option(key=str(a["id"]), text=a["name"]) for a in assignments]

        zone = ft.Container(
            ref=self._upload_zone_ref,
            content=ft.Column(
                [
                    ft.Icon(ft.icons.UPLOAD_FILE_OUTLINED, size=48, color=ft.colors.GREY_500),
                    ft.Text("Click to select a file", size=16, color=ft.colors.GREY_400),
                    ft.Text("PDF or DOCX only", size=12, color=ft.colors.GREY_600),
                ],
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                alignment=ft.MainAxisAlignment.CENTER,
                spacing=8,
            ),
            height=160,
            bgcolor=ft.colors.SURFACE,
            border=_border(2, ft.colors.OUTLINE_VARIANT),
            border_radius=12,
            alignment=ft.alignment.center,
            on_click=lambda e: self._upload_picker.pick_files(
                allowed_extensions=["pdf", "docx"],
                allow_multiple=False,
                initial_directory=app_settings.get("last_upload_dir"),
            ),
            ink=True,
        )

        status = ft.Text("", ref=self._upload_status_ref, size=13, color=ft.colors.GREEN_400)

        class_dd = ft.Dropdown(
            ref=self._upload_class_dd,
            label="Class",
            options=class_opts,
            width=200,
            on_change=self._upload_class_changed,
        )
        student_dd = ft.Dropdown(
            ref=self._upload_student_dd,
            label="Student",
            options=[],
            width=240,
            disabled=True,
        )
        assign_dd = ft.Dropdown(
            ref=self._upload_assign_dd,
            label="Assignment",
            options=assign_opts,
            width=240,
        )

        type_rg = ft.RadioGroup(
            ref=self._upload_type_rg,
            value="regular",
            content=ft.Row([
                ft.Radio(value="regular", label="Regular"),
                ft.Radio(value="baseline", label="Baseline (in-class)"),
            ]),
        )

        assign_row = ft.Row(
            [
                assign_dd,
                ft.IconButton(
                    ft.icons.ADD_CIRCLE_OUTLINE,
                    tooltip="Create new assignment",
                    on_click=self._dlg_add_assignment_upload,
                ),
            ],
            spacing=4,
        )

        self._set_content([
            ft.Container(
                content=ft.Column(
                    [
                        ft.Text("Upload Submission", size=20, weight=ft.FontWeight.W_700),
                        ft.Divider(height=1),
                        zone,
                        status,
                        ft.Row([class_dd, student_dd], spacing=12, wrap=True),
                        assign_row,
                        ft.Text("Submission type:", size=13),
                        type_rg,
                        ft.ElevatedButton(
                            "Save Submission",
                            icon=ft.icons.SAVE_OUTLINED,
                            on_click=self._do_upload,
                        ),
                    ],
                    spacing=16,
                    scroll=ft.ScrollMode.AUTO,
                    expand=True,
                ),
                expand=True,
                padding=24,
            )
        ])

    def _dlg_add_assignment_upload(self, e):
        """Open 'New Assignment' dialog from the Upload view."""
        field = ft.TextField(label="Assignment name", autofocus=True)

        def save(ev):
            name = field.value.strip()
            if not name:
                return
            aid = db.add_assignment(name)
            assign_dd = self._upload_assign_dd.current
            assign_dd.options.append(ft.dropdown.Option(key=str(aid), text=name))
            assign_dd.value = str(aid)
            assign_dd.update()
            self._close_dialog()

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("New Assignment"),
            content=field,
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton("Add", on_click=save),
            ],
        ))

    def _upload_class_changed(self, e):
        cid = int(e.control.value) if e.control.value else None
        self.upload_class_id = cid
        dd = self._upload_student_dd.current
        if cid:
            students = db.get_students(cid)
            dd.options = [ft.dropdown.Option(key=str(s["id"]), text=s["name"]) for s in students]
            dd.disabled = False
        else:
            dd.options = []
            dd.disabled = True
        dd.value = None
        dd.update()

    def _on_upload_file(self, e):
        if not e.files:
            return
        f = e.files[0]
        # Remember this folder for next time
        app_settings.set("last_upload_dir", str(Path(f.path).parent))
        try:
            text = extract_text(f.path)
        except ExtractionError as exc:
            self._snack(str(exc), ft.colors.RED_800)
            return

        self.upload_text = text
        self.upload_filename = f.name

        zone = self._upload_zone_ref.current
        zone.content = ft.Row(
            [
                ft.Icon(ft.icons.CHECK_CIRCLE_OUTLINE, color=ft.colors.GREEN_400, size=32),
                ft.Column(
                    [
                        ft.Text(f.name, weight=ft.FontWeight.W_600, size=14),
                        ft.Text(f"{len(text.split())} words extracted", size=12, color=ft.colors.GREY_400),
                    ],
                    spacing=2,
                    tight=True,
                ),
            ],
            alignment=ft.MainAxisAlignment.CENTER,
            spacing=12,
        )
        zone.border = _border(2, ft.colors.GREEN_700)
        zone.update()

    def _do_upload(self, e):
        if not self.upload_text:
            self._snack("Please select a file first.", ft.colors.AMBER_800)
            return

        class_dd = self._upload_class_dd.current
        student_dd = self._upload_student_dd.current
        assign_dd = self._upload_assign_dd.current
        type_rg = self._upload_type_rg.current

        student_id = int(student_dd.value) if student_dd.value else None
        assign_id = int(assign_dd.value) if assign_dd.value else None
        type_tag = type_rg.value or "regular"

        if not student_id:
            self._snack("Please select a student.", ft.colors.AMBER_800)
            return

        # Resolve names for the folder path
        student = db.get_student(student_id)
        class_row = db.get_class(student["class_id"])
        assign_row = db.get_assignment(assign_id) if assign_id else None
        assign_name = assign_row["name"] if assign_row else "No_Assignment"
        class_name = class_row["name"] if class_row else "Unknown_Class"

        # Save plain-text file; store path in DB
        text_path = storage.save_text(
            class_name, student["name"], assign_name, self.upload_text
        )

        db.add_submission(
            student_id=student_id,
            assignment_id=assign_id,
            filename=self.upload_filename,
            text=self.upload_text,
            upload_date=datetime.now().isoformat(timespec="seconds"),
            type_tag=type_tag,
            text_path=str(text_path),
        )

        self._snack(f"Saved: {self.upload_filename}", ft.colors.GREEN_800)
        self.upload_text = None
        self.upload_filename = None
        self._show_upload()

    # ── Compare View ───────────────────────────────────────────────────────────

    def _show_compare(self):
        def _zone(ref_zone, ref_label, pick_fn, side: str) -> ft.Container:
            label = ft.Text(
                f"Drop {side} file here  ·  click to browse",
                size=13,
                color=ft.colors.GREY_400,
                ref=ref_label,
            )
            return ft.Container(
                ref=ref_zone,
                content=ft.Column(
                    [
                        ft.Icon(ft.icons.DESCRIPTION_OUTLINED, size=40, color=ft.colors.GREY_500),
                        ft.Text(side, size=16, weight=ft.FontWeight.W_700),
                        label,
                    ],
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    alignment=ft.MainAxisAlignment.CENTER,
                    spacing=8,
                ),
                expand=True,
                height=160,
                bgcolor=ft.colors.SURFACE,
                border=_border(2, ft.colors.OUTLINE_VARIANT),
                border_radius=12,
                alignment=ft.alignment.center,
                on_click=pick_fn,
                ink=True,
            )

        left_zone = _zone(
            self._cmp_left_zone_ref,
            self._cmp_left_label,
            lambda e: self._cmp_left_picker.pick_files(allowed_extensions=["pdf", "docx"], allow_multiple=False),
            "Original",
        )
        right_zone = _zone(
            self._cmp_right_zone_ref,
            self._cmp_right_label,
            lambda e: self._cmp_right_picker.pick_files(allowed_extensions=["pdf", "docx"], allow_multiple=False),
            "New Version",
        )

        compare_btn = ft.ElevatedButton(
            ref=self._cmp_compare_btn,
            text="Compare",
            icon=ft.icons.COMPARE_ARROWS,
            on_click=self._run_compare,
            style=ft.ButtonStyle(
                padding=ft.padding.symmetric(horizontal=24, vertical=14),
            ),
        )

        results_col = ft.Column(ref=self._cmp_results_col, spacing=16, expand=True)

        self._set_content([
            ft.Container(
                content=ft.Column(
                    [
                        ft.Text("Compare Submissions", size=20, weight=ft.FontWeight.W_700),
                        ft.Divider(height=1),
                        ft.Row([left_zone, ft.VerticalDivider(width=8), right_zone], expand=True),
                        ft.Row([compare_btn], alignment=ft.MainAxisAlignment.CENTER),
                        results_col,
                    ],
                    spacing=16,
                    expand=True,
                ),
                expand=True,
                padding=24,
            )
        ])

    def _on_cmp_left(self, e):
        if not e.files:
            return
        f = e.files[0]
        try:
            self.cmp_left_text = extract_text(f.path)
            self.cmp_left_filename = f.name
            self._update_cmp_zone(self._cmp_left_zone_ref, f.name, self.cmp_left_text, "Original")
        except ExtractionError as exc:
            self._snack(str(exc), ft.colors.RED_800)

    def _on_cmp_right(self, e):
        if not e.files:
            return
        f = e.files[0]
        try:
            self.cmp_right_text = extract_text(f.path)
            self.cmp_right_filename = f.name
            self._update_cmp_zone(self._cmp_right_zone_ref, f.name, self.cmp_right_text, "New Version")
        except ExtractionError as exc:
            self._snack(str(exc), ft.colors.RED_800)

    def _update_cmp_zone(self, zone_ref, filename: str, text: str, side: str):
        zone = zone_ref.current
        zone.content = ft.Column(
            [
                ft.Icon(ft.icons.CHECK_CIRCLE_OUTLINE, color=ft.colors.GREEN_400, size=32),
                ft.Text(side, size=15, weight=ft.FontWeight.W_700),
                ft.Text(filename, size=13, weight=ft.FontWeight.W_600),
                ft.Text(f"{len(text.split())} words", size=12, color=ft.colors.GREY_400),
            ],
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            alignment=ft.MainAxisAlignment.CENTER,
            spacing=6,
        )
        zone.border = _border(2, ft.colors.GREEN_700)
        zone.update()

    def _run_compare(self, e):
        if not self.cmp_left_text or not self.cmp_right_text:
            self._snack("Please load both files before comparing.", ft.colors.AMBER_800)
            return

        btn = self._cmp_compare_btn.current
        btn.disabled = True
        btn.text = "Comparing…"
        btn.update()

        results_col = self._cmp_results_col.current
        results_col.controls = [
            ft.Row([ft.ProgressRing(width=24, height=24), ft.Text("Running diff…", size=13)], spacing=8)
        ]
        results_col.update()

        def _worker():
            diff = diff_texts(self.cmp_left_text, self.cmp_right_text)
            self._render_diff_results(diff, results_col, btn)

        threading.Thread(target=_worker, daemon=True).start()

    def _render_diff_results(self, diff: DiffResult, results_col: ft.Column, btn: ft.ElevatedButton):
        # Build diff panels (condensed for readability)
        left_spans = condensed_spans(diff.left_spans)
        right_spans = condensed_spans(diff.right_spans)

        left_text = _spans_to_flet(left_spans)
        right_text = _spans_to_flet(right_spans)

        diff_panels = ft.Row(
            [
                ft.Container(
                    content=ft.Column(
                        [
                            ft.Text("Original", size=13, weight=ft.FontWeight.W_700, color=ft.colors.GREY_400),
                            ft.Divider(height=1),
                            ft.ListView([left_text], expand=True, auto_scroll=False),
                        ],
                        spacing=8,
                        expand=True,
                    ),
                    expand=True,
                    height=320,
                    bgcolor=ft.colors.with_opacity(0.03, "#ffffff"),
                    border=_border(1, ft.colors.OUTLINE_VARIANT),
                    border_radius=8,
                    padding=12,
                ),
                ft.VerticalDivider(width=6),
                ft.Container(
                    content=ft.Column(
                        [
                            ft.Text("New Version", size=13, weight=ft.FontWeight.W_700, color=ft.colors.GREY_400),
                            ft.Divider(height=1),
                            ft.ListView([right_text], expand=True, auto_scroll=False),
                        ],
                        spacing=8,
                        expand=True,
                    ),
                    expand=True,
                    height=320,
                    bgcolor=ft.colors.with_opacity(0.03, "#ffffff"),
                    border=_border(1, ft.colors.OUTLINE_VARIANT),
                    border_radius=8,
                    padding=12,
                ),
            ],
            expand=True,
        )

        legend = ft.Row(
            [
                ft.Container(content=ft.Text("Deleted", size=11, color=_C["delete"]), bgcolor=_C["delete_bg"], padding=ft.padding.symmetric(4, 8), border_radius=8),
                ft.Container(content=ft.Text("Inserted", size=11, color=_C["insert"]), bgcolor=_C["insert_bg"], padding=ft.padding.symmetric(4, 8), border_radius=8),
                ft.Container(content=ft.Text("Moved", size=11, color=_C["move_from"]), bgcolor=_C["move_from_bg"], padding=ft.padding.symmetric(4, 8), border_radius=8),
            ],
            spacing=8,
        )

        raw_summary = ft.Row(
            [
                _badge("Insertions", diff.counts["insert"], ft.colors.GREEN_800),
                _badge("Deletions", diff.counts["delete"], ft.colors.RED_800),
                _badge("Moved", diff.counts["move"], ft.colors.AMBER_800),
            ],
            spacing=8,
        )

        # Placeholder while AI runs
        ai_section = ft.Column(
            [
                ft.Text("AI Classification", size=16, weight=ft.FontWeight.W_700),
                ft.Row([ft.ProgressRing(width=20, height=20), ft.Text("Classifying changes…", size=13)], spacing=8),
            ],
            spacing=10,
        )

        results_col.controls = [
            ft.Text("Diff Results", size=18, weight=ft.FontWeight.W_700),
            legend,
            raw_summary,
            diff_panels,
            ft.Divider(),
            ai_section,
        ]
        btn.disabled = False
        btn.text = "Compare"
        btn.update()
        results_col.update()

        # Run AI in background
        if not self.classifier.ready:
            ai_section.controls = [
                ft.Text("AI Classification", size=16, weight=ft.FontWeight.W_700),
                ft.Text(
                    "Model not loaded yet." if self.classifier.loading else
                    f"Model unavailable: {self.classifier.error}",
                    size=13, color=ft.colors.AMBER_400,
                ),
            ]
            results_col.update()
            return

        changes_for_ai = [
            {
                "change_id": c.change_id,
                "diff_type": c.diff_type,
                "original_text": c.original_text,
                "new_text": c.new_text,
            }
            for c in diff.changes
        ]

        def _classify():
            classified = self.classifier.classify(changes_for_ai)
            self._render_classification(diff, classified, ai_section, results_col)

        threading.Thread(target=_classify, daemon=True).start()

    def _render_classification(
        self,
        diff: DiffResult,
        classified: list[dict],
        ai_section: ft.Column,
        results_col: ft.Column,
    ):
        # Build lookup: change_id -> classification
        cls_map = {item["change_id"]: item for item in classified}

        # Count by type
        type_counts: dict[str, int] = {"surface": 0, "developmental": 0, "structural": 0}
        for item in classified:
            t = item.get("type", "surface")
            type_counts[t] = type_counts.get(t, 0) + 1

        summary_row = ft.Row(
            [
                _badge("Surface",       type_counts["surface"],       ft.colors.BLUE_700),
                _badge("Developmental", type_counts["developmental"], ft.colors.GREEN_700),
                _badge("Structural",    type_counts["structural"],    ft.colors.ORANGE_700),
            ],
            spacing=8,
        )

        # Per-change table
        change_rows = []
        for change in diff.changes:
            cls_item = cls_map.get(change.change_id)
            if cls_item:
                t = cls_item["type"]
                color, label = _TYPE_COLOR.get(t, (ft.colors.GREY_700, t.capitalize()))
                reason = cls_item.get("reason", "")
            else:
                color, label, reason = ft.colors.GREY_700, "—", ""

            preview = (change.new_text or change.original_text)[:120].replace("\n", " ")

            change_rows.append(
                ft.Container(
                    content=ft.Row(
                        [
                            ft.Container(
                                content=ft.Text(label, size=11, color=ft.colors.WHITE),
                                bgcolor=color,
                                padding=ft.padding.symmetric(4, 8),
                                border_radius=10,
                                width=120,
                            ),
                            ft.Column(
                                [
                                    ft.Text(preview + ("…" if len(preview) == 120 else ""), size=12, expand=True),
                                    ft.Text(reason, size=11, color=ft.colors.GREY_500, italic=True) if reason else ft.Container(),
                                ],
                                spacing=2,
                                expand=True,
                                tight=True,
                            ),
                        ],
                        spacing=10,
                        vertical_alignment=ft.CrossAxisAlignment.START,
                    ),
                    border=_border(1, ft.colors.OUTLINE_VARIANT),
                    border_radius=6,
                    padding=8,
                )
            )

        if not change_rows:
            if classified:
                change_rows = [ft.Text("All changes were below the minimum word threshold.", size=13, color=ft.colors.GREY_500)]
            else:
                change_rows = [ft.Text("No significant changes to classify.", size=13, color=ft.colors.GREY_500)]

        ai_section.controls = [
            ft.Text("AI Classification", size=16, weight=ft.FontWeight.W_700),
            summary_row,
            ft.Text("Change Details", size=14, weight=ft.FontWeight.W_600),
            ft.Column(change_rows, spacing=6),
        ]

        # Save classification results to DB for the "new version" submission if available
        results_json = json.dumps({
            "summary": type_counts,
            "changes": [
                {
                    "change_id": c.change_id,
                    "diff_type": c.diff_type,
                    "original_text": c.original_text[:200],
                    "new_text": c.new_text[:200],
                    **cls_map.get(c.change_id, {}),
                }
                for c in diff.changes
            ],
        })

        results_col.update()

    # ── Coder View ─────────────────────────────────────────────────────────────
    # Queue processing uses a threading.Lock so only one background worker runs.
    # Jobs are persisted in the coder_jobs DB table so they survive restarts.

    def _show_coder(self):
        legend = ft.Row(
            [
                _code_badge("Surface (Sp, WW, Caps…)", "E67E22"),
                _code_badge("Grammar (Gra, VT, V…)",   "C0392B"),
                _code_badge("Format/Punct (P, FOR…)",  "2980B9"),
                _code_badge("Positive (Exp, ✓)",        "27AE60"),
            ],
            wrap=True, spacing=6,
        )

        queue_col = ft.Column(
            ref=self._coder_queue_col,
            spacing=8,
            expand=True,
            scroll=ft.ScrollMode.AUTO,
        )

        top_row = ft.Row(
            [
                ft.ElevatedButton(
                    "+ Upload Essays",
                    icon=ft.icons.UPLOAD_FILE_OUTLINED,
                    on_click=lambda e: self._coder_picker.pick_files(
                        allowed_extensions=["docx", "pdf"],
                        allow_multiple=True,
                        initial_directory=app_settings.get("last_upload_dir"),
                    ),
                ),
                ft.TextButton(
                    "🗑  Clear All Memory",
                    style=ft.ButtonStyle(color=ft.colors.RED_400),
                    on_click=self._dlg_clear_coder_memory,
                ),
            ],
            spacing=12,
        )

        self._set_content([
            ft.Container(
                content=ft.Column(
                    [
                        ft.Text("Literacy Code Annotator", size=20, weight=ft.FontWeight.W_700),
                        ft.Divider(height=1),
                        legend,
                        top_row,
                        queue_col,
                    ],
                    spacing=16,
                    expand=True,
                    scroll=ft.ScrollMode.AUTO,
                ),
                expand=True,
                padding=24,
            )
        ])

        self._populate_coder_queue()

    def _populate_coder_queue(self):
        col = self._coder_queue_col.current
        if col is None:
            return
        jobs = db.get_coder_jobs()
        col.controls = []
        if not jobs:
            col.controls = [
                ft.Text(
                    "No essays yet. Click '+ Upload Essays' to get started.",
                    color=ft.colors.GREY_500, italic=True,
                )
            ]
        else:
            for job in jobs:
                col.controls.append(self._coder_job_card(job))
        col.update()

    def _coder_job_card(self, job) -> ft.Control:
        status = job["status"]
        fname = job["original_filename"]

        if status == "queued":
            status_widget = ft.Row([
                ft.Icon(ft.icons.SCHEDULE, size=16, color=ft.colors.GREY_500),
                ft.Text("Waiting in queue…", color=ft.colors.GREY_500, size=13),
            ], spacing=6)
            right = status_widget

        elif status == "processing":
            prog_text = ft.Text("Starting…", size=13, color=ft.colors.BLUE_300,
                                ref=self._coder_progress_text)
            right = ft.Row([ft.ProgressRing(width=18, height=18), prog_text], spacing=8)

        elif status == "done":
            n = job["annotation_count"]
            dl = bool(job["downloaded"])
            dl_btn = ft.ElevatedButton(
                "Downloaded ✓" if dl else "Save As…",
                icon=ft.icons.DOWNLOAD_DONE if dl else ft.icons.SAVE_ALT,
                style=ft.ButtonStyle(
                    bgcolor=ft.colors.GREEN_800 if dl else None,
                    color=ft.colors.WHITE if dl else None,
                ),
                on_click=lambda e, jid=job["id"], op=job["output_path"], fn=fname:
                    self._save_coded_file(jid, op, fn),
            )
            right = ft.Row([
                ft.Text(f"✓  {n} annotations", color=ft.colors.GREEN_400, size=13),
                dl_btn,
            ], spacing=12)

        elif status == "error":
            right = ft.Row([
                ft.Icon(ft.icons.ERROR_OUTLINE, size=16, color=ft.colors.RED_400),
                ft.Text(job["error_msg"] or "Error", color=ft.colors.RED_400, size=13),
            ], spacing=6)

        else:
            right = ft.Text(status, size=13)

        return ft.Container(
            content=ft.Row(
                [
                    ft.Text(fname, size=13, weight=ft.FontWeight.W_600, expand=True),
                    right,
                ],
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            border=_border(1, ft.colors.OUTLINE_VARIANT),
            border_radius=8,
            padding=ft.padding.symmetric(horizontal=14, vertical=10),
            bgcolor=ft.colors.SURFACE,
        )

    def _on_coder_file(self, e):
        if not e.files:
            return
        if not self.classifier.ready:
            self._snack("AI model not loaded yet — please wait.", ft.colors.AMBER_800)
            return
        # Remember this folder for next time (use first file's parent)
        app_settings.set("last_upload_dir", str(Path(e.files[0].path).parent))
        now = datetime.now().isoformat(timespec="seconds")
        for f in e.files:
            db.add_coder_job(f.name, f.path, now)
        self._populate_coder_queue()
        self._start_coder_queue()

    def _start_coder_queue(self):
        """Start the background queue worker if not already running."""
        with self._coder_lock:
            if self._coder_running:
                return
            self._coder_running = True
        threading.Thread(target=self._coder_queue_worker, daemon=True).start()

    def _coder_queue_worker(self):
        """Process queued jobs one by one until queue is empty."""
        try:
            while True:
                job = db.get_next_queued_job()
                if not job:
                    break
                self._process_coder_job(dict(job))
        finally:
            with self._coder_lock:
                self._coder_running = False

    def _process_coder_job(self, job: dict):
        jid = job["id"]
        db.set_coder_job_processing(jid)
        self._populate_coder_queue()

        try:
            source = Path(job["source_path"])

            def on_progress(done, total):
                col = self._coder_queue_col.current
                if col is None:
                    return
                # Find the progress text in the card and update it
                label = f"Para {done + 1}/{total}…" if total else "Processing…"
                for card in col.controls:
                    if not isinstance(card, ft.Container):
                        continue
                    row = card.content
                    if not isinstance(row, ft.Row):
                        continue
                    name_ctrl = row.controls[0] if row.controls else None
                    if name_ctrl and hasattr(name_ctrl, 'value') and name_ctrl.value == job["original_filename"]:
                        right = row.controls[1] if len(row.controls) > 1 else None
                        if right and isinstance(right, ft.Row):
                            for c in right.controls:
                                if isinstance(c, ft.Text) and c != name_ctrl:
                                    c.value = label
                                    try:
                                        c.update()
                                    except Exception:
                                        pass
                        break

            out_path, ann_count = coder_engine.annotate_docx(
                source,
                self.classifier._model,
                self.classifier._tokenizer,
                on_progress=on_progress,
            )
            db.set_coder_job_done(jid, str(out_path), ann_count)

        except Exception as exc:
            import traceback
            traceback.print_exc()   # prints full stack trace to Terminal
            db.set_coder_job_error(jid, str(exc))

        self._populate_coder_queue()

    def _save_coded_file(self, job_id: int, output_path: str, original_filename: str):
        """Open the native Save As dialog to copy the coded file."""
        self._pending_save_job_id = job_id
        self._pending_save_source = output_path
        stem = Path(original_filename).stem
        if stem.endswith(" coded"):
            stem = stem[:-6]
        save_name = f"{stem} coded.docx"
        self._coder_save_picker.save_file(
            file_name=save_name,
            allowed_extensions=["docx"],
            initial_directory=app_settings.get("last_save_dir"),
        )

    def _on_coder_save(self, e):
        if not e.path:
            return
        import shutil
        try:
            shutil.copy2(self._pending_save_source, e.path)
            # Remember this save folder for next time
            app_settings.set("last_save_dir", str(Path(e.path).parent))
            db.mark_coder_downloaded(self._pending_save_job_id)
            self._populate_coder_queue()
            self._snack("Saved successfully.", ft.colors.GREEN_800)
        except Exception as exc:
            self._snack(f"Save failed: {exc}", ft.colors.RED_800)

    def _dlg_clear_coder_memory(self, e):
        jobs = db.get_coder_jobs()
        n = len(jobs)
        if n == 0:
            self._snack("Nothing to clear.", ft.colors.BLUE_800)
            return

        def confirm(ev):
            paths = db.delete_all_coder_jobs()
            for p in paths:
                try:
                    Path(p).unlink(missing_ok=True)
                except Exception:
                    pass
            self._close_dialog()
            self._populate_coder_queue()
            self._snack(f"Cleared {n} job(s).", ft.colors.GREEN_800)

        self._show_dialog(ft.AlertDialog(
            title=ft.Text("Clear All Memory"),
            content=ft.Text(
                f"Delete all {n} coded document(s) from memory and disk? This cannot be undone."
            ),
            actions=[
                ft.TextButton("Cancel", on_click=self._close_dialog),
                ft.ElevatedButton(
                    "Clear All", on_click=confirm,
                    style=ft.ButtonStyle(bgcolor=ft.colors.RED_700),
                ),
            ],
        ))

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _snack(self, message: str, color: str = ft.colors.BLUE_800):
        self.page.snack_bar = ft.SnackBar(
            content=ft.Text(message),
            bgcolor=color,
            open=True,
        )
        self.page.update()


# ── Entry point ────────────────────────────────────────────────────────────────

def main(page: ft.Page):
    app = WritingAnalyzerApp(page)
    app.setup()


if __name__ == "__main__":
    ft.app(target=main)
