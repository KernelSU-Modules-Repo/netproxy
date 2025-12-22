import { KSUService } from '../services/ksu-service.js';
import { toast } from '../utils/toast.js';

/**
 * 配置页面管理器
 */
export class ConfigPageManager {
    constructor(ui) {
        this.ui = ui;
    }

    async update() {
        try {
            const listEl = document.getElementById('config-list');

            // 显示骨架屏
            this.ui.showSkeleton(listEl, 3);

            const configs = await KSUService.getConfigList();
            const { config: currentConfig } = await KSUService.getStatus();

            if (configs.length === 0) {
                listEl.innerHTML = '<mdui-list-item><div slot="headline">暂无配置文件</div></mdui-list-item>';
                return;
            }

            listEl.innerHTML = '';
            configs.forEach(filename => {
                const item = document.createElement('mdui-list-item');
                item.setAttribute('clickable', '');
                item.setAttribute('headline', filename);
                item.setAttribute('icon', 'description');

                const isCurrent = filename === currentConfig;
                console.log(`Config: ${filename}, isCurrent: ${isCurrent}, currentConfig: ${currentConfig}`);

                if (isCurrent) {
                    const chip = document.createElement('mdui-chip');
                    chip.slot = 'end';
                    chip.textContent = '当前';
                    item.appendChild(chip);
                }

                const editBtn = document.createElement('mdui-button');
                editBtn.slot = 'end';
                editBtn.setAttribute('variant', 'text');
                editBtn.setAttribute('icon', 'edit');
                editBtn.textContent = '编辑';
                editBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.ui.showConfigDialog(filename);
                });
                item.appendChild(editBtn);
                console.log(`Edit button added for ${filename}`);

                if (!isCurrent) {
                    console.log(`Creating delete button for ${filename}`);
                    const deleteBtn = document.createElement('mdui-button-icon');
                    deleteBtn.slot = 'end-icon';
                    deleteBtn.setAttribute('icon', 'delete');
                    deleteBtn.style.color = 'var(--mdui-color-error)';
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        console.log(`Delete button clicked for ${filename}`);
                        await this.deleteConfig(filename);
                    });
                    item.appendChild(deleteBtn);
                    console.log(`Delete button added for ${filename}, element:`, deleteBtn);
                } else {
                    console.log(`Skipping delete button for current config: ${filename}`);
                }

                item.addEventListener('click', () => {
                    if (!isCurrent) {
                        console.log('Config clicked:', filename);
                        setTimeout(() => {
                            this.switchConfig(filename);
                        }, 0);
                    }
                });

                listEl.appendChild(item);
            });
        } catch (error) {
            console.error('Update config page failed:', error);
        }
    }

    async deleteConfig(filename) {
        try {
            console.log('deleteConfig called for:', filename);

            const confirmed = await this.ui.confirm(`确定要删除配置文件 "${filename}" 吗？\n\n此操作不可恢复。`);
            console.log('User confirmed:', confirmed);

            if (!confirmed) {
                console.log('User cancelled deletion');
                return;
            }

            console.log('Calling KSUService.deleteConfig...');
            const result = await KSUService.deleteConfig(filename);
            console.log('Delete result:', result);

            if (result && result.success) {
                toast('配置已删除');
                this.update();
            } else {
                toast('删除失败: ' + (result?.error || '未知错误'));
            }
        } catch (error) {
            console.error('deleteConfig error:', error);
            toast('删除失败: ' + error.message);
        }
    }

    async switchConfig(filename) {
        console.log('switchConfig executing for:', filename);

        try {
            const { status } = await KSUService.getStatus();
            const wasRunning = status === 'running';

            if (wasRunning) {
                await KSUService.stopService();
            }

            await KSUService.switchConfig(filename);
            await KSUService.startService();

            toast('已切换到: ' + filename);

            await this.update();
            await this.ui.statusPage.update();
        } catch (error) {
            console.error('Switch config error:', error);
            toast('切换配置失败: ' + error.message);
        }
    }

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
                "inbounds": [{ "port": 1080, "protocol": "socks" }],
                "outbounds": [{ "protocol": "freedom" }]
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
            JSON.parse(content); // 验证 JSON
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
            console.error('Import node link error:', error);
            toast('导入失败: ' + error.message);
        }
    }
}

