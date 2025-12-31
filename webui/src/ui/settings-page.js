import { toast } from '../utils/toast.js';
import { KSUService } from '../services/ksu-service.js';
import { setColorScheme } from 'mdui/functions/setColorScheme.js';
import { setTheme } from 'mdui/functions/setTheme.js';
const logoUrl = 'https://ghfast.top/https://raw.githubusercontent.com/Fanju6/NetProxy-Magisk/refs/heads/main/logo.png';

export class SettingsPageManager {
    constructor(ui) {
        this.ui = ui;
        this.routingRules = [];
        this.editingRuleIndex = -1;
        this.proxyKeys = [
            'proxy_mobile', 'proxy_wifi', 'proxy_hotspot', 'proxy_usb',
            'proxy_tcp', 'proxy_udp', 'proxy_ipv6'
        ];
        this.setupEventListeners();
        this.setupRoutingRulesPage();
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
                this.loadRoutingRules();
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

                    // 如果启用，立即执行修复脚本
                    if (e.target.checked) {
                        await KSUService.executeOneplusFix();
                        toast('OnePlus A16 兼容性修复已执行');
                    } else {
                        toast('OnePlus A16 兼容性修复已禁用');
                    }
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

    // ===================== 路由规则管理 =====================

    setupRoutingRulesPage() {
        // 返回按钮
        const backBtn = document.getElementById('routing-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.ui.switchPage('settings');
            });
        }

