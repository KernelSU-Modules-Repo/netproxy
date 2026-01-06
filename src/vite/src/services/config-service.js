import { ShellService } from './shell-service.js';
import { exec } from 'kernelsu';

/**
 * Config Service - 节点页面相关业务逻辑
 */
export class ConfigService {
    // ==================== 配置文件管理 ====================

    // 获取分组配置
    static async getConfigGroups() {
        // 先获取默认分组
        const groups = [];
        const outboundsDir = `${ShellService.MODULE_PATH}/config/xray/outbounds`;

        try {
            const defaultFiles = await ShellService.exec(`find ${outboundsDir} -maxdepth 1 -name '*.json' -exec basename {} \\;`);
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
                const files = await ShellService.exec(`find ${outboundsDir}/${sub.dirName} -name '*.json' ! -name '_meta.json' -exec basename {} \\;`);
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

    // 读取配置文件（从 outbounds 目录）
    static async readConfig(filename) {
        return await ShellService.exec(`cat '${ShellService.MODULE_PATH}/config/xray/outbounds/${filename}'`);
    }

    // 批量读取多个配置文件的基本信息
    static async batchReadConfigInfos(filePaths) {
        if (!filePaths || filePaths.length === 0) return new Map();

        const basePath = `${ShellService.MODULE_PATH}/config/xray/outbounds`;
        const fileList = filePaths.map(f => `${basePath}/${f}`).join('\n');

        const result = await ShellService.exec(`
            while IFS= read -r f; do
                [ -z "$f" ] && continue
                echo "===FILE:$(basename "$f")==="
                head -30 "$f" 2>/dev/null | grep -E '"protocol"|"address"|"port"' | head -5
            done << 'EOF'
${fileList}
EOF
        `);

        if (!result) return new Map();

        const infoMap = new Map();
        const blocks = result.split('===FILE:').filter(b => b.trim());

        for (const block of blocks) {
            const lines = block.split('\n');
            const filename = lines[0].replace('===', '').trim();
            const content = lines.slice(1).join('\n');

            let protocol = 'unknown', address = '', port = '';
            const protocolMatch = content.match(/"protocol"\s*:\s*"([^"]+)"/);
            if (protocolMatch) protocol = protocolMatch[1];
            const addressMatch = content.match(/"address"\s*:\s*"([^"]+)"/);
            if (addressMatch) address = addressMatch[1];
            const portMatch = content.match(/"port"\s*:\s*(\d+)/);
            if (portMatch) port = portMatch[1];

            infoMap.set(filename, { protocol, address, port });
        }

        return infoMap;
    }

