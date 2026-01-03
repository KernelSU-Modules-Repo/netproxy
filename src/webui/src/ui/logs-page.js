import { KSUService } from '../services/ksu-service.js';
import { toast } from '../utils/toast.js';
import { I18nService } from '../services/i18n-service.js';

/**
 * 日志页面管理器
 */
export class LogsPageManager {
    constructor(ui) {
        this.ui = ui;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 导出日志按钮
        const exportLogsBtn = document.getElementById('export-logs-btn');
        if (exportLogsBtn) {
            exportLogsBtn.addEventListener('click', () => this.exportLogs());
        }

        // 导出日志与配置按钮
        const exportAllBtn = document.getElementById('export-all-btn');
        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => this.exportAll());
        }
    }

    async update() {
        await this.loadServiceLog();
        await this.loadXrayLog();
        await this.loadTproxyLog();
    }

    async loadServiceLog() {
        try {
            const log = await KSUService.getServiceLog();
            document.getElementById('service-log').textContent = log;
        } catch (error) {
            document.getElementById('service-log').textContent = I18nService.t('logs.load_failed');
        }
    }

    async loadXrayLog() {
        try {
            const log = await KSUService.getXrayLog();
            document.getElementById('xray-log').textContent = log;
        } catch (error) {
            document.getElementById('xray-log').textContent = I18nService.t('logs.load_failed');
        }
    }

    async loadTproxyLog() {
        try {
            const log = await KSUService.getTproxyLog();
            document.getElementById('tproxy-log').textContent = log;
        } catch (error) {
            document.getElementById('tproxy-log').textContent = I18nService.t('logs.load_failed');
        }
    }



    async exportLogs() {
        const btn = document.getElementById('export-logs-btn');
        if (btn) btn.loading = true;

        try {
            const result = await KSUService.exportLogs();
            if (result.success) {
                toast(I18nService.t('logs.saved_to') + result.path);
            } else {
                toast(I18nService.t('logs.save_failed') + ': ' + (result.error || I18nService.t('logs.unknown_error')));
            }
        } catch (error) {
            console.error('导出日志失败:', error);
            toast(I18nService.t('logs.save_failed'));
        } finally {
            if (btn) btn.loading = false;
        }
    }

    async exportAll() {
        const btn = document.getElementById('export-all-btn');
        if (btn) btn.loading = true;

        try {
            const result = await KSUService.exportAll();
            if (result.success) {
                toast(I18nService.t('logs.saved_all_to') + result.path);
            } else {
                toast(I18nService.t('common.save_failed') + (result.error || I18nService.t('logs.unknown_error')));
            }
        } catch (error) {
            console.error('导出日志与配置失败:', error);
            toast(I18nService.t('common.save_failed'));
        } finally {
            if (btn) btn.loading = false;
        }
    }
}

