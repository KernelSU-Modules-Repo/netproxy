package www.netproxy.web.ui.util

import android.content.Context
import android.content.SharedPreferences

object AppModeManager {
    private const val PREF_NAME = "app_config"
    private const val KEY_APP_MODE = "app_mode"
    
    const val MODE_NOT_SET = "not_set"
    const val MODE_MODULE = "module"
    const val MODE_SOFTWARE = "software"
    
    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }
    
    fun getMode(context: Context): String {
        return getPrefs(context).getString(KEY_APP_MODE, MODE_NOT_SET) ?: MODE_NOT_SET
    }
    
    fun setMode(context: Context, mode: String) {
        getPrefs(context).edit().putString(KEY_APP_MODE, mode).apply()
    }
    
    fun isModeSet(context: Context): Boolean {
        return getMode(context) != MODE_NOT_SET
    }
}
