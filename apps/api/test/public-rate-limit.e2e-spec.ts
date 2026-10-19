import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from '../src/app.module.js';

describe(
  'Public booking rate limit (E2E)',
  () => {
    let app: INestApplication;

    beforeAll(
      async () => {
        if (
          !process.env.DATABASE_URL?.includes(
            'agendamento_test',
          )
        ) {
          throw new Error(
            'SEGURANÇA: os testes E2E devem usar agendamento_test',
          );
        }

        const moduleRef =
          await Test.createTestingModule({
            imports: [
              AppModule,
            ],
          }).compile();

        app =
          moduleRef.createNestApplication();

        app.useGlobalPipes(
          new ValidationPipe({
            whitelist: true,
            transform: true,
          }),
        );

        await app.init();
      },
      30000,
    );

    afterAll(
      async () => {
        if (app) {
          await app.close();
        }
      },
      30000,
    );

    it(
      'bloqueia a 21ª tentativa de criação pública com HTTP 429',
      async () => {
        /*
         * Não precisamos criar um agendamento válido.
         *
         * O ThrottlerGuard executa antes da
         * validação do DTO e do controller.
         *
         * As 20 primeiras requisições podem
         * retornar 400 por causa do body vazio,
         * mas ainda contam para o limite.
         */
        for (
          let attempt = 1;
          attempt <= 20;
          attempt++
        ) {
          const response =
            await request(
              app.getHttpServer(),
            )
              .post(
                '/public/tenants/rate-limit-test/appointments',
              )
              .send({});

          expect(
            response.status,
          ).not.toBe(429);
        }

        const blockedResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/public/tenants/rate-limit-test/appointments',
            )
            .send({});

        expect(
          blockedResponse.status,
        ).toBe(429);

        expect(
          blockedResponse.body.statusCode,
        ).toBe(429);
      },
    );

    it(
      'rotas internas não recebem o limite do controller público',
      async () => {
        /*
         * O guard foi aplicado somente no
         * PublicBookingController.
         *
         * Portanto esta rota não deve responder
         * 429 mesmo após muitas chamadas.
         */
        for (
          let attempt = 1;
          attempt <= 25;
          attempt++
        ) {
          const response =
            await request(
              app.getHttpServer(),
            ).get('/');

          expect(
            response.status,
          ).not.toBe(429);
        }
      },
    );
  },
);