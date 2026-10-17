"""
Точка входа для Chaquopy. Вызывается из MainActivity.java:
    py.getModule("android_server").callAttr("start_server", dataDir)
"""
import os
import sys

def start_server(data_dir: str):
    data_dir = str(data_dir)
    os.environ["EZH_DATA_DIR"] = data_dir

    # Копируем VERSION в data_dir при первом запуске,
    # чтобы _read_app_version() в app.py его нашёл
    bundle_dir = os.path.dirname(os.path.abspath(__file__))
    version_src = os.path.join(bundle_dir, "VERSION")
    version_dst = os.path.join(data_dir, "VERSION")
    if os.path.isfile(version_src) and not os.path.isfile(version_dst):
        try:
            import shutil
            shutil.copy2(version_src, version_dst)
        except OSError:
            pass

    from app import app

    print("[android] Flask starting, data_dir=" + data_dir, flush=True)

    try:
        from waitress import serve
        serve(
            app,
            host="127.0.0.1",
            port=5000,
            threads=4,
            connection_limit=100,
            channel_timeout=300,
        )
    except ImportError:
        print("[android] waitress not found, using Flask dev server", flush=True)
        app.run(host="127.0.0.1", port=5000, threaded=True, use_reloader=False)
