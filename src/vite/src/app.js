/**
 * NetProxy-Magisk WebUI
 * 模块化架构 - 主入口文件
 */

import 'mdui/mdui.css';
import 'mdui';
import { UI } from './ui/ui-core.js';



/**
 * 等待 KernelSU 环境准备好再初始化
 */
function initializeApp() {
    // 检查 ksu 对象是否可用
    if (typeof window.ksu !== 'undefined') {
        new UI();
    } else {
        setTimeout(() => {
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
