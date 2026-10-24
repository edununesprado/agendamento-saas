import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
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
  'NotificationWorkerService - lembretes (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let worker: NotificationWorkerService;

    let ownerToken: string;
    let tenantId: string;
    let employeeId: string;
    let serviceId: string;
    let clientId: string;

    const sendMail =
      vi.fn();

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.worker.reminder.e2e@teste.com';

    const now =
      new Date(
        '2026-11-10T12:00:00.000Z',
      );

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

    async function createReminderScenario(
      suffix: string,
      startsAt: Date,
    ) {
      const endsAt =
        new Date(
          startsAt.getTime() +
            30 *
              60 *
              1000,
        );

      const appointment =
        await prisma.appointment.create({
          data: {
            tenantId,
            employeeId,
            serviceId,
            clientId,

            startsAt,
            endsAt,

            durationMin:
              30,

            priceCents:
              5000,

            status:
              'CONFIRMED',

            reminderSentAt:
              null,
          },
        });

      const delivery =
        await prisma.notificationDelivery.create({
          data: {
            tenantId,

            appointmentId:
              appointment.id,

            channel:
              'EMAIL',

            type:
              'APPOINTMENT_REMINDER',

            status:
              'PENDING',

            recipient:
              'maria.worker.reminder.e2e@teste.com',

            subject:
              `Lembrete ${suffix}`,

            text:
              `Lembrete ${suffix}`,

            html:
              `<p>Lembrete ${suffix}</p>`,

            dedupeKey:
              `appointment:${appointment.id}:reminder:${startsAt.toISOString()}`,

            attempts:
              0,

            maxAttempts:
              5,

            nextAttemptAt:
              now,
          },
        });

      return {
        appointment,
        delivery,
      };
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

        /*
         * Limpa somente o banco de testes.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * Empresa + OWNER.
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
                'Owner Worker Reminder E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Worker Reminder E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(
          201,
        );

        ownerToken =
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

        /*
         * Lembretes precisam continuar
         * habilitados no momento do envio.
         */
        await prisma.tenant.update({
          where: {
            id:
              tenantId,
          },

          data: {
            appointmentRemindersEnabled:
              true,

            appointmentReminderHoursBefore:
              24,
          },
        });

        /*
         * Funcionário.
         */
        const employee =
          await prisma.employee.create({
            data: {
              tenantId,

              name:
                'Carlos Worker Reminder E2E',

              email:
                'carlos.worker.reminder.e2e@teste.com',
            },
          });

        employeeId =
          employee.id;

        /*
         * Serviço.
         */
        const service =
          await prisma.service.create({
            data: {
              tenantId,

              name:
                'Corte Worker Reminder E2E',

              durationMin:
                30,

              priceCents:
                5000,
            },
          });

        serviceId =
          service.id;

        /*
         * Cliente com e-mail.
         */
        const client =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Maria Worker Reminder E2E',

              email:
                'maria.worker.reminder.e2e@teste.com',

              phone:
                '34999990200',
            },
          });

        clientId =
          client.id;
      },
      30000,
    );

    beforeEach(
      async () => {
        vi.clearAllMocks();

        /*
         * Cada teste começa sem entregas
         * ou agendamentos anteriores.
         */
        await prisma.notificationDelivery.deleteMany();

        await prisma.appointment.deleteMany({
          where: {
            tenantId,
          },
        });
      },
    );

    afterAll(
      async () => {
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
      'marca NotificationDelivery como SENT e preenche reminderSentAt somente após SMTP com sucesso',
      async () => {
        sendMail.mockResolvedValue(
          true,
        );

        const startsAt =
          new Date(
            '2026-11-10T18:00:00.000Z',
          );

        const {
          appointment,
          delivery,
        } =
          await createReminderScenario(
            'sucesso',
            startsAt,
          );

        const result =
          await worker.processDueNotifications(
            now,
          );

        expect(
          result,
        ).toEqual({
          sent:
            1,

          retry:
            0,

          failed:
            0,

          skipped:
            0,
        });

        expect(
          sendMail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            to:
              'maria.worker.reminder.e2e@teste.com',

            subject:
              'Lembrete sucesso',
          }),
        );

        const savedDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id:
                delivery.id,
            },
          });

        expect(
          savedDelivery?.status,
        ).toBe(
          'SENT',
        );

        expect(
          savedDelivery?.attempts,
        ).toBe(
          1,
        );

        expect(
          savedDelivery?.sentAt?.toISOString(),
        ).toBe(
          now.toISOString(),
        );

        expect(
          savedDelivery?.failedAt,
        ).toBeNull();

        expect(
          savedDelivery?.processingStartedAt,
        ).toBeNull();

        expect(
          savedDelivery?.lastError,
        ).toBeNull();

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        /*
         * Este é o comportamento principal:
         * só depois do SMTP confirmar sucesso
         * o reminderSentAt é preenchido.
         */
        expect(
          savedAppointment?.reminderSentAt?.toISOString(),
        ).toBe(
          now.toISOString(),
        );
      },
    );

    it(
      'mantém reminderSentAt null quando SMTP falha e agenda retry',
      async () => {
        sendMail.mockResolvedValue(
          false,
        );

        const startsAt =
          new Date(
            '2026-11-10T19:00:00.000Z',
          );

        const {
          appointment,
          delivery,
        } =
          await createReminderScenario(
            'falha',
            startsAt,
          );

        const result =
          await worker.processDueNotifications(
            now,
          );

        expect(
          result,
        ).toEqual({
          sent:
            0,

          retry:
            1,

          failed:
            0,

          skipped:
            0,
        });

        expect(
          sendMail,
        ).toHaveBeenCalledTimes(
          1,
        );

        const savedDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id:
                delivery.id,
            },
          });

        expect(
          savedDelivery?.status,
        ).toBe(
          'FAILED',
        );

        expect(
          savedDelivery?.attempts,
        ).toBe(
          1,
        );

        /*
         * Ainda é uma falha recuperável.
         */
        expect(
          savedDelivery?.failedAt,
        ).toBeNull();

        expect(
          savedDelivery?.sentAt,
        ).toBeNull();

        expect(
          savedDelivery?.processingStartedAt,
        ).toBeNull();

        expect(
          savedDelivery?.lastError,
        ).toContain(
          'não confirmou o envio',
        );

        /*
         * Primeira falha:
         * retry depois de 1 minuto.
         */
        expect(
          savedDelivery?.nextAttemptAt.toISOString(),
        ).toBe(
          new Date(
            now.getTime() +
              60 *
                1000,
          ).toISOString(),
        );

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        /*
         * SMTP falhou:
         * portanto não podemos afirmar
         * que o cliente recebeu o lembrete.
         */
        expect(
          savedAppointment?.reminderSentAt,
        ).toBeNull();
      },
    );
  },
);