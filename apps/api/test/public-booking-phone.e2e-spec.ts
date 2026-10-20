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
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

const timezone =
  'America/Sao_Paulo';

const weekdayNames = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

describe(
  'Agendamento público - telefone (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;

    let tenantId: string;
    let tenantSlug: string;

    let serviceId: string;

    let employeeAId: string;
    let employeeBId: string;

    let bookingDate: string;

    let bookingDayOfWeek:
      (typeof weekdayNames)[number];

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.public.phone.e2e@teste.com';

    function startsAt(
      time: string,
    ) {
      const value =
        DateTime.fromISO(
          `${bookingDate}T${time}`,
          {
            zone:
              timezone,
          },
        );

      if (
        !value.isValid
      ) {
        throw new Error(
          'Data de teste inválida',
        );
      }

      const iso =
        value.toISO();

      if (!iso) {
        throw new Error(
          'Não foi possível gerar startsAt',
        );
      }

      return iso;
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

    async function createPublicAppointment(
      employeeId: string,
      time: string,
      phone: string,
      name = 'Cliente Telefone E2E',
    ) {
      return request(
        app.getHttpServer(),
      )
        .post(
          `/public/tenants/${tenantSlug}/appointments`,
        )
        .send({
          employeeId,
          serviceId,

          startsAt:
            startsAt(
              time,
            ),

          client: {
            name,
            phone,
          },
        });
    }

    beforeAll(
      async () => {
        if (
          !process.env.DATABASE_URL?.includes(
            'agendamento_test',
          )
        ) {
          throw new Error(
            'SEGURANÇA: os testes E2E devem usar agendamento_test',
          );
        }

        const moduleRef =
          await Test.createTestingModule({
            imports: [
              AppModule,
            ],
          }).compile();

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
         * Data futura dinâmica.
         */
        const targetDate =
          DateTime.now()
            .setZone(
              timezone,
            )
            .plus({
              days: 2,
            })
            .startOf(
              'day',
            );

        const targetIsoDate =
          targetDate.toISODate();

        if (
          !targetIsoDate
        ) {
          throw new Error(
            'Não foi possível gerar data de teste',
          );
        }

        bookingDate =
          targetIsoDate;

        bookingDayOfWeek =
          weekdayNames[
            targetDate.weekday -
              1
          ];

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
                'Owner Public Phone E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Public Phone E2E',
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

        tenantSlug =
          tenantResponse.body.slug;

        /*
         * Sem antecedência mínima
         * para facilitar os testes.
         */
        const updateTenantResponse =
          await request(
            app.getHttpServer(),
          )
            .patch(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              bookingMinAdvanceMinutes:
                0,

              bookingMaxAdvanceDays:
                30,
            });

        expect(
          updateTenantResponse.status,
        ).toBe(
          200,
        );

        /*
         * Serviço de 30 minutos.
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
                'Serviço Public Phone E2E',

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
         * Dois profissionais permitem
         * testar concorrência do mesmo
         * cliente sem conflito de agenda
         * entre profissionais.
         */
        const employeeAResponse =
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
                'Profissional Phone A',

              email:
                'profissional.phone.a@teste.com',

              phone:
                '34999991011',
            });

        expect(
          employeeAResponse.status,
        ).toBe(
          201,
        );

        employeeAId =
          employeeAResponse.body.id;

        const employeeBResponse =
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
                'Profissional Phone B',

              email:
                'profissional.phone.b@teste.com',

              phone:
                '34999991012',
            });

        expect(
          employeeBResponse.status,
        ).toBe(
          201,
        );

        employeeBId =
          employeeBResponse.body.id;

        for (
          const employeeId of [
            employeeAId,
            employeeBId,
          ]
        ) {
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
                    dayOfWeek:
                      bookingDayOfWeek,

                    intervals: [
                      {
                        start:
                          '08:00',

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
        }
      },
      30000,
    );

    beforeEach(
      async () => {
        await prisma.appointment.deleteMany({
          where: {
            tenantId,
          },
        });

        await prisma.client.deleteMany({
          where: {
            tenantId,
          },
        });
      },
    );

    afterAll(
      async () => {
        if (
          prisma
        ) {
          await prisma.tenant.deleteMany();
          await prisma.user.deleteMany();
        }

        if (
          app
        ) {
          await app.close();
        }
      },
      30000,
    );

    it(
      'normaliza telefone brasileiro com +55 para o formato nacional',
      async () => {
        const response =
          await createPublicAppointment(
            employeeAId,
            '08:00',
            '+55 (34) 99999-3001',
          );

        expect(
          response.status,
        ).toBe(
          201,
        );

        const clients =
          await prisma.client.findMany({
            where: {
              tenantId,
            },
          });

        expect(
          clients,
        ).toHaveLength(
          1,
        );

        expect(
          clients[0].phone,
        ).toBe(
          '34999993001',
        );
      },
    );

    it(
      'reutiliza o mesmo cliente quando o telefone muda apenas de formato',
      async () => {
        const first =
          await createPublicAppointment(
            employeeAId,
            '08:00',
            '(34) 99999-3002',
          );

        expect(
          first.status,
        ).toBe(
          201,
        );

        const second =
          await createPublicAppointment(
            employeeAId,
            '08:30',
            '+55 34 99999-3002',
            'Nome diferente',
          );

        expect(
          second.status,
        ).toBe(
          201,
        );

        const clients =
          await prisma.client.findMany({
            where: {
              tenantId,

              OR: [
                {
                  phone:
                    '34999993002',
                },
                {
                  phone:
                    '5534999993002',
                },
              ],
            },
          });

        expect(
          clients,
        ).toHaveLength(
          1,
        );

        expect(
          clients[0].phone,
        ).toBe(
          '34999993002',
        );

        const appointments =
          await prisma.appointment.findMany({
            where: {
              tenantId,

              clientId:
                clients[0].id,
            },
          });

        expect(
          appointments,
        ).toHaveLength(
          2,
        );
      },
    );

    it(
      'reutiliza cliente antigo salvo com código 55',
      async () => {
        const legacyClient =
          await prisma.client.create({
            data: {
              tenantId,

              name:
                'Cliente Legado',

              phone:
                '5534999993003',

              active:
                true,
            },
          });

        const response =
          await createPublicAppointment(
            employeeAId,
            '09:00',
            '(34) 99999-3003',
          );

        expect(
          response.status,
        ).toBe(
          201,
        );

        const clients =
          await prisma.client.findMany({
            where: {
              tenantId,

              OR: [
                {
                  phone:
                    '34999993003',
                },
                {
                  phone:
                    '5534999993003',
                },
              ],
            },
          });

        expect(
          clients,
        ).toHaveLength(
          1,
        );

        expect(
          clients[0].id,
        ).toBe(
          legacyClient.id,
        );

        expect(
          clients[0].phone,
        ).toBe(
          '5534999993003',
        );

        const appointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                response.body.id,
            },
          });

        expect(
          appointment,
        ).toBeTruthy();

        expect(
          appointment!.clientId,
        ).toBe(
          legacyClient.id,
        );
      },
    );

    it(
      'rejeita caracteres inválidos no telefone',
      async () => {
        const response =
          await createPublicAppointment(
            employeeAId,
            '09:30',
            '34abc99993333',
          );

        expect(
          response.status,
        ).toBe(
          400,
        );

        const clients =
          await prisma.client.findMany({
            where: {
              tenantId,
            },
          });

        expect(
          clients,
        ).toHaveLength(
          0,
        );
      },
    );

    it(
      'rejeita telefone nacional inválido',
      async () => {
        const response =
          await createPublicAppointment(
            employeeAId,
            '10:00',
            '03499999333',
          );

        expect(
          response.status,
        ).toBe(
          400,
        );

        expect(
          response.body.message,
        ).toBe(
          'Telefone inválido',
        );
      },
    );

    it(
      'trata telefone nacional e telefone com +55 como o mesmo cliente em requisições simultâneas',
      async () => {
        const [
          responseA,
          responseB,
        ] =
          await Promise.all([
            createPublicAppointment(
              employeeAId,
              '11:00',
              '(34) 99999-3004',
              'Cliente Concorrente',
            ),

            createPublicAppointment(
              employeeBId,
              '11:00',
              '+55 (34) 99999-3004',
              'Cliente Concorrente',
            ),
          ]);

        const statuses = [
          responseA.status,
          responseB.status,
        ].sort(
          (a, b) =>
            a - b,
        );

        expect(
          statuses,
        ).toEqual([
          201,
          409,
        ]);

        const clients =
          await prisma.client.findMany({
            where: {
              tenantId,

              OR: [
                {
                  phone:
                    '34999993004',
                },
                {
                  phone:
                    '5534999993004',
                },
              ],
            },
          });

        expect(
          clients,
        ).toHaveLength(
          1,
        );

        expect(
          clients[0].phone,
        ).toBe(
          '34999993004',
        );

        const appointments =
          await prisma.appointment.findMany({
            where: {
              tenantId,

              clientId:
                clients[0].id,

              status: {
                in: [
                  'PENDING',
                  'CONFIRMED',
                ],
              },
            },
          });

        expect(
          appointments,
        ).toHaveLength(
          1,
        );
      },
      10000,
    );
  },
);