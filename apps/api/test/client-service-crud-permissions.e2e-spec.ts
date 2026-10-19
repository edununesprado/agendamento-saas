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

type ClientResponse = {
  id: string;
  name: string;
  active: boolean;
};

type ServiceResponse = {
  id: string;
  name: string;
  active: boolean;
};

describe(
  'Permissões CRUD de clientes e serviços (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let adminToken: string;
    let receptionistToken: string;
    let staffToken: string;

    let clientCounter = 0;
    let serviceCounter = 0;

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.crud.e2e@teste.com';

    const adminEmail =
      'admin.crud.e2e@teste.com';

    const receptionistEmail =
      'recepcao.crud.e2e@teste.com';

    const staffEmail =
      'staff.crud.e2e@teste.com';

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
    }

    async function createClient() {
      clientCounter += 1;

      const response =
        await request(
          app.getHttpServer(),
        )
          .post('/clients')
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          )
          .send({
            name:
              `Cliente CRUD E2E ${clientCounter}`,
          });

      expect(
        response.status,
      ).toBe(201);

      return (
        response.body as ClientResponse
      );
    }

    async function createService() {
      serviceCounter += 1;

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
              `Serviço CRUD E2E ${serviceCounter}`,

            durationMin:
              30,

            priceCents:
              5000,
          });

      expect(
        response.status,
      ).toBe(201);

      return (
        response.body as ServiceResponse
      );
    }

    async function deactivateClient(
      clientId: string,
    ) {
      const response =
        await request(
          app.getHttpServer(),
        )
          .delete(
            `/clients/${clientId}`,
          )
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

      expect(
        response.status,
      ).toBe(200);
    }

    async function deactivateService(
      serviceId: string,
    ) {
      const response =
        await request(
          app.getHttpServer(),
        )
          .delete(
            `/services/${serviceId}`,
          )
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

      expect(
        response.status,
      ).toBe(200);
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
                'Owner CRUD E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa CRUD E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login(
            ownerEmail,
          );

        await createMember(
          'Admin CRUD E2E',
          adminEmail,
          'ADMIN',
        );

        await createMember(
          'Recepção CRUD E2E',
          receptionistEmail,
          'RECEPTIONIST',
        );

        await createMember(
          'Staff CRUD E2E',
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
      'Clientes - edição',
      () => {
        it(
          'OWNER pode editar cliente',
          async () => {
            const client =
              await createClient();

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/clients/${client.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${ownerToken}`,
                )
                .send({
                  name:
                    'Cliente Editado Owner',
                });

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.name,
            ).toBe(
              'Cliente Editado Owner',
            );
          },
        );

        it(
          'ADMIN pode editar cliente',
          async () => {
            const client =
              await createClient();

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/clients/${client.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${adminToken}`,
                )
                .send({
                  name:
                    'Cliente Editado Admin',
                });

            expect(
              response.status,
            ).toBe(200);
          },
        );

        it(
          'RECEPTIONIST pode editar cliente',
          async () => {
            const client =
              await createClient();

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/clients/${client.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${receptionistToken}`,
                )
                .send({
                  name:
                    'Cliente Editado Recepção',
                });

            expect(
              response.status,
            ).toBe(200);
          },
        );

        it(
          'STAFF não pode editar cliente',
          async () => {
            const client =
              await createClient();

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/clients/${client.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${staffToken}`,
                )
                .send({
                  name:
                    'Tentativa Staff',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );
      },
    );

    describe(
      'Clientes - desativação',
      () => {
        it(
          'OWNER pode desativar cliente',
          async () => {
            const client =
              await createClient();

            const response =
              await request(
                app.getHttpServer(),
              )
                .delete(
                  `/clients/${client.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${ownerToken}`,
                );

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.active,
            ).toBe(false);
          },
        );

        it(
          'ADMIN pode desativar cliente',
          async () => {
            const client =
              await createClient();

            const response =
              await request(
                app.getHttpServer(),
              )
                .delete(
                  `/clients/${client.id}`,
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
          'RECEPTIONIST pode desativar cliente',
          async () => {
            const client =
              await createClient();

            const response =
              await request(
                app.getHttpServer(),
              )
                .delete(
                  `/clients/${client.id}`,
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
          'STAFF não pode desativar cliente',
          async () => {
            const client =
              await createClient();

            const response =
              await request(
                app.getHttpServer(),
              )
                .delete(
                  `/clients/${client.id}`,
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

    describe(
      'Clientes - restauração',
      () => {
        it(
          'OWNER pode restaurar cliente',
          async () => {
            const client =
              await createClient();

            await deactivateClient(
              client.id,
            );

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/clients/${client.id}/restore`,
                )
                .set(
                  'Authorization',
                  `Bearer ${ownerToken}`,
                );

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.active,
            ).toBe(true);
          },
        );

        it(
          'ADMIN pode restaurar cliente',
          async () => {
            const client =
              await createClient();

            await deactivateClient(
              client.id,
            );

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/clients/${client.id}/restore`,
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
          'RECEPTIONIST pode restaurar cliente',
          async () => {
            const client =
              await createClient();

            await deactivateClient(
              client.id,
            );

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/clients/${client.id}/restore`,
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
          'STAFF não pode restaurar cliente',
          async () => {
            const client =
              await createClient();

            await deactivateClient(
              client.id,
            );

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/clients/${client.id}/restore`,
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

    describe(
      'Serviços - edição',
      () => {
        it(
          'OWNER pode editar serviço',
          async () => {
            const service =
              await createService();

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/services/${service.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${ownerToken}`,
                )
                .send({
                  name:
                    'Serviço Editado Owner',
                });

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.name,
            ).toBe(
              'Serviço Editado Owner',
            );
          },
        );

        it(
          'ADMIN pode editar serviço',
          async () => {
            const service =
              await createService();

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/services/${service.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${adminToken}`,
                )
                .send({
                  name:
                    'Serviço Editado Admin',
                });

            expect(
              response.status,
            ).toBe(200);
          },
        );

        it(
          'RECEPTIONIST não pode editar serviço',
          async () => {
            const service =
              await createService();

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/services/${service.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${receptionistToken}`,
                )
                .send({
                  name:
                    'Tentativa Recepção',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );

        it(
          'STAFF não pode editar serviço',
          async () => {
            const service =
              await createService();

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/services/${service.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${staffToken}`,
                )
                .send({
                  name:
                    'Tentativa Staff',
                });

            expect(
              response.status,
            ).toBe(403);
          },
        );
      },
    );

    describe(
      'Serviços - desativação',
      () => {
        it(
          'OWNER pode desativar serviço',
          async () => {
            const service =
              await createService();

            const response =
              await request(
                app.getHttpServer(),
              )
                .delete(
                  `/services/${service.id}`,
                )
                .set(
                  'Authorization',
                  `Bearer ${ownerToken}`,
                );

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.active,
            ).toBe(false);
          },
        );

        it(
          'ADMIN pode desativar serviço',
          async () => {
            const service =
              await createService();

            const response =
              await request(
                app.getHttpServer(),
              )
                .delete(
                  `/services/${service.id}`,
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
          'RECEPTIONIST não pode desativar serviço',
          async () => {
            const service =
              await createService();

            const response =
              await request(
                app.getHttpServer(),
              )
                .delete(
                  `/services/${service.id}`,
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
          'STAFF não pode desativar serviço',
          async () => {
            const service =
              await createService();

            const response =
              await request(
                app.getHttpServer(),
              )
                .delete(
                  `/services/${service.id}`,
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

    describe(
      'Serviços - restauração',
      () => {
        it(
          'OWNER pode restaurar serviço',
          async () => {
            const service =
              await createService();

            await deactivateService(
              service.id,
            );

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/services/${service.id}/restore`,
                )
                .set(
                  'Authorization',
                  `Bearer ${ownerToken}`,
                );

            expect(
              response.status,
            ).toBe(200);

            expect(
              response.body.active,
            ).toBe(true);
          },
        );

        it(
          'ADMIN pode restaurar serviço',
          async () => {
            const service =
              await createService();

            await deactivateService(
              service.id,
            );

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/services/${service.id}/restore`,
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
          'RECEPTIONIST não pode restaurar serviço',
          async () => {
            const service =
              await createService();

            await deactivateService(
              service.id,
            );

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/services/${service.id}/restore`,
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
          'STAFF não pode restaurar serviço',
          async () => {
            const service =
              await createService();

            await deactivateService(
              service.id,
            );

            const response =
              await request(
                app.getHttpServer(),
              )
                .patch(
                  `/services/${service.id}/restore`,
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
  },
);