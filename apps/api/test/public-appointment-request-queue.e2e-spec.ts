import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
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

const dayOfWeekMap = {
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
  7: 'SUNDAY',
} as const;

describe(
  'Solicitação pública com fila de notificações (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let tenantId: string;
    let tenantSlug: string;
    let tenantTimezone: string;

    let employeeId: string;
    let serviceId: string;

    let publicStartsAt: string;

    const sendMail =
      vi.fn();

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.public.request.queue.e2e@teste.com';

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
         * Cria empresa e OWNER.
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
                'Owner Public Request Queue E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Public Request Queue E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(
          201,
        );

        ownerToken =
          await login();

        /*
         * Descobre tenant, slug e timezone.
         */
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

        tenantSlug =
          tenantResponse.body.slug;

        tenantTimezone =
          tenantResponse.body.timezone;

        expect(
          tenantId,
        ).toBeTruthy();

        expect(
          tenantSlug,
        ).toBeTruthy();

        expect(
          tenantTimezone,
        ).toBeTruthy();

        /*
         * Funcionário.
         */
        const employee =
          await prisma.employee.create({
            data: {
              tenantId,

              name:
                'Carlos Public Request Queue E2E',

              email:
                'carlos.public.request.queue.e2e@teste.com',
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
                'Corte Public Request Queue E2E',

              durationMin:
                30,

              priceCents:
                5000,
            },
          });

        serviceId =
          service.id;

        /*
         * Funcionário realiza o serviço.
         */
        await prisma.employeeService.create({
          data: {
            employeeId,
            serviceId,
          },
        });

        /*
         * Escolhe dinamicamente um horário
         * dois dias no futuro.
         *
         * Isso evita que o teste fique preso
         * a uma data fixa e pare de funcionar
         * posteriormente.
         */
        const targetDate =
          DateTime.now()
            .setZone(
              tenantTimezone,
            )
            .plus({
              days: 2,
            })
            .startOf(
              'day',
            )
            .set({
              hour: 10,
              minute: 0,
              second: 0,
              millisecond: 0,
            });

        const weekday =
          dayOfWeekMap[
            targetDate.weekday as keyof typeof dayOfWeekMap
          ];

        expect(
          weekday,
        ).toBeTruthy();

        /*
         * Disponibilidade das 08:00 às 18:00
         * no dia escolhido dinamicamente.
         */
        await prisma.availabilityRule.create({
          data: {
            tenantId,
            employeeId,

            dayOfWeek:
              weekday,

            startMinute:
              480,

            endMinute:
              1080,
          },
        });

        const startsAtIso =
          targetDate.toISO();

        if (
          !startsAtIso
        ) {
          throw new Error(
            'Não foi possível gerar startsAt para o teste',
          );
        }

        publicStartsAt =
          startsAtIso;

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
      'cria agendamento PENDING e NotificationDelivery PENDING sem chamar SMTP',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .post(
              `/public/tenants/${tenantSlug}/appointments`,
            )
            .send({
              employeeId,
              serviceId,

              startsAt:
                publicStartsAt,

              client: {
                name:
                  'Maria Public Request Queue E2E',

                phone:
                  '(34) 99999-0101',

                email:
                  'MARIA.PUBLIC.REQUEST.QUEUE@TESTE.COM',
              },

              notes:
                'Agendamento público com fila',
            });

        expect(
          response.status,
        ).toBe(
          201,
        );

        expect(
          response.body.id,
        ).toBeTruthy();

        expect(
          response.body.status,
        ).toBe(
          'PENDING',
        );

        /*
         * O endpoint público não deve mais
         * conversar diretamente com SMTP.
         */
        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        const appointmentId =
          response.body.id as string;

        const appointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointmentId,
            },

            include: {
              client:
                true,

              employee:
                true,

              service:
                true,
            },
          });

        expect(
          appointment,
        ).toBeTruthy();

        expect(
          appointment!.tenantId,
        ).toBe(
          tenantId,
        );

        expect(
          appointment!.status,
        ).toBe(
          'PENDING',
        );

        expect(
          appointment!.client.email,
        ).toBe(
          'maria.public.request.queue@teste.com',
        );

        /*
         * Deve existir exatamente uma
         * notificação de solicitação.
         */
        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              appointmentId,

              type:
                'APPOINTMENT_REQUESTED',
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
          'APPOINTMENT_REQUESTED',
        );

        expect(
          delivery.status,
        ).toBe(
          'PENDING',
        );

        expect(
          delivery.recipient,
        ).toBe(
          'maria.public.request.queue@teste.com',
        );

        expect(
          delivery.dedupeKey,
        ).toBe(
          `appointment:${appointmentId}:requested`,
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
          'Recebemos seu agendamento',
        );

        expect(
          delivery.subject,
        ).toContain(
          'Empresa Public Request Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Maria Public Request Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Corte Public Request Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'Carlos Public Request Queue E2E',
        );

        expect(
          delivery.text,
        ).toContain(
          'aguardando confirmação',
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