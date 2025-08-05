const path = require('path');
const fs = require('fs');
const config = require('../config');

// 尝试加载winston和日志轮转模块，如果失败则使用简化版本
let winston;
let DailyRotateFile;
try {
    winston = require('winston');
    DailyRotateFile = require('winston-daily-rotate-file');
} catch (error) {
    console.warn('Winston或winston-daily-rotate-file未安装，使用简化日志系统');
    winston = null;
    DailyRotateFile = null;
}

/**
 * 统一的日志管理系统
 * 支持日志轮转、级别管理和结构化日志
 * 如果winston不可用，自动降级到简化版本
 */
class Logger {
    constructor() {
        this.createLogDirectory();
        this.logger = winston ? this.createLogger() : this.createSimpleLogger();
        this.isWinston = !!winston;
    }

    createLogDirectory() {
        const logDir = path.dirname(config.get('logging.file'));
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    createSimpleLogger() {
        const logFile = config.get('logging.file');
        const errorLogFile = logFile.replace('.log', '.error.log');
        
        return {
            debug: (message, meta = {}) => this.writeLog('DEBUG', message, meta),
            info: (message, meta = {}) => this.writeLog('INFO', message, meta),
            warn: (message, meta = {}) => this.writeLog('WARN', message, meta),
            error: (message, meta = {}) => this.writeLog('ERROR', message, meta, true),
            level: config.get('logging.level')
        };
    }

    writeLog(level, message, meta = {}, isError = false) {
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        const logLine = `${timestamp} [${level}] ${message}${metaStr}\n`;
        
        // 控制台输出
        const consoleMethod = isError ? 'error' : (level === 'WARN' ? 'warn' : 'log');
        console[consoleMethod](`${timestamp} [${level}] ${message}`, meta);
        
        // 文件输出
        const logFile = config.get('logging.file');
        fs.appendFileSync(logFile, logLine);
        
        // 错误日志单独记录
        if (isError) {
            const errorLogFile = logFile.replace('.log', '.error.log');
            fs.appendFileSync(errorLogFile, logLine);
        }
    }

    createLogger() {
        const logLevel = config.get('logging.level');
        const logFile = config.get('logging.file');
        const maxSize = config.get('logging.maxSize');
        const maxFiles = config.get('logging.maxFiles');
        const datePattern = config.get('logging.datePattern');

        // 自定义格式化器
        const customFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.json(),
            winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                let log = `${timestamp} [${level.toUpperCase()}]`;
                
                if (typeof message === 'object') {
                    log += ` ${JSON.stringify(message)}`;
                } else {
                    log += ` ${message}`;
                }
                
                if (Object.keys(meta).length > 0) {
                    log += ` ${JSON.stringify(meta)}`;
                }
                
                if (stack) {
                    log += `\n${stack}`;
                }
                
                return log;
            })
        );

        const transports = [
            // 控制台输出
            new winston.transports.Console({
                level: logLevel,
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp({
                        format: 'HH:mm:ss'
                    }),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        let log = `${timestamp} ${level}`;
                        
                        if (typeof message === 'object') {
                            log += ` ${JSON.stringify(message, null, 2)}`;
                        } else {
                            log += ` ${message}`;
                        }
                        
                        if (Object.keys(meta).length > 0) {
                            log += ` ${JSON.stringify(meta)}`;
                        }
                        
                        return log;
                    })
                )
            }),

            // 文件输出 - 所有日志 (24小时轮转)
            new DailyRotateFile({
                filename: logFile.replace('.log', '-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                level: logLevel,
                format: customFormat,
                maxSize: maxSize,
                maxFiles: '1d', // 只保留1天的日志
                auditFile: path.join(path.dirname(logFile), '.audit.json'),
                createSymlink: true,
                symlinkName: path.basename(logFile)
            }),

            // 文件输出 - 错误日志 (24小时轮转)
            new DailyRotateFile({
                filename: logFile.replace('.log', '.error-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                level: 'error',
                format: customFormat,
                maxSize: maxSize,
                maxFiles: '1d', // 只保留1天的错误日志
                auditFile: path.join(path.dirname(logFile), '.audit-error.json'),
                createSymlink: true,
                symlinkName: path.basename(logFile.replace('.log', '.error.log'))
            })
        ];

        return winston.createLogger({
            level: logLevel,
            transports,
            exitOnError: false,
            // 处理未捕获的异常
            exceptionHandlers: [
                new DailyRotateFile({
                    filename: logFile.replace('.log', '.exceptions-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    format: customFormat,
                    maxFiles: '1d',
                    auditFile: path.join(path.dirname(logFile), '.audit-exceptions.json')
                })
            ],
            // 处理未处理的Promise拒绝
            rejectionHandlers: [
                new DailyRotateFile({
                    filename: logFile.replace('.log', '.rejections-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    format: customFormat,
                    maxFiles: '1d',
                    auditFile: path.join(path.dirname(logFile), '.audit-rejections.json')
                })
            ]
        });
    }

    parseSize(sizeStr) {
        const units = { k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
        const match = sizeStr.toLowerCase().match(/^(\d+)([kmg]?)$/);
        
        if (!match) {
            return 10 * 1024 * 1024; // 默认10MB
        }
        
        const [, size, unit] = match;
        return parseInt(size) * (units[unit] || 1);
    }

    // 基础日志方法
    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    // 业务相关的日志方法
    proxyRequest(method, url, proxyInfo, meta = {}) {
        this.info(`代理请求: ${method} ${url}`, {
            type: 'proxy_request',
            method,
            url,
            proxy: proxyInfo,
            ...meta
        });
    }

    proxyResponse(method, url, statusCode, responseTime, meta = {}) {
        this.info(`代理响应: ${method} ${url} - ${statusCode} (${responseTime}ms)`, {
            type: 'proxy_response',
            method,
            url,
            statusCode,
            responseTime,
            ...meta
        });
    }

    proxyError(method, url, error, meta = {}) {
        this.error(`代理错误: ${method} ${url} - ${error.message}`, {
            type: 'proxy_error',
            method,
            url,
            error: error.message,
            stack: error.stack,
            ...meta
        });
    }

    healthCheck(proxyId, host, port, success, responseTime, error = null) {
        const message = success 
            ? `健康检查通过: ${host}:${port} (${responseTime}ms)`
            : `健康检查失败: ${host}:${port} - ${error}`;

        const logMethod = success ? 'info' : 'warn';
        this[logMethod](message, {
            type: 'health_check',
            proxyId,
            host,
            port,
            success,
            responseTime,
            error
        });
    }

    poolStatus(total, online, offline, maxSize) {
        this.info(`代理池状态: ${online}/${total} 在线 (最大: ${maxSize})`, {
            type: 'pool_status',
            total,
            online,
            offline,
            maxSize
        });
    }

    serverStart(serverType, port, protocol = 'http') {
        this.info(`${serverType}启动成功: ${protocol}://0.0.0.0:${port}`, {
            type: 'server_start',
            serverType,
            port,
            protocol
        });
    }

    serverError(serverType, error) {
        this.error(`${serverType}错误: ${error.message}`, {
            type: 'server_error',
            serverType,
            error: error.message,
            stack: error.stack
        });
    }

    auth(success, username, clientIp, serverType) {
        const message = success 
            ? `认证成功: ${username} from ${clientIp}`
            : `认证失败: ${username} from ${clientIp}`;

        const logMethod = success ? 'info' : 'warn';
        this[logMethod](message, {
            type: 'auth',
            success,
            username,
            clientIp,
            serverType
        });
    }

    performance(metric, value, unit = '', meta = {}) {
        this.info(`性能指标: ${metric} = ${value}${unit}`, {
            type: 'performance',
            metric,
            value,
            unit,
            ...meta
        });
    }

    // 获取日志统计信息
    getStats() {
        return {
            level: this.logger.level,
            transports: this.logger.transports.length,
            logFile: config.get('logging.file')
        };
    }

    // 动态设置日志级别
    setLevel(level) {
        if (this.isWinston) {
            this.logger.level = level;
            this.logger.transports.forEach(transport => {
                if (transport.level !== 'error') {
                    transport.level = level;
                }
            });
        } else {
            this.logger.level = level;
        }
        this.info(`日志级别已更改为: ${level}`);
    }
}

// 创建单例实例
const logger = new Logger();

module.exports = logger;