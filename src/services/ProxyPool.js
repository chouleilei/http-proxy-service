const axios = require('axios');
const moment = require('moment');
const EventEmitter = require('events');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * 代理池管理类 - 重构版本
 * 修复内存泄漏、竞态条件，实现并发健康检查
 */
class ProxyPool extends EventEmitter {
    constructor() {
        super();
        this.proxies = [];
        this.maxPoolSize = config.get('proxy.maxPoolSize');
        this.currentIndex = 0;
        this.isRefreshing = false;
        this.isHealthChecking = false;
        this.refreshTimer = null;
        this.healthCheckTimer = null;
        this.concurrentHealthChecks = config.get('proxy.concurrentHealthChecks');
        
        // 添加并发控制锁
        this.locks = {
            refresh: false,
            healthCheck: false,
            addProxy: false
        };

        this.init();
    }

    async init() {
        try {
            logger.info('初始化代理池');            // 启动时立即尝试填满代理池
            await this.refreshProxyPool();
            this.startProxyRefresh();
            this.startHealthCheck();
            this.emit('initialized');
        } catch (error) {
            logger.error('代理池初始化失败', { error: error.message, stack: error.stack });
            this.emit('error', error);
        }
    }

    // 从上游获取新代理
    async fetchNewProxy() {
        try {
            const upstreamUrl = config.get('proxy.upstreamUrl');
            logger.debug('正在从上游获取代理', { upstreamUrl });
            
            const response = await axios.get(upstreamUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const proxyString = response.data.trim();
            
            // 解析代理URL
            const proxyUrl = new URL(proxyString);
            const proxy = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                url: proxyString,
                host: proxyUrl.hostname,
                port: parseInt(proxyUrl.port),
                username: proxyUrl.username,
                password: proxyUrl.password,
                protocol: proxyUrl.protocol.replace(':', ''),
                status: 'unknown',
                lastCheck: null,
                responseTime: null,
                addTime: moment().format('YYYY-MM-DD HH:mm:ss'),
                failCount: 0,
                successCount: 0
            };
            
            logger.info('成功获取新代理', { 
                proxyId: proxy.id,
                host: proxy.host,
                port: proxy.port 
            });
            
            return proxy;
        } catch (error) {
            logger.error('获取上游代理失败', { 
                error: error.message,
                code: error.code,
                upstreamUrl: config.get('proxy.upstreamUrl')
            });
            return null;
        }
    }

