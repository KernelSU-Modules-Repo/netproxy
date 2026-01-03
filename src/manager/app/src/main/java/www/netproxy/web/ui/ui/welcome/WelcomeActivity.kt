package www.netproxy.web.ui.ui.welcome

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.topjohnwu.superuser.Shell
import www.netproxy.web.ui.R
import www.netproxy.web.ui.ui.main.MainActivity
import www.netproxy.web.ui.ui.software.SoftwareMainActivity
import www.netproxy.web.ui.util.AppModeManager
import java.io.File

class WelcomeActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check if mode is already set
        if (AppModeManager.isModeSet(this)) {
            launchTargetActivity()
            return
        }

        setContentView(R.layout.activity_welcome)

        findViewById<Button>(R.id.btn_module_mode).setOnClickListener {
            checkAndEnterModuleMode()
        }

        findViewById<Button>(R.id.btn_software_mode).setOnClickListener {
            enterSoftwareMode()
        }
    }

    private fun launchTargetActivity() {
        val mode = AppModeManager.getMode(this)
        if (mode == AppModeManager.MODE_MODULE) {
            startActivity(Intent(this, MainActivity::class.java))
        } else {
            startActivity(Intent(this, SoftwareMainActivity::class.java))
        }
        finish()
    }

    private fun checkAndEnterModuleMode() {
        // 1. Check Root
        if (!Shell.getShell().isRoot) {
            showErrorDialog(
                getString(R.string.dialog_root_required_title), 
                getString(R.string.dialog_root_required_msg), 
                false
            )
            return
        }

        // 2. Check Module Directory
        val checkCmd = "test -d /data/adb/modules/netproxy && echo exists"
        val result = Shell.cmd(checkCmd).exec()
        
        if (result.isSuccess && result.out.isNotEmpty() && result.out[0] == "exists") {
            // Success
            AppModeManager.setMode(this, AppModeManager.MODE_MODULE)
            launchTargetActivity()
        } else {
            // Failed
            showErrorDialog(
                getString(R.string.dialog_module_missing_title),
                getString(R.string.dialog_module_missing_msg),
                true
            )
        }
    }

    private fun enterSoftwareMode() {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.dialog_preview_title))
            .setMessage(getString(R.string.dialog_preview_msg))
            .setPositiveButton(getString(R.string.btn_continue)) { _, _ ->
                AppModeManager.setMode(this, AppModeManager.MODE_SOFTWARE)
                launchTargetActivity()
            }
            .setNegativeButton(getString(R.string.btn_cancel), null)
            .show()
    }

    private fun showErrorDialog(title: String, message: String, showDownloadLink: Boolean) {
        val builder = AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("OK", null)
            
        if (showDownloadLink) {
            builder.setNeutralButton(getString(R.string.dialog_btn_download)) { _, _ ->
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/Fanju6/NetProxy-Magisk"))
                startActivity(intent)
            }
        }
        
        builder.show()
    }
}
