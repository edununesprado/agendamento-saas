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
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

describe(
  'Agendamento público - criação (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;

    let tenantId: string;
    let tenantSlug: string;

    let serviceId: string;
    let employeeId: string;
    let unrelatedEmployeeId: string;

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.public.create.e2e@teste.com';

    async function login() {
      const response =
        await request(
          app.getHttpServer(),
        )
          .post('/auth/login')
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
            whitelist: true,
            transform: true,
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
                'Owner Public Create E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Public Create E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login();

        /*
         * Descobre o slug da empresa.
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
        ).toBe(200);

        tenantSlug =
          tenantResponse.body.slug;

        const tenant =
          await prisma.tenant.findUnique({
            where: {
              slug:
                tenantSlug,
            },

            select: {
              id: true,
            },
          });

        expect(
          tenant,
        ).toBeTruthy();

        tenantId =
          tenant!.id;

        /*
         * Serviço público.
         */
        const serviceResponse =
          await request(
            app.getHttpServer(),
          )
            .post('/services')
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              name:
                'Corte Público Create E2E',

              durationMin:
                30,

              priceCents:
                5000,
            });

        expect(
          serviceResponse.status,
        ).toBe(201);

        serviceId =
          serviceResponse.body.id;

        /*
         * Profissional que realiza
         * o serviço.
         */
        const employeeResponse =
          await request(
            app.getHttpServer(),
          )
            .post('/employees')
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              name:
                'Carlos Create E2E',

              email:
                'carlos.create.e2e@teste.com',

              phone:
                '34999990001',
            });

        expect(
          employeeResponse.status,
        ).toBe(201);

        employeeId =
          employeeResponse.body.id;

        /*
         * Profissional ativo, mas que
         * NÃO realiza esse serviço.
         */
        const unrelatedEmployeeResponse =
          await request(
            app.getHttpServer(),
          )
            .post('/employees')
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              name:
                'Funcionário Sem Serviço Create E2E',

              email:
                'sem.servico.create.e2e@teste.com',

              phone:
                '34999990002',
            });

        expect(
          unrelatedEmployeeResponse.status,
        ).toBe(201);

        unrelatedEmployeeId =
          unrelatedEmployeeResponse.body.id;

        /*
         * Vincula o serviço ao Carlos.
         */
        const linkServiceResponse =
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
          linkServiceResponse.status,
        ).toBe(200);

        /*
         * 20/10/2026 = terça-feira.
         *
         * Disponibilidade:
         * 08:00
         * 08:30
         * 09:00
         * 09:30
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
                    'TUESDAY',

                  intervals: [
                    {
                      start:
                        '08:00',

                      end:
                        '10:00',
                    },
                  ],
                },
              ],
            });

        expect(
          availabilityResponse.status,
        ).toBe(200);
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
      'cria agendamento público sem token como PENDING',
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
                '2026-10-20T08:00:00-03:00',

              client: {
                name:
                  'Maria Pública E2E',

                phone:
                  '(34) 99999-3333',

                email:
                  'MARIA.PUBLICA@TESTE.COM',
              },

              notes:
                'Agendamento pelo site',
            });

        expect(
          response.status,
        ).toBe(201);

        expect(
          response.body.status,
        ).toBe(
          'PENDING',
        );

        expect(
          response.body.employee.id,
        ).toBe(
          employeeId,
        );

        expect(
          response.body.service.id,
        ).toBe(
          serviceId,
        );

        /*
         * Dados pessoais do cliente
         * não devem voltar publicamente.
         */
        expect(
          response.body.client,
        ).toBeUndefined();

        expect(
          response.body.clientId,
        ).toBeUndefined();

        const client =
          await prisma.client.findFirst({
            where: {
              tenantId,

              phone:
                '34999993333',
            },
          });

        expect(
          client,
        ).toBeTruthy();

        expect(
          client!.name,
        ).toBe(
          'Maria Pública E2E',
        );

        expect(
          client!.email,
        ).toBe(
          'maria.publica@teste.com',
        );

        expect(
          client!.active,
        ).toBe(true);

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
          appointment!.status,
        ).toBe(
          'PENDING',
        );

        expect(
          appointment!.clientId,
        ).toBe(
          client!.id,
        );
      },
    );

    it(
      'reutiliza cliente ativo pelo telefone sem sobrescrever seus dados',
      async () => {
        const before =
          await prisma.client.findMany({
            where: {
              tenantId,

              phone:
                '34999993333',
            },
          });

        expect(
          before,
        ).toHaveLength(1);

        const originalClient =
          before[0];

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
                '2026-10-20T08:30:00-03:00',

              client: {
                name:
                  'Nome Que Não Deve Sobrescrever',

                phone:
                  '34 99999-3333',

                email:
                  'outro.email@teste.com',
              },
            });

        expect(
          response.status,
        ).toBe(201);

        const clients =
          await prisma.client.findMany({
            where: {
              tenantId,

              phone:
                '34999993333',
            },
          });

        expect(
          clients,
        ).toHaveLength(1);

        expect(
          clients[0].id,
        ).toBe(
          originalClient.id,
        );

        expect(
          clients[0].name,
        ).toBe(
          'Maria Pública E2E',
        );

        expect(
          clients[0].email,
        ).toBe(
          'maria.publica@teste.com',
        );

        const appointments =
          await prisma.appointment.findMany({
            where: {
              tenantId,

              clientId:
                originalClient.id,
            },
          });

        expect(
          appointments,
        ).toHaveLength(2);
      },
    );

    it(
      'rejeita horário que já está ocupado',
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
                '2026-10-20T08:00:00-03:00',

              client: {
                name:
                  'Outro Cliente E2E',

                phone:
                  '34999994444',
              },
            });

        expect(
          response.status,
        ).toBe(409);
      },
    );

    it(
      'impede duas reservas simultâneas para o mesmo horário',
      async () => {
        const bodyA = {
          employeeId,
          serviceId,

          startsAt:
            '2026-10-20T09:00:00-03:00',

          client: {
            name:
              'Concorrente A E2E',

            phone:
              '34999995551',
          },
        };

        const bodyB = {
          employeeId,
          serviceId,

          startsAt:
            '2026-10-20T09:00:00-03:00',

          client: {
            name:
              'Concorrente B E2E',

            phone:
              '34999995552',
          },
        };

        const [
          responseA,
          responseB,
        ] =
          await Promise.all([
            request(
              app.getHttpServer(),
            )
              .post(
                `/public/tenants/${tenantSlug}/appointments`,
              )
              .send(
                bodyA,
              ),

            request(
              app.getHttpServer(),
            )
              .post(
                `/public/tenants/${tenantSlug}/appointments`,
              )
              .send(
                bodyB,
              ),
          ]);

        const statuses = [
          responseA.status,
          responseB.status,
        ].sort(
          (a, b) =>
            a - b,
        );

        /*
         * Uma requisição vence.
         * A outra recebe conflito.
         */
        expect(
          statuses,
        ).toEqual([
          201,
          409,
        ]);

        const appointments =
          await prisma.appointment.findMany({
            where: {
              tenantId,
              employeeId,

              startsAt:
                new Date(
                  '2026-10-20T12:00:00.000Z',
                ),

              status: {
                not:
                  'CANCELED',
              },
            },
          });

        expect(
          appointments,
        ).toHaveLength(1);
      },
      10000,
    );

    it(
      'rejeita telefone inválido',
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
                '2026-10-20T09:30:00-03:00',

              client: {
                name:
                  'Telefone Inválido E2E',

                phone:
                  '123',
              },
            });

        expect(
          response.status,
        ).toBe(400);
      },
    );

    it(
      'rejeita agendamento em horário passado',
      async () => {
        const pastDate =
          new Date(
            Date.now() -
              60 * 60 * 1000,
          ).toISOString();

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
                pastDate,

              client: {
                name:
                  'Cliente Passado E2E',

                phone:
                  '34999996666',
              },
            });

        expect(
          response.status,
        ).toBe(400);
      },
    );

    it(
      'rejeita profissional que não realiza o serviço',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .post(
              `/public/tenants/${tenantSlug}/appointments`,
            )
            .send({
              employeeId:
                unrelatedEmployeeId,

              serviceId,

              startsAt:
                '2026-10-20T09:30:00-03:00',

              client: {
                name:
                  'Cliente Sem Vínculo E2E',

                phone:
                  '34999997777',
              },
            });

        expect(
          response.status,
        ).toBe(400);
      },
    );

    it(
      'retorna 404 ao tentar agendar em empresa inexistente',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/public/tenants/empresa-inexistente-create-e2e/appointments',
            )
            .send({
              employeeId,
              serviceId,

              startsAt:
                '2026-10-20T09:30:00-03:00',

              client: {
                name:
                  'Cliente Empresa Inexistente',

                phone:
                  '34999998888',
              },
            });

        expect(
          response.status,
        ).toBe(404);
      },
    );
  },
);