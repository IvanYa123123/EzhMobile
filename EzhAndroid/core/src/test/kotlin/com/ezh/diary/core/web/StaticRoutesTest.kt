package com.ezh.diary.core.web

import com.ezh.diary.core.newDeps
import io.ktor.client.request.get
import io.ktor.client.call.body
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import java.nio.charset.StandardCharsets
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Статика из assets: index, бандл, заголовки и 404 (этап 7). */
class StaticRoutesTest {

    private val files = mapOf(
        "index.html" to "<!doctype html><title>Ezh</title>",
        "js/app.bundle.js" to "console.log('ok');",
        "css/style.css" to "body{color:#000}",
        "vendor/chart.umd.min.js" to "/* chart */",
    )

    private fun assets() = StaticAssets { path -> files[path]?.toByteArray(StandardCharsets.UTF_8) }

    @Test
    fun `index отдаётся на корне с no-cache и CSP`() = testApplication {
        application { ezhModule(newDeps(assets = assets())) }

        val response = client.get("/")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("<!doctype html><title>Ezh</title>", response.bodyAsText())
        assertEquals("no-cache", response.headers["Cache-Control"])
        assertTrue(response.headers["Content-Security-Policy"].orEmpty().contains("frame-ancestors 'none'"))
        assertTrue(response.headers[io.ktor.http.HttpHeaders.ContentType].orEmpty().startsWith("text/html"))
    }

    @Test
    fun `бандл и css отдаются с правильными типами`() = testApplication {
        application { ezhModule(newDeps(assets = assets())) }

        val js = client.get("/static/js/app.bundle.js")
        assertEquals(HttpStatusCode.OK, js.status)
        assertTrue(js.headers[io.ktor.http.HttpHeaders.ContentType].orEmpty().startsWith("application/javascript"))
        assertEquals("no-cache", js.headers["Cache-Control"])
        assertContentEquals("console.log('ok');".toByteArray(), js.body<ByteArray>())

        val css = client.get("/static/css/style.css")
        assertTrue(css.headers[io.ktor.http.HttpHeaders.ContentType].orEmpty().startsWith("text/css"))
    }

    @Test
    fun `нет файла - 404, обход каталога не проходит`() = testApplication {
        application { ezhModule(newDeps(assets = assets())) }

        assertEquals(HttpStatusCode.NotFound, client.get("/static/js/missing.js").status)
        assertEquals(HttpStatusCode.NotFound, client.get("/static/../secret").status)
    }

    @Test
    fun `без assets сервер не отвечает статикой`() = testApplication {
        application { ezhModule(newDeps(assets = null)) }

        assertEquals(HttpStatusCode.NotFound, client.get("/").status)
    }
}
