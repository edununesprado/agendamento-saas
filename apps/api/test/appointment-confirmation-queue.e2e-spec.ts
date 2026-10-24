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
  'Confirmação de agendamento com fila (E2E)',
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
      'owner.confirmation.queue.e2e@teste.com';

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
         * Cria empresa e OWNER usando
         * o fluxo real da aplicação.
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
                'Owner Confirmation Queue E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Confirmation Queue E2E',
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
         * Dados mínimos necessários para
         * criar um agendamento PENDING.
         *
         * Como este teste é da confirmação,
         * não precisamos testar novamente
         * disponibilidade ou criação pública.
         */
        const employee =
          await prisma.employee.create({
            data: {
              tenantId,

              name:
                'Carlos Queue E2E',

              email:
                'carlos.queue.e2e@teste.com',
            },
          });

        employeeId =
          employee.id;

        const service =
          await prisma.service.create({
            data: {
              tenantId,

              name:
                'Corte Queue E2E',

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
                'Maria Queue E2E',

              email:
                'maria.queue.e2e@teste.com',

              phone:
                '34999990000',
            },
          });

        clientId =
          client.id;

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
      'confirma o agendamento e cria NotificationDelivery PENDING sem chamar SMTP',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${appointmentId}/status`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              status:
                'CONFIRMED',
            });

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.body.status,
        ).toBe(
          'CONFIRMED',
        );

        /*
         * A própria requisição de confirmação
         * não deve mais conversar com SMTP.
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
          appointment?.status,
        ).toBe(
          'CONFIRMED',
        );

        /*
         * A confirmação deve ter criado
         * exatamente uma entrega persistida.
         */
        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              appointmentId,

              type:
                'APPOINTMENT_CONFIRMED',
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
          'APPOINTMENT_CONFIRMED',
        );

        expect(
          delivery.status,
        ).toBe(
          'PENDING',
        );

        expect(
          delivery.recipient,
        ).toBe(
          'maria.queue.e2e@teste.com',
        );

        expect(
          delivery.dedupeKey,
        ).toBe(
          `appointment:${appointmentId}:confirmed`,
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
          'Agendamento confirmado',
        );

        expect(
          delivery.subject,
        ).toContain(
          'Empresa Confirmation Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Maria Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Corte Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Carlos Queue E2E',
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
  },
);