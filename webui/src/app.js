import 'mdui';
import { setTheme, snackbar } from 'mdui';
import { exec, listPackages, getPackagesInfo } from 'kernelsu';

// Enhanced toast function with mdui snackbar
function toast(msg, closeable = false) {
    try {
        // 只使用 mdui snackbar，不使用 KSU 原生 toast
        snackbar({
            message: msg,
            closeable: closeable,
            timeout: closeable ? 0 : 3000,
            placement: 'bottom'
        });
    } catch (error) {
        console.error('Toast error:', error);
        // 备用方案：使用原生alert
        alert(msg);
    }
}

// ==================== KernelSU API 封装 ====================
class KSUService {
    static MODULE_PATH = '/data/adb/modules/netproxy';

    static async exec(command, options = {}) {
        try {
            const { errno, stdout, stderr } = await exec(command, options);
            if (errno !== 0) {
                throw new Error(stderr || 'Command execution failed');
            }
            return stdout.trim();
        } catch (error) {
            console.error('KSU exec error:', error);
            toast(error.message);
            throw error;
        }
    }

    // 获取服务状态
    static async getStatus() {
        try {
            const output = await this.exec(`cat ${this.MODULE_PATH}/config/status.yaml`);
            const status = output.match(/status:\s*"([^"]+)"/)?.[1] || 'unknown';
            const config = output.match(/config:\s*"([^"]+)"/)?.[1] || '';
            return { status, config: config.split('/').pop() };
        } catch (error) {
            return { status: 'unknown', config: '' };
        }
    }

    // 启动服务
    static async startService() {
        await exec(`su -c "sh ${this.MODULE_PATH}/scripts/start.sh"`);
    }

    // 停止服务
    static async stopService() {
        await exec(`su -c "sh ${this.MODULE_PATH}/scripts/stop.sh"`);
    }

    // 获取配置文件列表
    static async getConfigList() {
        try {
            const output = await this.exec(`ls ${this.MODULE_PATH}/config/xray/*.json 2>/dev/null || echo`);
            return output.split('\n').filter(f => f).map(f => f.split('/').pop());
        } catch (error) {
            return [];
        }
    }

    static async deleteConfig(filename) {
        console.log('>>> KSUService.deleteConfig START, filename:', filename);
        try {
            const cmd = `su -c "rm '${this.MODULE_PATH}/config/xray/${filename}'"`;
            console.log('>>> Executing command:', cmd);
            await exec(cmd);
            console.log('>>> Delete successful (no exception)');
            return { success: true };
        } catch (error) {
            console.error('>>> deleteConfig exception:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteUID(uid) {
        console.log('>>> KSUService.deleteUID START, uid:', uid);
        try {
            // 直接编辑uid_list.conf文件，删除指定UID行
            const uidListPath = `${this.MODULE_PATH}/config/uid_list.conf`;
            const cmd = `su -c "sed -i '/^${uid}$/d' '${uidListPath}'"`;
            console.log('>>> Executing command:', cmd);
            await exec(cmd);
            console.log('>>> Delete UID successful (no exception)');
            return { success: true };
        } catch (error) {
            console.error('>>> deleteUID exception:', error);
            return { success: false, error: error.message };
        }
    }

    // 即时应用iptables规则（添加UID）
    static async applyUIDIptables(uid) {
        try {
            console.log('Applying iptables rule for UID:', uid);
            // 添加 iptables 规则，让该UID的流量RETURN（不走代理）
            const cmd = `su -c "iptables -t nat -I OUTPUT -p tcp -m owner --uid-owner ${uid} -j RETURN"`;
            await exec(cmd);
            console.log('Iptables rule applied for UID:', uid);
            return { success: true };
        } catch (error) {
            console.error('Failed to apply iptables rule:', error);
            return { success: false, error: error.message };
        }
    }

    // 即时删除iptables规则（删除UID）
    static async removeUIDIptables(uid) {
        try {
            console.log('Removing iptables rule for UID:', uid);
            // 删除 iptables 规则
            const cmd = `su -c "iptables -t nat -D OUTPUT -p tcp -m owner --uid-owner ${uid} -j RETURN"`;
            await exec(cmd);
            console.log('Iptables rule removed for UID:', uid);
            return { success: true };
        } catch (error) {
            console.error('Failed to remove iptables rule:', error);
            return { success: false, error: error.message };
        }
    }

    // 读取配置文件
    static async readConfig(filename) {
        return await this.exec(`cat ${this.MODULE_PATH}/config/xray/${filename}`);
    }

    // 保存配置文件
    static async saveConfig(filename, content) {
        const escaped = content.replace(/'/g, "'\\''");
        await this.exec(`echo '${escaped}' > ${this.MODULE_PATH}/config/xray/${filename}`);
    }

    // 从节点链接导入配置
    static async importFromNodeLink(nodeLink) {
        try {
            console.log('Importing from node link...');
            const cmd = `su -c "${this.MODULE_PATH}/scripts/url2json.sh '${nodeLink}'"`;
            const result = await exec(cmd);
            console.log('Import result:', result);

            if (result.errno === 0) {
                return { success: true, output: result.stdout };
            } else {
                return { success: false, error: result.stderr || 'Import failed' };
            }
        } catch (error) {
            console.error('Import from node link error:', error);
            return { success: false, error: error.message };
        }
    }

    // 获取 Xray 版本号
    static async getXrayVersion() {
        try {
            const result = await exec(`${this.MODULE_PATH}/bin/xray version`);
            if (result.errno === 0) {
                // 解析: "Xray 25.12.8 (Xray, Penetrates Everything.)..."
                const match = result.stdout.match(/Xray\s+([\d.]+)/);
                return match ? match[1] : 'unknown';
            }
            return 'unknown';
        } catch (error) {
            console.error('Failed to get Xray version:', error);
            return 'unknown';
        }
    }

    // 检查并更新 Xray 内核
    static async updateXray() {
        try {
            const cmd = `su -c "sh ${this.MODULE_PATH}/scripts/update-xray.sh"`;
            const result = await exec(cmd);

            if (result.errno === 0) {
                // 合并 stdout 和 stderr 来检查（日志可能输出到 stderr）
                const output = (result.stdout || '') + (result.stderr || '');

                console.log('Update output:', output);  // 调试日志

                // 检查输出内容判断实际情况
                if (output.includes('已是最新版本') || output.includes('无需更新')) {
                    return {
                        success: true,
                        isLatest: true,
                        message: '已是最新版本，无需更新',
                        output: output
                    };
                } else if (output.includes('更新成功') || output.includes('========== 更新成功')) {
                    return {
                        success: true,
                        isLatest: false,
                        message: '更新成功',
                        output: output
                    };
                } else {
                    return {
                        success: true,
                        isLatest: false,
                        message: '操作完成',
                        output: output
                    };
                }
            } else {
                return {
                    success: false,
                    isLatest: false,
                    message: '更新失败',
                    error: result.stderr
                };
            }
        } catch (error) {
            console.error('Update Xray error:', error);
            return {
                success: false,
                isLatest: false,
                message: '更新失败',
                error: error.message
            };
        }
    }

    // 切换配置
    static async switchConfig(filename) {
        const { status } = await this.getStatus();
        if (status === 'running') {
            await this.stopService();
        }

        const newStatus = `status: "stopped"\nconfig: "${this.MODULE_PATH}/config/xray/${filename}"`;
        await this.exec(`echo '${newStatus}' > ${this.MODULE_PATH}/config/status.yaml`);
    }

    // 获取 UID 列表
    static async getUIDList() {
        try {
            const output = await this.exec(`cat ${this.MODULE_PATH}/config/uid_list.conf`);
            return output.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#') && !line.startsWith('//'))
                .filter(line => /^\d+$/.test(line));
        } catch (error) {
            return [];
        }
    }

    // 添加 UID
    static async addUID(uid) {
        const list = await this.getUIDList();
        if (list.includes(uid)) {
            throw new Error('UID 已存在');
        }
        await this.exec(`echo '${uid}' >> ${this.MODULE_PATH}/config/uid_list.conf`);
    }

    // 删除 UID
    static async removeUID(uid) {
        const list = await this.getUIDList();
        const newList = list.filter(u => u !== uid).join('\n');
        await this.exec(`echo '${newList}' > ${this.MODULE_PATH}/config/uid_list.conf`);
    }

    // 获取日志
    static async getServiceLog(lines = 100) {
        try {
            return await this.exec(`tail -n ${lines} ${this.MODULE_PATH}/logs/service.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    static async getXrayLog(lines = 100) {
        try {
            return await this.exec(`tail -n ${lines} ${this.MODULE_PATH}/logs/xray.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    // 获取服务运行时间
    static async getUptime() {
        try {
            console.log('getUptime: trying ps command...');
            // 方法1: 直接查找 xray 进程
            const result = await exec(`ps -o etime= -C xray 2>/dev/null | head -1 | tr -d ' '`);
            console.log('getUptime: method 1 - errno:', result.errno, 'stdout:', result.stdout);

            if (result.errno === 0 && result.stdout.trim()) {
                const uptime = result.stdout.trim();
                console.log('getUptime: success, uptime:', uptime);
                return uptime;
            }

            console.log('getUptime: method 1 failed, trying fallback...');
            // 方法2: 备用方法
            const fallback = await exec(`ps -eo etime,comm | grep xray | grep -v grep | head -1 | awk '{print $1}'`);
            console.log('getUptime: method 2 - errno:', fallback.errno, 'stdout:', fallback.stdout);

            if (fallback.errno === 0 && fallback.stdout.trim()) {
                const uptime = fallback.stdout.trim();
                console.log('getUptime: fallback success, uptime:', uptime);
                return uptime;
            }

            console.warn('getUptime: both methods failed');
            return '--';
        } catch (error) {
            console.error('getUptime: error -', error);
            return '--';
        }
    }

    // 获取实时网速
    static async getNetworkSpeed() {
        try {
            const rx1Result = await exec(`awk '/:/ {sum+=$2} END {print sum}' /proc/net/dev`);
            const tx1Result = await exec(`awk '/:/ {sum+=$10} END {print sum}' /proc/net/dev`);

            if (rx1Result.errno !== 0 || tx1Result.errno !== 0) {
                return { download: '0 KB/s', upload: '0 KB/s' };
            }

            const rx1 = parseInt(rx1Result.stdout.trim()) || 0;
            const tx1 = parseInt(tx1Result.stdout.trim()) || 0;

            // 等待1秒
            await new Promise(resolve => setTimeout(resolve, 1000));

            const rx2Result = await exec(`awk '/:/ {sum+=$2} END {print sum}' /proc/net/dev`);
            const tx2Result = await exec(`awk '/:/ {sum+=$10} END {print sum}' /proc/net/dev`);

            const rx2 = parseInt(rx2Result.stdout.trim()) || 0;
            const tx2 = parseInt(tx2Result.stdout.trim()) || 0;

            const downloadSpeed = Math.max(0, Math.floor((rx2 - rx1) / 1024));
            const uploadSpeed = Math.max(0, Math.floor((tx2 - tx1) / 1024));

            return {
                download: `${downloadSpeed} KB/s`,
                upload: `${uploadSpeed} KB/s`
            };
        } catch (error) {
            console.error('Failed to get network speed:', error);
            return { download: '0 KB/s', upload: '0 KB/s' };
        }
    }

    // 获取Xray内存占用
    static async getMemoryUsage() {
        try {
            // 使用ps命令获取xray进程的内存使用（RSS in KB）
            const result = await exec(`ps -o rss,comm | grep xray | grep -v grep | awk '{sum+=$1} END {print sum}'`);
            if (result.errno !== 0 || !result.stdout || result.stdout.trim() === '') {
                return '--';
            }

            const memoryKB = parseInt(result.stdout.trim()) || 0;

            if (memoryKB === 0) {
                return '--';
            }

            // 转换为合适的单位
            if (memoryKB > 1024) {
                return `${(memoryKB / 1024).toFixed(1)} MB`;
            } else {
                return `${memoryKB} KB`;
            }
        } catch (error) {
            console.error('Get memory usage error:', error);
            return '--';
        }
    }

    // 获取ping延迟（优化版本）
    static async getPingLatency(host) {
        try {
            // 使用单次 ping，1秒超时
            const result = await exec(`ping -c 1 -W 1 ${host} 2>&1 | grep 'time=' | awk -F 'time=' '{print $2}' | awk '{print $1}'`);

            if (result.errno === 0 && result.stdout.trim()) {
                const latency = parseFloat(result.stdout.trim());
                if (!isNaN(latency)) {
                    return `${Math.round(latency)} ms`;
                }
            }

            return '超时';
        } catch (error) {
            console.error(`Failed to ping ${host}:`, error);
            return '失败';
        }
    }

    // 获取已安装应用列表
    static async getInstalledApps() {
        try {
            const packages = await listPackages('user');
            const appsInfo = await getPackagesInfo(packages);

            return appsInfo.map(app => ({
                packageName: app.packageName,
                appLabel: app.appLabel,
                uid: app.uid,
                icon: `ksu://icon/${app.packageName}`
            }));
        } catch (error) {
            console.error('Failed to get apps:', error);
            return [];
        }
    }
}

// ==================== UI 管理 ====================
class UI {
    constructor() {
        this.currentPage = 'status';
        this.currentTheme = localStorage.getItem('theme') || 'auto';
        this.uptimeStartTime = null;  // 记录服务启动时间
        this.uptimeInterval = null;   // 运行时间更新定时器
        this.init();
    }

    init() {
        console.log('Initializing UI...');
        // 确保DOM加载完成后初始化MDUI组件
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeMDUI();
            });
        } else {
            this.initializeMDUI();
        }
        
        console.log('Step: setupNavigation');
        this.setupNavigation();
        console.log('Step: setupFAB');
        this.setupFAB();
        console.log('Step: setupThemeToggle');
        this.setupThemeToggle();
        console.log('Step: setupDialogs');
        this.setupDialogs();
        console.log('Step: setupAppSelector');
        this.setupAppSelector();

        console.log('Step: calling updateAllPages()');
        try {
            this.updateAllPages();
            console.log('updateAllPages() called successfully');
        } catch (error) {
            console.error('ERROR calling updateAllPages():', error);
        }

        console.log('Step: setting up auto-refresh interval');
        // 设置自动刷新 - 每5秒更新状态页
        setInterval(() => {
            const statusPage = document.getElementById('status-page');
            if (statusPage && statusPage.classList.contains('active')) {
                this.updateStatusPage();
            }
        }, 5000);

        console.log('Step: setting up latency button');
        // 延迟检测按钮 - 使用延迟绑定确保DOM已加载
        setTimeout(() => {
            const latencyBtn = document.getElementById('refresh-latency-btn');
            if (latencyBtn) {
                latencyBtn.addEventListener('click', () => {
                    console.log('Refreshing latency...');
                    latencyBtn.disabled = true;
                    latencyBtn.loading = true;

                    // 使用 setTimeout 避免 UI 卡顿
                    setTimeout(() => {
                        this.refreshLatency();
                        // refreshLatency 内部会重新启用按钮
                    }, 50);
                });
                console.log('Latency button bound successfully');
            } else {
                console.error('Latency button not found!');
            }
        }, 100);

        console.log('=== init() completed ===');
    }
    
    // 初始化MDUI组件
    initializeMDUI() {
        console.log('Initializing MDUI components...');
        // MDUI 2.x使用Web Components，通常会自动初始化
        // 这里添加一些确保组件正确加载的逻辑
        
        // 检查关键组件是否已定义
        const requiredComponents = ['mdui-layout', 'mdui-top-app-bar', 'mdui-card', 'mdui-button'];
        requiredComponents.forEach(component => {
            if (customElements.get(component)) {
                console.log(`✅ Component ${component} is defined`);
            } else {
                console.warn(`⚠️ Component ${component} is not defined yet`);
            }
        });
        
        console.log('MDUI components initialization check completed');
    }

    setupNavigation() {
        const navBar = document.getElementById('nav-bar');
        navBar.addEventListener('change', (e) => {
            const pageName = e.target.value;
            this.switchPage(pageName);
        });

        // 设置清除调试日志按钮
        const clearDebugBtn = document.getElementById('clear-debug-btn');
        if (clearDebugBtn) {
            clearDebugBtn.addEventListener('click', () => {
                debugLogger.clear();
                toast('调试日志已清除');
            });
        }
    }

    switchPage(pageName) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(`${pageName}-page`).classList.add('active');
        this.currentPage = pageName;

        // 更新对应页面内容
        if (pageName === 'status') this.updateStatusPage();
        if (pageName === 'config') this.updateConfigPage();
        if (pageName === 'uid') this.updateUIDPage();
        if (pageName === 'logs') this.updateLogsPage();
        if (pageName === 'debug') debugLogger.updateUI();
    }

    setupFAB() {
        console.log('Step: setupFAB');
        const fab = document.getElementById('service-fab');

        fab.addEventListener('click', async () => {
            // 立即禁用按钮防止重复点击
            fab.disabled = true;

            try {
                const { status } = await KSUService.getStatus();

                if (status === 'running') {
                    // 立即更新UI显示停止中状态
                    fab.icon = 'sync';
                    fab.classList.add('rotating');
                    toast('正在停止服务...');

                    // 异步执行停止操作
                    setTimeout(async () => {
                        try {
                            await KSUService.stopService();
                            toast('服务已停止');
                            await this.updateStatusPage();
                        } catch (error) {
                            toast('停止失败: ' + error.message);
                        } finally {
                            fab.classList.remove('rotating');
                            fab.disabled = false;
                        }
                    }, 100);
                } else {
                    // 立即更新UI显示启动中状态
                    fab.icon = 'sync';
                    fab.classList.add('rotating');
                    toast('正在启动服务...');

                    // 异步执行启动操作
                    setTimeout(async () => {
                        try {
                            await KSUService.startService();
                            toast('服务已启动');
                            await this.updateStatusPage();
                        } catch (error) {
                            toast('启动失败: ' + error.message);
                        } finally {
                            fab.classList.remove('rotating');
                            fab.disabled = false;
                        }
                    }, 100);
                }
            } catch (error) {
                console.error('FAB error:', error);
                toast('操作失败: ' + error.message);
                fab.disabled = false;
            }
        });
    }

    async deleteConfig(filename) {
        try {
            console.log('deleteConfig called for:', filename);

            const confirmed = await this.confirm(`确定要删除配置文件 "${filename}" 吗？\n\n此操作不可恢复。`);
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
                this.updateConfigPage();
            } else {
                toast('删除失败: ' + (result?.error || '未知错误'));
            }
        } catch (error) {
            console.error('deleteConfig error:', error);
            toast('删除失败: ' + error.message);
        }
    }

    async deleteUID(uid, appName) {
        console.log('deleteUID called for:', uid, appName);

        // 使用prompt确认
        const userConfirmed = window.prompt(`输入 DELETE 来删除 "${appName}" (UID: ${uid})`, '');
        console.log('User input:', userConfirmed);

        if (userConfirmed !== 'DELETE') {
            console.log('User cancelled or wrong input');
            toast('删除已取消');
            return;
        }

        try {
            console.log('Calling KSUService.deleteUID...');
            const result = await KSUService.deleteUID(uid);
            console.log('DeleteUID result:', result);

            if (result && result.success) {
                toast('删除成功');
                this.updateUIDPage();
            } else {
                toast('删除失败: ' + (result?.error || '未知错误'));
            }
        } catch (error) {
            console.error('deleteUID error:', error);
            toast('删除失败: ' + error.message);
        }
    }

    setupThemeToggle() {
        const themeBtn = document.getElementById('theme-toggle');
        this.applyTheme(this.currentTheme);

        themeBtn.addEventListener('click', () => {
            const themes = ['light', 'dark', 'auto'];
            const currentIndex = themes.indexOf(this.currentTheme);
            this.currentTheme = themes[(currentIndex + 1) % themes.length];
            localStorage.setItem('theme', this.currentTheme);
            this.applyTheme(this.currentTheme);
            toast(`切换到${this.currentTheme === 'auto' ? '自动' : this.currentTheme === 'light' ? '浅色' : '深色'}主题`);
        });
    }

    applyTheme(theme) {
        if (theme === 'auto') {
            setTheme('auto');
        } else {
            setTheme(theme);
        }
    }

    setupDialogs() {
        // 配置添加按钮 - 显示导入选项菜单
        const importMenu = document.getElementById('import-menu');

        // 节点链接导入选项
        document.getElementById('import-node-link').addEventListener('click', () => {
            importMenu.open = false;
            document.getElementById('node-link-dialog').open = true;
        });

        // 完整配置导入选项
        document.getElementById('import-full-config').addEventListener('click', () => {
            importMenu.open = false;
            this.showConfigDialog();
        });

        // 节点链接对话框
        document.getElementById('node-link-cancel').addEventListener('click', () => {
            document.getElementById('node-link-dialog').open = false;
        });

        document.getElementById('node-link-save').addEventListener('click', async () => {
            await this.importNodeLink();
        });

        document.getElementById('config-cancel-btn').addEventListener('click', () => {
            document.getElementById('config-dialog').open = false;
        });

        // UID 对话框
        document.getElementById('uid-cancel-btn').addEventListener('click', () => {
            document.getElementById('uid-dialog').open = false;
        });
        document.getElementById('config-save-btn').addEventListener('click', async () => {
            await this.saveConfig();
        });

        // 应用选择器
        document.getElementById('app-selector-cancel').addEventListener('click', () => {
            document.getElementById('app-selector-dialog').open = false;
        });

        document.getElementById('app-selector-search').addEventListener('input', (e) => {
            this.filterApps(e.target.value);
        });

        // 日志刷新
        const serviceLogBtn = document.getElementById('refresh-service-log');
        if (serviceLogBtn) {
            serviceLogBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止触发折叠
                this.loadServiceLog();
            });
        }

        const xrayLogBtn = document.getElementById('refresh-xray-log');
        if (xrayLogBtn) {
            xrayLogBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止触发折叠
                this.loadXrayLog();
            });
        }

        // 检查更新按钮
        const checkUpdateBtn = document.getElementById('check-update-btn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => {
                checkUpdateBtn.disabled = true;
                checkUpdateBtn.loading = true;

                // 使用 setTimeout 避免 UI 卡顿，让浏览器先渲染 loading 状态
                setTimeout(async () => {
                    try {
                        const result = await KSUService.updateXray();

                        if (result.success) {
                            toast(result.message, true);

                            // 只在真正更新成功时才刷新页面
                            if (!result.isLatest) {
                                setTimeout(() => this.updateStatusPage(), 1500);
                            }
                        } else {
                            toast('更新失败: ' + (result.error || result.message), true);
                        }
                    } catch (error) {
                        toast('检查失败: ' + error.message, true);
                    } finally {
                        checkUpdateBtn.disabled = false;
                        checkUpdateBtn.loading = false;
                    }
                }, 50);
            });
        }
    }

    setupAppSelector() {
        console.log('>> setupAppSelector: START');
        try {
            const searchInput = document.getElementById('app-search');
            console.log('   searchInput:', searchInput ? 'FOUND' : 'NOT FOUND');

            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.filterApps(e.target.value);
                });
            }

            const addAppBtn = document.getElementById('add-uid-btn');
            console.log('   addAppBtn:', addAppBtn ? 'FOUND' : 'NOT FOUND');

            if (addAppBtn) {
                addAppBtn.addEventListener('click', () => {
                    this.showAppSelector();
                });
            }

            console.log('>> setupAppSelector: COMPLETED');
        } catch (error) {
            console.error('>> setupAppSelector: ERROR -', error);
        }
    }

    async confirm(message) {
        console.log('=== confirm() START ===');
        console.log('confirm called with message:', message);

        return new Promise((resolve) => {
            console.log('Inside Promise executor');

            const dialog = document.getElementById('confirm-dialog');
            console.log('dialog element:', dialog);

            const messageEl = document.getElementById('confirm-message');
            console.log('messageEl:', messageEl);

            const okBtn = document.getElementById('confirm-ok-btn');
            console.log('okBtn:', okBtn);

            const cancelBtn = document.getElementById('confirm-cancel-btn');
            console.log('cancelBtn:', cancelBtn);

            if (!dialog || !messageEl || !okBtn || !cancelBtn) {
                console.error('Some dialog elements not found!');
                resolve(false);
                return;
            }

            // 设置消息（保留换行符）
            messageEl.innerHTML = message.replace(/\n/g, '<br>');
            console.log('Message set to:', messageEl.innerHTML);

            // 移除旧的事件监听器
            const newOkBtn = okBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOkBtn, okBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            console.log('Event listeners cloned');

            // 添加新的事件监听器
            newOkBtn.addEventListener('click', () => {
                console.log('OK button clicked - User confirmed');
                dialog.open = false;
                resolve(true);
            });

            newCancelBtn.addEventListener('click', () => {
                console.log('Cancel button clicked - User cancelled');
                dialog.open = false;
                resolve(false);
            });

            // 显示对话框
            console.log('Opening dialog...');
            dialog.open = true;
            console.log('Dialog opened, waiting for user action');
        });
    }

    // ==================== 应用选择器 ====================
    async showAppSelector() {
        const dialog = document.getElementById('app-selector-dialog');
        const listEl = document.getElementById('app-selector-list');

        dialog.open = true;

        // 显示骨架屏
        this.showSkeleton(listEl, 5);

        try {
            this.allApps = await KSUService.getInstalledApps();
            this.renderAppList(this.allApps);
        } catch (error) {
            listEl.innerHTML = '<mdui-list-item><div slot="headline">加载失败</div></mdui-list-item>';
            toast('加载应用列表失败: ' + error.message, true);
        }
    }

    renderAppList(apps) {
        const listEl = document.getElementById('app-selector-list');

        if (apps.length === 0) {
            listEl.innerHTML = '<mdui-list-item><div slot="headline">没有找到应用</div></mdui-list-item>';
            return;
        }

        listEl.innerHTML = '';
        apps.forEach(app => {
            const item = document.createElement('mdui-list-item');
            item.setAttribute('clickable', '');
            item.setAttribute('headline', app.appLabel);
            item.setAttribute('description', `UID: ${app.uid}`);

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
            }

            item.addEventListener('click', async () => {
                try {
                    await KSUService.addUID(app.uid.toString());

                    // 检查服务是否运行，如果运行则即时应用iptables规则
                    const { status } = await KSUService.getStatus();
                    if (status === 'running') {
                        const result = await KSUService.applyUIDIptables(app.uid.toString());
                        if (result.success) {
                            toast(`已添加 ${app.appLabel} 并即时生效`);
                        } else {
                            toast(`已添加 ${app.appLabel}，但规则应用失败`);
                        }
                    } else {
                        toast(`已添加 ${app.appLabel}`);
                    }

                    document.getElementById('app-selector-dialog').open = false;
                    this.updateUIDPage();
                } catch (error) {
                    if (error.message.includes('已存在')) {
                        toast('该应用已在白名单中');
                    } else {
                        toast('添加失败: ' + error.message, true);
                    }
                }
            });

            listEl.appendChild(item);
        });
    }

    filterApps(query) {
        if (!this.allApps) return;

        const filtered = this.allApps.filter(app =>
            app.appLabel.toLowerCase().includes(query.toLowerCase()) ||
            app.packageName.toLowerCase().includes(query.toLowerCase()) ||
            app.uid.toString().includes(query)
        );

        this.renderAppList(filtered);
    }

    showSkeleton(container, count = 3) {
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const item = document.createElement('mdui-list-item');
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 0;">
                    <div class="skeleton skeleton-circle" style="width: 40px; height: 40px;"></div>
                    <div style="flex: 1;">
                        <div class="skeleton skeleton-text" style="width: 60%; height: 16px; margin-bottom: 8px;"></div>
                        <div class="skeleton skeleton-text" style="width: 40%; height: 12px;"></div>
                    </div>
                </div>
            `;
            container.appendChild(item);
        }
    }

    updateAllPages() {
        console.log('=== updateAllPages() called ===');
        try {
            console.log('Calling updateStatusPage...');
            this.updateStatusPage();
            console.log('updateStatusPage call completed (async)');
        } catch (error) {
            console.error('Error in updateAllPages:', error);
        }
    }

    async updateStatusPage() {
        console.log('=== updateStatusPage() async function started ===');
        try {
            console.log('Step 1: Calling KSUService.getStatus()...');
            const { status, config } = await KSUService.getStatus();
            console.log(`Step 2: Status received - status: "${status}", config: "${config}"`);

            console.log('Step 3: Getting DOM elements...');
            // 更新新设计的状态徽章
            const statusBadgeDot = document.getElementById('status-badge-dot');
            const statusBadgeText = document.getElementById('status-badge-text');
            const statusDetail = document.getElementById('status-detail');
            const statusChip = document.getElementById('status-chip-new');

            console.log('Step 4: DOM elements found:', {
                statusBadgeDot: !!statusBadgeDot,
                statusBadgeText: !!statusBadgeText,
                statusDetail: !!statusDetail,
                statusChip: !!statusChip
            });

            if (status === 'running') {
                statusBadgeDot.className = 'status-badge-dot running';
                statusBadgeText.textContent = '运行中';
                statusChip.textContent = '正常';
                statusChip.style.display = '';
                statusChip.style.background = '';  // 使用默认颜色

                // 只在计时器未启动时获取运行时间并启动（避免每次刷新都重置）
                if (!this.uptimeInterval) {
                    console.log('Fetching uptime from server...');
                    const uptime = await KSUService.getUptime();
                    console.log('Received uptime:', uptime);

                    // 验证uptime是否有效
                    if (uptime && uptime !== '--' && uptime !== 'N/A' && !uptime.includes('failed')) {
                        this.startUptimeTimer(uptime);
                    } else {
                        console.warn('Invalid uptime received, showing fallback message');
                        statusDetail.textContent = '运行时间获取失败';
                    }
                } else {
                    console.log('Uptime timer already running, skipping fetch');
                }
                statusDetail.style.display = '';
            } else {
                statusBadgeDot.className = 'status-badge-dot stopped';
                statusBadgeText.textContent = '已停止';
                statusChip.textContent = '未启动';
                statusChip.style.display = '';
                statusChip.style.background = 'var(--mdui-color-error-container)';
                statusChip.style.color = 'var(--mdui-color-on-error-container)';
                statusDetail.textContent = '点击右下角按钮启动服务';
                statusDetail.style.display = '';

                // 停止运行时间计时器
                this.stopUptimeTimer();
            }

            // 更新配置
            document.getElementById('current-config-new').textContent = config || '无';

            // 更新 FAB 图标
            const fab = document.getElementById('service-fab');
            fab.icon = status === 'running' ? 'stop' : 'play_arrow';

            // 更新内存占用显示
            const memoryEl = document.getElementById('status-memory');
            if (memoryEl) {
                if (status === 'running') {
                    // 异步获取内存，不阻塞UI
                    KSUService.getMemoryUsage().then(memory => {
                        memoryEl.textContent = memory;
                    }).catch(() => {
                        memoryEl.textContent = '--';
                    });
                } else {
                    memoryEl.textContent = '--';
                }
            }

            // 异步更新网速
            KSUService.getNetworkSpeed().then(speed => {
                const downloadValue = speed.download.replace(' KB/s', '').trim();
                const uploadValue = speed.upload.replace(' KB/s', '').trim();

                document.getElementById('download-new').textContent = `${downloadValue} KB/s`;
                document.getElementById('upload-new').textContent = `${uploadValue} KB/s`;
            }).catch(error => {
                console.error('Failed to update network speed:', error);
            });

            // 异步获取 Xray 版本号
            KSUService.getXrayVersion().then(version => {
                document.getElementById('xray-version').textContent = version;
            }).catch(error => {
                console.error('Failed to get Xray version:', error);
                document.getElementById('xray-version').textContent = '--';
            });

            console.log('updateStatusPage() completed successfully');
        } catch (error) {
            console.error('Update status failed:', error);
            console.error('Error details:', error.message, error.stack);
        }
    }

    // 启动运行时间计时器
    startUptimeTimer(uptimeString) {
        console.log('startUptimeTimer called with:', uptimeString);

        // 解析运行时间字符串
        // 支持格式: "04:38" (分:秒), "01:23:45" (时:分:秒), "2-03:45:12" (天-时:分:秒)
        const parts = uptimeString.split(/[-:]/);
        console.log('Parsed parts:', parts);

        let totalSeconds = 0;

        if (parts.length === 4) {
            // 天-时:分:秒
            totalSeconds = parseInt(parts[0]) * 86400 + parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + parseInt(parts[3]);
            console.log('Format: days-hours:minutes:seconds, totalSeconds:', totalSeconds);
        } else if (parts.length === 3) {
            // 时:分:秒
            totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
            console.log('Format: hours:minutes:seconds, totalSeconds:', totalSeconds);
        } else if (parts.length === 2) {
            // 分:秒
            totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
            console.log('Format: minutes:seconds, totalSeconds:', totalSeconds);
        } else {
            console.error('Unexpected uptime format, parts count:', parts.length);
        }
        this.uptimeStartTime = Date.now() - (totalSeconds * 1000);
        console.log('Calculated uptimeStartTime:', new Date(this.uptimeStartTime).toLocaleString());

        // 清除旧的计时器
        if (this.uptimeInterval) {
            clearInterval(this.uptimeInterval);
            console.log('Cleared existing interval');
        }

        // 立即更新一次
        this.updateUptimeDisplay();

        // 每秒更新一次
        this.uptimeInterval = setInterval(() => {
            this.updateUptimeDisplay();
        }, 1000);

        console.log('Uptime timer started successfully');
    }

    stopUptimeTimer() {
        if (this.uptimeInterval) {
            clearInterval(this.uptimeInterval);
            this.uptimeInterval = null;
        }
        this.uptimeStartTime = null;
    }

    updateUptimeDisplay() {
        if (!this.uptimeStartTime) return;

        const elapsed = Math.floor((Date.now() - this.uptimeStartTime) / 1000);
        const days = Math.floor(elapsed / 86400);
        const hours = Math.floor((elapsed % 86400) / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;

        let uptimeStr = '';
        if (days > 0) {
            uptimeStr = `${days}-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            uptimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        const statusDetail = document.getElementById('status-detail');
        if (statusDetail) {
            statusDetail.textContent = `运行 ${uptimeStr}`;
        }
    }

    // 手动刷新延迟检测
    async refreshLatency() {
        console.log('Starting latency detection...');

        const btn = document.getElementById('refresh-latency-btn');
        if (btn) {
            btn.disabled = true;  // 禁用按钮防止重复点击
        }

        // 重置为检测中状态
        const sites = ['baidu', 'google', 'github'];
        sites.forEach(site => {
            const valueEl = document.getElementById(`latency-${site}-compact`);
            valueEl.className = 'latency-value-horizontal';
            valueEl.textContent = '...';
        });

        // 异步检测各个站点（不阻塞UI） - 使用非阻塞方式
        sites.forEach(async (site) => {
            try {
                const domain = site === 'baidu' ? 'baidu.com' :
                    site === 'google' ? '8.8.8.8' : 'github.com';
                console.log(`Pinging ${site}...`);
                const latency = await KSUService.getPingLatency(domain);
                console.log(`${site} latency:`, latency);
                this.updateLatencyHorizontal(site, latency);
            } catch (error) {
                console.error(`Failed to get ${site} latency:`, error);
                this.updateLatencyHorizontal(site, null);
            }
        });

        // 重新启用按钮
        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.loading = false;
            }
        }, 1000);

        console.log('Latency detection initiated (non-blocking)');
    }

    // 更新横向延迟显示
    updateLatencyHorizontal(site, latencyText) {
        const valueEl = document.getElementById(`latency-${site}-compact`);
        valueEl.textContent = latencyText;

        // 解析延迟值并应用颜色
        const match = latencyText.match(/(\d+)/);
        if (match) {
            const latency = parseInt(match[1]);
            if (latency < 50) {
                valueEl.className = 'latency-value-horizontal excellent';
            } else if (latency < 150) {
                valueEl.className = 'latency-value-horizontal good';
            } else {
                valueEl.className = 'latency-value-horizontal poor';
            }
        } else {
            valueEl.className = 'latency-value-horizontal';
        }
    }

    async updateConfigPage() {
        try {
            const listEl = document.getElementById('config-list');

            // 显示骨架屏
            this.showSkeleton(listEl, 3);

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
                    await this.showConfigDialog(filename);
                });
                item.appendChild(editBtn);
                console.log(`Edit button added for ${filename}`);

                // 添加删除按钮（当前配置不可删除）
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

                // 点击列表项切换配置
                item.addEventListener('click', () => {
                    if (!isCurrent) {
                        console.log('Config clicked:', filename);
                        // 完全异步执行，立即返回
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

    async switchConfig(filename) {
        console.log('switchConfig executing for:', filename);

        try {
            // 记录服务是否正在运行
            const { status } = await KSUService.getStatus();
            const wasRunning = status === 'running';

            // 先停止服务
            if (wasRunning) {
                await KSUService.stopService();
            }

            // 切换配置
            await KSUService.switchConfig(filename);

            // 自动启动服务
            await KSUService.startService();

            // 只显示最终结果
            toast('已切换到: ' + filename);

            // 刷新页面
            await this.updateConfigPage();
            await this.updateStatusPage();
        } catch (error) {
            console.error('Switch config error:', error);
            toast('切换配置失败: ' + error.message);
        }
    }

    async updateUIDPage() {
        try {
            const listEl = document.getElementById('uid-list');

            // 显示骨架屏
            this.showSkeleton(listEl, 3);

            const uids = await KSUService.getUIDList();

            if (uids.length === 0) {
                listEl.innerHTML = '<mdui-list-item><div slot="headline">暂无白名单</div><div slot="supporting-text">点击上方按钮添加应用</div></mdui-list-item>';
                return;
            }

            // 获取所有应用信息以便匹配 UID
            let allApps = [];
            try {
                allApps = await KSUService.getInstalledApps();
                console.log(`Loaded ${allApps.length} apps for UID matching`);
            } catch (e) {
                console.warn('Failed to load app info:', e);
            }

            // 创建 UID 到应用的映射
            const uidToApp = {};
            allApps.forEach(app => {
                uidToApp[app.uid] = app;
            });

            listEl.innerHTML = '';
            uids.forEach(uid => {
                const item = document.createElement('mdui-list-item');
                const app = uidToApp[parseInt(uid)];

                console.log(`UID ${uid}:`, app ? app.appLabel : 'No app found');

                if (app) {
                    // 有应用信息，显示图标和名称
                    item.setAttribute('headline', app.appLabel);
                    item.setAttribute('description', `UID: ${uid} • ${app.packageName}`);

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
                    // 没有应用信息，只显示 UID
                    item.setAttribute('headline', `UID: ${uid}`);
                    item.setAttribute('description', '应用 UID 白名单');
                    item.setAttribute('icon', 'person');
                }

                // 添加删除按钮
                const deleteBtn = document.createElement('mdui-button-icon');
                deleteBtn.slot = 'end-icon';
                deleteBtn.setAttribute('icon', 'delete');
                deleteBtn.style.color = 'var(--mdui-color-error)';
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const appName = app ? app.appLabel : `UID ${uid}`;
                    await this.deleteUID(uid, appName);
                });
                item.appendChild(deleteBtn);

                listEl.appendChild(item);
            });
        } catch (error) {
            console.error('Update UID page failed:', error);
        }
    }

    async deleteUID(uid, appName) {
        if (await this.confirm(`确定要删除 ${appName} 吗？`)) {
            try {
                await KSUService.removeUID(uid);
                toast('已删除');
                this.updateUIDPage();
            } catch (error) {
                toast('删除失败: ' + error.message, true);
            }
        }
    }

    async updateLogsPage() {
        await this.loadServiceLog();
        await this.loadXrayLog();
    }

    async loadServiceLog() {
        try {
            const log = await KSUService.getServiceLog();
            document.getElementById('service-log').textContent = log;
        } catch (error) {
            document.getElementById('service-log').textContent = '加载失败';
        }
    }

    async loadXrayLog() {
        try {
            const log = await KSUService.getXrayLog();
            document.getElementById('xray-log').textContent = log;
        } catch (error) {
            document.getElementById('xray-log').textContent = '加载失败';
        }
    }

    async importNodeLink() {
        const input = document.getElementById('node-link-input');
        const nodeLink = input.value.trim();

        if (!nodeLink) {
            toast('请输入节点链接');
            return;
        }

        // 简单验证链接格式
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
                this.updateConfigPage();
            } else {
                toast('导入失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            console.error('Import node link error:', error);
            toast('导入失败: ' + error.message);
        }
    }

    async showConfigDialog(filename = null) {
        const dialog = document.getElementById('config-dialog');
        const filenameInput = document.getElementById('config-filename');
        const contentInput = document.getElementById('config-content');

        if (filename) {
            // 编辑模式
            filenameInput.value = filename;
            filenameInput.disabled = true;
            const content = await KSUService.readConfig(filename);
            contentInput.value = content;
        } else {
            // 新建模式
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
            this.updateConfigPage();
        } catch (error) {
            toast('保存失败: ' + error.message);
        }
    }
}


// 等待KernelSU环境准备好再初始化
function initializeApp() {
    console.log('Initializing app, checking KernelSU...');

    // 检查ksu对象是否可用
    if (typeof window.ksu !== 'undefined') {
        console.log('KernelSU available, creating UI');
        new UI();
    } else {
        console.log('KernelSU not ready yet, waiting 500ms...');
        setTimeout(() => {
            if (typeof window.ksu !== 'undefined') {
                console.log('KernelSU ready after delay');
            } else {
                console.warn('KernelSU still not detected');
            }
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
