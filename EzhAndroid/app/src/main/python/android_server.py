"""
Точка входа для Chaquopy.
Вызывается из MainActivity.java:
    py.getModule("android_server").callAttr("start_server", dataDir)
"""
import os
import shutil

def start_server(data_dir: str):
    data_dir = str(data_dir)
    os.environ["EZH_DATA_DIR"] = data_dir

    bundle_dir = os.path.dirname(os.path.abspath(__file__))

    for fname in ("VERSION", "teachers.json"):
        src = os.path.join(bundle_dir, fname)
        dst = os.path.join(data_dir, fname)
        if os.path.isfile(src) and not os.path.isfile(dst):
            try:
                shutil.copy2(src, dst)
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
