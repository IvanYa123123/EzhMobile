"""Маршруты: здоровье, главная страница, группы (п.4 §11)."""
from flask import Blueprint, jsonify, request, send_from_directory

from app_data import (
    APP_VERSION, GROUPS_FILE, STATIC_DIR, _s, _safe_print, limiter,
    load_custom_groups, planner, save_custom_groups, validate_group,
)

bp = Blueprint("groups", __name__)


@bp.route("/api/health")
def health():
    return jsonify({"ok": True, "version": APP_VERSION})

@bp.route("/")
def index():
    return send_from_directory(STATIC_DIR, 'index.html')

@bp.route("/api/groups")
@limiter.limit("60 per minute")
def get_groups():
    groups = []
    try:
        with open(GROUPS_FILE, 'r', encoding='utf-8') as f:
            groups = [line.strip() for line in f if line.strip()]
    except OSError as e:
        _safe_print(f"[groups] Ошибка чтения {GROUPS_FILE}: {e}")

    if not groups:
        try:
            params = {"v": "6.2", "section": "0"}
            r = planner.session.get(planner.groups_api, params=params, timeout=10)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list):
                    if data and isinstance(data[0], dict):
                        groups = [item.get('name') or item.get('title') or str(item) for item in data]
                    else:
                        groups = data
        except Exception as e:
            _safe_print(f"[groups] Failed to load groups from web: {e}")

    seen = set(groups)
    for name in load_custom_groups():
        if name not in seen:
            seen.add(name)
            groups.append(name)

    resp = jsonify(groups)
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    return resp

@bp.route("/api/groups/custom", methods=["POST"])
@limiter.limit("30 per minute")
def add_custom_group():
    data = request.get_json(silent=True) or {}
    name = _s(data.get('name'))
    if not name:
        return jsonify({"error": "empty"}), 400
    try:
        name = validate_group(name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    groups = load_custom_groups()
    if name in groups:
        return jsonify({"success": True, "already": True})
    groups.append(name)
    if not save_custom_groups(groups):
        return jsonify({"error": "save failed"}), 500
    return jsonify({"success": True})

