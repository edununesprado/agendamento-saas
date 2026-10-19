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
  'Dashboard e permissões de usuários (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let adminToken: string;
    let receptionistToken: string;
    let staffToken: string;

    let staffMembershipId: string;
    let employeeId: string;

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.dashboard.e2e@teste.com';

    const adminEmail =
      'admin.dashboard.e2e@teste.com';

    const receptionistEmail =
      'recepcao.dashboard.e2e@teste.com';

    const staffEmail =
      'staff.dashboard.e2e@teste.com';

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

    async function createMember(
      name: string,
      email: string,
      role:
        | 'ADMIN'
        | 'RECEPTIONIST'
        | 'STAFF',
    ) {
      const response =
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
            name,
            email,
            password,
            role,
          });

      expect(
        response.status,
      ).toBe(201);

      return response.body;
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
                'Owner Dashboard E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Dashboard E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login(
            ownerEmail,
          );

        await createMember(
          'Admin Dashboard E2E',
          adminEmail,
          'ADMIN',
        );

        await createMember(
          'Recepção Dashboard E2E',
          receptionistEmail,
          'RECEPTIONIST',
        );

        const staff =
          await createMember(
            'Staff Dashboard E2E',
            staffEmail,
            'STAFF',
          );

        staffMembershipId =
          staff.id;

        adminToken =
          await login(
            adminEmail,
          );

        receptionistToken =
          await login(
            receptionistEmail,
          );

        staffToken =
          await login(
            staffEmail,
          );

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
                'Funcionário Dashboard E2E',

              email:
                'func.dashboard.e2e@teste.com',
            });

        expect(
          employeeResponse.status,
        ).toBe(201);

        employeeId =
          employeeResponse.body.id;
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

    describe(
      'Dashboard',
      () => {
        const dashboardUrl =
          '/dashboard?startDate=2026-10-01&endDate=2026-10-31';

        it(
          'OWNER pode acessar dashboard',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  dashboardUrl,
                )
                .set(
                  'Authorization',
                  `Bearer ${ownerToken}`,
                );

            expect(
              response.status,
            ).toBe(200);
          },
        );

        it(
          'ADMIN pode acessar dashboard',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  dashboardUrl,
                )
                .set(
                  'Authorization',
                  `Bearer ${adminToken}`,
                );

            expect(
              response.status,
            ).toBe(200);
          },
        );

        it(
          'RECEPTIONIST não pode acessar dashboard',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  dashboardUrl,
                )
                .set(
                  'Authorization',
                  `Bearer ${receptionistToken}`,
                );

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'STAFF não pode acessar dashboard',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  dashboardUrl,
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
          'usuário não autenticado recebe 401',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  dashboardUrl,
                );

            expect(
              response.status,
            ).toBe(401);
          },
        );
      },
    );

    describe(
      'Administração de usuários',
      () => {
        it(
          'ADMIN pode listar usuários',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  '/team-members',
                )
                .set(
                  'Authorization',
                  `Bearer ${adminToken}`,
                );

            expect(
              response.status,
            ).toBe(200);
          },
        );

        it(
          'ADMIN não pode alterar função de usuário',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/team-members/${staffMembershipId}/role`,
                )
                .set(
                  'Authorization',
                  `Bearer ${adminToken}`,
                )
                .send({
                  role:
                    'RECEPTIONIST',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'ADMIN não pode vincular funcionário ao STAFF',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/team-members/${staffMembershipId}/employee`,
                )
                .set(
                  'Authorization',
                  `Bearer ${adminToken}`,
                )
                .send({
                  employeeId,
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'OWNER pode vincular funcionário ao STAFF',
          async () => {
            const response =
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
                  employeeId,
                });

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.employee,
            ).toBeTruthy();

            expect(
              response.body.employee.id,
            ).toBe(
              employeeId,
            );
          },
        );

        it(
          'OWNER pode alterar função do usuário',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/team-members/${staffMembershipId}/role`,
                )
                .set(
                  'Authorization',
                  `Bearer ${ownerToken}`,
                )
                .send({
                  role:
                    'RECEPTIONIST',
                });

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.role,
            ).toBe(
              'RECEPTIONIST',
            );
          },
        );
      },
    );
  },
);