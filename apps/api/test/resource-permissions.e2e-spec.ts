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
  'Permissões de Funcionários e Clientes (E2E)',
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
      'owner.recursos.e2e@teste.com';

    const adminEmail =
      'admin.recursos.e2e@teste.com';

    const receptionistEmail =
      'recepcao.recursos.e2e@teste.com';

    const staffEmail =
      'staff.recursos.e2e@teste.com';

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

    async function createTeamMember(
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
        /**
         * Trava de segurança:
         * nunca executar limpeza
         * no banco de desenvolvimento.
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

        /**
         * Banco exclusivo de testes.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /**
         * Cria OWNER + empresa.
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
                'Owner Recursos E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Recursos E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login(
            ownerEmail,
          );

        /**
         * Cria demais perfis.
         */
        await createTeamMember(
          'Administrador Recursos E2E',
          adminEmail,
          'ADMIN',
        );

        await createTeamMember(
          'Recepção Recursos E2E',
          receptionistEmail,
          'RECEPTIONIST',
        );

        await createTeamMember(
          'Funcionário Recursos E2E',
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
      'Funcionários',
      () => {
        it(
          'OWNER pode cadastrar funcionário',
          async () => {
            const response =
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
                    'Funcionário Owner E2E',

                  email:
                    'func.owner.e2e@teste.com',

                  phone:
                    '34999990001',
                });

            expect(
              response.status,
            ).toBe(201);

            expect(
              response.body.name,
            ).toBe(
              'Funcionário Owner E2E',
            );
          },
        );

        it(
          'ADMIN pode cadastrar funcionário',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .post(
                  '/employees',
                )
                .set(
                  'Authorization',
                  `Bearer ${adminToken}`,
                )
                .send({
                  name:
                    'Funcionário Admin E2E',

                  email:
                    'func.admin.e2e@teste.com',

                  phone:
                    '34999990002',
                });

            expect(
              response.status,
            ).toBe(201);
          },
        );

        it(
          'RECEPTIONIST não pode cadastrar funcionário',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .post(
                  '/employees',
                )
                .set(
                  'Authorization',
                  `Bearer ${receptionistToken}`,
                )
                .send({
                  name:
                    'Funcionário Recepção E2E',

                  email:
                    'func.recepcao.e2e@teste.com',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'STAFF não pode cadastrar funcionário',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .post(
                  '/employees',
                )
                .set(
                  'Authorization',
                  `Bearer ${staffToken}`,
                )
                .send({
                  name:
                    'Funcionário Staff E2E',

                  email:
                    'func.staff.e2e@teste.com',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'RECEPTIONIST pode consultar funcionários',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  '/employees?status=active',
                )
                .set(
                  'Authorization',
                  `Bearer ${receptionistToken}`,
                );

            expect(
              response.status,
            ).toBe(200);

            expect(
              Array.isArray(
                response.body,
              ),
            ).toBe(true);
          },
        );
      },
    );

    describe(
      'Clientes',
      () => {
        it(
          'OWNER pode cadastrar cliente',
          async () => {
            const response =
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
                    'Cliente Owner E2E',

                  email:
                    'cliente.owner.e2e@teste.com',

                  phone:
                    '34999991001',
                });

            expect(
              response.status,
            ).toBe(201);

            expect(
              response.body.name,
            ).toBe(
              'Cliente Owner E2E',
            );
          },
        );

        it(
          'ADMIN pode cadastrar cliente',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .post(
                  '/clients',
                )
                .set(
                  'Authorization',
                  `Bearer ${adminToken}`,
                )
                .send({
                  name:
                    'Cliente Admin E2E',

                  email:
                    'cliente.admin.e2e@teste.com',
                });

            expect(
              response.status,
            ).toBe(201);
          },
        );

        it(
          'RECEPTIONIST pode cadastrar cliente',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .post(
                  '/clients',
                )
                .set(
                  'Authorization',
                  `Bearer ${receptionistToken}`,
                )
                .send({
                  name:
                    'Cliente Recepção E2E',

                  email:
                    'cliente.recepcao.e2e@teste.com',
                });

            expect(
              response.status,
            ).toBe(201);
          },
        );

        it(
          'STAFF não pode cadastrar cliente',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .post(
                  '/clients',
                )
                .set(
                  'Authorization',
                  `Bearer ${staffToken}`,
                )
                .send({
                  name:
                    'Cliente Staff E2E',

                  email:
                    'cliente.staff.e2e@teste.com',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'STAFF pode consultar clientes',
          async () => {
            const response =
              await request(
                app.getHttpServer(),
              )
                .get(
                  '/clients?status=active',
                )
                .set(
                  'Authorization',
                  `Bearer ${staffToken}`,
                );

            expect(
              response.status,
            ).toBe(200);

            expect(
              Array.isArray(
                response.body,
              ),
            ).toBe(true);
          },
        );
      },
    );
  },
);