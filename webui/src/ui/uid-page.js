import { KSUService } from '../services/ksu-service.js';
import { toast } from '../utils/toast.js';

/**
 * 代理设置页面管理器
 */
export class UIDPageManager {
    constructor(ui) {
        this.ui = ui;
        this.allApps = [];
        this.proxyMode = 'blacklist';
        this.proxyApps = [];
    }

    async init() {
        // 绑定模式切换事件
        const modeSwitch = document.getElementById('proxy-mode-switch');
        if (modeSwitch) {
            modeSwitch.addEventListener('change', async (e) => {
                const newMode = e.target.value;
                await this.setProxyMode(newMode);
            });
        }
    }

    async update() {
        try {
            const listEl = document.getElementById('uid-list');
            const modeSwitch = document.getElementById('proxy-mode-switch');
            const modeDesc = document.getElementById('proxy-mode-desc');
            const listTitle = document.getElementById('proxy-list-title');

            // 显示骨架屏
            const currentCount = listEl.children.length > 0 ? listEl.children.length : 1;
            this.ui.showSkeleton(listEl, currentCount);

            // 获取代理模式
            this.proxyMode = await KSUService.getProxyMode();

            // 更新模式开关和描述
            if (modeSwitch) {
                modeSwitch.value = this.proxyMode;
            }

            if (modeDesc) {
                if (this.proxyMode === 'blacklist') {
                    modeDesc.textContent = '黑名单模式：代理所有应用，排除列表中的应用';
                } else {
                    modeDesc.textContent = '白名单模式：仅代理列表中的应用';
                }
            }

            if (listTitle) {
                listTitle.textContent = this.proxyMode === 'blacklist' ? '排除应用' : '代理应用';
            }

            // 获取代理应用列表
            this.proxyApps = await KSUService.getProxyApps();

            if (this.proxyApps.length === 0) {
                const emptyText = this.proxyMode === 'blacklist'
                    ? '暂无排除应用，所有应用都会走代理'
                    : '暂无代理应用，点击上方按钮添加';
                listEl.innerHTML = `<mdui-list-item><div slot="headline">${emptyText}</div></mdui-list-item>`;
                return;
            }

            // 获取所有应用信息以便匹配包名
            let allApps = [];
            try {
                allApps = await KSUService.getInstalledApps();
            } catch (e) {
                console.warn('Failed to load app info:', e);
            }

            // 创建包名到应用的映射
            const pkgToApp = {};
            allApps.forEach(app => {
                pkgToApp[app.packageName] = app;
            });

            // 图标懒加载观察器
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const item = entry.target;
                        const img = item.querySelector('img.app-icon[data-package-name]');
                        if (img) {
                            const packageName = img.dataset.packageName;
                            if (packageName && !img.src) {
                                KSUService.loadAppIcon(packageName).then(base64 => {
                                    if (base64) {
                                        img.src = base64;
                                        img.style.display = 'block';
                                        const placeholder = item.querySelector('mdui-icon[slot="icon"]');
                                        if (placeholder) {
                                            placeholder.style.display = 'none';
                                        }
                                    }
                                });
                            }
                        }
                        observer.unobserve(item);
                    }
                });
            }, {
                rootMargin: '100px',
                threshold: 0.1
            });

            listEl.innerHTML = '';
            this.proxyApps.forEach(packageName => {
                const item = document.createElement('mdui-list-item');
                const app = pkgToApp[packageName];

                if (app) {
                    item.setAttribute('headline', app.appLabel);
                    item.setAttribute('description', packageName);

                    if (app.icon) {
                        const iconEl = document.createElement('img');
                        iconEl.slot = 'icon';
                        iconEl.className = 'app-icon';
                        iconEl.src = app.icon;
                        iconEl.onerror = function () {
                            this.style.display = 'none';
                            const icon = document.createElement('mdui-icon');
                            icon.slot = 'icon';
                            icon.setAttribute('name', 'android');
                            this.parentElement.insertBefore(icon, this);
                        };
                        item.appendChild(iconEl);
                    } else {
                        const icon = document.createElement('mdui-icon');
                        icon.slot = 'icon';
                        icon.setAttribute('name', 'android');
                        item.appendChild(icon);

                        const iconEl = document.createElement('img');
                        iconEl.slot = 'icon';
                        iconEl.className = 'app-icon';
                        iconEl.dataset.packageName = packageName;
                        iconEl.style.display = 'none';
                        item.appendChild(iconEl);
                        observer.observe(item);
                    }
                } else {
                    item.setAttribute('headline', packageName);
                    item.setAttribute('description', '未安装或无法识别');
                    item.setAttribute('icon', 'android');
                }

                // 添加删除按钮
                const deleteBtn = document.createElement('mdui-button-icon');
                deleteBtn.slot = 'end-icon';
                deleteBtn.setAttribute('icon', 'delete');
                deleteBtn.style.color = 'var(--mdui-color-error)';
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const appName = app ? app.appLabel : packageName;
                    await this.removeApp(packageName, appName);
                });
                item.appendChild(deleteBtn);

                listEl.appendChild(item);
            });
        } catch (error) {
            console.error('Update proxy page failed:', error);
        }
    }

    async setProxyMode(mode) {
        try {
            await KSUService.setProxyMode(mode);
            this.proxyMode = mode;

            // 更新 UI
            const modeDesc = document.getElementById('proxy-mode-desc');
            const listTitle = document.getElementById('proxy-list-title');

            if (modeDesc) {
                if (mode === 'blacklist') {
                    modeDesc.textContent = '黑名单模式：代理所有应用，排除列表中的应用';
                } else {
                    modeDesc.textContent = '白名单模式：仅代理列表中的应用';
                }
            }

            if (listTitle) {
                listTitle.textContent = mode === 'blacklist' ? '排除应用' : '代理应用';
            }

            // 如果服务运行中，刷新规则
            const { status } = await KSUService.getStatus();
            if (status === 'running') {
                const result = await KSUService.renewTProxy();
                if (result.success) {
                    toast(`已切换到${mode === 'blacklist' ? '黑名单' : '白名单'}模式并即时生效`);
                } else {
                    toast(`已切换模式，但规则刷新失败`);
                }
            } else {
                toast(`已切换到${mode === 'blacklist' ? '黑名单' : '白名单'}模式`);
            }

            this.update();
        } catch (error) {
            toast('切换模式失败: ' + error.message, true);
        }
    }

    async removeApp(packageName, appName) {
        if (await this.ui.confirm(`确定要移除 ${appName} 吗？`)) {
            try {
                await KSUService.removeProxyApp(packageName);

                // 检查服务是否运行，如果运行则刷新规则
                const { status } = await KSUService.getStatus();
                if (status === 'running') {
                    const result = await KSUService.renewTProxy();
                    if (result.success) {
                        toast(`已移除 ${appName} 并即时生效`);
                    } else {
                        toast(`已移除 ${appName}，但规则刷新失败`);
                    }
                } else {
                    toast('已移除');
                }

                this.update();
            } catch (error) {
                toast('移除失败: ' + error.message, true);
            }
        }
    }

    async showAppSelector() {
        const dialog = document.getElementById('app-selector-dialog');
        const listEl = document.getElementById('app-selector-list');

        dialog.open = true;

        // 显示骨架屏
        this.ui.showSkeleton(listEl, 5);

        try {
            this.allApps = await KSUService.getInstalledApps();
            this.renderAppList(this.allApps);
        } catch (error) {
            listEl.innerHTML = '<mdui-list-item><div slot="headline">加载失败</div></mdui-list-item>';
            toast('加载应用列表失败: ' + error.message, true);
        }
    }

    renderAppList(apps) {
        // 清空之前的图标加载队列
        KSUService.clearIconLoadQueue();

        const listEl = document.getElementById('app-selector-list');

        if (apps.length === 0) {
            listEl.innerHTML = '<mdui-list-item><div slot="headline">没有找到应用</div></mdui-list-item>';
            return;
        }

        listEl.innerHTML = '';

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const item = entry.target;
                    const img = item.querySelector('img.app-icon[data-package-name]');
                    if (img) {
                        const packageName = img.dataset.packageName;
                        if (packageName && !img.src) {
                            KSUService.loadAppIcon(packageName).then(base64 => {
                                if (base64) {
                                    img.src = base64;
                                    img.style.display = 'block';
                                    const placeholder = item.querySelector('mdui-icon[slot="icon"]');
                                    if (placeholder) {
                                        placeholder.style.display = 'none';
                                    }
                                }
                            });
                        }
                    }
                    observer.unobserve(item);
                }
            });
        }, {
            rootMargin: '100px',
            threshold: 0.1
        });

        apps.forEach(app => {
            const item = document.createElement('mdui-list-item');
            item.setAttribute('clickable', '');
            item.setAttribute('headline', app.appLabel);
            item.setAttribute('description', app.packageName);

            // 添加应用图标
            if (app.icon) {
                const iconEl = document.createElement('img');
                iconEl.slot = 'icon';
                iconEl.className = 'app-icon';
                iconEl.src = app.icon;
                iconEl.onerror = function () {
                    this.style.display = 'none';
                    const icon = document.createElement('mdui-icon');
                    icon.slot = 'icon';
                    icon.setAttribute('name', 'android');
                    this.parentElement.insertBefore(icon, this);
                };
                item.appendChild(iconEl);
            } else {
                const icon = document.createElement('mdui-icon');
                icon.slot = 'icon';
                icon.setAttribute('name', 'android');
                item.appendChild(icon);

                const iconEl = document.createElement('img');
                iconEl.slot = 'icon';
                iconEl.className = 'app-icon';
                iconEl.dataset.packageName = app.packageName;
                iconEl.style.display = 'none';
                item.appendChild(iconEl);
                observer.observe(item);
            }

            item.addEventListener('click', async () => {
                await this.addApp(app);
            });

            listEl.appendChild(item);
        });
    }

    async addApp(app) {
        try {
            await KSUService.addProxyApp(app.packageName);

            // 检查服务是否运行，如果运行则刷新规则
            const { status } = await KSUService.getStatus();
            if (status === 'running') {
                const result = await KSUService.renewTProxy();
                if (result.success) {
                    toast(`已添加 ${app.appLabel} 并即时生效`);
                } else {
                    toast(`已添加 ${app.appLabel}，但规则刷新失败`);
                }
            } else {
                toast(`已添加 ${app.appLabel}`);
            }

            document.getElementById('app-selector-dialog').open = false;
            this.update();
        } catch (error) {
            if (error.message.includes('已存在')) {
                toast('该应用已在列表中');
            } else {
                toast('添加失败: ' + error.message, true);
            }
        }
    }

    filterApps(query) {
        if (!this.allApps) return;

        const filtered = this.allApps.filter(app =>
            app.appLabel.toLowerCase().includes(query.toLowerCase()) ||
            app.packageName.toLowerCase().includes(query.toLowerCase())
        );

        this.renderAppList(filtered);
    }
}
