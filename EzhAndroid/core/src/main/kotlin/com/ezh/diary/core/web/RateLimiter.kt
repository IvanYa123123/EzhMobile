package com.ezh.diary.core.web

import java.util.concurrent.ConcurrentHashMap

/**
 * Фиксированное окно в минуту — как flask-limiter с strategy=fixed-window.
 * Сервер слушает только loopback, поэтому ключ — просто имя корзины.
 */
class RateLimiter(private val nowMs: () -> Long = { System.currentTimeMillis() }) {
    private class Window(var start: Long, var count: Int)

    private val windows = ConcurrentHashMap<String, Window>()

    fun allow(bucket: String, perMinute: Int): Boolean {
        val now = nowMs()
        val window = windows.computeIfAbsent(bucket) { Window(now, 0) }
        synchronized(window) {
            if (now - window.start >= 60_000L) {
                window.start = now
                window.count = 0
            }
            if (window.count >= perMinute) return false
            window.count++
            return true
        }
    }
}
