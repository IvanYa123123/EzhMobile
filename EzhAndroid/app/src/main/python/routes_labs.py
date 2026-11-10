"""Маршруты лабораторных (п.4 §11)."""
from flask import Blueprint, jsonify, request

from app_data import _s, get_db, limiter

bp = Blueprint("labs", __name__)


@bp.route("/api/labs", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_labs():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True)
        if data is None:
            data = []
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            group = _s(item.get('group'))
            subject = _s(item.get('subject'))
            if not group or not subject:
                continue
            try:
                comp = max(0, int(item.get('completed') or 0))
                tot = max(0, int(item.get('total') or 0))
            except (TypeError, ValueError):
                comp, tot = 0, 0
            if comp > tot:
                comp = tot
            conn.execute(
                "INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)",
                (group, subject, comp, tot))
        conn.commit()
        return jsonify({"success": True})
    group = _s(request.args.get('group'))
    if not group:
        return jsonify({})
    return jsonify({
        r["subject"]: {"completed": r["completed"], "total": r["total"]}
        for r in conn.execute("SELECT subject, completed, total FROM lab_progress WHERE group_name=?",
                              (group,)).fetchall()
    })

def _recalc_lab_progress(conn, group, subject):
    row = conn.execute(
        "SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done "
        "FROM lab_items WHERE group_name=? AND subject=?",
        (group, subject)).fetchone()
    total, done = row["total"] or 0, row["done"] or 0
    if total == 0:
        conn.execute("DELETE FROM lab_progress WHERE group_name=? AND subject=?", (group, subject))
    else:
        conn.execute(
            "INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)",
            (group, subject, done, total))

@bp.route("/api/lab_items", methods=["GET"])
@limiter.limit("240 per minute")
def get_lab_items():
    group = _s(request.args.get('group'))
    if not group:
        return jsonify({})
    grouped = {}
    for r in get_db().execute(
            "SELECT id, subject, idx, title, completed FROM lab_items "
            "WHERE group_name=? ORDER BY subject, idx", (group,)).fetchall():
        grouped.setdefault(r["subject"], []).append({
            "id": r["id"], "idx": r["idx"],
            "title": r["title"], "completed": int(r["completed"]),
        })
    return jsonify(grouped)

@bp.route("/api/lab_items/sync", methods=["POST"])
@limiter.limit("120 per minute")
def sync_lab_items():
    data = request.get_json(silent=True) or {}
    group = _s(data.get('group'))
    items = data.get('items')
    if not group or not isinstance(items, list):
        return jsonify({"error": "required"}), 400
    conn = get_db()
    touched = set()
    for spec in items:
        if not isinstance(spec, dict):
            continue
        subject = _s(spec.get('subject'))
        try:
            count = int(spec.get('count') or 0)
        except (TypeError, ValueError):
            count = 0
        if not subject or count <= 0 or count > 200:
            continue
        touched.add(subject)
        existing = {r["idx"] for r in conn.execute(
            "SELECT idx FROM lab_items WHERE group_name=? AND subject=?",
            (group, subject)).fetchall()}
        short = subject[subject.rfind('(')+1:subject.rfind(')')].strip() if '(' in subject else subject
        for i in range(1, count + 1):
            if i not in existing:
                conn.execute(
                    "INSERT OR IGNORE INTO lab_items (group_name, subject, idx, title, completed) "
                    "VALUES (?, ?, ?, ?, 0)",
                    (group, subject, i, f"{short}{i}"))
    for subj in touched:
        _recalc_lab_progress(conn, group, subj)
    conn.commit()
    return jsonify({"success": True})

@bp.route("/api/lab_items/add", methods=["POST"])
@limiter.limit("120 per minute")
def add_lab_item():
    data = request.get_json(silent=True) or {}
    group = _s(data.get('group'))
    subject = _s(data.get('subject'))
    if not group or not subject:
        return jsonify({"error": "required"}), 400
    conn = get_db()
    next_idx = (conn.execute(
        "SELECT COALESCE(MAX(idx), 0) FROM lab_items WHERE group_name=? AND subject=?",
        (group, subject)).fetchone()[0]) + 1
    short = subject[subject.rfind('(')+1:subject.rfind(')')].strip() if '(' in subject else subject
    conn.execute(
        "INSERT INTO lab_items (group_name, subject, idx, title, completed) VALUES (?, ?, ?, ?, 0)",
        (group, subject, next_idx, f"{short}{next_idx}"))
    _recalc_lab_progress(conn, group, subject)
    conn.commit()
    return jsonify({"success": True})

@bp.route("/api/lab_items/remove_last", methods=["POST"])
@limiter.limit("120 per minute")
def remove_last_lab_item():
    data = request.get_json(silent=True) or {}
    group = _s(data.get('group'))
    subject = _s(data.get('subject'))
    row = get_db().execute(
        "SELECT id FROM lab_items WHERE group_name=? AND subject=? ORDER BY idx DESC LIMIT 1",
        (group, subject)).fetchone()
    if not row:
        return jsonify({"success": False}), 404
    conn = get_db()
    conn.execute("DELETE FROM lab_items WHERE id=?", (row["id"],))
    _recalc_lab_progress(conn, group, subject)
    conn.commit()
    return jsonify({"success": True})

@bp.route("/api/lab_items/<int:item_id>", methods=["PUT", "DELETE"])
@limiter.limit("240 per minute")
def update_lab_item(item_id):
    conn = get_db()
    if request.method == "DELETE":
        row = conn.execute("SELECT group_name, subject FROM lab_items WHERE id=?",
                           (item_id,)).fetchone()
        if row:
            conn.execute("DELETE FROM lab_items WHERE id=?", (item_id,))
            _recalc_lab_progress(conn, row["group_name"], row["subject"])
            conn.commit()
        return jsonify({"success": True})
    data = request.get_json(silent=True) or {}
    row = conn.execute("SELECT group_name, subject, title, completed FROM lab_items WHERE id=?",
                       (item_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404

    raw_title = data.get('title')
    if raw_title is None:
        new_title = row["title"]
    else:
        new_title = str(raw_title).strip()[:200] or row["title"]

    try:
        new_comp = 1 if int(data.get('completed', row["completed"])) else 0
    except (TypeError, ValueError):
        new_comp = 0
    conn.execute("UPDATE lab_items SET title=?, completed=? WHERE id=?",
                 (new_title, new_comp, item_id))
    _recalc_lab_progress(conn, row["group_name"], row["subject"])
    conn.commit()
    return jsonify({"success": True, "title": new_title, "completed": new_comp})

