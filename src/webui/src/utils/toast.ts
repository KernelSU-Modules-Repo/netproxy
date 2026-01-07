import { snackbar } from 'mdui';

/**
 * Enhanced toast function with mdui snackbar
 * @param {string} msg - Message to display
 * @param {boolean} closeable - Whether the toast is closeable
 */
export function toast(msg: string, closeable: boolean = false): void {
    try {
        snackbar({
            message: msg,
            closeable: closeable,
            autoCloseDelay: closeable ? 0 : 3000,
            placement: 'bottom'
        } as any);
    } catch (error) {
        console.error('Toast error:', error);
    }
}

