/**
 * Central Logger System
 * =====================
 * Provides centralized logging with levels and operation warnings
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LoggerConfig {
  level?: LogLevel;
  prefix?: string;
  enableColors?: boolean;
}

export class VideoProcessorLogger {
  private level: LogLevel;
  private prefix: string;
  private enableColors: boolean;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? LogLevel.INFO;
    this.prefix = config.prefix ?? '[VideoProcessor]';
    this.enableColors = config.enableColors ?? true;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${this.prefix} [${level}] ${timestamp} - ${message}`;
  }
}

// Global logger instance
export const logger = new VideoProcessorLogger();

/**
 * Operation Guards
 * ================
 * Validate and warn about potentially harsh operations
 */

export interface ValidationWarning {
  level: 'info' | 'warn' | 'critical';
  message: string;
  suggestion?: string;
}

export class OperationValidator {
  private static readonly MAX_SAFE_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
  private static readonly MAX_SAFE_DURATION = 3600; // 1 hour
  private static readonly MAX_SAFE_CONCAT_FILES = 50;
  private static readonly MAX_SAFE_DIMENSIONS = 4096; // 4K

  static validateFileSize(size: number, operation: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    if (size > this.MAX_SAFE_FILE_SIZE) {
      warnings.push({
        level: 'critical',
        message: `File size (${(size / 1024 / 1024 / 1024).toFixed(2)}GB) exceeds recommended limit for ${operation}`,
        suggestion: 'Consider splitting the file or using streaming processing',
      });
    } else if (size > this.MAX_SAFE_FILE_SIZE / 2) {
      warnings.push({
        level: 'warn',
        message: `Large file size (${(size / 1024 / 1024 / 1024).toFixed(2)}GB) detected for ${operation}`,
        suggestion: 'Processing may take significant time and memory',
      });
    }

    return warnings;
  }

  static validateDuration(duration: number, operation: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    if (duration > this.MAX_SAFE_DURATION) {
      warnings.push({
        level: 'warn',
        message: `Video duration (${(duration / 60).toFixed(1)} minutes) is very long for ${operation}`,
        suggestion: 'Consider processing in chunks or using lower quality settings',
      });
    }

    return warnings;
  }

  static validateDimensions(width: number, height: number, operation: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    if (width > this.MAX_SAFE_DIMENSIONS || height > this.MAX_SAFE_DIMENSIONS) {
      warnings.push({
        level: 'warn',
        message: `High resolution (${width}x${height}) detected for ${operation}`,
        suggestion: 'Consider downscaling for faster processing',
      });
    }

    return warnings;
  }

  static validateConcatenation(fileCount: number): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    if (fileCount > this.MAX_SAFE_CONCAT_FILES) {
      warnings.push({
        level: 'critical',
        message: `Concatenating ${fileCount} files may cause memory issues`,
        suggestion: 'Process in batches or use streaming concatenation',
      });
    } else if (fileCount > this.MAX_SAFE_CONCAT_FILES / 2) {
      warnings.push({
        level: 'warn',
        message: `Concatenating ${fileCount} files may take significant time`,
      });
    }

    return warnings;
  }

  static validateMemoryUsage(operation: string, estimatedMB: number): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const availableMemory = process.memoryUsage().heapTotal / 1024 / 1024;

    if (estimatedMB > availableMemory * 0.8) {
      warnings.push({
        level: 'critical',
        message: `${operation} may exceed available memory (estimated: ${estimatedMB.toFixed(0)}MB, available: ${availableMemory.toFixed(0)}MB)`,
        suggestion: 'Use streaming or reduce quality settings',
      });
    }

    return warnings;
  }

  static logWarnings(warnings: ValidationWarning[]): void {
    warnings.forEach(warning => {
      const message = warning.suggestion
        ? `${warning.message}. ${warning.suggestion}`
        : warning.message;

      if (warning.level === 'critical') {
        logger.error(message);
      } else if (warning.level === 'warn') {
        logger.warn(message);
      } else {
        logger.info(message);
      }
    });
  }
}
