const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const errorHandler = require('../utils/errorHandler');

/**
 * API服务器 - 管理接口和Web界面
 * 提供代理池管理、监控数据、系统状态等API
 */
class ApiServer {
    constructor(proxyPool, performanceMonitor) {
        this.proxyPool = proxyPool;
        this.performanceMonitor = performanceMonitor;
        this.app = null;
        this.server = null;
        this.port = config.get('server.apiPort');
        this.host = config.get('server.host');
        this.requestCount = 0;
        this.activeConnections = new Set();
    }

    create() {
        this.app = express();

        // 基础中间件
        this.setupMiddleware();
        
        // 静态文件服务
        this.setupStaticFiles();
        
        // API路由
        this.setupApiRoutes();
        
        // 错误处理
        this.setupErrorHandling();

        return this.app;
    }

    setupMiddleware() {
        // 请求ID中间件
        this.app.use((req, res, next) => {
            req.id = `API-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            next();
        });

        // JSON解析中间件
        this.app.use(express.json({ limit: '1mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

        // CORS中间件
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // 请求日志中间件
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            const clientIp = req.ip || req.connection.remoteAddress;
            
            logger.info(`API请求: ${req.method} ${req.path}`, {
                requestId: req.id,
                clientIp,
                userAgent: req.get('User-Agent')
            });

            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                logger.info(`API响应: ${req.method} ${req.path} - ${res.statusCode} (${responseTime}ms)`, {
                    requestId: req.id,
                    statusCode: res.statusCode,
                    responseTime
                });
                
                this.performanceMonitor?.recordRequest(
                    req.method, 
                    req.path, 
                    res.statusCode, 
                    responseTime, 
                    res.statusCode < 400
                );
            });

            this.requestCount++;
            next();
        });
    }

    setupStaticFiles() {
        // 提供静态文件服务
        const publicPath = path.join(__dirname, '../../public');
        this.app.use(express.static(publicPath));
        
        logger.info('静态文件服务已配置', { publicPath });
    }

    setupApiRoutes() {
        // 系统状态API
        this.app.get('/api/status', this.handleSystemStatus.bind(this));
        
        // 代理池管理API
        this.app.get('/api/proxies', this.handleGetProxies.bind(this));
        this.app.post('/api/proxies/refresh', this.handleRefreshProxies.bind(this));
        this.app.post('/api/proxies/health-check', this.handleHealthCheck.bind(this));
        this.app.delete('/api/proxies/:id', this.handleDeleteProxy.bind(this));
        
        // 性能监控API
        this.app.get('/api/performance', this.handleGetPerformance.bind(this));
        this.app.get('/api/performance/report', this.handleGetPerformanceReport.bind(this));
        this.app.get('/api/performance/metrics/:type', this.handleGetMetrics.bind(this));
        
        // 日志管理API
        this.app.get('/api/logs/stats', this.handleGetLogStats.bind(this));
        this.app.post('/api/logs/level', this.handleSetLogLevel.bind(this));
        
        // 错误统计API
        this.app.get('/api/errors', this.handleGetErrors.bind(this));
        this.app.post('/api/errors/clear', this.handleClearErrors.bind(this));
        
        // 配置管理API
        this.app.get('/api/config', this.handleGetConfig.bind(this));
        this.app.put('/api/config', this.handleUpdateConfig.bind(this));
        
        // 服务器统计API
        this.app.get('/api/servers', this.handleGetServers.bind(this));
        
        // 健康检查端点
        this.app.get('/health', this.handleHealthEndpoint.bind(this));
        
        // API文档
        this.app.get('/api', this.handleApiDocs.bind(this));
    }

    setupErrorHandling() {
        // 404处理
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: '接口未找到',
                message: `路径 ${req.originalUrl} 不存在`,
                availableEndpoints: this.getAvailableEndpoints()
            });
        });

        // 全局错误处理
        this.app.use(errorHandler.createExpressErrorHandler());
    }

    // API处理方法
    async handleSystemStatus(req, res) {
        try {
            const proxyStatus = this.proxyPool.getStatus();
            const performanceStats = this.performanceMonitor?.getStats() || {};
            const errorStats = errorHandler.getErrorStats();
            
            res.json({
                success: true,
                data: {
                    system: {
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        cpu: process.cpuUsage(),
                        version: process.version,
                        platform: process.platform,
                        pid: process.pid
                    },
                    proxy: proxyStatus,
                    performance: performanceStats,
                    errors: errorStats,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            logger.error('获取系统状态失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取系统状态失败',
                message: error.message
            });
        }
    }

    async handleGetProxies(req, res) {
        try {
            const includeCredentials = req.query.credentials === 'true';
            const status = this.proxyPool.getStatus(includeCredentials);
            
            res.json({
                success: true,
                data: status.proxies,
                meta: {
                    total: status.total,
                    online: status.online,
                    offline: status.offline,
                    unknown: status.unknown,
                    max: status.max,
                    currentIndex: status.currentIndex,
                    isRefreshing: status.isRefreshing,
                    isHealthChecking: status.isHealthChecking
                }
            });
        } catch (error) {
            logger.error('获取代理列表失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取代理列表失败',
                message: error.message
            });
        }
    }

    async handleRefreshProxies(req, res) {
        try {
            logger.info('手动刷新代理池', { requestId: req.id });
            
            // 异步执行刷新，不阻塞响应
            setImmediate(() => {
                this.proxyPool.refreshProxyPool().catch(error => {
                    logger.error('代理池刷新失败', { error: error.message });
                });
            });
            
            res.json({
                success: true,
                message: '代理池刷新已启动',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('启动代理池刷新失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '启动代理池刷新失败',
                message: error.message
            });
        }
    }

    async handleHealthCheck(req, res) {
        try {
            logger.info('手动执行健康检查', { requestId: req.id });
            
            // 异步执行健康检查，不阻塞响应
            setImmediate(() => {
                this.proxyPool.autoHealthCheck().catch(error => {
                    logger.error('健康检查失败', { error: error.message });
                });
            });
            
            res.json({
                success: true,
                message: '健康检查已启动',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('启动健康检查失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '启动健康检查失败',
                message: error.message
            });
        }
    }

    async handleDeleteProxy(req, res) {
        try {
            const proxyId = req.params.id;
            const success = this.proxyPool.removeProxy(proxyId);
            
            if (success) {
                logger.info('手动删除代理', { proxyId, requestId: req.id });
                res.json({
                    success: true,
                    message: '代理已删除',
                    proxyId
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: '代理未找到',
                    proxyId
                });
            }
        } catch (error) {
            logger.error('删除代理失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '删除代理失败',
                message: error.message
            });
        }
    }

    async handleGetPerformance(req, res) {
        try {
            if (!this.performanceMonitor) {
                return res.status(503).json({
                    success: false,
                    error: '性能监控未启用',
                    message: '请在配置中启用性能监控'
                });
            }

            const stats = this.performanceMonitor.getStats();
            res.json({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('获取性能数据失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取性能数据失败',
                message: error.message
            });
        }
    }

    async handleGetPerformanceReport(req, res) {
        try {
            if (!this.performanceMonitor) {
                return res.status(503).json({
                    success: false,
                    error: '性能监控未启用'
                });
            }

            const report = this.performanceMonitor.getPerformanceReport();
            res.json({
                success: true,
                data: report
            });
        } catch (error) {
            logger.error('获取性能报告失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取性能报告失败',
                message: error.message
            });
        }
    }

    async handleGetMetrics(req, res) {
        try {
            if (!this.performanceMonitor) {
                return res.status(503).json({
                    success: false,
                    error: '性能监控未启用'
                });
            }

            const type = req.params.type;
            const limit = parseInt(req.query.limit) || 100;
            const metrics = this.performanceMonitor.getMetrics(type, limit);
            
            res.json({
                success: true,
                data: metrics,
                meta: {
                    type,
                    count: metrics.length,
                    limit
                }
            });
        } catch (error) {
            logger.error('获取指标数据失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取指标数据失败',
                message: error.message
            });
        }
    }

    async handleGetLogStats(req, res) {
        try {
            const stats = logger.getStats();
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error('获取日志统计失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取日志统计失败',
                message: error.message
            });
        }
    }

    async handleSetLogLevel(req, res) {
        try {
            const { level } = req.body;
            const validLevels = ['error', 'warn', 'info', 'debug'];
            
            if (!validLevels.includes(level)) {
                return res.status(400).json({
                    success: false,
                    error: '无效的日志级别',
                    validLevels
                });
            }

            logger.setLevel(level);
            res.json({
                success: true,
                message: `日志级别已设置为: ${level}`,
                level
            });
        } catch (error) {
            logger.error('设置日志级别失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '设置日志级别失败',
                message: error.message
            });
        }
    }

    async handleGetErrors(req, res) {
        try {
            const stats = errorHandler.getErrorStats();
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error('获取错误统计失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取错误统计失败',
                message: error.message
            });
        }
    }

    async handleClearErrors(req, res) {
        try {
            errorHandler.clearErrorStats();
            res.json({
                success: true,
                message: '错误统计已清除'
            });
        } catch (error) {
            logger.error('清除错误统计失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '清除错误统计失败',
                message: error.message
            });
        }
    }

    async handleGetConfig(req, res) {
        try {
            const configData = config.getAll();
            
            // 隐藏敏感信息
            const safeConfig = { ...configData };
            if (safeConfig.auth) {
                safeConfig.auth = {
                    proxy1: { username: safeConfig.auth.proxy1.username, password: '***' },
                    proxy2: { password: '***' }
                };
            }
            
            res.json({
                success: true,
                data: safeConfig,
                environment: config.getEnvironment()
            });
        } catch (error) {
            logger.error('获取配置失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取配置失败',
                message: error.message
            });
        }
    }

    async handleUpdateConfig(req, res) {
        try {
            // 这里可以实现配置更新逻辑
            // 注意：动态配置更新需要谨慎处理
            res.status(501).json({
                success: false,
                error: '配置更新功能暂未实现',
                message: '请通过环境变量或配置文件修改配置'
            });
        } catch (error) {
            logger.error('更新配置失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '更新配置失败',
                message: error.message
            });
        }
    }

    async handleGetServers(req, res) {
        try {
            const servers = global.servers || {};
            const serverStats = {};
            
            for (const [name, server] of Object.entries(servers)) {
                if (server && typeof server.getStats === 'function') {
                    serverStats[name] = server.getStats();
                }
            }
            
            res.json({
                success: true,
                data: serverStats
            });
        } catch (error) {
            logger.error('获取服务器统计失败', { error: error.message, requestId: req.id });
            res.status(500).json({
                success: false,
                error: '获取服务器统计失败',
                message: error.message
            });
        }
    }

    async handleHealthEndpoint(req, res) {
        try {
            const proxyStatus = this.proxyPool.getStatus();
            const isHealthy = proxyStatus.online > 0;
            
            res.status(isHealthy ? 200 : 503).json({
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                proxies: {
                    total: proxyStatus.total,
                    online: proxyStatus.online
                }
            });
        } catch (error) {
            res.status(503).json({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async handleApiDocs(req, res) {
        const endpoints = this.getAvailableEndpoints();
        res.json({
            name: 'HTTP代理服务API',
            version: '2.0.0',
            description: '提供代理池管理、监控和系统状态查询功能',
            endpoints,
            timestamp: new Date().toISOString()
        });
    }

    getAvailableEndpoints() {
        return [
            { method: 'GET', path: '/api/status', description: '获取系统状态' },
            { method: 'GET', path: '/api/proxies', description: '获取代理列表' },
            { method: 'POST', path: '/api/proxies/refresh', description: '刷新代理池' },
            { method: 'POST', path: '/api/proxies/health-check', description: '执行健康检查' },
            { method: 'DELETE', path: '/api/proxies/:id', description: '删除指定代理' },
            { method: 'GET', path: '/api/performance', description: '获取性能数据' },
            { method: 'GET', path: '/api/performance/report', description: '获取性能报告' },
            { method: 'GET', path: '/api/performance/metrics/:type', description: '获取指标数据' },
            { method: 'GET', path: '/api/logs/stats', description: '获取日志统计' },
            { method: 'POST', path: '/api/logs/level', description: '设置日志级别' },
            { method: 'GET', path: '/api/errors', description: '获取错误统计' },
            { method: 'POST', path: '/api/errors/clear', description: '清除错误统计' },
            { method: 'GET', path: '/api/config', description: '获取配置信息' },
            { method: 'GET', path: '/api/servers', description: '获取服务器统计' },
            { method: 'GET', path: '/health', description: '健康检查端点' },
            { method: 'GET', path: '/api', description: 'API文档' }
        ];
    }

    start() {
        return new Promise((resolve, reject) => {
            if (!this.app) {
                this.create();
            }

            this.server = this.app.listen(this.port, this.host, (error) => {
                if (error) {
                    logger.serverError('ApiServer', error);
                    reject(error);
                } else {
                    logger.serverStart('API服务器', this.port, 'http');
                    
                    // 跟踪连接
                    this.server.on('connection', (socket) => {
                        this.activeConnections.add(socket);
                        socket.on('close', () => {
                            this.activeConnections.delete(socket);
                        });
                    });

                    resolve();
                }
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }

            logger.info('正在关闭API服务器');

            // 关闭服务器，不再接受新连接
            this.server.close(() => {
                logger.info('API服务器已关闭');
                resolve();
            });

            // 关闭所有活动连接
            for (const socket of this.activeConnections) {
                socket.destroy();
            }
            this.activeConnections.clear();
        });
    }

    getStats() {
        return {
            port: this.port,
            requestCount: this.requestCount,
            activeConnections: this.activeConnections.size,
            isListening: this.server ? this.server.listening : false
        };
    }
}

module.exports = ApiServer;