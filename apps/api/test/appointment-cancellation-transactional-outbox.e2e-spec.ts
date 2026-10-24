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
  'Cancelamento - Transactional Outbox (E2E)',
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
      'maria.cancellation.outbox@teste.com';

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
         * Forçamos a fila de notificações
         * a falhar.
         *
         * Como o cancelamento usa
         * throwOnError: true, a exceção
         * deve provocar rollback.
         */
        enqueueEmail.mockRejectedValue(
          new Error(
            'Falha simulada do cancelamento',
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
                'Empresa Cancellation Outbox E2E',

              slug:
                'empresa-cancellation-outbox-e2e',

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
                'Carlos Cancellation Outbox',

              email:
                'carlos.cancellation.outbox@teste.com',
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
                'Corte Cancellation Outbox',

              durationMin:
                30,

              priceCents:
                5000,
            },
          });

        serviceId =
          service.id;

        /*
         * Cliente com e-mail para que
         * a NotificationDelivery seja
         * realmente tentada.
         */
        const client =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Maria Cancellation Outbox',

              email:
                clientEmail,

              phone:
                '34999996662',
            },
          });

        clientId =
          client.id;

        /*
         * Agendamento começa CONFIRMED.
         *
         * O cancelamento tentará mudar:
         *
         * status -> CANCELED
         * canceledAt -> data atual
         * cancelReason -> motivo
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
                'CONFIRMED',
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
      'mantém o Appointment confirmado quando a notificação de cancelamento falha',
      async () => {
        /*
         * Estado inicial.
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
          before?.canceledAt,
        ).toBeNull();

        expect(
          before?.cancelReason,
        ).toBeNull();

        /*
         * A fila vai lançar erro.
         *
         * Portanto o cancelamento inteiro
         * deve falhar.
         */
        await expect(
          appointmentsService.cancel(
            tenantId,
            appointmentId,
            {
              reason:
                'Cliente solicitou cancelamento',
            },
          ),
        ).rejects.toThrow(
          'Falha simulada do cancelamento',
        );

        /*
         * Confirma que houve tentativa
         * de registrar a notificação.
         */
        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * PONTO PRINCIPAL:
         *
         * tudo que foi alterado dentro
         * da transação deve voltar ao
         * estado anterior.
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
          after?.canceledAt,
        ).toBeNull();

        expect(
          after?.cancelReason,
        ).toBeNull();

        /*
         * Nenhuma NotificationDelivery
         * de cancelamento pode ficar salva.
         */
        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              tenantId,

              appointmentId,

              type:
                'APPOINTMENT_CANCELED',
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