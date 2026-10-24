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
  'NotificationWorkerService - lembretes obsoletos (E2E)',
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
      'owner.stale.reminder.e2e@teste.com';

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
              'maria.stale.reminder.e2e@teste.com',

            subject:
              'Lembrete de agendamento',

            text:
              'Lembrete de agendamento',

            html:
              '<p>Lembrete de agendamento</p>',

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
                'Owner Stale Reminder E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Stale Reminder E2E',
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
         * Lembretes habilitados.
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
                'Carlos Stale Reminder E2E',

              email:
                'carlos.stale.reminder.e2e@teste.com',
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
                'Corte Stale Reminder E2E',

              durationMin:
                30,

              priceCents:
                5000,
            },
          });

        serviceId =
          service.id;

        /*
         * Cliente.
         */
        const client =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Maria Stale Reminder E2E',

              email:
                'maria.stale.reminder.e2e@teste.com',

              phone:
                '34999990300',
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

        sendMail.mockResolvedValue(
          true,
        );

        await prisma.notificationDelivery.deleteMany();

        await prisma.appointment.deleteMany({
          where: {
            tenantId,
          },
        });

        /*
         * Garante que cada teste começa
         * com os lembretes habilitados.
         */
        await prisma.tenant.update({
          where: {
            id:
              tenantId,
          },

          data: {
            appointmentRemindersEnabled:
              true,
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
      'cancela a entrega e não chama SMTP quando o agendamento foi cancelado',
      async () => {
        const startsAt =
          new Date(
            '2026-11-10T18:00:00.000Z',
          );

        const {
          appointment,
          delivery,
        } =
          await createReminderScenario(
            startsAt,
          );

        /*
         * O lembrete já estava na fila,
         * mas o agendamento foi cancelado
         * antes do worker executar.
         */
        await prisma.appointment.update({
          where: {
            id:
              appointment.id,
          },

          data: {
            status:
              'CANCELED',

            canceledAt:
              now,

            cancelReason:
              'Cliente cancelou antes do lembrete',
          },
        });

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
            0,

          failed:
            0,

          skipped:
            1,
        });

        /*
         * O SMTP jamais pode ser chamado.
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
          savedDelivery?.status,
        ).toBe(
          'CANCELED',
        );

        expect(
          savedDelivery?.sentAt,
        ).toBeNull();

        expect(
          savedDelivery?.failedAt,
        ).toBeNull();

        expect(
          savedDelivery?.processingStartedAt,
        ).toBeNull();

        expect(
          savedDelivery?.lastError,
        ).toContain(
          'status CANCELED',
        );

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          savedAppointment?.reminderSentAt,
        ).toBeNull();
      },
    );

    it(
      'cancela lembrete antigo e não chama SMTP quando o agendamento foi reagendado',
      async () => {
        const originalStartsAt =
          new Date(
            '2026-11-10T18:00:00.000Z',
          );

        const {
          appointment,
          delivery,
        } =
          await createReminderScenario(
            originalStartsAt,
          );

        /*
         * O agendamento muda de 15:00 local
         * para 16:00 local antes do worker.
         *
         * O dedupeKey da entrega continua
         * apontando para o horário antigo.
         */
        const newStartsAt =
          new Date(
            '2026-11-10T19:00:00.000Z',
          );

        const newEndsAt =
          new Date(
            '2026-11-10T19:30:00.000Z',
          );

        await prisma.appointment.update({
          where: {
            id:
              appointment.id,
          },

          data: {
            startsAt:
              newStartsAt,

            endsAt:
              newEndsAt,

            reminderSentAt:
              null,
          },
        });

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
            0,

          failed:
            0,

          skipped:
            1,
        });

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
          savedDelivery?.status,
        ).toBe(
          'CANCELED',
        );

        expect(
          savedDelivery?.sentAt,
        ).toBeNull();

        expect(
          savedDelivery?.failedAt,
        ).toBeNull();

        expect(
          savedDelivery?.lastError,
        ).toContain(
          'reagendado',
        );

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          savedAppointment?.startsAt.toISOString(),
        ).toBe(
          newStartsAt.toISOString(),
        );

        expect(
          savedAppointment?.reminderSentAt,
        ).toBeNull();
      },
    );

    it(
      'cancela lembrete quando a empresa desativa os lembretes antes do envio',
      async () => {
        const startsAt =
          new Date(
            '2026-11-10T18:00:00.000Z',
          );

        const {
          appointment,
          delivery,
        } =
          await createReminderScenario(
            startsAt,
          );

        /*
         * A empresa desativa lembretes
         * depois que esta entrega já
         * estava PENDING.
         */
        await prisma.tenant.update({
          where: {
            id:
              tenantId,
          },

          data: {
            appointmentRemindersEnabled:
              false,
          },
        });

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
            0,

          failed:
            0,

          skipped:
            1,
        });

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
          savedDelivery?.status,
        ).toBe(
          'CANCELED',
        );

        expect(
          savedDelivery?.lastError,
        ).toContain(
          'desativados',
        );

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          savedAppointment?.reminderSentAt,
        ).toBeNull();
      },
    );
  },
);