import { KSUService } from '../services/ksu-service.js';
import { toast } from '../utils/toast.js';

/**
 * 配置页面管理器 - 支持分组显示
 */
export class ConfigPageManager {
    constructor(ui) {
        this.ui = ui;
        this.currentOpenDropdown = null;
        this._tabEventBound = false; // 防止重复绑定 tab 事件
        this._cachedGroups = null;
        this._cachedCurrentConfig = null;
        this._cachedConfigInfos = new Map(); // groupName -> Map<filename, info>
        this._loadingChunks = new Set(); // 防止并发加载同一 chunk
        this._selectedTab = null; // 持久化当前选中的 tab

        // 懒加载观察器
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const item = entry.target;
                    const groupName = item.dataset.groupName;
                    const filename = item.dataset.filename;

                    if (groupName && filename) {
                        this.loadConfigForItem(item, groupName, filename);
                    }
                    this.observer.unobserve(item);
                }
            });
        }, { rootMargin: '200px' });
    }

    /**
     * 从配置内容解析出站信息
     */
    parseOutboundInfo(content) {
        try {
            const config = JSON.parse(content);
            const outbounds = config.outbounds || [];

            for (const outbound of outbounds) {
                const protocol = outbound.protocol;
                if (!protocol || ['freedom', 'blackhole', 'dns'].includes(protocol)) {
                    continue;
                }

                let address = '';
                let port = '';

                if (outbound.settings) {
                    if (outbound.settings.vnext && outbound.settings.vnext[0]) {
                        address = outbound.settings.vnext[0].address || '';
                        port = outbound.settings.vnext[0].port || '';
                    } else if (outbound.settings.servers && outbound.settings.servers[0]) {
                        address = outbound.settings.servers[0].address || '';
                        port = outbound.settings.servers[0].port || '';
                    }
                }

                return { protocol, address, port };
            }

            return { protocol: 'direct', address: '直连模式', port: '' };
        } catch (e) {
            return { protocol: 'unknown', address: '', port: '' };
        }
    }

    // 刷新数据并渲染（首次加载或手动刷新时调用）
    async update(forceRefresh = false) {
        try {
            // 如果已有缓存且不是强制刷新，直接渲染（页面切换回来时使用缓存）
            if (!forceRefresh && this._cachedGroups && this._cachedGroups.length > 0) {
                await this.render();
                return;
            }

            // 1. 获取目录结构（快速，无详情）
            const groups = await KSUService.getConfigStructure();

            // 2. 更新缓存
            this._cachedGroups = groups;
            const { config } = await KSUService.getStatus();
            this._cachedCurrentConfig = config;

            // 3. 立即渲染结构
            await this.render();

            // 4. 不再主动加载所有详情，依靠 IntersectionObserver 懒加载
        } catch (error) {
        }
    }

    // 加载单个节点详情（实际会加载周围的一批）
    async loadConfigForItem(item, groupName, filename) {
        const group = this._cachedGroups.find(g => g.name === groupName);
        if (!group) return;

        // 如果该分组尚未初始化 Map
        if (!this._cachedConfigInfos.has(groupName)) {
            this._cachedConfigInfos.set(groupName, new Map());
        }
        const groupInfos = this._cachedConfigInfos.get(groupName);

        // 如果已经有数据，直接渲染（可能刚加载完）
        if (groupInfos.has(filename) && groupInfos.get(filename).protocol !== 'loading...') {
            this.updateItemUI(item, groupInfos.get(filename));
            return;
        }

        // 找到该文件在列表中的索引
        const index = group.configs.indexOf(filename);
        if (index === -1) return;

        // 加载该索引附近的一批文件
        const CHUNK_SIZE = 20;
        const chunkIndex = Math.floor(index / CHUNK_SIZE);
        const chunkKey = `${groupName}:${chunkIndex}`;

        // 检查是否正在加载该 chunk
        if (this._loadingChunks.has(chunkKey)) return;
        this._loadingChunks.add(chunkKey);

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min((chunkIndex + 1) * CHUNK_SIZE, group.configs.length);

        const filesToLoad = group.configs.slice(start, end);
        // 过滤掉已经加载过的
        const pendingFiles = filesToLoad.filter(f => {
            const info = groupInfos.get(f);
            return !info || info.protocol === 'loading...'; // 重新加载 loading 状态的
        });

        if (pendingFiles.length === 0) return;

        // 标记为正在加载，避免重复请求
        pendingFiles.forEach(f => groupInfos.set(f, { protocol: 'loading...', address: '', port: '' }));

        // 构建完整路径
        const filePaths = pendingFiles.map(f => group.dirName ? `${group.dirName}/${f}` : f);

        // 批量读取
        const newInfos = await KSUService.batchReadConfigInfos(filePaths);

        // 更新缓存并刷新 UI
        for (const [fname, info] of newInfos) {
            groupInfos.set(fname, info);
            const targetItem = document.querySelector(`.config-item[data-group-name="${groupName}"][data-filename="${fname}"]`);
            if (targetItem) {
                this.updateItemUI(targetItem, info);
            }
        }

        // 移除加载锁
        this._loadingChunks.delete(chunkKey);
    }

    updateItemUI(item, info) {
        // 更新协议
        const protocolLine = item.querySelector('.protocol-line');
        if (protocolLine) protocolLine.textContent = info.protocol || '未知协议';

        // 更新地址
        const addressSpan = item.querySelector('.address-span');
        if (addressSpan) addressSpan.textContent = info.port ? `${info.address}:${info.port}` : info.address;
    }

    // 加载分组详情并刷新
    async loadConfigChunk(groupName, startIndex = 0, chunkSize = 20) {
        const group = this._cachedGroups.find(g => g.name === groupName);
        if (!group || group.configs.length === 0) return;

        if (!this._cachedConfigInfos.has(groupName)) {
            this._cachedConfigInfos.set(groupName, new Map());
        }
        const groupInfos = this._cachedConfigInfos.get(groupName);

        const end = Math.min(startIndex + chunkSize, group.configs.length);
        const filesToLoad = group.configs.slice(startIndex, end);

        const pendingFiles = filesToLoad.filter(f => {
            const info = groupInfos.get(f);
            return !info || info.protocol === 'loading...';
        });

        if (pendingFiles.length === 0) return;

        pendingFiles.forEach(f => groupInfos.set(f, { protocol: 'loading...', address: '', port: '' }));

        const filePaths = pendingFiles.map(f => group.dirName ? `${group.dirName}/${f}` : f);
        const newInfos = await KSUService.batchReadConfigInfos(filePaths);

        for (const [fname, info] of newInfos) {
            groupInfos.set(fname, info);
            const targetItem = document.querySelector(`.config-item[data-group-name="${groupName}"][data-filename="${fname}"]`);
            if (targetItem) {
                this.updateItemUI(targetItem, info);
            }
        }
    }

    // 仅渲染 UI（使用 mdui-tabs 横向分组）
    async render() {
        const tabsEl = document.getElementById('config-tabs');
        if (!tabsEl) return;

        if (!this._cachedGroups || this._cachedGroups.length === 0) {
            tabsEl.innerHTML = '<mdui-tab value="empty">暂无节点</mdui-tab><mdui-tab-panel slot="panel" value="empty"><p style="padding: 16px; text-align: center;">暂无节点</p></mdui-tab-panel>';
            return;
        }

        // 保存当前选中的 tab
        const currentTab = this._selectedTab || this._cachedGroups[0]?.name || 'default';

        // 检查现有 tabs 是否匹配缓存（如果匹配则跳过重建，只刷新内容）
        const existingTabs = tabsEl.querySelectorAll('mdui-tab');
        const existingNames = Array.from(existingTabs).map(t => t.value);
        const cachedNames = this._cachedGroups.map(g => g.name);
        const tabsMatch = existingNames.length === cachedNames.length &&
            existingNames.every((name, i) => name === cachedNames[i]);

        if (tabsMatch && existingNames.length > 0 && existingNames[0] !== 'loading') {
            // Tabs 结构匹配，只刷新当前 tab 的内容
            const validTab = this._cachedGroups.find(g => g.name === currentTab) ? currentTab : this._cachedGroups[0]?.name;
            this._selectedTab = validTab;
            await this.renderActiveTab(validTab);
            return;
        }

        // 清空并重建 tabs（首次加载或结构变化时）
        tabsEl.innerHTML = '';

        // 1. 创建所有 tab 标签
        for (const group of this._cachedGroups) {
            const tab = document.createElement('mdui-tab');
            tab.value = group.name;
            tab.textContent = `${group.name} (${group.configs.length})`;
            tabsEl.appendChild(tab);
        }

        // 1.5 注入滚动样式到 Shadow DOM（等待渲染后）
        requestAnimationFrame(() => {
            const shadowRoot = tabsEl.shadowRoot;
            if (shadowRoot) {
                const container = shadowRoot.querySelector('[part="container"]');
                if (container) {
                    container.style.cssText = 'display: flex; flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch;';
                }

                // 让每个 tab 保持自然宽度不收缩
                const tabs = shadowRoot.querySelectorAll('slot');
                tabs.forEach(slot => {
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

        // 2. 创建所有 tab-panel
        // 2. 创建所有 tab-panel
        for (const group of this._cachedGroups) {
            const panel = document.createElement('mdui-tab-panel');
            panel.slot = 'panel';
            panel.value = group.name;

            // 操作栏 (Toolbar)
            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px 16px 4px 16px;';

            // 左侧标题
            const title = document.createElement('span');
            title.textContent = '节点列表';
            title.style.cssText = 'font-size: 14px; font-weight: 500; color: var(--mdui-color-on-surface-variant);';
            actions.appendChild(title);

            // 右侧菜单按钮
            const dropdown = document.createElement('mdui-dropdown');
            dropdown.setAttribute('placement', 'bottom-end');

            const triggerBtn = document.createElement('mdui-button-icon');
            triggerBtn.slot = 'trigger';
            triggerBtn.setAttribute('icon', 'more_vert');
            dropdown.appendChild(triggerBtn);

            const menu = document.createElement('mdui-menu');

            // 全部测试
            const testItem = document.createElement('mdui-menu-item');
            testItem.innerHTML = '<mdui-icon slot="icon" name="playlist_play"></mdui-icon>全部测试';
            testItem.addEventListener('click', () => {
                dropdown.open = false;
                this.testGroupLatency(group.name);
            });
            menu.appendChild(testItem);

            // 按延迟排序
            const sortItem = document.createElement('mdui-menu-item');
            sortItem.innerHTML = '<mdui-icon slot="icon" name="sort"></mdui-icon>按延迟排序';
            sortItem.addEventListener('click', () => {
                dropdown.open = false;
                this.sortGroupNodes(group.name);
            });
            menu.appendChild(sortItem);

            // 清理无效节点
            const cleanItem = document.createElement('mdui-menu-item');
            cleanItem.innerHTML = '<mdui-icon slot="icon" name="delete_sweep"></mdui-icon>清理无效节点';
            cleanItem.style.color = 'var(--mdui-color-error)';
            cleanItem.addEventListener('click', () => {
                dropdown.open = false;
                this.deleteInvalidNodes(group.name);
            });
            menu.appendChild(cleanItem);

            // 订阅专用操作
            if (group.type === 'subscription') {
                const updateItem = document.createElement('mdui-menu-item');
                updateItem.innerHTML = '<mdui-icon slot="icon" name="refresh"></mdui-icon>更新订阅';
                updateItem.addEventListener('click', () => {
                    dropdown.open = false;
                    this.updateSubscription(group.dirName, group.name);
                });
                menu.appendChild(updateItem);

                const deleteItem = document.createElement('mdui-menu-item');
                deleteItem.innerHTML = '<mdui-icon slot="icon" name="delete"></mdui-icon>删除订阅';
                deleteItem.addEventListener('click', () => {
                    dropdown.open = false;
                    this.deleteSubscription(group.dirName, group.name);
                });
                menu.appendChild(deleteItem);
            }

            dropdown.appendChild(menu);
            actions.appendChild(dropdown);
            panel.appendChild(actions);

            // 创建列表容器
            const list = document.createElement('mdui-list');
            list.id = `config-list-${group.name}`;
            list.className = 'config-group-list';
            panel.appendChild(list);

            tabsEl.appendChild(panel);
        }

        // 3. 恢复选中状态
        const validTab = this._cachedGroups.find(g => g.name === currentTab) ? currentTab : this._cachedGroups[0]?.name;
        this._selectedTab = validTab; // 保存到实例变量

        // 延迟激活 tab - 使用点击方式更可靠
        requestAnimationFrame(() => {
            setTimeout(async () => {
                if (validTab) {
                    // 找到并点击目标 tab
                    const targetTab = tabsEl.querySelector(`mdui-tab[value="${validTab}"]`);
                    if (targetTab) {
                        targetTab.click();
                    }
                    // 为当前 tab 加载并渲染内容
                    await this.renderActiveTab(validTab);
                }
            }, 100);
        });

        // 5. 绑定 tab 切换事件（每次重新绑定，先移除旧的）
        if (this._tabChangeHandler) {
            tabsEl.removeEventListener('change', this._tabChangeHandler);
        }
        this._tabChangeHandler = async (e) => {
            const newTab = e.target.value;
            this._selectedTab = newTab;
            await this.renderActiveTab(newTab);
        };
        tabsEl.addEventListener('change', this._tabChangeHandler);
    }

    // 渲染当前激活的 tab 内容
    async renderActiveTab(groupName) {
        const group = this._cachedGroups.find(g => g.name === groupName);
        if (!group) return;

        const listEl = document.getElementById(`config-list-${groupName}`);
        if (!listEl) return;

        // 如果没有缓存数据，先加载前 10 个
        if (!this._cachedConfigInfos.has(groupName)) {
            this._cachedConfigInfos.set(groupName, new Map());
            await this.loadConfigChunk(groupName, 0, 10);
        }

        const configInfos = this._cachedConfigInfos.get(groupName) || new Map();

        // 渲染列表
        const fragment = document.createDocumentFragment();
        for (const filename of group.configs) {
            const info = configInfos.get(filename);
            const fullPath = group.dirName ? `${group.dirName}/${filename}` : filename;
            const isCurrent = this._cachedCurrentConfig && this._cachedCurrentConfig.endsWith(filename);

            this.renderConfigItem(fragment, filename, fullPath, info, isCurrent, group);
        }

        listEl.innerHTML = '';
        listEl.appendChild(fragment);
    }

    async loadConfigInfos(group) {
        // 构建完整路径列表
        const filePaths = group.configs.map(f =>
            group.dirName ? `${group.dirName}/${f}` : f
        );

        // 批量读取所有配置信息（单次 exec）
        return await KSUService.batchReadConfigInfos(filePaths);
    }

    renderConfigItem(container, filename, fullPath, info, isCurrent, group) {
        const item = document.createElement('mdui-list-item');
        item.setAttribute('clickable', '');
        item.classList.add('config-item');
        item.dataset.groupName = group.name;
        item.dataset.filename = filename;
        item.dataset.filename = filename;

        const displayName = filename.replace(/\.json$/i, '');
        item.setAttribute('headline', displayName);

        const descContainer = document.createElement('div');
        descContainer.slot = 'description';
        descContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; width: 100%;';

        const protocolLine = document.createElement('div');
        protocolLine.className = 'protocol-line'; // 添加类名方便更新
        protocolLine.style.cssText = 'color: var(--mdui-color-primary); font-size: 12px;';
        protocolLine.textContent = info ? (info.protocol || '未知协议') : 'loading...';
        descContainer.appendChild(protocolLine);

        const addressLine = document.createElement('div');
        addressLine.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

        const addressSpan = document.createElement('span');
        addressSpan.className = 'address-span'; // 添加类名方便更新
        addressSpan.style.cssText = 'color: var(--mdui-color-on-surface-variant); font-size: 12px;';
        addressSpan.textContent = info ? (info.port ? `${info.address}:${info.port}` : info.address) : '';
        addressLine.appendChild(addressSpan);

        // 如果没有 info，加入 Observer
        if (!info) {
            this.observer.observe(item);
        }

        const statusContainer = document.createElement('span');
        statusContainer.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const latencyLabel = document.createElement('span');
        latencyLabel.className = 'latency-label';
        // ... (rest same) ...
        latencyLabel.style.cssText = 'font-size: 12px; color: var(--mdui-color-on-surface-variant);';
        statusContainer.appendChild(latencyLabel);

        if (isCurrent) {
            const currentTag = document.createElement('span');
            currentTag.textContent = '当前';
            currentTag.style.cssText = 'font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--mdui-color-primary); color: var(--mdui-color-on-primary);';
            statusContainer.appendChild(currentTag);
        }

        addressLine.appendChild(statusContainer);
        descContainer.appendChild(addressLine);
        item.appendChild(descContainer);

        // 三点菜单
        const dropdown = document.createElement('mdui-dropdown');
        dropdown.setAttribute('placement', 'bottom-end');
        dropdown.slot = 'end-icon';

        const menuBtn = document.createElement('mdui-button-icon');
        menuBtn.setAttribute('slot', 'trigger');
        menuBtn.setAttribute('icon', 'more_vert');
        // 阻止所有事件冒泡到父列表项，防止触发 ripple 和选中效果
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // 关闭之前打开的下拉菜单
            if (this.currentOpenDropdown && this.currentOpenDropdown !== dropdown) {
                this.currentOpenDropdown.open = false;
            }
            // 更新当前打开的下拉菜单
            this.currentOpenDropdown = dropdown;
        });
        menuBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        menuBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        menuBtn.addEventListener('touchstart', (e) => e.stopPropagation());
        dropdown.appendChild(menuBtn);

        // 监听下拉菜单关闭事件
        dropdown.addEventListener('closed', () => {
            if (this.currentOpenDropdown === dropdown) {
                this.currentOpenDropdown = null;
            }
        });

        const menu = document.createElement('mdui-menu');

        // 编辑
        const editItem = document.createElement('mdui-menu-item');
        editItem.innerHTML = '<mdui-icon slot="icon" name="edit"></mdui-icon>编辑';
        editItem.addEventListener('click', async (e) => {
            e.stopPropagation();
            dropdown.open = false;
            await this.ui.showConfigDialog(fullPath);
        });
        menu.appendChild(editItem);

        // 测试
        const testItem = document.createElement('mdui-menu-item');
        testItem.innerHTML = '<mdui-icon slot="icon" name="speed"></mdui-icon>测试';
        testItem.addEventListener('click', async (e) => {
            e.stopPropagation();
            dropdown.open = false;
            await this.testConfig(displayName, info.address, item);
        });
        menu.appendChild(testItem);

        // 删除（非当前配置可删除）
        if (!isCurrent) {
            const deleteItem = document.createElement('mdui-menu-item');
            deleteItem.innerHTML = '<mdui-icon slot="icon" name="delete"></mdui-icon>删除';
            deleteItem.style.color = 'var(--mdui-color-error)';
            deleteItem.addEventListener('click', async (e) => {
                e.stopPropagation();
                dropdown.open = false;
                await this.deleteConfig(fullPath, displayName);
            });
            menu.appendChild(deleteItem);
        }

        dropdown.appendChild(menu);
        item.appendChild(dropdown);

        item.addEventListener('click', () => {
            if (!isCurrent) {
                this.switchConfig(fullPath, displayName);
            }
        });

        container.appendChild(item);
    }

    async testConfig(displayName, address, itemElement) {
        const latencyLabel = itemElement?.querySelector('.latency-label');

        if (!address || address === '直连模式') {
            if (latencyLabel) latencyLabel.textContent = '直连';
            return;
        }

        try {
            if (latencyLabel) {
                latencyLabel.textContent = '测试中...';
                latencyLabel.style.color = 'var(--mdui-color-on-surface-variant)';
            }
            const latencyStr = await KSUService.getPingLatency(address);
            let latencyVal = 9999;

            if (latencyLabel) {
                latencyLabel.textContent = latencyStr;
                // 根据延迟值设置颜色
                const ms = parseInt(latencyStr);
                if (!isNaN(ms)) {
                    latencyVal = ms;
                    if (ms < 100) {
                        latencyLabel.style.color = '#4caf50'; // 绿色
                    } else if (ms < 300) {
                        latencyLabel.style.color = '#ff9800'; // 橙色
                    } else {
                        latencyLabel.style.color = '#f44336'; // 红色
                    }
                } else if (latencyStr === '失败' || latencyStr === '超时') {
                    latencyLabel.style.color = '#f44336';
                }
            }

            // 缓存测试结果，用于排序和清理
            // config-list-item 的 dataset.filename 是文件名
            const filename = itemElement?.dataset.filename || displayName + '.json'; // 尽可能获取文件名
            // 找到对应的 group 和 info
            for (const [groupName, infos] of this._cachedConfigInfos.entries()) {
                if (infos.has(filename)) {
                    const info = infos.get(filename);
                    info.latency = latencyVal;
                    info.latencyStr = latencyStr;
                    break;
                }
            }

        } catch (error) {
            if (latencyLabel) {
                latencyLabel.textContent = '失败';
                latencyLabel.style.color = '#f44336';
            }
        }
    }

    // 批量测试延迟
    async testGroupLatency(groupName) {
        const group = this._cachedGroups.find(g => g.name === groupName);
        if (!group) return;

        const listEl = document.getElementById(`config-list-${groupName}`);
        if (!listEl) return;

        const items = Array.from(listEl.querySelectorAll('.config-item'));
        const total = items.length;
        if (total === 0) {
            toast('没有可测试的节点');
            return;
        }

        const toastId = toast(`开始测试 ${total} 个节点...`, 0); // 持续显示

        // 并发控制，每次 5 个
        const concurrency = 5;
        for (let i = 0; i < total; i += concurrency) {
            const chunk = items.slice(i, i + concurrency);
            await Promise.all(chunk.map(async (item) => {
                const filename = item.dataset.filename;
                const info = this._cachedConfigInfos.get(groupName)?.get(filename);
                if (info && info.address) {
                    await this.testConfig(filename.replace(/\.json$/i, ''), info.address, item);
                }
            }));
        }

        // 关闭 toast (重新显示一个自动消失的)
        // mdui 没提供直接关闭 toast 的 api，只能发个新的覆盖
        toast('测试完成');
    }

    // 按延迟排序
    async sortGroupNodes(groupName) {
        const group = this._cachedGroups.find(g => g.name === groupName);
        if (!group) return;

        const infos = this._cachedConfigInfos.get(groupName);
        if (!infos) return; // 还没加载过

        // 排序：有延迟的在前（按数值升序），没延迟的在后（保持原序或排最后）
        group.configs.sort((a, b) => {
            const latA = infos.get(a)?.latency ?? 99999;
            const latB = infos.get(b)?.latency ?? 99999;
            return latA - latB;
        });

        toast('已重新排序');
        await this.renderActiveTab(groupName);
    }

    // 清理无效节点 (失败/超时)
    async deleteInvalidNodes(groupName) {
        const infos = this._cachedConfigInfos.get(groupName);
        if (!infos) {
            toast('请先进行测试');
            return;
        }

        const invalidFiles = [];
        for (const [filename, info] of infos.entries()) {
            if (info.latencyStr === '失败' || info.latencyStr === '超时') {
                invalidFiles.push(filename);
            }
        }

        if (invalidFiles.length === 0) {
            toast('没有发现无效节点 (需先测试)');
            return;
        }

        const confirmed = await this.ui.confirm(`发现 ${invalidFiles.length} 个无效节点，确定要删除吗？\n\n这属于破坏性操作，无法恢复。`);
        if (!confirmed) return;

        const group = this._cachedGroups.find(g => g.name === groupName);
        let successCount = 0;

        for (const filename of invalidFiles) {
            const fullPath = group.dirName ? `${group.dirName}/${filename}` : filename;
            const result = await KSUService.deleteConfig(fullPath);
            if (result && result.success) {
                successCount++;
            }
        }

        toast(`已清理 ${successCount} 个节点`);
        // 强制刷新
        this._cachedConfigInfos.delete(groupName);
        this.update();
    }

    async deleteConfig(fullPath, displayName) {
        try {
            const confirmed = await this.ui.confirm(`确定要删除节点 "${displayName}" 吗？\n\n此操作不可恢复。`);
            if (!confirmed) return;

            const result = await KSUService.deleteConfig(fullPath);
            if (result && result.success) {
                toast('配置已删除');
                this.update();
            } else {
                toast('删除失败: ' + (result?.error || '未知错误'));
            }
        } catch (error) {
            toast('删除失败: ' + error.message);
        }
    }

    async switchConfig(fullPath, displayName) {
        try {
            await KSUService.switchConfig(fullPath);
            toast('已切换到: ' + displayName);
            await this.update();
            await this.ui.statusPage.update();
        } catch (error) {
            toast('切换配置失败: ' + error.message);
        }
    }

    // ===================== 订阅管理 =====================

    async updateSubscription(dirName, displayName) {
        toast(`正在更新订阅...`);

        // 使用 setTimeout 让浏览器先渲染 UI
        setTimeout(async () => {
            try {
                // subscription.sh 期望传入的是订阅名称（不带 sub_ 前缀）
                await KSUService.updateSubscription(displayName);
                toast('订阅更新成功');
                // 清除该分组的缓存，强制重新加载
                this._cachedConfigInfos.delete(displayName);
                this.update();
            } catch (error) {
                toast('更新失败: ' + error.message);
                this.update();
            }
        }, 50);
    }

    async deleteSubscription(dirName, displayName) {
        try {
            const confirmed = await this.ui.confirm(`确定要删除订阅 "${displayName}" 吗？\n\n该订阅下的所有节点都将被删除。`);
            if (!confirmed) return;

            // subscription.sh 期望传入的是订阅名称（不带 sub_ 前缀）
            await KSUService.removeSubscription(displayName);
            toast('订阅已删除');
            // 重新加载分组
            this.update();
        } catch (error) {
            toast('删除失败: ' + error.message);
        }
    }

    async addSubscription() {
        const dialog = document.getElementById('subscription-dialog');
        const nameInput = document.getElementById('subscription-name');
        const urlInput = document.getElementById('subscription-url');

        nameInput.value = '';
        urlInput.value = '';
        dialog.open = true;
    }

    async saveSubscription() {
        const nameInput = document.getElementById('subscription-name');
        const urlInput = document.getElementById('subscription-url');
        const saveBtn = document.getElementById('subscription-save');
        const cancelBtn = document.getElementById('subscription-cancel');
        const dialog = document.getElementById('subscription-dialog');

        const name = nameInput.value.trim();
        const url = urlInput.value.trim();

        if (!name) {
            toast('请输入订阅名称');
            return;
        }

        if (!url) {
            toast('请输入订阅地址');
            return;
        }

        // 关闭对话框
        dialog.open = false;

        // 清空输入
        nameInput.value = '';
        urlInput.value = '';

        toast('正在下载订阅，请稍候...');

        // 使用 setTimeout 让浏览器先渲染 UI，再执行阻塞操作
        setTimeout(async () => {
            try {
                await KSUService.addSubscription(name, url);
                toast('订阅添加成功');
                this.update();
            } catch (error) {
                toast('添加失败: ' + error.message);
                this.update();
            }
        }, 50);
    }

    // ===================== 原有方法 =====================

    async showDialog(filename = null) {
        const dialog = document.getElementById('config-dialog');
        const filenameInput = document.getElementById('config-filename');
        const contentInput = document.getElementById('config-content');

        if (filename) {
            filenameInput.value = filename;
            filenameInput.disabled = true;
            const content = await KSUService.readConfig(filename);
            contentInput.value = content;
        } else {
            filenameInput.value = '';
            filenameInput.disabled = false;
            contentInput.value = JSON.stringify({
                "outbounds": [
                    {
                        "protocol": "vless",
                        "tag": "proxy",
                        "settings": {
                            "vnext": [{ "address": "", "port": 443, "users": [{ "id": "" }] }]
                        }
                    },
                    { "protocol": "freedom", "tag": "direct" },
                    { "protocol": "blackhole", "tag": "block" }
                ]
            }, null, 2);
        }

        dialog.open = true;
    }

    async saveConfig() {
        const filename = document.getElementById('config-filename').value.trim();
        const content = document.getElementById('config-content').value;

        if (!filename) {
            toast('请输入文件名');
            return;
        }

        if (!filename.endsWith('.json')) {
            toast('文件名必须以 .json 结尾');
            return;
        }

        try {
            JSON.parse(content);
            await KSUService.saveConfig(filename, content);
            toast('保存成功');
            document.getElementById('config-dialog').open = false;
            this.update();
        } catch (error) {
            toast('保存失败: ' + error.message);
        }
    }

    async importNodeLink() {
        const input = document.getElementById('node-link-input');
        const nodeLink = input.value.trim();

        if (!nodeLink) {
            toast('请输入节点链接');
            return;
        }

        const supportedProtocols = ['vless://', 'vmess://', 'trojan://', 'ss://', 'socks://', 'http://', 'https://'];
        const isValid = supportedProtocols.some(protocol => nodeLink.startsWith(protocol));

        if (!isValid) {
            toast('不支持的节点链接格式');
            return;
        }

        try {
            toast('正在导入节点...');
            const result = await KSUService.importFromNodeLink(nodeLink);

            if (result.success) {
                toast('节点导入成功');
                document.getElementById('node-link-dialog').open = false;
                input.value = '';
                this.update();
            } else {
                toast('导入失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            toast('导入失败: ' + error.message);
        }
    }
}
