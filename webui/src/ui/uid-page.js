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
        this.selectedApps = new Map(); // 用于多选, key: "userId:packageName"
        this.users = [];
        this.currentUserId = '0';
        this.showSystemApps = false; // 默认不显示系统应用 (-3 only)
        this.appProxyEnabled = true; // 分应用代理总开关
        this.isUpdatingUI = false;   // 防止程序更新 UI 触发事件
    }

    async init() {
        // 绑定分应用设置（三态：关闭/白名单/黑名单）
        const modeGroup = document.getElementById('app-proxy-mode-group');
        if (modeGroup) {
            modeGroup.addEventListener('change', async (e) => {
                if (this.isUpdatingUI) return;
                const newMode = e.target.value;
                await this.handleProxyModeChange(newMode);
            });
        }

        // 初始化用户列表（在打开 Dialog 时刷新，这里先不加载）

        // 绑定 Dialog 内的过滤器事件
        const filterInput = document.getElementById('app-selector-search');
        if (filterInput) {
            filterInput.addEventListener('input', (e) => this.filterApps(e.target.value));
        }

        const userSelect = document.getElementById('app-selector-user');
        if (userSelect) {
            userSelect.addEventListener('change', (e) => {
                this.currentUserId = e.target.value;
                this.reloadAppList();
            });
        }

        const systemSwitch = document.getElementById('app-selector-show-system');
        if (systemSwitch) {
            systemSwitch.addEventListener('change', (e) => {
                this.showSystemApps = e.target.checked;
                this.reloadAppList();
            });
        }
    }

    async update(forceRefresh = false) {
        try {
            const listEl = document.getElementById('uid-list');
            const modeSwitch = document.getElementById('proxy-mode-switch');
            const modeDesc = document.getElementById('proxy-mode-desc');
            const listTitle = document.getElementById('proxy-list-title');

            // 如果已有缓存且不是强制刷新，不做任何操作（DOM 已正确渲染）
            if (!forceRefresh && this.proxyApps.length > 0) {
                return;
            }

            // 显示骨架屏
            const currentCount = listEl.children.length > 0 ? listEl.children.length : 1;
            this.ui.showSkeleton(listEl, currentCount);

            // 获取代理模式和开关状态
            const [mode, enabled] = await Promise.all([
                KSUService.getAppProxyMode(),
                KSUService.getAppProxyEnabled()
            ]);
            this.proxyMode = mode;
            this.appProxyEnabled = enabled;

            // 计算当前的三态值
            let currentModeValue = 'off';
            if (this.appProxyEnabled) {
                currentModeValue = this.proxyMode; // 'blacklist' or 'whitelist'
            }

            // 更新 segmented button (使用标志位防止触发 change 事件)
            const modeGroup = document.getElementById('app-proxy-mode-group');
            if (modeGroup) {
                this.isUpdatingUI = true;
                modeGroup.value = currentModeValue;
                // mdui 可能异步触发 change 事件，延迟重置标志位
                setTimeout(() => {
                    this.isUpdatingUI = false;
                }, 100);
            }

            // 控制列表显示/隐藏
            const listCard = document.getElementById('proxy-list-card');
            if (listCard) {
                if (currentModeValue === 'off') {
                    listCard.style.display = 'none';
                } else {
                    listCard.style.display = 'block';
                }
            }

            // 更新列表标题
            if (listTitle && currentModeValue !== 'off') {
                listTitle.textContent = this.proxyMode === 'blacklist' ? '排除应用' : '代理应用';
            }

            // 获取代理应用列表 Array<{userId, packageName}>
            this.proxyApps = await KSUService.getProxyApps();

            if (this.proxyApps.length === 0) {
                const emptyText = this.proxyMode === 'blacklist'
                    ? '暂无排除应用，所有应用都会走代理'
                    : '暂无代理应用，点击上方按钮添加';
                listEl.innerHTML = `<mdui-list-item><div slot="headline">${emptyText}</div></mdui-list-item>`;
                return;
            }

            // 获取所有应用信息以便匹配包名（这里只为了显示名字）
            // 改进：失败时重试，且检查是否真的获取到了 appLabel
            const fetchWithRetry = async (retries = 2) => {
                for (let attempt = 0; attempt < retries; attempt++) {
                    try {
                        this.proxyApps = await KSUService.fetchAppDetails(this.proxyApps);
                        // 检查是否至少有一个应用获取到了 appLabel
                        const hasLabels = this.proxyApps.some(app => app.appLabel && app.appLabel !== app.packageName);
                        if (hasLabels || attempt === retries - 1) {
                            return;
                        }
                        // 没有获取到标签，等待后重试
                        console.warn(`fetchAppDetails attempt ${attempt + 1}: no labels, retrying...`);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (e) {
                        console.warn(`fetchAppDetails attempt ${attempt + 1} failed:`, e);
                        if (attempt < retries - 1) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                }
            };
            await fetchWithRetry();

            // 列表显示时，如果有 cache 则显示 Label，否则显示 PackageName。

            // 图标懒加载观察器
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const item = entry.target;
                        const img = item.querySelector('img.app-icon');
                        if (img && !img.src) {
                            const iconUrl = img.dataset.iconUrl;
                            const packageName = img.dataset.packageName;
                            const userId = img.dataset.userId || '0';

                            if (iconUrl) {
                                img.src = iconUrl;
                                img.onload = function () {
                                    this.style.display = 'block';
                                    const placeholder = item.querySelector('mdui-icon[slot="icon"]');
                                    if (placeholder) placeholder.style.display = 'none';
                                };
                            } else if (packageName) {
                                // 使用 KSU API 图标 URL
                                img.src = `ksu://icon/${packageName}`;
                                img.onload = function () {
                                    this.style.display = 'block';
                                    const placeholder = item.querySelector('mdui-icon[slot="icon"]');
                                    if (placeholder) placeholder.style.display = 'none';
                                };
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
            // this.proxyApps is Array<{userId, packageName}>
            this.proxyApps.forEach(proxyApp => {
                const item = document.createElement('mdui-list-item');
                // 使用 fetchAppDetails 获取到的 Label，如果没有则显示包名
                const label = proxyApp.appLabel || proxyApp.packageName;

                item.setAttribute('headline', label);

                // Description 显示包名 + 用户ID（如果非主用户）
                const userTags = [];
                if (proxyApp.userId !== '0') userTags.push(`[用户 ${proxyApp.userId}]`);
                // 如果 Label 和 包名不一致，显示包名以便区分
                if (label !== proxyApp.packageName) userTags.push(proxyApp.packageName);

                // Description 最终显示内容
                const descText = userTags.join(' ');

                // 使用自定义 slot 显示详细信息
                if (descText) {
                    const descSpan = document.createElement('span');
                    descSpan.slot = 'description';
                    descSpan.className = 'package-name-wrap';
                    descSpan.textContent = descText;
                    item.appendChild(descSpan);
                }

                // 统一使用懒加载方式
                const icon = document.createElement('mdui-icon');
                icon.slot = 'icon';
                icon.setAttribute('name', 'android');
                item.appendChild(icon);

                const iconEl = document.createElement('img');
                iconEl.slot = 'icon';
                iconEl.className = 'app-icon';
                iconEl.style.display = 'none';

                // 设置 dataset 供 IntersectionObserver 使用
                iconEl.dataset.packageName = proxyApp.packageName;
                iconEl.dataset.userId = proxyApp.userId;

                // 如果 fetchAppDetails 已经获取到了 icon (例如 ksu://), 直接设置 dataset.iconUrl
                if (proxyApp.icon) {
                    iconEl.dataset.iconUrl = proxyApp.icon;
                }

                iconEl.onerror = function () {
                    this.style.display = 'none';
                    const placeholder = this.parentElement.querySelector('mdui-icon[slot="icon"]');
                    if (placeholder) placeholder.style.display = '';
                };

                item.appendChild(iconEl);
                observer.observe(item);

                // 添加删除按钮
                const deleteBtn = document.createElement('mdui-button-icon');
                deleteBtn.slot = 'end-icon';
                deleteBtn.setAttribute('icon', 'delete');
                deleteBtn.style.color = 'var(--mdui-color-error)';
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    // 传递 appLabel (如果已获取) 或 default to packageName
                    await this.removeApp(proxyApp.packageName, proxyApp.userId, label);
                });
                item.appendChild(deleteBtn);

                listEl.appendChild(item);
            });
        } catch (error) {
            console.error('Update proxy page failed:', error);
        }
    }

    async handleProxyModeChange(modeValue) {
        try {
            if (modeValue === 'off') {
                // 关闭功能
                await KSUService.setAppProxyEnabled(false);
                this.appProxyEnabled = false;
                toast('分应用代理已关闭');
            } else {
                // 开启功能并设置模式
                await KSUService.setAppProxyEnabled(true);
                await KSUService.setAppProxyMode(modeValue);
                this.appProxyEnabled = true;
                this.proxyMode = modeValue;
                toast(`已切换为${modeValue === 'blacklist' ? '黑名单' : '白名单'}模式`);
            }
            this.update();
        } catch (error) {
            toast('设置失败: ' + error.message, true);
        }
    }

    async removeApp(packageName, userId = '0', appLabel = null) {
        const userIdStr = userId.toString();
        const displayUser = userIdStr !== '0' ? `(用户 ${userIdStr})` : '';
        const displayName = appLabel || packageName;
        if (await this.ui.confirm(`确定要移除 ${displayName} ${displayUser} 吗？`)) {
            try {
                await KSUService.removeProxyApp(packageName, userIdStr);
                toast(`已移除`);
                this.update();
            } catch (error) {
                toast('移除失败: ' + error.message, true);
            }
        }
    }

    async reloadAppList() {
        const listEl = document.getElementById('app-selector-list');
        // 骨架屏
        this.ui.showSkeleton(listEl, 5);
        try {
            // 重新获取 (带缓存或者重新 exec)
            this.allApps = await KSUService.getInstalledApps(this.currentUserId, this.showSystemApps);
            this.renderAppList(this.allApps);
        } catch (error) {
            listEl.innerHTML = '<mdui-list-item><div slot="headline">加载失败</div></mdui-list-item>';
            toast('加载应用列表失败: ' + error.message, true);
        }
    }

    async showAppSelector() {
        const dialog = document.getElementById('app-selector-dialog');
        const listEl = document.getElementById('app-selector-list');
        const addSelectedBtn = document.getElementById('app-selector-add-selected');

        // 加载用户列表
        const userSelect = document.getElementById('app-selector-user');
        if (userSelect) {
            this.users = await KSUService.getUsers();
            userSelect.innerHTML = '';
            this.users.forEach(u => {
                const opt = document.createElement('mdui-menu-item'); // 或者 mdui-option, 取决于 select 实现
                // mdui-select 使用 mdui-menu-item
                opt.value = u.id;
                opt.textContent = `${u.name} (${u.id})`;
                userSelect.appendChild(opt);
            });
            userSelect.value = this.currentUserId;
        }

        // 清空选中状态
        this.selectedApps.clear();
        this.updateAddSelectedButton();

        // 绑定批量添加按钮事件（每次打开都重新绑定）
        if (addSelectedBtn) {
            addSelectedBtn.onclick = () => this.addSelectedApps();
        }

        dialog.open = true;

        this.reloadAppList();
    }

    updateAddSelectedButton() {
        const btn = document.getElementById('app-selector-add-selected');
        if (btn) {
            const count = this.selectedApps.size;
            btn.textContent = `添加选中 (${count})`;
            btn.disabled = count === 0;
        }
    }

    toggleAppSelection(app, checkbox, fromCheckbox = false) {
        const key = `${app.userId}:${app.packageName}`;
        if (fromCheckbox) {
            // 从复选框触发：复选框已经自动切换了状态，直接根据当前状态更新数据
            if (checkbox.checked) {
                this.selectedApps.set(key, app);
            } else {
                this.selectedApps.delete(key);
            }
        } else {
            // 从列表项触发：需要手动切换复选框状态
            if (this.selectedApps.has(key)) {
                this.selectedApps.delete(key);
                checkbox.checked = false;
            } else {
                this.selectedApps.set(key, app);
                checkbox.checked = true;
            }
        }
        this.updateAddSelectedButton();
    }

    async addSelectedApps() {
        if (this.selectedApps.size === 0) return;

        const apps = Array.from(this.selectedApps.values());

        for (const app of apps) {
            try {
                await KSUService.addProxyApp(app.packageName, app.userId);
            } catch (error) {
                // 忽略错误（如应用已存在）
            }
        }

        toast(`成功添加 ${apps.length} 个应用`);

        document.getElementById('app-selector-dialog').open = false;
        this.selectedApps.clear();
        this.update();
    }

    renderAppList(apps) {
        // 清空之前的图标加载队列
        KSUService.clearIconLoadQueue();

        const listEl = document.getElementById('app-selector-list');
        // 获取滚动容器作为 IntersectionObserver 的 root
        const scrollContainer = listEl.parentElement;

        if (apps.length === 0) {
            listEl.innerHTML = '<mdui-list-item><div slot="headline">没有找到应用</div></mdui-list-item>';
            return;
        }

        listEl.innerHTML = '';

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const item = entry.target;
                    const img = item.querySelector('img.app-icon');
                    if (img && !img.src) {
                        const iconUrl = img.dataset.iconUrl;
                        const packageName = img.dataset.packageName;

                        if (iconUrl) {
                            // 使用 ksu://icon/ URL
                            img.src = iconUrl;
                            img.onload = function () {
                                this.style.display = 'block';
                                const placeholder = item.querySelector('mdui-icon[slot="icon"]');
                                if (placeholder) {
                                    placeholder.style.display = 'none';
                                }
                            };
                        } else if (packageName) {
                            // 使用 KSU API 图标 URL
                            img.src = `ksu://icon/${packageName}`;
                            img.onload = function () {
                                this.style.display = 'block';
                                const placeholder = item.querySelector('mdui-icon[slot="icon"]');
                                if (placeholder) {
                                    placeholder.style.display = 'none';
                                }
                            };
                        }
                    }
                    observer.unobserve(item);
                }
            });
        }, {
            root: scrollContainer,
            rootMargin: '50px',
            threshold: 0.1
        });

        apps.forEach(app => {
            const item = document.createElement('mdui-list-item');
            item.setAttribute('clickable', '');
            item.setAttribute('headline', app.appLabel);
            item.setAttribute('description', app.packageName);

            // 添加应用图标 - 统一使用懒加载
            const icon = document.createElement('mdui-icon');
            icon.slot = 'icon';
            icon.setAttribute('name', 'android');
            item.appendChild(icon);

            const iconEl = document.createElement('img');
            iconEl.slot = 'icon';
            iconEl.className = 'app-icon';
            iconEl.style.display = 'none';

            if (app.icon) {
                // KSU API 方式：有 ksu://icon/ URL，也使用懒加载
                iconEl.dataset.iconUrl = app.icon;
            }
            // WebUI X 方式：通过包名懒加载
            iconEl.dataset.packageName = app.packageName;

            iconEl.onerror = function () {
                this.style.display = 'none';
                const placeholder = this.parentElement.querySelector('mdui-icon[slot="icon"]');
                if (placeholder) {
                    placeholder.style.display = '';
                }
            };

            item.appendChild(iconEl);
            observer.observe(item);


            // 添加复选框
            const checkbox = document.createElement('mdui-checkbox');
            checkbox.slot = 'end-icon';
            const key = `${app.userId}:${app.packageName}`;
            checkbox.checked = this.selectedApps.has(key);
            item.appendChild(checkbox);

            // 复选框变化事件 - 阻止冒泡并同步选中状态
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.toggleAppSelection(app, checkbox, true);
            });

            // 点击整行切换选中状态（排除复选框区域）
            item.addEventListener('click', (e) => {
                // 如果点击的是复选框本身，不处理（让 change 事件处理）
                if (e.target === checkbox || checkbox.contains(e.target)) {
                    return;
                }
                e.stopPropagation();
                this.toggleAppSelection(app, checkbox, false);
            });

            listEl.appendChild(item);
        });
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
