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
  'Criação interna - Transactional Outbox (E2E)',
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

    const clientEmail =
      'maria.create.outbox@teste.com';

    const enqueueEmail =
      vi.fn();

    const getAvailableSlots =
      vi.fn();

    const startsAtLocal =
      '2026-11-10T09:00:00-03:00';

    const startsAtUtc =
      new Date(
        '2026-11-10T12:00:00.000Z',
      );

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
         * Horário considerado disponível.
         */
        getAvailableSlots.mockResolvedValue({
          slots: [
            '09:00',
          ],

          service: {
            durationMin:
              30,

            priceCents:
              5000,
          },
        });

        /*
         * Força falha da fila de confirmação.
         */
        enqueueEmail.mockRejectedValue(
          new Error(
            'Falha simulada da criação interna',
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
                'Empresa Create Outbox E2E',

              slug:
                'empresa-create-outbox-e2e',

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
                'Carlos Create Outbox',

              email:
                'carlos.create.outbox@teste.com',
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
                'Corte Create Outbox',

              durationMin:
                30,

              priceCents:
                5000,
            },
          });

        serviceId =
          service.id;

        /*
         * Cliente ativo com e-mail.
         */
        const client =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Maria Create Outbox',

              email:
                clientEmail,

              phone:
                '34999996664',

              active:
                true,
            },
          });

        clientId =
          client.id;
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
      'não cria Appointment quando a NotificationDelivery de confirmação falha',
      async () => {
        /*
         * Antes do teste não existe
         * agendamento nesse horário.
         */
        const before =
          await prisma.appointment.findFirst({
            where: {
              tenantId,

              employeeId,

              startsAt:
                startsAtUtc,
            },
          });

        expect(
          before,
        ).toBeNull();

        /*
         * A criação interna tentará:
         *
         * 1. criar Appointment CONFIRMED
         * 2. criar APPOINTMENT_CONFIRMED
         *
         * A etapa 2 será forçada a falhar.
         */
        await expect(
          appointmentsService.create(
            tenantId,
            {
              employeeId,

              serviceId,

              clientId,

              startsAt:
                startsAtLocal,

              notes:
                'Teste de rollback da criação interna',
            },
          ),
        ).rejects.toThrow(
          'Falha simulada da criação interna',
        );

        /*
         * A fila precisa ter sido realmente
         * chamada.
         */
        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * PONTO PRINCIPAL:
         *
         * o Appointment chegou a ser criado
         * dentro da transação, mas deve ter
         * sido removido pelo rollback.
         */
        const after =
          await prisma.appointment.findFirst({
            where: {
              tenantId,

              employeeId,

              serviceId,

              clientId,

              startsAt:
                startsAtUtc,
            },
          });

        expect(
          after,
        ).toBeNull();

        /*
         * Nenhuma NotificationDelivery
         * deve existir.
         */
        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              tenantId,

              recipient:
                clientEmail,

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