import os
from flask import Flask, request, jsonify, send_file, render_template
import io

import database as db
import matcher
import csv_parser
import xls_writer
from pypinyin import lazy_pinyin, Style

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB


@app.before_request
def setup():
    db.init_db()


# ── Roster ───────────────────────────────────────────────────────────────────

@app.route("/api/roster/upload", methods=["POST"])
def upload_roster():
    f = request.files.get("file")
    class_override = request.form.get("task_class", "").strip()
    if not f:
        return jsonify({"error": "No file"}), 400
    data = f.read()
    try:
        students = xls_writer.parse_xls_roster(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    if class_override:
        for s in students:
            s["task_class"] = class_override
    db.upsert_students(students)
    return jsonify({"count": len(students), "students": students})


@app.route("/api/roster", methods=["GET"])
def get_roster():
    task_class = request.args.get("class")
    if task_class:
        return jsonify(db.get_students_by_class(task_class))
    return jsonify(db.get_all_students())


@app.route("/api/roster/classes", methods=["GET"])
def get_classes():
    return jsonify(db.get_classes())


@app.route("/api/roster/student", methods=["POST"])
def add_student():
    body = request.json or {}
    english_name = body.get("english_name", "").strip()
    task_class = body.get("task_class", "").strip()
    if not english_name or not task_class:
        return jsonify({"error": "english_name and task_class required"}), 400
    prefix = "".join(c for c in task_class if c.isalpha())[:4].upper()
    suffix = "".join(c for c in english_name if c.isalpha()).upper()[:8]
    student_id = f"{prefix}-{suffix}"
    db.add_student(
        student_id=student_id,
        english_name=english_name,
        chinese_name=body.get("chinese_name", "").strip(),
        admin_class=body.get("admin_class", task_class).strip(),
        task_class=task_class,
    )
    return jsonify({"student_id": student_id})


@app.route("/api/roster/student/<student_id>", methods=["DELETE"])
def remove_student(student_id):
    db.remove_student(student_id)
    return jsonify({"ok": True})


# ── Settings ──────────────────────────────────────────────────────────────────

@app.route("/api/settings", methods=["GET"])
def get_settings():
    key = db.get_setting("deepseek_api_key", "")
    masked = ("*" * (len(key) - 4) + key[-4:]) if len(key) > 4 else ("*" * len(key))
    return jsonify({"deepseek_api_key_set": bool(key), "masked": masked})


@app.route("/api/settings", methods=["POST"])
def save_settings():
    body = request.json or {}
    key = body.get("deepseek_api_key", "").strip()
    if key:
        db.set_setting("deepseek_api_key", key)
    return jsonify({"ok": True})


# ── Assignments ───────────────────────────────────────────────────────────────

@app.route("/api/assignments", methods=["GET"])
def list_assignments():
    return jsonify(db.get_all_assignments())


@app.route("/api/assignments", methods=["POST"])
def create_assignment():
    body = request.json or {}
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    sections = body.get("sections", [])
    class_filter = body.get("class_filter", "All")
    aid = db.create_assignment(name, class_filter=class_filter, sections=sections)
    return jsonify({"id": aid})


@app.route("/api/assignments/<int:aid>", methods=["GET"])
def get_assignment(aid):
    a = db.get_assignment(aid)
    if not a:
        return jsonify({"error": "Not found"}), 404
    scores = db.get_scores_for_assignment(aid, a.get("class_filter"))
    return jsonify({"assignment": a, "scores": scores})


@app.route("/api/assignments/<int:aid>", methods=["DELETE"])
def delete_assignment(aid):
    db.delete_assignment(aid)
    return jsonify({"ok": True})


# ── Template XLS ─────────────────────────────────────────────────────────────

@app.route("/api/assignments/<int:aid>/template", methods=["POST"])
def upload_template(aid):
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file"}), 400
    db.save_template(aid, f.filename, f.read())
    return jsonify({"ok": True})


# ── CSV Import ────────────────────────────────────────────────────────────────

@app.route("/api/assignments/<int:aid>/import-csv", methods=["POST"])
def import_csv(aid):
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file"}), 400

    class_filter = request.form.get("class_filter", "").strip()
    if class_filter and class_filter != "All":
        if class_filter == "EAP":
            students = [s for s in db.get_all_students() if "EAP" in (s.get("task_class") or "")]
        else:
            students = [s for s in db.get_all_students() if class_filter in (s.get("task_class") or "")]
    else:
        students = db.get_all_students()

    if not students:
        return jsonify({"error": "No students found for the selected class"}), 400

    try:
        rows = csv_parser.parse_csv(f.read())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    result = matcher.match_csv_rows(rows, students)
    return jsonify(result)


@app.route("/api/assignments/<int:aid>/scores", methods=["POST"])
def save_scores(aid):
    body = request.json or {}
    entries = body.get("scores", [])
    for entry in entries:
        db.upsert_score(
            aid,
            entry["student_id"],
            entry.get("score"),
            entry.get("section_scores", {}),
        )
    return jsonify({"saved": len(entries)})


# ── History ───────────────────────────────────────────────────────────────────

@app.route("/api/history", methods=["GET"])
def get_history():
    assignments, students, score_map = db.get_history_matrix()
    return jsonify({
        "assignments": assignments,
        "students": students,
        "scores": {f"{k[0]}_{k[1]}": v for k, v in score_map.items()},
    })


# ── Template library ─────────────────────────────────────────────────────────

@app.route("/api/templates", methods=["GET"])
def list_templates():
    return jsonify(db.get_template_library())


@app.route("/api/templates", methods=["POST"])
def upload_library_template():
    f = request.files.get("file")
    name = request.form.get("name", "").strip()
    if not f:
        return jsonify({"error": "No file"}), 400
    if not name:
        name = f.filename
    tid = db.save_library_template(name, f.filename, f.read())
    return jsonify({"id": tid, "name": name})


@app.route("/api/templates/<int:tid>", methods=["DELETE"])
def delete_library_template(tid):
    db.delete_library_template(tid)
    return jsonify({"ok": True})


@app.route("/api/assignments/<int:aid>/library-template", methods=["POST"])
def set_library_template(aid):
    body = request.json or {}
    tid = body.get("template_id")
    db.set_assignment_library_template(aid, tid)
    return jsonify({"ok": True})


# ── Pinyin ────────────────────────────────────────────────────────────────────

@app.route("/api/roster/generate-pinyin", methods=["POST"])
def generate_pinyin():
    students = db.get_all_students()
    updated = 0
    for s in students:
        chinese = (s.get("chinese_name") or "").strip()
        if not chinese:
            continue
        pinyin = " ".join(lazy_pinyin(chinese, style=Style.TONE))
        db.update_student_pinyin(s["student_id"], pinyin)
        updated += 1
    return jsonify({"updated": updated})


# ── Export ────────────────────────────────────────────────────────────────────

@app.route("/api/assignments/<int:aid>/export", methods=["GET"])
def export_xls(aid):
    a = db.get_assignment(aid)
    if not a:
        return jsonify({"error": "Assignment not found"}), 404

    # Custom per-assignment template takes priority; fall back to library template
    tmpl = db.get_template(aid)
    if not tmpl and a.get("library_template_id"):
        tmpl = db.get_library_template(a["library_template_id"])
    if not tmpl:
        return jsonify({"error": "No XLS template set for this assignment. Upload one or select from the library."}), 400

    scores = db.get_scores_for_assignment(aid, a.get("class_filter"))
    filled = xls_writer.fill_xls(tmpl["data"], scores)

    safe_name = a["name"].replace(" ", "_").replace("/", "-")
    return send_file(
        io.BytesIO(filled),
        mimetype="application/vnd.ms-excel",
        as_attachment=True,
        download_name=f"{safe_name}_grades.xls",
    )


# ── UI ────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    db.init_db()
    app.run(debug=True, port=5050)
