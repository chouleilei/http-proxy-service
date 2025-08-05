const EventEmitter = require('events');
const os = require('os');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * 性能监控系统
 * 监控CPU、内存、请求响应时间等关键指标
 */
class PerformanceMonitor extends EventEmitter {
    constructor() {
        super();
        this.enabled = config.get('monitoring.enabled');
        this.metricsInterval = config.get('monitoring.metricsInterval');
        this.historySize = config.get('monitoring.historySize');
        
        // 性能指标存储
        this.metrics = {
            system: [],
            requests: [],
            proxies: [],
            errors: []
        };
        
        // 实时统计
        this.stats = {
            requests: {
                total: 0,
                success: 0,
                failed: 0,
                avgResponseTime: 0,
                currentRPS: 0
            },
            system: {
                cpuUsage: 0,
                memoryUsage: 0,
                freeMemory: 0,
                uptime: 0
            },
            proxies: {
                total: 0,
                online: 0,
                offline: 0,
                avgResponseTime: 0
            }
        };
        
        this.monitorTimer = null;
        this.requestTimes = [];
        this.lastRequestCount = 0;
        
        if (this.enabled) {
            this.start();
        }
    }

    start() {
        if (this.monitorTimer) {
            return;
        }

        logger.info('启动性能监控系统', {
            interval: this.metricsInterval,
            historySize: this.historySize
        });

        // 立即收集一次指标
        this.collectMetrics();

        // 定期收集指标
        this.monitorTimer = setInterval(() => {
            this.collectMetrics();
        }, this.metricsInterval);

        this.emit('started');
    }

