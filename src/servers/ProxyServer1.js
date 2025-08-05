const http = require('http');
const net = require('net');
const config = require('../config');
const logger = require('../utils/logger');
const errorHandler = require('../utils/errorHandler');

/**
 * 代理服务器1 - HTTP代理服务器
 * 格式: http://用户名:密码@IP:端口
 * 支持HTTP和HTTPS CONNECT请求
 */
class ProxyServer1 {
    constructor(proxyPool, performanceMonitor) {
        this.proxyPool = proxyPool;
        this.performanceMonitor = performanceMonitor;
        this.server = null;
        this.port = config.get('server.proxy1Port');
        this.host = config.get('server.host');
        this.auth = config.get('auth.proxy1');
        this.activeConnections = new Set();
        this.requestCount = 0;
    }

    create() {
        this.server = http.createServer();
        
        // 处理HTTP请求
        this.server.on('request', this.handleHttpRequest.bind(this));
        
        // 处理HTTPS CONNECT请求
        this.server.on('connect', this.handleConnectRequest.bind(this));
        
        // 处理服务器错误
        this.server.on('error', (error) => {
            logger.serverError('ProxyServer1', error);
            errorHandler.recordError('server_error', error);
        });

        // 跟踪连接
        this.server.on('connection', (socket) => {
            this.activeConnections.add(socket);
            socket.on('close', () => {
                this.activeConnections.delete(socket);
            });
        });

        return this.server;
    }

