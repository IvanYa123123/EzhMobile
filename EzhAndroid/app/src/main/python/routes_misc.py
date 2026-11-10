"""Маршруты поиска, друзей, предметов и кастомного расписания (п.4 §11)."""
from flask import Blueprint, jsonify, request

from app_data import (
    _LINK_RE, _s, _to_int, _validate_base_date, _validate_time_range,
    get_db, limiter, validate_group, validate_subgroup,
)

bp = Blueprint("misc", __name__)


@bp.route("/api/search")
@limiter.limit("240 per minute")
def search():
    q = _s(request.args.get('q'))
    if len(q) < 2:
        return jsonify({"tasks": [], "events": [], "count": 0})
    if len(q) > 100:
        q = q[:100]
    conn = get_db()
    like = f"%{q}%"
    tasks = [dict(r) for r in conn.execute(
        "SELECT id, date, text, status FROM tasks WHERE text LIKE ? ORDER BY date DESC LIMIT 50",
        (like,)).fetchall()]
    events = [dict(r) for r in conn.execute(
        "SELECT id, base_date, time_range, lesson, type_name, teacher, location, "
        "is_event, recurrence FROM custom_schedule WHERE lesson LIKE ? "
        "ORDER BY base_date DESC LIMIT 50", (like,)).fetchall()]
    return jsonify({"tasks": tasks, "events": events, "count": len(tasks) + len(events)})

@bp.route("/api/friends", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_friends():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        name = _s(data.get('name'))
        group_raw = _s(data.get('group'))
        subgroup = validate_subgroup(data.get('subgroup', '0'))
        category = _s(data.get('category'))
        if not name or not group_raw:
            return jsonify({"error": "name and group required"}), 400
        if len(name) > 100 or len(category) > 100:
            return jsonify({"error": "field too long"}), 400
        try:
            group = validate_group(group_raw)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        cursor = conn.execute(
            "INSERT INTO friends (name, group_name, subgroup, category) VALUES (?, ?, ?, ?)",
            (name, group, subgroup, category))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    return jsonify([{
        "id": r["id"], "name": r["name"], "group": r["group_name"],
        "subgroup": r["subgroup"], "category": r["category"] or "",
    } for r in conn.execute("SELECT * FROM friends").fetchall()])

@bp.route("/api/friends/<int:friend_id>", methods=["PUT", "DELETE"])
@limiter.limit("120 per minute")
def update_or_delete_friend(friend_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        name = _s(data.get('name'))
        group_raw = _s(data.get('group'))
        subgroup = validate_subgroup(data.get('subgroup', '0'))
        category = _s(data.get('category'))
        if not name or not group_raw:
            return jsonify({"error": "name and group required"}), 400
        if len(name) > 100 or len(category) > 100:
            return jsonify({"error": "field too long"}), 400
        try:
            group = validate_group(group_raw)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        conn.execute(
            "UPDATE friends SET name=?, group_name=?, subgroup=?, category=? WHERE id=?",
            (name, group, subgroup, category, friend_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM friends WHERE id=?", (friend_id,))
    conn.commit()
    return jsonify({"success": True})

@bp.route("/api/subjects", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_subjects():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        subject = _s(data.get('subject'))
        if not subject:
            return jsonify({"error": "subject required"}), 400
        if len(subject) > 200:
            return jsonify({"error": "subject too long"}), 400
        link = _s(data.get('link'))
        if link and not _LINK_RE.match(link):
            link = ''
        conn.execute(
            "INSERT OR REPLACE INTO subject_settings (subject, custom_name, link, teacher, location) "
            "VALUES (?, ?, ?, ?, ?)",
            (subject, _s(data.get('custom_name')), link,
             _s(data.get('teacher')), _s(data.get('location'))))
        conn.commit()
        return jsonify({"success": True})
    resp = jsonify({
        r["subject"]: {
            "custom_name": r["custom_name"], "link": r["link"],
            "teacher": r["teacher"], "location": r["location"],
        } for r in conn.execute("SELECT * FROM subject_settings").fetchall()
    })
    resp.headers['Cache-Control'] = 'private, max-age=300'
    return resp

@bp.route("/api/custom_schedule", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_custom_schedule():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        group_raw = _s(data.get('group'))
        lesson = _s(data.get('lesson'))
        if not group_raw or not lesson:
            return jsonify({"error": "required"}), 400
        if len(lesson) > 200:
            return jsonify({"error": "lesson too long"}), 400
        try:
            group = validate_group(group_raw)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        base_date = _validate_base_date(data.get('base_date'))
        if not base_date:
            return jsonify({"error": "invalid base_date"}), 400
        time_range = _validate_time_range(data.get('time_range'))
        if not time_range:
            return jsonify({"error": "invalid time_range"}), 400

        cursor = conn.execute(
            "INSERT INTO custom_schedule (group_name, base_date, time_range, lesson, "
            "type_name, teacher, location, is_event, recurrence, exceptions) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (group, base_date, time_range, lesson,
             _s(data.get('type_name')), _s(data.get('teacher')),
             _s(data.get('location')), _to_int(data.get('is_event', 0)),
             _s(data.get('recurrence')) or 'none',
             _s(data.get('exceptions')) or '[]'))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    group = _s(request.args.get('group'))
    if not group:
        return jsonify([])
    return jsonify([{
        "id": r["id"], "base_date": r["base_date"], "time_range": r["time_range"],
        "lesson": r["lesson"], "type_name": r["type_name"], "teacher": r["teacher"],
        "location": r["location"], "is_event": r["is_event"],
        "recurrence": r["recurrence"], "exceptions": r["exceptions"] or "[]",
    } for r in conn.execute("SELECT * FROM custom_schedule WHERE group_name=?",
                            (group,)).fetchall()])

@bp.route("/api/custom_schedule/<int:item_id>", methods=["PUT", "DELETE"])
@limiter.limit("120 per minute")
def update_custom_schedule(item_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        lesson = _s(data.get('lesson'))
        if not lesson:
            return jsonify({"error": "lesson required"}), 400
        if len(lesson) > 200:
            return jsonify({"error": "lesson too long"}), 400

        base_date = _validate_base_date(data.get('base_date'))
        if not base_date:
            return jsonify({"error": "invalid base_date"}), 400
        time_range = _validate_time_range(data.get('time_range'))
        if not time_range:
            return jsonify({"error": "invalid time_range"}), 400

        conn.execute(
            "UPDATE custom_schedule SET base_date=?, time_range=?, lesson=?, "
            "type_name=?, teacher=?, location=?, is_event=?, recurrence=?, exceptions=? "
            "WHERE id=?",
            (base_date, time_range, lesson,
             _s(data.get('type_name')), _s(data.get('teacher')),
             _s(data.get('location')), _to_int(data.get('is_event', 0)),
             _s(data.get('recurrence')) or 'none',
             _s(data.get('exceptions')) or '[]', item_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM custom_schedule WHERE id=?", (item_id,))
    conn.commit()
    return jsonify({"success": True})

