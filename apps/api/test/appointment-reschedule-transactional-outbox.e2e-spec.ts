import {
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AppointmentsService } from '../src/appointments/appointments.service.js';
import { AvailabilityService } from '../src/availability/availability.service.js';
import { NotificationQueueService } from '../src/notifications/notification-queue.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe(
  'Reagendamento - Transactional Outbox (E2E)',
  () => {
    let app: INestApplication;

    let prisma:
      PrismaService;

    let appointmentsService:
      AppointmentsService;

    let tenantId:
      string;

    let employeeId:
      string;

    let serviceId:
      string;

    let clientId:
      string;

    let appointmentId:
      string;

    const enqueueEmail =
      vi.fn();

    const getAvailableSlots =
      vi.fn();

    const originalStartsAt =
      new Date(
        '2026-11-10T12:00:00.000Z',
      );

    const originalEndsAt =
      new Date(
        '2026-11-10T12:30:00.000Z',
      );

    const originalReminderSentAt =
      new Date(
        '2026-11-09T12:00:00.000Z',
      );

    const newStartsAt =
      '2026-11-10T10:00:00-03:00';

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

        /*
         * O horário de 10:00 será considerado
         * disponível.
         *
         * Assim podemos testar somente a
         * transação do reagendamento.
         */
        getAvailableSlots.mockResolvedValue({
          slots: [
            '10:00',
          ],
        });

        /*
         * Força falha na criação da
         * NotificationDelivery.
         */
        enqueueEmail.mockRejectedValue(
          new Error(
            'Falha simulada do reagendamento',
          ),
        );

        const moduleRef =
          await Test.createTestingModule({
            imports: [
              AppModule,
            ],
          })
            .overrideProvider(
              NotificationQueueService,
            )
            .useValue({
              enqueueEmail,
            })
            .overrideProvider(
              AvailabilityService,
            )
            .useValue({
              getAvailableSlots,
            })
            .compile();

        app =
          moduleRef.createNestApplication();

        await app.init();

        prisma =
          app.get(
            PrismaService,
          );

        appointmentsService =
          app.get(
            AppointmentsService,
          );

        /*
         * Limpa somente o banco E2E.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * Empresa.
         */
        const tenant =
          await prisma.tenant.create({
            data: {
              name:
                'Empresa Reschedule Outbox E2E',

              slug:
                'empresa-reschedule-outbox-e2e',

              timezone:
                'America/Sao_Paulo',
            },
          });

        tenantId =
          tenant.id;

        /*
         * Funcionário.
         */
        const employee =
          await prisma.employee.create({
            data: {
              tenantId,

              name:
                'Carlos Reschedule Outbox',

              email:
                'carlos.reschedule.outbox@teste.com',
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
                'Corte Reschedule Outbox',

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
                'Maria Reschedule Outbox',

              email:
                'maria.reschedule.outbox@teste.com',

              phone:
                '34999996663',
            },
          });

        clientId =
          client.id;

        /*
         * Agendamento original.
         *
         * Também colocamos reminderSentAt
         * preenchido para provar que o
         * rollback restaura esse valor.
         */
        const appointment =
          await prisma.appointment.create({
            data: {
              tenantId,

              employeeId,

              serviceId,

              clientId,

              startsAt:
                originalStartsAt,

              endsAt:
                originalEndsAt,

              durationMin:
                30,

              priceCents:
                5000,

              status:
                'CONFIRMED',

              reminderSentAt:
                originalReminderSentAt,
            },
          });

        appointmentId =
          appointment.id;
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
      'mantém horário e reminderSentAt antigos quando a notificação de reagendamento falha',
      async () => {
        /*
         * Confirma estado inicial.
         */
        const before =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointmentId,
            },
          });

        expect(
          before,
        ).not.toBeNull();

        expect(
          before?.startsAt.toISOString(),
        ).toBe(
          originalStartsAt.toISOString(),
        );

        expect(
          before?.endsAt.toISOString(),
        ).toBe(
          originalEndsAt.toISOString(),
        );

        expect(
          before?.reminderSentAt?.toISOString(),
        ).toBe(
          originalReminderSentAt.toISOString(),
        );

        /*
         * O AvailabilityService deve aceitar
         * o novo horário.
         *
         * Depois disso a fila falhará.
         */
        await expect(
          appointmentsService.reschedule(
            tenantId,
            appointmentId,
            {
              startsAt:
                newStartsAt,
            },
          ),
        ).rejects.toThrow(
          'Falha simulada do reagendamento',
        );

        /*
         * Confirma que a verificação de
         * disponibilidade aconteceu.
         */
        expect(
          getAvailableSlots,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * Confirma que a NotificationDelivery
         * foi realmente tentada.
         */
        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * PONTO PRINCIPAL:
         *
         * apesar do UPDATE ter acontecido
         * dentro da transação, a falha da
         * notificação deve desfazer tudo.
         */
        const after =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointmentId,
            },
          });

        expect(
          after,
        ).not.toBeNull();

        /*
         * Horário antigo permanece.
         */
        expect(
          after?.startsAt.toISOString(),
        ).toBe(
          originalStartsAt.toISOString(),
        );

        expect(
          after?.endsAt.toISOString(),
        ).toBe(
          originalEndsAt.toISOString(),
        );

        /*
         * O reagendamento tentou colocar
         * reminderSentAt = null.
         *
         * O rollback deve restaurar
         * exatamente o valor anterior.
         */
        expect(
          after?.reminderSentAt?.toISOString(),
        ).toBe(
          originalReminderSentAt.toISOString(),
        );

        /*
         * Status também permanece igual.
         */
        expect(
          after?.status,
        ).toBe(
          'CONFIRMED',
        );

        /*
         * Nenhuma NotificationDelivery
         * pode permanecer gravada.
         */
        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              tenantId,

              appointmentId,

              type:
                'APPOINTMENT_RESCHEDULED',
            },
          });

        expect(
          deliveries,
        ).toHaveLength(
          0,
        );
      },
      10000,
    );
  },
);