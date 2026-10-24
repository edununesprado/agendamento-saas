import {
  INestApplication,
  ValidationPipe,
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
    let remindersService: AppointmentRemindersService;

    const notifyAppointmentReminder =
      vi.fn();

    let tenantId: string;
    let employeeId: string;
    let serviceId: string;
    let clientId: string;

    const now =
      new Date(
        '2026-10-24T12:00:00.000Z',
      );

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
              NotificationsService,
            )
            .useValue({
              notifyAppointmentRequested:
                vi.fn(),

              notifyAppointmentConfirmed:
                vi.fn(),

              notifyAppointmentCanceled:
                vi.fn(),

              notifyAppointmentRescheduled:
                vi.fn(),

              notifyAppointmentReminder,
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

        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        const tenant =
          await prisma.tenant.create({
            data: {
              name:
                'Empresa Lembretes E2E',

              slug:
                'empresa-lembretes-e2e',

              timezone:
                'America/Sao_Paulo',
            },
          });

        tenantId =
          tenant.id;

        const employee =
          await prisma.employee.create({
            data: {
              tenantId,

              name:
                'Carlos Lembretes',
            },
          });

        employeeId =
          employee.id;

        const service =
          await prisma.service.create({
            data: {
              tenantId,

              name:
                'Corte Lembretes',

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
                'Maria Lembretes',

              email:
                'maria.lembretes@teste.com',

              phone:
                '34999999999',
            },
          });

        clientId =
          client.id;
      },
    );

    beforeEach(
      async () => {
        vi.clearAllMocks();

        notifyAppointmentReminder.mockResolvedValue(
          true,
        );

        await prisma.appointment.deleteMany();
      },
    );

    afterAll(
      async () => {
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        await app.close();
      },
    );

    async function createAppointment(
      data: {
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

        email?: string | null;
      },
    ) {
      if (
        data.email !==
        undefined
      ) {
        await prisma.client.update({
          where: {
            id:
              clientId,
          },

          data: {
            email:
              data.email,
          },
        });
      } else {
        await prisma.client.update({
          where: {
            id:
              clientId,
          },

          data: {
            email:
              'maria.lembretes@teste.com',
          },
        });
      }

      return prisma.appointment.create({
        data: {
          tenantId,
          employeeId,
          serviceId,
          clientId,

          startsAt:
            data.startsAt,

          endsAt:
            new Date(
              data.startsAt.getTime() +
                30 *
                  60 *
                  1000,
            ),

          durationMin:
            30,

          priceCents:
            5000,

          status:
            data.status ??
            'CONFIRMED',

          reminderSentAt:
            data.reminderSentAt ??
            null,
        },
      });
    }

    it(
      'envia lembrete para agendamento confirmado dentro das próximas 24 horas',
      async () => {
        const appointment =
          await createAppointment({
            startsAt:
              new Date(
                '2026-10-25T11:00:00.000Z',
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result,
        ).toEqual({
          found:
            1,

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
              'Maria Lembretes',

            clientEmail:
              'maria.lembretes@teste.com',

            tenantName:
              'Empresa Lembretes E2E',

            serviceName:
              'Corte Lembretes',

            employeeName:
              'Carlos Lembretes',

            startsAt:
              appointment.startsAt,

            timezone:
              'America/Sao_Paulo',
          }),
        );

        const saved =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          saved?.reminderSentAt,
        ).not.toBeNull();
      },
    );

    it(
      'não envia novamente quando reminderSentAt já está preenchido',
      async () => {
        const appointment =
          await createAppointment({
            startsAt:
              new Date(
                '2026-10-25T10:00:00.000Z',
              ),

            reminderSentAt:
              new Date(
                '2026-10-24T09:00:00.000Z',
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.found,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();

        const saved =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          saved?.reminderSentAt?.toISOString(),
        ).toBe(
          '2026-10-24T09:00:00.000Z',
        );
      },
    );

    it(
      'não envia lembrete para agendamento PENDING',
      async () => {
        await createAppointment({
          startsAt:
            new Date(
              '2026-10-25T09:00:00.000Z',
            ),

          status:
            'PENDING',
        });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.found,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não envia lembrete para agendamento além de 24 horas',
      async () => {
        await createAppointment({
          startsAt:
            new Date(
              '2026-10-25T12:01:00.000Z',
            ),
        });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.found,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não envia lembrete para horário que já passou',
      async () => {
        await createAppointment({
          startsAt:
            new Date(
              '2026-10-24T11:00:00.000Z',
            ),
        });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.found,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();
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
              new Date(
                '2026-10-25T08:00:00.000Z',
              ),
          });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result,
        ).toEqual({
          found:
            1,

          sent:
            0,

          failed:
            1,

          skipped:
            0,
        });

        const saved =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointment.id,
            },
          });

        expect(
          saved?.reminderSentAt,
        ).toBeNull();
      },
    );

    it(
      'não seleciona cliente sem e-mail para envio de lembrete',
      async () => {
        await createAppointment({
          startsAt:
            new Date(
              '2026-10-25T07:00:00.000Z',
            ),

          email:
            null,
        });

        const result =
          await remindersService.processDueReminders(
            now,
          );

        expect(
          result.found,
        ).toBe(
          0,
        );

        expect(
          notifyAppointmentReminder,
        ).not.toHaveBeenCalled();
      },
    );
  },
);