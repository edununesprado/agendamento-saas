
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
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/notifications/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

type NotificationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELED'
  | 'UNCERTAIN';

type SummaryResponse = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  canceled: number;
  uncertain: number;
};

describe(
  'Painel de notificações - indicadores (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let adminToken: string;
    let receptionistToken: string;
    let staffToken: string;

    let secondOwnerToken: string;
    let emptyOwnerToken: string;

    let tenantId: string;
    let secondTenantId: string;
    let emptyTenantId: string;

    let uncertainDeliveryId: string;

    const createdTenantIds: string[] = [];

    const sendMail = vi.fn();

    const password = 'Teste@12345';

    const ownerEmail =
      'owner.notifications.summary.e2e@teste.com';

    const adminEmail =
      'admin.notifications.summary.e2e@teste.com';

    const receptionistEmail =
      'receptionist.notifications.summary.e2e@teste.com';

    const staffEmail =
      'staff.notifications.summary.e2e@teste.com';

    const secondOwnerEmail =
      'second.owner.notifications.summary.e2e@teste.com';

    const emptyOwnerEmail =
      'empty.owner.notifications.summary.e2e@teste.com';

    const testEmails = [
      ownerEmail,
      adminEmail,
      receptionistEmail,
      staffEmail,
      secondOwnerEmail,
      emptyOwnerEmail,
    ];

    const futureAttempt = new Date(
      '2030-01-01T12:00:00.000Z',
    );

    async function login(
      email: string,
    ): Promise<string> {
      const response = await request(
        app.getHttpServer(),
      )
        .post('/auth/login')
        .send({
          email,
          password,
        });

      expect([200, 201]).toContain(
        response.status,
      );

      expect(
        response.body.accessToken,
      ).toBeTruthy();

      return (
        response.body as LoginResponse
      ).accessToken;
    }

    async function getCurrentTenantId(
      token: string,
    ): Promise<string> {
      const response = await request(
        app.getHttpServer(),
      )
        .get('/tenants/current')
        .set(
          'Authorization',
          `Bearer ${token}`,
        );

      expect(response.status).toBe(200);
      expect(response.body.id).toBeTruthy();

      return response.body.id as string;
    }

    async function registerOwner(
      name: string,
      email: string,
      companyName: string,
    ): Promise<{
      token: string;
      tenantId: string;
    }> {
      const response = await request(
        app.getHttpServer(),
      )
        .post('/auth/register')
        .send({
          name,
          email,
          password,
          companyName,
        });

      expect(response.status).toBe(201);

      const token = await login(email);

      const registeredTenantId =
        await getCurrentTenantId(token);

      createdTenantIds.push(
        registeredTenantId,
      );

      return {
        token,
        tenantId: registeredTenantId,
      };
    }

    async function createMember(
      name: string,
      email: string,
      role:
        | 'ADMIN'
        | 'RECEPTIONIST'
        | 'STAFF',
    ) {
      const response = await request(
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

      expect(response.status).toBe(201);
    }

    async function createNotification(
      targetTenantId: string,
      index: number,
      status: NotificationStatus,
    ) {
      return prisma.notificationDelivery.create({
        data: {
          tenantId: targetTenantId,

          channel: 'EMAIL',

          type: 'APPOINTMENT_REMINDER',

          status,

          recipient:
            `summary-cliente${index}@exemplo.test`,

          subject:
            `Resumo de notificação ${index}`,

          text:
            `Conteúdo de teste ${index}`,

          dedupeKey:
            `notifications-summary:e2e:${targetTenantId}:${index}`,

          attempts:
            status === 'PENDING' ? 0 : 1,

          maxAttempts: 5,

          nextAttemptAt: futureAttempt,

          processingStartedAt:
            status === 'PROCESSING'
              ? new Date()
              : null,

          lastError:
            status === 'UNCERTAIN'
              ? 'Resultado SMTP incerto'
              : null,

          sentAt:
            status === 'SENT'
              ? new Date()
              : null,

          failedAt:
            status === 'FAILED'
              ? new Date()
              : null,
        },
      });
    }

    async function getSummary(
      token: string,
    ) {
      return request(
        app.getHttpServer(),
      )
        .get('/notifications/summary')
        .set(
          'Authorization',
          `Bearer ${token}`,
        );
    }

    beforeAll(
      async () => {
        /*
         * SEGURANÇA:
         *
         * Executar exclusivamente
         * no banco agendamento_test.
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
            imports: [AppModule],
          })
            .overrideProvider(EmailService)
            .useValue({
              sendMail,
            })
            .compile();

        app =
          moduleRef.createNestApplication();

        app.useGlobalPipes(
          new ValidationPipe({
            whitelist: true,
            transform: true,
          }),
        );

        await app.init();

        prisma = app.get(
          PrismaService,
        );

        /*
         * EMPRESA A:
         * oito notificações.
         */
        const firstCompany =
          await registerOwner(
            'Owner Summary E2E',
            ownerEmail,
            'Empresa Summary A E2E',
          );

        ownerToken = firstCompany.token;
        tenantId = firstCompany.tenantId;

        await createMember(
          'Admin Summary E2E',
          adminEmail,
          'ADMIN',
        );

        await createMember(
          'Recepção Summary E2E',
          receptionistEmail,
          'RECEPTIONIST',
        );

        await createMember(
          'Staff Summary E2E',
          staffEmail,
          'STAFF',
        );

        adminToken = await login(
          adminEmail,
        );

        receptionistToken = await login(
          receptionistEmail,
        );

        staffToken = await login(
          staffEmail,
        );

        /*
         * DISTRIBUIÇÃO DA EMPRESA A
         *
         * PENDING:    2
         * PROCESSING: 1
         * SENT:       2
         * FAILED:     1
         * CANCELED:   1
         * UNCERTAIN:  1
         *
         * TOTAL:      8
         */
        await createNotification(
          tenantId,
          1,
          'PENDING',
        );

        await createNotification(
          tenantId,
          2,
          'PENDING',
        );

        await createNotification(
          tenantId,
          3,
          'PROCESSING',
        );

        await createNotification(
          tenantId,
          4,
          'SENT',
        );

        await createNotification(
          tenantId,
          5,
          'SENT',
        );

        await createNotification(
          tenantId,
          6,
          'FAILED',
        );

        await createNotification(
          tenantId,
          7,
          'CANCELED',
        );

        const uncertainDelivery =
          await createNotification(
            tenantId,
            8,
            'UNCERTAIN',
          );

        uncertainDeliveryId =
          uncertainDelivery.id;

        /*
         * EMPRESA B:
         * duas notificações.
         */
        const secondCompany =
          await registerOwner(
            'Second Owner Summary E2E',
            secondOwnerEmail,
            'Empresa Summary B E2E',
          );

        secondOwnerToken =
          secondCompany.token;

        secondTenantId =
          secondCompany.tenantId;

        await createNotification(
          secondTenantId,
          9,
          'SENT',
        );

        await createNotification(
          secondTenantId,
          10,
          'FAILED',
        );

        /*
         * EMPRESA C:
         * nenhuma notificação.
         */
        const emptyCompany =
          await registerOwner(
            'Empty Owner Summary E2E',
            emptyOwnerEmail,
            'Empresa Summary C E2E',
          );

        emptyOwnerToken =
          emptyCompany.token;

        emptyTenantId =
          emptyCompany.tenantId;

        expect(tenantId).not.toBe(
          secondTenantId,
        );

        expect(emptyTenantId).not.toBe(
          tenantId,
        );

        expect(emptyTenantId).not.toBe(
          secondTenantId,
        );

        sendMail.mockClear();
      },
      30000,
    );

    afterAll(
      async () => {
        /*
         * Removemos exclusivamente
         * as empresas e usuários
         * criados neste arquivo.
         *
         * Nunca limpamos todo
         * o banco de testes.
         */
        if (
          prisma &&
          process.env.DATABASE_URL?.includes(
            'agendamento_test',
          )
        ) {
          if (createdTenantIds.length > 0) {
            await prisma.tenant.deleteMany({
              where: {
                id: {
                  in: createdTenantIds,
                },
              },
            });
          }

          await prisma.user.deleteMany({
            where: {
              email: {
                in: testEmails,
              },
            },
          });
        }

        if (app) {
          await app.close();
        }
      },
      30000,
    );

    /*
     * TESTE 1
     *
     * Autenticação obrigatória.
     */
    it(
      'usuário sem token recebe 401',
      async () => {
        const response = await request(
          app.getHttpServer(),
        ).get('/notifications/summary');

        expect(response.status).toBe(401);
      },
    );

    /*
     * TESTE 2
     *
     * Contagens corretas do OWNER.
     */
    it(
      'OWNER consulta os indicadores corretos da empresa',
      async () => {
        const response = await getSummary(
          ownerToken,
        );

        expect(response.status).toBe(200);

        const body =
          response.body as SummaryResponse;

        expect(body).toEqual({
          total: 8,
          pending: 2,
          processing: 1,
          sent: 2,
          failed: 1,
          canceled: 1,
          uncertain: 1,
        });
      },
    );

    /*
     * TESTE 3
     *
     * ADMIN recebe os mesmos
     * indicadores da empresa.
     */
    it(
      'ADMIN pode consultar indicadores',
      async () => {
        const response = await getSummary(
          adminToken,
        );

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
          total: 8,
          pending: 2,
          processing: 1,
          sent: 2,
          failed: 1,
          canceled: 1,
          uncertain: 1,
        });
      },
    );

    /*
     * TESTE 4
     *
     * RECEPTIONIST não tem acesso.
     */
    it(
      'RECEPTIONIST recebe 403',
      async () => {
        const response = await getSummary(
          receptionistToken,
        );

        expect(response.status).toBe(403);
      },
    );

    /*
     * TESTE 5
     *
     * STAFF não tem acesso.
     */
    it(
      'STAFF recebe 403',
      async () => {
        const response = await getSummary(
          staffToken,
        );

        expect(response.status).toBe(403);
      },
    );

    /*
     * TESTE 6
     *
     * Isolamento da empresa B.
     */
    it(
      'empresa B visualiza somente suas próprias contagens',
      async () => {
        const response = await getSummary(
          secondOwnerToken,
        );

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
          total: 2,
          pending: 0,
          processing: 0,
          sent: 1,
          failed: 1,
          canceled: 0,
          uncertain: 0,
        });
      },
    );

    /*
     * TESTE 7
     *
     * tenantId informado pelo cliente
     * não pode substituir o JWT.
     */
    it(
      'ignora tenantId de outra empresa na URL',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications/summary')
          .query({
            tenantId: secondTenantId,
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
          total: 8,
          pending: 2,
          processing: 1,
          sent: 2,
          failed: 1,
          canceled: 1,
          uncertain: 1,
        });
      },
    );

    /*
     * TESTE 8
     *
     * Empresa sem notificações
     * recebe todos os campos zerados.
     */
    it(
      'empresa sem notificações recebe indicadores zerados',
      async () => {
        const response = await getSummary(
          emptyOwnerToken,
        );

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
          total: 0,
          pending: 0,
          processing: 0,
          sent: 0,
          failed: 0,
          canceled: 0,
          uncertain: 0,
        });
      },
    );

    /*
     * TESTE 9
     *
     * A consulta não modifica
     * a entrega UNCERTAIN e
     * não realiza envio SMTP.
     */
    it(
      'preserva UNCERTAIN e não dispara e-mails',
      async () => {
        const before =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: uncertainDeliveryId,
            },
          });

        expect(before?.status).toBe(
          'UNCERTAIN',
        );

        expect(before?.lastError).toBe(
          'Resultado SMTP incerto',
        );

        sendMail.mockClear();

        const firstResponse =
          await getSummary(ownerToken);

        const secondResponse =
          await getSummary(adminToken);

        expect(firstResponse.status).toBe(
          200,
        );

        expect(secondResponse.status).toBe(
          200,
        );

        expect(sendMail).not.toHaveBeenCalled();

        const after =
          await prisma.notificationDelivery.findUnique({
            where: {
              id: uncertainDeliveryId,
            },
          });

        expect(after?.status).toBe(
          'UNCERTAIN',
        );

        expect(after?.attempts).toBe(
          before?.attempts,
        );

        expect(after?.lastError).toBe(
          before?.lastError,
        );

        expect(after?.sentAt).toBeNull();
        expect(after?.failedAt).toBeNull();
      },
    );
  },
);
