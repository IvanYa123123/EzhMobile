"""Общие фикстуры: приложение поднимается на временном каталоге данных."""
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "EzhAndroid" / "app" / "src" / "main" / "python"
DATA_DIR = Path(tempfile.mkdtemp(prefix="ezh-tests-"))

# BASE_DIR вычисляется при импорте app_data, поэтому окружение задаём до импорта.
os.environ["EZH_DATA_DIR"] = str(DATA_DIR)
shutil.copy(APP_DIR / "teachers.json", DATA_DIR / "teachers.json")
sys.path.insert(0, str(APP_DIR))


@pytest.fixture(scope="session")
def flask_app():
    import app  # noqa: F401  — регистрирует blueprint'ы
    from app_data import app as application

    application.config.update(TESTING=True)
    return application


@pytest.fixture()
def client(flask_app):
    return flask_app.test_client()
