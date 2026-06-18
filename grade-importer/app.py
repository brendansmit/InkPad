import os
from flask import Flask, request, jsonify, send_file, render_template
import io

import database as db
import matcher
import csv_parser
import xls_writer

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB


@app.before_request
def setup():
    db.init_db()


# ── Roster ───────────────────────────────────────────────────────────────────

@app.route("/api/roster/upload", methods=["POST"])
def upload_roster():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file"}), 400
    data = f.read()
    try:
        students = xls_writer.parse_xls_roster(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    db.upsert_students(students)
    return jsonify({"count": len(students), "students": students})


@app.route("/api/roster", methods=["GET"])
def get_roster():
    return jsonify(db.get_all_students())


# ── Assignments ───────────────────────────────────────────────────────────────

@app.route("/api/assignments", methods=["GET"])
def list_assignments():
    return jsonify(db.get_all_assignments())


@app.route("/api/assignments", methods=["POST"])
def create_assignment():
    body = request.json or {}
    name = body.get("name", "").strip()
    max_score = body.get("max_score")
    if not name or max_score is None:
        return jsonify({"error": "name and max_score required"}), 400
    aid = db.create_assignment(name, float(max_score))
    return jsonify({"id": aid})


@app.route("/api/assignments/<int:aid>", methods=["GET"])
def get_assignment(aid):
    a = db.get_assignment(aid)
    if not a:
        return jsonify({"error": "Not found"}), 404
    scores = db.get_scores_for_assignment(aid)
    return jsonify({"assignment": a, "scores": scores})


# ── Template XLS ─────────────────────────────────────────────────────────────

@app.route("/api/assignments/<int:aid>/template", methods=["POST"])
def upload_template(aid):
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file"}), 400
    data = f.read()
    db.save_template(aid, f.filename, data)
    return jsonify({"ok": True})


# ── CSV Import ────────────────────────────────────────────────────────────────

@app.route("/api/assignments/<int:aid>/import-csv", methods=["POST"])
def import_csv(aid):
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file"}), 400

    students = db.get_all_students()
    if not students:
        return jsonify({"error": "No roster loaded yet"}), 400

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
            entry.get("completion_status", "On Time"),
        )
    return jsonify({"saved": len(entries)})


# ── Manual score entry ────────────────────────────────────────────────────────

@app.route("/api/assignments/<int:aid>/score", methods=["PUT"])
def update_single_score(aid):
    body = request.json or {}
    student_id = body.get("student_id")
    score = body.get("score")
    status = body.get("completion_status", "On Time")
    if not student_id:
        return jsonify({"error": "student_id required"}), 400
    db.upsert_score(aid, student_id, score, status)
    return jsonify({"ok": True})


# ── History ───────────────────────────────────────────────────────────────────

@app.route("/api/history", methods=["GET"])
def get_history():
    assignments, students, score_map = db.get_history_matrix()
    return jsonify({
        "assignments": assignments,
        "students": students,
        "scores": {f"{k[0]}_{k[1]}": v for k, v in score_map.items()},
    })


# ── Export ────────────────────────────────────────────────────────────────────

@app.route("/api/assignments/<int:aid>/export", methods=["GET"])
def export_xls(aid):
    a = db.get_assignment(aid)
    if not a:
        return jsonify({"error": "Assignment not found"}), 404

    tmpl = db.get_template(aid)
    if not tmpl:
        return jsonify({"error": "No XLS template uploaded for this assignment"}), 400

    scores = db.get_scores_for_assignment(aid)
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
