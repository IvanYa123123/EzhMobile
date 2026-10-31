# Сборка EzhMobile

Нативное Android-приложение на WebView + Flask в Chaquopy.
Ниже — минимальный путь от чистого клона до установленного APK.

---

## 1. Что должно быть на машине

| Компонент | Версия | Зачем |
|---|---|---|
| JDK | 17 (или 21) | AGP 8.13 / Gradle 8.13 |
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

---

## 3. Gradle wrapper

`gradle/wrapper/gradle-wrapper.properties` уже на месте и указывает на
Gradle 8.13. Бинарный `gradle-wrapper.jar` я не генерирую (это файл,
а не текст) — получите его одним из способов:

**A. Android Studio (проще всего)**
Открыть папку репозитория → «Sync Project with Gradle Files».
IDE сама скачает дистрибутив и создаст `gradlew`, `gradlew.bat`,
`gradle/wrapper/gradle-wrapper.jar`.

**B. Из командной строки** (если Gradle есть в PATH любой версии):

```
cd EzhMobile
gradle wrapper --gradle-version 8.13 --distribution-type bin
```

**C. Скопировать** `gradlew`, `gradlew.bat` и `gradle/wrapper/gradle-wrapper.jar`
из любого другого Android-проекта (версия в `.properties` уже правильная).

После этого `./gradlew` работает.

---

## 4. Сборка

```
cd EzhMobile
./gradlew assembleDebug
```

Windows: `gradlew.bat assembleDebug`.

APK: `EzhAndroid/app/build/outputs/apk/debug/app-debug.apk`

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

