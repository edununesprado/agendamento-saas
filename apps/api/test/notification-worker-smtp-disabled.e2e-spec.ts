import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/notifications/email.service.js';
import { NotificationWorkerService } from '../src/notifications/notification-worker.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

describe(
  'NotificationWorkerService - SMTP desativado (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let worker: NotificationWorkerService;
    let configService: ConfigService;

    let tenantId: string;

    const sendMail =
      vi.fn();

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.smtp.disabled.e2e@teste.com';

    async function login() {
      const response =
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
        [200, 201],
      ).toContain(
        response.status,
      );

      expect(
        response.body.accessToken,
      ).toBeTruthy();

      return (
        response.body as LoginResponse
      ).accessToken;
    }

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
          })
            .overrideProvider(
              EmailService,
            )
            .useValue({
              sendMail,
            })
            .compile();

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

        worker =
          app.get(
            NotificationWorkerService,
          );

        configService =
          app.get(
            ConfigService,
          );

        /*
         * Limpa somente o banco E2E.
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
                'Owner SMTP Disabled E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa SMTP Disabled E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(
          201,
        );

        const ownerToken =
          await login();

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
        vi.restoreAllMocks();

        if (prisma) {
          await prisma.notificationDelivery.deleteMany();
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
      'mantém entrega PENDING e attempts 0 quando SMTP_ENABLED=false',
      async () => {
        vi.clearAllMocks();

        /*
         * Criamos uma entrega vencida,
         * pronta para processamento.
         *
         * Se o worker não respeitar
         * SMTP_ENABLED=false, ela será
         * processada imediatamente.
         */
        const nextAttemptAt =
          new Date(
            Date.now() -
              60 *
                1000,
          );

        const delivery =
          await prisma.notificationDelivery.create({
            data: {
              tenantId,

              appointmentId:
                null,

              channel:
                'EMAIL',

              type:
                'APPOINTMENT_CONFIRMED',

              status:
                'PENDING',

              recipient:
                'cliente.smtp.disabled@teste.com',

              subject:
                'Teste SMTP desativado',

              text:
                'Esta mensagem não deve ser enviada.',

              html:
                '<p>Esta mensagem não deve ser enviada.</p>',

              dedupeKey:
                `smtp-disabled-e2e-${Date.now()}`,

              attempts:
                0,

              maxAttempts:
                5,

              nextAttemptAt,
            },
          });

        /*
         * Mantemos toda a configuração real
         * do aplicativo e sobrescrevemos apenas
         * as duas flags necessárias ao teste.
         */
        const originalGet =
          configService.get.bind(
            configService,
          );

        const getSpy =
          vi.spyOn(
            configService,
            'get',
          );

        getSpy.mockImplementation(
          ((key: string) => {
            if (
              key ===
              'NOTIFICATION_QUEUE_ENABLED'
            ) {
              return 'true';
            }

            if (
              key ===
              'SMTP_ENABLED'
            ) {
              return 'false';
            }

            return originalGet(
              key,
            );
          }) as typeof configService.get,
        );

        /*
         * Chamamos o mesmo método usado
         * pelo cron a cada minuto.
         */
        await worker.handleNotificationQueue();

        /*
         * SMTP não pode ser chamado.
         */
        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        const savedDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id:
                delivery.id,
            },
          });

        expect(
          savedDelivery,
        ).toBeTruthy();

        /*
         * Nada na entrega deve ter sido
         * consumido ou modificado.
         */
        expect(
          savedDelivery?.status,
        ).toBe(
          'PENDING',
        );

        expect(
          savedDelivery?.attempts,
        ).toBe(
          0,
        );

        expect(
          savedDelivery?.lastAttemptAt,
        ).toBeNull();

        expect(
          savedDelivery?.processingStartedAt,
        ).toBeNull();

        expect(
          savedDelivery?.sentAt,
        ).toBeNull();

        expect(
          savedDelivery?.failedAt,
        ).toBeNull();

        expect(
          savedDelivery?.lastError,
        ).toBeNull();

        /*
         * Nem mesmo a data do próximo
         * processamento deve mudar.
         */
        expect(
          savedDelivery?.nextAttemptAt.toISOString(),
        ).toBe(
          nextAttemptAt.toISOString(),
        );

        getSpy.mockRestore();
      },
    );
  },
);