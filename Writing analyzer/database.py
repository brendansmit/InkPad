"""
SQLite database layer.

Schema:
  classes     – course sections (EAP 1, EAP 2, EAP 3, AP Lang)
  students    – belong to a class; name defaults to "Student N" until renamed
                voice_profile (BLOB) is NULL in v1; v2 will store a serialised
                embedding computed from baseline-tagged submissions only
  assignments – named tasks; class_id is optional (NULL = shared across classes)
  submissions – one uploaded file per student per assignment
                type_tag: 'baseline' = trusted in-class work | 'regular'
                classification_results: JSON produced by classifier.py (see that
                module for the exact structure); NULL until a comparison is run
"""

import sqlite3
from pathlib import Path

DB_DIR = Path.home() / ".writing_analyzer"
DB_PATH = DB_DIR / "db.sqlite3"

# ── Schema ─────────────────────────────────────────────────────────────────────
CREATE_SQL = """
CREATE TABLE IF NOT EXISTS classes (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS students (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id      INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    slot_number   INTEGER NOT NULL,
    voice_profile BLOB    DEFAULT NULL,   -- v2: embedding from baseline submissions
    UNIQUE(class_id, slot_number)
);

CREATE TABLE IF NOT EXISTS assignments (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    UNIQUE(name, class_id)
);

CREATE TABLE IF NOT EXISTS submissions (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id             INTEGER NOT NULL REFERENCES students(id)    ON DELETE CASCADE,
    assignment_id          INTEGER          REFERENCES assignments(id) ON DELETE SET NULL,
    filename               TEXT    NOT NULL,
    text                   TEXT    NOT NULL,
    upload_date            TEXT    NOT NULL,  -- ISO-8601 datetime
    type_tag               TEXT    NOT NULL   CHECK(type_tag IN ('baseline','regular')),
    classification_results TEXT    DEFAULT NULL  -- JSON; see classifier.py
);
"""
# ──────────────────────────────────────────────────────────────────────────────

INITIAL_CLASSES = [
    ("EAP 1",    9),
    ("EAP 2",   11),
    ("EAP 3",   22),
    ("AP Lang",  8),
]

INITIAL_ASSIGNMENTS = [
    "Essay 1", "Essay 2", "Essay 3",
    "In-Class Writing", "Personal Narrative",
    "Argumentative Essay", "Research Paper", "Final Draft",
]

_conn: sqlite3.Connection | None = None


def get_db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        DB_DIR.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _conn.executescript(CREATE_SQL)
        _conn.commit()
        if _conn.execute("SELECT COUNT(*) FROM classes").fetchone()[0] == 0:
            _seed(_conn)
        _migrate(_conn)
    return _conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Non-destructive additions for DBs created before this version."""
    try:
        conn.execute("ALTER TABLE submissions ADD COLUMN text_path TEXT DEFAULT NULL")
        conn.commit()
    except Exception:
        pass  # column already exists

    # Coder jobs table (added in v1.2)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS coder_jobs (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            original_filename TEXT    NOT NULL,
            source_path       TEXT,
            output_path       TEXT,
            created_at        TEXT    NOT NULL,
            status            TEXT    NOT NULL DEFAULT 'queued',
            annotation_count  INTEGER DEFAULT 0,
            downloaded        INTEGER DEFAULT 0,
            error_msg         TEXT
        );
    """)
    conn.commit()


def _seed(conn: sqlite3.Connection) -> None:
    for cls_name, n_students in INITIAL_CLASSES:
        cur = conn.execute("INSERT INTO classes (name) VALUES (?)", (cls_name,))
        cid = cur.lastrowid
        for i in range(1, n_students + 1):
            conn.execute(
                "INSERT INTO students (class_id, name, slot_number) VALUES (?,?,?)",
                (cid, f"Student {i}", i),
            )
    for aname in INITIAL_ASSIGNMENTS:
        conn.execute(
            "INSERT OR IGNORE INTO assignments (name, class_id) VALUES (?, NULL)",
            (aname,),
        )
    conn.commit()


