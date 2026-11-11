# Сборка EzhMobile

Нативное Android-приложение на WebView + Flask в Chaquopy.
Ниже — минимальный путь от чистого клона до установленного APK.

---

## 1. Что должно быть на машине

| Компонент | Версия | Зачем |
|---|---|---|
| JDK | 17 (или 21) | AGP 8.2.2 / Gradle 8.13 |
| Android SDK | Platform 36 + Build-Tools 35+ | `compileSdk 36` |
| Python | **3.11** (обязательно минорная совпадает с `chaquopy.defaultConfig.version`) | Chaquopy запускает pip на машине сборки |
| Gradle | не нужен отдельно | берётся wrapper'ом |

Проверка Python:

```bash
python3.11 --version      # macOS / Linux
py -3.11 --version        # Windows
```

Если 3.11 нет — поставьте её либо поменяйте в `EzhAndroid/app/build.gradle`
строку `version = '3.11'` на ту версию, которая есть (3.10 / 3.11 / 3.12 /
3.13 / 3.14), и при необходимости задайте `buildPython`.

> Python 3.12+ поддерживает только 64-битные ABI — это совпадает с текущим
> `abiFilters 'arm64-v8a', 'x86_64'`. Python 3.10/3.11 — единственные,
> с которыми можно вернуть `armeabi-v7a` / `x86`.

---

## 2. Vendor-ассеты (обязательно ДО сборки)

```
cd EzhMobile
python scripts/fetch_vendor_assets.py
```

Скрипт кладёт четыре файла:

```
EzhAndroid/app/src/main/python/static/vendor/bootstrap.min.css
EzhAndroid/app/src/main/python/static/vendor/bootstrap.bundle.min.js
EzhAndroid/app/src/main/python/static/vendor/chart.umd.min.js
EzhAndroid/app/src/main/python/static/fonts/inter-variable.woff2
```

Без них Flask отдаёт 404, `window.bootstrap === undefined`, первый
`new bootstrap.Modal(...)` падает с `ReferenceError`, и `renderCalendar()`
не вызывается — белый экран.

Защита встроена в сборку: задача `checkVendorAssets` (в `app/build.gradle`)
вешается на `preBuild` и валит сборку с внятным сообщением, если файлов нет.
Так что забыть невозможно.

### 2.1. Бандл интерфейса

`static/index.html` подключает один файл `static/js/app.bundle.js` вместо
30 отдельных модулей — меньше запросов на холодном старте.

```bash
cd EzhMobile
python scripts/build_js_bundle.py
```

Задача `buildJsBundle` в `app/build.gradle` собирает пакет автоматически
перед сборкой APK. Готовая копия `app.bundle.js` лежит в репозитории, поэтому
`python app.py` работает без gradle; но после правки любого
`static/js/*.js` пакет нужно пересобрать, иначе WebView останется на старом
коде.

---

## 3. Gradle wrapper

`gradlew`, `gradlew.bat` и `gradle/wrapper/` лежат в репозитории и указывают
на Gradle 8.13 — ставить Gradle отдельно не нужно. Локальная сборка и CI
используют один и тот же wrapper, так что версия Gradle всегда совпадает.

Проверка: `./gradlew --version` (Windows: `gradlew.bat --version`).
Первый запуск скачает дистрибутив (~130 МБ) в `~/.gradle`.

---

## 4. Сборка

```
cd EzhMobile
./gradlew assembleDebug          # debug, для быстрой проверки
./gradlew assembleRelease        # release, для установки «на себя»
```

Windows: `gradlew.bat assembleDebug` / `gradlew.bat assembleRelease`.

Версию сборки можно переопределить: `./gradlew assembleDebug -PappVersionCode=237`.
CI передаёт номер прогона, поэтому APK из разных сборок отличаются
`versionCode` (по умолчанию, без параметра, остаётся 8).

APK:

- debug: `EzhAndroid/app/build/outputs/apk/debug/app-debug.apk`
- release (подписанный): `EzhAndroid/app/build/outputs/apk/release/app-release.apk`

### 4.1. Подпись release-APK

Android устанавливает обновление только поверх APK с **той же подписью**.
Поэтому release-сборка в CI подписывается постоянным ключом, который лежит
в секретах GitHub и не попадает в репозиторий.

Один раз создать keystore (храните файл и пароль в надёжном месте — потеря
ключа означает, что обновления поверх установленного приложения выпустить
уже нельзя):

