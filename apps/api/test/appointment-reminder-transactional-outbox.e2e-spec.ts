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
import { AppointmentRemindersService } from '../src/notifications/appointment-reminders.service.js';
import { NotificationQueueService } from '../src/notifications/notification-queue.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe(
  'Lembrete - Transactional Outbox (E2E)',
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

    let appointmentId:
      string;

    const enqueueEmail =
      vi.fn();

    /*
     * Relógio fixo para o teste.
     */
    const now =
      new Date(
        '2026-10-24T12:00:00.000Z',
      );

    /*
     * O agendamento está 12 horas
     * no futuro.
     *
     * Com configuração de 24 horas,
     * ele está dentro da janela
     * de lembrete.
     */
    const appointmentStartsAt =
      new Date(
        '2026-10-25T00:00:00.000Z',
      );

    const appointmentEndsAt =
      new Date(
        '2026-10-25T00:30:00.000Z',
      );

    const clientEmail =
      'maria.reminder.outbox@teste.com';

    beforeAll(
      async () => {
        /*
         * SEGURANÇA:
         *
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
         * Forçamos a criação da
         * NotificationDelivery a falhar.
         */
        enqueueEmail.mockRejectedValue(
          new Error(
            'Falha simulada do lembrete',
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
         * Limpa somente o banco de testes.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * Empresa com lembretes ativados.
         */
        const tenant =
          await prisma.tenant.create({
            data: {
              name:
                'Empresa Reminder Outbox E2E',

              slug:
                'empresa-reminder-outbox-e2e',

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

        /*
         * Funcionário.
         */
        const employee =
          await prisma.employee.create({
            data: {
              tenantId,

              name:
                'Carlos Reminder Outbox',

              email:
                'carlos.reminder.outbox@teste.com',
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
                'Corte Reminder Outbox',

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
         *
         * Sem e-mail o scheduler
         * ignoraria o agendamento.
         */
        const client =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Maria Reminder Outbox',

              email:
                clientEmail,

              phone:
                '34999996665',
            },
          });

        clientId =
          client.id;

        /*
         * Agendamento confirmado,
         * dentro da janela de 24h
         * e ainda sem lembrete enviado.
         */
        const appointment =
          await prisma.appointment.create({
            data: {
              tenantId,

              employeeId,

              serviceId,

              clientId,

              startsAt:
                appointmentStartsAt,

              endsAt:
                appointmentEndsAt,

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
      'não grava entrega nem reminderSentAt quando a fila do lembrete falha',
      async () => {
        /*
         * Confirma o estado inicial.
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
          before?.status,
        ).toBe(
          'CONFIRMED',
        );

        expect(
          before?.reminderSentAt,
        ).toBeNull();

        /*
         * O agendamento está dentro
         * da janela de lembrete.
         *
         * A NotificationQueueService
         * irá lançar o erro simulado.
         */
        const result =
          await remindersService.processDueReminders(
            now,
          );

        /*
         * O scheduler não deve quebrar
         * o processamento inteiro.
         *
         * A falha deve ser contabilizada.
         */
        expect(
          result,
        ).toEqual({
          queued:
            0,

          failed:
            1,

          skipped:
            0,
        });

        /*
         * Confirma que houve tentativa
         * real de enfileirar o lembrete.
         */
        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * O Appointment continua
         * confirmado e sem reminderSentAt.
         *
         * reminderSentAt só poderá ser
         * preenchido depois do SMTP
         * realmente confirmar o envio.
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

        expect(
          after?.status,
        ).toBe(
          'CONFIRMED',
        );

        expect(
          after?.reminderSentAt,
        ).toBeNull();

        /*
         * Nenhuma NotificationDelivery
         * deve permanecer gravada.
         */
        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              tenantId,

              appointmentId,

              type:
                'APPOINTMENT_REMINDER',
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