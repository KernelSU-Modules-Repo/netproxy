import { toast } from '../utils/toast.js';
import { KSUService } from '../services/ksu-service.js';
import { setColorScheme } from 'mdui/functions/setColorScheme.js';
import { setTheme } from 'mdui/functions/setTheme.js';
const logoUrl = 'https://ghfast.top/https://raw.githubusercontent.com/Fanju6/NetProxy-Magisk/refs/heads/main/logo.png';

export class SettingsPageManager {
    constructor(ui) {
        this.ui = ui;
        this.routingKeys = [
            'google_cn', 'block_udp443', 'block_ads',
            'bypass_lan_ip', 'bypass_lan_domain',
            'bypass_cn_dns_ip', 'bypass_cn_dns_domain',
            'bypass_cn_ip', 'bypass_cn_domain', 'final_proxy'
        ];
        this.proxyKeys = [
            'proxy_mobile', 'proxy_wifi', 'proxy_hotspot', 'proxy_usb',
            'proxy_tcp', 'proxy_udp', 'proxy_ipv6'
        ];
        this.setupEventListeners();
        this.setupRoutingPage();
        this.setupProxySettingsPage();
        this.setupThemePage();
        this.applyStoredTheme();
    }

    setupEventListeners() {
        // 日志入口
        const logsEntry = document.getElementById('settings-logs-entry');
        if (logsEntry) {
            logsEntry.addEventListener('click', () => {
                this.ui.switchPage('logs');
            });
        }

        // 日志页返回按钮
        const logsBackBtn = document.getElementById('logs-back-btn');
        if (logsBackBtn) {
            logsBackBtn.addEventListener('click', () => {
                this.ui.switchPage('settings');
            });
        }

        // 路由设置入口
        const routingEntry = document.getElementById('settings-routing-entry');
        if (routingEntry) {
            routingEntry.addEventListener('click', () => {
                this.ui.switchPage('routing');
                this.loadRoutingSettings();
            });
        }

        // 代理设置入口
        const proxyEntry = document.getElementById('settings-proxy-entry');
        if (proxyEntry) {
            proxyEntry.addEventListener('click', () => {
                this.ui.switchPage('proxy-settings');
                this.loadProxySettings();
            });
        }

        // 模块设置入口
        const moduleEntry = document.getElementById('settings-module-entry');
        if (moduleEntry) {
            moduleEntry.addEventListener('click', () => {
                this.ui.switchPage('module');
                this.loadModuleSettings();
            });
        }

        // 模块设置页返回按钮
        const moduleBackBtn = document.getElementById('module-back-btn');
        if (moduleBackBtn) {
            moduleBackBtn.addEventListener('click', () => {
                this.ui.switchPage('settings');
            });
        }

        // 模块设置开关
        const autoStartSwitch = document.getElementById('module-auto-start');
        if (autoStartSwitch) {
            autoStartSwitch.addEventListener('change', async (e) => {
                try {
                    await KSUService.setModuleSetting('AUTO_START', e.target.checked);
                    toast(`开机自启已${e.target.checked ? '启用' : '禁用'}`);
                } catch (error) {
                    toast('设置失败: ' + error.message, true);
                    e.target.checked = !e.target.checked;
                }
            });
        }

        const oneplusFixSwitch = document.getElementById('module-oneplus-fix');
        if (oneplusFixSwitch) {
            oneplusFixSwitch.addEventListener('change', async (e) => {
                try {
                    await KSUService.setModuleSetting('ONEPLUS_A16_FIX', e.target.checked);
                    toast(`OnePlus A16 兼容性修复已${e.target.checked ? '启用' : '禁用'}`);
                } catch (error) {
                    toast('设置失败: ' + error.message, true);
                    e.target.checked = !e.target.checked;
                }
            });
        }

        // 主题设置入口
        const themeEntry = document.getElementById('settings-theme');
        if (themeEntry) {
            themeEntry.addEventListener('click', () => {
                this.ui.switchPage('theme');
                this.loadThemeSettings();
            });
        }

        // 关于
        const aboutEntry = document.getElementById('settings-about');
        if (aboutEntry) {
            aboutEntry.addEventListener('click', () => {
                this.showAboutDialog();
            });
        }
    }

