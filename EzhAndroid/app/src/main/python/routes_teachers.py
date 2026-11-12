"""Маршруты преподавателей"""
from flask import Blueprint, jsonify, request

from app_data import _s, get_db, limiter, teacher_planner

bp = Blueprint("teachers", __name__)


@bp.route("/api/teachers")
@limiter.limit("60 per minute")
def get_teachers():
    try:
        items = teacher_planner.get_teachers(force=request.args.get('force') == '1')
    except Exception:
        items = []
    resp = jsonify(items)
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    return resp

@bp.route("/api/teacher_schedule")
@limiter.limit("60 per minute")
def get_teacher_schedule():
    slug = _s(request.args.get('slug'))
    if not slug:
        return jsonify([])
    try:
        return jsonify(teacher_planner.get_teacher_schedule(
            slug, force=request.args.get('force') == '1'))
    except Exception:
        return jsonify([])

@bp.route("/api/tracked_teachers", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_tracked_teachers():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        name = _s(data.get('name'))
        slug = _s(data.get('slug')).lower()
        if not name or not slug:
            return jsonify({"error": "invalid data"}), 400
        if len(name) > 200 or len(slug) > 100:
            return jsonify({"error": "field too long"}), 400

        cur = conn.execute(
            "INSERT OR IGNORE INTO tracked_teachers (name, slug) VALUES (?, ?)",
            (name, slug))
        conn.commit()

        row = conn.execute(
            "SELECT id, name, slug FROM tracked_teachers WHERE slug=?",
            (slug,)).fetchone()
        if not row:
            return jsonify({"error": "insert failed"}), 500

        return jsonify({
            "id": row["id"],
            "name": row["name"],
            "slug": row["slug"],
            "already": cur.rowcount == 0,
        })
    return jsonify([{"id": r["id"], "name": r["name"], "slug": r["slug"]}
                    for r in conn.execute(
                        "SELECT id, name, slug FROM tracked_teachers ORDER BY id").fetchall()])

@bp.route("/api/tracked_teachers/<int:item_id>", methods=["DELETE"])
@limiter.limit("120 per minute")
def delete_tracked_teacher(item_id):
    conn = get_db()
    conn.execute("DELETE FROM tracked_teachers WHERE id=?", (item_id,))
    conn.commit()
    return jsonify({"success": True})