    async handleHttpRequest(req, res) {
        const startTime = Date.now();
        const requestId = `HTTP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const clientIp = req.connection.remoteAddress;

        try {
            logger.proxyRequest(req.method, req.url, { server: 'ProxyServer1', requestId, clientIp });
            this.requestCount++;

            // 验证认证信息
            const authResult = this.validateAuth(req, clientIp);
            if (!authResult.success) {
                res.writeHead(407, { 
                    'Proxy-Authenticate': 'Basic realm="Proxy"',
                    'Content-Type': 'text/plain'
                });
                res.end(authResult.message);
                
                const responseTime = Date.now() - startTime;
                this.performanceMonitor?.recordRequest(req.method, req.url, 407, responseTime, false);
                return;
            }

            // 获取可用代理
            const proxy = this.proxyPool.getAvailableProxy();
            if (!proxy) {
                res.writeHead(503, { 'Content-Type': 'text/plain' });
                res.end('没有可用代理');
                
                const responseTime = Date.now() - startTime;
                this.performanceMonitor?.recordRequest(req.method, req.url, 503, responseTime, false);
                logger.error('没有可用代理处理HTTP请求', { requestId, clientIp });
                return;
            }

            // 创建代理请求
            await this.forwardHttpRequest(req, res, proxy, requestId, startTime);

        } catch (error) {
            logger.proxyError(req.method, req.url, error, { requestId, clientIp });
            errorHandler.recordError('proxy_request_error', error, { requestId, method: req.method, url: req.url });
            
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('代理服务器内部错误');
            }
            
            const responseTime = Date.now() - startTime;
            this.performanceMonitor?.recordRequest(req.method, req.url, 500, responseTime, false);
        }
    }

    async forwardHttpRequest(req, res, proxy, requestId, startTime) {
        return new Promise((resolve, reject) => {
            // 创建到上游代理的请求
            const proxyReq = http.request({
                hostname: proxy.host,
                port: proxy.port,
                method: req.method,
                path: req.url,
                headers: {
                    ...req.headers,
                    'Proxy-Authorization': `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`
                },
                timeout: config.get('performance.requestTimeout')
            });

            // 处理代理响应
            proxyReq.on('response', (proxyRes) => {
                const responseTime = Date.now() - startTime;
                
                logger.proxyResponse(req.method, req.url, proxyRes.statusCode, responseTime, { 
                    requestId, 
                    proxyId: proxy.id 
                });
                
                this.performanceMonitor?.recordRequest(req.method, req.url, proxyRes.statusCode, responseTime, true);
                
                // 转发响应头和数据
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
                
                proxyRes.on('end', resolve);
                proxyRes.on('error', reject);
            });

            // 处理代理请求错误
            proxyReq.on('error', (error) => {
                const responseTime = Date.now() - startTime;
                
                logger.proxyError(req.method, req.url, error, { 
                    requestId, 
                    proxyId: proxy.id,
                    proxyHost: proxy.host,
                    proxyPort: proxy.port
                });
                
                this.performanceMonitor?.recordRequest(req.method, req.url, 500, responseTime, false);
                
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('上游代理连接失败');
                }
                
                reject(error);
            });

            // 处理超时
            proxyReq.on('timeout', () => {
                const responseTime = Date.now() - startTime;
                const timeoutError = new Error('代理请求超时');
                
                logger.proxyError(req.method, req.url, timeoutError, { 
                    requestId, 
                    proxyId: proxy.id,
                    timeout: config.get('performance.requestTimeout')
                });
                
                this.performanceMonitor?.recordRequest(req.method, req.url, 504, responseTime, false);
                
                proxyReq.destroy();
                
                if (!res.headersSent) {
                    res.writeHead(504, { 'Content-Type': 'text/plain' });
                    res.end('代理请求超时');
                }
                
                reject(timeoutError);
            });

            // 转发客户端数据
            req.pipe(proxyReq);
            
            // 处理客户端连接错误
            req.on('error', (error) => {
                logger.error('客户端请求错误', { 
                    requestId, 
                    error: error.message,
                    clientIp: req.connection.remoteAddress
                });
                proxyReq.destroy();
                reject(error);
            });
        });
    }

    handleConnectRequest(req, clientSocket, head) {
        const requestId = `CONNECT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const clientIp = clientSocket.remoteAddress;
        const startTime = Date.now();

        logger.info(`收到CONNECT请求: ${req.url}`, { 
            requestId, 
            clientIp,
            clientPort: clientSocket.remotePort
        });

        // 验证认证信息
        const authResult = this.validateAuth(req, clientIp);
        if (!authResult.success) {
            clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n');
            clientSocket.write('Proxy-Authenticate: Basic realm="Proxy"\r\n\r\n');
            clientSocket.end();
            
            const responseTime = Date.now() - startTime;
            this.performanceMonitor?.recordRequest('CONNECT', req.url, 407, responseTime, false);
            return;
        }

        // 获取可用代理
        const proxy = this.proxyPool.getAvailableProxy();
        if (!proxy) {
            clientSocket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
            clientSocket.end();
            
            const responseTime = Date.now() - startTime;
            this.performanceMonitor?.recordRequest('CONNECT', req.url, 503, responseTime, false);
            logger.error('没有可用代理处理CONNECT请求', { requestId, clientIp });
            return;
        }

        this.handleTunneling(req, clientSocket, head, proxy, requestId, startTime);
    }

