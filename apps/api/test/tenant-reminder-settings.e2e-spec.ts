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
import { PrismaService } from '../src/prisma/prisma.service.js';

describe(
  'Configurações de lembrete da empresa (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let tenantId: string;

    const ownerEmail =
      'owner.tenant.reminders.e2e@teste.com';

    const password =
      'Teste@12345';

    beforeAll(
      async () => {
        if (
          !process.env.DATABASE_URL?.includes(
            'agendamento_test',
          )
        ) {
          throw new Error(
            'SEGURANÇA: o teste deve usar agendamento_test',
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
            whitelist:
              true,

            transform:
              true,
          }),
        );

        await app.init();

        prisma =
          app.get(
            PrismaService,
          );

        /*
         * Limpeza somente do banco E2E.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * Cria empresa + OWNER.
         */
        const registerResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/auth/register',
            )
            .send({
              name:
                'Owner Tenant Reminder E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Tenant Reminder E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(
          201,
        );

        /*
         * Login do OWNER.
         */
        const loginResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/auth/login',
            )
            .send({
              email:
                ownerEmail,

              password,
            });

        expect(
          [
            200,
            201,
          ],
        ).toContain(
          loginResponse.status,
        );

        expect(
          loginResponse.body.accessToken,
        ).toBeTruthy();

        ownerToken =
          loginResponse.body.accessToken;

        /*
         * Descobre o tenant.
         */
        const tenantResponse =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

        expect(
          tenantResponse.status,
        ).toBe(
          200,
        );

        tenantId =
          tenantResponse.body.id;

        expect(
          tenantId,
        ).toBeTruthy();
      },
      30000,
    );

    afterAll(
      async () => {
        if (prisma) {
          await prisma.tenant.deleteMany();
          await prisma.user.deleteMany();
        }

        if (app) {
          await app.close();
        }
      },
      30000,
    );

    it(
      'GET retorna valores padrão das configurações de lembrete',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.body.appointmentRemindersEnabled,
        ).toBe(
          true,
        );

        expect(
          response.body.appointmentReminderHoursBefore,
        ).toBe(
          24,
        );
      },
    );

    it(
      'OWNER pode desativar lembretes e alterar a antecedência',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              appointmentRemindersEnabled:
                false,

              appointmentReminderHoursBefore:
                48,
            });

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.body.appointmentRemindersEnabled,
        ).toBe(
          false,
        );

        expect(
          response.body.appointmentReminderHoursBefore,
        ).toBe(
          48,
        );

        const tenant =
          await prisma.tenant.findUnique({
            where: {
              id:
                tenantId,
            },
          });

        expect(
          tenant?.appointmentRemindersEnabled,
        ).toBe(
          false,
        );

        expect(
          tenant?.appointmentReminderHoursBefore,
        ).toBe(
          48,
        );
      },
    );

    it(
      'aceita o limite mínimo de 1 hora',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              appointmentRemindersEnabled:
                true,

              appointmentReminderHoursBefore:
                1,
            });

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.body.appointmentReminderHoursBefore,
        ).toBe(
          1,
        );
      },
    );

    it(
      'aceita o limite máximo de 168 horas',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              appointmentReminderHoursBefore:
                168,
            });

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.body.appointmentReminderHoursBefore,
        ).toBe(
          168,
        );
      },
    );

    it(
      'rejeita antecedência menor que 1 hora',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              appointmentReminderHoursBefore:
                0,
            });

        expect(
          response.status,
        ).toBe(
          400,
        );
      },
    );

    it(
      'rejeita antecedência maior que 168 horas',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              appointmentReminderHoursBefore:
                169,
            });

        expect(
          response.status,
        ).toBe(
          400,
        );
      },
    );

    it(
      'rejeita valor não booleano para ativação dos lembretes',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              appointmentRemindersEnabled:
                'true',
            });

        expect(
          response.status,
        ).toBe(
          400,
        );
      },
    );
  },
);