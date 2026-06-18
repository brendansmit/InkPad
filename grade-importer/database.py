import sqlite3
import os

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

            CREATE TABLE IF NOT EXISTS assignments (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                max_score REAL NOT NULL,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY,
                assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL REFERENCES students(student_id),
                score REAL,
                completion_status TEXT DEFAULT 'On Time',
                UNIQUE(assignment_id, student_id)
            );

            CREATE TABLE IF NOT EXISTS xls_templates (
                id INTEGER PRIMARY KEY,
                assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                data BLOB NOT NULL,
                uploaded_at TEXT DEFAULT (datetime('now','localtime'))
            );
        """)


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


def create_assignment(name, max_score):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO assignments (name, max_score) VALUES (?, ?)", (name, max_score)
        )
        return cur.lastrowid


def get_assignment(assignment_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM assignments WHERE id=?", (assignment_id,)).fetchone()
        return dict(row) if row else None


def get_all_assignments():
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM assignments ORDER BY created_at DESC"
        ).fetchall()]


def upsert_score(assignment_id, student_id, score, completion_status="On Time"):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO scores (assignment_id, student_id, score, completion_status)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(assignment_id, student_id) DO UPDATE SET
                score=excluded.score,
                completion_status=excluded.completion_status
        """, (assignment_id, student_id, score, completion_status))


def get_scores_for_assignment(assignment_id):
    with get_conn() as conn:
        return [dict(r) for r in conn.execute("""
            SELECT s.student_id, s.english_name, s.chinese_name, s.admin_class, s.task_class,
                   sc.score, sc.completion_status
            FROM students s
            LEFT JOIN scores sc ON sc.student_id = s.student_id AND sc.assignment_id = ?
            ORDER BY s.task_class, s.english_name
        """, (assignment_id,)).fetchall()]


def get_history_matrix():
    with get_conn() as conn:
        assignments = [dict(r) for r in conn.execute(
            "SELECT * FROM assignments ORDER BY created_at ASC"
        ).fetchall()]
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
        conn.execute(
            "DELETE FROM xls_templates WHERE assignment_id=?", (assignment_id,)
        )
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
