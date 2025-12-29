import { toast } from '../utils/toast.js';
import { KSUService } from '../services/ksu-service.js';
import logoUrl from '../assets/logo.png';

export class SettingsPageManager {
    constructor(ui) {
        this.ui = ui;
        this.routingKeys = [
            'google_cn', 'block_udp443', 'block_ads',
            'bypass_lan_ip', 'bypass_lan_domain',
            'bypass_cn_dns_ip', 'bypass_cn_dns_domain',
            'bypass_cn_ip', 'bypass_cn_domain', 'final_proxy'
        ];
        this.setupEventListeners();
        this.setupRoutingPage();
        this.updateThemeText();
    }

    setupEventListeners() {
        // 日志入口
        const logsEntry = document.getElementById('settings-logs-entry');
        if (logsEntry) {
            logsEntry.addEventListener('click', () => {
                this.ui.switchPage('logs');
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

        // 主题设置
        const themeEntry = document.getElementById('settings-theme');
        if (themeEntry) {
            themeEntry.addEventListener('click', () => {
                this.showThemeDialog();
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

    updateThemeText() {
        const themeText = document.getElementById('current-theme-text');
        if (themeText) {
            const savedTheme = localStorage.getItem('theme') || 'auto';
            const themeNames = {
                'auto': '自动',
                'light': '浅色',
                'dark': '深色'
            };
            themeText.textContent = themeNames[savedTheme] || '自动';
        }
    }

    showThemeDialog() {
        const savedTheme = localStorage.getItem('theme') || 'auto';

        // 创建主题选择对话框
        const dialog = document.createElement('mdui-dialog');
        dialog.headline = '选择主题';
        dialog.innerHTML = `
            <mdui-radio-group value="${savedTheme}" id="theme-radio-group">
                <mdui-radio value="auto">自动（跟随系统）</mdui-radio>
                <mdui-radio value="light">浅色</mdui-radio>
                <mdui-radio value="dark">深色</mdui-radio>
            </mdui-radio-group>
            <mdui-button slot="action" variant="text" id="theme-cancel">取消</mdui-button>
            <mdui-button slot="action" variant="filled" id="theme-confirm">确定</mdui-button>
        `;

        document.body.appendChild(dialog);
        dialog.open = true;

        const radioGroup = dialog.querySelector('#theme-radio-group');

        dialog.querySelector('#theme-cancel').addEventListener('click', () => {
            dialog.open = false;
            setTimeout(() => dialog.remove(), 300);
        });

        dialog.querySelector('#theme-confirm').addEventListener('click', () => {
            const newTheme = radioGroup.value;
            this.applyTheme(newTheme);
            dialog.open = false;
            setTimeout(() => dialog.remove(), 300);
        });

        dialog.addEventListener('closed', () => {
            setTimeout(() => dialog.remove(), 300);
        });
    }

    applyTheme(theme) {
        localStorage.setItem('theme', theme);

        const html = document.documentElement;
        html.classList.remove('mdui-theme-light', 'mdui-theme-dark', 'mdui-theme-auto');

        if (theme === 'light') {
            html.classList.add('mdui-theme-light');
        } else if (theme === 'dark') {
            html.classList.add('mdui-theme-dark');
        } else {
            html.classList.add('mdui-theme-auto');
        }

        this.updateThemeText();
        toast('主题已更改');
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
}