    stop() {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = null;
            logger.info('性能监控系统已停止');
            this.emit('stopped');
        }
    }

    // 收集系统指标
    async collectMetrics() {
        try {
            const timestamp = Date.now();
            
            // 收集系统指标
            const systemMetrics = await this.collectSystemMetrics();
            this.addMetric('system', { ...systemMetrics, timestamp });
            
            // 收集请求指标
            const requestMetrics = this.collectRequestMetrics();
            this.addMetric('requests', { ...requestMetrics, timestamp });
            
            // 更新实时统计
            this.updateStats(systemMetrics, requestMetrics);
            
            // 记录性能日志
            this.logPerformanceMetrics(systemMetrics, requestMetrics);
            
            this.emit('metricsCollected', {
                system: systemMetrics,
                requests: requestMetrics,
                timestamp
            });
            
        } catch (error) {
            logger.error('收集性能指标失败', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    // 收集系统指标
    async collectSystemMetrics() {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        // 计算CPU使用率
        const cpuUsage = await this.getCPUUsage();
        
        return {
            cpu: {
                usage: cpuUsage,
                cores: cpus.length,
                model: cpus[0].model
            },
            memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem,
                usage: (usedMem / totalMem) * 100
            },
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage()
            },
            system: {
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                uptime: os.uptime(),
                loadavg: os.loadavg()
            }
        };
    }

    // 获取CPU使用率
    getCPUUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            const startTime = Date.now();
            
            setTimeout(() => {
                const endUsage = process.cpuUsage(startUsage);
                const endTime = Date.now();
                const timeDiff = endTime - startTime;
                
                const userUsage = endUsage.user / 1000; // 转换为毫秒
                const systemUsage = endUsage.system / 1000;
                const totalUsage = userUsage + systemUsage;
                
                const cpuPercent = (totalUsage / (timeDiff * 1000)) * 100;
                resolve(Math.min(100, Math.max(0, cpuPercent)));
            }, 100);
        });
    }

    // 收集请求指标
    collectRequestMetrics() {
        const now = Date.now();
        const oneSecondAgo = now - 1000;
        
        // 计算最近1秒的请求数（RPS）
        const recentRequests = this.requestTimes.filter(time => time > oneSecondAgo);
        const currentRPS = recentRequests.length;
        
        // 清理旧的请求时间记录
        this.requestTimes = this.requestTimes.filter(time => time > now - 60000); // 保留1分钟
        
        // 计算平均响应时间
        const avgResponseTime = this.calculateAverageResponseTime();
        
        return {
            total: this.stats.requests.total,
            success: this.stats.requests.success,
            failed: this.stats.requests.failed,
            rps: currentRPS,
            avgResponseTime,
            successRate: this.stats.requests.total > 0 
                ? (this.stats.requests.success / this.stats.requests.total) * 100 
                : 0
        };
    }

    // 计算平均响应时间
    calculateAverageResponseTime() {
        const recentMetrics = this.metrics.requests.slice(-10); // 最近10个指标
        if (recentMetrics.length === 0) return 0;
        
        const totalTime = recentMetrics.reduce((sum, metric) => sum + (metric.avgResponseTime || 0), 0);
        return totalTime / recentMetrics.length;
    }

    // 添加指标到历史记录
    addMetric(type, metric) {
        if (!this.metrics[type]) {
            this.metrics[type] = [];
        }
        
        this.metrics[type].push(metric);
        
        // 限制历史记录大小
        if (this.metrics[type].length > this.historySize) {
            this.metrics[type] = this.metrics[type].slice(-this.historySize);
        }
    }

    // 更新实时统计
    updateStats(systemMetrics, requestMetrics) {
        // 更新系统统计
        this.stats.system = {
            cpuUsage: systemMetrics.cpu.usage,
            memoryUsage: systemMetrics.memory.usage,
            freeMemory: systemMetrics.memory.free,
            uptime: systemMetrics.process.uptime
        };
        
        // 更新请求统计
        this.stats.requests.currentRPS = requestMetrics.rps;
        this.stats.requests.avgResponseTime = requestMetrics.avgResponseTime;
    }

    // 记录请求
    recordRequest(method, url, statusCode, responseTime, success = true) {
        const now = Date.now();
        this.requestTimes.push(now);
        
        this.stats.requests.total++;
        if (success) {
            this.stats.requests.success++;
        } else {
            this.stats.requests.failed++;
        }
        
        // 记录详细的请求指标
        this.addMetric('requests', {
            timestamp: now,
            method,
            url,
            statusCode,
            responseTime,
            success
        });
        
        logger.performance('request', responseTime, 'ms', {
            method,
            url,
            statusCode,
            success
        });
    }

    // 记录代理指标
    recordProxyMetrics(proxyStats) {
        this.stats.proxies = {
            total: proxyStats.total,
            online: proxyStats.online,
            offline: proxyStats.offline,
            avgResponseTime: this.calculateProxyAverageResponseTime(proxyStats.proxies)
        };
        
        this.addMetric('proxies', {
            timestamp: Date.now(),
            ...this.stats.proxies
        });
    }

    // 计算代理平均响应时间
    calculateProxyAverageResponseTime(proxies) {
        const onlineProxies = proxies.filter(p => p.status === 'online' && p.responseTime);
        if (onlineProxies.length === 0) return 0;
        
        const totalTime = onlineProxies.reduce((sum, proxy) => sum + proxy.responseTime, 0);
        return totalTime / onlineProxies.length;
    }

    // 记录错误
    recordError(type, error, context = {}) {
        this.addMetric('errors', {
            timestamp: Date.now(),
            type,
            message: error.message,
            stack: error.stack,
            context
        });
    }

    // 记录性能日志
    logPerformanceMetrics(systemMetrics, requestMetrics) {
        // 只在指标异常时记录详细日志
        const cpuThreshold = 80;
        const memoryThreshold = 85;
        const responseTimeThreshold = 5000;
        
        if (systemMetrics.cpu.usage > cpuThreshold) {
            logger.warn('CPU使用率过高', {
                usage: systemMetrics.cpu.usage,
                threshold: cpuThreshold
            });
        }
        
        if (systemMetrics.memory.usage > memoryThreshold) {
            logger.warn('内存使用率过高', {
                usage: systemMetrics.memory.usage,
                threshold: memoryThreshold,
                used: systemMetrics.memory.used,
                total: systemMetrics.memory.total
            });
        }
        
        if (requestMetrics.avgResponseTime > responseTimeThreshold) {
            logger.warn('平均响应时间过长', {
                avgResponseTime: requestMetrics.avgResponseTime,
                threshold: responseTimeThreshold
            });
        }
        
        // 定期记录正常的性能摘要
        if (Date.now() % (5 * 60 * 1000) < this.metricsInterval) { // 每5分钟
            logger.info('性能摘要', {
                cpu: `${systemMetrics.cpu.usage.toFixed(1)}%`,
                memory: `${systemMetrics.memory.usage.toFixed(1)}%`,
                rps: requestMetrics.rps,
                avgResponseTime: `${requestMetrics.avgResponseTime.toFixed(0)}ms`,
                successRate: `${requestMetrics.successRate.toFixed(1)}%`
            });
        }
    }

    // 获取性能报告
    getPerformanceReport() {
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;
        
        // 获取最近一小时的指标
        const recentSystemMetrics = this.metrics.system.filter(m => m.timestamp > oneHourAgo);
        const recentRequestMetrics = this.metrics.requests.filter(m => m.timestamp > oneHourAgo);
        const recentProxyMetrics = this.metrics.proxies.filter(m => m.timestamp > oneHourAgo);
        const recentErrors = this.metrics.errors.filter(m => m.timestamp > oneHourAgo);
        
        return {
            summary: {
                ...this.stats,
                reportTime: new Date().toISOString(),
                monitoringDuration: this.monitorTimer ? Date.now() - (Date.now() - this.metricsInterval) : 0
            },
            trends: {
                system: this.calculateTrends(recentSystemMetrics, ['cpu.usage', 'memory.usage']),
                requests: this.calculateTrends(recentRequestMetrics, ['rps', 'avgResponseTime', 'successRate']),
                proxies: this.calculateTrends(recentProxyMetrics, ['online', 'avgResponseTime'])
            },
            alerts: this.generateAlerts(),
            errors: {
                total: recentErrors.length,
                byType: this.groupErrorsByType(recentErrors),
                recent: recentErrors.slice(-10)
            }
        };
    }

    // 计算趋势
    calculateTrends(metrics, fields) {
        const trends = {};
        
        for (const field of fields) {
            const values = metrics.map(m => this.getNestedValue(m, field)).filter(v => v !== undefined);
            if (values.length < 2) {
                trends[field] = { trend: 'stable', change: 0 };
                continue;
            }
            
            const first = values[0];
            const last = values[values.length - 1];
            const change = ((last - first) / first) * 100;
            
            let trend = 'stable';
            if (Math.abs(change) > 5) {
                trend = change > 0 ? 'increasing' : 'decreasing';
            }
            
            trends[field] = { trend, change: change.toFixed(2) };
        }
        
        return trends;
    }

    // 获取嵌套对象的值
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    // 生成告警
    generateAlerts() {
        const alerts = [];
        
        // CPU告警
        if (this.stats.system.cpuUsage > 80) {
            alerts.push({
                type: 'warning',
                message: `CPU使用率过高: ${this.stats.system.cpuUsage.toFixed(1)}%`,
                timestamp: Date.now()
            });
        }
        
        // 内存告警
        if (this.stats.system.memoryUsage > 85) {
            alerts.push({
                type: 'warning',
                message: `内存使用率过高: ${this.stats.system.memoryUsage.toFixed(1)}%`,
                timestamp: Date.now()
            });
        }
        
        // 响应时间告警
        if (this.stats.requests.avgResponseTime > 5000) {
            alerts.push({
                type: 'warning',
                message: `平均响应时间过长: ${this.stats.requests.avgResponseTime.toFixed(0)}ms`,
                timestamp: Date.now()
            });
        }
        
        // 代理告警
        if (this.stats.proxies.total > 0 && this.stats.proxies.online / this.stats.proxies.total < 0.5) {
            alerts.push({
                type: 'error',
                message: `可用代理数量过少: ${this.stats.proxies.online}/${this.stats.proxies.total}`,
                timestamp: Date.now()
            });
        }
        
        return alerts;
    }

    // 按类型分组错误
    groupErrorsByType(errors) {
        const grouped = {};
        for (const error of errors) {
            grouped[error.type] = (grouped[error.type] || 0) + 1;
        }
        return grouped;
    }

    // 获取实时统计
    getStats() {
        return { ...this.stats };
    }

    // 获取历史指标
    getMetrics(type, limit = 100) {
        if (!this.metrics[type]) {
            return [];
        }
        
        return this.metrics[type].slice(-limit);
    }

    // 清理资源
    cleanup() {
        this.stop();
        this.metrics = { system: [], requests: [], proxies: [], errors: [] };
        this.requestTimes = [];
        this.removeAllListeners();
        logger.info('性能监控系统资源清理完成');
    }
}

module.exports = PerformanceMonitor;