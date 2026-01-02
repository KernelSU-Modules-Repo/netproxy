package www.netproxy.web.ui.util

import android.content.Context
import android.os.Build

/**
 * 提供 Monet 动态颜色 CSS 变量
 */
object MonetColorsProvider {
    private var cachedCss: String? = null

    fun updateCss(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            cachedCss = generateMonetCss(context)
        }
    }

    fun getCss(): String = cachedCss ?: ""

    private fun generateMonetCss(context: Context): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return ""
        }

        val resources = context.resources
        return buildString {
            appendLine(":root {")
            
            // Primary colors
            appendResourceColor(resources, "system_accent1_0", "--md-sys-color-primary-0")
            appendResourceColor(resources, "system_accent1_10", "--md-sys-color-primary-10")
            appendResourceColor(resources, "system_accent1_50", "--md-sys-color-primary-50")
            appendResourceColor(resources, "system_accent1_100", "--md-sys-color-primary-100")
            appendResourceColor(resources, "system_accent1_200", "--md-sys-color-primary-200")
            appendResourceColor(resources, "system_accent1_300", "--md-sys-color-primary-300")
            appendResourceColor(resources, "system_accent1_400", "--md-sys-color-primary-400")
            appendResourceColor(resources, "system_accent1_500", "--md-sys-color-primary-500")
            appendResourceColor(resources, "system_accent1_600", "--md-sys-color-primary-600")
            appendResourceColor(resources, "system_accent1_700", "--md-sys-color-primary-700")
            appendResourceColor(resources, "system_accent1_800", "--md-sys-color-primary-800")
            appendResourceColor(resources, "system_accent1_900", "--md-sys-color-primary-900")
            appendResourceColor(resources, "system_accent1_1000", "--md-sys-color-primary-1000")

            // Secondary colors
            appendResourceColor(resources, "system_accent2_0", "--md-sys-color-secondary-0")
            appendResourceColor(resources, "system_accent2_10", "--md-sys-color-secondary-10")
            appendResourceColor(resources, "system_accent2_50", "--md-sys-color-secondary-50")
            appendResourceColor(resources, "system_accent2_100", "--md-sys-color-secondary-100")
            appendResourceColor(resources, "system_accent2_200", "--md-sys-color-secondary-200")
            appendResourceColor(resources, "system_accent2_300", "--md-sys-color-secondary-300")
            appendResourceColor(resources, "system_accent2_400", "--md-sys-color-secondary-400")
            appendResourceColor(resources, "system_accent2_500", "--md-sys-color-secondary-500")
            appendResourceColor(resources, "system_accent2_600", "--md-sys-color-secondary-600")
            appendResourceColor(resources, "system_accent2_700", "--md-sys-color-secondary-700")
            appendResourceColor(resources, "system_accent2_800", "--md-sys-color-secondary-800")
            appendResourceColor(resources, "system_accent2_900", "--md-sys-color-secondary-900")
            appendResourceColor(resources, "system_accent2_1000", "--md-sys-color-secondary-1000")

            // Tertiary colors
            appendResourceColor(resources, "system_accent3_0", "--md-sys-color-tertiary-0")
            appendResourceColor(resources, "system_accent3_10", "--md-sys-color-tertiary-10")
            appendResourceColor(resources, "system_accent3_50", "--md-sys-color-tertiary-50")
            appendResourceColor(resources, "system_accent3_100", "--md-sys-color-tertiary-100")
            appendResourceColor(resources, "system_accent3_200", "--md-sys-color-tertiary-200")
            appendResourceColor(resources, "system_accent3_300", "--md-sys-color-tertiary-300")
            appendResourceColor(resources, "system_accent3_400", "--md-sys-color-tertiary-400")
            appendResourceColor(resources, "system_accent3_500", "--md-sys-color-tertiary-500")
            appendResourceColor(resources, "system_accent3_600", "--md-sys-color-tertiary-600")
            appendResourceColor(resources, "system_accent3_700", "--md-sys-color-tertiary-700")
            appendResourceColor(resources, "system_accent3_800", "--md-sys-color-tertiary-800")
            appendResourceColor(resources, "system_accent3_900", "--md-sys-color-tertiary-900")
            appendResourceColor(resources, "system_accent3_1000", "--md-sys-color-tertiary-1000")

            // Neutral colors
            appendResourceColor(resources, "system_neutral1_0", "--md-sys-color-neutral-0")
            appendResourceColor(resources, "system_neutral1_10", "--md-sys-color-neutral-10")
            appendResourceColor(resources, "system_neutral1_50", "--md-sys-color-neutral-50")
            appendResourceColor(resources, "system_neutral1_100", "--md-sys-color-neutral-100")
            appendResourceColor(resources, "system_neutral1_200", "--md-sys-color-neutral-200")
            appendResourceColor(resources, "system_neutral1_300", "--md-sys-color-neutral-300")
            appendResourceColor(resources, "system_neutral1_400", "--md-sys-color-neutral-400")
            appendResourceColor(resources, "system_neutral1_500", "--md-sys-color-neutral-500")
            appendResourceColor(resources, "system_neutral1_600", "--md-sys-color-neutral-600")
            appendResourceColor(resources, "system_neutral1_700", "--md-sys-color-neutral-700")
            appendResourceColor(resources, "system_neutral1_800", "--md-sys-color-neutral-800")
            appendResourceColor(resources, "system_neutral1_900", "--md-sys-color-neutral-900")
            appendResourceColor(resources, "system_neutral1_1000", "--md-sys-color-neutral-1000")

            // Neutral variant colors
            appendResourceColor(resources, "system_neutral2_0", "--md-sys-color-neutral-variant-0")
            appendResourceColor(resources, "system_neutral2_10", "--md-sys-color-neutral-variant-10")
            appendResourceColor(resources, "system_neutral2_50", "--md-sys-color-neutral-variant-50")
            appendResourceColor(resources, "system_neutral2_100", "--md-sys-color-neutral-variant-100")
            appendResourceColor(resources, "system_neutral2_200", "--md-sys-color-neutral-variant-200")
            appendResourceColor(resources, "system_neutral2_300", "--md-sys-color-neutral-variant-300")
            appendResourceColor(resources, "system_neutral2_400", "--md-sys-color-neutral-variant-400")
            appendResourceColor(resources, "system_neutral2_500", "--md-sys-color-neutral-variant-500")
            appendResourceColor(resources, "system_neutral2_600", "--md-sys-color-neutral-variant-600")
            appendResourceColor(resources, "system_neutral2_700", "--md-sys-color-neutral-variant-700")
            appendResourceColor(resources, "system_neutral2_800", "--md-sys-color-neutral-variant-800")
            appendResourceColor(resources, "system_neutral2_900", "--md-sys-color-neutral-variant-900")
            appendResourceColor(resources, "system_neutral2_1000", "--md-sys-color-neutral-variant-1000")

            append("}")
        }
    }

    private fun StringBuilder.appendResourceColor(
        resources: android.content.res.Resources,
        resourceName: String,
        cssVar: String
    ) {
        try {
            val resId = resources.getIdentifier(resourceName, "color", "android")
            if (resId != 0) {
                val color = resources.getColor(resId, null)
                val hex = String.format("#%06X", 0xFFFFFF and color)
                appendLine("\t$cssVar: $hex;")
            }
        } catch (_: Exception) {
            // Ignore missing resources
        }
    }
}
