import { exec, listPackages, getPackagesInfo } from 'kernelsu';
import { wrapInputStream } from 'webuix';
import { toast } from '../utils/toast.js';

/**
 * KernelSU Service - 封装与 KernelSU API 的交互
 */
export class KSUService {
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
            // 使用 pidof 检测 xray 进程是否运行
            const pidOutput = await this.exec(`pidof -s /data/adb/modules/netproxy/bin/xray 2>/dev/null || echo`);
            const isRunning = pidOutput.trim() !== '';
            const status = isRunning ? 'running' : 'stopped';

            // config 从 module.conf 读取
            const configOutput = await this.exec(`cat ${this.MODULE_PATH}/config/module.conf 2>/dev/null || echo`);
            const config = configOutput.match(/CURRENT_CONFIG="([^"]*)"/)?.[1] || '';

            return { status, config: config.split('/').pop() };
        } catch (error) {
            return { status: 'unknown', config: '' };
        }
    }

    // 启动服务
    static async startService() {
        await exec(`su -c "sh ${this.MODULE_PATH}/scripts/core/start.sh"`);
    }

    // 停止服务
    static async stopService() {
        await exec(`su -c "sh ${this.MODULE_PATH}/scripts/core/stop.sh"`);
    }

    // 获取配置文件列表（从 outbounds 目录）
    static async getConfigList() {
        try {
            const output = await this.exec(`ls ${this.MODULE_PATH}/config/xray/outbounds/*.json 2>/dev/null || echo`);
            return output.split('\n').filter(f => f).map(f => f.split('/').pop());
        } catch (error) {
            return [];
        }
    }

    static async deleteConfig(filename) {
        try {
            const cmd = `su -c "rm '${this.MODULE_PATH}/config/xray/outbounds/${filename}'"`;
            await exec(cmd);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }



    // 读取配置文件（从 outbounds 目录）
    static async readConfig(filename) {
        return await this.exec(`cat '${this.MODULE_PATH}/config/xray/outbounds/${filename}'`);
    }

    // 保存配置文件（到 outbounds 目录）
    static async saveConfig(filename, content) {
        const escaped = content.replace(/'/g, "'\\''");
        await this.exec(`echo '${escaped}' > '${this.MODULE_PATH}/config/xray/outbounds/${filename}'`);
    }

    // 从节点链接导入配置
    static async importFromNodeLink(nodeLink) {
        try {
            const cmd = `su -c "${this.MODULE_PATH}/scripts/config/url2json.sh '${nodeLink}'"`;
            const result = await exec(cmd);

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
            const cmd = `su -c "sh ${this.MODULE_PATH}/scripts/utils/update-xray.sh"`;
            const result = await exec(cmd);

            if (result.errno === 0) {
                const output = (result.stdout || '') + (result.stderr || '');


                if (output.includes('已是最新版本') || output.includes('无需更新')) {
                    return { success: true, isLatest: true, message: '已是最新版本，无需更新', output };
                } else if (output.includes('更新成功') || output.includes('========== 更新成功')) {
                    return { success: true, isLatest: false, message: '更新成功', output };
                } else {
                    return { success: true, isLatest: false, message: '操作完成', output };
                }
            } else {
                return { success: false, isLatest: false, message: '更新失败', error: result.stderr };
            }
        } catch (error) {
            console.error('Update Xray error:', error);
            return { success: false, isLatest: false, message: '更新失败', error: error.message };
        }
    }

    // 切换配置（支持热切换）
    static async switchConfig(filename) {
        const configPath = `${this.MODULE_PATH}/config/xray/outbounds/${filename}`;
        const { status } = await this.getStatus();

        if (status === 'running') {
            // 热切换：使用 Xray API 动态更新出站配置
            const result = await exec(`su -c "sh ${this.MODULE_PATH}/scripts/core/switch-config.sh '${configPath}'"`);
            if (result.errno !== 0) {
                throw new Error(result.stderr || '热切换失败');
            }
        } else {
            // 服务未运行：更新 module.conf 中的 CURRENT_CONFIG
            await this.exec(`sed -i 's|^CURRENT_CONFIG=.*|CURRENT_CONFIG="${configPath}"|' ${this.MODULE_PATH}/config/module.conf`);
        }
    }

    // 获取分应用代理模式 (blacklist/whitelist)
    static async getAppProxyMode() {
        try {
            const content = await this.exec(`cat ${this.MODULE_PATH}/config/tproxy.conf`);
            const match = content.match(/^APP_PROXY_MODE="?(\w+)"?/m);
            return match ? match[1] : 'blacklist';
        } catch (error) {
            return 'blacklist';
        }
    }

    // 设置分应用代理模式
    static async setAppProxyMode(mode) {
        await this.exec(`sed -i 's/^APP_PROXY_MODE=.*/APP_PROXY_MODE="${mode}"/' ${this.MODULE_PATH}/config/tproxy.conf`);
    }

    // 获取代理应用列表（包名）- 根据模式返回 BYPASS 或 PROXY 列表
    // 获取代理应用列表 - 返回 Array<{ packageName, userId }>
    static async getProxyApps() {
        try {
            const content = await this.exec(`cat ${this.MODULE_PATH}/config/tproxy.conf`);
            const mode = (content.match(/APP_PROXY_MODE="?(\w+)"?/) || [])[1] || 'blacklist';

            // 黑名单模式用 BYPASS_APPS_LIST，白名单模式用 PROXY_APPS_LIST
            const listKey = mode === 'blacklist' ? 'BYPASS_APPS_LIST' : 'PROXY_APPS_LIST';
            const match = content.match(new RegExp(`${listKey}="([^"]*)"`));

            if (match && match[1]) {
                return match[1].split(' ').filter(item => item.trim()).map(item => {
                    const parts = item.split(':');
                    if (parts.length === 2) {
                        return { userId: parts[0], packageName: parts[1] };
                    }
                    // 兼容旧格式 (纯包名)，默认为主用户 0
                    return { userId: '0', packageName: item };
                });
            }
            return [];
        } catch (error) {
            return [];
        }
    }

    // 添加代理应用 (userId:packageName)
    static async addProxyApp(packageName, userId = '0') {
        const content = await this.exec(`cat ${this.MODULE_PATH}/config/tproxy.conf`);
        const mode = (content.match(/APP_PROXY_MODE="?(\w+)"?/) || [])[1] || 'blacklist';
        const listKey = mode === 'blacklist' ? 'BYPASS_APPS_LIST' : 'PROXY_APPS_LIST';
        const match = content.match(new RegExp(`${listKey}="([^"]*)"`));
        const currentListStr = match ? match[1] : '';
        const currentList = currentListStr.split(' ').filter(i => i.trim());

        const newItem = `${userId}:${packageName}`;
        if (currentList.includes(newItem)) {
            return; // 已存在
        }

        const newList = currentList.length > 0 ? `${currentListStr} ${newItem}` : newItem;
        await this.exec(`sed -i 's/${listKey}="[^"]*"/${listKey}="${newList}"/' ${this.MODULE_PATH}/config/tproxy.conf`);
    }

    // 删除代理应用
    static async removeProxyApp(packageName, userId = '0') {
        const content = await this.exec(`cat ${this.MODULE_PATH}/config/tproxy.conf`);
        const mode = (content.match(/APP_PROXY_MODE="?(\w+)"?/) || [])[1] || 'blacklist';
        const listKey = mode === 'blacklist' ? 'BYPASS_APPS_LIST' : 'PROXY_APPS_LIST';
        const match = content.match(new RegExp(`${listKey}="([^"]*)"`));
        const currentListStr = match ? match[1] : '';
        const currentList = currentListStr.split(' ').filter(i => i.trim());

        const targetItem = `${userId}:${packageName}`;
        // 过滤掉完全匹配的项
        const newList = currentList.filter(item => {
            // 兼容处理：如果列表中是纯包名 (旧数据)，我们也尝试匹配
            if (item === packageName && userId === '0') return false;
            return item !== targetItem;
        }).join(' ');

        await this.exec(`sed -i 's/${listKey}="[^"]*"/${listKey}="${newList}"/' ${this.MODULE_PATH}/config/tproxy.conf`);
    }

    // 刷新 TProxy 规则（用于配置变更后即时生效）
    static async renewTProxy() {
        try {
            const result = await exec(`su -c "sh ${this.MODULE_PATH}/scripts/network/tproxy.sh restart"`);
            return { success: result.errno === 0, output: result.stdout };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ===================== 订阅管理 =====================

    // 获取所有订阅列表
    static async getSubscriptions() {
        try {
            const result = await this.exec(`find ${this.MODULE_PATH}/config/xray/outbounds -mindepth 1 -maxdepth 1 -type d -name 'sub_*' -exec basename {} \\;`);
            const subscriptions = [];

            for (const dir of result.split('\n').filter(d => d)) {
                const name = dir.replace(/^sub_/, '');
                try {
                    const metaContent = await this.exec(`cat ${this.MODULE_PATH}/config/xray/outbounds/${dir}/_meta.json`);
                    const meta = JSON.parse(metaContent);
                    const nodeCount = await this.exec(`find ${this.MODULE_PATH}/config/xray/outbounds/${dir} -name '*.json' ! -name '_meta.json' | wc -l`);
                    subscriptions.push({
                        name: meta.name || name,
                        dirName: dir,
                        url: meta.url,
                        updated: meta.updated,
                        nodeCount: parseInt(nodeCount.trim()) || 0
                    });
                } catch (e) {
                    // 无效订阅目录
                }
            }
            return subscriptions;
        } catch (error) {
            return [];
        }
    }

    // 添加订阅（后台执行，不阻塞 UI）
    static async addSubscription(name, url) {
        const statusFile = `${this.MODULE_PATH}/config/.sub_status`;

        // 清除旧状态文件
        await this.exec(`rm -f ${statusFile}`);

        // 后台运行脚本，完成后写入状态
        await exec(`su -c "nohup sh -c 'sh ${this.MODULE_PATH}/scripts/config/subscription.sh add \\"${name}\\" \\"${url}\\" && echo success > ${statusFile} || echo fail > ${statusFile}' > /dev/null 2>&1 &"`);

        // 轮询等待完成（最多 60 秒）
        return await this.waitForSubscriptionComplete(statusFile, 60000);
    }

    // 更新订阅（后台执行，不阻塞 UI）
    static async updateSubscription(name) {
        const statusFile = `${this.MODULE_PATH}/config/.sub_status`;

        // 清除旧状态文件
        await this.exec(`rm -f ${statusFile}`);

        // 后台运行脚本
        await exec(`su -c "nohup sh -c 'sh ${this.MODULE_PATH}/scripts/config/subscription.sh update \\"${name}\\" && echo success > ${statusFile} || echo fail > ${statusFile}' > /dev/null 2>&1 &"`);

        // 轮询等待完成
        return await this.waitForSubscriptionComplete(statusFile, 60000);
    }

    // 轮询等待订阅操作完成
    static async waitForSubscriptionComplete(statusFile, timeout) {
        const startTime = Date.now();
        const pollInterval = 500; // 每 500ms 检查一次

        while (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));

            // 使用 exec 直接调用，检查返回值而不是抛出异常
            const result = await exec(`cat ${statusFile} 2>/dev/null || echo ""`);
            const status = (result.stdout || '').trim();

            if (status === 'success') {
                await exec(`rm -f ${statusFile}`);
                return { success: true };
            } else if (status === 'fail') {
                await exec(`rm -f ${statusFile}`);
                throw new Error('订阅操作失败');
            }
            // 状态文件不存在或为空，继续等待
        }

        throw new Error('操作超时');
    }

    // 删除订阅
    static async removeSubscription(name) {
        const result = await exec(`su -c "sh ${this.MODULE_PATH}/scripts/config/subscription.sh remove '${name}'"`);
        if (result.errno !== 0) {
            throw new Error(result.stderr || '删除订阅失败');
        }
        return { success: true };
    }

    // 获取分组配置（包含默认分组和订阅分组）
    static async getConfigGroups() {
        const groups = [];
        const outboundsDir = `${this.MODULE_PATH}/config/xray/outbounds`;

        // 获取默认分组（直接在 outbounds 目录下的 json 文件）
        try {
            const defaultFiles = await this.exec(`find ${outboundsDir} -maxdepth 1 -name '*.json' -exec basename {} \\;`);
            const defaultConfigs = defaultFiles.split('\n').filter(f => f);
            if (defaultConfigs.length > 0) {
                groups.push({
                    type: 'default',
                    name: '默认分组',
                    dirName: '',
                    configs: defaultConfigs
                });
            }
        } catch (e) { }

        // 获取订阅分组
        const subscriptions = await this.getSubscriptions();
        for (const sub of subscriptions) {
            try {
                const files = await this.exec(`find ${outboundsDir}/${sub.dirName} -name '*.json' ! -name '_meta.json' -exec basename {} \\;`);
                groups.push({
                    type: 'subscription',
                    name: sub.name,
                    dirName: sub.dirName,
                    url: sub.url,
                    updated: sub.updated,
                    configs: files.split('\n').filter(f => f)
                });
            } catch (e) { }
        }

        return groups;
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

    static async getTproxyLog(lines = 100) {
        try {
            return await this.exec(`tail -n ${lines} ${this.MODULE_PATH}/logs/tproxy.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    static async getUpdateLog(lines = 100) {
        try {
            return await this.exec(`tail -n ${lines} ${this.MODULE_PATH}/logs/update.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    // 获取服务运行时间
    static async getUptime() {
        try {
            const result = await exec(`
                pid=$(pidof xray) || exit 1
                awk 'BEGIN {
                    getline u < "/proc/uptime"; split(u, a, " ")
                    getline s < "/proc/'"$pid"'/stat"; split(s, b, " ")
                    "getconf CLK_TCK" | getline h
                    t = int(a[1] - b[22] / h)
                    d = int(t / 86400); h = int((t % 86400) / 3600); m = int((t % 3600) / 60); s = t % 60
                    if (d > 0) printf "%d-%02d:%02d:%02d", d, h, m, s
                    else printf "%02d:%02d:%02d", h, m, s
                }'
            `);
            return (result.errno === 0 && result.stdout.trim()) ? result.stdout.trim() : '--';
        } catch (error) {
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

            await new Promise(resolve => setTimeout(resolve, 1000));

            const rx2Result = await exec(`awk '/:/ {sum+=$2} END {print sum}' /proc/net/dev`);
            const tx2Result = await exec(`awk '/:/ {sum+=$10} END {print sum}' /proc/net/dev`);

            const rx2 = parseInt(rx2Result.stdout.trim()) || 0;
            const tx2 = parseInt(tx2Result.stdout.trim()) || 0;

            const downloadSpeed = Math.max(0, Math.floor((rx2 - rx1) / 1024));
            const uploadSpeed = Math.max(0, Math.floor((tx2 - tx1) / 1024));

            return { download: `${downloadSpeed} KB/s`, upload: `${uploadSpeed} KB/s` };
        } catch (error) {
            console.error('Failed to get network speed:', error);
            return { download: '0 KB/s', upload: '0 KB/s' };
        }
    }

    // 获取Xray内存占用
    static async getMemoryUsage() {
        try {
            const result = await exec(`ps -o rss,comm | grep xray | grep -v grep | awk '{sum+=$1} END {print sum}'`);
            if (result.errno !== 0 || !result.stdout || result.stdout.trim() === '') {
                return '--';
            }

            const memoryKB = parseInt(result.stdout.trim()) || 0;
            if (memoryKB === 0) return '--';

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

    // 获取ping延迟
    static async getPingLatency(host) {
        try {
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
    // 获取已安装应用列表
    static async getUsers() {
        try {
            const output = await this.exec('pm list users');
            const users = [];
            // Output format:
            // Users:
            // 	UserInfo{0:Owner:13} running
            // 	UserInfo{999:MultiApp:4001010} running
            const lines = output.split('\n');
            for (const line of lines) {
                const match = line.match(/UserInfo\{(\d+):([^:]+):/);
                if (match) {
                    users.push({
                        id: match[1],
                        name: match[2]
                    });
                }
            }
            return users;
        } catch (error) {
            console.error('Failed to get users:', error);
            return [{ id: '0', name: 'Owner' }];
        }
    }

    static async getInstalledApps(userId = '0', showSystem = false) {
        // 构建 pm options
        // if showSystem is true -> list packages -s (仅系统)
        // if showSystem is false -> list packages -3 (仅第三方)

        const filter = showSystem ? '-s' : '-3';
        const cmd = `pm list packages --user ${userId} ${filter}`;

        try {
            const output = await this.exec(cmd);
            const lines = output.split('\n');
            const apps = [];

            for (const line of lines) {
                // package:com.android.chrome
                const packageName = line.replace(/^package:/, '').trim();
                if (!packageName) continue;

                apps.push({
                    packageName: packageName,
                    appLabel: packageName, // 懒加载 Label
                    userId: userId,
                    icon: null // 懒加载 Icon
                });
            }


            // 3. 增强应用信息 (Label, Icon)
            // 场景 A: WebUI X 环境
            if (typeof $packageManager !== 'undefined' && apps.length > 0) {
                // 仅仅对前 N 个进行同步获取，避免阻塞？ 或者全部异步获取？
                // 批量获取应用信息

                const enrichedApps = await Promise.all(apps.map(async app => {
                    try {
                        const info = $packageManager.getApplicationInfo(app.packageName, 0, parseInt(app.userId));
                        let label = app.packageName;
                        if (info.getLabel && typeof info.getLabel === 'function') label = info.getLabel();
                        else if (info.loadLabel && typeof info.loadLabel === 'function') label = info.loadLabel($packageManager);
                        else if (info.label) label = info.label;
                        else if (info.toString() !== '[object Object]') label = info.toString();

                        app.appLabel = label || app.packageName;
                        // Icon 依然懒加载
                    } catch (e) {
                        // 忽略错误，保持原样
                    }
                    return app;
                }));
                return enrichedApps;
            }

            // 场景 B: KSU API 环境 (getPackagesInfo)
            // 尝试用 KSU API 获取 Label/Icon
            try {
                // 仅对 main user 或者 unique package names 请求
                const uniquePkgs = [...new Set(apps.map(a => a.packageName))];
                if (uniquePkgs.length > 0) {
                    const infos = await getPackagesInfo(uniquePkgs);
                    const infoMap = new Map();
                    infos.forEach(i => infoMap.set(i.packageName, i));

                    apps.forEach(app => {
                        const info = infoMap.get(app.packageName);
                        if (info) {
                            app.appLabel = info.appLabel || app.appLabel;
                            // KSU API 返回的 icon 是 ksu://icon/...
                            app.icon = `ksu://icon/${app.packageName}`;
                        }
                    });
                }
            } catch (e) {
                console.warn('Failed to fetch details via KSU API:', e);
            }

            return apps;
        } catch (error) {
            console.error('Failed to get installed apps:', error);
            return [];
        }
    }

    // 补充 fetchAppDetails 用于懒加载或者增强信息
    static async fetchAppDetails(apps) {
        // 1. 尝试 WebUI X 环境 
        if (typeof $packageManager !== 'undefined') {
            await Promise.all(apps.map(async app => {
                try {
                    const info = $packageManager.getApplicationInfo(app.packageName, 0, parseInt(app.userId));
                    let label = app.packageName;
                    if (info.getLabel && typeof info.getLabel === 'function') label = info.getLabel();
                    else if (info.loadLabel && typeof info.loadLabel === 'function') label = info.loadLabel($packageManager);
                    else if (info.label) label = info.label;

                    app.appLabel = label || app.packageName;
                } catch (e) { }
            }));
            return apps;
        }

        // 2. 尝试 KSU API 环境
        try {
            const uniquePkgs = [...new Set(apps.map(a => a.packageName))];
            if (uniquePkgs.length > 0) {
                const infos = await getPackagesInfo(uniquePkgs);
                const infoMap = new Map();
                infos.forEach(i => infoMap.set(i.packageName, i));

                apps.forEach(app => {
                    const info = infoMap.get(app.packageName);
                    if (info) {
                        app.appLabel = info.appLabel || app.appLabel;
                        app.icon = `ksu://icon/${app.packageName}`;
                    }
                });
            }
        } catch (e) {
            console.warn('fetchAppDetails: KSU API failed', e);
        }

        return apps;
    }



    static iconCache = new Map();
    static iconLoadQueue = [];
    static activeIconLoads = 0;
    static MAX_CONCURRENT_ICON_LOADS = 4; // 限制并发数，避免旧版 WebUI X 阻塞

    static clearIconLoadQueue() {
        this.iconLoadQueue = [];
    }

    static async loadAppIcon(packageName) {
        if (this.iconCache.has(packageName)) {
            return this.iconCache.get(packageName);
        }

        if (typeof $packageManager === 'undefined') return null;

        return new Promise((resolve) => {
            this.iconLoadQueue.push({ packageName, resolve });
            this.processIconLoadQueue();
        });
    }

    static async processIconLoadQueue() {
        if (this.activeIconLoads >= this.MAX_CONCURRENT_ICON_LOADS || this.iconLoadQueue.length === 0) {
            return;
        }

        this.activeIconLoads++;
        const { packageName, resolve } = this.iconLoadQueue.shift();

        try {
            const base64 = await this._doLoadAppIcon(packageName);
            resolve(base64);
        } catch (e) {
            resolve(null);
        } finally {
            this.activeIconLoads--;
            // 使用 setTimeout 让出主线程，避免连续处理阻塞 UI
            setTimeout(() => this.processIconLoadQueue(), 0);
        }
    }

    static async _doLoadAppIcon(packageName) {
        try {
            const stream = $packageManager.getApplicationIcon(packageName, 0, 0);
            if (!stream) return null;

            const wrapped = await wrapInputStream(stream);
            const buffer = await wrapped.arrayBuffer();

            const base64 = 'data:image/png;base64,' + this.arrayBufferToBase64(buffer);

            this.iconCache.set(packageName, base64);
            return base64;
        } catch (e) {
            return null;
        }
    }

    static arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // ===================== 分应用代理总开关 =====================

    // 获取分应用代理启用状态
    static async getAppProxyEnabled() {
        try {
            const content = await this.exec(`cat ${this.MODULE_PATH}/config/tproxy.conf`);
            // APP_PROXY_ENABLE=1 or 0
            const match = content.match(/^APP_PROXY_ENABLE=(\d+)/m);
            return match ? match[1] === '1' : true; // 默认启用? 假设
        } catch (error) {
            return true;
        }
    }

    // 设置分应用代理启用状态
    static async setAppProxyEnabled(enabled) {
        const val = enabled ? '1' : '0';
        await this.exec(`sed -i 's/^APP_PROXY_ENABLE=.*/APP_PROXY_ENABLE=${val}/' ${this.MODULE_PATH}/config/tproxy.conf`);
    }

    // ===================== 代理开关设置 =====================

    // 获取代理开关设置
    static async getProxySettings() {
        try {
            const content = await this.exec(`cat ${this.MODULE_PATH}/config/tproxy.conf`);
            const settings = {};
            const keys = ['PROXY_MOBILE', 'PROXY_WIFI', 'PROXY_HOTSPOT', 'PROXY_USB', 'PROXY_TCP', 'PROXY_UDP', 'PROXY_IPV6'];

            for (const key of keys) {
                const match = content.match(new RegExp(`${key}=(\\d+)`));
                settings[key.toLowerCase()] = match ? match[1] === '1' : false;
            }
            return settings;
        } catch (error) {
            return {
                proxy_mobile: true,
                proxy_wifi: true,
                proxy_hotspot: false,
                proxy_usb: false,
                proxy_tcp: true,
                proxy_udp: true,
                proxy_ipv6: false
            };
        }
    }

    // 设置代理开关
    static async setProxySetting(key, value) {
        const upperKey = key.toUpperCase();
        const numValue = value ? '1' : '0';
        await this.exec(`sed -i 's/${upperKey}=.*/${upperKey}=${numValue}/' ${this.MODULE_PATH}/config/tproxy.conf`);
        return { success: true };
    }

    // 获取代理模式 (0=自动, 1=TPROXY, 2=REDIRECT)
    static async getProxyMode() {
        try {
            const content = await this.exec(`cat ${this.MODULE_PATH}/config/tproxy.conf`);
            const match = content.match(/PROXY_MODE=(\d+)/);
            return match ? parseInt(match[1]) : 0;
        } catch (error) {
            return 0;
        }
    }

    // 设置代理模式
    static async setProxyMode(value) {
        await this.exec(`sed -i 's/^PROXY_MODE=.*/PROXY_MODE=${value}/' ${this.MODULE_PATH}/config/tproxy.conf`);
        return { success: true };
    }

    // ===================== 模块设置 =====================

    // 获取模块设置
    static async getModuleSettings() {
        try {
            const content = await this.exec(`cat ${this.MODULE_PATH}/config/module.conf`);
            const settings = {};

            const autoStartMatch = content.match(/AUTO_START=(\d+)/);
            settings.auto_start = autoStartMatch ? autoStartMatch[1] === '1' : true;

            const oneplusFixMatch = content.match(/ONEPLUS_A16_FIX=(\d+)/);
            settings.oneplus_a16_fix = oneplusFixMatch ? oneplusFixMatch[1] === '1' : true;

            return settings;
        } catch (error) {
            return {
                auto_start: true,
                oneplus_a16_fix: true
            };
        }
    }

    // 设置模块选项
    static async setModuleSetting(key, value) {
        const upperKey = key.toUpperCase();
        const numValue = value ? '1' : '0';
        await this.exec(`sed -i 's/${upperKey}=.*/${upperKey}=${numValue}/' ${this.MODULE_PATH}/config/module.conf`);
        return { success: true };
    }

    // 执行 OnePlus A16 兼容性修复脚本
    static async executeOneplusFix() {
        const result = await exec(`su -c "sh ${this.MODULE_PATH}/scripts/utils/oneplus_a16_fix.sh"`);
        if (result.errno !== 0) {
            throw new Error(result.stderr || '执行修复脚本失败');
        }
        return { success: true };
    }

    // 打开外部浏览器
    static async openExternalUrl(url) {
        await exec(`am start -a android.intent.action.VIEW -d "${url}"`);
    }

    // ===================== DNS 配置管理 =====================

    // 获取 DNS 配置
    static async getDnsConfig() {
        try {
            const output = await this.exec(`cat ${this.MODULE_PATH}/config/xray/confdir/02_dns.json`);
            return JSON.parse(output);
        } catch (error) {
            console.error('获取 DNS 配置失败:', error);
            return { dns: { hosts: {}, servers: [] } };
        }
    }

    // 保存 DNS 配置
    static async saveDnsConfig(config) {
        try {
            const json = JSON.stringify(config, null, 4);
            const base64 = btoa(unescape(encodeURIComponent(json)));
            await this.exec(`echo '${base64}' | base64 -d > ${this.MODULE_PATH}/config/xray/confdir/02_dns.json`);
            return { success: true };
        } catch (error) {
            console.error('保存 DNS 配置失败:', error);
            return { success: false, error: error.message };
        }
    }

    // ===================== 路由规则管理 =====================

    // 获取路由规则列表
    static async getRoutingRules() {
        try {
            const output = await this.exec(`cat ${this.MODULE_PATH}/config/routing_rules.json`);
            return JSON.parse(output);
        } catch (error) {
            console.error('获取路由规则失败:', error);
            return [];
        }
    }

    // 保存路由规则列表
    static async saveRoutingRules(rules) {
        try {
            const json = JSON.stringify(rules, null, 4);
            // 使用 base64 编码避免特殊字符问题
            const base64 = btoa(unescape(encodeURIComponent(json)));
            await this.exec(`echo '${base64}' | base64 -d > ${this.MODULE_PATH}/config/routing_rules.json`);
            return { success: true };
        } catch (error) {
            console.error('保存路由规则失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 应用路由规则（在前端生成 routing.json）
    static async applyRoutingRules(rules) {
        try {
            // 构建路由规则数组
            const xrayRules = [];

            for (const rule of rules) {
                if (rule.enabled === false) continue;

                const xrayRule = { type: 'field' };

                // 处理 domain
                if (rule.domain) {
                    xrayRule.domain = rule.domain.split(',').map(d => {
                        d = d.trim();
                        if (d.startsWith('geosite:') || d.startsWith('domain:') || d.startsWith('full:') || d.startsWith('regexp:')) {
                            return d;
                        }
                        return `domain:${d}`;
                    });
                }

                // 处理 ip
                if (rule.ip) {
                    xrayRule.ip = rule.ip.split(',').map(i => i.trim());
                }

                // 处理 port
                if (rule.port) {
                    xrayRule.port = rule.port.trim();
                }

                // 处理 protocol
                if (rule.protocol) {
                    xrayRule.protocol = rule.protocol.split(',').map(p => p.trim());
                }

                // 处理 network
                if (rule.network) {
                    xrayRule.network = rule.network.trim();
                }

                // 设置 outboundTag
                xrayRule.outboundTag = rule.outboundTag || 'proxy';

                xrayRules.push(xrayRule);
            }

            // 添加固定的内部 DNS 规则
            xrayRules.push({
                type: 'field',
                inboundTag: ['domestic-dns'],
                outboundTag: 'direct'
            });
            xrayRules.push({
                type: 'field',
                inboundTag: ['dns-module'],
                outboundTag: 'proxy'
            });

            // 构建完整的路由配置
            const routingConfig = {
                routing: {
                    domainStrategy: 'AsIs',
                    rules: xrayRules
                }
            };

            // 使用 base64 编码写入文件
            const json = JSON.stringify(routingConfig, null, 4);
            const base64 = btoa(unescape(encodeURIComponent(json)));
            await this.exec(`echo '${base64}' | base64 -d > ${this.MODULE_PATH}/config/xray/confdir/03_routing.json`);

            return { success: true };
        } catch (error) {
            console.error('应用路由规则失败:', error);
            return { success: false, error: error.message };
        }
    }

    // ===================== 导出功能 =====================

    // 导出日志到 Download 目录
    static async exportLogs() {
        try {
            const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
            const filename = `netproxy_logs_${timestamp}.tar.gz`;
            const downloadPath = '/storage/emulated/0/Download';
            const outputPath = `${downloadPath}/${filename}`;

            // 确保 Download 目录存在
            await this.exec(`mkdir -p ${downloadPath}`);

            // 使用 tar 压缩 logs 文件夹
            await this.exec(`cd ${this.MODULE_PATH} && tar -czf ${outputPath} logs/`);

            return { success: true, path: outputPath };
        } catch (error) {
            console.error('导出日志失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 导出日志与配置到 Download 目录
    static async exportAll() {
        try {
            const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
            const filename = `netproxy_backup_${timestamp}.tar.gz`;
            const downloadPath = '/storage/emulated/0/Download';
            const outputPath = `${downloadPath}/${filename}`;

            // 确保 Download 目录存在
            await this.exec(`mkdir -p ${downloadPath}`);

            // 使用 tar 同时压缩 logs 和 config 文件夹
            await this.exec(`cd ${this.MODULE_PATH} && tar -czf ${outputPath} logs/ config/`);

            return { success: true, path: outputPath };
        } catch (error) {
            console.error('导出日志与配置失败:', error);
            return { success: false, error: error.message };
        }
    }
}
