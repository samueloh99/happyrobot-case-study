import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type ErrorBody = {
  error: string;
  message: string;
  statusCode: number;
  path: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        message = typeof r.message === 'string' ? r.message : Array.isArray(r.message) ? r.message.join('; ') : message;
        error = typeof r.error === 'string' ? r.error : exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    if (statusCode >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${statusCode}: ${message}`, (exception as Error)?.stack);
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${statusCode}: ${message}`);
    }

    const body: ErrorBody = { error, message, statusCode, path: req.url };
    res.status(statusCode).json(body);
  }
}
