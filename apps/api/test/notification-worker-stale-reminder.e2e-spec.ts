
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
         * Segurança: este arquivo executa
         * exclusões no banco de testes.
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

        /*
         * Lembretes habilitados.
         */
        await prisma.tenant.update({
          where: {
            id: tenantId,
          },
          data: {
            appointmentRemindersEnabled: true,
            appointmentReminderHoursBefore: 24,
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

        employeeId = employee.id;

        /*
         * Serviço.
         */
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

        /*
         * Cliente.
         */
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

      /*
       * Garante que cada teste começa
       * com os lembretes habilitados.
       */
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

        /*
         * O lembrete já estava na fila,
         * mas o agendamento foi cancelado
         * antes do worker executar.
         */
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

        /*
         * O SMTP jamais pode ser chamado.
         */
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

        /*
         * O agendamento muda de 15:00 local
         * para 16:00 local antes do worker.
         *
         * O dedupeKey da entrega continua
         * apontando para o horário antigo.
         */
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

        /*
         * A empresa desativa lembretes
         * depois que esta entrega já
         * estava PENDING.
         */
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

    it(
      'não permite que uma tentativa antiga marque como SENT um lembrete assumido por outra tentativa',
      async () => {
        /*
         * TESTE DE CONCORRÊNCIA
         *
         * A primeira tentativa inicia SMTP,
         * mas permanece aguardando resposta.
         *
         * Depois de 11 minutos simulados,
         * a segunda tentativa recupera
         * a entrega e inicia outro SMTP.
         *
         * Quando a primeira termina, ela
         * não pode marcar a entrega como SENT
         * nem preencher reminderSentAt.
         */

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
         * Promessas controladas pelo teste.
         * Nenhum e-mail real é enviado.
         */
        let resolveFirstEmail:
          (sent: boolean) => void = () => {};

        let resolveSecondEmail:
          (sent: boolean) => void = () => {};

        let signalFirstStarted:
          () => void = () => {};

        let signalSecondStarted:
          () => void = () => {};

        const firstEmail = new Promise<boolean>(
          (resolve) => {
            resolveFirstEmail = resolve;
          },
        );

        const secondEmail = new Promise<boolean>(
          (resolve) => {
            resolveSecondEmail = resolve;
          },
        );

        const firstStarted = new Promise<void>(
          (resolve) => {
            signalFirstStarted = resolve;
          },
        );

        const secondStarted = new Promise<void>(
          (resolve) => {
            signalSecondStarted = resolve;
          },
        );

        sendMail.mockReset();

        sendMail
          .mockImplementationOnce(() => {
            signalFirstStarted();
            return firstEmail;
          })
          .mockImplementationOnce(() => {
            signalSecondStarted();
            return secondEmail;
          });

        /*
         * Primeira execução:
         * faz o claim e inicia SMTP,
         * mas fica aguardando firstEmail.
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

        /*
         * Segunda execução:
         * simula 11 minutos depois.
         *
         * O primeiro PROCESSING é considerado
         * abandonado e ocorre novo claim.
         */
        const secondRun =
          worker.processDueNotifications(
            recoveryNow,
          );

        await secondStarted;

        const claimedSecond =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(claimedSecond?.status).toBe(
          'PROCESSING',
        );

        expect(claimedSecond?.attempts).toBe(2);

        expect(
          claimedSecond?.processingStartedAt?.toISOString(),
        ).toBe(recoveryNow.toISOString());

        /*
         * Agora a tentativa antiga recebe
         * uma resposta de sucesso do SMTP,
         * enquanto a tentativa nova
         * continua em processamento.
         */
        resolveFirstEmail(true);

        await firstRun;

        /*
         * Capturamos o estado ANTES
         * de concluir o segundo SMTP.
         */
        const stateAfterOldAttempt =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        const appointmentAfterOldAttempt =
          await prisma.appointment.findUnique({
            where: {
              id: appointment.id,
            },
          });

        /*
         * Encerramos a segunda execução
         * para não deixar promessas pendentes
         * após o teste.
         */
        resolveSecondEmail(true);

        await secondRun;

        expect(sendMail).toHaveBeenCalledTimes(2);

        /*
         * A primeira tentativa NÃO possui
         * mais a responsabilidade pela entrega.
         *
         * Estes asserts devem falhar no worker
         * antigo e passar depois da correção.
         */
        expect(stateAfterOldAttempt?.status).toBe(
          'PROCESSING',
        );

        expect(stateAfterOldAttempt?.attempts).toBe(2);

        expect(
          stateAfterOldAttempt?.processingStartedAt
            ?.toISOString(),
        ).toBe(recoveryNow.toISOString());

        expect(
          stateAfterOldAttempt?.sentAt,
        ).toBeNull();

        expect(
          appointmentAfterOldAttempt?.reminderSentAt,
        ).toBeNull();

        /*
         * Após a segunda tentativa terminar
         * com sucesso, o estado final pode
         * ser SENT.
         */
        const finalDelivery =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(finalDelivery?.status).toBe('SENT');

        expect(finalDelivery?.attempts).toBe(2);
      },
      30000,
    );

    it(
      'não permite que uma falha antiga sobrescreva o processamento de uma tentativa mais recente',
      async () => {
        /*
         * ETAPA 2.3 - REGRESSÃO DE FALHA ANTIGA
         *
         * A primeira tentativa inicia SMTP
         * e permanece aguardando resposta.
         *
         * Após 11 minutos simulados,
         * a segunda tentativa assume
         * a mesma notificação.
         *
         * A primeira tentativa então falha.
         *
         * Essa falha não pode modificar
         * o processamento da segunda
         * tentativa nem agendar um retry.
         */

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
         * Controlamos separadamente
         * as duas respostas do SMTP.
         */
        let resolveFirstEmail:
          (sent: boolean) => void = () => {};

        let resolveSecondEmail:
          (sent: boolean) => void = () => {};

        let signalFirstStarted:
          () => void = () => {};

        let signalSecondStarted:
          () => void = () => {};

        const firstEmail = new Promise<boolean>(
          (resolve) => {
            resolveFirstEmail = resolve;
          },
        );

        const secondEmail = new Promise<boolean>(
          (resolve) => {
            resolveSecondEmail = resolve;
          },
        );

        const firstStarted = new Promise<void>(
          (resolve) => {
            signalFirstStarted = resolve;
          },
        );

        const secondStarted = new Promise<void>(
          (resolve) => {
            signalSecondStarted = resolve;
          },
        );

        sendMail.mockReset();

        sendMail
          .mockImplementationOnce(() => {
            signalFirstStarted();
            return firstEmail;
          })
          .mockImplementationOnce(() => {
            signalSecondStarted();
            return secondEmail;
          });

        /*
         * Primeira execução:
         * a notificação entra em PROCESSING
         * e aguarda a resposta do SMTP.
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

        /*
         * Segunda execução:
         * 11 minutos depois, o worker
         * recupera a entrega e inicia
         * a segunda tentativa.
         */
        const secondRun =
          worker.processDueNotifications(
            recoveryNow,
          );

        await secondStarted;

        const claimedSecond =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        expect(claimedSecond?.status).toBe(
          'PROCESSING',
        );

        expect(claimedSecond?.attempts).toBe(2);

        expect(
          claimedSecond?.processingStartedAt
            ?.toISOString(),
        ).toBe(recoveryNow.toISOString());

        /*
         * A recuperação anterior definiu
         * nextAttemptAt como recoveryNow.
         *
         * O segundo claim não muda
         * esse valor.
         */
        expect(
          claimedSecond?.nextAttemptAt.toISOString(),
        ).toBe(recoveryNow.toISOString());

        /*
         * Agora a tentativa ANTIGA falha.
         *
         * Ela não deve conseguir alterar
         * a tentativa mais recente.
         */
        resolveFirstEmail(false);

        const firstResult = await firstRun;

        /*
         * O worker deve reconhecer
         * que a tentativa antiga perdeu
         * a responsabilidade pela entrega.
         */
        expect(firstResult).toEqual({
          sent: 0,
          retry: 0,
          failed: 0,
          skipped: 1,
        });

        /*
         * Capturamos o estado enquanto
         * o segundo SMTP continua pendente.
         */
        const stateAfterOldFailure =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: delivery.id,
            },
          });

        const appointmentAfterOldFailure =
          await prisma.appointment.findUnique({
            where: {
              id: appointment.id,
            },
          });

        /*
         * Finalizamos o SMTP da segunda
         * tentativa antes das verificações
         * para não deixar uma execução
         * pendente ao término do teste.
         */
        resolveSecondEmail(true);

        const secondResult = await secondRun;

        expect(sendMail).toHaveBeenCalledTimes(2);

        /*
         * A falha antiga não pode mudar
         * o status para FAILED.
         */
        expect(
          stateAfterOldFailure?.status,
        ).toBe('PROCESSING');

        /*
         * A tentativa atual continua
         * sendo a segunda.
         */
        expect(
          stateAfterOldFailure?.attempts,
        ).toBe(2);

        expect(
          stateAfterOldFailure?.processingStartedAt
            ?.toISOString(),
        ).toBe(recoveryNow.toISOString());

        /*
         * A falha antiga não pode definir
         * um novo horário de retry.
         */
        expect(
          stateAfterOldFailure?.nextAttemptAt
            .toISOString(),
        ).toBe(recoveryNow.toISOString());

        /*
         * A falha antiga também não pode
         * registrar erro ou falha definitiva
         * sobre a tentativa atual.
         */
        expect(
          stateAfterOldFailure?.lastError,
        ).toBeNull();

        expect(
          stateAfterOldFailure?.failedAt,
        ).toBeNull();

        expect(
          stateAfterOldFailure?.sentAt,
        ).toBeNull();

        expect(
          appointmentAfterOldFailure?.reminderSentAt,
        ).toBeNull();

        /*
         * A segunda tentativa deve
         * conseguir finalizar normalmente.
         */
        expect(secondResult).toEqual({
          sent: 1,
          retry: 0,
          failed: 0,
          skipped: 0,
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
          'SENT',
        );

        expect(finalDelivery?.attempts).toBe(2);

        expect(
          finalDelivery?.failedAt,
        ).toBeNull();

        expect(
          finalDelivery?.lastError,
        ).toBeNull();

        expect(
          finalDelivery?.sentAt?.toISOString(),
        ).toBe(recoveryNow.toISOString());

        expect(
          finalAppointment?.reminderSentAt
            ?.toISOString(),
        ).toBe(recoveryNow.toISOString());
      },
      30000,
    );
  },
);
