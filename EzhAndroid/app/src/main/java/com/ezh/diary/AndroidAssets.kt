package com.ezh.diary

import android.content.res.AssetManager
import com.ezh.diary.core.storage.Bundles
import com.ezh.diary.core.web.StaticAssets
import java.io.IOException

/** Статика интерфейса из assets/static (сюда её кладёт задача prepareWebAssets). */
class AndroidAssets(private val assets: AssetManager) : StaticAssets {
    override fun read(path: String): ByteArray? = try {
        assets.open("static/$path").use { it.readBytes() }
    } catch (e: IOException) {
        null
    }
}

/** Group.txt, teachers.json и прочие файлы рядом с приложением (бывший BUNDLE_DIR). */
class AndroidBundles(private val assets: AssetManager) : Bundles {
    override fun text(name: String): String? = try {
        assets.open(name).bufferedReader().use { it.readText() }
    } catch (e: IOException) {
        null
    }
}
