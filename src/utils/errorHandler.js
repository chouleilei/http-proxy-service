const logger = require('./logger');

/**
 * 全局错误处理系统
 * 处理未捕获异常、Promise拒绝和应用程序错误
 */
class ErrorHandler {
    constructor() {
        this.setupGlobalHandlers();
        this.errorCounts = new Map();
        this.lastErrors = [];
        this.maxLastErrors = 50;
    }

    setupGlobalHandlers() {
        // 处理未捕获的异常
        process.on('uncaughtException', (error) => {
            logger.error('未捕获的异常', {
                type: 'uncaught_exception',
                error: error.message,
                stack: error.stack
            });
            
            this.recordError('uncaught_exception', error);
            
            // 给应用一些时间来清理资源
            setTimeout(() => {
                logger.error('由于未捕获的异常，应用程序即将退出');
                process.exit(1);
            }, 1000);
        });

        // 处理未处理的Promise拒绝
        process.on('unhandledRejection', (reason, promise) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            
            logger.error('未处理的Promise拒绝', {
                type: 'unhandled_rejection',
                error: error.message,
                stack: error.stack,
                promise: promise.toString()
            });
            
            this.recordError('unhandled_rejection', error);
        });

        // 处理警告
        process.on('warning', (warning) => {
            logger.warn('Node.js警告', {
                type: 'node_warning',
                name: warning.name,
                message: warning.message,
                stack: warning.stack
            });
        });

        // 处理SIGTERM信号（优雅关闭）
        process.on('SIGTERM', () => {
            logger.info('收到SIGTERM信号，开始优雅关闭');
            this.gracefulShutdown('SIGTERM');
        });

        // 处理SIGINT信号（Ctrl+C）
        process.on('SIGINT', () => {
            logger.info('收到SIGINT信号，开始优雅关闭');
            this.gracefulShutdown('SIGINT');
        });
    }

    recordError(type, error) {
        // 记录错误计数
        const key = `${type}:${error.message}`;
        this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

        // 记录最近的错误
        this.lastErrors.unshift({
            type,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            count: this.errorCounts.get(key)
        });

        // 限制最近错误的数量
        if (this.lastErrors.length > this.maxLastErrors) {
            this.lastErrors = this.lastErrors.slice(0, this.maxLastErrors);
        }
    }

    // 创建错误处理中间件（Express）
    createExpressErrorHandler() {
        return (error, req, res, next) => {
            logger.error('Express错误', {
                type: 'express_error',
                method: req.method,
                url: req.url,
                userAgent: req.get('User-Agent'),
                ip: req.ip,
                error: error.message,
                stack: error.stack
            });

            this.recordError('express_error', error);

            // 如果响应已经开始发送，交给默认的Express错误处理器
            if (res.headersSent) {
                return next(error);
            }

            // 根据错误类型返回适当的状态码
            let statusCode = 500;
            let message = '内部服务器错误';

            if (error.name === 'ValidationError') {
                statusCode = 400;
                message = '请求参数错误';
            } else if (error.name === 'UnauthorizedError') {
                statusCode = 401;
                message = '未授权访问';
            } else if (error.name === 'ForbiddenError') {
                statusCode = 403;
                message = '禁止访问';
            } else if (error.name === 'NotFoundError') {
                statusCode = 404;
                message = '资源未找到';
            } else if (error.name === 'TimeoutError') {
                statusCode = 504;
                message = '请求超时';
            }

            res.status(statusCode).json({
                success: false,
                error: message,
                timestamp: new Date().toISOString(),
                requestId: req.id || 'unknown'
            });
        };
    }

    // 包装异步函数以捕获错误
    wrapAsync(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    // 包装Promise以添加错误处理
    wrapPromise(promise, context = '') {
        return promise.catch(error => {
            logger.error(`Promise错误${context ? ` (${context})` : ''}`, {
                type: 'promise_error',
                context,
                error: error.message,
                stack: error.stack
            });
            
            this.recordError('promise_error', error);
            throw error;
        });
    }

    // 创建自定义错误类
    createError(name, message, statusCode = 500) {
        const error = new Error(message);
        error.name = name;
        error.statusCode = statusCode;
        return error;
    }

    // 优雅关闭处理
    gracefulShutdown(signal) {
        logger.info(`开始优雅关闭流程 (信号: ${signal})`);
        
        // 设置关闭超时
        const shutdownTimeout = setTimeout(() => {
            logger.error('优雅关闭超时，强制退出');
            process.exit(1);
        }, 30000); // 30秒超时

        // 执行清理操作
        this.cleanup()
            .then(() => {
                logger.info('优雅关闭完成');
                clearTimeout(shutdownTimeout);
                process.exit(0);
            })
            .catch(error => {
                logger.error('优雅关闭过程中发生错误', {
                    error: error.message,
                    stack: error.stack
                });
                clearTimeout(shutdownTimeout);
                process.exit(1);
            });
    }

    // 清理资源
    async cleanup() {
        const cleanupTasks = [];

        // 如果有服务器实例，关闭它们
        if (global.servers) {
            for (const [name, server] of Object.entries(global.servers)) {
                cleanupTasks.push(
                    new Promise((resolve) => {
                        logger.info(`关闭服务器: ${name}`);
                        server.close(() => {
                            logger.info(`服务器 ${name} 已关闭`);
                            resolve();
                        });
                    })
                );
            }
        }

        // 如果有代理池，清理它
        if (global.proxyPool) {
            cleanupTasks.push(
                new Promise((resolve) => {
                    logger.info('清理代理池');
                    global.proxyPool.cleanup();
                    resolve();
                })
            );
        }

        // 等待所有清理任务完成
        await Promise.all(cleanupTasks);
        
        // 给日志系统一些时间来写入最后的日志
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 获取错误统计信息
    getErrorStats() {
        const stats = {
            totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
            uniqueErrors: this.errorCounts.size,
            errorTypes: {},
            recentErrors: this.lastErrors.slice(0, 10)
        };

        // 按错误类型分组
        for (const [key, count] of this.errorCounts.entries()) {
            const [type] = key.split(':');
            stats.errorTypes[type] = (stats.errorTypes[type] || 0) + count;
        }

        return stats;
    }

    // 清除错误统计
    clearErrorStats() {
        this.errorCounts.clear();
        this.lastErrors = [];
        logger.info('错误统计已清除');
    }
}

// 创建单例实例
const errorHandler = new ErrorHandler();

module.exports = errorHandler;