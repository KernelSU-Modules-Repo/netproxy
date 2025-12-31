package www.netproxy.web.ui.tiles

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.topjohnwu.superuser.Shell
import www.netproxy.web.ui.R

class ProxyStatusTileService : TileService() {
    
    companion object {
        private const val XRAY_BIN = "/data/adb/modules/netproxy/bin/xray"
        private const val START_SCRIPT = "/data/adb/modules/netproxy/scripts/core/start.sh"
        private const val STOP_SCRIPT = "/data/adb/modules/netproxy/scripts/core/stop.sh"
    }
    
    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }
    
    override fun onClick() {
        super.onClick()
        
        val isRunning = getProxyStatus()
        
        if (isRunning) {
            // 当前运行中，执行停止
            Shell.cmd(STOP_SCRIPT).submit { 
                updateTileState()
            }
        } else {
            // 当前已停止，执行启动
            Shell.cmd(START_SCRIPT).submit {
                updateTileState()
            }
        }
    }
    
    private fun getProxyStatus(): Boolean {
        // 使用 pidof 检查 xray 进程是否运行
        val result = Shell.cmd("pidof -s $XRAY_BIN").exec()
        return result.isSuccess && result.out.isNotEmpty() && result.out[0].isNotBlank()
    }
    
    private fun updateTileState() {
        val tile = qsTile ?: return
        val isRunning = getProxyStatus()
        
        if (isRunning) {
            tile.state = Tile.STATE_ACTIVE
            tile.label = getString(R.string.tile_proxy_running)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                tile.subtitle = getString(R.string.tile_tap_to_stop)
            }
        } else {
            tile.state = Tile.STATE_INACTIVE
            tile.label = getString(R.string.tile_proxy_stopped)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                tile.subtitle = getString(R.string.tile_tap_to_start)
            }
        }
        
        tile.updateTile()
    }
}
