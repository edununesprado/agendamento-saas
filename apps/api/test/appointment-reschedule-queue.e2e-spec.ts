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
import { EmailService } from '../src/notifications/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

describe(
  'Reagendamento com fila de notificações (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

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
      'owner.reschedule.queue.e2e@teste.com';

    /*
     * 10/11/2026 = terça-feira.
     *
     * America/Sao_Paulo:
     *
     * 09:00 local = 12:00 UTC
     * 10:00 local = 13:00 UTC
     * 11:00 local = 14:00 UTC
     */
    const originalStartsAt =
      '2026-11-10T12:00:00.000Z';

    const newStartsAtLocal =
      '2026-11-10T10:00:00-03:00';

    const newStartsAtUtc =
      '2026-11-10T13:00:00.000Z';

    const secondStartsAtLocal =
      '2026-11-10T11:00:00-03:00';

    const secondStartsAtUtc =
      '2026-11-10T14:00:00.000Z';

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

        /*
         * Limpa somente o banco E2E.
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
                'Owner Reschedule Queue E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Reschedule Queue E2E',
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
         * Funcionário.
         */
        const employee =
          await prisma.employee.create({
            data: {
              tenantId,

              name:
                'Carlos Reschedule Queue E2E',

              email:
                'carlos.reschedule.queue.e2e@teste.com',
            },
          });

        employeeId =
          employee.id;

        /*
         * Serviço de 30 minutos.
         */
        const service =
          await prisma.service.create({
            data: {
              tenantId,

              name:
                'Corte Reschedule Queue E2E',

              durationMin:
                30,

              priceCents:
                5000,
            },
          });

        serviceId =
          service.id;

        /*
         * Vincula funcionário ao serviço.
         */
        await prisma.employeeService.create({
          data: {
            employeeId,
            serviceId,
          },
        });

        /*
         * Cliente.
         */
        const client =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Maria Reschedule Queue E2E',

              email:
                'maria.reschedule.queue.e2e@teste.com',

              phone:
                '34999990002',
            },
          });

        clientId =
          client.id;

        /*
         * Disponibilidade:
         * terça-feira das 08:00 às 12:00.
         */
        await prisma.availabilityRule.create({
          data: {
            tenantId,
            employeeId,

            dayOfWeek:
              'TUESDAY',

            startMinute:
              480,

            endMinute:
              720,
          },
        });

        /*
         * Agendamento inicial:
         * 09:00 America/Sao_Paulo.
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
                  originalStartsAt,
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

              reminderSentAt:
                new Date(
                  '2026-11-10T09:00:00.000Z',
                ),
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
      'reagenda e cria NotificationDelivery PENDING sem chamar SMTP',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${appointmentId}/reschedule`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              startsAt:
                newStartsAtLocal,
            });

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.body.startsAt,
        ).toBe(
          newStartsAtUtc,
        );

        /*
         * A requisição HTTP não deve
         * conversar diretamente com SMTP.
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
          appointment?.startsAt.toISOString(),
        ).toBe(
          newStartsAtUtc,
        );

        /*
         * Ao reagendar, o lembrete anterior
         * deve ser liberado novamente.
         */
        expect(
          appointment?.reminderSentAt,
        ).toBeNull();

        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              appointmentId,

              type:
                'APPOINTMENT_RESCHEDULED',
            },

            orderBy: {
              createdAt:
                'asc',
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
          'APPOINTMENT_RESCHEDULED',
        );

        expect(
          delivery.status,
        ).toBe(
          'PENDING',
        );

        expect(
          delivery.recipient,
        ).toBe(
          'maria.reschedule.queue.e2e@teste.com',
        );

        expect(
          delivery.dedupeKey,
        ).toBe(
          `appointment:${appointmentId}:rescheduled:${newStartsAtUtc}`,
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
          'Agendamento reagendado',
        );

        expect(
          delivery.subject,
        ).toContain(
          'Empresa Reschedule Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Maria Reschedule Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Corte Reschedule Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Carlos Reschedule Queue E2E',
        );

        expect(
          delivery.sentAt,
        ).toBeNull();

        expect(
          delivery.failedAt,
        ).toBeNull();
      },
    );

    it(
      'novo reagendamento para outro horário cria uma segunda entrega com outro dedupeKey',
      async () => {
        vi.clearAllMocks();

        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${appointmentId}/reschedule`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              startsAt:
                secondStartsAtLocal,
            });

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.body.startsAt,
        ).toBe(
          secondStartsAtUtc,
        );

        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              appointmentId,

              type:
                'APPOINTMENT_RESCHEDULED',
            },

            orderBy: {
              createdAt:
                'asc',
            },
          });

        expect(
          deliveries,
        ).toHaveLength(
          2,
        );

        expect(
          deliveries[0].dedupeKey,
        ).toBe(
          `appointment:${appointmentId}:rescheduled:${newStartsAtUtc}`,
        );

        expect(
          deliveries[1].dedupeKey,
        ).toBe(
          `appointment:${appointmentId}:rescheduled:${secondStartsAtUtc}`,
        );

        expect(
          deliveries[1].status,
        ).toBe(
          'PENDING',
        );
      },
    );

    it(
      'não cria outra notificação quando o horário informado não mudou',
      async () => {
        vi.clearAllMocks();

        const before =
          await prisma.notificationDelivery.count({
            where: {
              appointmentId,

              type:
                'APPOINTMENT_RESCHEDULED',
            },
          });

        expect(
          before,
        ).toBe(
          2,
        );

        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${appointmentId}/reschedule`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              startsAt:
                secondStartsAtLocal,
            });

        expect(
          response.status,
        ).toBe(
          200,
        );

        const after =
          await prisma.notificationDelivery.count({
            where: {
              appointmentId,

              type:
                'APPOINTMENT_RESCHEDULED',
            },
          });

        expect(
          after,
        ).toBe(
          2,
        );

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );
  },
);