```
keytool -genkeypair -v -keystore release.jks -alias ezh -keyalg RSA -keysize 4096 -validity 10000
```

Получить base64 и добавить в Settings → Secrets and variables → Actions:

```
# Linux/macOS
base64 -w0 release.jks > release.jks.b64

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('release.jks')) | Set-Content release.jks.b64
```

| Секрет | Значение |
|---|---|
| `KEYSTORE_BASE64` | содержимое `release.jks.b64` одной строкой |
| `KEYSTORE_PASSWORD` | пароль хранилища |
| `KEY_ALIAS` | `ezh` |
| `KEY_PASSWORD` | пароль ключа (обычно совпадает с паролем хранилища) |

CI сам раскладывает keystore из `KEYSTORE_BASE64` во временный файл и
передаёт Gradle пути через переменные окружения `KEYSTORE_FILE`,
`KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

Локально можно подписать так же, задав эти четыре переменные перед сборкой;
без них `assembleRelease` соберёт неподписанный APK
(`app-release-unsigned.apk`), который не установится.

Первый запуск долгий (5–15 мин): Gradle качает дистрибутив, AGP,
AndroidX и все pip-пакеты для Python 3.11.

---

## 5. Проверка APK

### 5.1 Python внутри

```
unzip -l EzhAndroid/app/build/outputs/apk/debug/app-debug.apk | grep -i chaquopy
```

Должны быть записи вида `assets/chaquopy/...`. Если их нет — Chaquopy-плагин
не применился (проверьте `id 'com.chaquo.python'` в `app/build.gradle`).

### 5.2 Vendor-файлы внутри

```
unzip -l EzhAndroid/app/build/outputs/apk/debug/app-debug.apk | grep bootstrap.min.css
```

Файлы Python-исходников Chaquopy упаковывает в свой ассет-архив, поэтому
имя может встретиться внутри zip-записи `assets/chaquopy/...`. Если `grep`
по имени ничего не дал — распакуйте архив Chaquopy:

```
cd /tmp && rm -rf apkx && mkdir apkx && cd apkx
unzip -o <путь>/app-debug.apk 'assets/chaquopy/*'
find . -name 'bootstrap.min.css'
```

### 5.3 Во время работы

```
adb logcat -s python.stdout python.stderr
```

При старте должно быть `[android] Flask starting, data_dir=...`.
Если видите `ModuleNotFoundError: flask` — pip-блок не отработал.

Проверка, что статика отдаётся (при запущенном приложении, с хоста):

```
adb forward tcp:5000 tcp:5000
curl -I http://127.0.0.1:5000/static/vendor/bootstrap.min.css
# ожидается HTTP/1.1 200 OK
```

---

## 6. Известные грабли

| Симптом ↕▾ | Причина ↕▾ | Лечение ↕▾ |
|---|---|---|
| −`Couldn't find Python 3.11 on PATH` | нет нужной минорной версии | поставить 3.11 либо поменять `version` + `buildPython` |
| `No matching distribution found for lxml>=5.0` | в репозитории Chaquopy нет wheel под выбранную версию Python | поставить `version = '3.10'`; приложение переживёт и без lxml (`teacher_parser` уйдёт в fallback, преподаватели подтянутся из `teachers.json`) |
| `checkVendorAssets` валит сборку | не запускали `fetch_vendor_assets.py` | запустить, см. п. 2 |
| `Failed to find Platform SDK with path: platforms;android-36` | не установлен SDK 36 | SDK Manager → Android 16 (API 36) |
| `Unsupported class file major version` | JDK 11/8 вместо 17 | File → Project Structure → SDK 17 |
| Белый экран, календарь пуст | 404 на vendor-файлы | см. п. 2 и 5.2 |
| Приложение падает на старте, `UnsatisfiedLinkError: libpython3.11.so` | APK собран под ABI, которого нет у устройства | добавить нужный ABI в `abiFilters` |
⚙

---

## 7. Что менять НЕ нужно

- Архитектура остаётся как есть: WebView грузит `http://127.0.0.1:5000/`,
`WebViewAssetLoader` не используется.
- `AndroidManifest.xml`, Java-классы, Python-код, `index.html` — без изменений.
- `main.js`, `calendar.js`, `api.js` — не трогаем: `window.API_BASE` уже
корректно вычисляется в `index.html`.