    // 保存配置文件
    static async saveConfig(filename, content) {
        const escaped = content.replace(/'/g, "'\\''");
        await ShellService.exec(`echo '${escaped}' > '${ShellService.MODULE_PATH}/config/xray/outbounds/${filename}'`);
    }

    // 删除配置文件
    static async deleteConfig(filename) {
        try {
            const cmd = `su -c "rm '${ShellService.MODULE_PATH}/config/xray/outbounds/${filename}'"`;
            await exec(cmd);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 切换配置（支持热切换）
    static async switchConfig(filename) {
        const configPath = `${ShellService.MODULE_PATH}/config/xray/outbounds/${filename}`;

        // 需要检查服务状态来决定是热切换还是直接修改配置
        // 为了避免循环依赖，这里重复一下 pidof 检查，或者简单地都尝试调用 switch-config.sh
        // switch-config.sh 内部建议增加判断逻辑，目前 KSUService 逻辑是先检查状态
        const pidOutput = await ShellService.exec(`pidof -s /data/adb/modules/netproxy/bin/xray 2>/dev/null || echo`);
        const isRunning = pidOutput.trim() !== '';

        if (isRunning) {
            const result = await exec(`su -c "sh ${ShellService.MODULE_PATH}/scripts/core/switch-config.sh '${configPath}'"`);
            if (result.errno !== 0) {
                throw new Error(result.stderr || '热切换失败');
            }
        } else {
            await ShellService.exec(`sed -i 's|^CURRENT_CONFIG=.*|CURRENT_CONFIG="${configPath}"|' ${ShellService.MODULE_PATH}/config/module.conf`);
        }
    }

    // 从节点链接导入
    static async importFromNodeLink(nodeLink) {
        try {
            const escapedLink = nodeLink.replace(/'/g, "'\\''");
            const cmd = `su -c "cd '${ShellService.MODULE_PATH}/config/xray/outbounds' && chmod +x '${ShellService.MODULE_PATH}/bin/proxylink' && '${ShellService.MODULE_PATH}/bin/proxylink' -parse '${escapedLink}' -insecure -format xray -auto"`;
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

    // ==================== 订阅管理 ====================

    static async getSubscriptions() {
        try {
            const result = await ShellService.exec(`find ${ShellService.MODULE_PATH}/config/xray/outbounds -mindepth 1 -maxdepth 1 -type d -name 'sub_*' -exec basename {} \\;`);
            const subscriptions = [];

            for (const dir of result.split('\n').filter(d => d)) {
                const name = dir.replace(/^sub_/, '');
                try {
                    const metaContent = await ShellService.exec(`cat ${ShellService.MODULE_PATH}/config/xray/outbounds/${dir}/_meta.json`);
                    const meta = JSON.parse(metaContent);
                    const nodeCount = await ShellService.exec(`find ${ShellService.MODULE_PATH}/config/xray/outbounds/${dir} -name '*.json' ! -name '_meta.json' | wc -l`);
                    subscriptions.push({
                        name: meta.name || name,
                        dirName: dir,
                        url: meta.url,
                        updated: meta.updated,
                        nodeCount: parseInt(nodeCount.trim()) || 0
                    });
                } catch (e) { }
            }
            return subscriptions;
        } catch (error) {
            return [];
        }
    }

    static async addSubscription(name, url) {
        const statusFile = `${ShellService.MODULE_PATH}/config/.sub_status`;
        await ShellService.exec(`rm -f ${statusFile}`);
        await exec(`su -c "nohup sh -c 'sh ${ShellService.MODULE_PATH}/scripts/config/subscription.sh add \\"${name}\\" \\"${url}\\" && echo success > ${statusFile} || echo fail > ${statusFile}' > /dev/null 2>&1 &"`);
        return await this.waitForSubscriptionComplete(statusFile, 60000);
    }

    static async updateSubscription(name) {
        const statusFile = `${ShellService.MODULE_PATH}/config/.sub_status`;
        await ShellService.exec(`rm -f ${statusFile}`);
        await exec(`su -c "nohup sh -c 'sh ${ShellService.MODULE_PATH}/scripts/config/subscription.sh update \\"${name}\\" && echo success > ${statusFile} || echo fail > ${statusFile}' > /dev/null 2>&1 &"`);
        return await this.waitForSubscriptionComplete(statusFile, 60000);
    }

    static async removeSubscription(name) {
        const result = await exec(`su -c "sh ${ShellService.MODULE_PATH}/scripts/config/subscription.sh remove '${name}'"`);
        if (result.errno !== 0) {
            throw new Error(result.stderr || '删除订阅失败');
        }
        return { success: true };
    }

    static async waitForSubscriptionComplete(statusFile, timeout) {
        const startTime = Date.now();
        const pollInterval = 500;

        while (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            const result = await exec(`cat ${statusFile} 2>/dev/null || echo ""`);
            const status = (result.stdout || '').trim();

            if (status === 'success') {
                await exec(`rm -f ${statusFile}`);
                return { success: true };
            } else if (status === 'fail') {
                await exec(`rm -f ${statusFile}`);
                throw new Error('订阅操作失败');
            }
        }
        throw new Error('操作超时');
    }
}
