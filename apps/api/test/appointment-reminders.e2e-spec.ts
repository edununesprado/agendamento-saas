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
    let app: INestApplication;
    let prisma: PrismaService;
    let remindersService:
      AppointmentRemindersService;

    let tenantId: string;
    let employeeId: string;
    let serviceId: string;
    let clientId: string;

    /*
     * Usamos uma data fixa para que os testes
     * não dependam do relógio real da máquina.
     */
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
         * Segurança: este teste apaga dados.
         *
         * Ele nunca deve executar usando
         * o banco normal de desenvolvimento.
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

        /*
         * Limpa somente o banco E2E.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * Empresa usada pelos testes.
         *
         * Os valores padrão também são os
         * valores atuais do sistema:
         *
         * lembrete ativo
         * 24 horas antes
         */
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

        /*
         * Cada teste começa sem agendamentos.
         */
        await prisma.appointment.deleteMany({
          where: {
            tenantId,
          },
        });

        /*
         * Também restauramos o cliente.
         *
         * Um dos testes remove o e-mail.
         */
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

        /*
         * E restauramos a configuração padrão
         * da empresa antes de cada cenário.
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
      'envia lembrete para agendamento confirmado dentro da janela padrão de 24 horas',
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
          sent:
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

        expect(
          notifyAppointmentReminder,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
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

        expect(
          savedAppointment?.reminderSentAt,
        ).toBeInstanceOf(
          Date,
        );
      },
    );

    it(
      'não envia novamente quando reminderSentAt já está preenchido',
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
          result.sent,
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
      'não envia lembrete para agendamento PENDING',
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
          result.sent,
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
      'não envia lembrete para agendamento além da janela padrão de 24 horas',
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
          result.sent,
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
      'não envia lembrete para horário que já passou',
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
          result.sent,
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
      'não marca reminderSentAt quando o envio do e-mail falha',
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
          result.sent,
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
      'não seleciona cliente sem e-mail para envio de lembrete',
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
          result.sent,
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
      'não envia lembretes quando a empresa desativa a funcionalidade',
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
          sent:
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

        /*
         * Este está fora da janela:
         * faltam 2 horas.
         */
        const outsideWindow =
          await createAppointment({
            startsAt:
              addHours(
                now,
                2,
              ),
          });

        /*
         * Este está dentro da janela:
         * faltam apenas 30 minutos.
         */
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
          result.sent,
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

        expect(
          outsideSaved?.reminderSentAt,
        ).toBeNull();

        expect(
          insideSaved?.reminderSentAt,
        ).toBeInstanceOf(
          Date,
        );
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

        /*
         * Com a antiga regra fixa de 24 horas
         * este agendamento não seria enviado.
         *
         * Com 48 horas configuradas pela
         * empresa, ele deve ser elegível.
         */
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
          result.sent,
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

        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          savedAppointment?.reminderSentAt,
        ).toBeInstanceOf(
          Date,
        );
      },
    );
  },
);