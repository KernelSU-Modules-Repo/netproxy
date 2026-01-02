package www.netproxy.web.ui.data.repository

import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import com.topjohnwu.superuser.Shell
import com.topjohnwu.superuser.ipc.RootService
import com.topjohnwu.superuser.nio.FileSystemManager
import www.netproxy.web.ui.App
import www.netproxy.web.ui.data.source.FileSystemService
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * Root 权限和文件系统相关操作的仓库
 */
class RootRepository {
    
    companion object {
        private const val XRAY_BIN = "/data/adb/modules/netproxy/bin/xray"
    }
    
    /**
     * 检查 Root 权限并获取 FileSystemManager
     * @return FileSystemManager 如果成功，null 如果失败
     */
    suspend fun checkRootAccess(): FileSystemManager? = suspendCoroutine { continuation ->
        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                val fs = FileSystemManager.getRemote(service!!)
                continuation.resume(fs)
            }
            
            override fun onServiceDisconnected(name: ComponentName?) {
                // 不在这里处理，避免多次 resume
            }
        }
        
        App.executor.submit {
            val isRoot = Shell.Builder.create()
                .setFlags(Shell.FLAG_MOUNT_MASTER)
                .build()
                .use { it.isRoot }
            
            App.handler.post {
                if (isRoot) {
                    RootService.bind(
                        Intent(App.instance, FileSystemService::class.java),
                        connection
                    )
                } else {
                    continuation.resume(null)
                }
            }
        }
    }
    
    /**
     * 检查代理是否正在运行
     */
    fun isProxyRunning(): Boolean {
        val result = Shell.cmd("pidof -s $XRAY_BIN").exec()
        return result.isSuccess && result.out.isNotEmpty() && result.out[0].isNotBlank()
    }
    
    /**
     * 执行 Shell 命令
     */
    fun executeCommand(cmd: String): Shell.Result {
        return Shell.cmd(cmd).exec()
    }
}
