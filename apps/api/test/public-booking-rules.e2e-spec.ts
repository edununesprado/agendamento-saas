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
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

type TenantResponse = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  bookingMinAdvanceMinutes: number;
  bookingMaxAdvanceDays: number;
};

describe(
  'Regras configuráveis do agendamento público (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerAToken: string;
    let ownerBToken: string;

    let tenantASlug: string;
    let tenantBSlug: string;

    const password =
      'Teste@12345';

    const timezone =
      'America/Sao_Paulo';

    /*
     * IDs válidos apenas para requisições
     * que devem ser bloqueadas pelas regras
     * antes de consultar funcionário/serviço.
     */
    const fakeEmployeeId =
      '11111111-1111-4111-8111-111111111111';

    const fakeServiceId =
      '22222222-2222-4222-8222-222222222222';

    function getMessage(
      body: {
        message?: string | string[];
      },
    ) {
      if (
        Array.isArray(
          body.message,
        )
      ) {
        return body.message.join(
          ', ',
        );
      }

      return (
        body.message ??
        ''
      );
    }

    async function registerAndLogin(
      name: string,
      email: string,
      companyName: string,
    ) {
      const registerResponse =
        await request(
          app.getHttpServer(),
        )
          .post(
            '/auth/register',
          )
          .send({
            name,
            email,
            password,
            companyName,
          });

      expect(
        registerResponse.status,
      ).toBe(
        201,
      );

      const loginResponse =
        await request(
          app.getHttpServer(),
        )
          .post(
            '/auth/login',
          )
          .send({
            email,
            password,
          });

      expect(
        [200, 201],
      ).toContain(
        loginResponse.status,
      );

      expect(
        loginResponse.body
          .accessToken,
      ).toBeTruthy();

      return (
        loginResponse.body as LoginResponse
      ).accessToken;
    }

    async function getCurrentTenant(
      token: string,
    ) {
      const response =
        await request(
          app.getHttpServer(),
        )
          .get(
            '/tenants/current',
          )
          .set(
            'Authorization',
            `Bearer ${token}`,
          );

      expect(
        response.status,
      ).toBe(
        200,
      );

      return (
        response.body as TenantResponse
      );
    }

    async function updateBookingRules(
      token: string,
      bookingMinAdvanceMinutes: number,
      bookingMaxAdvanceDays: number,
    ) {
      const response =
        await request(
          app.getHttpServer(),
        )
          .patch(
            '/tenants/current',
          )
          .set(
            'Authorization',
            `Bearer ${token}`,
          )
          .send({
            bookingMinAdvanceMinutes,
            bookingMaxAdvanceDays,
          });

      expect(
        response.status,
      ).toBe(
        200,
      );

      expect(
        response.body
          .bookingMinAdvanceMinutes,
      ).toBe(
        bookingMinAdvanceMinutes,
      );

      expect(
        response.body
          .bookingMaxAdvanceDays,
      ).toBe(
        bookingMaxAdvanceDays,
      );
    }

    beforeAll(
      async () => {
        /*
         * Proteção para garantir que nunca
         * executaremos limpeza no banco normal.
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

        /*
         * Banco exclusivo de testes.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * Empresa A.
         */
        ownerAToken =
          await registerAndLogin(
            'Owner Empresa A',
            'owner.booking.rules.a@teste.com',
            'Empresa Regras A',
          );

        const tenantA =
          await getCurrentTenant(
            ownerAToken,
          );

        tenantASlug =
          tenantA.slug;

        /*
         * Empresa A:
         *
         * mínimo: 180 minutos
         * máximo: 2 dias
         */
        await updateBookingRules(
          ownerAToken,
          180,
          2,
        );

        /*
         * Empresa B.
         */
        ownerBToken =
          await registerAndLogin(
            'Owner Empresa B',
            'owner.booking.rules.b@teste.com',
            'Empresa Regras B',
          );

        const tenantB =
          await getCurrentTenant(
            ownerBToken,
          );

        tenantBSlug =
          tenantB.slug;

        /*
         * Empresa B:
         *
         * mínimo: 30 minutos
         * máximo: 30 dias
         */
        await updateBookingRules(
          ownerBToken,
          30,
          30,
        );
      },
      30000,
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
      'mantém regras diferentes para empresas diferentes',
      async () => {
        const tenantA =
          await getCurrentTenant(
            ownerAToken,
          );

        const tenantB =
          await getCurrentTenant(
            ownerBToken,
          );

        expect(
          tenantA
            .bookingMinAdvanceMinutes,
        ).toBe(
          180,
        );

        expect(
          tenantA
            .bookingMaxAdvanceDays,
        ).toBe(
          2,
        );

        expect(
          tenantB
            .bookingMinAdvanceMinutes,
        ).toBe(
          30,
        );

        expect(
          tenantB
            .bookingMaxAdvanceDays,
        ).toBe(
          30,
        );
      },
    );

    it(
      'expõe as regras específicas de cada empresa na API pública',
      async () => {
        const responseA =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantASlug}`,
          );

        expect(
          responseA.status,
        ).toBe(
          200,
        );

        expect(
          responseA.body
            .bookingMinAdvanceMinutes,
        ).toBe(
          180,
        );

        expect(
          responseA.body
            .bookingMaxAdvanceDays,
        ).toBe(
          2,
        );

        const responseB =
          await request(
            app.getHttpServer(),
          ).get(
            `/public/tenants/${tenantBSlug}`,
          );

        expect(
          responseB.status,
        ).toBe(
          200,
        );

        expect(
          responseB.body
            .bookingMinAdvanceMinutes,
        ).toBe(
          30,
        );

        expect(
          responseB.body
            .bookingMaxAdvanceDays,
        ).toBe(
          30,
        );
      },
    );

    it(
      'rejeita disponibilidade acima do limite personalizado da empresa',
      async () => {
        /*
         * Empresa A permite somente
         * até 2 dias à frente.
         *
         * Consultamos 3 dias à frente.
         */
        const date =
          DateTime.now()
            .setZone(
              timezone,
            )
            .plus({
              days: 3,
            })
            .toISODate();

        expect(
          date,
        ).toBeTruthy();

        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/public/tenants/${tenantASlug}/availability`,
            )
            .query({
              employeeId:
                fakeEmployeeId,

              serviceId:
                fakeServiceId,

              date,
            });

        expect(
          response.status,
        ).toBe(
          400,
        );

        expect(
          getMessage(
            response.body,
          ),
        ).toContain(
          'no máximo 2 dias',
        );
      },
    );

    it(
      'rejeita agendamento com antecedência menor que a configurada',
      async () => {
        /*
         * Empresa A exige 180 minutos.
         *
         * Tentamos agendar aproximadamente
         * 60 minutos à frente.
         */
        const startsAt =
          DateTime.now()
            .plus({
              minutes: 60,
            })
            .toUTC()
            .toISO();

        expect(
          startsAt,
        ).toBeTruthy();

        const response =
          await request(
            app.getHttpServer(),
          )
            .post(
              `/public/tenants/${tenantASlug}/appointments`,
            )
            .send({
              employeeId:
                fakeEmployeeId,

              serviceId:
                fakeServiceId,

              startsAt,

              client: {
                name:
                  'Cliente Regras E2E',

                phone:
                  '(34) 99999-7777',

                email:
                  'cliente.regras@teste.com',
              },
            });

        expect(
          response.status,
        ).toBe(
          400,
        );

        expect(
          getMessage(
            response.body,
          ),
        ).toContain(
          '180 minutos',
        );
      },
    );

    it(
      'rejeita valores fora dos limites permitidos nas configurações',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              '/tenants/current',
            )
            .set(
              'Authorization',
              `Bearer ${ownerAToken}`,
            )
            .send({
              bookingMinAdvanceMinutes:
                1441,

              bookingMaxAdvanceDays:
                0,
            });

        expect(
          response.status,
        ).toBe(
          400,
        );

        /*
         * Confirma também que a tentativa
         * inválida não alterou os valores
         * anteriormente salvos.
         */
        const tenant =
          await getCurrentTenant(
            ownerAToken,
          );

        expect(
          tenant
            .bookingMinAdvanceMinutes,
        ).toBe(
          180,
        );

        expect(
          tenant
            .bookingMaxAdvanceDays,
        ).toBe(
          2,
        );
      },
    );
  },
);