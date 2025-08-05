const path = require('path');

/**
 * 配置管理系统
 * 支持环境变量覆盖和配置验证
 */
class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
        this.validateConfig();
    }

    loadConfig() {
        const defaultConfig = {
            // 服务器配置
            server: {
                proxy1Port: parseInt(process.env.PROXY1_PORT) || 5238,
                proxy2Port: parseInt(process.env.PROXY2_PORT) || 5239,
                apiPort: parseInt(process.env.API_PORT) || 5237,
                httpsProxy2Port: parseInt(process.env.HTTPS_PROXY2_PORT) || 5240,
                httpsApiPort: parseInt(process.env.HTTPS_API_PORT) || 5241,
                host: process.env.HOST || '0.0.0.0'
            },

            // 代理池配置
            proxy: {
                upstreamUrl: process.env.UPSTREAM_PROXY_URL || 'https://us.proxy302.com/api/v1/proxy/random/us?api_key=sk-ddbfd968484f018fc091a30fc892d9279e5974a738c8f57a096822803d199c53',
                maxPoolSize: parseInt(process.env.MAX_POOL_SIZE) || 10,
                refreshInterval: parseInt(process.env.REFRESH_INTERVAL) || 5 * 60 * 1000, // 5分钟
                healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 10 * 60 * 1000, // 10分钟
                testTimeout: parseInt(process.env.TEST_TIMEOUT) || 4000,
                testUrl: process.env.TEST_URL || 'http://httpbin.org/ip',
                concurrentHealthChecks: parseInt(process.env.CONCURRENT_HEALTH_CHECKS) || 3
            },

            // 认证配置
            auth: {
                proxy1: {
                    username: process.env.PROXY1_USERNAME || 'tanglei',
                    password: process.env.PROXY1_PASSWORD || 'tl4301408'
                },
                proxy2: {
                    password: process.env.PROXY2_PASSWORD || 'chouleilei'
                }
            },

            // SSL配置
            ssl: {
                enabled: process.env.SSL_ENABLED === 'true',
                keyPath: process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/ucapi.746525006.xyz/privkey.pem',
                certPath: process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/ucapi.746525006.xyz/fullchain.pem'
            },

            // 日志配置
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                file: process.env.LOG_FILE || 'logs/proxy.log',
                maxSize: process.env.LOG_MAX_SIZE || '10m',
                maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
                datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
            },

            // 监控配置
            monitoring: {
                enabled: process.env.MONITORING_ENABLED === 'true',
                metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 30000, // 30秒
                historySize: parseInt(process.env.HISTORY_SIZE) || 100
            },

            // 性能配置
            performance: {
                requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
                maxRedirects: parseInt(process.env.MAX_REDIRECTS) || 5,
                keepAlive: process.env.KEEP_ALIVE === 'true'
            }
        };

        return defaultConfig;
    }

    validateConfig() {
        const required = [
            'server.proxy1Port',
            'server.proxy2Port', 
            'server.apiPort',
            'proxy.upstreamUrl',
            'proxy.maxPoolSize',
            'auth.proxy1.username',
            'auth.proxy1.password',
            'auth.proxy2.password'
        ];

        for (const key of required) {
            if (!this.get(key)) {
                throw new Error(`配置项 ${key} 是必需的`);
            }
        }

        // 验证端口范围
        const ports = [
            this.config.server.proxy1Port,
            this.config.server.proxy2Port,
            this.config.server.apiPort,
            this.config.server.httpsProxy2Port,
            this.config.server.httpsApiPort
        ];

        for (const port of ports) {
            if (port < 1 || port > 65535) {
                throw new Error(`端口 ${port} 超出有效范围 (1-65535)`);
            }
        }

        // 检查端口冲突
        const uniquePorts = new Set(ports);
        if (uniquePorts.size !== ports.length) {
            throw new Error('检测到端口冲突，请确保所有端口都是唯一的');
        }
    }

    get(key) {
        const keys = key.split('.');
        let value = this.config;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    set(key, value) {
        const keys = key.split('.');
        let obj = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in obj) || typeof obj[k] !== 'object') {
                obj[k] = {};
            }
            obj = obj[k];
        }
        
        obj[keys[keys.length - 1]] = value;
    }

    getAll() {
        return { ...this.config };
    }

    // 获取环境信息
    getEnvironment() {
        return {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            env: process.env.NODE_ENV || 'development',
            pid: process.pid,
            uptime: process.uptime()
        };
    }
}

// 创建单例实例
const config = new ConfigManager();

module.exports = config;