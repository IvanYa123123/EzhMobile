# Сборка EzhMobile

Android-приложение: интерфейс в WebView, бэкенд — Kotlin (Ktor, порт 5000
только на 127.0.0.1).

---

## 1. Что должно быть на машине

| Компонент | Версия | Зачем |
|---|---|---|
| JDK | 17 (или 21) | AGP 8.13 / Gradle 8.13 |
| Android SDK | Platform 36 + Build-Tools 35+ | `compileSdk 36` |
| Node.js | 20+ | сборка `app.bundle.js` и скачивание vendor-ассетов |
| Gradle | не нужен отдельно | берётся wrapper'ом |


---

## 2. Vendor-ассеты (обязательно ДО сборки)

```
cd EzhMobile
node scripts/fetch_vendor_assets.mjs
```

Скрипт кладёт четыре файла:

```
EzhAndroid/app/src/main/assets/static/vendor/bootstrap.min.css
EzhAndroid/app/src/main/assets/static/vendor/bootstrap.bundle.min.js
EzhAndroid/app/src/main/assets/static/vendor/chart.umd.min.js
EzhAndroid/app/src/main/assets/static/fonts/inter-variable.woff2
```

Без них сервер отдаёт 404, `window.bootstrap === undefined`, первый
`new bootstrap.Modal(...)` падает с `ReferenceError`, и `renderCalendar()`
не вызывается — белый экран.

Защита встроена в сборку: задача `checkVendorAssets` (в `app/build.gradle`)
висит на `preBuild` и валит сборку, если файлов нет.

### 2.1. Бандл интерфейса

`assets/static/index.html` подключает один файл `js/app.bundle.js` вместо
30 отдельных модулей — меньше запросов на холодном старте.

```bash
cd EzhMobile
node scripts/build_js_bundle.mjs            # пересобрать
node scripts/build_js_bundle.mjs --check    # проверить, что модули на месте
```

Задача `buildJsBundle` в `app/build.gradle` собирает пакет автоматически
перед сборкой APK (Gradle вызывает `node`). После правки любого
`assets/static/js/*.js` пакет нужно пересобрать, иначе WebView останется на
старом коде.

---

## 3. Gradle wrapper

`gradlew`, `gradlew.bat` и `gradle/wrapper/` лежат в репозитории и указывают
на Gradle 8.13 — ставить Gradle отдельно не нужно. Локальная сборка и CI
используют один и тот же wrapper.

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
`versionCode` (по умолчанию, без параметра, остаётся 8). `versionName`
берётся из `EzhAndroid/app/src/main/assets/VERSION`.

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

CI раскладывает keystore из `KEYSTORE_BASE64` во временный файл и передаёт
Gradle пути через переменные окружения `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS`, `KEY_PASSWORD`.

Локально можно подписать так же, задав эти четыре переменные перед сборкой;
без них `assembleRelease` соберёт неподписанный APK
(`app-release-unsigned.apk`), который не установится.

### 4.2. Сборки для тестеров

CI складывает подписанный APK в artifact `app-release-<N>` (N — номер прогона,
он же `versionCode`). Забрать: страница Actions → нужный прогон → Artifacts.
`versionName` берётся из `assets/VERSION` и виден в шапке приложения.

При смене подписи первая установка — только после удаления старого приложения
(данные пропадут; при необходимости сначала сделайте бэкап в настройках).
Дальше обновления ставятся обычным «Установить» без потери данных:
подпись одна, а `versionCode` растёт с каждым прогоном.

---

## 5. Структура проекта

```
EzhAndroid/
  core/                     Kotlin-бэкенд без Android API (JVM-модуль)
    planner/                расписание СевГУ, кэш, экстраполяция недель
    teacher/                список преподавателей, разбор ICS
    moodle/                 логин и статистика Moodle
    db/                     схема и репозитории SQLite
    storage/                файлы данных, кэш, бэкап
    web/                    Ktor-сервер, роуты, JSON, ICS
  app/                      Android-обвязка
    java/com/ezh/diary/     MainActivity, WebView, уведомления, EzhServer
    src/main/assets/        интерфейс (static/), Group.txt, teachers.json, VERSION
scripts/                    сборка бандла и vendor-ассетов (Node)
tests/
  fixtures/                 снятые с сайта ответы и golden-контракт API
  js/                       jsdom-смоук интерфейса
```

`EzhServer` поднимает Ktor на `127.0.0.1:5000` и отдаёт `assets/static`;
WebView грузит `/` с этого адреса.

---

## 6. Тесты

```bash
./gradlew :core:test                          # Kotlin-бэкенд
cd tests/js && npm ci && node --test ui.test.mjs   # интерфейс (нужен vendor)
```

Подробности и что именно покрыто — в [TESTS.md](TESTS.md).
Оба набора гоняются в CI: `:core:test` — в workflow `Build APK` перед
сборкой, jsdom — в workflow `Tests`.

---

## 7. Если что-то пошло не так

| Симптом | Причина | Что делать |
|---|---|---|
| `Отсутствуют vendor-ассеты` | не скачаны bootstrap/chart/inter | `node scripts/fetch_vendor_assets.mjs` |
| Белый экран после обновления APK | WebView закэшировал старый `app.bundle.js` | сервер отдаёт `no-cache`, но проверьте, что установлен новый APK |
| `node: command not found` на сборке | не установлен Node 20+ | поставить Node или пересобрать бандл вручную и закоммитить |
| Долгая первая сборка | скачивается Gradle и зависимости | подождать, повторить |
| release-APK не устанавливается поверх старого | другая подпись | один раз удалить старое приложение (данные потеряются) |

Логи Android: `adb logcat -s EzhServer:V AndroidRuntime:E`.
