package www.netproxy.web.ui.ui.common

import com.topjohnwu.superuser.nio.FileSystemManager

/**
 * 主界面 UI 状态
 */
sealed class MainUiState {
    /** 加载中 - 正在检查 Root 权限 */
    data object Loading : MainUiState()
    
    /** Root 权限检查失败 */
    data object RootCheckFailed : MainUiState()
    
    /** 准备就绪 - Root 权限检查通过 */
    data class Ready(val fileSystemManager: FileSystemManager) : MainUiState()
}