        // 添加规则按钮
        const addBtn = document.getElementById('add-routing-rule-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.showRuleDialog();
            });
        }

        // 规则对话框事件
        const cancelBtn = document.getElementById('rule-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.getElementById('routing-rule-dialog').open = false;
            });
        }

        const saveBtn = document.getElementById('rule-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveRule();
            });
        }
    }

    async loadRoutingRules() {
        try {
            this.routingRules = await KSUService.getRoutingRules();
            this.renderRoutingRules();
        } catch (error) {
            console.error('加载路由规则失败:', error);
            toast('加载路由规则失败');
        }
    }

    renderRoutingRules() {
        const listEl = document.getElementById('routing-rules-list');
        if (!listEl) return;

        listEl.innerHTML = '';

        if (this.routingRules.length === 0) {
            listEl.innerHTML = `
                <mdui-list-item>
                    <span slot="description">暂无规则，点击右上角添加</span>
                </mdui-list-item>
            `;
            return;
        }

        this.routingRules.forEach((rule, index) => {
            const item = document.createElement('mdui-list-item');

            // 构建描述
            const parts = [];
            if (rule.domain) parts.push(`域名: ${rule.domain}`);
            if (rule.ip) parts.push(`IP: ${rule.ip}`);
            if (rule.port) parts.push(`端口: ${rule.port}`);
            if (rule.network) parts.push(`网络: ${rule.network}`);
            if (rule.protocol) parts.push(`协议: ${rule.protocol}`);

            const description = parts.length > 0 ? parts.join(' | ') : '无条件';
            const outboundLabel = { proxy: '代理', direct: '直连', block: '阻断' }[rule.outboundTag] || rule.outboundTag;

            item.setAttribute('headline', rule.name || `规则 ${index + 1}`);

            // 使用 description slot 显示详情和出站
            const descDiv = document.createElement('div');
            descDiv.slot = 'description';
            descDiv.style.cssText = 'display: flex; justify-content: space-between; width: 100%;';

            const descSpan = document.createElement('span');
            descSpan.textContent = description;
            descSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;';

            const outboundSpan = document.createElement('span');
            outboundSpan.textContent = outboundLabel;
            outboundSpan.style.cssText = 'margin-left: 8px; padding: 2px 6px; border-radius: 4px; font-size: 11px; background: var(--mdui-color-secondary-container); color: var(--mdui-color-on-secondary-container);';

            descDiv.appendChild(descSpan);
            descDiv.appendChild(outboundSpan);
            item.appendChild(descDiv);

            // 右侧容器：开关和菜单
            const endContainer = document.createElement('div');
            endContainer.slot = 'end-icon';
            endContainer.style.cssText = 'display: flex; align-items: center; gap: 4px;';

            // 启用开关
            const switchEl = document.createElement('mdui-switch');
            switchEl.checked = rule.enabled !== false;
            switchEl.addEventListener('change', async (e) => {
                e.stopPropagation();
                rule.enabled = e.target.checked;
                await this.saveRulesToBackend();
            });
            endContainer.appendChild(switchEl);

            // 菜单
            const dropdown = document.createElement('mdui-dropdown');
            dropdown.setAttribute('placement', 'bottom-end');

            const menuBtn = document.createElement('mdui-button-icon');
            menuBtn.setAttribute('slot', 'trigger');
            menuBtn.setAttribute('icon', 'more_vert');
            menuBtn.addEventListener('click', (e) => e.stopPropagation());
            dropdown.appendChild(menuBtn);

            const menu = document.createElement('mdui-menu');

            // 编辑
            const editItem = document.createElement('mdui-menu-item');
            editItem.innerHTML = '<mdui-icon slot="icon" name="edit"></mdui-icon>编辑';
            editItem.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.open = false;
                this.showRuleDialog(rule, index);
            });
            menu.appendChild(editItem);

            // 删除
            const deleteItem = document.createElement('mdui-menu-item');
            deleteItem.innerHTML = '<mdui-icon slot="icon" name="delete"></mdui-icon>删除';
            deleteItem.style.color = 'var(--mdui-color-error)';
            deleteItem.addEventListener('click', async (e) => {
                e.stopPropagation();
                dropdown.open = false;
                if (await this.ui.confirm(`确定要删除规则 "${rule.name || `规则 ${index + 1}`}" 吗？`)) {
                    this.routingRules.splice(index, 1);
                    await this.saveRulesToBackend();
                    this.renderRoutingRules();
                }
            });
            menu.appendChild(deleteItem);

            dropdown.appendChild(menu);
            endContainer.appendChild(dropdown);
            item.appendChild(endContainer);

            listEl.appendChild(item);
        });
    }

    showRuleDialog(rule = null, index = -1) {
        this.editingRuleIndex = index;
        const dialog = document.getElementById('routing-rule-dialog');

        // 设置标题
        dialog.headline = rule ? '编辑规则' : '添加规则';

        // 填充表单
        document.getElementById('rule-name').value = rule?.name || '';
        document.getElementById('rule-domain').value = rule?.domain || '';
        document.getElementById('rule-ip').value = rule?.ip || '';
        document.getElementById('rule-port').value = rule?.port || '';
        document.getElementById('rule-protocol').value = rule?.protocol || '';
        document.getElementById('rule-network').value = rule?.network || '';
        document.getElementById('rule-outbound').value = rule?.outboundTag || 'proxy';

        dialog.open = true;
    }

    async saveRule() {
        const name = document.getElementById('rule-name').value.trim();
        const domain = document.getElementById('rule-domain').value.trim();
        const ip = document.getElementById('rule-ip').value.trim();
        const port = document.getElementById('rule-port').value.trim();
        const protocol = document.getElementById('rule-protocol').value.trim();
        const network = document.getElementById('rule-network').value.trim();
        const outboundTag = document.getElementById('rule-outbound').value;

        // 验证
        if (!domain && !ip && !port && !protocol && !network) {
            toast('请至少填写一个匹配条件');
            return;
        }

        const rule = {
            name: name || (this.editingRuleIndex >= 0 ? `规则 ${this.editingRuleIndex + 1}` : `规则 ${this.routingRules.length + 1}`),
            type: 'field',
            domain,
            ip,
            port,
            protocol,
            network,
            outboundTag,
            enabled: true
        };

        if (this.editingRuleIndex >= 0) {
            // 保留原有的 enabled 状态
            rule.enabled = this.routingRules[this.editingRuleIndex].enabled !== false;
            this.routingRules[this.editingRuleIndex] = rule;
        } else {
            this.routingRules.push(rule);
        }

        await this.saveRulesToBackend();
        this.renderRoutingRules();
        document.getElementById('routing-rule-dialog').open = false;
        toast(this.editingRuleIndex >= 0 ? '规则已更新' : '规则已添加');
    }

    async saveRulesToBackend() {
        try {
            await KSUService.saveRoutingRules(this.routingRules);
            await KSUService.applyRoutingRules(this.routingRules);
        } catch (error) {
            console.error('保存规则失败:', error);
            toast('保存失败: ' + error.message);
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

        // 代理模式选择器
        const proxyModeGroup = document.getElementById('proxy-mode-settings');
        if (proxyModeGroup) {
            proxyModeGroup.addEventListener('change', async (e) => {
                const value = e.target.value;
                await this.setProxyMode(value);
            });
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

            // 加载代理模式
            const proxyMode = await KSUService.getProxyMode();
            const proxyModeGroup = document.getElementById('proxy-mode-settings');
            const proxyModeDesc = document.getElementById('proxy-mode-desc-settings');
            if (proxyModeGroup) {
                proxyModeGroup.value = String(proxyMode);
            }
            if (proxyModeDesc) {
                this.updateProxyModeDesc(proxyMode);
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

    async setProxyMode(value) {
        try {
            await KSUService.setProxyMode(value);
            this.updateProxyModeDesc(value);
            const modeNames = { '0': '自动', '1': 'TPROXY', '2': 'REDIRECT' };
            toast(`代理模式已设为: ${modeNames[value] || value}`);
        } catch (error) {
            toast('设置代理模式失败: ' + error.message);
        }
    }

    updateProxyModeDesc(mode) {
        const desc = document.getElementById('proxy-mode-desc-settings');
        if (!desc) return;
        const descs = {
            '0': '自动检测最佳代理方式',
            '1': '强制使用 TPROXY 透明代理',
            '2': '强制使用 REDIRECT 重定向'
        };
        desc.textContent = descs[String(mode)] || descs['0'];
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

        // 莫奈取色开关
        this.setupMonetToggle();
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

        // 设置莫奈取色开关状态
        this.updateMonetToggleState();
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
        this.updateMonetToggleState();
        toast(`已切换到${mode === 'auto' ? '自动' : mode === 'light' ? '浅色' : '深色'}模式`);
    }

    applyThemeColor(color) {
        localStorage.setItem('themeColor', color);
        
        const monetEnabled = localStorage.getItem('monetEnabled') === 'true';
        const savedTheme = localStorage.getItem('theme') || 'auto';
        const isAutoMode = savedTheme === 'auto';
        
        if (isAutoMode && !monetEnabled) {
            const root = document.documentElement;
            root.style.setProperty('--monet-primary', color);
            root.style.setProperty('--monet-primary-container', color + '30');
            root.style.setProperty('--monet-on-primary', '#ffffff');
            root.style.setProperty('--monet-on-primary-container', color);
            root.style.setProperty('--monet-secondary-container', color + '30');
            root.style.setProperty('--monet-on-secondary-container', color);
        }
        
        setColorScheme(color);
        this.updateMonetToggleState();
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

        // 应用莫奈取色设置
        const savedMonet = localStorage.getItem('monetEnabled');
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const html = document.documentElement;

        if (savedMonet === 'true' && savedTheme === 'auto') {
            html.classList.add('mdui-theme-auto');
            html.classList.remove('mdui-theme-light', 'mdui-theme-dark');
        } else if (savedTheme === 'auto') {
            html.classList.remove('mdui-theme-auto');
            html.classList.add(isDark ? 'mdui-theme-dark' : 'mdui-theme-light');

            // 自动模式 + 莫奈取色关闭：手动设置 Monet 变量以应用用户选择的主题色
            if (savedColor) {
                html.style.setProperty('--monet-primary', savedColor);
                html.style.setProperty('--monet-primary-container', savedColor + '30');
                html.style.setProperty('--monet-on-primary', '#ffffff');
                html.style.setProperty('--monet-on-primary-container', savedColor);
                html.style.setProperty('--monet-secondary-container', savedColor + '30');
                html.style.setProperty('--monet-on-secondary-container', savedColor);
            }
        }
    }

    setupMonetToggle() {
        const monetToggle = document.getElementById('monet-toggle');
        if (!monetToggle) return;

        monetToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('monetEnabled', enabled);
            this.applyMonetSetting(enabled);
            toast(`莫奈取色已${enabled ? '启用' : '禁用'}`);
        });
    }

    updateMonetToggleState() {
        const savedTheme = localStorage.getItem('theme') || 'auto';
        const monetToggle = document.getElementById('monet-toggle');
        const savedMonet = localStorage.getItem('monetEnabled');

        if (monetToggle) {
            if (savedTheme === 'auto') {
                monetToggle.disabled = false;
                if (savedMonet !== null) {
                    monetToggle.checked = savedMonet === 'true';
                } else {
                    monetToggle.checked = true;
                }
                this.applyMonetSetting(monetToggle.checked);
            } else {
                monetToggle.disabled = true;
                monetToggle.checked = false;
            }
        }
    }

    applyMonetSetting(enabled) {
        const html = document.documentElement;
        const savedColor = localStorage.getItem('themeColor') || '#6750A4';
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (enabled) {
            html.classList.add('mdui-theme-auto');
            html.classList.remove('mdui-theme-light', 'mdui-theme-dark');
            html.style.removeProperty('--monet-primary');
            html.style.removeProperty('--monet-primary-container');
            html.style.removeProperty('--monet-on-primary');
            html.style.removeProperty('--monet-on-primary-container');
            html.style.removeProperty('--monet-secondary-container');
            html.style.removeProperty('--monet-on-secondary-container');
            setColorScheme(savedColor);
        } else {
            html.classList.remove('mdui-theme-auto');
            html.classList.add(isDark ? 'mdui-theme-dark' : 'mdui-theme-light');
            html.style.setProperty('--monet-primary', savedColor);
            html.style.setProperty('--monet-primary-container', savedColor + '30');
            html.style.setProperty('--monet-on-primary', '#ffffff');
            html.style.setProperty('--monet-on-primary-container', savedColor);
            html.style.setProperty('--monet-secondary-container', savedColor + '30');
            html.style.setProperty('--monet-on-secondary-container', savedColor);
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
                    <mdui-icon slot="icon" class="mdui-color-on-surface-variant" style="width: 24px; height: 24px;">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                    </mdui-icon>
                    GitHub
                </mdui-list-item>
                <mdui-list-item id="about-telegram">
                    <mdui-icon slot="icon" class="mdui-color-on-surface-variant" style="width: 24px; height: 24px;">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.696.064-1.225-.46-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.099.034.323.019.498z"/>
                        </svg>
                    </mdui-icon>
                    Telegram 群组
                </mdui-list-item>
            </mdui-list>
            <mdui-button slot="action" variant="text">关闭</mdui-button>
        `;

        document.body.appendChild(dialog);
        requestAnimationFrame(() => {
            dialog.open = true;
        });

        dialog.querySelector('#about-github')?.addEventListener('click', () => {
            KSUService.openExternalUrl('https://github.com/Fanju6/NetProxy-Magisk');
        });

        dialog.querySelector('#about-telegram')?.addEventListener('click', () => {
            KSUService.openExternalUrl('https://t.me/NetProxy_Magisk');
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
