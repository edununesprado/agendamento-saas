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
import { NotificationQueueService } from '../src/notifications/notification-queue.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe(
  'Confirmação - Transactional Outbox (E2E)',
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

    const clientEmail =
      'maria.confirmation.outbox@teste.com';

    const enqueueEmail =
      vi.fn();

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
         * Forçamos a fila a falhar.
         *
         * A confirmação deve então
         * sofrer rollback.
         */
        enqueueEmail.mockRejectedValue(
          new Error(
            'Falha simulada da confirmação',
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
                'Empresa Confirmation Outbox E2E',

              slug:
                'empresa-confirmation-outbox-e2e',

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
                'Carlos Confirmation Outbox',

              email:
                'carlos.confirmation.outbox@teste.com',
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
                'Corte Confirmation Outbox',

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
         * Sem e-mail não existiria
         * NotificationDelivery para criar.
         */
        const client =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Maria Confirmation Outbox',

              email:
                clientEmail,

              phone:
                '34999996661',
            },
          });

        clientId =
          client.id;

        /*
         * Agendamento começa PENDING.
         *
         * É exatamente a transição
         * PENDING -> CONFIRMED que queremos
         * proteger com atomicidade.
         */
        const appointment =
          await prisma.appointment.create({
            data: {
              tenantId,

              employeeId,

              serviceId,

              clientId,

              startsAt:
                new Date(
                  '2026-11-10T12:00:00.000Z',
                ),

              endsAt:
                new Date(
                  '2026-11-10T12:30:00.000Z',
                ),

              durationMin:
                30,

              priceCents:
                5000,

              status:
                'PENDING',
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
      'mantém Appointment como PENDING quando a criação da notificação de confirmação falha',
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
          'PENDING',
        );

        /*
         * O NotificationQueueService
         * foi configurado para lançar erro.
         *
         * Portanto updateStatus deve rejeitar.
         */
        await expect(
          appointmentsService.updateStatus(
            tenantId,
            appointmentId,
            {
              status:
                'CONFIRMED',
            },
          ),
        ).rejects.toThrow(
          'Falha simulada da confirmação',
        );

        /*
         * Garante que realmente tentamos
         * criar a notificação.
         */
        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * PONTO PRINCIPAL DO TESTE:
         *
         * o UPDATE para CONFIRMED aconteceu
         * dentro da transação, mas como a
         * NotificationDelivery falhou,
         * PostgreSQL deve ter feito rollback.
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
          'PENDING',
        );

        /*
         * Também não pode existir
         * NotificationDelivery gravada.
         */
        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              tenantId,

              appointmentId,

              type:
                'APPOINTMENT_CONFIRMED',
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