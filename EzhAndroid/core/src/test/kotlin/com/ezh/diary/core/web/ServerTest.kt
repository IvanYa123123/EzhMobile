package com.ezh.diary.core.web

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import org.junit.Assert.assertEquals
import org.junit.Test

class ServerTest {
    @Test
    fun healthReturnsVersion() = testApplication {
        application { ezhModule("0.8") }

        val response = client.get("/api/health")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("{\"ok\":true,\"version\":\"0.8\"}", response.bodyAsText())
    }

    @Test
    fun healthUsesPassedVersion() = testApplication {
        application { ezhModule("9.9.9-test") }

        val body = client.get("/api/health").bodyAsText()

        assertEquals("{\"ok\":true,\"version\":\"9.9.9-test\"}", body)
    }

    @Test
    fun unknownRouteIsNotFound() = testApplication {
        application { ezhModule("0.8") }

        val response = client.get("/api/nope")

        assertEquals(HttpStatusCode.NotFound, response.status)
    }
}
