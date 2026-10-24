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
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AppointmentRemindersService } from '../src/notifications/appointment-reminders.service.js';
import { EmailService } from '../src/notifications/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

describe(
  'Fila de lembretes de agendamento (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let remindersService: AppointmentRemindersService;

    let ownerToken: string;
    let tenantId: string;
    let employeeId: string;
    let serviceId: string;
    let clientId: string;
    let appointmentId: string;

    const sendMail =
      vi.fn();

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.reminder.queue.e2e@teste.com';

    /*
     * Momento artificial usado pelo teste.
     *
     * O agendamento será 6 horas depois,
     * portanto estará dentro da janela
     * configurada de 24 horas.
     */
    const now =
      new Date(
        '2026-11-10T12:00:00.000Z',
      );

    const startsAt =
      new Date(
        '2026-11-10T18:00:00.000Z',
      );

    const endsAt =
      new Date(
        '2026-11-10T18:30:00.000Z',
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

        remindersService =
          app.get(
            AppointmentRemindersService,
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
                'Owner Reminder Queue E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Reminder Queue E2E',
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
         * Ativa os lembretes da empresa
         * com antecedência de 24 horas.
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
                'Carlos Reminder Queue E2E',

              email:
                'carlos.reminder.queue.e2e@teste.com',
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
                'Corte Reminder Queue E2E',

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
                'Maria Reminder Queue E2E',

              email:
                'maria.reminder.queue.e2e@teste.com',

              phone:
                '34999990100',
            },
          });

        clientId =
          client.id;

        /*
         * Agendamento CONFIRMED
         * dentro das próximas 24 horas.
         */
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

        appointmentId =
          appointment.id;

        await prisma.notificationDelivery.deleteMany({
          where: {
            appointmentId,
          },
        });

        vi.clearAllMocks();
      },
      30000,
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
      'enfileira lembrete PENDING sem chamar SMTP e sem marcar reminderSentAt',
      async () => {
        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result,
        ).toEqual({
          queued:
            1,

          failed:
            0,

          skipped:
            0,
        });

        /*
         * O scheduler não deve enviar
         * e-mail diretamente.
         */
        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        const appointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointmentId,
            },
          });

        expect(
          appointment,
        ).toBeTruthy();

        /*
         * Este campo só poderá ser
         * preenchido pelo worker depois
         * que o SMTP confirmar o envio.
         */
        expect(
          appointment?.reminderSentAt,
        ).toBeNull();

        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              appointmentId,

              type:
                'APPOINTMENT_REMINDER',
            },
          });

        expect(
          deliveries,
        ).toHaveLength(
          1,
        );

        const delivery =
          deliveries[0];

        expect(
          delivery.tenantId,
        ).toBe(
          tenantId,
        );

        expect(
          delivery.appointmentId,
        ).toBe(
          appointmentId,
        );

        expect(
          delivery.channel,
        ).toBe(
          'EMAIL',
        );

        expect(
          delivery.type,
        ).toBe(
          'APPOINTMENT_REMINDER',
        );

        expect(
          delivery.status,
        ).toBe(
          'PENDING',
        );

        expect(
          delivery.recipient,
        ).toBe(
          'maria.reminder.queue.e2e@teste.com',
        );

        expect(
          delivery.dedupeKey,
        ).toBe(
          `appointment:${appointmentId}:reminder:${startsAt.toISOString()}`,
        );

        expect(
          delivery.attempts,
        ).toBe(
          0,
        );

        expect(
          delivery.maxAttempts,
        ).toBe(
          5,
        );

        expect(
          delivery.subject,
        ).toContain(
          'Lembrete do seu agendamento',
        );

        expect(
          delivery.subject,
        ).toContain(
          'Empresa Reminder Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Maria Reminder Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Corte Reminder Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Carlos Reminder Queue E2E',
        );

        expect(
          delivery.sentAt,
        ).toBeNull();

        expect(
          delivery.failedAt,
        ).toBeNull();

        expect(
          delivery.processingStartedAt,
        ).toBeNull();
      },
    );

    it(
      'executar o scheduler novamente não duplica o mesmo lembrete',
      async () => {
        vi.clearAllMocks();

        const result =
          await remindersService.processDueReminders(
            now,
          );

        /*
         * reminderSentAt ainda está NULL,
         * então o scheduler encontra novamente
         * o agendamento.
         *
         * O dedupeKey impede um segundo registro.
         */
        expect(
          result.failed,
        ).toBe(
          0,
        );

        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              appointmentId,

              type:
                'APPOINTMENT_REMINDER',
            },
          });

        expect(
          deliveries,
        ).toHaveLength(
          1,
        );

        expect(
          deliveries[0].dedupeKey,
        ).toBe(
          `appointment:${appointmentId}:reminder:${startsAt.toISOString()}`,
        );

        const appointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointmentId,
            },
          });

        expect(
          appointment?.reminderSentAt,
        ).toBeNull();
      },
    );
  },
);