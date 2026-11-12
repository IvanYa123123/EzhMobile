"""Собирает 30 JS-модулей интерфейса в один app.bundle.js.

index.html раньше подключал каждый модуль отдельным <script>, из-за чего на
холодном старте уходило ~30 запросов. Порядок модулей важен: это тот же
порядок, в котором они подключены в index.html.

Запуск:
    python scripts/build_js_bundle.py           # пересобрать пакет
    python scripts/build_js_bundle.py --check   # только проверить, что файлы есть

Сгенерированный пакет коммитится: app.py можно запускать и без gradle,
поэтому статику раздаёт уже готовый файл.
"""
import argparse
import os
import sys

MODULES = [
    "state", "utils", "ui", "api", "weeks", "mini-calendar", "calendar-cards",
    "calendar-day", "calendar", "navigation", "status", "tasks", "friends",
    "custom-schedule", "widgets-stats", "widgets-labs", "lab-items", "widgets",
    "settings", "teachers", "search", "autocomplete", "notifications",
    "refresh", "hotkeys", "mobile", "group-select",
    "moodle-pro", "main",
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_JS_DIR = os.path.join(
    ROOT, "EzhAndroid", "app", "src", "main", "python", "static", "js")
BUNDLE_NAME = "app.bundle.js"
HEADER = "// Сгенерировано scripts/build_js_bundle.py — не редактировать вручную.\n"


def build(js_dir):
    missing = [m for m in MODULES if not os.path.isfile(os.path.join(js_dir, m + ".js"))]
    if missing:
        raise SystemExit("нет модулей: " + ", ".join(missing))

    parts = [HEADER]
    for name in MODULES:
        with open(os.path.join(js_dir, name + ".js"), "r", encoding="utf-8-sig") as f:
            body = f.read().strip()
        parts.append(f"// --- {name}.js ---\n{body}\n")

    out = "\n;\n".join(parts)
    bundle = os.path.join(js_dir, BUNDLE_NAME)
    with open(bundle, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    return bundle


def main():
    ap = argparse.ArgumentParser(description="Сборка static/js/app.bundle.js")
    ap.add_argument("--js-dir", default=DEFAULT_JS_DIR)
    ap.add_argument("--check", action="store_true",
                    help="только проверить наличие модулей")
    args = ap.parse_args()

    if args.check:
        missing = [m for m in MODULES if not os.path.isfile(os.path.join(args.js_dir, m + ".js"))]
        if missing:
            raise SystemExit("нет модулей: " + ", ".join(missing))
        print(f"ok: {len(MODULES)} модулей на месте")
        return 0

    bundle = build(args.js_dir)
    print(f"собран {os.path.relpath(bundle, ROOT)} ({os.path.getsize(bundle)} байт)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
