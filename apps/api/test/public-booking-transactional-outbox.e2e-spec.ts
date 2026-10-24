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
import { NotificationQueueService } from '../src/notifications/notification-queue.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

describe(
  'Agendamento público - Transactional Outbox (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;

    let tenantId: string;
    let tenantSlug: string;

    let serviceId: string;
    let employeeId: string;

    let appointmentStartsAt: string;
    let appointmentStartsAtUtc: Date;

    const enqueueEmail =
      vi.fn();

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.public.outbox.e2e@teste.com';

    const clientPhone =
      '34999997771';

    const clientEmail =
      'rollback.outbox@teste.com';

    function getDayOfWeek(
      weekday: number,
    ) {
      const days: Record<
        number,
        string
      > = {
        1: 'MONDAY',
        2: 'TUESDAY',
        3: 'WEDNESDAY',
        4: 'THURSDAY',
        5: 'FRIDAY',
        6: 'SATURDAY',
        7: 'SUNDAY',
      };

      return days[weekday];
    }

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
        /*
         * Segurança:
         * este teste apaga dados do banco.
         */
        if (
          !process.env.DATABASE_URL?.includes(
            'agendamento_test',
          )
        ) {
          throw new Error(
            'SEGURANÇA: os testes E2E devem usar agendamento_test',
          );
        }

        /*
         * A fila será forçada a falhar.
         *
         * NotificationsService deve relançar
         * esse erro porque o fluxo público
         * usa throwOnError: true.
         */
        enqueueEmail.mockRejectedValue(
          new Error(
            'Falha simulada da NotificationDelivery',
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

        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * Cria empresa + OWNER.
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
                'Owner Transactional Outbox E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Transactional Outbox E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(
          201,
        );

        ownerToken =
          await login();

        /*
         * Obtém tenant/slug.
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

        tenantSlug =
          tenantResponse.body.slug;

        const tenant =
          await prisma.tenant.findUnique({
            where: {
              slug:
                tenantSlug,
            },

            select: {
              id:
                true,

              timezone:
                true,
            },
          });

        expect(
          tenant,
        ).toBeTruthy();

        tenantId =
          tenant!.id;

        /*
         * Serviço.
         */
        const serviceResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/services',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              name:
                'Corte Outbox E2E',

              durationMin:
                30,

              priceCents:
                5000,
            });

        expect(
          serviceResponse.status,
        ).toBe(
          201,
        );

        serviceId =
          serviceResponse.body.id;

        /*
         * Profissional.
         */
        const employeeResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/employees',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              name:
                'Carlos Outbox E2E',

              email:
                'carlos.outbox.e2e@teste.com',

              phone:
                '34999997772',
            });

        expect(
          employeeResponse.status,
        ).toBe(
          201,
        );

        employeeId =
          employeeResponse.body.id;

        /*
         * Vincula serviço ao profissional.
         */
        const linkResponse =
          await request(
            app.getHttpServer(),
          )
            .put(
              `/employees/${employeeId}/services`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              serviceIds: [
                serviceId,
              ],
            });

        expect(
          linkResponse.status,
        ).toBe(
          200,
        );

        /*
         * Usamos amanhã para evitar datas
         * fixas e manter o teste válido
         * no futuro.
         */
        const appointmentDate =
          DateTime.now()
            .setZone(
              tenant!.timezone,
            )
            .plus({
              days:
                1,
            })
            .set({
              hour:
                12,

              minute:
                0,

              second:
                0,

              millisecond:
                0,
            });

        appointmentStartsAt =
          appointmentDate.toISO()!;

        appointmentStartsAtUtc =
          appointmentDate
            .toUTC()
            .toJSDate();

        const dayOfWeek =
          getDayOfWeek(
            appointmentDate.weekday,
          );

        /*
         * Cria disponibilidade no dia
         * escolhido dinamicamente.
         */
        const availabilityResponse =
          await request(
            app.getHttpServer(),
          )
            .put(
              `/employees/${employeeId}/availability`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              days: [
                {
                  dayOfWeek,

                  intervals: [
                    {
                      start:
                        '12:00',

                      end:
                        '13:00',
                    },
                  ],
                },
              ],
            });

        expect(
          availabilityResponse.status,
        ).toBe(
          200,
        );
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
      'faz rollback de Client e Appointment quando a fila de notificação falha',
      async () => {
        /*
         * Antes da requisição não pode
         * existir nenhum dado do cliente.
         */
        const clientBefore =
          await prisma.client.findFirst({
            where: {
              tenantId,

              phone:
                clientPhone,
            },
          });

        expect(
          clientBefore,
        ).toBeNull();

        /*
         * A criação do Appointment acontece
         * primeiro dentro da transação.
         *
         * Depois a fila simulada lança erro.
         */
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
                appointmentStartsAt,

              client: {
                name:
                  'Cliente Rollback Outbox',

                phone:
                  clientPhone,

                email:
                  clientEmail,
              },

              notes:
                'Teste de rollback do Transactional Outbox',
            });

        /*
         * A exceção da fila deve sair da
         * transação e chegar ao Nest.
         */
        expect(
          response.status,
        ).toBe(
          500,
        );

        /*
         * Garante que a fila realmente
         * foi chamada.
         */
        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * O Client foi criado dentro da mesma
         * transação. Portanto também deve
         * sofrer rollback.
         */
        const clientAfter =
          await prisma.client.findFirst({
            where: {
              tenantId,

              phone:
                clientPhone,
            },
          });

        expect(
          clientAfter,
        ).toBeNull();

        /*
         * O Appointment também não pode
         * permanecer no banco.
         */
        const appointmentAfter =
          await prisma.appointment.findFirst({
            where: {
              tenantId,

              employeeId,

              serviceId,

              startsAt:
                appointmentStartsAtUtc,
            },
          });

        expect(
          appointmentAfter,
        ).toBeNull();

        /*
         * Como a fila falhou, também não
         * pode existir NotificationDelivery
         * referente a esta tentativa.
         */
        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              tenantId,

              recipient:
                clientEmail,
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