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

type TeamMemberResponse = {
  id: string;
  role: string;

  user: {
    id: string;
    name: string;
    email: string;
  };
};

type EmployeeResponse = {
  id: string;
  name: string;
};

type ServiceResponse = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
};

type ClientResponse = {
  id: string;
  name: string;
};

describe(
  'Isolamento da agenda do STAFF (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let staffToken: string;

    let tenantId: string;

    let staffMembershipId: string;

    let employeeA: EmployeeResponse;
    let employeeB: EmployeeResponse;

    let service: ServiceResponse;
    let client: ClientResponse;

    let ownAppointmentId: string;
    let otherAppointmentId: string;

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.agenda.e2e@teste.com';

    const staffEmail =
      'staff.agenda.e2e@teste.com';

    const testDate =
      '2026-11-10';

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

    beforeAll(
      async () => {
        /**
         * Proteção de segurança.
         */
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

        /**
         * Limpa apenas o banco de testes.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /**
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
                'Owner Agenda E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Agenda E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login(
            ownerEmail,
          );

        /**
         * Descobre o tenant criado.
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

        tenantId =
          tenantResponse.body.id;

        expect(
          tenantId,
        ).toBeTruthy();

        /**
         * Cria usuário STAFF.
         */
        const staffResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/team-members',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              name:
                'Funcionário Agenda E2E',

              email:
                staffEmail,

              password,

              role:
                'STAFF',
            });

        expect(
          staffResponse.status,
        ).toBe(201);

        staffMembershipId =
          (
            staffResponse.body as TeamMemberResponse
          ).id;

        /**
         * Cria Funcionário A.
         * Este será vinculado ao STAFF.
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
                'Funcionário A E2E',

              email:
                'funcionario.a.e2e@teste.com',
            });

        expect(
          employeeAResponse.status,
        ).toBe(201);

        employeeA =
          employeeAResponse.body;

        /**
         * Cria Funcionário B.
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
                'Funcionário B E2E',

              email:
                'funcionario.b.e2e@teste.com',
            });

        expect(
          employeeBResponse.status,
        ).toBe(201);

        employeeB =
          employeeBResponse.body;

        /**
         * Vincula STAFF ao Funcionário A.
         */
        const linkResponse =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/team-members/${staffMembershipId}/employee`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              employeeId:
                employeeA.id,
            });

        expect(
          linkResponse.status,
        ).toBe(200);

        /**
         * Cria serviço.
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
                'Corte Agenda E2E',

              durationMin:
                30,

              priceCents:
                5000,
            });

        expect(
          serviceResponse.status,
        ).toBe(201);

        service =
          serviceResponse.body;

        /**
         * Cria cliente.
         */
        const clientResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/clients',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              name:
                'Cliente Agenda E2E',

              email:
                'cliente.agenda.e2e@teste.com',
            });

        expect(
          clientResponse.status,
        ).toBe(201);

        client =
          clientResponse.body;

        /**
         * Criamos os agendamentos diretamente
         * no banco de TESTE.
         *
         * Aqui estamos preparando dados para
         * testar somente a segurança de leitura.
         */
        const ownAppointment =
          await prisma.appointment.create({
            data: {
              tenantId,

              employeeId:
                employeeA.id,

              serviceId:
                service.id,

              clientId:
                client.id,

              startsAt:
                new Date(
                  '2026-11-10T11:00:00.000Z',
                ),

              endsAt:
                new Date(
                  '2026-11-10T11:30:00.000Z',
                ),

              durationMin:
                30,

              priceCents:
                5000,

              status:
                'CONFIRMED',

              notes:
                'Agenda própria STAFF E2E',
            },
          });

        ownAppointmentId =
          ownAppointment.id;

        const otherAppointment =
          await prisma.appointment.create({
            data: {
              tenantId,

              employeeId:
                employeeB.id,

              serviceId:
                service.id,

              clientId:
                client.id,

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
                'CONFIRMED',

              notes:
                'Agenda de outro funcionário E2E',
            },
          });

        otherAppointmentId =
          otherAppointment.id;

        /**
         * Login do STAFF somente depois
         * do vínculo estar configurado.
         */
        staffToken =
          await login(
            staffEmail,
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
      'OWNER consegue visualizar os dois agendamentos',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/appointments?date=${testDate}`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          Array.isArray(
            response.body,
          ),
        ).toBe(true);

        expect(
          response.body,
        ).toHaveLength(2);

        const employeeIds =
          response.body.map(
            (
              appointment: {
                employeeId: string;
              },
            ) =>
              appointment.employeeId,
          );

        expect(
          employeeIds,
        ).toContain(
          employeeA.id,
        );

        expect(
          employeeIds,
        ).toContain(
          employeeB.id,
        );
      },
    );

    it(
      'STAFF visualiza somente o próprio agendamento',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/appointments?date=${testDate}`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body,
        ).toHaveLength(1);

        expect(
          response.body[0].id,
        ).toBe(
          ownAppointmentId,
        );

        expect(
          response.body[0].employeeId,
        ).toBe(
          employeeA.id,
        );
      },
    );

    it(
      'STAFF não consegue manipular employeeId para visualizar outro funcionário',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/appointments?date=${testDate}&employeeId=${employeeB.id}`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(200);

        /**
         * Mesmo enviando employeeId do B,
         * o backend deve forçar o Employee
         * vinculado ao STAFF.
         */
        expect(
          response.body,
        ).toHaveLength(1);

        expect(
          response.body[0].employeeId,
        ).toBe(
          employeeA.id,
        );

        expect(
          response.body[0].id,
        ).toBe(
          ownAppointmentId,
        );
      },
    );

    it(
      'STAFF consegue abrir o próprio agendamento',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/appointments/${ownAppointmentId}`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.id,
        ).toBe(
          ownAppointmentId,
        );

        expect(
          response.body.employeeId,
        ).toBe(
          employeeA.id,
        );
      },
    );

    it(
      'STAFF recebe 404 ao tentar abrir agendamento de outro funcionário',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/appointments/${otherAppointmentId}`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        /**
         * Usamos 404, não 403.
         *
         * Assim não revelamos nem mesmo
         * se aquele agendamento existe.
         */
        expect(
          response.status,
        ).toBe(404);
      },
    );

    it(
      'STAFF não pode cancelar nem alterar um agendamento',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${ownAppointmentId}/cancel`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            )
            .send({
              reason:
                'Tentativa E2E',
            });

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      'STAFF sem vínculo com Employee recebe 403 ao consultar agenda',
      async () => {
        /**
         * OWNER remove temporariamente
         * o vínculo do STAFF.
         */
        const unlinkResponse =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/team-members/${staffMembershipId}/employee`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              employeeId:
                null,
            });

        expect(
          unlinkResponse.status,
        ).toBe(200);

        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/appointments?date=${testDate}`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(403);

        /**
         * Religa para não deixar o fixture
         * em estado inconsistente.
         */
        const relinkResponse =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/team-members/${staffMembershipId}/employee`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              employeeId:
                employeeA.id,
            });

        expect(
          relinkResponse.status,
        ).toBe(200);
      },
    );
  },
);