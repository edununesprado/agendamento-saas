
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
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

const TIMEZONE = 'America/Sao_Paulo';

type AppointmentFixture = {
  id: string;
  startsAt: DateTime;
};

describe('Fluxo de auditoria de agendamentos (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantId: string;
  let ownerUserId: string;
  let ownerMembershipId: string;
  let ownerToken: string;

  let employeeId: string;
  let serviceId: string;
  let clientId: string;

  let fixtureSequence = 0;

  const runId = randomUUID().replace(/-/g, '');

  const ownerName = 'Owner Auditoria E2E';
  const ownerEmail = `owner.audit.${runId}@example.test`;
  const password = 'Teste@12345';

  const sendMail = vi.fn().mockResolvedValue(true);

  /*
   * Datas futuras para que o scheduler de
   * lembretes não interfira nos cenários.
   */
  function getStartDate(dayOffset: number): DateTime {
    return DateTime.now()
      .setZone(TIMEZONE)
      .plus({
        days: 15 + dayOffset,
      })
      .startOf('day')
      .plus({
        hours: 10,
      });
  }

  /*
   * Cria agendamentos diretamente no banco
   * de testes, permitindo testar cada
   * transição de estado separadamente.
   */
  async function createFixture(
    status: 'PENDING' | 'CONFIRMED',
  ): Promise<AppointmentFixture> {
    fixtureSequence += 1;

    const startsAt = getStartDate(
      fixtureSequence,
    );

    const endsAt = startsAt.plus({
      minutes: 30,
    });

    const appointment =
      await prisma.appointment.create({
        data: {
          tenantId,
          employeeId,
          serviceId,
          clientId,

          startsAt: startsAt.toJSDate(),
          endsAt: endsAt.toJSDate(),

          durationMin: 30,
          priceCents: 5000,

          status,
        },
      });

    return {
      id: appointment.id,
      startsAt,
    };
  }

  function authorization(token = ownerToken) {
    return `Bearer ${token}`;
  }

  async function findAudit(
    appointmentId: string,
  ) {
    return prisma.appointmentAuditLog.findMany({
      where: {
        tenantId,
        appointmentId,
      },

      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  beforeAll(async () => {
    /*
     * SEGURANÇA:
     * Os testes E2E devem utilizar somente
     * o banco agendamento_test.
     */
    const databaseUrl =
      process.env.DATABASE_URL;

    if (
      !databaseUrl ||
      new URL(databaseUrl).pathname !==
        '/agendamento_test'
    ) {
      throw new Error(
        'SEGURANÇA: banco E2E incorreto',
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

    prisma = app.get(PrismaService);

    /*
     * Cria uma empresa exclusiva para
     * este arquivo de teste.
     */
    const registration = await request(
      app.getHttpServer(),
    )
      .post('/auth/register')
      .send({
        name: ownerName,
        email: ownerEmail,
        password,
        companyName:
          `Empresa Auditoria ${runId}`,
      });

    expect(registration.status).toBe(201);

    tenantId = registration.body.tenant.id;
    ownerUserId = registration.body.user.id;
    ownerMembershipId =
      registration.body.membership.id;

    const login = await request(
      app.getHttpServer(),
    )
      .post('/auth/login')
      .send({
        email: ownerEmail,
        password,
      });

    expect([200, 201]).toContain(
      login.status,
    );

    ownerToken = login.body.accessToken;

    /*
     * Funcionário, serviço e cliente
     * para os agendamentos de teste.
     */
    const employee =
      await prisma.employee.create({
        data: {
          tenantId,
          name: 'Profissional Auditoria',
        },
      });

    employeeId = employee.id;

    const service =
      await prisma.service.create({
        data: {
          tenantId,
          name: 'Serviço Auditoria',
          durationMin: 30,
          priceCents: 5000,
        },
      });

    serviceId = service.id;

    const client = await prisma.client.create({
      data: {
        tenantId,
        name: 'Cliente Auditoria',
        email:
          `cliente.audit.${runId}@example.test`,
      },
    });

    clientId = client.id;

    await prisma.employeeService.create({
      data: {
        employeeId,
        serviceId,
      },
    });

    /*
     * Disponibilidade diária das 08:00
     * às 18:00 para testar criação e
     * reagendamento reais pela API.
     */
    await prisma.availabilityRule.createMany({
      data: (
        [
          'SUNDAY',
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
        ] as const
      ).map((dayOfWeek) => ({
        tenantId,
        employeeId,
        dayOfWeek,
        startMinute: 480,
        endMinute: 1080,
      })),
    });
  }, 60000);

  afterAll(async () => {
    /*
     * Limpa exclusivamente os registros
     * criados por este arquivo de teste.
     */
    if (prisma && tenantId) {
      await prisma.tenant.deleteMany({
        where: {
          id: tenantId,
        },
      });
    }

    if (prisma && ownerUserId) {
      await prisma.user.deleteMany({
        where: {
          id: ownerUserId,
        },
      });
    }

    if (app) {
      await app.close();
    }
  }, 30000);

  it('registra CREATED na criação interna', async () => {
    const startsAt = getStartDate(0);

    const response = await request(
      app.getHttpServer(),
    )
      .post('/appointments')
      .set(
        'Authorization',
        authorization(),
      )
      .send({
        employeeId,
        serviceId,
        clientId,
        startsAt: startsAt.toISO(),
        notes: 'Teste de auditoria',
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe(
      'CONFIRMED',
    );

    const appointmentId =
      response.body.id as string;

    const audit = await findAudit(
      appointmentId,
    );

    expect(audit).toHaveLength(1);

    expect(audit[0]).toMatchObject({
      tenantId,
      appointmentId,
      action: 'CREATED',
      actorType: 'USER',
      actorUserId: ownerUserId,
      actorName: ownerName,
      actorRole: 'OWNER',
    });

    expect(audit[0].after).toMatchObject({
      status: 'CONFIRMED',
      employeeId,
      serviceId,
    });

    const notification =
      await prisma.notificationDelivery.findFirst({
        where: {
          tenantId,
          appointmentId,
          type: 'APPOINTMENT_CONFIRMED',
        },
      });

    expect(notification).not.toBeNull();
  });

  it('registra CONFIRMED com o estado anterior', async () => {
    const fixture = await createFixture(
      'PENDING',
    );

    const response = await request(
      app.getHttpServer(),
    )
      .patch(
        `/appointments/${fixture.id}/status`,
      )
      .set(
        'Authorization',
        authorization(),
      )
      .send({
        status: 'CONFIRMED',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe(
      'CONFIRMED',
    );

    const audit = await findAudit(
      fixture.id,
    );

    expect(audit).toHaveLength(1);

    expect(audit[0]).toMatchObject({
      action: 'CONFIRMED',
      actorType: 'USER',
      actorUserId: ownerUserId,
      actorName: ownerName,
      actorRole: 'OWNER',
    });

    expect(audit[0].before).toEqual({
      status: 'PENDING',
    });

    expect(audit[0].after).toEqual({
      status: 'CONFIRMED',
    });

    const notification =
      await prisma.notificationDelivery.findFirst({
        where: {
          appointmentId: fixture.id,
          tenantId,
          type: 'APPOINTMENT_CONFIRMED',
        },
      });

    expect(notification).not.toBeNull();

    /*
     * Confirma também a consulta HTTP
     * implementada na etapa anterior.
     */
    const historyResponse = await request(
      app.getHttpServer(),
    )
      .get(
        `/appointments/${fixture.id}/history`,
      )
      .set(
        'Authorization',
        authorization(),
      );

    expect(historyResponse.status).toBe(
      200,
    );

    expect(historyResponse.body.data).toHaveLength(
      1,
    );

    expect(
      historyResponse.body.data[0].action,
    ).toBe('CONFIRMED');
  });

  it.each([
    'COMPLETED',
    'NO_SHOW',
  ] as const)(
    'registra a mudança de status para %s',
    async (status) => {
      const fixture = await createFixture(
        'CONFIRMED',
      );

      const response = await request(
        app.getHttpServer(),
      )
        .patch(
          `/appointments/${fixture.id}/status`,
        )
        .set(
          'Authorization',
          authorization(),
        )
        .send({
          status,
        });

      expect(response.status).toBe(200);

      expect(response.body.status).toBe(
        status,
      );

      const audit = await findAudit(
        fixture.id,
      );

      expect(audit).toHaveLength(1);

      expect(audit[0].action).toBe(
        status,
      );

      expect(audit[0].actorUserId).toBe(
        ownerUserId,
      );

      expect(audit[0].before).toEqual({
        status: 'CONFIRMED',
      });

      expect(audit[0].after).toEqual({
        status,
      });
    },
  );

  it('registra CANCELED e o motivo do cancelamento', async () => {
    const fixture = await createFixture(
      'CONFIRMED',
    );

    const response = await request(
      app.getHttpServer(),
    )
      .patch(
        `/appointments/${fixture.id}/cancel`,
      )
      .set(
        'Authorization',
        authorization(),
      )
      .send({
        reason: 'Solicitação do cliente',
      });

    expect(response.status).toBe(200);

    expect(response.body.status).toBe(
      'CANCELED',
    );

    const audit = await findAudit(
      fixture.id,
    );

    expect(audit).toHaveLength(1);

    expect(audit[0].action).toBe(
      'CANCELED',
    );

    expect(audit[0].actorUserId).toBe(
      ownerUserId,
    );

    expect(audit[0].before).toMatchObject({
      status: 'CONFIRMED',
    });

    expect(audit[0].after).toMatchObject({
      status: 'CANCELED',
      cancelReason:
        'Solicitação do cliente',
    });

    const notification =
      await prisma.notificationDelivery.findFirst({
        where: {
          tenantId,
          appointmentId: fixture.id,
          type: 'APPOINTMENT_CANCELED',
        },
      });

    expect(notification).not.toBeNull();
  });

  it('registra RESCHEDULED com horários anteriores e novos', async () => {
    const fixture = await createFixture(
      'CONFIRMED',
    );

    const newStartsAt = fixture.startsAt.plus({
      hours: 1,
    });

    const response = await request(
      app.getHttpServer(),
    )
      .patch(
        `/appointments/${fixture.id}/reschedule`,
      )
      .set(
        'Authorization',
        authorization(),
      )
      .send({
        startsAt: newStartsAt.toISO(),
      });

    expect(response.status).toBe(200);

    const audit = await findAudit(
      fixture.id,
    );

    expect(audit).toHaveLength(1);

    expect(audit[0].action).toBe(
      'RESCHEDULED',
    );

    expect(audit[0].actorUserId).toBe(
      ownerUserId,
    );

    expect(audit[0].before).toMatchObject({
      startsAt:
        fixture.startsAt.toUTC().toISO({
          suppressMilliseconds: false,
        }),
    });

    expect(audit[0].after).toMatchObject({
      startsAt:
        newStartsAt.toUTC().toISO({
          suppressMilliseconds: false,
        }),
    });

    const saved =
      await prisma.appointment.findUnique({
        where: {
          id: fixture.id,
        },
      });

    expect(
      saved?.startsAt.toISOString(),
    ).toBe(
      newStartsAt.toUTC().toISO({
        suppressMilliseconds: false,
      }),
    );
  });

  it('não registra reagendamento quando o horário não muda', async () => {
    const fixture = await createFixture(
      'CONFIRMED',
    );

    const response = await request(
      app.getHttpServer(),
    )
      .patch(
        `/appointments/${fixture.id}/reschedule`,
      )
      .set(
        'Authorization',
        authorization(),
      )
      .send({
        startsAt: fixture.startsAt.toISO(),
      });

    expect(response.status).toBe(200);

    const audit = await findAudit(
      fixture.id,
    );

    expect(audit).toHaveLength(0);

    const notifications =
      await prisma.notificationDelivery.count({
        where: {
          tenantId,
          appointmentId: fixture.id,
          type: 'APPOINTMENT_RESCHEDULED',
        },
      });

    expect(notifications).toBe(0);
  });

  it('reverte confirmação e notificação se a auditoria rejeitar o responsável', async () => {
    const fixture = await createFixture(
      'PENDING',
    );

    /*
     * Simula um token assinado com um
     * identificador de usuário que não
     * pertence à empresa.
     *
     * O guard valida a assinatura.
     * A auditoria verifica também o
     * vínculo real do usuário.
     */
    const secret =
      process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET ausente no teste',
      );
    }

    const jwt = new JwtService();

    const invalidActorToken = await jwt.signAsync(
      {
        sub: `invalid-${randomUUID()}`,
        tenantId,
        membershipId: ownerMembershipId,
        role: 'OWNER',
      },
      {
        secret,
        expiresIn: '1h',
      },
    );

    const response = await request(
      app.getHttpServer(),
    )
      .patch(
        `/appointments/${fixture.id}/status`,
      )
      .set(
        'Authorization',
        authorization(invalidActorToken),
      )
      .send({
        status: 'CONFIRMED',
      });

    /*
     * O componente de auditoria precisa
     * rejeitar o usuário inexistente.
     */
    expect(response.status).toBe(403);

    /*
     * A transação inteira deve ser
     * revertida, inclusive o UPDATE
     * e o registro de notificação.
     */
    const appointment =
      await prisma.appointment.findUnique({
        where: {
          id: fixture.id,
        },
      });

    expect(appointment?.status).toBe(
      'PENDING',
    );

    const audit = await findAudit(
      fixture.id,
    );

    expect(audit).toHaveLength(0);

    const notifications =
      await prisma.notificationDelivery.count({
        where: {
          tenantId,
          appointmentId: fixture.id,
          type: 'APPOINTMENT_CONFIRMED',
        },
      });

    expect(notifications).toBe(0);
  });
});
