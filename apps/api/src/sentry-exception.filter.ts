import {
  ArgumentsHost,
  Catch,
  HttpException,
  type HttpServer,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import * as Sentry from "@sentry/nestjs";

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  constructor(applicationRef?: HttpServer) {
    super(applicationRef);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    if (process.env.SENTRY_DSN && status >= 500) {
      Sentry.captureException(exception);
    }

    super.catch(exception, host);
  }
}
