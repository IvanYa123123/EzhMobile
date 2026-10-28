#!/usr/bin/env python3
"""
Скачивает внешние CDN-зависимости в static/vendor и static/fonts.
Запускать вручную: python scripts/fetch_vendor_assets.py
Результат нужно закоммитить в репозиторий.
"""
import os
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(BASE, "EzhAndroid", "app", "src", "main", "python", "static", "vendor")
FONTS = os.path.join(BASE, "EzhAndroid", "app", "src", "main", "python", "static", "fonts")

FILES = [
    ("https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css",
     os.path.join(VENDOR, "bootstrap.min.css")),
    ("https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js",
     os.path.join(VENDOR, "bootstrap.bundle.min.js")),
    ("https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
     os.path.join(VENDOR, "chart.umd.min.js")),
    ("https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2",
     os.path.join(FONTS, "inter-variable.woff2")),
]

def main():
    os.makedirs(VENDOR, exist_ok=True)
    os.makedirs(FONTS, exist_ok=True)
    for url, dst in FILES:
        if os.path.exists(dst):
            print(f"skip {dst}")
            continue
        print(f"download {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r, open(dst, "wb") as f:
            f.write(r.read())
        print(f"  -> {dst}")
    print("done")

if __name__ == "__main__":
    main()
