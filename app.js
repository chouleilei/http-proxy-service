const express = require('express');
const http = require('http');
const fs = require('fs');
const url = require('url');
const axios = require('axios');
const moment = require('moment');

// 从环境变量读取配置
const config = {
    UPSTREAM_PROXY_URL: process.env.UPSTREAM_PROXY_URL,
    PROXY_USERNAME: process.env.PROXY_USERNAME,
    PROXY_PASSWORD: process.env.PROXY_PASSWORD,
    API_PORT: parseInt(process.env.API_PORT) || 5237,
    PROXY_PORT: parseInt(process.env.PROXY_PORT) || 5238,
    MAX_POOL_SIZE: parseInt(process.env.MAX_POOL_SIZE) || 10
};

// 验证必需的环境变量
if (!config.UPSTREAM_PROXY_URL) {
    console.error('错误: 必须设置环境变量 UPSTREAM_PROXY_URL');
    process.exit(1);
}

if (!config.PROXY_USERNAME || !config.PROXY_PASSWORD) {
    console.error('错误: 必须设置环境变量 PROXY_USERNAME 和 PROXY_PASSWORD');
    process.exit(1);
}

console.log('启动配置:', {
    API_PORT: config.API_PORT,
    PROXY_PORT: config.PROXY_PORT,
    MAX_POOL_SIZE: config.MAX_POOL_SIZE,
    PROXY_USERNAME: config.PROXY_USERNAME,
    UPSTREAM_PROXY_URL: config.UPSTREAM_PROXY_URL ? '已设置' : '未设置'
});

// 代理池管理类
class ProxyPool {
    constructor() {
        this.proxies = [];
        this.maxPoolSize = config.MAX_POOL_SIZE;
        this.currentIndex = 0;
        this.startProxyRefresh();
        this.startHealthCheck();
    }

    // 从上游获取新代理
    async fetchNewProxy() {
        try {
            console.log('正在从上游获取代理...');
            const response = await axios.get(config.UPSTREAM_PROXY_URL);
            const proxyString = response.data.trim();
            
            // 解析代理URL
            const proxyUrl = new URL(proxyString);
            const proxy = {
                id: Date.now().toString(),
                url: proxyString,
                host: proxyUrl.hostname,
                port: parseInt(proxyUrl.port),
                username: proxyUrl.username,
                password: proxyUrl.password,
                protocol: proxyUrl.protocol.replace(':', ''),
                status: 'unknown',
                lastCheck: null,
                responseTime: null,
                addTime: moment().format('YYYY-MM-DD HH:mm:ss')
            };
            
            console.log(`成功获取新代理: ${proxy.host}:${proxy.port}`);
            return proxy;
        } catch (error) {
            console.error('获取上游代理失败:', error.message);
            return null;
        }
    }

    // 添加代理到池中
    async addProxy() {
        if (this.proxies.length >= this.maxPoolSize) {
            console.log('代理池已满，无需添加新代理');
            return;
        }
        
        const proxy = await this.fetchNewProxy();
        if (!proxy) {
            console.log('未能获取到新代理');
            return;
        }
        
        // 检查是否已存在
        const exists = this.proxies.find(p => p.url === proxy.url);
        if (exists) {
            console.log('代理已存在，无需重复添加');
            return;
        }
        
        this.proxies.push(proxy);
        console.log(`代理已添加到池中，当前池大小: ${this.proxies.length}`);
        
        // 立即测试新添加的代理
        console.log(`立即测试新代理: ${proxy.host}:${proxy.port}`);
        const result = await this.testProxy(proxy);
        const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
        
        if (result.success) {
            proxy.status = 'online';
            proxy.responseTime = result.responseTime;
            proxy.lastCheck = currentTime;
            console.log(`✓ 新代理测试通过 - 响应时间: ${result.responseTime}ms`);
        } else {
            proxy.status = 'offline';
            proxy.responseTime = null;
            proxy.lastCheck = currentTime;
            console.log(`✗ 新代理测试失败 - 错误: ${result.error}`);
            // 立即移除不可用的代理
            this.proxies = this.proxies.filter(p => p.id !== proxy.id);
            console.log(`移除不可用的新代理: ${proxy.host}:${proxy.port}`);
        }
    }

    // 定期刷新代理池
    startProxyRefresh() {
        console.log('启动代理池刷新任务');
        
        // 立即执行一次
        setTimeout(() => {
            this.refreshProxyPool();
        }, 5000);
        
        // 每5分钟检查一次代理池大小
        setInterval(() => {
            this.refreshProxyPool();
        }, 5 * 60 * 1000);
    }

