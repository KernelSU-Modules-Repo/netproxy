import { setTheme } from 'mdui';
import { StatusService } from '../services/status-service.js';
import { SettingsService } from '../services/settings-service.js';
import { I18nService } from '../i18n/i18n-service.js';
import { toast } from '../utils/toast.js';
import { StatusPageManager } from './status-page.js';
import { ConfigPageManager } from './config-page.js';
import { AppPageManager } from './app-page.js';
import { LogsPageManager } from './logs-page.js';
import { SettingsPageManager } from './settings-page.js';

/**
 * UI 核心管理器
 */
export class UI {
    constructor() {
        this.currentPage = 'status';
        // 从localStorage读取主题，如果不存在则使用auto
        this.currentTheme = localStorage.getItem('theme') || 'auto';

        // 初始化页面管理器
        this.statusPage = new StatusPageManager(this);
        this.configPage = new ConfigPageManager(this);
        this.appPage = new AppPageManager(this);
        this.logsPage = new LogsPageManager(this);
        this.settingsPage = new SettingsPageManager(this);

        // 立即应用主题，避免闪烁
        this.applyTheme(this.currentTheme);

        this.init();
    }

    init() {
        // 初始化多语言服务
        I18nService.init();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeMDUI();
            });
        } else {
            this.initializeMDUI();
        }

        this.setupNavigation();
        this.setupFAB();
        this.setupThemeToggle();
        this.setupDialogs();
        this.setupAppSelector();
        this.appPage.init();
        this.statusPage.setupModeButtons();
        this.logsPage.init();

        try {
            this.updateAllPages();
        } catch (error) {
            console.error('ERROR calling updateAllPages():', error);
        }

        setInterval(() => {
            const statusPage = document.getElementById('status-page');
            if (statusPage && statusPage.classList.contains('active')) {
                this.statusPage.update();
            }
        }, 5000);

        setTimeout(() => {
            const latencyBtn = document.getElementById('refresh-latency-btn');
            if (latencyBtn) {
                latencyBtn.addEventListener('click', () => {
                    latencyBtn.disabled = true;
                    latencyBtn.loading = true;
                    setTimeout(() => {
                        this.statusPage.refreshLatency();
                    }, 50);
                });
            }
        }, 100);
    }

    initializeMDUI() {
        const requiredComponents = ['mdui-layout', 'mdui-top-app-bar', 'mdui-card', 'mdui-button'];
        requiredComponents.forEach(component => {
            if (!customElements.get(component)) {
                console.warn(`⚠️ Component ${component} is not defined yet`);
            }
        });
    }

    setupNavigation() {
        const navBar = document.getElementById('nav-bar');
        navBar.addEventListener('change', (e) => {
            const pageName = e.target.value;
            this.switchPage(pageName);
        });

        const clearDebugBtn = document.getElementById('clear-debug-btn');
        if (clearDebugBtn) {
            clearDebugBtn.addEventListener('click', () => {
                if (typeof debugLogger !== 'undefined') {
                    debugLogger.clear();
                }
                toast(I18nService.t('logs.debug_cleared'));
            });
        }
    }

    switchPage(pageName) {
        // Handle page leave events
        if (this.currentPage === 'logs' && pageName !== 'logs') {
            this.logsPage.onPageLeave();
        }

        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(`${pageName}-page`).classList.add('active');
        this.currentPage = pageName;

        // 更新 FAB 可见性
        const fabContainer = document.getElementById('dashboard-fab');
        if (fabContainer) {
            fabContainer.style.display = pageName === 'status' ? 'block' : 'none';
        }

        // 延迟执行更新，让导航栏动画完全完成
        // MDUI 导航栏动画大约需要 200ms 完成
        setTimeout(() => {
            if (pageName === 'status') this.statusPage.update();
            if (pageName === 'config') this.configPage.update();
            if (pageName === 'uid') this.appPage.update();
            if (pageName === 'logs') this.logsPage.update();
            if (pageName === 'debug' && typeof debugLogger !== 'undefined') {
                debugLogger.updateUI();
            }
        }, 200);
    }

    setupFAB() {
        const fab = document.getElementById('service-fab');
        if (!fab) {
            console.warn('FAB element not found');
            return;
        }

        fab.addEventListener('click', async (e) => {
            e.stopPropagation(); // 防止事件冒泡

            // 防止重复点击
            if (fab.loading) return;
            fab.loading = true;

            try {
                // 如果当前显示为运行中（有 running 类），则意图是停止；否则是启动
                const fabContainer = document.getElementById('dashboard-fab');
                const isRunning = fabContainer && fabContainer.classList.contains('running');

                // 显示加载状态
                fab.icon = 'hourglass_empty';

                if (isRunning) {
                    const success = await StatusService.stopService();
                    if (!success) {
                        toast(I18nService.t('status.service_stop_timeout'));
                    }
                } else {
                    const success = await StatusService.startService();
                    if (!success) {
                        toast(I18nService.t('status.service_start_timeout'));
                    }
                }

                await this.statusPage.update();
            } catch (error) {
                console.error('FAB error:', error);
                toast(I18nService.t('common.operation_failed') + error.message);
            } finally {
                fab.loading = false;
            }
        });
    }

    setupThemeToggle() {
        const themeBtn = document.getElementById('theme-toggle');
        this.applyTheme(this.currentTheme);

        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const themes = ['light', 'dark', 'auto'];
                const currentIndex = themes.indexOf(this.currentTheme);
                this.currentTheme = themes[(currentIndex + 1) % themes.length];
                localStorage.setItem('theme', this.currentTheme);
                this.applyTheme(this.currentTheme);
                const modeName = this.currentTheme === 'auto' ? I18nService.t('settings.theme.mode_auto') : this.currentTheme === 'light' ? I18nService.t('settings.theme.mode_light') : I18nService.t('settings.theme.mode_dark');
                toast(I18nService.t('settings.theme.toast_mode_switched') + modeName);
            });
        }
    }

    applyTheme(theme) {
        const html = document.documentElement;

        // 首先移除所有主题类
        html.classList.remove('mdui-theme-light', 'mdui-theme-dark', 'mdui-theme-auto');

        // 添加对应的主题类
        html.classList.add(`mdui-theme-${theme}`);

        // 同时调用MDUI的setTheme确保组件内部状态正确
        setTheme(theme);
    }

    setupDialogs() {
        const importMenu = document.getElementById('import-menu');

        document.getElementById('import-node-link').addEventListener('click', () => {
            importMenu.open = false;
            document.getElementById('node-link-dialog').open = true;
        });

        document.getElementById('import-full-config').addEventListener('click', () => {
            importMenu.open = false;
            this.showConfigDialog();
        });

        document.getElementById('node-link-cancel').addEventListener('click', () => {
            document.getElementById('node-link-dialog').open = false;
        });

        document.getElementById('node-link-save').addEventListener('click', async () => {
            await this.configPage.importNodeLink();
        });

        // 订阅对话框事件
        document.getElementById('import-subscription').addEventListener('click', () => {
            importMenu.open = false;
            document.getElementById('subscription-dialog').open = true;
        });

        document.getElementById('subscription-cancel').addEventListener('click', () => {
            document.getElementById('subscription-dialog').open = false;
        });

        document.getElementById('subscription-save').addEventListener('click', async () => {
            await this.configPage.saveSubscription();
        });

        document.getElementById('config-cancel-btn').addEventListener('click', () => {
            document.getElementById('config-dialog').open = false;
        });

        document.getElementById('uid-cancel-btn').addEventListener('click', () => {
            document.getElementById('uid-dialog').open = false;
        });

        document.getElementById('config-save-btn').addEventListener('click', async () => {
            await this.configPage.saveConfig();
        });

        document.getElementById('app-selector-cancel').addEventListener('click', () => {
            document.getElementById('app-selector-dialog').open = false;
        });

        document.getElementById('app-selector-search').addEventListener('input', (e) => {
            this.appPage.filterApps(e.target.value);
        });

        // Refresh button handlers removed - now using tab-based auto-load

        const checkUpdateBtn = document.getElementById('check-update-btn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => {
                checkUpdateBtn.disabled = true;
                checkUpdateBtn.loading = true;

                setTimeout(async () => {
                    try {
                        const result = await SettingsService.updateXray();

                        if (result.success) {
                            toast(result.message);
                            if (!result.isLatest) {
                                setTimeout(() => this.statusPage.update(), 1500);
                            }
                        } else {
                            toast(I18nService.t('common.update_failed') + (result.error || result.message));
                        }
                    } catch (error) {
                        toast(I18nService.t('common.check_failed') + error.message);
                    } finally {
                        checkUpdateBtn.disabled = false;
                        checkUpdateBtn.loading = false;
                    }
                }, 50);
            });
        }
    }

    setupAppSelector() {
        try {
            const addAppBtn = document.getElementById('add-uid-btn');

            if (addAppBtn) {
                addAppBtn.addEventListener('click', () => {
                    this.appPage.showAppSelector();
                });
            }
        } catch (error) {
            console.error('>> setupAppSelector: ERROR -', error);
        }
    }

    async confirm(message) {
        return new Promise((resolve) => {
            const dialog = document.getElementById('confirm-dialog');
            const messageEl = document.getElementById('confirm-message');
            const okBtn = document.getElementById('confirm-ok-btn');
            const cancelBtn = document.getElementById('confirm-cancel-btn');

            if (!dialog || !messageEl || !okBtn || !cancelBtn) {
                resolve(false);
                return;
            }

            messageEl.innerHTML = message.replace(/\n/g, '<br>');

            const newOkBtn = okBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOkBtn, okBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

            newOkBtn.addEventListener('click', () => {
                dialog.open = false;
                resolve(true);
            });

            newCancelBtn.addEventListener('click', () => {
                dialog.open = false;
                resolve(false);
            });

            dialog.open = true;
        });
    }

    /**
     * 显示骨架屏加载动画
     * @param {HTMLElement} container - 容器元素
     * @param {number} count - 骨架项数量
     * @param {Object} options - 配置选项
     * @param {boolean} options.showIcon - 是否显示圆形图标占位符（默认 true，适用于应用列表）
     */
    showSkeleton(container, count = 3, options = {}) {
        const { showIcon = true } = options;
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const item = document.createElement('mdui-list-item');
            if (showIcon) {
                // 带图标的骨架屏（适用于应用列表）
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 0;">
                        <div class="skeleton skeleton-circle" style="width: 40px; height: 40px;"></div>
                        <div style="flex: 1;">
                            <div class="skeleton skeleton-text" style="width: 60%; height: 16px; margin-bottom: 8px;"></div>
                            <div class="skeleton skeleton-text" style="width: 40%; height: 12px;"></div>
                        </div>
                    </div>
                `;
            } else {
                // 不带图标的骨架屏（适用于配置文件列表）
                item.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 12px 0;">
                        <div class="skeleton skeleton-text" style="width: 50%; height: 16px;"></div>
                        <div class="skeleton skeleton-text" style="width: 70%; height: 12px;"></div>
                    </div>
                `;
            }
            container.appendChild(item);
        }
    }

    updateAllPages() {
        try {
            this.statusPage.update();
        } catch (error) {
            console.error('Error in updateAllPages:', error);
        }
    }

    async showConfigDialog(filename = null) {
        await this.configPage.showDialog(filename);
    }
}
