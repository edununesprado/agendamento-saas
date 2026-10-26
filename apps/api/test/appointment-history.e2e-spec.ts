
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
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

type HistoryEvent = {
  id: string;
  appointmentId: string;
  action: string;
  actorType: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};

type HistoryResponse = {
  appointmentId: string;
  data: HistoryEvent[];
};

describe('Histórico de agendamentos (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let ownerToken: string;
  let adminToken: string;
  let receptionistToken: string;
  let staffToken: string;
  let secondOwnerToken: string;

  let tenantId: string;
  let secondTenantId: string;

  let appointmentId: string;
  let emptyAppointmentId: string;
  let largeHistoryAppointmentId: string;
  let foreignAppointmentId: string;

  const runId = randomUUID().replace(/-/g, '');
  const password = 'Teste@12345';

  const ownerEmail =
    `owner.history.${runId}@example.test`;

  const adminEmail =
    `admin.history.${runId}@example.test`;

  const receptionistEmail =
    `reception.history.${runId}@example.test`;

  const staffEmail =
    `staff.history.${runId}@example.test`;

  const secondOwnerEmail =
    `second.history.${runId}@example.test`;

  const createdTenantIds: string[] = [];

  const testEmails = [
    ownerEmail,
    adminEmail,
    receptionistEmail,
    staffEmail,
    secondOwnerEmail,
  ];

  const sendMail = vi.fn().mockResolvedValue(true);

  async function login(email: string): Promise<string> {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/auth/login')
      .send({
        email,
        password,
      });

    expect([200, 201]).toContain(response.status);
    expect(response.body.accessToken).toBeTruthy();

    return response.body.accessToken as string;
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

    const registeredTenantId =
      response.body.tenant.id as string;

    const userId =
      response.body.user.id as string;

    createdTenantIds.push(registeredTenantId);

    const token = await login(email);

    return {
      token,
      tenantId: registeredTenantId,
      userId,
    };
  }

  async function createMember(
    name: string,
    email: string,
    role: 'ADMIN' | 'RECEPTIONIST' | 'STAFF',
  ) {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/team-members')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name,
        email,
        password,
        role,
      });

    expect(response.status).toBe(201);
  }

  async function createAppointment(
    targetTenantId: string,
    suffix: string,
  ): Promise<string> {
    const employee = await prisma.employee.create({
      data: {
        tenantId: targetTenantId,
        name: `Profissional ${suffix}`,
      },
    });

    const service = await prisma.service.create({
      data: {
        tenantId: targetTenantId,
        name: `Serviço ${suffix}`,
        durationMin: 30,
        priceCents: 5000,
      },
    });

    const client = await prisma.client.create({
      data: {
        tenantId: targetTenantId,
        name: `Cliente ${suffix}`,
      },
    });

    const appointment = await prisma.appointment.create({
      data: {
        tenantId: targetTenantId,
        employeeId: employee.id,
        serviceId: service.id,
        clientId: client.id,
        startsAt: new Date('2026-12-01T12:00:00.000Z'),
        endsAt: new Date('2026-12-01T12:30:00.000Z'),
        durationMin: 30,
        priceCents: 5000,
        status: 'PENDING',
      },
    });

    return appointment.id;
  }

  function getHistory(id: string, token?: string) {
    const req = request(app.getHttpServer())
      .get(`/appointments/${id}/history`);

    return token
      ? req.set('Authorization', `Bearer ${token}`)
      : req;
  }

  beforeAll(async () => {
    /*
     * PROTEÇÃO:
     * Este teste utiliza somente agendamento_test.
     */
    const databaseUrl = process.env.DATABASE_URL;

    if (
      !databaseUrl ||
      new URL(databaseUrl).pathname !== '/agendamento_test'
    ) {
      throw new Error(
        'SEGURANÇA: os testes E2E devem usar agendamento_test',
      );
    }

    const moduleRef = await Test.createTestingModule({
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

    prisma = app.get(PrismaService);

    /*
     * EMPRESA A
     */
    const owner = await registerOwner(
      'Owner Histórico E2E',
      ownerEmail,
      `Empresa Histórico A ${runId}`,
    );

    ownerToken = owner.token;
    tenantId = owner.tenantId;

    await createMember(
      'Admin Histórico E2E',
      adminEmail,
      'ADMIN',
    );

    await createMember(
      'Recepcionista Histórico E2E',
      receptionistEmail,
      'RECEPTIONIST',
    );

    await createMember(
      'Funcionário Histórico E2E',
      staffEmail,
      'STAFF',
    );

    adminToken = await login(adminEmail);
    receptionistToken = await login(receptionistEmail);
    staffToken = await login(staffEmail);

    /*
     * EMPRESA B
     */
    const secondOwner = await registerOwner(
      'Owner Histórico Empresa B',
      secondOwnerEmail,
      `Empresa Histórico B ${runId}`,
    );

    secondOwnerToken = secondOwner.token;
    secondTenantId = secondOwner.tenantId;

    expect(secondTenantId).not.toBe(tenantId);

    /*
     * Agendamentos usados pelos testes.
     * São criados diretamente no banco E2E.
     */
    appointmentId = await createAppointment(
      tenantId,
      'Principal',
    );

    emptyAppointmentId = await createAppointment(
      tenantId,
      'Sem Histórico',
    );

    largeHistoryAppointmentId =
      await createAppointment(
        tenantId,
        'Histórico Grande',
      );

    foreignAppointmentId = await createAppointment(
      secondTenantId,
      'Empresa B',
    );

    /*
     * Quatro eventos para o agendamento principal.
     */
    await prisma.appointmentAuditLog.createMany({
      data: [
        {
          tenantId,
          appointmentId,
          action: 'CREATED',
          actorType: 'PUBLIC',
          after: {
            status: 'PENDING',
          },
          createdAt: new Date(
            '2026-10-20T10:00:00.000Z',
          ),
        },
        {
          tenantId,
          appointmentId,
          action: 'CONFIRMED',
          actorType: 'USER',
          actorUserId: owner.userId,
          actorName: 'Owner Histórico E2E',
          actorRole: 'OWNER',
          before: {
            status: 'PENDING',
          },
          after: {
            status: 'CONFIRMED',
          },
          createdAt: new Date(
            '2026-10-20T11:00:00.000Z',
          ),
        },
        {
          tenantId,
          appointmentId,
          action: 'RESCHEDULED',
          actorType: 'USER',
          actorName: 'Admin Histórico E2E',
          actorRole: 'ADMIN',
          before: {
            startsAt: '2026-12-01T12:00:00.000Z',
          },
          after: {
            startsAt: '2026-12-01T13:00:00.000Z',
          },
          createdAt: new Date(
            '2026-10-20T12:00:00.000Z',
          ),
        },
        {
          tenantId,
          appointmentId,
          action: 'CANCELED',
          actorType: 'USER',
          actorName: 'Recepcionista Histórico E2E',
          actorRole: 'RECEPTIONIST',
          before: {
            status: 'CONFIRMED',
          },
          after: {
            status: 'CANCELED',
          },
          createdAt: new Date(
            '2026-10-20T13:00:00.000Z',
          ),
        },
      ],
    });

    /*
     * Evento pertencente à outra empresa.
     */
    await prisma.appointmentAuditLog.create({
      data: {
        tenantId: secondTenantId,
        appointmentId: foreignAppointmentId,
        action: 'CREATED',
        actorType: 'USER',
        actorUserId: secondOwner.userId,
        actorName: 'Owner Histórico Empresa B',
        actorRole: 'OWNER',
        after: {
          status: 'PENDING',
        },
        createdAt: new Date(
          '2026-10-20T14:00:00.000Z',
        ),
      },
    });

    /*
     * Histórico com 105 eventos para
     * validar o limite de 100 registros.
     */
    await prisma.appointmentAuditLog.createMany({
      data: Array.from(
        { length: 105 },
        (_, index) => ({
          tenantId,
          appointmentId: largeHistoryAppointmentId,
          action: 'UPDATED' as const,
          actorType: 'SYSTEM' as const,
          after: {
            index,
          },
          createdAt: new Date(
            Date.parse('2026-10-21T10:00:00.000Z') +
              index * 1000,
          ),
        }),
      ),
    });
  }, 60000);

  afterAll(async () => {
    /*
     * Remove apenas as empresas e usuários
     * criados por este arquivo de teste.
     */
    if (prisma) {
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
  }, 30000);

  it('bloqueia consulta sem autenticação', async () => {
    const response = await getHistory(appointmentId);

    expect(response.status).toBe(401);
  });

  it('bloqueia token inválido', async () => {
    const response = await getHistory(
      appointmentId,
      'token-invalido',
    );

    expect(response.status).toBe(401);
  });

  it('permite consulta pelo OWNER', async () => {
    const response = await getHistory(
      appointmentId,
      ownerToken,
    );

    expect(response.status).toBe(200);

    const body = response.body as HistoryResponse;

    expect(body.appointmentId).toBe(appointmentId);
    expect(body.data).toHaveLength(4);
  });

  it('permite consulta pelo ADMIN', async () => {
    const response = await getHistory(
      appointmentId,
      adminToken,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(4);
  });

  /*
   * ETAPA 6.1 — REGRA DE SEGURANÇA
   *
   * RECEPTIONIST pode gerenciar agendamentos,
   * mas não pode consultar a Auditoria.
   *
   * O backend deve retornar HTTP 403.
   */
  it('bloqueia consulta pelo RECEPTIONIST', async () => {
    const response = await getHistory(
      appointmentId,
      receptionistToken,
    );

    expect(response.status).toBe(403);
  });

  it('bloqueia consulta pelo STAFF', async () => {
    const response = await getHistory(
      appointmentId,
      staffToken,
    );

    expect(response.status).toBe(403);
  });

  it('retorna 404 para agendamento inexistente', async () => {
    const response = await getHistory(
      'agendamento-inexistente',
      ownerToken,
    );

    expect(response.status).toBe(404);
  });

  it('impede acesso ao histórico de outra empresa', async () => {
    const response = await getHistory(
      foreignAppointmentId,
      ownerToken,
    );

    expect(response.status).toBe(404);
  });

  it('impede a empresa B de consultar a empresa A', async () => {
    const response = await getHistory(
      appointmentId,
      secondOwnerToken,
    );

    expect(response.status).toBe(404);
  });

  it('permite que a empresa B consulte seu próprio histórico', async () => {
    const response = await getHistory(
      foreignAppointmentId,
      secondOwnerToken,
    );

    expect(response.status).toBe(200);

    const body = response.body as HistoryResponse;

    expect(body.data).toHaveLength(1);
    expect(body.data[0].actorName).toBe(
      'Owner Histórico Empresa B',
    );
  });

  it('retorna histórico vazio quando não existem eventos', async () => {
    const response = await getHistory(
      emptyAppointmentId,
      ownerToken,
    );

    expect(response.status).toBe(200);

    const body = response.body as HistoryResponse;

    expect(body.appointmentId).toBe(
      emptyAppointmentId,
    );

    expect(body.data).toEqual([]);
  });

  it('ordena eventos do mais recente para o mais antigo', async () => {
    const response = await getHistory(
      appointmentId,
      ownerToken,
    );

    expect(response.status).toBe(200);

    const body = response.body as HistoryResponse;

    expect(
      body.data.map((event) => event.action),
    ).toEqual([
      'CANCELED',
      'RESCHEDULED',
      'CONFIRMED',
      'CREATED',
    ]);

    expect(
      body.data.map((event) => event.createdAt),
    ).toEqual([
      '2026-10-20T13:00:00.000Z',
      '2026-10-20T12:00:00.000Z',
      '2026-10-20T11:00:00.000Z',
      '2026-10-20T10:00:00.000Z',
    ]);
  });

  it('retorna os valores anteriores e novos', async () => {
    const response = await getHistory(
      appointmentId,
      ownerToken,
    );

    expect(response.status).toBe(200);

    const body = response.body as HistoryResponse;

    const confirmation = body.data.find(
      (event) => event.action === 'CONFIRMED',
    );

    expect(confirmation).toBeDefined();

    expect(confirmation?.before).toEqual({
      status: 'PENDING',
    });

    expect(confirmation?.after).toEqual({
      status: 'CONFIRMED',
    });

    expect(confirmation?.actorName).toBe(
      'Owner Histórico E2E',
    );

    expect(confirmation?.actorRole).toBe('OWNER');
  });

  it('limita a consulta aos 100 eventos mais recentes', async () => {
    const response = await getHistory(
      largeHistoryAppointmentId,
      ownerToken,
    );

    expect(response.status).toBe(200);

    const body = response.body as HistoryResponse;

    expect(body.data).toHaveLength(100);

    expect(body.data[0].after).toEqual({
      index: 104,
    });

    expect(body.data[99].after).toEqual({
      index: 5,
    });
  });

  it('não altera o histórico ao consultar a rota', async () => {
    const before = await prisma.appointmentAuditLog.count({
      where: {
        tenantId,
        appointmentId,
      },
    });

    const response = await getHistory(
      appointmentId,
      ownerToken,
    );

    expect(response.status).toBe(200);

    const after = await prisma.appointmentAuditLog.count({
      where: {
        tenantId,
        appointmentId,
      },
    });

    expect(after).toBe(before);
  });
});