    // 从上游获取多个新代理 - 使用并行请求策略
    async fetchNewProxies(count = 1) {
        try {
            const upstreamUrl = config.get('proxy.upstreamUrl');
            logger.debug('正在并行获取代理', { upstreamUrl, count });
            
            // 创建并行请求数组，每个请求获取一个代理
            const requests = Array(count).fill().map(() =>
                axios.get(upstreamUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                }).catch(error => {
                    logger.warn('单个代理请求失败', { error: error.message });
                    return null;
                })
            );
            
            // 并行执行所有请求
            const responses = await Promise.all(requests);
            const proxies = [];
            
            // 处理每个响应
            for (const response of responses) {
                if (!response || !response.data) {
                    continue;
                }
                
                try {
                    const proxyString = response.data.trim();
                    
                    // 检查是否已经存在相同的代理URL
                    if (proxies.find(p => p.url === proxyString)) {
                        logger.debug('跳过重复的代理', { proxyString });
                        continue;
                    }
                    
                    // 解析代理URL
                    const proxyUrl = new URL(proxyString);
                    const proxy = {
                        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        url: proxyString,
                        host: proxyUrl.hostname,
                        port: parseInt(proxyUrl.port),
                        username: proxyUrl.username,
                        password: proxyUrl.password,
                        protocol: proxyUrl.protocol.replace(':', ''),
                        status: 'unknown',
                        lastCheck: null,
                        responseTime: null,
                        addTime: moment().format('YYYY-MM-DD HH:mm:ss'),
                        failCount: 0,
                        successCount: 0
                    };
                    
                    proxies.push(proxy);
                    logger.info('成功获取新代理', {
                        proxyId: proxy.id,
                        host: proxy.host,
                        port: proxy.port
                    });
                } catch (parseError) {
                    logger.error('解析代理URL失败', {
                        error: parseError.message,
                        proxyString: response.data
                    });
                }
            }
            
            logger.info('并行获取代理完成', {
                requested: count,
                received: proxies.length,
                unique: proxies.length
            });
            
            return proxies;
        } catch (error) {
            logger.error('并行获取上游代理失败', {
                error: error.message,
                code: error.code,
                upstreamUrl: config.get('proxy.upstreamUrl')
            });
            return [];
        }
    }

    // 添加代理到池中（带锁机制）
    async addProxy() {
        if (this.locks.addProxy) {
            logger.debug('添加代理操作正在进行中，跳过');
            return false;
        }

        if (this.proxies.length >= this.maxPoolSize) {
            logger.debug('代理池已满，无需添加新代理', {
                current: this.proxies.length,
                max: this.maxPoolSize
            });
            return false;
        }

        this.locks.addProxy = true;
        
        try {
            const proxy = await this.fetchNewProxy();
            if (!proxy) {
                return false;
            }
            
            // 检查是否已存在相同的代理
            // 修改为基于完整URL检查，而不是仅基于主机和端口
            const exists = this.proxies.find(p => p.url === proxy.url);
            
            if (exists) {
                logger.debug('代理已存在，无需重复添加', {
                    host: proxy.host,
                    port: proxy.port
                });
                return false;
            }
            
            this.proxies.push(proxy);
            logger.info('代理已添加到池中', {
                proxyId: proxy.id,
                host: proxy.host,
                port: proxy.port,
                poolSize: this.proxies.length
            });
            
            // 立即测试新添加的代理
            const result = await this.testProxy(proxy);
            this.updateProxyStatus(proxy, result);
            
            if (!result.success) {
                // 移除不可用的代理
                this.removeProxy(proxy.id);
                logger.warn('移除不可用的新代理', {
                    proxyId: proxy.id,
                    host: proxy.host,
                    port: proxy.port,
                    error: result.error
                });
                return false;
            }

            this.emit('proxyAdded', proxy);
            return true;
            
        } finally {
            this.locks.addProxy = false;
        }
    }

    // 移除代理
    removeProxy(proxyId) {
        const index = this.proxies.findIndex(p => p.id === proxyId);
        if (index !== -1) {
            const proxy = this.proxies[index];
            this.proxies.splice(index, 1);
            
            // 调整当前索引
            if (this.currentIndex >= this.proxies.length) {
                this.currentIndex = 0;
            }
            
            logger.info('代理已从池中移除', {
                proxyId: proxy.id,
                host: proxy.host,
                port: proxy.port,
                poolSize: this.proxies.length
            });
            
            this.emit('proxyRemoved', proxy);
            return true;
        }
        return false;
    }

    // 更新代理状态
    updateProxyStatus(proxy, testResult) {
        const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
        
        if (testResult.success) {
            proxy.status = 'online';
            proxy.responseTime = testResult.responseTime;
            proxy.lastCheck = currentTime;
            proxy.successCount++;
            proxy.failCount = 0; // 重置失败计数
        } else {
            proxy.status = 'offline';
            proxy.responseTime = null;
            proxy.lastCheck = currentTime;
            proxy.failCount++;
        }
    }

    // 定期刷新代理池（修复定时器泄漏）
    startProxyRefresh() {
        // 清除现有定时器
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        logger.info('启动代理池刷新任务');
        
        // 立即执行一次
        setTimeout(() => {
            this.refreshProxyPool();
        }, 5000);
        
        // 设置定期刷新
        const refreshInterval = config.get('proxy.refreshInterval');
        this.refreshTimer = setInterval(() => {
            this.refreshProxyPool();
        }, refreshInterval);
    }

    // 刷新代理池，确保有足够代理（带锁机制）
    async refreshProxyPool() {
        if (this.locks.refresh) {
            logger.debug('代理池刷新正在进行中，跳过本次刷新');
            return;
        }

        this.locks.refresh = true;
        
        try {
            logger.info('开始刷新代理池', {
                current: this.proxies.length,
                max: this.maxPoolSize
            });
            
            const needed = this.maxPoolSize - this.proxies.length;
            
            if (needed > 0) {
                // 使用批量获取代理功能
                const newProxies = await this.fetchNewProxies(needed);
                
                // 添加获取到的代理到池中
                const addPromises = [];
                for (const proxy of newProxies) {
                    // 检查是否已存在相同的代理
                    const exists = this.proxies.find(p => p.url === proxy.url);
                    
                    if (!exists) {
                        this.proxies.push(proxy);
                        logger.info('代理已添加到池中', {
                            proxyId: proxy.id,
                            host: proxy.host,
                            port: proxy.port,
                            poolSize: this.proxies.length
                        });
                        
                        // 立即测试新添加的代理
                        addPromises.push(
                            this.testProxy(proxy)
                                .then(result => {
                                    this.updateProxyStatus(proxy, result);
                                    if (!result.success) {
                                        // 移除不可用的代理
                                        this.removeProxy(proxy.id);
                                        logger.warn('移除不可用的新代理', {
                                            proxyId: proxy.id,
                                            host: proxy.host,
                                            port: proxy.port,
                                            error: result.error
                                        });
                                    } else {
                                        this.emit('proxyAdded', proxy);
                                    }
                                })
                                .catch(error => {
                                    logger.error('测试新代理失败', {
                                        proxyId: proxy.id,
                                        error: error.message
                                    });
                                    // 移除测试失败的代理
                                    this.removeProxy(proxy.id);
                                })
                        );
                    } else {
                        logger.debug('代理已存在，无需重复添加', {
                            host: proxy.host,
                            port: proxy.port
                        });
                    }
                }
                
                // 等待所有代理测试完成
                await Promise.all(addPromises);
            }
            
            logger.info('代理池刷新完成', {
                poolSize: this.proxies.length,
                maxSize: this.maxPoolSize
            });
            
            this.emit('poolRefreshed', {
                total: this.proxies.length,
                max: this.maxPoolSize
            });
            
        } catch (error) {
            logger.error('代理池刷新失败', {
                error: error.message,
                stack: error.stack
            });
        } finally {
            this.locks.refresh = false;
        }
    }

    // 启动定时健康检查（修复定时器泄漏）
    startHealthCheck() {
        // 清除现有定时器
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        logger.info('启动定时健康检查');
        
        // 立即执行一次检查
        setTimeout(() => {
            this.autoHealthCheck();
        }, 30000);

        // 设置定期健康检查
        const healthCheckInterval = config.get('proxy.healthCheckInterval');
        this.healthCheckTimer = setInterval(() => {
            this.autoHealthCheck();
        }, healthCheckInterval);
    }

    // 并发健康检查（优化性能）
    async autoHealthCheck() {
        if (this.locks.healthCheck) {
            logger.debug('健康检查正在进行中，跳过本次检查');
            return;
        }

        this.locks.healthCheck = true;
        
        try {
            const startTime = Date.now();
            logger.info('开始并发健康检查', {
                proxyCount: this.proxies.length,
                concurrency: this.concurrentHealthChecks
            });
            
            if (this.proxies.length === 0) {
                logger.warn('代理池为空，跳过健康检查');
                return;
            }

            // 将代理分批进行并发检查
            const batches = this.chunkArray(this.proxies, this.concurrentHealthChecks);
            
            for (const batch of batches) {
                const checkPromises = batch.map(proxy => this.checkProxyHealth(proxy));
                await Promise.all(checkPromises);
                
                // 批次之间短暂延迟
                if (batches.indexOf(batch) < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // 清理离线代理 - 修改为失败一次就移除
            const beforeCleanup = this.proxies.length;
            const offlineProxies = this.proxies.filter(p => p.status === 'offline' && p.failCount >= 1);
            
            for (const proxy of offlineProxies) {
                this.removeProxy(proxy.id);
            }

            const onlineProxies = this.proxies.filter(p => p.status === 'online').length;
            const totalTime = Date.now() - startTime;
            
            logger.info('健康检查完成', {
                totalTime: `${totalTime}ms`,
                online: onlineProxies,
                total: this.proxies.length,
                removed: beforeCleanup - this.proxies.length
            });

            // 记录代理池状态
            logger.poolStatus(this.proxies.length, onlineProxies, 
                this.proxies.length - onlineProxies, this.maxPoolSize);

            // 如果代理数不足，尝试补充
            if (this.proxies.length < this.maxPoolSize) {
                logger.info('代理数不足，尝试补充新代理', {
                    current: this.proxies.length,
                    needed: this.maxPoolSize - this.proxies.length
                });
                
                // 异步补充，不阻塞健康检查
                setImmediate(() => this.refreshProxyPool());
            }

            this.emit('healthCheckCompleted', {
                total: this.proxies.length,
                online: onlineProxies,
                duration: totalTime
            });
            
        } catch (error) {
            logger.error('健康检查失败', {
                error: error.message,
                stack: error.stack
            });
        } finally {
            this.locks.healthCheck = false;
        }
    }

    // 检查单个代理健康状态
    async checkProxyHealth(proxy) {
        try {
            const result = await this.testProxy(proxy);
            this.updateProxyStatus(proxy, result);
            
            logger.healthCheck(
                proxy.id,
                proxy.host,
                proxy.port,
                result.success,
                result.responseTime,
                result.error
            );
            
            return result;
        } catch (error) {
            logger.error('代理健康检查异常', {
                proxyId: proxy.id,
                host: proxy.host,
                port: proxy.port,
                error: error.message
            });
            
            this.updateProxyStatus(proxy, {
                success: false,
                responseTime: null,
                error: error.message
            });
            
            return { success: false, error: error.message };
        }
    }

    // 测试代理可用性
    async testProxy(proxy) {
        try {
            const startTime = Date.now();
            const testUrl = config.get('proxy.testUrl');
            const timeout = config.get('proxy.testTimeout');
            
            const response = await axios.get(testUrl, {
                proxy: {
                    protocol: 'http',
                    host: proxy.host,
                    port: proxy.port,
                    auth: {
                        username: proxy.username,
                        password: proxy.password
                    }
                },
                timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
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
                error: error.code || error.message
            };
        }
    }

    // 获取可用代理（智能轮询，优先在线代理）
    getAvailableProxy() {
        if (this.proxies.length === 0) {
            logger.warn('代理池为空');
            return null;
        }

        // 优先获取在线代理
        const onlineProxies = this.proxies.filter(p => p.status === 'online');
        
        if (onlineProxies.length > 0) {
            // 按响应时间排序，选择最快的代理
            onlineProxies.sort((a, b) => (a.responseTime || Infinity) - (b.responseTime || Infinity));
            const proxy = onlineProxies[this.currentIndex % onlineProxies.length];
            this.currentIndex = (this.currentIndex + 1) % onlineProxies.length;
            
            logger.debug('分配在线代理', {
                proxyId: proxy.id,
                host: proxy.host,
                port: proxy.port,
                responseTime: proxy.responseTime
            });
            
            return proxy;
        } else {
            // 如果没有在线代理，尝试使用未知状态的代理
            const unknownProxies = this.proxies.filter(p => p.status === 'unknown');
            
            if (unknownProxies.length > 0) {
                const proxy = unknownProxies[0];
                logger.warn('分配未知状态代理', {
                    proxyId: proxy.id,
                    host: proxy.host,
                    port: proxy.port
                });
                return proxy;
            } else {
                logger.error('没有可用的代理');
                return null;
            }
        }
    }

    // 工具方法：将数组分块
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    // 获取代理池状态
    getStatus(includeCredentials = false) {
        const onlineCount = this.proxies.filter(p => p.status === 'online').length;
        const offlineCount = this.proxies.filter(p => p.status === 'offline').length;
        const unknownCount = this.proxies.filter(p => p.status === 'unknown').length;

        return {
            total: this.proxies.length,
            online: onlineCount,
            offline: offlineCount,
            unknown: unknownCount,
            max: this.maxPoolSize,
            currentIndex: this.currentIndex,
            isRefreshing: this.locks.refresh,
            isHealthChecking: this.locks.healthCheck,
            proxies: this.proxies.map(p => {
                const proxyInfo = {
                    id: p.id,
                    host: p.host,
                    port: p.port,
                    protocol: p.protocol,
                    status: p.status,
                    responseTime: p.responseTime,
                    addTime: p.addTime,
                    lastCheck: p.lastCheck,
                    successCount: p.successCount,
                    failCount: p.failCount
                };
                
                if (includeCredentials) {
                    proxyInfo.username = p.username;
                    proxyInfo.password = p.password;
                }
                
                return proxyInfo;
            })
        };
    }

    // 清理资源
    cleanup() {
        logger.info('清理代理池资源');
        
        // 清除定时器
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        
        // 清空代理列表
        this.proxies = [];
        
        // 移除所有监听器
        this.removeAllListeners();
        
        logger.info('代理池资源清理完成');
    }
}

module.exports = ProxyPool;