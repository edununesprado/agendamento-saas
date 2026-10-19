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
  'Agendamento público - consultas (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;

    let tenantSlug: string;
    let serviceId: string;
    let inactiveServiceId: string;
    let employeeId: string;
    let unrelatedEmployeeId: string;

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.public.booking.e2e@teste.com';

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

        const registerResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/auth/register',
            )
            .send({
              name:
                'Owner Public Booking E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Public Booking E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login();

        /*
         * Descobre o slug real criado
         * pelo cadastro da empresa.
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

        /*
         * Serviço ativo.
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
                'Corte Público E2E',

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
         * Serviço que será desativado.
         * Ele não deve aparecer publicamente.
         */
        const inactiveServiceResponse =
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
                'Serviço Inativo Público E2E',

              durationMin:
                60,

              priceCents:
                8000,
            });

        expect(
          inactiveServiceResponse.status,
        ).toBe(201);

        inactiveServiceId =
          inactiveServiceResponse.body.id;

        const deactivateServiceResponse =
          await request(
            app.getHttpServer(),
          )
            .delete(
              `/services/${inactiveServiceId}`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

        expect(
          deactivateServiceResponse.status,
        ).toBe(200);

        /*
         * Funcionário que realiza
         * o serviço público.
         *
         * Colocamos email e telefone
         * justamente para verificar depois
         * que esses dados não vazam.
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
                'Carlos Público E2E',

              email:
                'carlos.publico.e2e@teste.com',

              phone:
                '34999991111',
            });

        expect(
          employeeResponse.status,
        ).toBe(201);

        employeeId =
          employeeResponse.body.id;

        /*
         * Segundo funcionário.
         *
         * Ele não será vinculado
         * ao serviço e portanto não
         * deve aparecer na consulta pública.
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
                'Funcionário Sem Serviço E2E',

              email:
                'sem.servico.e2e@teste.com',

              phone:
                '34999992222',
            });

        expect(
          unrelatedEmployeeResponse.status,
        ).toBe(201);

        unrelatedEmployeeId =
          unrelatedEmployeeResponse.body.id;

        /*
         * Vincula o serviço somente
         * ao primeiro funcionário.
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
         * 20/10/2026 é terça-feira.
         *
         * Configuramos 08:00 até 10:00.
         * Serviço de 30 minutos.
         *
         * Esperamos:
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
      'permite consultar empresa pública sem token',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantSlug}`,
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.slug,
        ).toBe(
          tenantSlug,
        );

        /*
         * O id interno do tenant
         * não precisa ser exposto.
         */
        expect(
          response.body.id,
        ).toBeUndefined();
      },
    );

    it(
      'retorna 404 para slug inexistente',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            '/public/tenants/empresa-que-nao-existe-e2e',
          );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'lista somente serviços ativos sem token',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantSlug}/services`,
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          Array.isArray(
            response.body,
          ),
        ).toBe(true);

        const ids =
          response.body.map(
            (
              service: {
                id: string;
              },
            ) =>
              service.id,
          );

        expect(
          ids,
        ).toContain(
          serviceId,
        );

        expect(
          ids,
        ).not.toContain(
          inactiveServiceId,
        );
      },
    );

    it(
      'lista somente funcionários vinculados ao serviço e não expõe dados privados',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantSlug}/employees?serviceId=${serviceId}`,
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          Array.isArray(
            response.body,
          ),
        ).toBe(true);

        const ids =
          response.body.map(
            (
              employee: {
                id: string;
              },
            ) =>
              employee.id,
          );

        expect(
          ids,
        ).toContain(
          employeeId,
        );

        expect(
          ids,
        ).not.toContain(
          unrelatedEmployeeId,
        );

        const employee =
          response.body.find(
            (
              item: {
                id: string;
              },
            ) =>
              item.id ===
              employeeId,
          );

        expect(
          employee,
        ).toBeTruthy();

        expect(
          employee.name,
        ).toBe(
          'Carlos Público E2E',
        );

        expect(
          employee.email,
        ).toBeUndefined();

        expect(
          employee.phone,
        ).toBeUndefined();

        expect(
          employee.tenantId,
        ).toBeUndefined();

        expect(
          employee.membershipId,
        ).toBeUndefined();
      },
    );

    it(
      'exige serviceId para listar funcionários públicos',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantSlug}/employees`,
          );

        expect(
          response.status,
        ).toBe(400);
      },
    );

    it(
      'consulta disponibilidade pública sem token',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantSlug}/availability`,
          )
            .query({
              employeeId,
              serviceId,
              date:
                '2026-10-20',
            });

        expect(
          response.status,
        ).toBe(200);

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

        expect(
          response.body.slots,
        ).toEqual([
          '08:00',
          '08:30',
          '09:00',
          '09:30',
        ]);
      },
    );

    it(
      'rejeita data pública fora do formato YYYY-MM-DD',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantSlug}/availability`,
          )
            .query({
              employeeId,
              serviceId,
              date:
                '20-10-2026',
            });

        expect(
          response.status,
        ).toBe(400);
      },
    );

    it(
      'retorna 404 quando serviço público não pertence à empresa',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantSlug}/employees`,
          )
            .query({
              serviceId:
                'servico-inexistente-e2e',
            });

        expect(
          response.status,
        ).toBe(404);
      },
    );
  },
);