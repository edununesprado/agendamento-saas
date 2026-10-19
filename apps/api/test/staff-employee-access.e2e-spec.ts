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
  'Bloqueio de funcionários para STAFF (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let staffToken: string;

    let employeeId: string;

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.employee.access.e2e@teste.com';

    const staffEmail =
      'staff.employee.access.e2e@teste.com';

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
                'Owner Employee Access E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Employee Access E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login(
            ownerEmail,
          );

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
                'Staff Employee Access E2E',

              email:
                staffEmail,

              password,

              role:
                'STAFF',
            });

        expect(
          staffResponse.status,
        ).toBe(201);

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
                'Funcionário Protegido E2E',

              email:
                'func.protegido.e2e@teste.com',
            });

        expect(
          employeeResponse.status,
        ).toBe(201);

        employeeId =
          employeeResponse.body.id;

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
      'STAFF não pode listar funcionários',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get('/employees')
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      'STAFF não pode visualizar funcionário por id',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/employees/${employeeId}`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      'STAFF não pode consultar serviços de funcionário',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/employees/${employeeId}/services`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      'STAFF não pode consultar jornada de funcionário',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/employees/${employeeId}/availability`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      'STAFF não pode consultar bloqueios de funcionário',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/employees/${employeeId}/blocked-times`,
            )
            .set(
              'Authorization',
              `Bearer ${staffToken}`,
            );

        expect(
          response.status,
        ).toBe(403);
      },
    );
  },
);