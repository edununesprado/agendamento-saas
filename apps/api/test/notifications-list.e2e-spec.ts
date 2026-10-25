
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

type NotificationResponse = {
  data: Array<{
    id: string;
    appointmentId: string | null;
    type: string;
    status: string;
    recipient: string;
    subject: string;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: string;
    lastAttemptAt: string | null;
    processingStartedAt: string | null;
    sentAt: string | null;
    failedAt: string | null;
    lastError: string | null;
    createdAt: string;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type NotificationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELED'
  | 'UNCERTAIN';

type NotificationType =
  | 'APPOINTMENT_REQUESTED'
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_CANCELED'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_REMINDER';

describe(
  'Painel de notificações - listagem (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let adminToken: string;
    let receptionistToken: string;
    let staffToken: string;
    let secondOwnerToken: string;

    let tenantId: string;
    let secondTenantId: string;
    let uncertainDeliveryId: string;

    const sendMail = vi.fn();

    const password = 'Teste@12345';

    const ownerEmail =
      'owner.notifications.list.e2e@teste.com';

    const adminEmail =
      'admin.notifications.list.e2e@teste.com';

    const receptionistEmail =
      'receptionist.notifications.list.e2e@teste.com';

    const staffEmail =
      'staff.notifications.list.e2e@teste.com';

    const secondOwnerEmail =
      'owner.second.notifications.list.e2e@teste.com';

    const notificationDate = new Date(
      '2026-10-20T12:00:00.000Z',
    );

    /*
     * Impede que as notificações
     * PENDING fiquem disponíveis
     * para processamento imediato.
     */
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

    async function registerOwner(
      name: string,
      email: string,
      companyName: string,
    ) {
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

      expect(
        response.body.id,
      ).toBeTruthy();

      return response.body.id as string;
    }

    /*
     * Cria notificações de teste.
     *
     * O parâmetro createdAtOverride
     * permite testar horários exatos
     * nas fronteiras dos dias.
     */
    async function createNotification(
      targetTenantId: string,
      index: number,
      status: NotificationStatus,
      type: NotificationType =
        'APPOINTMENT_REMINDER',
      createdAtOverride?: Date,
    ) {
      const createdAt =
        createdAtOverride ??
        new Date(
          notificationDate.getTime() +
            index * 60 * 1000,
        );

      return prisma.notificationDelivery.create({
        data: {
          tenantId: targetTenantId,

          channel: 'EMAIL',
          type,
          status,

          recipient:
            `cliente${index}@exemplo.test`,

          subject:
            `Notificação de teste ${index}`,

          text:
            `Conteúdo da notificação ${index}`,

          dedupeKey:
            `notifications-list:e2e:${targetTenantId}:${index}`,

          attempts:
            status === 'PENDING' ? 0 : 1,

          maxAttempts: 5,
          nextAttemptAt: futureAttempt,
          createdAt,

          lastError:
            status === 'UNCERTAIN'
              ? 'Resultado SMTP incerto'
              : null,

          sentAt:
            status === 'SENT'
              ? createdAt
              : null,

          failedAt:
            status === 'FAILED'
              ? createdAt
              : null,
        },
      });
    }

    beforeAll(
      async () => {
        /*
         * SEGURANÇA:
         *
         * Os testes removem registros.
         * Devem usar exclusivamente
         * o banco agendamento_test.
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

        app = moduleRef.createNestApplication();

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
         * Limpeza exclusiva
         * do banco de testes.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * EMPRESA A
         */
        await registerOwner(
          'Owner Notificações E2E',
          ownerEmail,
          'Empresa Notificações A E2E',
        );

        ownerToken = await login(
          ownerEmail,
        );

        tenantId =
          await getCurrentTenantId(
            ownerToken,
          );

        await createMember(
          'Admin Notificações E2E',
          adminEmail,
          'ADMIN',
        );

        await createMember(
          'Recepção Notificações E2E',
          receptionistEmail,
          'RECEPTIONIST',
        );

        await createMember(
          'Staff Notificações E2E',
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
         * EMPRESA B
         */
        await registerOwner(
          'Owner Segunda Empresa E2E',
          secondOwnerEmail,
          'Empresa Notificações B E2E',
        );

        secondOwnerToken = await login(
          secondOwnerEmail,
        );

        secondTenantId =
          await getCurrentTenantId(
            secondOwnerToken,
          );

        expect(secondTenantId).not.toBe(
          tenantId,
        );

        /*
         * EMPRESA A
         *
         * Todas as cinco notificações
         * são criadas em 20/10/2026
         * no horário de São Paulo.
         *
         * Índice | Status    | Tipo
         * -------|-----------|----------------
         * 1      | PENDING   | REMINDER
         * 2      | SENT      | CONFIRMED
         * 3      | FAILED    | CANCELED
         * 4      | UNCERTAIN | REMINDER
         * 5      | CANCELED  | RESCHEDULED
         */
        await createNotification(
          tenantId,
          1,
          'PENDING',
          'APPOINTMENT_REMINDER',
        );

        await createNotification(
          tenantId,
          2,
          'SENT',
          'APPOINTMENT_CONFIRMED',
        );

        await createNotification(
          tenantId,
          3,
          'FAILED',
          'APPOINTMENT_CANCELED',
        );

        const uncertainDelivery =
          await createNotification(
            tenantId,
            4,
            'UNCERTAIN',
            'APPOINTMENT_REMINDER',
          );

        uncertainDeliveryId =
          uncertainDelivery.id;

        await createNotification(
          tenantId,
          5,
          'CANCELED',
          'APPOINTMENT_RESCHEDULED',
        );

        /*
         * EMPRESA B
         *
         * Mesmo status e tipo da
         * segunda notificação da
         * empresa A.
         */
        await createNotification(
          secondTenantId,
          6,
          'SENT',
          'APPOINTMENT_CONFIRMED',
        );

        sendMail.mockClear();
      },
      30000,
    );

    afterAll(
      async () => {
        /*
         * Proteção também na
         * limpeza final.
         */
        if (
          prisma &&
          process.env.DATABASE_URL?.includes(
            'agendamento_test',
          )
        ) {
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
     * 1. AUTENTICAÇÃO
     */
    it(
      'usuário sem token recebe 401',
      async () => {
        const response = await request(
          app.getHttpServer(),
        ).get('/notifications');

        expect(response.status).toBe(401);
      },
    );

    /*
     * 2. PERMISSÃO OWNER
     */
    it(
      'OWNER pode consultar notificações',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(5);
        expect(body.page).toBe(1);
        expect(body.limit).toBe(20);
        expect(body.totalPages).toBe(1);
        expect(body.data).toHaveLength(5);

        const statuses = body.data.map(
          (item) => item.status,
        );

        expect(statuses).toContain('PENDING');
        expect(statuses).toContain('SENT');
        expect(statuses).toContain('FAILED');
        expect(statuses).toContain('UNCERTAIN');
        expect(statuses).toContain('CANCELED');
      },
    );

    /*
     * 3. PERMISSÃO ADMIN
     */
    it(
      'ADMIN pode consultar notificações',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .set(
            'Authorization',
            `Bearer ${adminToken}`,
          );

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(5);
      },
    );

    /*
     * 4. BLOQUEIO RECEPTIONIST
     */
    it(
      'RECEPTIONIST não pode consultar notificações',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .set(
            'Authorization',
            `Bearer ${receptionistToken}`,
          );

        expect(response.status).toBe(403);
      },
    );

    /*
     * 5. BLOQUEIO STAFF
     */
    it(
      'STAFF não pode consultar notificações',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .set(
            'Authorization',
            `Bearer ${staffToken}`,
          );

        expect(response.status).toBe(403);
      },
    );

    /*
     * 6. ISOLAMENTO EMPRESA B
     */
    it(
      'empresa B visualiza apenas suas próprias notificações',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .set(
            'Authorization',
            `Bearer ${secondOwnerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(1);
        expect(body.data).toHaveLength(1);

        expect(
          body.data[0]?.recipient,
        ).toBe('cliente6@exemplo.test');

        expect(
          body.data[0]?.subject,
        ).toBe('Notificação de teste 6');
      },
    );

    /*
     * 7. TENANT ID NA URL
     */
    it(
      'não permite acessar outra empresa informando tenantId na URL',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            tenantId: secondTenantId,
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(5);

        expect(
          body.data.every(
            (item) =>
              item.recipient !==
              'cliente6@exemplo.test',
          ),
        ).toBe(true);
      },
    );

    /*
     * 8. PAGINAÇÃO
     */
    it(
      'pagina os resultados corretamente',
      async () => {
        const firstResponse = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            page: 1,
            limit: 2,
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        const secondResponse = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            page: 2,
            limit: 2,
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);

        const firstPage =
          firstResponse.body as NotificationResponse;

        const secondPage =
          secondResponse.body as NotificationResponse;

        expect(firstPage.total).toBe(5);
        expect(firstPage.page).toBe(1);
        expect(firstPage.limit).toBe(2);
        expect(firstPage.totalPages).toBe(3);
        expect(firstPage.data).toHaveLength(2);

        expect(secondPage.total).toBe(5);
        expect(secondPage.page).toBe(2);
        expect(secondPage.limit).toBe(2);
        expect(secondPage.totalPages).toBe(3);
        expect(secondPage.data).toHaveLength(2);

        const firstIds = firstPage.data.map(
          (item) => item.id,
        );

        const secondIds = secondPage.data.map(
          (item) => item.id,
        );

        expect(
          firstIds.some(
            (id) => secondIds.includes(id),
          ),
        ).toBe(false);
      },
    );

    /*
     * 9. ORDENAÇÃO
     */
    it(
      'ordena notificações pelas mais recentes',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.data).toHaveLength(5);

        const createdAtValues = body.data.map(
          (item) =>
            new Date(item.createdAt).getTime(),
        );

        const sortedValues = [
          ...createdAtValues,
        ].sort((a, b) => b - a);

        expect(createdAtValues).toEqual(
          sortedValues,
        );

        expect(
          body.data[0]?.subject,
        ).toBe('Notificação de teste 5');
      },
    );

    /*
     * 10. PAGINAÇÃO INVÁLIDA
     */
    it(
      'rejeita parâmetros de paginação inválidos',
      async () => {
        const invalidQueries = [
          { page: '0' },
          { page: '-1' },
          { page: 'abc' },
          { page: '1.5' },
          { page: '999999999999999999999' },
          { limit: '0' },
          { limit: '-1' },
          { limit: '101' },
          { limit: 'abc' },
          { limit: '1.5' },
        ];

        for (const query of invalidQueries) {
          const response = await request(
            app.getHttpServer(),
          )
            .get('/notifications')
            .query(query)
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

          expect(response.status).toBe(400);
        }
      },
    );

    /*
     * 11. PROTEÇÃO UNCERTAIN
     */
    it(
      'não modifica UNCERTAIN nem dispara SMTP durante a consulta',
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

        const firstResponse = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        const secondResponse = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            page: 1,
            limit: 2,
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);

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

        expect(
          after?.processingStartedAt,
        ).toBeNull();

        expect(
          after?.nextAttemptAt.toISOString(),
        ).toBe(
          before?.nextAttemptAt.toISOString(),
        );
      },
    );

    /*
     * 12. FILTRO POR STATUS
     */
    it(
      'filtra notificações por status UNCERTAIN',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            status: 'UNCERTAIN',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(1);
        expect(body.totalPages).toBe(1);
        expect(body.data).toHaveLength(1);

        expect(
          body.data[0]?.id,
        ).toBe(uncertainDeliveryId);

        expect(
          body.data[0]?.status,
        ).toBe('UNCERTAIN');

        expect(
          body.data[0]?.lastError,
        ).toBe('Resultado SMTP incerto');
      },
    );

    /*
     * 13. FILTRO POR TIPO
     */
    it(
      'filtra notificações por tipo APPOINTMENT_REMINDER',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            type: 'APPOINTMENT_REMINDER',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(2);
        expect(body.data).toHaveLength(2);
        expect(body.totalPages).toBe(1);

        expect(
          body.data.every(
            (item) =>
              item.type ===
              'APPOINTMENT_REMINDER',
          ),
        ).toBe(true);

        expect(
          body.data.map(
            (item) => item.status,
          ),
        ).toEqual([
          'UNCERTAIN',
          'PENDING',
        ]);
      },
    );

    /*
     * 14. FILTROS COMBINADOS
     */
    it(
      'combina status SENT com tipo APPOINTMENT_CONFIRMED',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            status: 'SENT',
            type: 'APPOINTMENT_CONFIRMED',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(1);
        expect(body.data).toHaveLength(1);

        expect(
          body.data[0]?.status,
        ).toBe('SENT');

        expect(
          body.data[0]?.type,
        ).toBe('APPOINTMENT_CONFIRMED');

        expect(
          body.data[0]?.recipient,
        ).toBe('cliente2@exemplo.test');
      },
    );

    /*
     * 15. FILTRO SEM RESULTADOS
     */
    it(
      'retorna lista vazia quando os filtros não encontram resultados',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            status: 'SENT',
            type: 'APPOINTMENT_REMINDER',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.data).toEqual([]);
        expect(body.total).toBe(0);
        expect(body.totalPages).toBe(0);
        expect(body.page).toBe(1);
        expect(body.limit).toBe(20);
      },
    );

    /*
     * 16. PAGINAÇÃO COM FILTROS
     */
    it(
      'mantém a paginação ao filtrar por tipo',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            type: 'APPOINTMENT_REMINDER',
            page: 2,
            limit: 1,
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(2);
        expect(body.page).toBe(2);
        expect(body.limit).toBe(1);
        expect(body.totalPages).toBe(2);
        expect(body.data).toHaveLength(1);

        expect(
          body.data[0]?.status,
        ).toBe('PENDING');

        expect(
          body.data[0]?.recipient,
        ).toBe('cliente1@exemplo.test');
      },
    );

    /*
     * 17. ISOLAMENTO COM FILTROS
     */
    it(
      'mantém o isolamento entre empresas ao combinar filtros',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            tenantId: secondTenantId,
            status: 'SENT',
            type: 'APPOINTMENT_CONFIRMED',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(1);
        expect(body.data).toHaveLength(1);

        expect(
          body.data[0]?.recipient,
        ).toBe('cliente2@exemplo.test');

        expect(
          body.data.some(
            (item) =>
              item.recipient ===
              'cliente6@exemplo.test',
          ),
        ).toBe(false);
      },
    );

    /*
     * 18. VALIDAÇÃO DE STATUS E TIPO
     */
    it(
      'rejeita status e tipos inválidos',
      async () => {
        const invalidQueries = [
          { status: 'INVALID' },
          { status: 'sent' },
          { status: '' },
          { status: 'UNCERTAIN,FAILED' },
          { type: 'INVALID' },
          { type: 'appointment_reminder' },
          { type: '' },
          { type: 'APPOINTMENT_REMINDER,SENT' },
        ];

        for (const query of invalidQueries) {
          const response = await request(
            app.getHttpServer(),
          )
            .get('/notifications')
            .query(query)
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

          expect(response.status).toBe(400);
        }
      },
    );

    /*
     * 19. NOVO — DATA INICIAL E FINAL
     *
     * As cinco notificações da empresa A
     * foram criadas no dia 20/10/2026
     * no horário de São Paulo.
     */
    it(
      'filtra notificações de um único dia',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            startDate: '2026-10-20',
            endDate: '2026-10-20',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(5);
        expect(body.data).toHaveLength(5);
        expect(body.totalPages).toBe(1);
      },
    );

    /*
     * 20. NOVO — SOMENTE DATA INICIAL
     */
    it(
      'aceita filtro somente com startDate',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            startDate: '2026-10-20',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(5);
      },
    );

    /*
     * 21. NOVO — SOMENTE DATA FINAL
     */
    it(
      'aceita filtro somente com endDate',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            endDate: '2026-10-20',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(5);
      },
    );

    /*
     * 22. NOVO — PERÍODO SEM RESULTADOS
     */
    it(
      'retorna lista vazia para período sem notificações',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            startDate: '2026-10-21',
            endDate: '2026-10-31',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(0);
        expect(body.data).toEqual([]);
        expect(body.totalPages).toBe(0);
      },
    );

    /*
     * 23. NOVO — PERÍODO + STATUS + TIPO
     */
    it(
      'combina período, status, tipo e paginação',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            startDate: '2026-10-20',
            endDate: '2026-10-20',
            status: 'UNCERTAIN',
            type: 'APPOINTMENT_REMINDER',
            page: 1,
            limit: 1,
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(200);

        const body =
          response.body as NotificationResponse;

        expect(body.total).toBe(1);
        expect(body.page).toBe(1);
        expect(body.limit).toBe(1);
        expect(body.totalPages).toBe(1);
        expect(body.data).toHaveLength(1);

        expect(
          body.data[0]?.id,
        ).toBe(uncertainDeliveryId);

        expect(
          body.data[0]?.status,
        ).toBe('UNCERTAIN');

        expect(
          body.data[0]?.type,
        ).toBe('APPOINTMENT_REMINDER');
      },
    );

    /*
     * 24. NOVO — DATAS INVÁLIDAS
     */
    it(
      'rejeita datas inválidas',
      async () => {
        const invalidQueries = [
          { startDate: '20/10/2026' },
          { startDate: '2026-2-20' },
          { startDate: '2026-13-01' },
          { startDate: '2026-02-30' },
          { startDate: '2025-02-29' },
          { startDate: '' },
          { endDate: 'abc' },
          { endDate: '2026-00-10' },
          { endDate: '2026-10-32' },
          { endDate: '' },
        ];

        for (const query of invalidQueries) {
          const response = await request(
            app.getHttpServer(),
          )
            .get('/notifications')
            .query(query)
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

          expect(response.status).toBe(400);
        }
      },
    );

    /*
     * 25. NOVO — PERÍODO INVERTIDO
     */
    it(
      'rejeita startDate posterior a endDate',
      async () => {
        const response = await request(
          app.getHttpServer(),
        )
          .get('/notifications')
          .query({
            startDate: '2026-10-22',
            endDate: '2026-10-20',
          })
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

        expect(response.status).toBe(400);
      },
    );

    /*
     * 26. NOVO — LIMITES DO DIA EM SÃO PAULO
     *
     * Em 20/10/2026, São Paulo
     * usa UTC-03:00.
     *
     * Horários de teste:
     *
     * UTC                    São Paulo
     * 2026-10-20 02:59:59 -> 19/10 23:59:59
     * 2026-10-20 03:00:00 -> 20/10 00:00:00
     * 2026-10-21 02:59:59 -> 20/10 23:59:59
     * 2026-10-21 03:00:00 -> 21/10 00:00:00
     *
     * Consultar 20/10 deve incluir
     * somente os dois horários
     * intermediários, além das
     * cinco notificações originais.
     */
    it(
      'respeita os limites de meia-noite em America/Sao_Paulo',
      async () => {
        const boundaryNotifications = [];

        try {
          const beforeDay =
            await createNotification(
              tenantId,
              21,
              'PENDING',
              'APPOINTMENT_REQUESTED',
              new Date(
                '2026-10-20T02:59:59.000Z',
              ),
            );

          boundaryNotifications.push(
            beforeDay.id,
          );

          const startOfDay =
            await createNotification(
              tenantId,
              22,
              'PENDING',
              'APPOINTMENT_REQUESTED',
              new Date(
                '2026-10-20T03:00:00.000Z',
              ),
            );

          boundaryNotifications.push(
            startOfDay.id,
          );

          const endOfDay =
            await createNotification(
              tenantId,
              23,
              'PENDING',
              'APPOINTMENT_REQUESTED',
              new Date(
                '2026-10-21T02:59:59.000Z',
              ),
            );

          boundaryNotifications.push(
            endOfDay.id,
          );

          const afterDay =
            await createNotification(
              tenantId,
              24,
              'PENDING',
              'APPOINTMENT_REQUESTED',
              new Date(
                '2026-10-21T03:00:00.000Z',
              ),
            );

          boundaryNotifications.push(
            afterDay.id,
          );

          /*
           * Consulta apenas 20/10/2026
           * no horário de São Paulo.
           */
          const response = await request(
            app.getHttpServer(),
          )
            .get('/notifications')
            .query({
              startDate: '2026-10-20',
              endDate: '2026-10-20',
            })
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            );

          expect(response.status).toBe(200);

          const body =
            response.body as NotificationResponse;

          /*
           * Cinco notificações originais
           * e duas das fronteiras.
           */
          expect(body.total).toBe(7);
          expect(body.data).toHaveLength(7);

          const ids = body.data.map(
            (item) => item.id,
          );

          expect(ids).toContain(
            startOfDay.id,
          );

          expect(ids).toContain(
            endOfDay.id,
          );

          expect(ids).not.toContain(
            beforeDay.id,
          );

          expect(ids).not.toContain(
            afterDay.id,
          );

          /*
           * O filtro por tipo deve
           * retornar exatamente
           * os dois registros válidos
           * das fronteiras.
           */
          const filteredResponse =
            await request(
              app.getHttpServer(),
            )
              .get('/notifications')
              .query({
                startDate: '2026-10-20',
                endDate: '2026-10-20',
                type: 'APPOINTMENT_REQUESTED',
              })
              .set(
                'Authorization',
                `Bearer ${ownerToken}`,
              );

          expect(
            filteredResponse.status,
          ).toBe(200);

          const filteredBody =
            filteredResponse.body as NotificationResponse;

          expect(filteredBody.total).toBe(2);
          expect(
            filteredBody.data,
          ).toHaveLength(2);

          const filteredIds =
            filteredBody.data.map(
              (item) => item.id,
            );

          expect(filteredIds).toContain(
            startOfDay.id,
          );

          expect(filteredIds).toContain(
            endOfDay.id,
          );

          expect(filteredIds).not.toContain(
            beforeDay.id,
          );

          expect(filteredIds).not.toContain(
            afterDay.id,
          );
        } finally {
          /*
           * Remove apenas os registros
           * temporários deste teste.
           *
           * As notificações originais
           * permanecem disponíveis
           * até o afterAll.
           */
          if (
            boundaryNotifications.length > 0
          ) {
            await prisma.notificationDelivery.deleteMany({
              where: {
                tenantId,
                id: {
                  in: boundaryNotifications,
                },
              },
            });
          }
        }
      },
    );
  },
);