# ── Classes ────────────────────────────────────────────────────────────────────

def get_classes() -> list:
    return get_db().execute("SELECT * FROM classes ORDER BY id").fetchall()


def add_class(name: str) -> int:
    db = get_db()
    cur = db.execute("INSERT INTO classes (name) VALUES (?)", (name,))
    db.commit()
    return cur.lastrowid


def rename_class(class_id: int, name: str) -> None:
    db = get_db()
    db.execute("UPDATE classes SET name=? WHERE id=?", (name, class_id))
    db.commit()


def delete_class(class_id: int) -> None:
    db = get_db()
    db.execute("DELETE FROM classes WHERE id=?", (class_id,))
    db.commit()


# ── Students ───────────────────────────────────────────────────────────────────

def add_student(class_id: int, name: str) -> int:
    db = get_db()
    row = db.execute(
        "SELECT COALESCE(MAX(slot_number), 0) + 1 FROM students WHERE class_id=?",
        (class_id,),
    ).fetchone()
    next_slot = row[0]
    cur = db.execute(
        "INSERT INTO students (class_id, name, slot_number) VALUES (?,?,?)",
        (class_id, name, next_slot),
    )
    db.commit()
    return cur.lastrowid


def delete_student(student_id: int) -> None:
    db = get_db()
    db.execute("DELETE FROM students WHERE id=?", (student_id,))
    db.commit()


def move_student(student_id: int, new_class_id: int) -> None:
    db = get_db()
    row = db.execute(
        "SELECT COALESCE(MAX(slot_number), 0) + 1 FROM students WHERE class_id=?",
        (new_class_id,),
    ).fetchone()
    next_slot = row[0]
    db.execute(
        "UPDATE students SET class_id=?, slot_number=? WHERE id=?",
        (new_class_id, next_slot, student_id),
    )
    db.commit()


def get_students(class_id: int) -> list:
    return get_db().execute(
        "SELECT * FROM students WHERE class_id=? ORDER BY slot_number", (class_id,)
    ).fetchall()


def rename_student(student_id: int, name: str) -> None:
    db = get_db()
    db.execute("UPDATE students SET name=? WHERE id=?", (name, student_id))
    db.commit()


def get_student(student_id: int):
    return get_db().execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()


# ── Assignments ────────────────────────────────────────────────────────────────

def get_assignments() -> list:
    return get_db().execute(
        "SELECT * FROM assignments ORDER BY class_id NULLS FIRST, name"
    ).fetchall()


def add_assignment(name: str, class_id: int | None = None) -> int:
    db = get_db()
    cur = db.execute(
        "INSERT OR IGNORE INTO assignments (name, class_id) VALUES (?,?)", (name, class_id)
    )
    db.commit()
    if cur.lastrowid:
        return cur.lastrowid
    return db.execute(
        "SELECT id FROM assignments WHERE name=? AND class_id IS ?", (name, class_id)
    ).fetchone()["id"]


# ── Submissions ────────────────────────────────────────────────────────────────

def add_submission(
    student_id: int,
    assignment_id: int | None,
    filename: str,
    text: str,
    upload_date: str,
    type_tag: str,
    classification_results: str | None = None,
    text_path: str | None = None,
) -> int:
    db = get_db()
    cur = db.execute(
        """INSERT INTO submissions
           (student_id,assignment_id,filename,text,upload_date,type_tag,classification_results,text_path)
           VALUES (?,?,?,?,?,?,?,?)""",
        (student_id, assignment_id, filename, text, upload_date, type_tag, classification_results, text_path),
    )
    db.commit()
    return cur.lastrowid


def get_submissions_for_student(student_id: int) -> list:
    return get_db().execute(
        """SELECT s.*, a.name as assignment_name
           FROM submissions s
           LEFT JOIN assignments a ON s.assignment_id = a.id
           WHERE s.student_id=?
           ORDER BY s.upload_date DESC""",
        (student_id,),
    ).fetchall()


