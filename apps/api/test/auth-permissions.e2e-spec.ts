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

describe('Permissões por perfil (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let ownerToken: string;
  let adminToken: string;
  let receptionistToken: string;
  let staffToken: string;

  const password = 'Teste@12345';

  const ownerEmail =
    'owner.e2e@teste.com';

  const adminEmail =
    'admin.e2e@teste.com';

  const receptionistEmail =
    'recepcao.e2e@teste.com';

  const staffEmail =
    'staff.e2e@teste.com';

  /**
   * Faz login e devolve
   * somente o accessToken.
   */
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

  /**
   * Cria um usuário da empresa
   * usando o OWNER.
   */
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
        .post('/team-members')
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
       * Proteção extra.
       *
       * Nunca permitimos que este teste
       * rode no banco de desenvolvimento.
       */
      if (
        !process.env.DATABASE_URL?.includes(
          'agendamento_test',
        )
      ) {
        throw new Error(
          'SEGURANÇA: o teste E2E não está conectado ao banco agendamento_test',
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

      /**
       * Mesma validação usada
       * pela aplicação real.
       */
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
       * Como este banco existe
       * exclusivamente para testes,
       * começamos sempre limpo.
       *
       * Excluir Tenant deve remover
       * os registros relacionados
       * por cascade.
       */
      await prisma.tenant.deleteMany();

      await prisma.user.deleteMany();

      /**
       * Cria a empresa e o OWNER.
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
              'Owner E2E',

            email:
              ownerEmail,

            password,

            companyName:
              'Empresa E2E',
          });

      expect(
        registerResponse.status,
      ).toBe(201);

      /**
       * Login do proprietário.
       */
      ownerToken =
        await login(
          ownerEmail,
        );

      /**
       * OWNER cria os demais perfis.
       */
      await createTeamMember(
        'Administrador E2E',
        adminEmail,
        'ADMIN',
      );

      await createTeamMember(
        'Recepção E2E',
        receptionistEmail,
        'RECEPTIONIST',
      );

      await createTeamMember(
        'Funcionário E2E',
        staffEmail,
        'STAFF',
      );

      /**
       * Login dos demais usuários.
       */
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
        /**
         * Limpa os dados criados
         * durante os testes.
         */
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
    'Serviços',
    () => {
      it(
        'OWNER pode criar serviço',
        async () => {
          const response =
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
                  'Serviço Owner E2E',

                description:
                  'Criado pelo teste automatizado',

                durationMin:
                  30,

                priceCents:
                  5000,
              });

          expect(
            response.status,
          ).toBe(201);

          expect(
            response.body.name,
          ).toBe(
            'Serviço Owner E2E',
          );
        },
      );

      it(
        'ADMIN pode criar serviço',
        async () => {
          const response =
            await request(
              app.getHttpServer(),
            )
              .post('/services')
              .set(
                'Authorization',
                `Bearer ${adminToken}`,
              )
              .send({
                name:
                  'Serviço Admin E2E',

                durationMin:
                  45,

                priceCents:
                  7000,
              });

          expect(
            response.status,
          ).toBe(201);
        },
      );

      it(
        'RECEPTIONIST não pode criar serviço',
        async () => {
          const response =
            await request(
              app.getHttpServer(),
            )
              .post('/services')
              .set(
                'Authorization',
                `Bearer ${receptionistToken}`,
              )
              .send({
                name:
                  'Serviço Recepção E2E',

                durationMin:
                  30,

                priceCents:
                  3000,
              });

          expect(
            response.status,
          ).toBe(403);
        },
      );

      it(
        'STAFF não pode criar serviço',
        async () => {
          const response =
            await request(
              app.getHttpServer(),
            )
              .post('/services')
              .set(
                'Authorization',
                `Bearer ${staffToken}`,
              )
              .send({
                name:
                  'Serviço Staff E2E',

                durationMin:
                  30,

                priceCents:
                  3000,
              });

          expect(
            response.status,
          ).toBe(403);
        },
      );

      it(
        'RECEPTIONIST pode visualizar serviços',
        async () => {
          const response =
            await request(
              app.getHttpServer(),
            )
              .get(
                '/services?status=active',
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

      it(
        'STAFF pode visualizar serviços e preços',
        async () => {
          const response =
            await request(
              app.getHttpServer(),
            )
              .get(
                '/services?status=active',
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

          expect(
            response.body.length,
          ).toBeGreaterThan(
            0,
          );

          expect(
            response.body[0],
          ).toHaveProperty(
            'priceCents',
          );
        },
      );
    },
  );

  describe(
    'Usuários da empresa',
    () => {
      it(
        'OWNER pode listar usuários',
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
                `Bearer ${ownerToken}`,
              );

          expect(
            response.status,
          ).toBe(200);
        },
      );

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
        'RECEPTIONIST não pode listar usuários',
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
                `Bearer ${receptionistToken}`,
              );

          expect(
            response.status,
          ).toBe(403);
        },
      );

      it(
        'STAFF não pode listar usuários',
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
                `Bearer ${staffToken}`,
              );

          expect(
            response.status,
          ).toBe(403);
        },
      );

      it(
        'ADMIN não pode criar outro usuário',
        async () => {
          const response =
            await request(
              app.getHttpServer(),
            )
              .post(
                '/team-members',
              )
              .set(
                'Authorization',
                `Bearer ${adminToken}`,
              )
              .send({
                name:
                  'Usuário proibido',

                email:
                  'proibido.e2e@teste.com',

                password,

                role:
                  'STAFF',
              });

          expect(
            response.status,
          ).toBe(403);
        },
      );
    },
  );
});