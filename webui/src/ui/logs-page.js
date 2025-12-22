import { KSUService } from '../services/ksu-service.js';

/**
 * 日志页面管理器
 */
export class LogsPageManager {
    constructor(ui) {
        this.ui = ui;
    }

    async update() {
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
}

