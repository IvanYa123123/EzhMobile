package com.ezh.diary.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Test

@Serializable
private data class Health(@SerialName("ok") val ok: Boolean, val version: String)

class JsonTest {
    @Test
    fun parsesHealthResponse() {
        val health = EzhJson.decodeFromString<Health>("""{"ok":true,"version":"0.8","extra":1}""")
        assertEquals(true, health.ok)
        assertEquals("0.8", health.version)
    }
}
