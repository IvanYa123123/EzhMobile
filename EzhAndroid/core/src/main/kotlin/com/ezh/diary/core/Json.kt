package com.ezh.diary.core

import kotlinx.serialization.json.Json

/**
 * Общая JSON-конфигурация сервера и тестов.
 *
 * `explicitNulls = false` — null-поля не пишутся в ответ, как у Flask-роутов
 * (jsonify тоже опускает null). `ignoreUnknownKeys` — ответы сайта СевГУ
 * иногда содержат лишние поля, падать из-за них нельзя.
 */
val EzhJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}
