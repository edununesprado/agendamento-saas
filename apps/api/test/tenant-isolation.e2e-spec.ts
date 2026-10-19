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

type TenantData = {
  id: string;
  slug: string;
};

describe(
  'Isolamento multi-tenant (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let tokenA: string;
    let tokenB: string;

    let tenantA: TenantData;
    let tenantB: TenantData;

    let serviceAId: string;
    let serviceBId: string;

    let clientAId: string;
    let clientBId: string;

    let employeeAId: string;
    let employeeBId: string;

    let appointmentAId: string;
    let appointmentBId: string;

    const password =
      'Teste@12345';

    const emailA =
      'owner.tenant.a.e2e@teste.com';

    const emailB =
      'owner.tenant.b.e2e@teste.com';

    async function login(
      email: string,
    ) {
      const response =
        await request(
          app.getHttpServer(),
        )
          .post('/auth/login')
          .send({
            email,
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

    async function getCurrentTenant(
      token: string,
    ) {
      const response =
        await request(
          app.getHttpServer(),
        )
          .get('/tenants/current')
          .set(
            'Authorization',
            `Bearer ${token}`,
          );

      expect(
        response.status,
      ).toBe(200);

      return {
        id:
          response.body.id,

        slug:
          response.body.slug,
      } as TenantData;
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
         * EMPRESA A
         */
        const registerA =
          await request(
            app.getHttpServer(),
          )
            .post('/auth/register')
            .send({
              name:
                'Owner Tenant A',

              email:
                emailA,

              password,

              companyName:
                'Empresa Tenant A',
            });

        expect(
          registerA.status,
        ).toBe(201);

        /*
         * EMPRESA B
         */
        const registerB =
          await request(
            app.getHttpServer(),
          )
            .post('/auth/register')
            .send({
              name:
                'Owner Tenant B',

              email:
                emailB,

              password,

              companyName:
                'Empresa Tenant B',
            });

        expect(
          registerB.status,
        ).toBe(201);

        tokenA =
          await login(
            emailA,
          );

        tokenB =
          await login(
            emailB,
          );

        tenantA =
          await getCurrentTenant(
            tokenA,
          );

        tenantB =
          await getCurrentTenant(
            tokenB,
          );

        expect(
          tenantA.id,
        ).not.toBe(
          tenantB.id,
        );

        /*
         * SERVIÇOS
         */
        const serviceA =
          await request(
            app.getHttpServer(),
          )
            .post('/services')
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            )
            .send({
              name:
                'Serviço Tenant A',

              durationMin:
                30,

              priceCents:
                5000,
            });

        expect(
          serviceA.status,
        ).toBe(201);

        serviceAId =
          serviceA.body.id;

        const serviceB =
          await request(
            app.getHttpServer(),
          )
            .post('/services')
            .set(
              'Authorization',
              `Bearer ${tokenB}`,
            )
            .send({
              name:
                'Serviço Tenant B',

              durationMin:
                60,

              priceCents:
                9000,
            });

        expect(
          serviceB.status,
        ).toBe(201);

        serviceBId =
          serviceB.body.id;

        /*
         * CLIENTES
         */
        const clientA =
          await request(
            app.getHttpServer(),
          )
            .post('/clients')
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            )
            .send({
              name:
                'Cliente Tenant A',

              phone:
                '34999990001',
            });

        expect(
          clientA.status,
        ).toBe(201);

        clientAId =
          clientA.body.id;

        const clientB =
          await request(
            app.getHttpServer(),
          )
            .post('/clients')
            .set(
              'Authorization',
              `Bearer ${tokenB}`,
            )
            .send({
              name:
                'Cliente Tenant B',

              phone:
                '34999990002',
            });

        expect(
          clientB.status,
        ).toBe(201);

        clientBId =
          clientB.body.id;

        /*
         * FUNCIONÁRIOS
         */
        const employeeA =
          await request(
            app.getHttpServer(),
          )
            .post('/employees')
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            )
            .send({
              name:
                'Funcionário Tenant A',

              email:
                'funcionario.a@teste.com',

              phone:
                '34999991111',
            });

        expect(
          employeeA.status,
        ).toBe(201);

        employeeAId =
          employeeA.body.id;

        const employeeB =
          await request(
            app.getHttpServer(),
          )
            .post('/employees')
            .set(
              'Authorization',
              `Bearer ${tokenB}`,
            )
            .send({
              name:
                'Funcionário Tenant B',

              email:
                'funcionario.b@teste.com',

              phone:
                '34999992222',
            });

        expect(
          employeeB.status,
        ).toBe(201);

        employeeBId =
          employeeB.body.id;

        /*
         * Agendamentos criados
         * diretamente como fixtures.
         *
         * O objetivo deste teste não é
         * testar disponibilidade, mas
         * isolamento entre tenants.
         */
        const appointmentA =
          await prisma.appointment.create({
            data: {
              tenantId:
                tenantA.id,

              employeeId:
                employeeAId,

              serviceId:
                serviceAId,

              clientId:
                clientAId,

              startsAt:
                new Date(
                  '2026-10-20T12:00:00.000Z',
                ),

              endsAt:
                new Date(
                  '2026-10-20T12:30:00.000Z',
                ),

              durationMin:
                30,

              priceCents:
                5000,

              status:
                'PENDING',
            },
          });

        appointmentAId =
          appointmentA.id;

        const appointmentB =
          await prisma.appointment.create({
            data: {
              tenantId:
                tenantB.id,

              employeeId:
                employeeBId,

              serviceId:
                serviceBId,

              clientId:
                clientBId,

              startsAt:
                new Date(
                  '2026-10-20T15:00:00.000Z',
                ),

              endsAt:
                new Date(
                  '2026-10-20T16:00:00.000Z',
                ),

              durationMin:
                60,

              priceCents:
                9000,

              status:
                'PENDING',
            },
          });

        appointmentBId =
          appointmentB.id;
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

    /*
     * SERVICES
     */

    it(
      'listas de serviços não misturam empresas',
      async () => {
        const responseA =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/services?status=all',
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        const responseB =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/services?status=all',
            )
            .set(
              'Authorization',
              `Bearer ${tokenB}`,
            );

        expect(
          responseA.status,
        ).toBe(200);

        expect(
          responseB.status,
        ).toBe(200);

        const idsA =
          responseA.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        const idsB =
          responseB.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        expect(
          idsA,
        ).toContain(
          serviceAId,
        );

        expect(
          idsA,
        ).not.toContain(
          serviceBId,
        );

        expect(
          idsB,
        ).toContain(
          serviceBId,
        );

        expect(
          idsB,
        ).not.toContain(
          serviceAId,
        );
      },
    );

    it(
      'Empresa A não consulta serviço da Empresa B por ID',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/services/${serviceBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa B não consulta serviço da Empresa A por ID',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/services/${serviceAId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenB}`,
            );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa A não altera serviço da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/services/${serviceBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            )
            .send({
              name:
                'Tentativa Indevida',
            });

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa A não exclui serviço da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .delete(
              `/services/${serviceBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    /*
     * CLIENTS
     */

    it(
      'listas de clientes não misturam empresas',
      async () => {
        const responseA =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/clients?status=all',
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        const responseB =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/clients?status=all',
            )
            .set(
              'Authorization',
              `Bearer ${tokenB}`,
            );

        expect(
          responseA.status,
        ).toBe(200);

        expect(
          responseB.status,
        ).toBe(200);

        const idsA =
          responseA.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        const idsB =
          responseB.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        expect(
          idsA,
        ).toContain(
          clientAId,
        );

        expect(
          idsA,
        ).not.toContain(
          clientBId,
        );

        expect(
          idsB,
        ).toContain(
          clientBId,
        );

        expect(
          idsB,
        ).not.toContain(
          clientAId,
        );
      },
    );

    it(
      'Empresa A não consulta cliente da Empresa B por ID',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/clients/${clientBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa A não altera cliente da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/clients/${clientBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            )
            .send({
              name:
                'Cliente Invadido',
            });

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa A não exclui cliente da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .delete(
              `/clients/${clientBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    /*
     * EMPLOYEES
     */

    it(
      'listas de funcionários não misturam empresas',
      async () => {
        const responseA =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/employees?status=all',
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        const responseB =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/employees?status=all',
            )
            .set(
              'Authorization',
              `Bearer ${tokenB}`,
            );

        expect(
          responseA.status,
        ).toBe(200);

        expect(
          responseB.status,
        ).toBe(200);

        const idsA =
          responseA.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        const idsB =
          responseB.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        expect(
          idsA,
        ).toContain(
          employeeAId,
        );

        expect(
          idsA,
        ).not.toContain(
          employeeBId,
        );

        expect(
          idsB,
        ).toContain(
          employeeBId,
        );

        expect(
          idsB,
        ).not.toContain(
          employeeAId,
        );
      },
    );

    it(
      'Empresa A não consulta funcionário da Empresa B por ID',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/employees/${employeeBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa A não altera funcionário da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/employees/${employeeBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            )
            .send({
              name:
                'Funcionário Invadido',
            });

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa A não exclui funcionário da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .delete(
              `/employees/${employeeBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    /*
     * APPOINTMENTS
     */

    it(
      'listas de agendamentos não misturam empresas',
      async () => {
        const responseA =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/appointments?date=2026-10-20',
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        const responseB =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/appointments?date=2026-10-20',
            )
            .set(
              'Authorization',
              `Bearer ${tokenB}`,
            );

        expect(
          responseA.status,
        ).toBe(200);

        expect(
          responseB.status,
        ).toBe(200);

        const idsA =
          responseA.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        const idsB =
          responseB.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        expect(
          idsA,
        ).toContain(
          appointmentAId,
        );

        expect(
          idsA,
        ).not.toContain(
          appointmentBId,
        );

        expect(
          idsB,
        ).toContain(
          appointmentBId,
        );

        expect(
          idsB,
        ).not.toContain(
          appointmentAId,
        );
      },
    );

    it(
      'Empresa A não consulta agendamento da Empresa B por ID',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/appointments/${appointmentBId}`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            );

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa A não altera status de agendamento da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${appointmentBId}/status`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            )
            .send({
              status:
                'CONFIRMED',
            });

        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'Empresa A não cancela agendamento da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${appointmentBId}/cancel`,
            )
            .set(
              'Authorization',
              `Bearer ${tokenA}`,
            )
            .send({
              reason:
                'Tentativa indevida',
            });

        expect(
          response.status,
        ).toBe(404);
      },
    );

    /*
     * PUBLIC BOOKING
     */

    it(
      'catálogo público da Empresa A não expõe serviço da Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantA.slug}/services`,
          );

        expect(
          response.status,
        ).toBe(200);

        const ids =
          response.body.map(
            (
              item: {
                id: string;
              },
            ) =>
              item.id,
          );

        expect(
          ids,
        ).toContain(
          serviceAId,
        );

        expect(
          ids,
        ).not.toContain(
          serviceBId,
        );
      },
    );

    it(
      'Empresa A pública rejeita serviceId pertencente à Empresa B',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantA.slug}/employees?serviceId=${serviceBId}`,
          );

        expect(
          response.status,
        ).toBe(404);
      },
    );
  },
);