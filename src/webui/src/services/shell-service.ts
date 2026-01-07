import { exec, spawn } from 'kernelsu';
import { toast } from '../utils/toast.js';

/** Shell 执行选项 */
interface ExecOptions {
    silent?: boolean;
    [key: string]: unknown;
}

/** Shell 执行结果 */
interface ExecResult {
    errno: number;
    stdout: string;
    stderr: string;
}

/** Spawn 进程类型 */
interface SpawnProcess {
    stdout: {
        on(event: 'data', callback: (data: string) => void): void;
    };
    on(event: 'exit', callback: (code: number) => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
}

/**
 * KernelSU Shell Service - 封装底层 Shell 交互
 */
export class ShellService {
    static MODULE_PATH = '/data/adb/modules/netproxy';

    /**
     * 执行 Shell 命令
     */
    static async exec(command: string, options: ExecOptions = {}): Promise<string> {
        try {
            const { errno, stdout, stderr } = await exec(command, options as any) as ExecResult;
            if (errno !== 0) {
                throw new Error(stderr || 'Command execution failed');
            }
            return stdout.trim();
        } catch (error) {
            console.error('KSU exec error:', error);
            // 某些命令失败不应弹窗，由调用者处理
            if (!options.silent) {
                // toast(error.message); // 暂时屏蔽统一 toast，防止过多弹窗
            }
            throw error;
        }
    }

    /**
     * 使用 curl 获取 URL 内容
     */
    static async fetchUrl(url: string): Promise<string | null> {
        try {
            const result = await this.exec(`curl -sL --connect-timeout 10 --max-time 30 '${url}'`);
            return result.trim();
        } catch (error) {
            console.error('fetchUrl error:', error);
            return null;
        }
    }

    /**
     * 获取 ping 延迟（使用 spawn 真正非阻塞）
     */
    static getPingLatency(host: string): Promise<string> {
        return new Promise((resolve) => {
            let output = '';
            let resolved = false;

            // 设置超时保护
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve('timeout');
                }
            }, 3000);

            try {
                const ping = spawn('ping', ['-c', '1', '-W', '2', host]) as SpawnProcess;

                ping.stdout.on('data', (data: string) => {
                    output += data;
                });

                ping.on('exit', (code: number) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);

                    if (code === 0 && output) {
                        const match = output.match(/time=([\d.]+)\s*ms/);
                        if (match) {
                            resolve(`${Math.round(parseFloat(match[1]))} ms`);
                            return;
                        }
                    }
                    resolve('timeout');
                });

                ping.on('error', () => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    resolve('failed');
                });
            } catch (e) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve('failed');
                }
            }
        });
    }
}
