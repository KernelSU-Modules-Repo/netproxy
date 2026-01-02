package www.netproxy.web.ui.ui.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import www.netproxy.web.ui.data.repository.RootRepository
import www.netproxy.web.ui.ui.common.MainUiState

/**
 * 主界面 ViewModel
 * 管理 Root 权限检查和 UI 状态
 */
class MainViewModel : ViewModel() {
    
    private val rootRepository = RootRepository()
    
    private val _uiState = MutableStateFlow<MainUiState>(MainUiState.Loading)
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()
    
    /**
     * 检查 Root 权限
     */
    fun checkRootPermission() {
        _uiState.value = MainUiState.Loading
        
        viewModelScope.launch(Dispatchers.IO) {
            val fileSystemManager = rootRepository.checkRootAccess()
            
            _uiState.value = if (fileSystemManager != null) {
                MainUiState.Ready(fileSystemManager)
            } else {
                MainUiState.RootCheckFailed
            }
        }
    }
}