def update_classification(submission_id: int, results_json: str) -> None:
    db = get_db()
    db.execute(
        "UPDATE submissions SET classification_results=? WHERE id=?",
        (results_json, submission_id),
    )
    db.commit()


def get_submission(submission_id: int):
    return get_db().execute(
        """SELECT s.*, a.name as assignment_name, st.name as student_name
           FROM submissions s
           LEFT JOIN assignments a ON s.assignment_id=a.id
           LEFT JOIN students st ON s.student_id=st.id
           WHERE s.id=?""",
        (submission_id,),
    ).fetchone()


def get_submissions_for_assignment(assignment_id: int) -> list:
    """All submissions for one assignment, with student and class names."""
    return get_db().execute(
        """SELECT s.*, a.name as assignment_name,
                  st.name as student_name, c.name as class_name
           FROM submissions s
           LEFT JOIN assignments a ON s.assignment_id = a.id
           JOIN students st ON s.student_id = st.id
           JOIN classes c ON st.class_id = c.id
           WHERE s.assignment_id = ?
           ORDER BY c.name, st.name, s.upload_date DESC""",
        (assignment_id,),
    ).fetchall()


def get_class(class_id: int):
    return get_db().execute("SELECT * FROM classes WHERE id=?", (class_id,)).fetchone()


def get_assignment(assignment_id: int):
    return get_db().execute("SELECT * FROM assignments WHERE id=?", (assignment_id,)).fetchone()


# ── Coder jobs ─────────────────────────────────────────────────────────────────

def add_coder_job(original_filename: str, source_path: str, created_at: str) -> int:
    db = get_db()
    cur = db.execute(
        "INSERT INTO coder_jobs (original_filename, source_path, created_at, status) VALUES (?,?,?,'queued')",
        (original_filename, source_path, created_at),
    )
    db.commit()
    return cur.lastrowid


def get_coder_jobs() -> list:
    return get_db().execute(
        "SELECT * FROM coder_jobs ORDER BY created_at DESC"
    ).fetchall()


def get_next_queued_job():
    return get_db().execute(
        "SELECT * FROM coder_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1"
    ).fetchone()


def set_coder_job_processing(job_id: int) -> None:
    db = get_db()
    db.execute("UPDATE coder_jobs SET status='processing' WHERE id=?", (job_id,))
    db.commit()


def set_coder_job_done(job_id: int, output_path: str, annotation_count: int) -> None:
    db = get_db()
    db.execute(
        "UPDATE coder_jobs SET status='done', output_path=?, annotation_count=? WHERE id=?",
        (output_path, annotation_count, job_id),
    )
    db.commit()


def set_coder_job_error(job_id: int, error_msg: str) -> None:
    db = get_db()
    db.execute(
        "UPDATE coder_jobs SET status='error', error_msg=? WHERE id=?",
        (error_msg, job_id),
    )
    db.commit()


def mark_coder_downloaded(job_id: int) -> None:
    db = get_db()
    db.execute("UPDATE coder_jobs SET downloaded=1 WHERE id=?", (job_id,))
    db.commit()


def delete_all_coder_jobs() -> list[str]:
    """Delete all coder jobs; return list of output_paths to also delete from disk."""
    db = get_db()
    rows = db.execute("SELECT output_path FROM coder_jobs WHERE output_path IS NOT NULL").fetchall()
    paths = [r["output_path"] for r in rows if r["output_path"]]
    db.execute("DELETE FROM coder_jobs")
    db.commit()
    return paths


def rename_assignment(assignment_id: int, name: str) -> None:
    db = get_db()
    db.execute("UPDATE assignments SET name=? WHERE id=?", (name, assignment_id))
    db.commit()


def delete_assignment(assignment_id: int) -> None:
    db = get_db()
    db.execute("DELETE FROM assignments WHERE id=?", (assignment_id,))
    db.commit()
