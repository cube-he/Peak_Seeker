import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SlowRequestInterceptor } from './common/interceptors/slow-request.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 全局前缀
  app.setGlobalPrefix('api/v1');

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // 校验失败时除 message(字符串数组, 保持向后兼容)外, 额外回传 fields(出错字段名)。
      // 前端资料页据此把光标定位到出错字段所在子页并标红 —— 跨子页保存时, 出错字段可能
      // 在未挂载的子页, 前端无法本地校验, 必须靠后端告知是哪个字段。
      exceptionFactory: (errors: ValidationError[]) => {
        const messages: string[] = [];
        const fields: string[] = [];
        const walk = (errs: ValidationError[]) => {
          for (const e of errs) {
            if (e.constraints) {
              fields.push(e.property);
              messages.push(...Object.values(e.constraints));
            }
            if (e.children?.length) walk(e.children);
          }
        };
        walk(errors);
        return new BadRequestException({
          message: messages,
          fields,
          error: 'Bad Request',
          statusCode: 400,
        });
      },
    }),
  );

  // CORS 配置 - 支持多个来源
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger 文档
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('志愿填报助手 API')
      .setDescription('高考志愿填报助手后端 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // 慢请求监控
  app.useGlobalInterceptors(new SlowRequestInterceptor());

  // 优雅关闭
  app.enableShutdownHooks();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Server is running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`API docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
