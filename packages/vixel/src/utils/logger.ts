/**
 * Centralized Logger
 * ==================
 * Simple, efficient logging system with debug flag control.
 * All console.log calls should go through this logger.
 */

export interface LoggerConfig {
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Logger prefix (default: '[HLS]') */
  prefix?: string;
}

/**
 * Logger class for HLS processor package
 *
 * @example
 * ```typescript
 * const logger = new Logger({ debug: true });
 * logger.info('Processing started');
 * logger.warn('High bitrate detected');
 * logger.error('Encoding failed');
 * ```
 */
export class Logger {
  private readonly debug: boolean;
  private readonly prefix: string;

  constructor(config: LoggerConfig = {}) {
    this.debug = config.debug ?? false;
    this.prefix = config.prefix ?? '[HLS]';
  }

  /**
   * Log info message (only if debug is enabled)
   */
  info(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`${this.prefix} ${message}`, ...args);
    }
  }

  /**
   * Log warning message (always shown)
   */
  warn(message: string, ...args: any[]): void {
    console.warn(`${this.prefix} ⚠️  ${message}`, ...args);
  }

  /**
   * Log error message (always shown)
   */
  error(message: string, ...args: any[]): void {
    console.error(`${this.prefix} ❌ ${message}`, ...args);
  }

  /**
   * Log success message (only if debug is enabled)
   */
  success(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`${this.prefix} ✓ ${message}`, ...args);
    }
  }

  /**
   * Log progress message (only if debug is enabled)
   */
  progress(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`${this.prefix} ${message}`, ...args);
    }
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugEnabled(): boolean {
    return this.debug;
  }
}

/**
 * Create a child logger with a different prefix
 */
export function createChildLogger(parent: Logger, childPrefix: string): Logger {
  return new Logger({
    debug: parent.isDebugEnabled(),
    prefix: childPrefix,
  });
}

// =============================================================================
// Time Formatting (WebVTT)
// =============================================================================

/**
 * Format seconds to WebVTT timestamp (HH:MM:SS.mmm)
 *
 * @example
 * ```typescript
 * formatWebVTTTime(3661.5) // "01:01:01.500"
 * formatWebVTTTime(0)      // "00:00:00.000"
 * ```
 */
export function formatWebVTTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
