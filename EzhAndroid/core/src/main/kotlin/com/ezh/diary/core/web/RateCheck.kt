package com.ezh.diary.core.web

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall

/** Двойной лимит как в Flask: общий 300/мин плюс лимит конкретного маршрута. */
suspend fun ApplicationCall.enforceRate(deps: ApiDeps, bucket: String, perMinute: Int): Boolean {
    if (deps.limiter.allow("global", 300) && deps.limiter.allow(bucket, perMinute)) return true
    respondBody("429 Too Many Requests", TEXT_PLAIN_UTF8, HttpStatusCode.TooManyRequests)
    return false
}
