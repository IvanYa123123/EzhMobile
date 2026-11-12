"""Маршруты расписания и его экспорта"""
import hashlib
import json
import os
from datetime import datetime, timezone

from flask import Blueprint, Response, jsonify, request

from app_data import (
    _fold_ics_line, _ics_escape, _mark_synced, _needs_sync, _safe_print,
    _save_schedule_cache, _schedule_cache_path, limiter, make_safe_filename,
    planner, validate_group, validate_subgroup,
)

bp = Blueprint("schedule", __name__)


def _schedule_response(payload, exhausted):
    """Ответ расписания; X-Schedule-Exhausted сообщает клиенту о неполной загрузке.

    Без заголовка клиент считал бы синк успешным и не обновил бы его ещё
    6 часов, хотя часть недель не успела скачаться (п.11 §11).
    """
    resp = jsonify(payload)
    if exhausted:
        resp.headers['X-Schedule-Exhausted'] = '1'
    return resp


@bp.route("/api/schedule_all")
@limiter.limit("240 per minute")
def get_schedule_all():
    raw_group = request.args.get('group')
    try:
        group = validate_group(raw_group)
    except ValueError:
        return jsonify([])
    subgroup = validate_subgroup(request.args.get('subgroup', '0'))
    cache_file = _schedule_cache_path(group, subgroup)

    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except (json.JSONDecodeError, OSError):
            pass

    try:
        schedule, exhausted = planner.get_semester_schedule(group, subgroup)
    except Exception as e:
        _safe_print(f"Error fetching schedule: {e}", flush=True)
        return jsonify([])

    if schedule:
        _save_schedule_cache(cache_file, schedule)
        if not exhausted:
            _mark_synced(f"{group}_{subgroup}")

    return _schedule_response(schedule, exhausted)

@bp.route("/api/schedule_sync")
@limiter.limit("120 per minute")
def sync_schedule():
    raw_group = request.args.get('group')
    try:
        group = validate_group(raw_group)
    except ValueError:
        return jsonify([])
    subgroup = validate_subgroup(request.args.get('subgroup', '0'))

    force = request.args.get('force') == '1'
    sync_key = f"{group}_{subgroup}"
    if not force and not _needs_sync(sync_key):
        return jsonify([])

    cache_file = _schedule_cache_path(group, subgroup)

    try:
        schedule, exhausted = planner.get_semester_schedule(group, subgroup)
        if schedule:
            _save_schedule_cache(cache_file, schedule)
            if not exhausted:
                _mark_synced(sync_key)
            return _schedule_response(schedule, exhausted)

        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    return jsonify(json.load(f))
            except (json.JSONDecodeError, OSError):
                pass
        return jsonify([])
    except Exception as e:
        _safe_print(f"Error syncing schedule: {e}", flush=True)
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    return jsonify(json.load(f))
            except (json.JSONDecodeError, OSError):
                pass
        return jsonify([])

@bp.route("/api/schedule.ics")
@limiter.limit("30 per minute")
def export_ics():
    raw_group = request.args.get('group')
    try:
        group = validate_group(raw_group)
    except ValueError:
        return jsonify({"error": "invalid group"}), 400
    subgroup = validate_subgroup(request.args.get('subgroup', '0'))
    cache_file = _schedule_cache_path(group, subgroup)
    if not os.path.exists(cache_file):
        return Response(
            "Расписание ещё не загружено. Откройте группу в календаре, затем скачивайте .ics.",
            status=409, mimetype='text/plain; charset=utf-8')
    try:
        with open(cache_file, 'r', encoding='utf-8') as f:
            schedule = json.load(f)
    except (OSError, json.JSONDecodeError):
        return Response("Ошибка чтения кэша", status=500,
                        mimetype='text/plain; charset=utf-8')

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0",
             "PRODID:-//EzhMobile//EzhDiary//RU", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH"]
    dtstamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    for item in schedule:
        date_str = item.get('date', '')
        tr = item.get('time_range', '')
        lesson = item.get('lesson', '')
        type_name = item.get('type_name', '')
        teacher = item.get('teacher', '')
        location = item.get('location', '')
        if not date_str or ' - ' not in tr:
            continue
        try:
            start_time, end_time = [t.strip() for t in tr.split(' - ')]
            dt_start = datetime.strptime(f"{date_str} {start_time}", "%Y-%m-%d %H:%M")
            dt_end = datetime.strptime(f"{date_str} {end_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            continue
        uid = hashlib.md5(
            f"{group}_{date_str}_{item.get('n','')}_{item.get('subgroup','')}_{lesson}".encode()
        ).hexdigest()[:16]
        summary = lesson + (f" ({type_name})" if type_name else "")
        desc_parts = []
        if teacher:
            desc_parts.append(f"Преподаватель: {teacher}")
        if location:
            desc_parts.append(f"Аудитория: {location}")
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{uid}@ezh.local",
            f"DTSTAMP:{dtstamp}",
            f"DTSTART:{dt_start.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND:{dt_end.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{_ics_escape(summary)}",
            f"DESCRIPTION:{_ics_escape(chr(10).join(desc_parts))}",
            f"LOCATION:{_ics_escape(location)}",
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")

    from urllib.parse import quote
    safe_group = make_safe_filename(group)
    filename = f"schedule_{safe_group}_{subgroup}.ics"
    return Response(
        "\r\n".join(_fold_ics_line(l) for l in lines) + "\r\n",
        content_type='text/calendar; charset=utf-8',
        headers={'Content-Disposition': f"attachment; filename*=UTF-8''{quote(filename)}"}
    )

