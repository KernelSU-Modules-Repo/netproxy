/**
 * NetProxy-Magisk WebUI
 * 模块化架构 - 主入口文件
 */

import 'mdui';
import { UI } from './ui/ui-core.js';

/**
 * 等待 KernelSU 环境准备好再初始化
 */
function initializeApp() {
    console.log('Initializing app, checking KernelSU...');

    // 检查 ksu 对象是否可用
    if (typeof window.ksu !== 'undefined') {
        console.log('KernelSU available, creating UI');
        new UI();
    } else {
        console.log('KernelSU not ready yet, waiting 500ms...');
        setTimeout(() => {
            if (typeof window.ksu !== 'undefined') {
                console.log('KernelSU ready after delay');
            } else {
                console.warn('KernelSU still not detected');
            }
            new UI();
        }, 500);
    }
}

// 初始化应用
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
