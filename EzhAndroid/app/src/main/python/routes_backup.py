"""Маршрут резервной копии (п.4 §11)."""
import time

from flask import Blueprint, jsonify, request

from app_data import (
    APP_VERSION, _s, _safe_print, get_db, limiter,
    load_custom_groups, save_custom_groups, validate_group,
)

bp = Blueprint("backup", __name__)


_BACKUP_APP_ID = "EZHednevnik"

_BACKUP_TABLES = {
    'tasks': ('id', 'date', 'text', 'status'),
    'friends': ('id', 'name', 'group_name', 'subgroup'),
    'lab_progress': ('group_name', 'subject', 'completed', 'total'),
    'lab_items': ('id', 'group_name', 'subject', 'idx', 'title', 'completed'),
    'subject_settings': ('subject', 'custom_name', 'link', 'teacher', 'location'),
    'custom_schedule': ('id', 'group_name', 'base_date', 'time_range', 'lesson',
                        'type_name', 'teacher', 'location', 'is_event', 'recurrence', 'exceptions'),
    'tracked_teachers': ('id', 'name', 'slug'),
}

_BACKUP_INT_COLS = frozenset(('id', 'idx', 'completed', 'total', 'is_event'))
_BACKUP_MAX_ROWS = 20000
_BACKUP_MAX_TEXT = 4000

def _coerce_backup_value(column, value):
    if column in _BACKUP_INT_COLS:
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0
    if value is None:
        return ''
    return str(value)[:_BACKUP_MAX_TEXT]

@bp.route("/api/backup", methods=["GET", "POST"])
@limiter.limit("15 per minute")
def backup():
    conn = get_db()
    if request.method == "POST":
        return _restore_backup(conn)

    tables = {}
    for table, columns in _BACKUP_TABLES.items():
        cursor = conn.execute(f"SELECT {', '.join(columns)} FROM {table}")
        tables[table] = [dict(row) for row in cursor.fetchall()]

    return jsonify({
        "app": _BACKUP_APP_ID,
        "version": APP_VERSION,
        "format": 1,
        "exported_at": int(time.time()),
        "custom_groups": load_custom_groups(),
        "tables": tables,
    })

def _restore_backup(conn):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "error": "invalid json"}), 400

    tables = data.get('tables') if isinstance(data.get('tables'), dict) else data
    if not isinstance(tables, dict):
        return jsonify({"success": False, "error": "no tables in backup"}), 400

    restored = {}
    skipped_groups = 0
    cleaned_groups = None
    try:
        for table, columns in _BACKUP_TABLES.items():
            rows = tables.get(table)
            if rows is None:
                continue
            if not isinstance(rows, list):
                return jsonify({"success": False, "error": f"{table}: expected list"}), 400

            conn.execute(f"DELETE FROM {table}")
            placeholders = ', '.join('?' * len(columns))
            sql = (f"INSERT OR REPLACE INTO {table} "
                   f"({', '.join(columns)}) VALUES ({placeholders})")

            inserted = 0
            for row in rows[:_BACKUP_MAX_ROWS]:
                if not isinstance(row, dict):
                    continue
                values = [_coerce_backup_value(c, row.get(c)) for c in columns]
                conn.execute(sql, values)
                inserted += 1
            restored[table] = inserted

        groups = data.get('custom_groups')
        if isinstance(groups, list):
            cleaned_groups = []
            seen = set()
            for name in groups[:500]:
                try:
                    cleaned = validate_group(_s(name))
                except ValueError:
                    skipped_groups += 1
                    continue
                if cleaned in seen:
                    skipped_groups += 1
                    continue
                seen.add(cleaned)
                cleaned_groups.append(cleaned)

        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        _safe_print(f"[backup] restore failed: {e}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500

    if cleaned_groups is not None:
        if not save_custom_groups(cleaned_groups):
            _safe_print("[backup] restore: db ok, custom_groups save failed", flush=True)
            return jsonify({"success": False, "error": "custom_groups save failed",
                            "restored": restored}), 500
        restored['custom_groups'] = len(cleaned_groups)
        if skipped_groups:
            restored['custom_groups_skipped'] = skipped_groups

    _safe_print(f"[backup] restore ok: {restored}", flush=True)
    return jsonify({"success": True, "restored": restored})

