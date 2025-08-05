const https = require('https');
const fs = require('fs');
const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./utils/errorHandler');
const ProxyPool = require('./services/ProxyPool');
const PerformanceMonitor = require('./services/PerformanceMonitor');
const ProxyServer1 = require('./servers/ProxyServer1');
const ProxyServer2 = require('./servers/ProxyServer2');
const ApiServer = require('./servers/ApiServer');

/**
 * HTTP代理服务主应用程序
 * 重构版本 - 模块化架构，优雅关闭，性能监控
 */
class ProxyServiceApp {
    constructor() {
        this.proxyPool = null;
        this.performanceMonitor = null;
        this.servers = {};
        this.httpsServers = {};
        this.isShuttingDown = false;
        this.startTime = Date.now();
        
        // 绑定优雅关闭处理
        this.bindShutdownHandlers();
    }

    async initialize() {
        try {
            logger.info('开始初始化HTTP代理服务');
            
            // 初始化性能监控
            await this.initializePerformanceMonitor();
            
            // 初始化代理池
            await this.initializeProxyPool();
            
            // 初始化服务器
            await this.initializeServers();
            
            // 初始化HTTPS服务器（如果有SSL证书）
            await this.initializeHttpsServers();
            
            // 设置全局引用（用于优雅关闭）
            global.proxyPool = this.proxyPool;
            global.servers = this.servers;
            
            logger.info('HTTP代理服务初始化完成', {
                uptime: Date.now() - this.startTime,
                servers: Object.keys(this.servers).length,
                httpsServers: Object.keys(this.httpsServers).length
            });
            
        } catch (error) {
            logger.error('初始化失败', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async initializePerformanceMonitor() {
        if (config.get('monitoring.enabled')) {
            logger.info('初始化性能监控系统');
            this.performanceMonitor = new PerformanceMonitor();
            
            // 监听性能事件
            this.performanceMonitor.on('started', () => {
                logger.info('性能监控系统已启动');
            });
            
            this.performanceMonitor.on('metricsCollected', (data) => {
                logger.debug('性能指标已收集', {
                    cpu: data.system.cpu.usage,
                    memory: data.system.memory.usage,
                    rps: data.requests.rps
                });
            });
        } else {
            logger.info('性能监控已禁用');
        }
    }

    async initializeProxyPool() {
        logger.info('初始化代理池');
        this.proxyPool = new ProxyPool();
        
        // 监听代理池事件
        this.proxyPool.on('initialized', () => {
            logger.info('代理池初始化完成');
        });
        
        this.proxyPool.on('proxyAdded', (proxy) => {
            logger.info('代理已添加', {
                proxyId: proxy.id,
                host: proxy.host,
                port: proxy.port
            });
            
            // 更新性能监控
            if (this.performanceMonitor) {
                this.performanceMonitor.recordProxyMetrics(this.proxyPool.getStatus());
            }
        });
        
        this.proxyPool.on('proxyRemoved', (proxy) => {
            logger.info('代理已移除', {
                proxyId: proxy.id,
                host: proxy.host,
                port: proxy.port
            });
            
            // 更新性能监控
            if (this.performanceMonitor) {
                this.performanceMonitor.recordProxyMetrics(this.proxyPool.getStatus());
            }
        });
        
        this.proxyPool.on('healthCheckCompleted', (stats) => {
            logger.info('健康检查完成', {
                total: stats.total,
                online: stats.online,
                duration: stats.duration
            });
        });
        
        this.proxyPool.on('error', (error) => {
            logger.error('代理池错误', {
                error: error.message,
                stack: error.stack
            });
            
            if (this.performanceMonitor) {
                this.performanceMonitor.recordError('proxy_pool_error', error);
            }
        });
    }

    async initializeServers() {
        logger.info('初始化HTTP服务器');
        
        // 初始化代理服务器1
        this.servers.proxyServer1 = new ProxyServer1(this.proxyPool, this.performanceMonitor);
        
        // 初始化代理服务器2
        this.servers.proxyServer2 = new ProxyServer2(this.proxyPool, this.performanceMonitor);
        
        // 初始化API服务器
        this.servers.apiServer = new ApiServer(this.proxyPool, this.performanceMonitor);
        
        // 启动所有HTTP服务器
        const startPromises = Object.entries(this.servers).map(async ([name, server]) => {
            try {
                await server.start();
                logger.info(`${name} 启动成功`);
            } catch (error) {
                logger.error(`${name} 启动失败`, {
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });
        
        await Promise.all(startPromises);
        logger.info('所有HTTP服务器启动完成');
    }

    async initializeHttpsServers() {
        if (!config.get('ssl.enabled')) {
            logger.info('SSL未启用，跳过HTTPS服务器初始化');
            return;
        }

        try {
            const httpsOptions = this.loadSSLCertificates();
            if (!httpsOptions) {
                logger.warn('SSL证书加载失败，跳过HTTPS服务器');
                return;
            }

            logger.info('初始化HTTPS服务器');

            // HTTPS代理服务器2
            const httpsProxy2Port = config.get('server.httpsProxy2Port');
            this.httpsServers.httpsProxyServer2 = https.createServer(
                httpsOptions, 
                this.servers.proxyServer2.app
            );

            // HTTPS API服务器
            const httpsApiPort = config.get('server.httpsApiPort');
            this.httpsServers.httpsApiServer = https.createServer(
                httpsOptions, 
                this.servers.apiServer.app
            );

            // 启动HTTPS服务器
            await this.startHttpsServer(
                this.httpsServers.httpsProxyServer2, 
                httpsProxy2Port, 
                'HTTPS代理服务器2'
            );
            
            await this.startHttpsServer(
                this.httpsServers.httpsApiServer, 
                httpsApiPort, 
                'HTTPS API服务器'
            );

            logger.info('所有HTTPS服务器启动完成');

        } catch (error) {
            logger.error('HTTPS服务器初始化失败', {
                error: error.message,
                stack: error.stack
            });
            // HTTPS失败不应该阻止整个应用启动
        }
    }

    loadSSLCertificates() {
        try {
            const keyPath = config.get('ssl.keyPath');
            const certPath = config.get('ssl.certPath');
            
            const httpsOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };
            
            logger.info('SSL证书加载成功', { keyPath, certPath });
            return httpsOptions;
            
        } catch (error) {
            logger.warn('SSL证书加载失败', {
                error: error.message,
                keyPath: config.get('ssl.keyPath'),
                certPath: config.get('ssl.certPath')
            });
            return null;
        }
    }

    startHttpsServer(server, port, name) {
        return new Promise((resolve, reject) => {
            server.listen(port, config.get('server.host'), (error) => {
                if (error) {
                    logger.error(`${name}启动失败`, {
                        error: error.message,
                        port
                    });
                    reject(error);
                } else {
                    logger.serverStart(name, port, 'https');
                    resolve();
                }
            });

            // 添加HTTPS特定的事件监听
            server.on('connection', (socket) => {
                logger.debug(`新的TCP连接`, {
                    server: name,
                    remoteAddress: socket.remoteAddress,
                    remotePort: socket.remotePort
                });
            });

            server.on('tlsClientError', (err, tlsSocket) => {
                logger.warn(`TLS客户端错误`, {
                    server: name,
                    error: err.message,
                    remoteAddress: tlsSocket.remoteAddress,
                    remotePort: tlsSocket.remotePort
                });
            });
        });
    }

    bindShutdownHandlers() {
        // 这些处理器已经在errorHandler中设置
        // 这里只是确保应用实例可以访问到
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    }

    async gracefulShutdown(signal) {
        if (this.isShuttingDown) {
            logger.warn('优雅关闭已在进行中');
            return;
        }

        this.isShuttingDown = true;
        logger.info(`开始优雅关闭 (信号: ${signal})`);

        try {
            // 设置关闭超时
            const shutdownTimeout = setTimeout(() => {
                logger.error('优雅关闭超时，强制退出');
                process.exit(1);
            }, 30000);

            // 停止接受新请求
            await this.stopServers();
            
            // 清理资源
            await this.cleanup();
            
            clearTimeout(shutdownTimeout);
            logger.info('优雅关闭完成');
            process.exit(0);

        } catch (error) {
            logger.error('优雅关闭过程中发生错误', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    }

    async stopServers() {
        logger.info('停止所有服务器');
        
        const stopPromises = [];
        
        // 停止HTTP服务器
        for (const [name, server] of Object.entries(this.servers)) {
            if (server && typeof server.stop === 'function') {
                stopPromises.push(
                    server.stop().then(() => {
                        logger.info(`${name} 已停止`);
                    }).catch(error => {
                        logger.error(`停止 ${name} 失败`, { error: error.message });
                    })
                );
            }
        }
        
        // 停止HTTPS服务器
        for (const [name, server] of Object.entries(this.httpsServers)) {
            stopPromises.push(
                new Promise((resolve) => {
                    server.close(() => {
                        logger.info(`${name} 已停止`);
                        resolve();
                    });
                })
            );
        }
        
        await Promise.all(stopPromises);
        logger.info('所有服务器已停止');
    }

    async cleanup() {
        logger.info('清理应用资源');
        
        // 清理代理池
        if (this.proxyPool) {
            this.proxyPool.cleanup();
        }
        
        // 清理性能监控
        if (this.performanceMonitor) {
            this.performanceMonitor.cleanup();
        }
        
        // 清理全局引用
        delete global.proxyPool;
        delete global.servers;
        
        logger.info('应用资源清理完成');
    }

    // 获取应用状态
    getStatus() {
        const uptime = Date.now() - this.startTime;
        const serverStats = {};
        
        for (const [name, server] of Object.entries(this.servers)) {
            if (server && typeof server.getStats === 'function') {
                serverStats[name] = server.getStats();
            }
        }
        
        return {
            uptime,
            isShuttingDown: this.isShuttingDown,
            servers: serverStats,
            httpsServers: Object.keys(this.httpsServers),
            proxyPool: this.proxyPool ? this.proxyPool.getStatus() : null,
            performance: this.performanceMonitor ? this.performanceMonitor.getStats() : null
        };
    }
}

// 启动应用
async function startApplication() {
    try {
        logger.info('启动HTTP代理服务应用程序');
        
        const app = new ProxyServiceApp();
        await app.initialize();
        
        // 输出启动信息
        const status = app.getStatus();
        logger.info('应用程序启动成功', {
            uptime: status.uptime,
            servers: Object.keys(status.servers).length,
            httpsServers: status.httpsServers.length,
            proxyPool: status.proxyPool ? `${status.proxyPool.total}/${status.proxyPool.max}` : 'N/A'
        });
        
        // 输出服务端点信息
        const host = config.get('server.host');
        logger.info('服务端点信息', {
            proxyServer1: `http://${host}:${config.get('server.proxy1Port')}`,
            proxyServer2: `http://${host}:${config.get('server.proxy2Port')}`,
            apiServer: `http://${host}:${config.get('server.apiPort')}`,
            httpsProxy2: config.get('ssl.enabled') ? `https://${host}:${config.get('server.httpsProxy2Port')}` : 'disabled',
            httpsApi: config.get('ssl.enabled') ? `https://${host}:${config.get('server.httpsApiPort')}` : 'disabled'
        });
        
        return app;
        
    } catch (error) {
        logger.error('应用程序启动失败', {
            error: error.message,
            stack: error.stack
        });
        
        // 确保进程退出
        setTimeout(() => {
            process.exit(1);
        }, 1000);
        
        throw error;
    }
}

// 如果直接运行此文件，启动应用
if (require.main === module) {
    startApplication().catch(error => {
        console.error('启动失败:', error.message);
        process.exit(1);
    });
}

module.exports = { ProxyServiceApp, startApplication };