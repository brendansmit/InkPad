import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "grades.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY,
                student_id TEXT UNIQUE NOT NULL,
                chinese_name TEXT NOT NULL,
                english_name TEXT NOT NULL,
                admin_class TEXT,
                task_class TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assignments (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                max_score REAL,
                class_filter TEXT,
                sections TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY,
                assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL REFERENCES students(student_id),
                score REAL,
                section_scores TEXT DEFAULT '{}',
                UNIQUE(assignment_id, student_id)
            );

            CREATE TABLE IF NOT EXISTS xls_templates (
                id INTEGER PRIMARY KEY,
                assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                data BLOB NOT NULL,
                uploaded_at TEXT DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS template_library (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                filename TEXT NOT NULL,
                data BLOB NOT NULL,
                uploaded_at TEXT DEFAULT (datetime('now','localtime'))
            );
        """)
        # Migrate existing DB: add new columns if missing
        for col, definition in [
            ("class_filter",       "TEXT"),
            ("sections",           "TEXT DEFAULT '[]'"),
            ("library_template_id","INTEGER"),
        ]:
            try:
                conn.execute(f"ALTER TABLE assignments ADD COLUMN {col} {definition}")
            except Exception:
                pass
        for col, definition in [
            ("section_scores", "TEXT DEFAULT '{}'"),
        ]:
            try:
                conn.execute(f"ALTER TABLE scores ADD COLUMN {col} {definition}")
            except Exception:
                pass
        for col, definition in [
            ("pinyin", "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE students ADD COLUMN {col} {definition}")
            except Exception:
                pass


def upsert_students(students):
    with get_conn() as conn:
        conn.executemany("""
            INSERT INTO students (student_id, chinese_name, english_name, admin_class, task_class)
            VALUES (:student_id, :chinese_name, :english_name, :admin_class, :task_class)
            ON CONFLICT(student_id) DO UPDATE SET
                chinese_name=excluded.chinese_name,
                english_name=excluded.english_name,
                admin_class=excluded.admin_class,
                task_class=excluded.task_class
        """, students)


def get_all_students():
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM students ORDER BY task_class, english_name"
        ).fetchall()]


def create_assignment(name, class_filter=None, sections=None):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO assignments (name, max_score, class_filter, sections) VALUES (?, ?, ?, ?)",
            (name, 0, class_filter, json.dumps(sections or []))
        )
        return cur.lastrowid


def delete_assignment(assignment_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM assignments WHERE id=?", (assignment_id,))


def get_assignment(assignment_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM assignments WHERE id=?", (assignment_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["sections"] = json.loads(d.get("sections") or "[]")
        return d


def get_all_assignments():
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM assignments ORDER BY created_at DESC"
        ).fetchall()]
        for r in rows:
            r["sections"] = json.loads(r.get("sections") or "[]")
        return rows


def upsert_score(assignment_id, student_id, score, section_scores=None):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO scores (assignment_id, student_id, score, section_scores)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(assignment_id, student_id) DO UPDATE SET
                score=excluded.score,
                section_scores=excluded.section_scores
        """, (assignment_id, student_id, score, json.dumps(section_scores or {})))


def get_scores_for_assignment(assignment_id, class_filter=None):
    with get_conn() as conn:
        if class_filter and class_filter != "All":
            # EAP matches all EAP sections, AP Lang matches AP Lang
            if class_filter == "EAP":
                rows = conn.execute("""
                    SELECT s.student_id, s.english_name, s.chinese_name, s.admin_class, s.task_class,
                           sc.score, sc.section_scores
                    FROM students s
                    LEFT JOIN scores sc ON sc.student_id = s.student_id AND sc.assignment_id = ?
                    WHERE s.task_class LIKE '%EAP%'
                    ORDER BY s.task_class, s.english_name
                """, (assignment_id,)).fetchall()
            else:
                rows = conn.execute("""
                    SELECT s.student_id, s.english_name, s.chinese_name, s.admin_class, s.task_class,
                           sc.score, sc.section_scores
                    FROM students s
                    LEFT JOIN scores sc ON sc.student_id = s.student_id AND sc.assignment_id = ?
                    WHERE s.task_class LIKE ?
                    ORDER BY s.task_class, s.english_name
                """, (assignment_id, f"%{class_filter}%")).fetchall()
        else:
            rows = conn.execute("""
                SELECT s.student_id, s.english_name, s.chinese_name, s.admin_class, s.task_class,
                       sc.score, sc.section_scores
                FROM students s
                LEFT JOIN scores sc ON sc.student_id = s.student_id AND sc.assignment_id = ?
                ORDER BY s.task_class, s.english_name
            """, (assignment_id,)).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            d["section_scores"] = json.loads(d.get("section_scores") or "{}")
            result.append(d)
        return result


