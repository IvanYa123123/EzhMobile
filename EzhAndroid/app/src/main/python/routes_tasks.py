"""Маршруты заметок и экспорта .ics"""
from flask import Blueprint, Response, jsonify, request

from app_data import _generate_tasks_ics, _s, _validate_base_date, get_db, limiter

bp = Blueprint("tasks", __name__)


@bp.route("/api/tasks", methods=["GET", "POST"])
@limiter.limit("300 per minute")
def manage_tasks():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        date = _validate_base_date(data.get('date'))
        text = _s(data.get('text'))
        status = _s(data.get('status'), 'green') or 'green'
        if date is None:
            return jsonify({"error": "invalid date"}), 400
        if not text:
            return jsonify({"error": "required"}), 400
        if len(text) > 2000:
            return jsonify({"error": "text too long"}), 400
        if status not in ('green', 'orange', 'red', 'completed'):
            status = 'green'
        cursor = conn.execute("INSERT INTO tasks (date, text, status) VALUES (?, ?, ?)",
                              (date, text, status))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    start, end = request.args.get('start'), request.args.get('end')
    if not start or not end:
        return jsonify([])
    cursor = conn.execute("SELECT id, date, text, status FROM tasks WHERE date BETWEEN ? AND ?",
                          (start, end))
    return jsonify([{"id": r["id"], "date": r["date"], "text": r["text"], "status": r["status"]}
                    for r in cursor.fetchall()])

@bp.route("/api/tasks/<int:task_id>", methods=["PUT", "DELETE"])
@limiter.limit("300 per minute")
def update_task(task_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        date = _validate_base_date(data.get('date'))
        text = _s(data.get('text'))
        status = _s(data.get('status'), 'green') or 'green'
        if date is None:
            return jsonify({"error": "invalid date"}), 400
        if not text:
            return jsonify({"error": "required"}), 400
        if len(text) > 2000:
            return jsonify({"error": "text too long"}), 400
        if status not in ('green', 'orange', 'red', 'completed'):
            status = 'green'
        conn.execute("UPDATE tasks SET date=?, status=?, text=? WHERE id=?",
                     (date, status, text, task_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    conn.commit()
    return jsonify({"success": True})

@bp.route("/api/task_dates")
@limiter.limit("120 per minute")
def task_dates():
    return jsonify([r["date"] for r in get_db().execute(
        "SELECT DISTINCT date FROM tasks ORDER BY date").fetchall()])

@bp.route("/api/tasks.ics")
@limiter.limit("30 per minute")
def export_tasks_ics():
    rows = get_db().execute(
        "SELECT date, text, status FROM tasks ORDER BY date, id").fetchall()
    tasks = [{"date": r["date"], "text": r["text"], "status": r["status"]} for r in rows]
    if not tasks:
        return Response("Заметок пока нет — сначала добавьте хотя бы одну.",
                        status=409, mimetype='text/plain; charset=utf-8')
    body = _generate_tasks_ics(tasks)
    return Response(
        body,
        content_type='text/calendar; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename="ezh_notes.ics"',
                 'Cache-Control': 'no-store'},
    )

