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
  'Configurações da empresa (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let adminToken: string;
    let receptionistToken: string;
    let staffToken: string;

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.tenant.e2e@teste.com';

    const adminEmail =
      'admin.tenant.e2e@teste.com';

    const receptionistEmail =
      'recepcao.tenant.e2e@teste.com';

    const staffEmail =
      'staff.tenant.e2e@teste.com';

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
                'Owner Tenant E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Tenant E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login(
            ownerEmail,
          );

        await createMember(
          'Admin Tenant E2E',
          adminEmail,
          'ADMIN',
        );

        await createMember(
          'Recepção Tenant E2E',
          receptionistEmail,
          'RECEPTIONIST',
        );

        await createMember(
          'Staff Tenant E2E',
          staffEmail,
          'STAFF',
        );

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
      'Visualização da empresa',
      () => {
        it(
          'OWNER pode consultar empresa atual',
          async () => {
            const response =
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
              response.status,
            ).toBe(200);

            expect(
              response.body.name,
            ).toBeTruthy();
          },
        );

        it(
          'ADMIN pode consultar empresa atual',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  '/tenants/current',
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
          'RECEPTIONIST pode consultar empresa atual',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  '/tenants/current',
                )
                .set(
                  'Authorization',
                  `Bearer ${receptionistToken}`,
                );

            expect(
              response.status,
            ).toBe(200);
          },
        );

        it(
          'STAFF pode consultar empresa atual',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  '/tenants/current',
                )
                .set(
                  'Authorization',
                  `Bearer ${staffToken}`,
                );

            expect(
              response.status,
            ).toBe(200);
          },
        );

        it(
          'usuário sem token recebe 401',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  '/tenants/current',
                );

            expect(
              response.status,
            ).toBe(401);
          },
        );
      },
    );

    describe(
      'Alteração das configurações',
      () => {
        it(
          'OWNER pode alterar configurações',
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
                  `Bearer ${ownerToken}`,
                )
                .send({
                  name:
                    'Empresa Atualizada Owner E2E',

                  phone:
                    '34999990000',

                  email:
                    'empresa.owner.e2e@teste.com',

                  primaryColor:
                    '#112233',
                });

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.name,
            ).toBe(
              'Empresa Atualizada Owner E2E',
            );

            expect(
              response.body.primaryColor,
            ).toBe(
              '#112233',
            );
          },
        );

        it(
          'ADMIN pode alterar configurações',
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
                  `Bearer ${adminToken}`,
                )
                .send({
                  name:
                    'Empresa Atualizada Admin E2E',

                  primaryColor:
                    '#445566',
                });

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.name,
            ).toBe(
              'Empresa Atualizada Admin E2E',
            );

            expect(
              response.body.primaryColor,
            ).toBe(
              '#445566',
            );
          },
        );

        it(
          'RECEPTIONIST não pode alterar configurações',
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
                  `Bearer ${receptionistToken}`,
                )
                .send({
                  name:
                    'Tentativa Recepção E2E',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'STAFF não pode alterar configurações',
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
                  `Bearer ${staffToken}`,
                )
                .send({
                  name:
                    'Tentativa Staff E2E',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'usuário sem token não pode alterar configurações',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  '/tenants/current',
                )
                .send({
                  name:
                    'Tentativa Sem Token E2E',
                });

            expect(
              response.status,
            ).toBe(401);
          },
        );
      },
    );
  },
);