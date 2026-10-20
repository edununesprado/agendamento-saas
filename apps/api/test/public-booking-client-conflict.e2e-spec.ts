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
  'Agendamento público - conflito do cliente (E2E)',
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
      'owner.public.client.conflict@teste.com';

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
        response.body
          .accessToken,
      ).toBeTruthy();

      return (
        response.body as LoginResponse
      ).accessToken;
    }

    async function createPublicAppointment(
      employeeId: string,
      time: string,
      phone: string,
      name = 'Cliente E2E',
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
         * Usa uma data sempre futura
         * e dentro da janela configurada.
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
            'Não foi possível gerar a data dos testes',
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
                'Owner Client Conflict E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Client Conflict E2E',
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
         * Facilita os testes:
         * sem antecedência mínima e
         * janela pública de 30 dias.
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
         * Serviço de 60 minutos.
         *
         * Assim conseguimos testar
         * sobreposição, por exemplo:
         *
         * 08:00 - 09:00
         * 08:30 - 09:30
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
                'Serviço Client Conflict E2E',

              durationMin:
                60,

              priceCents:
                7000,
            });

        expect(
          serviceResponse.status,
        ).toBe(
          201,
        );

        serviceId =
          serviceResponse.body.id;

        /*
         * Profissional A.
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
                'Profissional A Client Conflict',

              email:
                'profissional.a.client.conflict@teste.com',

              phone:
                '34999991001',
            });

        expect(
          employeeAResponse.status,
        ).toBe(
          201,
        );

        employeeAId =
          employeeAResponse.body.id;

        /*
         * Profissional B.
         */
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
                'Profissional B Client Conflict',

              email:
                'profissional.b.client.conflict@teste.com',

              phone:
                '34999991002',
            });

        expect(
          employeeBResponse.status,
        ).toBe(
          201,
        );

        employeeBId =
          employeeBResponse.body.id;

        /*
         * Os dois profissionais
         * realizam o mesmo serviço.
         */
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

          /*
           * Disponibilidade:
           * 08:00 até 13:00.
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
        /*
         * Cada teste começa sem
         * agendamentos nem clientes.
         */
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
      'bloqueia o mesmo cliente no mesmo horário com outro profissional',
      async () => {
        const phone =
          '34999992001';

        const first =
          await createPublicAppointment(
            employeeAId,
            '08:00',
            phone,
          );

        expect(
          first.status,
        ).toBe(
          201,
        );

        const second =
          await createPublicAppointment(
            employeeBId,
            '08:00',
            phone,
          );

        expect(
          second.status,
        ).toBe(
          409,
        );

        expect(
          second.body.message,
        ).toBe(
          'Você já possui um agendamento neste horário',
        );
      },
    );

    it(
      'bloqueia horários sobrepostos do mesmo cliente',
      async () => {
        const phone =
          '34999992002';

        const first =
          await createPublicAppointment(
            employeeAId,
            '08:00',
            phone,
          );

        expect(
          first.status,
        ).toBe(
          201,
        );

        /*
         * Serviço dura 60 minutos.
         *
         * Primeiro:
         * 08:00 - 09:00
         *
         * Segundo:
         * 08:30 - 09:30
         */
        const second =
          await createPublicAppointment(
            employeeBId,
            '08:30',
            phone,
          );

        expect(
          second.status,
        ).toBe(
          409,
        );

        expect(
          second.body.message,
        ).toBe(
          'Você já possui um agendamento neste horário',
        );
      },
    );

    it(
      'permite outro horário quando não existe sobreposição',
      async () => {
        const phone =
          '34999992003';

        const first =
          await createPublicAppointment(
            employeeAId,
            '08:00',
            phone,
          );

        expect(
          first.status,
        ).toBe(
          201,
        );

        /*
         * O primeiro termina às 09:00.
         * Começar exatamente às 09:00
         * não é sobreposição.
         */
        const second =
          await createPublicAppointment(
            employeeBId,
            '09:00',
            phone,
          );

        expect(
          second.status,
        ).toBe(
          201,
        );

        const appointments =
          await prisma.appointment.findMany({
            where: {
              tenantId,

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
          2,
        );
      },
    );

    it(
      'permite novo agendamento quando o anterior está cancelado',
      async () => {
        const phone =
          '34999992004';

        const first =
          await createPublicAppointment(
            employeeAId,
            '08:00',
            phone,
          );

        expect(
          first.status,
        ).toBe(
          201,
        );

        const cancelResponse =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${first.body.id}/cancel`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              reason:
                'Cancelamento do teste',
            });

        expect(
          cancelResponse.status,
        ).toBe(
          200,
        );

        expect(
          cancelResponse.body.status,
        ).toBe(
          'CANCELED',
        );

        /*
         * Sobreporia o antigo,
         * mas ele está cancelado.
         */
        const second =
          await createPublicAppointment(
            employeeBId,
            '08:30',
            phone,
          );

        expect(
          second.status,
        ).toBe(
          201,
        );
      },
    );

    it(
      'permite clientes diferentes no mesmo horário com profissionais diferentes',
      async () => {
        const first =
          await createPublicAppointment(
            employeeAId,
            '10:00',
            '34999992005',
            'Cliente A',
          );

        const second =
          await createPublicAppointment(
            employeeBId,
            '10:00',
            '34999992006',
            'Cliente B',
          );

        expect(
          first.status,
        ).toBe(
          201,
        );

        expect(
          second.status,
        ).toBe(
          201,
        );
      },
    );

    it(
      'serializa duas solicitações simultâneas do mesmo cliente',
      async () => {
        const phone =
          '34999992007';

        const [
          responseA,
          responseB,
        ] =
          await Promise.all([
            createPublicAppointment(
              employeeAId,
              '11:00',
              phone,
              'Cliente Concorrente',
            ),

            createPublicAppointment(
              employeeBId,
              '11:00',
              phone,
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
              phone,
            },
          });

        expect(
          clients,
        ).toHaveLength(
          1,
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