    handleTunneling(req, clientSocket, head, proxy, requestId, startTime) {
        // 创建到上游代理的连接
        const proxySocket = net.createConnection({
            host: proxy.host,
            port: proxy.port
        });

        // 统一的清理函数
        const cleanup = () => {
            try {
                if (!clientSocket.destroyed) clientSocket.destroy();
                if (!proxySocket.destroyed) proxySocket.destroy();
            } catch (error) {
                logger.debug('清理连接时发生错误', { requestId, error: error.message });
            }
        };

        // 设置超时
        const timeout = setTimeout(() => {
            logger.error('CONNECT请求超时', { requestId, timeout: 30000 });
            cleanup();
            
            const responseTime = Date.now() - startTime;
            this.performanceMonitor?.recordRequest('CONNECT', req.url, 504, responseTime, false);
        }, 30000);

        // 客户端Socket事件处理
        clientSocket.on('error', (error) => {
            logger.error('客户端Socket错误', { requestId, error: error.message });
            clearTimeout(timeout);
            cleanup();
        });

        clientSocket.on('close', () => {
            logger.debug('客户端连接已关闭', { requestId });
            clearTimeout(timeout);
            cleanup();
        });

        // 上游代理Socket事件处理
        proxySocket.on('error', (error) => {
            logger.error('上游代理Socket错误', { 
                requestId, 
                error: error.message,
                proxyId: proxy.id,
                proxyHost: proxy.host,
                proxyPort: proxy.port
            });
            
            clearTimeout(timeout);
            
            if (!clientSocket.writableEnded) {
                clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            }
            
            cleanup();
            
            const responseTime = Date.now() - startTime;
            this.performanceMonitor?.recordRequest('CONNECT', req.url, 502, responseTime, false);
        });

        proxySocket.on('close', () => {
            logger.debug('上游代理连接已关闭', { requestId });
            clearTimeout(timeout);
            cleanup();
        });

        proxySocket.on('connect', () => {
            logger.info('成功连接到上游代理', { 
                requestId,
                proxyId: proxy.id,
                proxyHost: proxy.host,
                proxyPort: proxy.port
            });

            // 向上游代理发送CONNECT请求
            const connectReq = [
                `CONNECT ${req.url} HTTP/1.1`,
                `Host: ${req.url}`,
                `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`,
                'Connection: keep-alive',
                '',
                ''
            ].join('\r\n');
            
            proxySocket.write(connectReq);
        });

        let headerReceived = false;
        
        proxySocket.on('data', (data) => {
            if (!headerReceived) {
                const response = data.toString();
                logger.debug('收到上游代理响应', { 
                    requestId,
                    response: response.substring(0, 100).replace(/\r\n/g, '\\r\\n')
                });
                
                if (response.includes('HTTP/1.1 200') || response.includes('200 Connection established')) {
                    headerReceived = true;
                    clearTimeout(timeout);
                    
                    logger.info('上游代理隧道建立成功', { requestId });
                    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                    
                    const responseTime = Date.now() - startTime;
                    this.performanceMonitor?.recordRequest('CONNECT', req.url, 200, responseTime, true);
                    
                    // 如果响应中还有额外数据，需要转发
                    const headerEndIndex = response.indexOf('\r\n\r\n');
                    if (headerEndIndex !== -1 && headerEndIndex + 4 < data.length) {
                        const remainingData = data.slice(headerEndIndex + 4);
                        clientSocket.write(remainingData);
                    }
                    
                    // 开始双向转发数据
                    proxySocket.pipe(clientSocket);
                    clientSocket.pipe(proxySocket);
                    
                } else {
                    logger.error('上游代理连接失败', { requestId, response });
                    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                    cleanup();
                    
                    const responseTime = Date.now() - startTime;
                    this.performanceMonitor?.recordRequest('CONNECT', req.url, 502, responseTime, false);
                }
            }
        });
    }

    validateAuth(req, clientIp) {
        const authHeader = req.headers['proxy-authorization'];
        
        if (!authHeader) {
            logger.auth(false, 'unknown', clientIp, 'ProxyServer1');
            return { success: false, message: '需要代理认证' };
        }
        
        try {
            const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
            const [username, password] = auth.split(':');
            
            if (username !== this.auth.username || password !== this.auth.password) {
                logger.auth(false, username, clientIp, 'ProxyServer1');
                return { success: false, message: '认证失败' };
            }
            
            logger.auth(true, username, clientIp, 'ProxyServer1');
            return { success: true };
            
        } catch (error) {
            logger.auth(false, 'invalid', clientIp, 'ProxyServer1');
            return { success: false, message: '认证格式错误' };
        }
    }

    start() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                this.create();
            }

            this.server.listen(this.port, this.host, (error) => {
                if (error) {
                    logger.serverError('ProxyServer1', error);
                    reject(error);
                } else {
                    logger.serverStart('代理服务器1', this.port, 'http');
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

            logger.info('正在关闭代理服务器1');

            // 关闭服务器，不再接受新连接
            this.server.close(() => {
                logger.info('代理服务器1已关闭');
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

module.exports = ProxyServer1;