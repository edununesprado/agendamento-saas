import {
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { AppointmentRemindersService } from '../src/notifications/appointment-reminders.service.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe(
  'Lembretes de agendamento (E2E)',
  () => {
    let app:
      INestApplication;

    let prisma:
      PrismaService;

    let remindersService:
      AppointmentRemindersService;

    let tenantId:
      string;

    let employeeId:
      string;

    let serviceId:
      string;

    let clientId:
      string;

    const now =
      new Date(
        '2026-10-24T12:00:00.000Z',
      );

    const clientEmail =
      'maria.reminder.e2e@teste.com';

    const notifyAppointmentRequested =
      vi.fn();

    const notifyAppointmentConfirmed =
      vi.fn();

    const notifyAppointmentCanceled =
      vi.fn();

    const notifyAppointmentRescheduled =
      vi.fn();

    const notifyAppointmentReminder =
      vi.fn();

    function addHours(
      date: Date,
      hours: number,
    ) {
      return new Date(
        date.getTime() +
          hours *
            60 *
            60 *
            1000,
      );
    }

    function addMinutes(
      date: Date,
      minutes: number,
    ) {
      return new Date(
        date.getTime() +
          minutes *
            60 *
            1000,
      );
    }

    async function createAppointment(
      options: {
        startsAt: Date;

        status?:
          | 'PENDING'
          | 'CONFIRMED'
          | 'COMPLETED'
          | 'CANCELED'
          | 'NO_SHOW';

        reminderSentAt?:
          | Date
          | null;
      },
    ) {
      const startsAt =
        options.startsAt;

      const endsAt =
        addMinutes(
          startsAt,
          30,
        );

      return prisma.appointment.create({
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
            options.status ??
            'CONFIRMED',

          reminderSentAt:
            options.reminderSentAt ??
            null,
        },
      });
    }

    beforeAll(
      async () => {
        /*
         * Segurança:
         * este teste apaga dados.
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
            imports: [
              AppModule,
            ],
          })
            .overrideProvider(
              NotificationsService,
            )
            .useValue({
              notifyAppointmentRequested,
              notifyAppointmentConfirmed,
              notifyAppointmentCanceled,
              notifyAppointmentRescheduled,
              notifyAppointmentReminder,
            })
            .compile();

        app =
          moduleRef.createNestApplication();

        await app.init();

        prisma =
          app.get(
            PrismaService,
          );

        remindersService =
          app.get(
            AppointmentRemindersService,
          );

        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        const tenant =
          await prisma.tenant.create({
            data: {
              name:
                'Empresa Reminder E2E',

              slug:
                'empresa-reminder-e2e',

              timezone:
                'America/Sao_Paulo',

              appointmentRemindersEnabled:
                true,

              appointmentReminderHoursBefore:
                24,
            },
          });

        tenantId =
          tenant.id;

        const employee =
          await prisma.employee.create({
            data: {
              tenantId,

              name:
                'Carlos Reminder E2E',

              email:
                'carlos.reminder.e2e@teste.com',
            },
          });

        employeeId =
          employee.id;

        const service =
          await prisma.service.create({
            data: {
              tenantId,

              name:
                'Corte Reminder E2E',

              durationMin:
                30,

              priceCents:
                5000,
            },
          });

        serviceId =
          service.id;

        const client =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Maria Reminder E2E',

              email:
                clientEmail,

              phone:
                '34999993333',
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

        notifyAppointmentRequested.mockResolvedValue(
          true,
        );

        notifyAppointmentConfirmed.mockResolvedValue(
          true,
        );

        notifyAppointmentCanceled.mockResolvedValue(
          true,
        );

        notifyAppointmentRescheduled.mockResolvedValue(
          true,
        );

        notifyAppointmentReminder.mockResolvedValue(
          true,
        );

        await prisma.appointment.deleteMany({
          where: {
            tenantId,
          },
        });

        await prisma.client.update({
          where: {
            id:
              clientId,
          },

          data: {
            email:
              clientEmail,
          },
        });

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
      },
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
      'enfileira lembrete para agendamento confirmado dentro da janela padrão de 24 horas',
      async () => {
        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                12,
              ),
          });

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

        expect(
          notifyAppointmentReminder,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * Agora NotificationsService recebe:
         *
         * argumento 1 = dados do lembrete
         * argumento 2 = transação Prisma
         */
        const [
          notificationData,
          notificationOptions,
        ] =
          notifyAppointmentReminder
            .mock
            .calls[0];

        expect(
          notificationData,
        ).toEqual(
          expect.objectContaining({
            tenantId,

            appointmentId:
              appointment.id,

            clientName:
              'Maria Reminder E2E',

            clientEmail,

            tenantName:
              'Empresa Reminder E2E',

            serviceName:
              'Corte Reminder E2E',

            employeeName:
              'Carlos Reminder E2E',

            timezone:
              'America/Sao_Paulo',

            startsAt:
              expect.any(
                Date,
              ),
          }),
        );

        expect(
          notificationOptions,
        ).toEqual(
          expect.objectContaining({
            client:
              expect.anything(),

            throwOnError:
              true,
          }),
        );

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          savedAppointment,
        ).not.toBeNull();

        /*
         * O scheduler apenas enfileira.
         *
         * reminderSentAt será preenchido
         * pelo worker depois do SMTP.
         */
        expect(
          savedAppointment?.reminderSentAt,
        ).toBeNull();
      },
    );

    it(
      'não enfileira novamente quando reminderSentAt já está preenchido',
      async () => {
        const reminderSentAt =
          new Date(
            '2026-10-24T10:00:00.000Z',
          );

        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                12,
              ),

            reminderSentAt,
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.queued,
        ).toBe(
          0,
        );

        expect(
          result.failed,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          savedAppointment
            ?.reminderSentAt
            ?.toISOString(),
        ).toBe(
          reminderSentAt.toISOString(),
        );
      },
    );

    it(
      'não enfileira lembrete para agendamento PENDING',
      async () => {
        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                12,
              ),

            status:
              'PENDING',
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.queued,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();

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
      'não enfileira lembrete para agendamento além da janela padrão de 24 horas',
      async () => {
        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                25,
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.queued,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();

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
      'não enfileira lembrete para horário que já passou',
      async () => {
        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                -1,
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.queued,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();

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
      'não marca reminderSentAt quando o enfileiramento do lembrete falha',
      async () => {
        notifyAppointmentReminder.mockResolvedValueOnce(
          false,
        );

        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                12,
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.queued,
        ).toBe(
          0,
        );

        expect(
          result.failed,
        ).toBe(
          1,
        );

        expect(
          notifyAppointmentReminder,
        ).toHaveBeenCalledTimes(
          1,
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
      'não seleciona cliente sem e-mail para enfileirar lembrete',
      async () => {
        await prisma.client.update({
          where: {
            id:
              clientId,
          },

          data: {
            email:
              null,
          },
        });

        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                12,
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.queued,
        ).toBe(
          0,
        );

        expect(
          result.failed,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();

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
      'não enfileira lembretes quando a empresa desativa a funcionalidade',
      async () => {
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

        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                12,
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result,
        ).toEqual({
          queued:
            0,

          failed:
            0,

          skipped:
            0,
        });

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();

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
      'respeita configuração de 1 hora antes do agendamento',
      async () => {
        await prisma.tenant.update({
          where: {
            id:
              tenantId,
          },

          data: {
            appointmentReminderHoursBefore:
              1,
          },
        });

        const outsideWindow =
          await createAppointment({
            startsAt:
              addHours(
                now,
                2,
              ),
          });

        const insideWindow =
          await createAppointment({
            startsAt:
              addMinutes(
                now,
                30,
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.queued,
        ).toBe(
          1,
        );

        expect(
          result.failed,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).toHaveBeenCalledTimes(
          1,
        );

        const [
          notificationData,
          notificationOptions,
        ] =
          notifyAppointmentReminder
            .mock
            .calls[0];

        expect(
          notificationData,
        ).toEqual(
          expect.objectContaining({
            appointmentId:
              insideWindow.id,

            tenantId,

            clientEmail,

            startsAt:
              expect.any(
                Date,
              ),
          }),
        );

        expect(
          notificationOptions,
        ).toEqual(
          expect.objectContaining({
            client:
              expect.anything(),

            throwOnError:
              true,
          }),
        );

        const outsideSaved =
          await prisma.appointment.findUnique({
            where: {
              id:
                outsideWindow.id,
            },
          });

        const insideSaved =
          await prisma.appointment.findUnique({
            where: {
              id:
                insideWindow.id,
            },
          });

        /*
         * Nenhum deles é marcado aqui.
         * O worker fará isso após SMTP.
         */
        expect(
          outsideSaved?.reminderSentAt,
        ).toBeNull();

        expect(
          insideSaved?.reminderSentAt,
        ).toBeNull();
      },
    );

    it(
      'respeita configuração de 48 horas antes do agendamento',
      async () => {
        await prisma.tenant.update({
          where: {
            id:
              tenantId,
          },

          data: {
            appointmentReminderHoursBefore:
              48,
          },
        });

        const appointment =
          await createAppointment({
            startsAt:
              addHours(
                now,
                30,
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.queued,
        ).toBe(
          1,
        );

        expect(
          result.failed,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).toHaveBeenCalledTimes(
          1,
        );

        const [
          notificationData,
          notificationOptions,
        ] =
          notifyAppointmentReminder
            .mock
            .calls[0];

        expect(
          notificationData,
        ).toEqual(
          expect.objectContaining({
            tenantId,

            appointmentId:
              appointment.id,

            clientEmail,

            startsAt:
              expect.any(
                Date,
              ),
          }),
        );

        expect(
          notificationOptions,
        ).toEqual(
          expect.objectContaining({
            client:
              expect.anything(),

            throwOnError:
              true,
          }),
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