    setupRoutingPage() {
        // 返回按钮
        const backBtn = document.getElementById('routing-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.ui.switchPage('settings');
            });
        }

        // 为每个开关绑定事件
        for (const key of this.routingKeys) {
            const switchEl = document.getElementById(`route-${key}`);
            if (switchEl) {
                switchEl.addEventListener('change', async (e) => {
                    const value = e.target.checked;
                    await this.setRoutingSetting(key, value);
                });
            }
        }
    }

    async loadRoutingSettings() {
        try {
            const settings = await KSUService.getRoutingSettings();
            for (const key of this.routingKeys) {
                const switchEl = document.getElementById(`route-${key}`);
                if (switchEl) {
                    switchEl.checked = settings[key] !== false;
                }
            }
        } catch (error) {
            console.error('加载路由设置失败:', error);
        }
    }

    async setRoutingSetting(key, value) {
        try {
            await KSUService.setRoutingSetting(key, value);
            toast(`已${value ? '启用' : '禁用'}`);
        } catch (error) {
            toast('设置失败: ' + error.message);
            // 恢复开关状态
            const switchEl = document.getElementById(`route-${key}`);
            if (switchEl) {
                switchEl.checked = !value;
            }
        }
    }

    // ===================== 代理设置页面 =====================

    setupProxySettingsPage() {
        // 返回按钮
        const backBtn = document.getElementById('proxy-settings-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.ui.switchPage('settings');
            });
        }

        // 为每个开关绑定事件
        for (const key of this.proxyKeys) {
            // key 格式: proxy_mobile -> HTML id: proxy-mobile
            const htmlId = key.replace('_', '-');
            const switchEl = document.getElementById(htmlId);
            if (switchEl) {
                switchEl.addEventListener('change', async (e) => {
                    const value = e.target.checked;
                    await this.setProxySetting(key, value);
                });
            }
        }
    }

    async loadProxySettings() {
        try {
            const settings = await KSUService.getProxySettings();
            for (const key of this.proxyKeys) {
                const htmlId = key.replace('_', '-');
                const switchEl = document.getElementById(htmlId);
                if (switchEl) {
                    switchEl.checked = settings[key] === true;
                }
            }
        } catch (error) {
            console.error('加载代理设置失败:', error);
        }
    }

    async setProxySetting(key, value) {
        try {
            await KSUService.setProxySetting(key, value);
            toast(`已${value ? '启用' : '禁用'}`);
        } catch (error) {
            toast('设置失败: ' + error.message);
            // 恢复开关状态
            const htmlId = key.replace('_', '-');
            const switchEl = document.getElementById(htmlId);
            if (switchEl) {
                switchEl.checked = !value;
            }
        }
    }

    // ===================== 主题页面 =====================

    setupThemePage() {
        // 返回按钮
        const backBtn = document.getElementById('theme-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.ui.switchPage('settings');
            });
        }

        // 模式选择
        const modeGroup = document.getElementById('theme-mode-group');
        if (modeGroup) {
            modeGroup.addEventListener('change', (e) => {
                const mode = e.target.value;
                this.applyThemeMode(mode);
            });
        }

        // 颜色选择
        const colorPalette = document.getElementById('color-palette');
        if (colorPalette) {
            colorPalette.addEventListener('click', (e) => {
                const colorItem = e.target.closest('.color-item');
                if (colorItem) {
                    const color = colorItem.dataset.color;
                    this.applyThemeColor(color);
                    this.updateColorSelection(color);
                }
            });
        }
    }

    loadThemeSettings() {
        const savedTheme = localStorage.getItem('theme') || 'auto';
        const savedColor = localStorage.getItem('themeColor') || '#6750A4';

        // 设置模式选择
        const modeGroup = document.getElementById('theme-mode-group');
        if (modeGroup) {
            modeGroup.value = savedTheme;
        }

        // 设置颜色选择
        this.updateColorSelection(savedColor);
    }

    updateColorSelection(selectedColor) {
        const colorItems = document.querySelectorAll('.color-item');
        colorItems.forEach(item => {
            if (item.dataset.color === selectedColor) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    applyThemeMode(mode) {
        localStorage.setItem('theme', mode);
        setTheme(mode);
        toast(`已切换到${mode === 'auto' ? '自动' : mode === 'light' ? '浅色' : '深色'}模式`);
    }

    applyThemeColor(color) {
        localStorage.setItem('themeColor', color);
        setColorScheme(color);
        toast('主题色已更改');
    }

    applyStoredTheme() {
        // 应用存储的主题模式
        const savedTheme = localStorage.getItem('theme') || 'auto';
        setTheme(savedTheme);

        // 应用存储的主题色
        const savedColor = localStorage.getItem('themeColor');
        if (savedColor) {
            setColorScheme(savedColor);
        }
    }


    showAboutDialog() {
        const dialog = document.createElement('mdui-dialog');
        dialog.headline = '关于 NetProxy';
        dialog.innerHTML = `
            <div style="text-align: center; padding: 16px 0;">
                <img src="${logoUrl}" alt="NetProxy" style="width: 72px; height: 72px; border-radius: 16px;">
                <h2 style="margin: 16px 0 8px;">NetProxy</h2>
                <p style="color: var(--mdui-color-on-surface-variant); margin: 0;">Android 系统级 Xray 透明代理模块</p>
                <p style="margin-top: 16px;">
                    <mdui-chip icon="code">Xray Core</mdui-chip>
                    <mdui-chip icon="android">Magisk / KernelSU</mdui-chip>
                </p>
            </div>
            <mdui-divider></mdui-divider>
            <mdui-list>
                <mdui-list-item id="about-github">
                    GitHub
                    <mdui-icon slot="end-icon" name="content_copy"></mdui-icon>
                </mdui-list-item>
                <mdui-list-item id="about-telegram">
                    Telegram 群组
                    <mdui-icon slot="end-icon" name="content_copy"></mdui-icon>
                </mdui-list-item>
            </mdui-list>
            <mdui-button slot="action" variant="text">关闭</mdui-button>
        `;

        document.body.appendChild(dialog);
        dialog.open = true;

        dialog.querySelector('#about-github')?.addEventListener('click', () => {
            navigator.clipboard.writeText('https://github.com/Fanju6/NetProxy-Magisk');
            toast('GitHub 链接已复制');
        });

        dialog.querySelector('#about-telegram')?.addEventListener('click', () => {
            navigator.clipboard.writeText('https://t.me/NetProxy_Magisk');
            toast('Telegram 链接已复制');
        });

        dialog.querySelector('mdui-button').addEventListener('click', () => {
            dialog.open = false;
            setTimeout(() => dialog.remove(), 300);
        });

        dialog.addEventListener('closed', () => {
            setTimeout(() => dialog.remove(), 300);
        });
    }

    // 加载模块设置
    async loadModuleSettings() {
        try {
            const settings = await KSUService.getModuleSettings();

            const autoStartSwitch = document.getElementById('module-auto-start');
            if (autoStartSwitch) {
                autoStartSwitch.checked = settings.auto_start;
            }

            const oneplusFixSwitch = document.getElementById('module-oneplus-fix');
            if (oneplusFixSwitch) {
                oneplusFixSwitch.checked = settings.oneplus_a16_fix;
            }
        } catch (error) {
            console.error('Failed to load module settings:', error);
        }
    }

}
