const express = require('express');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const errorHandler = require('../utils/errorHandler');

/**
 * 代理服务器2 - HTTP API代理服务器
 * 格式: http://IP:端口/密码/目标网址
 * 支持所有HTTP方法和HTTPS目标
 */
class ProxyServer2 {
    constructor(proxyPool, performanceMonitor) {
        this.proxyPool = proxyPool;
        this.performanceMonitor = performanceMonitor;
        this.app = null;
        this.server = null;
        this.port = config.get('server.proxy2Port');
        this.host = config.get('server.host');
        this.password = config.get('auth.proxy2.password');
        this.requestCount = 0;
        this.activeConnections = new Set();
    }

    create() {
        this.app = express();
        
        // 添加请求ID中间件
        this.app.use((req, res, next) => {
            req.id = `API-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            next();
        });

        // 添加JSON解析中间件
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.raw({ limit: '10mb', type: '*/*' }));

        // 添加请求日志中间件
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            const clientIp = req.ip || req.connection.remoteAddress;
            
            logger.info(`收到API请求: ${req.method} ${req.path}`, {
                requestId: req.id,
                clientIp,
                userAgent: req.get('User-Agent')
            });

            // 记录响应时间
            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                logger.proxyResponse(req.method, req.originalUrl, res.statusCode, responseTime, {
                    requestId: req.id,
                    server: 'ProxyServer2'
                });
                
                this.performanceMonitor?.recordRequest(
                    req.method, 
                    req.originalUrl, 
                    res.statusCode, 
                    responseTime, 
                    res.statusCode < 400
                );
            });

            next();
        });

        // 处理根路径访问，提供使用说明
        this.app.get('/', this.handleRootRequest.bind(this));

        // 方案2: 添加POST方式，URL在请求体中（必须在通用路由之前定义）
        this.app.post('/:password/post-proxy', this.handlePostProxyRequest.bind(this));
        
        // 方案1: 处理所有路径的代理请求，格式: /:password/*
        this.app.all('/:password/*', this.handleProxyRequest.bind(this));

        // 添加404处理
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: '路径未找到',
                message: '请使用正确的代理格式: /:password/目标URL',
                usage: this.getUsageInfo(req)
            });
        });

        // 添加错误处理中间件
        this.app.use(errorHandler.createExpressErrorHandler());

        return this.app;
    }

    handleRootRequest(req, res) {
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        const protocol = isHttps ? 'https' : 'http';
        const currentPort = isHttps ? config.get('server.httpsProxy2Port') : this.port;
        
        res.json({
            service: `${protocol.toUpperCase()}代理服务器2`,
            description: '基于URL路径的代理服务',
            version: '2.0.0',
            status: 'running',
            usage: this.getUsageInfo(req),
            stats: this.getStats(),
            note: '使用HTTPS格式可以获得更好的兼容性，特别是访问某些API服务时'
        });
    }

    getUsageInfo(req) {
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        const protocol = isHttps ? 'https' : 'http';
        const currentPort = isHttps ? config.get('server.httpsProxy2Port') : this.port;
        const host = req.get('host') || `127.0.0.1:${currentPort}`;
        
        return {
            format: `${protocol}://${host}/密码/目标网址`,
            example: `${protocol}://${host}/${this.password}/https://httpbin.org/ip`,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
            features: [
                '支持所有HTTP方法',
                '自动处理重定向',
                '保持原始响应头',
                '支持大文件传输',
                '自动错误处理',
                '智能URL修复 - 自动处理双斜杠问题'
            ],
            alternativeMethods: {
                postMethod: {
                    description: '使用POST方式，URL在请求体中',
                    endpoint: `${protocol}://${host}/${this.password}`,
                    method: 'POST',
                    body: { url: 'https://api.targon.com' },
                    example: `curl -X POST "${protocol}://${host}/${this.password}" -H "Content-Type: application/json" -d '{"url":"https://api.targon.com"}'`
                }
            }
        };
    }

    async handleProxyRequest(req, res) {
        const startTime = Date.now();
        const password = req.params.password;
        let targetUrl = req.params[0];
        const clientIp = req.ip || req.connection.remoteAddress;

        try {
            this.requestCount++;

            logger.proxyRequest(req.method, targetUrl, {
                server: 'ProxyServer2',
                requestId: req.id,
                clientIp,
                password: password.substring(0, 3) + '***' // 部分隐藏密码
            });

            // 验证密码
            if (password !== this.password) {
                logger.auth(false, 'api_user', clientIp, 'ProxyServer2');
                return res.status(401).json({
                    success: false,
                    error: '密码错误',
                    message: '请提供正确的访问密码',
                    requestId: req.id
                });
            }

            logger.auth(true, 'api_user', clientIp, 'ProxyServer2');

            // 智能修复URL格式 - 处理Express路由压缩双斜杠的问题
            let fixedTargetUrl = targetUrl;
            if (targetUrl && (targetUrl.startsWith('https:/') || targetUrl.startsWith('http:/'))) {
                // 修复被Express压缩的双斜杠
                if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
                    fixedTargetUrl = targetUrl.replace('https:/', 'https://');
                } else if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
                    fixedTargetUrl = targetUrl.replace('http:/', 'http://');
                }
                
                logger.debug('修复URL格式', {
                    original: targetUrl,
                    fixed: fixedTargetUrl,
                    requestId: req.id
                });
            }
            
            // 验证修复后的目标URL格式
            if (!fixedTargetUrl || (!fixedTargetUrl.startsWith('http://') && !fixedTargetUrl.startsWith('https://'))) {
                return res.status(400).json({
                    success: false,
                    error: 'URL格式错误',
                    message: '目标URL必须以http://或https://开头',
                    provided: targetUrl,
                    fixed: fixedTargetUrl,
                    requestId: req.id
                });
            }
            
            // 使用修复后的URL
            targetUrl = fixedTargetUrl;

            // 获取可用代理
            const proxy = this.proxyPool.getAvailableProxy();
            if (!proxy) {
                logger.error('没有可用代理处理API请求', { 
                    requestId: req.id, 
                    clientIp,
                    targetUrl 
                });
                
                return res.status(503).json({
                    success: false,
                    error: '服务不可用',
                    message: '当前没有可用的代理服务器',
                    requestId: req.id
                });
            }

            // 通过代理发送请求
            await this.forwardRequest(req, res, targetUrl, proxy, startTime);

        } catch (error) {
            logger.proxyError(req.method, targetUrl, error, {
                requestId: req.id,
                clientIp,
                server: 'ProxyServer2'
            });

            errorHandler.recordError('proxy_api_error', error, {
                requestId: req.id,
                method: req.method,
                targetUrl,
                clientIp
            });

            if (!res.headersSent) {
                const statusCode = this.getErrorStatusCode(error);
                res.status(statusCode).json({
                    success: false,
                    error: this.getErrorMessage(error),
                    message: this.getErrorDescription(error),
                    requestId: req.id,
                    timestamp: new Date().toISOString()
                });
            }

            const responseTime = Date.now() - startTime;
            this.performanceMonitor?.recordRequest(req.method, targetUrl, 500, responseTime, false);
        }
    }

    async handlePostProxyRequest(req, res) {
        const startTime = Date.now();
        const password = req.params.password;
        const clientIp = req.ip || req.connection.remoteAddress;

        try {
            this.requestCount++;

            // 验证密码
            if (password !== this.password) {
                logger.auth(false, 'api_user', clientIp, 'ProxyServer2');
                return res.status(401).json({
                    success: false,
                    error: '密码错误',
                    message: '请提供正确的访问密码',
                    requestId: req.id
                });
            }

            logger.auth(true, 'api_user', clientIp, 'ProxyServer2');

            // 从请求体获取目标URL
            let targetUrl;
            if (req.body && typeof req.body === 'object') {
                targetUrl = req.body.url || req.body.target || req.body.targetUrl;
            } else if (typeof req.body === 'string') {
                try {
                    const parsed = JSON.parse(req.body);
                    targetUrl = parsed.url || parsed.target || parsed.targetUrl;
                } catch (e) {
                    targetUrl = req.body; // 直接使用字符串作为URL
                }
            }

            logger.proxyRequest('GET', targetUrl, {
                server: 'ProxyServer2-POST',
                requestId: req.id,
                clientIp,
                password: password.substring(0, 3) + '***'
            });

            // 验证目标URL格式
            if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
                return res.status(400).json({
                    success: false,
                    error: 'URL格式错误',
                    message: '请在请求体中提供有效的目标URL',
                    example: { url: 'https://api.targon.com' },
                    requestId: req.id
                });
            }

            // 获取可用代理
            const proxy = this.proxyPool.getAvailableProxy();
            if (!proxy) {
                logger.error('没有可用代理处理POST请求', {
                    requestId: req.id,
                    clientIp,
                    targetUrl
                });
                
                return res.status(503).json({
                    success: false,
                    error: '服务不可用',
                    message: '当前没有可用的代理服务器',
                    requestId: req.id
                });
            }

            // 创建一个模拟的GET请求来转发
            const mockReq = {
                method: 'GET',
                body: null,
                headers: req.headers,
                id: req.id
            };

            // 通过代理发送请求
            await this.forwardRequest(mockReq, res, targetUrl, proxy, startTime);

        } catch (error) {
            logger.proxyError('POST', req.body, error, {
                requestId: req.id,
                clientIp,
                server: 'ProxyServer2-POST'
            });

            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: '代理请求失败',
                    message: error.message,
                    requestId: req.id,
                    timestamp: new Date().toISOString()
                });
            }

            const responseTime = Date.now() - startTime;
            this.performanceMonitor?.recordRequest('POST', req.body, 500, responseTime, false);
        }
    }

    async forwardRequest(req, res, targetUrl, proxy, startTime) {
        try {
            logger.info('通过代理转发请求', {
                requestId: req.id,
                targetUrl,
                proxyId: proxy.id,
                proxyHost: proxy.host,
                proxyPort: proxy.port,
                method: req.method
            });

            // 准备请求配置
            const requestConfig = {
                method: req.method,
                url: targetUrl,
                headers: this.prepareHeaders(req.headers),
                data: req.body,
                proxy: {
                    protocol: 'http',
                    host: proxy.host,
                    port: proxy.port,
                    auth: {
                        username: proxy.username,
                        password: proxy.password
                    }
                },
                timeout: config.get('performance.requestTimeout'),
                maxRedirects: config.get('performance.maxRedirects'),
                validateStatus: () => true, // 接受所有状态码
                responseType: 'arraybuffer', // 处理二进制数据
                maxContentLength: 50 * 1024 * 1024, // 50MB
                maxBodyLength: 50 * 1024 * 1024 // 50MB
            };

            // 发送请求
            const response = await axios(requestConfig);
            const responseTime = Date.now() - startTime;

            logger.info('代理请求成功', {
                requestId: req.id,
                targetUrl,
                statusCode: response.status,
                responseTime: `${responseTime}ms`,
                contentLength: response.headers['content-length'] || 'unknown'
            });

            // 设置响应头
            this.setResponseHeaders(res, response.headers);

            // 返回响应
            res.status(response.status);
            
            if (response.data) {
                // 检查内容类型以决定如何发送数据
                const contentType = response.headers['content-type'] || '';
                
                if (contentType.includes('application/json') || contentType.includes('text/')) {
                    // 文本内容，转换为字符串
                    res.send(response.data.toString());
                } else {
                    // 二进制内容，直接发送Buffer
                    res.send(response.data);
                }
            } else {
                res.end();
            }

            this.performanceMonitor?.recordRequest(req.method, targetUrl, response.status, responseTime, true);

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            logger.error('代理请求失败', {
                requestId: req.id,
                targetUrl,
                proxyId: proxy.id,
                error: error.message,
                code: error.code,
                responseTime: `${responseTime}ms`
            });

            // 根据错误类型返回适当的状态码和消息
            const statusCode = this.getErrorStatusCode(error);
            const errorMessage = this.getErrorMessage(error);
            const errorDescription = this.getErrorDescription(error);

            if (!res.headersSent) {
                res.status(statusCode).json({
                    success: false,
                    error: errorMessage,
                    message: errorDescription,
                    requestId: req.id,
                    proxyInfo: {
                        id: proxy.id,
                        host: proxy.host,
                        port: proxy.port
                    },
                    timestamp: new Date().toISOString()
                });
            }

            this.performanceMonitor?.recordRequest(req.method, targetUrl, statusCode, responseTime, false);
            throw error;
        }
    }

    prepareHeaders(originalHeaders) {
        const headers = { ...originalHeaders };
        
        // 移除可能导致问题的请求头
        const headersToRemove = [
            'host',
            'content-length',
            'connection',
            'proxy-authorization',
            'proxy-connection',
            'upgrade',
            'x-forwarded-for',
            'x-forwarded-proto',
            'x-forwarded-host'
        ];

        headersToRemove.forEach(header => {
            delete headers[header];
            delete headers[header.toLowerCase()];
        });

        // 设置用户代理
        if (!headers['user-agent']) {
            headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
        }

        return headers;
    }

    setResponseHeaders(res, responseHeaders) {
        // 需要跳过的响应头
        const headersToSkip = [
            'content-encoding',
            'transfer-encoding',
            'connection',
            'upgrade',
            'proxy-authenticate',
            'proxy-authorization'
        ];

        Object.keys(responseHeaders).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (!headersToSkip.includes(lowerKey)) {
                try {
                    res.set(key, responseHeaders[key]);
                } catch (error) {
                    logger.debug('设置响应头失败', { 
                        header: key, 
                        value: responseHeaders[key],
                        error: error.message 
                    });
                }
            }
        });
    }

    getErrorStatusCode(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return 504; // Gateway Timeout
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return 502; // Bad Gateway
        } else if (error.code === 'ECONNRESET') {
            return 502; // Bad Gateway
        } else if (error.response && error.response.status) {
            return error.response.status;
        } else {
            return 500; // Internal Server Error
        }
    }

    getErrorMessage(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return '请求超时';
        } else if (error.code === 'ENOTFOUND') {
            return '目标服务器未找到';
        } else if (error.code === 'ECONNREFUSED') {
            return '目标服务器拒绝连接';
        } else if (error.code === 'ECONNRESET') {
            return '连接被重置';
        } else {
            return '代理请求失败';
        }
    }

    getErrorDescription(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return '目标服务器响应超时，请稍后重试';
        } else if (error.code === 'ENOTFOUND') {
            return '无法解析目标服务器地址，请检查URL是否正确';
        } else if (error.code === 'ECONNREFUSED') {
            return '目标服务器拒绝连接，可能服务不可用';
        } else if (error.code === 'ECONNRESET') {
            return '连接被目标服务器重置';
        } else {
            return '代理服务器处理请求时发生错误';
        }
    }

    start() {
        return new Promise((resolve, reject) => {
            if (!this.app) {
                this.create();
            }

            this.server = this.app.listen(this.port, this.host, (error) => {
                if (error) {
                    logger.serverError('ProxyServer2', error);
                    reject(error);
                } else {
                    logger.serverStart('代理服务器2', this.port, 'http');
                    
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

            logger.info('正在关闭代理服务器2');

            // 关闭服务器，不再接受新连接
            this.server.close(() => {
                logger.info('代理服务器2已关闭');
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

module.exports = ProxyServer2;