def get_history_matrix():
    with get_conn() as conn:
        assignments = [dict(r) for r in conn.execute(
            "SELECT * FROM assignments ORDER BY created_at ASC"
        ).fetchall()]
        for a in assignments:
            a["sections"] = json.loads(a.get("sections") or "[]")
        students = [dict(r) for r in conn.execute(
            "SELECT * FROM students ORDER BY task_class, english_name"
        ).fetchall()]
        scores_raw = conn.execute("SELECT assignment_id, student_id, score FROM scores").fetchall()

    score_map = {}
    for row in scores_raw:
        score_map[(row["assignment_id"], row["student_id"])] = row["score"]

    return assignments, students, score_map


def save_template(assignment_id, filename, data):
    with get_conn() as conn:
        conn.execute("DELETE FROM xls_templates WHERE assignment_id=?", (assignment_id,))
        conn.execute(
            "INSERT INTO xls_templates (assignment_id, filename, data) VALUES (?,?,?)",
            (assignment_id, filename, data)
        )


def get_template(assignment_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT filename, data FROM xls_templates WHERE assignment_id=?",
            (assignment_id,)
        ).fetchone()
        return dict(row) if row else None


def get_setting(key, default=""):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value)
        )


def get_classes():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT task_class FROM students WHERE task_class IS NOT NULL AND task_class != '' ORDER BY task_class"
        ).fetchall()
        return [r["task_class"] for r in rows]


def add_student(student_id, english_name, chinese_name, admin_class, task_class):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO students (student_id, english_name, chinese_name, admin_class, task_class)
            VALUES (?,?,?,?,?)
            ON CONFLICT(student_id) DO UPDATE SET
                english_name=excluded.english_name,
                chinese_name=excluded.chinese_name,
                admin_class=excluded.admin_class,
                task_class=excluded.task_class
        """, (student_id, english_name, chinese_name, admin_class, task_class))


def remove_student(student_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM scores WHERE student_id=?", (student_id,))
        conn.execute("DELETE FROM students WHERE student_id=?", (student_id,))


def get_students_by_class(task_class):
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM students WHERE task_class=? ORDER BY english_name",
            (task_class,)
        ).fetchall()]


def update_student_pinyin(student_id, pinyin):
    with get_conn() as conn:
        conn.execute(
            "UPDATE students SET pinyin=? WHERE student_id=?",
            (pinyin, student_id)
        )


# ── Template library ──────────────────────────────────────────────────────────

def get_template_library():
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT id, name, filename, uploaded_at FROM template_library ORDER BY uploaded_at DESC"
        ).fetchall()]


def save_library_template(name, filename, data):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO template_library (name, filename, data) VALUES (?,?,?)",
            (name, filename, data)
        )
        return cur.lastrowid


def get_library_template(template_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT name, filename, data FROM template_library WHERE id=?",
            (template_id,)
        ).fetchone()
        return dict(row) if row else None


def delete_library_template(template_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM template_library WHERE id=?", (template_id,))


def set_assignment_library_template(assignment_id, library_template_id):
    with get_conn() as conn:
        conn.execute(
            "UPDATE assignments SET library_template_id=? WHERE id=?",
            (library_template_id, assignment_id)
        )