    // 刷新代理池，确保有足够代理
    async refreshProxyPool() {
        console.log(`检查代理池状态，当前代理数: ${this.proxies.length}, 最大代理数: ${this.maxPoolSize}`);
        
        while (this.proxies.length < this.maxPoolSize) {
            await this.addProxy();
            // 添加代理之间间隔1秒
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`代理池刷新完成，当前代理数: ${this.proxies.length}`);
    }

    // 启动定时健康检查
    startHealthCheck() {
        console.log('启动定时健康检查');
        
        // 立即执行一次检查
        setTimeout(() => {
            this.autoHealthCheck();
        }, 30000);

        // 每10分钟执行一次健康检查
        setInterval(() => {
            this.autoHealthCheck();
        }, 10 * 60 * 1000);
    }

    // 自动健康检查
    async autoHealthCheck() {
        console.log(`\n=== 开始健康检查 [${moment().format('YYYY-MM-DD HH:mm:ss')}] ===`);
        
        if (this.proxies.length === 0) {
            console.log('代理池为空，跳过健康检查');
            return;
        }

        for (const proxy of this.proxies) {
            console.log(`检查代理: ${proxy.host}:${proxy.port}`);
            
            const result = await this.testProxy(proxy);
            const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
            
            if (result.success) {
                proxy.status = 'online';
                proxy.responseTime = result.responseTime;
                proxy.lastCheck = currentTime;
                console.log(`✓ 代理在线 - 响应时间: ${result.responseTime}ms`);
            } else {
                proxy.status = 'offline';
                proxy.responseTime = null;
                proxy.lastCheck = currentTime;
                console.log(`✗ 代理离线 - 错误: ${result.error}`);
            }
            
            // 短暂延迟避免过于频繁的请求
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 移除离线的代理并记录清理情况
        const beforeCleanup = this.proxies.length;
        const offlineProxies = this.proxies.filter(p => p.status === 'offline');
        this.proxies = this.proxies.filter(p => p.status !== 'offline');
        
        if (offlineProxies.length > 0) {
            console.log(`清理了 ${offlineProxies.length} 个离线代理:`);
            offlineProxies.forEach(proxy => {
                console.log(`  - 移除离线代理: ${proxy.host}:${proxy.port} (添加时间: ${proxy.addTime})`);
            });
        }
        
        const onlineProxies = this.proxies.filter(p => p.status === 'online').length;
        console.log(`健康检查完成，在线代理数: ${onlineProxies}, 总代理数: ${this.proxies.length}`);
        
        // 如果代理数不足，尝试补充
        if (this.proxies.length < this.maxPoolSize) {
            console.log(`代理数不足 (${this.proxies.length}/${this.maxPoolSize})，尝试补充新代理`);
            await this.refreshProxyPool();
        }
    }

    // 测试代理可用性
    async testProxy(proxy) {
        try {
            const startTime = Date.now();
            
            const response = await axios.get('http://httpbin.org/ip', {
                proxy: {
                    protocol: 'http',
                    host: proxy.host,
                    port: proxy.port,
                    auth: {
                        username: proxy.username,
                        password: proxy.password
                    }
                },
                timeout: 4000
            });
            
            const responseTime = Date.now() - startTime;
            
            if (response.status === 200) {
                return {
                    success: true,
                    responseTime,
                    error: null
                };
            } else {
                return {
                    success: false,
                    responseTime: null,
                    error: `HTTP状态码: ${response.status}`
                };
            }
        } catch (error) {
            return {
                success: false,
                responseTime: null,
                error: error.message
            };
        }
    }

    // 获取可用代理（智能轮询，优先在线代理）
    getAvailableProxy() {
        if (this.proxies.length === 0) {
            console.log('代理池为空');
            return null;
        }

        // 优先获取在线代理
        const onlineProxies = this.proxies.filter(p => p.status === 'online');
        
        if (onlineProxies.length > 0) {
            // 如果有在线代理，从在线代理中轮询选择
            const proxy = onlineProxies[this.currentIndex % onlineProxies.length];
            this.currentIndex = (this.currentIndex + 1) % onlineProxies.length;
            console.log(`分配在线代理: ${proxy.host}:${proxy.port} (响应时间: ${proxy.responseTime}ms)`);
            return proxy;
        } else {
            // 如果没有在线代理，尝试使用未知状态的代理
            const unknownProxies = this.proxies.filter(p => p.status === 'unknown');
            
            if (unknownProxies.length > 0) {
                const proxy = unknownProxies[0]; // 使用第一个未知状态代理
                console.log(`分配未知状态代理: ${proxy.host}:${proxy.port} (将在下次健康检查中验证)`);
                return proxy;
            } else {
                console.log('没有可用的在线或未知状态代理');
                return null;
            }
        }
    }

    // 获取代理池状态
    getStatus(includeCredentials = false) {
        return {
            total: this.proxies.length,
            max: this.maxPoolSize,
            currentIndex: this.currentIndex,
            proxies: this.proxies.map(p => {
                const proxyInfo = {
                    id: p.id,
                    host: p.host,
                    port: p.port,
                    protocol: p.protocol,
                    status: p.status,
                    responseTime: p.responseTime,
                    addTime: p.addTime,
                    lastCheck: p.lastCheck
                };
                
                if (includeCredentials) {
                    proxyInfo.username = p.username;
                    proxyInfo.password = p.password;
                }
                
                return proxyInfo;
            })
        };
    }

    // 获取完整的代理信息（内部使用）
    getFullProxies() {
        return this.proxies;
    }
}

// 创建代理池实例
const proxyPool = new ProxyPool();

// 创建代理服务器1 - 监听配置的端口
function createProxyServer1() {
    const server = http.createServer();
    
    server.on('request', async (req, res) => {
        console.log(`收到请求: ${req.method} ${req.url}`);
        
        // 验证认证信息
        const authHeader = req.headers['proxy-authorization'];
        if (!authHeader) {
            res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="Proxy"' });
            res.end('需要代理认证');
            return;
        }
        
        try {
            const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
            const [username, password] = auth.split(':');
            
            if (username !== config.PROXY_USERNAME || password !== config.PROXY_PASSWORD) {
                res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="Proxy"' });
                res.end('认证失败');
                return;
            }
        } catch (error) {
            res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="Proxy"' });
            res.end('认证格式错误');
            return;
        }

        // 获取代理
        const proxy = proxyPool.getAvailableProxy();
        if (!proxy) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('没有可用代理');
            return;
        }

        console.log(`使用代理: ${proxy.host}:${proxy.port} 转发请求: ${req.method} ${req.url}`);

        // 解析目标URL
        const targetUrl = new URL(req.url);
        
        // 创建代理请求
        const proxyReq = http.request({
            hostname: proxy.host,
            port: proxy.port,
            method: req.method,
            path: req.url,
            headers: {
                ...req.headers,
                'Proxy-Authorization': `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`
            }
        });

        // 处理代理响应
        proxyReq.on('response', (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        // 处理错误
        proxyReq.on('error', (err) => {
            console.error('代理请求错误:', err.message);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('代理请求失败');
        });

        // 转发客户端数据
        req.pipe(proxyReq);
    });

    // 处理HTTPS CONNECT请求
    server.on('connect', (req, clientSocket, head) => {
        const reqId = `[CONNECT-${Date.now()}]`;
        console.log(`${reqId} 收到CONNECT请求: ${req.url} from ${clientSocket.remoteAddress}:${clientSocket.remotePort}`);
        
        // 验证认证信息
        const authHeader = req.headers['proxy-authorization'];
        if (!authHeader) {
            clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n');
            clientSocket.write('Proxy-Authenticate: Basic realm="Proxy"\r\n\r\n');
            clientSocket.end();
            return;
        }
        
        try {
            const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
            const [username, password] = auth.split(':');
            
            if (username !== config.PROXY_USERNAME || password !== config.PROXY_PASSWORD) {
                clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n');
                clientSocket.write('Proxy-Authenticate: Basic realm="Proxy"\r\n\r\n');
                clientSocket.end();
                return;
            }
        } catch (error) {
            clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n');
            clientSocket.write('Proxy-Authenticate: Basic realm="Proxy"\r\n\r\n');
            clientSocket.end();
            return;
        }

        // 获取代理
        const proxy = proxyPool.getAvailableProxy();
        if (!proxy) {
            clientSocket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
            clientSocket.end();
            return;
        }

        console.log(`${reqId} 使用代理: ${proxy.host}:${proxy.port} 处理CONNECT请求: ${req.url}`);

        // 解析目标主机和端口
        const [targetHost, targetPort] = req.url.split(':');
        
        // 创建到上游代理的连接
        const proxySocket = require('net').createConnection({
            host: proxy.host,
            port: proxy.port
        });

        // 统一的清理函数
        const cleanup = () => {
            clientSocket.destroy();
            proxySocket.destroy();
        };

        clientSocket.on('error', (err) => {
            console.error(`${reqId} 客户端Socket错误:`, err.message);
            cleanup();
        });
        clientSocket.on('close', () => {
            console.log(`${reqId} 客户端连接已关闭`);
            cleanup();
        });

        proxySocket.on('error', (err) => {
            console.error(`${reqId} 上游代理Socket错误:`, err.message);
            if (!clientSocket.writableEnded) {
                clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            }
            cleanup();
        });
        proxySocket.on('close', () => {
            console.log(`${reqId} 上游代理连接已关闭`);
            cleanup();
        });

        proxySocket.on('connect', () => {
            console.log(`${reqId} 成功连接到上游代理 ${proxy.host}:${proxy.port}`);
            // 向上游代理发送CONNECT请求
            const connectReq = [
                `CONNECT ${req.url} HTTP/1.1`,
                `Host: ${req.url}`,
                `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`,
                'Connection: keep-alive',
                '',
                ''
            ].join('\r\n');
            
            console.log(`${reqId} 向上游代理发送CONNECT请求头`);
            proxySocket.write(connectReq);
        });

        let headerReceived = false;
        
        proxySocket.on('data', (data) => {
            if (!headerReceived) {
                const response = data.toString();
                console.log(`${reqId} 收到上游代理响应: ${response.substring(0, 150).replace(/\r\n/g, '\\r\\n')}`);
                
                if (response.includes('HTTP/1.1 200') || response.includes('200 Connection established')) {
                    headerReceived = true;
                    console.log(`${reqId} 上游代理隧道建立成功，通知客户端`);
                    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                    
                    // 如果响应中还有额外数据，需要转发
                    const headerEndIndex = response.indexOf('\r\n\r\n');
                    if (headerEndIndex !== -1 && headerEndIndex + 4 < data.length) {
                        const remainingData = data.slice(headerEndIndex + 4);
                        console.log(`${reqId} 转发上游代理的初始数据，长度: ${remainingData.length}`);
                        clientSocket.write(remainingData);
                    }
                    
                    console.log(`${reqId} 开始双向转发数据`);
                    proxySocket.pipe(clientSocket);
                    clientSocket.pipe(proxySocket);
                } else {
                    console.error(`${reqId} 上游代理连接失败: ${response}`);
                    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                    cleanup();
                }
            }
        });

        // 设置超时
        proxySocket.setTimeout(30000, () => {
            console.error(`${reqId} 上游代理连接超时`);
            if (!headerReceived) {
                clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
            }
            cleanup();
        });
    });

    return server;
}

// 创建API服务器 - 监听配置的端口
function createApiServer() {
    const app = express();
    
    // 提供静态文件服务
    app.use(express.static('public'));
    
    // 获取代理池状态
    app.get('/api/proxies', (req, res) => {
        const status = proxyPool.getStatus();
        res.json({
            success: true,
            data: status.proxies,
            total: status.total,
            max: status.max,
            currentIndex: status.currentIndex
        });
    });
    
    // 刷新代理池
    app.post('/api/refresh', async (req, res) => {
        try {
            await proxyPool.refreshProxyPool();
            res.json({ success: true, message: '代理池刷新完成' });
        } catch (error) {
            res.json({ success: false, message: error.message });
        }
    });
    
    // 手动健康检查
    app.post('/api/health-check', async (req, res) => {
        try {
            await proxyPool.autoHealthCheck();
            res.json({ success: true, message: '健康检查完成' });
        } catch (error) {
            res.json({ success: false, message: error.message });
        }
    });
    
    return app;
}

// 启动服务器
function startServers() {
    const proxyServer1 = createProxyServer1();
    const apiServer = createApiServer();
    
    // 监听端口
    proxyServer1.listen(config.PROXY_PORT, '0.0.0.0', () => {
        console.log(`代理服务器启动，监听端口 ${config.PROXY_PORT}`);
        console.log(`使用格式: http://${config.PROXY_USERNAME}:****@IP:${config.PROXY_PORT}`);
    });
    
    apiServer.listen(config.API_PORT, '0.0.0.0', () => {
        console.log(`API服务器启动，监听端口 ${config.API_PORT}`);
        console.log(`Web管理界面: http://localhost:${config.API_PORT}`);
    });
}

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信号，正在优雅关闭...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('收到 SIGINT 信号，正在优雅关闭...');
    process.exit(0);
});

// 启动服务
startServers();