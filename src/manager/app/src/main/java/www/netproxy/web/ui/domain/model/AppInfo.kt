package www.netproxy.web.ui.domain.model

import android.content.pm.PackageInfo

/**
 * 应用信息数据类
 */
data class AppInfo(
    val packageInfo: PackageInfo,
    val label: String
) {
    val packageName: String get() = packageInfo.packageName
}
