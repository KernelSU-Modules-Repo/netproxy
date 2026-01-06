import { SettingsService } from '../services/settings-service.js';
import { toast } from '../utils/toast.js';
import { I18nService } from '../i18n/i18n-service.js';

/**
 * 日志页面管理器 - 使用 mdui-tabs 横向分组
 */
export class LogsPageManager {
    constructor(ui) {
        this.ui = ui;
        this._selectedTab = 'service';
        this._autoRefreshEnabled = false;
        this._autoRefreshInterval = null;
        this._autoRefreshMs = 3000; // 3 seconds
    }

    init() {
        this.setupTabs();
        this.setupAutoRefresh();
    }

    setupTabs() {
        const tabsEl = document.getElementById('logs-tabs');
        if (!tabsEl) return;

        // 注入滚动样式到 Shadow DOM
        requestAnimationFrame(() => {
            const shadowRoot = tabsEl.shadowRoot;
            if (shadowRoot) {
                const container = shadowRoot.querySelector('[part="container"]');
                if (container) {
                    container.style.cssText = 'display: flex; flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch;';
                }

                // 让每个 tab 保持自然宽度不收缩
                const slots = shadowRoot.querySelectorAll('slot');
                slots.forEach(slot => {
                    const assignedElements = slot.assignedElements();
                    assignedElements.forEach(el => {
                        if (el.tagName === 'MDUI-TAB') {
                            el.style.cssText = 'flex-shrink: 0; white-space: nowrap;';
                        }
                    });
                });
            }

            // 同时给 Light DOM 中的 tab 设置样式
            const lightTabs = tabsEl.querySelectorAll('mdui-tab');
            lightTabs.forEach(tab => {
                tab.style.cssText = 'flex-shrink: 0; white-space: nowrap;';
            });
        });

        // 绑定 tab 切换事件
        tabsEl.addEventListener('change', (e) => {
            this._selectedTab = e.target.value;
            this.loadActiveLog();
        });
    }

    setupAutoRefresh() {
        const toggle = document.getElementById('logs-auto-refresh');
        if (!toggle) return;

        toggle.addEventListener('change', () => {
            this._autoRefreshEnabled = toggle.checked;
            if (this._autoRefreshEnabled) {
                this.startAutoRefresh();
            } else {
                this.stopAutoRefresh();
            }
        });
    }

    startAutoRefresh() {
        this.stopAutoRefresh(); // 先停止已有的
        this._autoRefreshInterval = setInterval(() => {
            this.loadActiveLog();
        }, this._autoRefreshMs);
    }

    stopAutoRefresh() {
        if (this._autoRefreshInterval) {
            clearInterval(this._autoRefreshInterval);
            this._autoRefreshInterval = null;
        }
    }

    // 根据当前选中的 tab 加载日志
    loadActiveLog() {
        switch (this._selectedTab) {
            case 'service':
                this.loadServiceLog();
                break;
            case 'xray':
                this.loadXrayLog();
                break;
            case 'tproxy':
                this.loadTproxyLog();
                break;
        }
    }

    async update() {
        // 首次加载时调用
        this.init();
        await this.loadActiveLog();
    }

    async loadServiceLog() {
        const container = document.getElementById('service-log');
        if (!container) return;

        try {
            const log = await SettingsService.getServiceLog();
            this.renderLog(container, log);
        } catch (error) {
            container.innerHTML = `<span style="color: var(--mdui-color-error);">${I18nService.t('logs.load_failed')}: ${error.message}</span>`;
        }
    }

    async loadXrayLog() {
        const container = document.getElementById('xray-log');
        if (!container) return;

        try {
            const log = await SettingsService.getXrayLog();
            this.renderLog(container, log);
        } catch (error) {
            container.innerHTML = `<span style="color: var(--mdui-color-error);">${I18nService.t('logs.load_failed')}: ${error.message}</span>`;
        }
    }

    async loadTproxyLog() {
        const container = document.getElementById('tproxy-log');
        if (!container) return;

        try {
            const log = await SettingsService.getTproxyLog();
            this.renderLog(container, log);
        } catch (error) {
            container.innerHTML = `<span style="color: var(--mdui-color-error);">${I18nService.t('logs.load_failed')}: ${error.message}</span>`;
        }
    }

    renderLog(container, log) {
        if (!log || log.trim() === '') {
            container.innerHTML = '<span style="color: var(--mdui-color-on-surface-variant); font-style: italic;">No logs available</span>';
            return;
        }

        // 将日志文本转为 HTML，保留换行
        const escapedLog = log
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');

        container.innerHTML = `<pre style="margin: 0; white-space: pre-wrap; word-break: break-all; font-size: 12px; line-height: 1.6;">${escapedLog}</pre>`;

        // 滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    // 导出日志
    async exportLogs() {
        try {
            const result = await SettingsService.exportLogs();
            if (result.success) {
                toast(I18nService.t('logs.saved_to') + result.path);
            } else {
                toast(I18nService.t('logs.save_failed'));
            }
        } catch (error) {
            toast(I18nService.t('logs.save_failed') + ': ' + error.message);
        }
    }

    // 导出日志和配置
    async exportAll() {
        try {
            const result = await SettingsService.exportAll();
            if (result.success) {
                toast(I18nService.t('logs.saved_all_to') + result.path);
            } else {
                toast(I18nService.t('logs.save_failed'));
            }
        } catch (error) {
            toast(I18nService.t('logs.save_failed') + ': ' + error.message);
        }
    }

    // 清空调试日志
    async clearDebugLogs() {
        try {
            await SettingsService.clearDebugLogs();
            toast(I18nService.t('logs.debug_cleared'));
            this.loadActiveLog();
        } catch (error) {
            toast(I18nService.t('logs.unknown_error') + ': ' + error.message);
        }
    }

    // 页面离开时停止自动刷新
    onPageLeave() {
        this.stopAutoRefresh();
        const toggle = document.getElementById('logs-auto-refresh');
        if (toggle) {
            toggle.checked = false;
        }
        this._autoRefreshEnabled = false;
    }
}
