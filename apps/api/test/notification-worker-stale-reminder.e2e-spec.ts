
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

    const sendMail = vi.fn();

    const password = 'Teste@12345';

    const ownerEmail =
      'owner.stale.reminder.e2e@teste.com';

    const now = new Date(
      '2026-11-10T12:00:00.000Z',
    );

    async function login() {
      const response = await request(
        app.getHttpServer(),
      )
        .post('/auth/login')
        .send({
          email: ownerEmail,
          password,
        });

      expect([200, 201]).toContain(
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
      const endsAt = new Date(
        startsAt.getTime() +
          30 * 60 * 1000,
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
            durationMin: 30,
            priceCents: 5000,
            status: 'CONFIRMED',
            reminderSentAt: null,
          },
        });

      const delivery =
        await prisma.notificationDelivery.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            channel: 'EMAIL',
            type: 'APPOINTMENT_REMINDER',
            status: 'PENDING',
            recipient:
              'maria.stale.reminder.e2e@teste.com',
            subject: 'Lembrete de agendamento',
            text: 'Lembrete de agendamento',
            html: '<p>Lembrete de agendamento</p>',
            dedupeKey:
              `appointment:${appointment.id}:reminder:${startsAt.toISOString()}`,
            attempts: 0,
            maxAttempts: 5,
            nextAttemptAt: now,
          },
        });

      return {
        appointment,
        delivery,
      };
    }

    beforeAll(
      async () => {
        /*
         * Segurança:
         * estes testes excluem registros.
         * Nunca executar fora do banco
         * agendamento_test.
         */
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
            imports: [AppModule],
          })
            .overrideProvider(EmailService)
            .useValue({
              sendMail,
            })
            .compile();

        app = moduleRef.createNestApplication();

        app.useGlobalPipes(
          new ValidationPipe({
            whitelist: true,
            transform: true,
          }),
        );

        await app.init();

        prisma = app.get(PrismaService);
        worker = app.get(
          NotificationWorkerService,
        );

        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        const registerResponse =
          await request(
            app.getHttpServer(),
          )
            .post('/auth/register')
            .send({
              name: 'Owner Stale Reminder E2E',
              email: ownerEmail,
              password,
              companyName:
                'Empresa Stale Reminder E2E',
            });

        expect(registerResponse.status).toBe(
          201,
        );

        ownerToken = await login();

        const tenantResponse =
          await request(
            app.getHttpServer(),
          )
            .get('/tenants/current')
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

        expect(tenantResponse.status).toBe(
          200,
        );

        tenantId = tenantResponse.body.id;

        expect(tenantId).toBeTruthy();

        await prisma.tenant.update({
          where: {
            id: tenantId,
          },
          data: {
            appointmentRemindersEnabled: true,
            appointmentReminderHoursBefore: 24,
          },
        });

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

        employeeId = employee.id;

        const service =
          await prisma.service.create({
            data: {
              tenantId,
              name: 'Corte Stale Reminder E2E',
              durationMin: 30,
              priceCents: 5000,
            },
          });

        serviceId = service.id;

        const client =
          await prisma.client.create({
            data: {
              tenantId,
              name: 'Maria Stale Reminder E2E',
              email:
                'maria.stale.reminder.e2e@teste.com',
              phone: '34999990300',
            },
          });

        clientId = client.id;
      },
      30000,
    );

    beforeEach(async () => {
      vi.clearAllMocks();

      sendMail.mockResolvedValue(true);

      await prisma.notificationDelivery.deleteMany();

      await prisma.appointment.deleteMany({
        where: {
          tenantId,
        },
      });

      await prisma.tenant.update({
        where: {
          id: tenantId,
        },
        data: {
          appointmentRemindersEnabled: true,
        },
      });
    });

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
        const startsAt = new Date(
          '2026-11-10T18:00:00.000Z',
        );

        const {
          appointment,
          delivery,
        } = await createReminderScenario(startsAt);

        await prisma.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: 'CANCELED',
            canceledAt: now,
            cancelReason:
              'Cliente cancelou antes do lembrete',
          },
        });

        const result =
          await worker.processDueNotifications(now);

        expect(result).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 1,
        });

        expect(sendMail).not.toHaveBeenCalled();

        const savedDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(savedDelivery?.status).toBe(
          'CANCELED',
        );

        expect(savedDelivery?.sentAt).toBeNull();
        expect(savedDelivery?.failedAt).toBeNull();

        expect(
          savedDelivery?.processingStartedAt,
        ).toBeNull();

        expect(savedDelivery?.lastError).toContain(
          'status CANCELED',
        );

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id: appointment.id,
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
        const originalStartsAt = new Date(
          '2026-11-10T18:00:00.000Z',
        );

        const {
          appointment,
          delivery,
        } = await createReminderScenario(
          originalStartsAt,
        );

        const newStartsAt = new Date(
          '2026-11-10T19:00:00.000Z',
        );

        const newEndsAt = new Date(
          '2026-11-10T19:30:00.000Z',
        );

        await prisma.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            startsAt: newStartsAt,
            endsAt: newEndsAt,
            reminderSentAt: null,
          },
        });

        const result =
          await worker.processDueNotifications(now);

        expect(result).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 1,
        });

        expect(sendMail).not.toHaveBeenCalled();

        const savedDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(savedDelivery?.status).toBe(
          'CANCELED',
        );

        expect(savedDelivery?.sentAt).toBeNull();
        expect(savedDelivery?.failedAt).toBeNull();

        expect(savedDelivery?.lastError).toContain(
          'reagendado',
        );

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id: appointment.id,
            },
          });

        expect(
          savedAppointment?.startsAt.toISOString(),
        ).toBe(newStartsAt.toISOString());

        expect(
          savedAppointment?.reminderSentAt,
        ).toBeNull();
      },
    );

    it(
      'cancela lembrete quando a empresa desativa os lembretes antes do envio',
      async () => {
        const startsAt = new Date(
          '2026-11-10T18:00:00.000Z',
        );

        const {
          appointment,
          delivery,
        } = await createReminderScenario(startsAt);

        await prisma.tenant.update({
          where: {
            id: tenantId,
          },
          data: {
            appointmentRemindersEnabled: false,
          },
        });

        const result =
          await worker.processDueNotifications(now);

        expect(result).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 1,
        });

        expect(sendMail).not.toHaveBeenCalled();

        const savedDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(savedDelivery?.status).toBe(
          'CANCELED',
        );

        expect(savedDelivery?.lastError).toContain(
          'desativados',
        );

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id: appointment.id,
            },
          });

        expect(
          savedAppointment?.reminderSentAt,
        ).toBeNull();
      },
    );

    /*
     * ETAPA 2.9 - SUCESSO SMTP TARDIO
     *
     * Depois da recuperação para UNCERTAIN,
     * uma resposta de sucesso da tentativa
     * anterior não pode mudar o estado
     * da entrega nem reminderSentAt.
     */
    it(
      'não permite que sucesso SMTP tardio sobrescreva lembrete UNCERTAIN',
      async () => {
        const startsAt = new Date(
          '2026-11-10T18:00:00.000Z',
        );

        const {
          appointment,
          delivery,
        } = await createReminderScenario(startsAt);

        const recoveryNow = new Date(
          now.getTime() + 11 * 60 * 1000,
        );

        let resolveFirstEmail:
          (sent: boolean) => void = () => {};

        let signalFirstStarted:
          () => void = () => {};

        const firstEmail = new Promise<boolean>(
          (resolve) => {
            resolveFirstEmail = resolve;
          },
        );

        const firstStarted = new Promise<void>(
          (resolve) => {
            signalFirstStarted = resolve;
          },
        );

        sendMail.mockReset();

        sendMail.mockImplementationOnce(() => {
          signalFirstStarted();
          return firstEmail;
        });

        /*
         * Primeira execução:
         * o SMTP inicia e fica pendente.
         */
        const firstRun =
          worker.processDueNotifications(now);

        await firstStarted;

        const claimedFirst =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(claimedFirst?.status).toBe(
          'PROCESSING',
        );

        expect(claimedFirst?.attempts).toBe(1);

        expect(
          claimedFirst?.processingStartedAt?.toISOString(),
        ).toBe(now.toISOString());

        expect(sendMail).toHaveBeenCalledTimes(1);

        /*
         * Onze minutos depois:
         * a recuperação registra UNCERTAIN,
         * sem iniciar um segundo SMTP.
         */
        const recoveryResult =
          await worker.processDueNotifications(
            recoveryNow,
          );

        expect(recoveryResult).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 0,
        });

        expect(sendMail).toHaveBeenCalledTimes(1);

        const recoveredDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(recoveredDelivery?.status).toBe(
          'UNCERTAIN',
        );

        expect(recoveredDelivery?.attempts).toBe(1);

        expect(
          recoveredDelivery?.lastAttemptAt?.toISOString(),
        ).toBe(now.toISOString());

        expect(
          recoveredDelivery?.processingStartedAt,
        ).toBeNull();

        expect(recoveredDelivery?.sentAt).toBeNull();
        expect(recoveredDelivery?.failedAt).toBeNull();

        expect(recoveredDelivery?.lastError).toContain(
          'resultado SMTP incerto',
        );

        /*
         * O SMTP responde com sucesso
         * depois da recuperação.
         *
         * O claim antigo não pode
         * sobrescrever UNCERTAIN.
         */
        resolveFirstEmail(true);

        const firstResult = await firstRun;

        expect(firstResult).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 1,
        });

        const finalDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        const finalAppointment =
          await prisma.appointment.findUnique({
            where: {
              id: appointment.id,
            },
          });

        expect(finalDelivery?.status).toBe(
          'UNCERTAIN',
        );

        expect(finalDelivery?.attempts).toBe(1);

        expect(
          finalDelivery?.processingStartedAt,
        ).toBeNull();

        expect(finalDelivery?.sentAt).toBeNull();
        expect(finalDelivery?.failedAt).toBeNull();

        expect(finalDelivery?.lastError).toContain(
          'resultado SMTP incerto',
        );

        expect(
          finalAppointment?.reminderSentAt,
        ).toBeNull();

        expect(sendMail).toHaveBeenCalledTimes(1);
      },
      30000,
    );

    /*
     * ETAPA 2.10 - FALHA SMTP TARDIA
     *
     * Cenário:
     *
     * 1. O worker inicia uma tentativa.
     * 2. O SMTP permanece sem resposta.
     * 3. Onze minutos depois, a entrega
     *    passa para UNCERTAIN.
     * 4. A tentativa original retorna
     *    uma falha tardia.
     *
     * A falha antiga não pode sobrescrever
     * UNCERTAIN, registrar FAILED
     * ou agendar retry.
     */
    it(
      'não permite que falha SMTP tardia sobrescreva lembrete UNCERTAIN',
      async () => {
        const startsAt = new Date(
          '2026-11-10T18:00:00.000Z',
        );

        const {
          appointment,
          delivery,
        } = await createReminderScenario(startsAt);

        const recoveryNow = new Date(
          now.getTime() + 11 * 60 * 1000,
        );

        /*
         * O primeiro SMTP fica pendente.
         *
         * A promessa será resolvida
         * manualmente pelo teste.
         */
        let resolveFirstEmail:
          (sent: boolean) => void = () => {};

        let signalFirstStarted:
          () => void = () => {};

        const firstEmail = new Promise<boolean>(
          (resolve) => {
            resolveFirstEmail = resolve;
          },
        );

        const firstStarted = new Promise<void>(
          (resolve) => {
            signalFirstStarted = resolve;
          },
        );

        sendMail.mockReset();

        sendMail.mockImplementationOnce(() => {
          signalFirstStarted();
          return firstEmail;
        });

        /*
         * Primeira execução:
         * a notificação passa para
         * PROCESSING e o SMTP inicia.
         */
        const firstRun =
          worker.processDueNotifications(now);

        await firstStarted;

        const claimedFirst =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(claimedFirst?.status).toBe(
          'PROCESSING',
        );

        expect(claimedFirst?.attempts).toBe(1);

        expect(
          claimedFirst?.processingStartedAt
            ?.toISOString(),
        ).toBe(now.toISOString());

        expect(sendMail).toHaveBeenCalledTimes(1);

        /*
         * Onze minutos depois:
         *
         * A notificação é considerada
         * abandonada e passa para
         * UNCERTAIN.
         *
         * Nenhum segundo SMTP deve ocorrer.
         */
        const recoveryResult =
          await worker.processDueNotifications(
            recoveryNow,
          );

        expect(recoveryResult).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 0,
        });

        expect(sendMail).toHaveBeenCalledTimes(1);

        const recoveredDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(recoveredDelivery?.status).toBe(
          'UNCERTAIN',
        );

        expect(recoveredDelivery?.attempts).toBe(1);

        expect(
          recoveredDelivery?.lastAttemptAt
            ?.toISOString(),
        ).toBe(now.toISOString());

        expect(
          recoveredDelivery?.processingStartedAt,
        ).toBeNull();

        expect(recoveredDelivery?.sentAt).toBeNull();
        expect(recoveredDelivery?.failedAt).toBeNull();

        expect(recoveredDelivery?.lastError).toContain(
          'resultado SMTP incerto',
        );

        const originalNextAttemptAt =
          recoveredDelivery?.nextAttemptAt.toISOString();

        const originalLastError =
          recoveredDelivery?.lastError;

        /*
         * Agora o SMTP da tentativa
         * original informa uma falha.
         *
         * Essa resposta chega depois
         * de a entrega ser marcada
         * como UNCERTAIN.
         */
        resolveFirstEmail(false);

        const firstResult = await firstRun;

        /*
         * A tentativa antiga perdeu seu claim
         * e não pode produzir um retry.
         */
        expect(firstResult).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 1,
        });

        /*
         * Conferimos que a falha tardia
         * não alterou o banco.
         */
        const finalDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        const finalAppointment =
          await prisma.appointment.findUnique({
            where: {
              id: appointment.id,
            },
          });

        expect(finalDelivery?.status).toBe(
          'UNCERTAIN',
        );

        expect(finalDelivery?.attempts).toBe(1);

        expect(
          finalDelivery?.lastAttemptAt?.toISOString(),
        ).toBe(now.toISOString());

        expect(
          finalDelivery?.processingStartedAt,
        ).toBeNull();

        expect(finalDelivery?.sentAt).toBeNull();
        expect(finalDelivery?.failedAt).toBeNull();

        /*
         * Nenhum retry deve ser agendado
         * pela resposta antiga.
         */
        expect(
          finalDelivery?.nextAttemptAt.toISOString(),
        ).toBe(originalNextAttemptAt);

        /*
         * O motivo original da incerteza
         * deve continuar registrado.
         */
        expect(finalDelivery?.lastError).toBe(
          originalLastError,
        );

        expect(
          finalAppointment?.reminderSentAt,
        ).toBeNull();

        expect(sendMail).toHaveBeenCalledTimes(1);

        /*
         * Mesmo no dia seguinte,
         * a entrega UNCERTAIN permanece
         * fora da fila de reenvio.
         */
        const resultNextDay =
          await worker.processDueNotifications(
            new Date(
              '2026-11-11T12:00:00.000Z',
            ),
          );

        expect(resultNextDay).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 0,
        });

        expect(sendMail).toHaveBeenCalledTimes(1);

        const savedNextDay =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(savedNextDay?.status).toBe(
          'UNCERTAIN',
        );

        expect(savedNextDay?.attempts).toBe(1);
      },
      30000,
    );
  },
);
