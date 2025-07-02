import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

class Logger {
  private logDir: string;
  private errorStream: NodeJS.WritableStream | null = null;
  private accessStream: NodeJS.WritableStream | null = null;

  constructor() {
    this.logDir = join(process.cwd(), 'logs');
    this.initializeLogDirectory();
    this.initializeStreams();
  }

  private initializeLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private initializeStreams(): void {
    if (process.env.NODE_ENV === 'production') {
      this.errorStream = createWriteStream(join(this.logDir, 'error.log'), { flags: 'a' });
      this.accessStream = createWriteStream(join(this.logDir, 'access.log'), { flags: 'a' });
    }
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}\n`;
  }

  info(message: string, meta?: any): void {
    const formatted = this.formatMessage('info', message, meta);
    console.log(formatted.trim());
    
    if (this.accessStream) {
      this.accessStream.write(formatted);
    }
  }

  error(message: string, error?: Error | any): void {
    const meta = error instanceof Error ? { 
      stack: error.stack, 
      name: error.name 
    } : error;
    
    const formatted = this.formatMessage('error', message, meta);
    console.error(formatted.trim());
    
    if (this.errorStream) {
      this.errorStream.write(formatted);
    }
  }

  warn(message: string, meta?: any): void {
    const formatted = this.formatMessage('warn', message, meta);
    console.warn(formatted.trim());
    
    if (this.accessStream) {
      this.accessStream.write(formatted);
    }
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development') {
      const formatted = this.formatMessage('debug', message, meta);
      console.debug(formatted.trim());
    }
  }
}

export const logger = new Logger();
