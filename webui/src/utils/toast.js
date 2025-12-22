import { snackbar } from 'mdui';

/**
 * Enhanced toast function with mdui snackbar
 * @param {string} msg - Message to display
 * @param {boolean} closeable - Whether the toast is closeable
 */
export function toast(msg, closeable = false) {
    try {
        snackbar({
            message: msg,
            closeable: closeable,
            timeout: closeable ? 0 : 3000,
            placement: 'bottom'
        });
    } catch (error) {
        console.error('Toast error:', error);
        // 备用方案：使用原生 alert
        alert(msg);
    }
}

