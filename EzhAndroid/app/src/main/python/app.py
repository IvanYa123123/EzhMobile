"""Точка входа Flask-приложения «Ежедневник СевГУ».

Здесь только сборка приложения: blueprint'ы и dev-сервер. Пути, БД, кэши и
лимитер живут в app_data.py, маршруты — в routes_*.py (п.4 §11).
"""
from app_data import app
from moodle_pro import moodle_bp

from routes_groups import bp as groups_bp
from routes_tasks import bp as tasks_bp
from routes_backup import bp as backup_bp
from routes_labs import bp as labs_bp
from routes_schedule import bp as schedule_bp
from routes_misc import bp as misc_bp
from routes_teachers import bp as teachers_bp

for _bp in (moodle_bp, groups_bp, tasks_bp, backup_bp, labs_bp, schedule_bp, misc_bp, teachers_bp):
    app.register_blueprint(_bp)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
