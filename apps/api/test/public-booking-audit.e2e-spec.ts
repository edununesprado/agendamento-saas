
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
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

/*
 * Permite simular uma falha de gravação
 * na auditoria sem alterar o PostgreSQL.
 *
 * Nas demais situações, chama a função
 * real de auditoria.
 */
const auditControl = vi.hoisted(() => ({
  shouldFail: false,
}));

vi.mock(
  '../src/appointments/appointment-audit.js',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../src/appointments/appointment-audit.js')
      >();

    return {
      ...original,

      recordAppointmentAudit: async (
        ...args: Parameters<
          typeof original.recordAppointmentAudit
        >
      ) => {
        if (auditControl.shouldFail) {
          throw new Error(
            'Falha simulada da auditoria pública',
          );
        }

        return original.recordAppointmentAudit(
          ...args,
        );
      },
    };
  },
);

import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/notifications/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Auditoria de agendamento público (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantId: string;
  let tenantSlug: string;
  let ownerUserId: string;
  let ownerToken: string;

  let employeeId: string;
  let serviceId: string;
  let appointmentId: string;

  const timezone = 'America/Sao_Paulo';

  const runId = randomUUID().replace(
    /-/g,
    '',
  );

  const ownerEmail =
    `owner.public.audit.${runId}@example.test`;

  const password = 'Teste@12345';

  const clientName =
    'Cliente Privado Auditoria';

  const clientEmail =
    `cliente.public.audit.${runId}@example.test`;

  const clientPhone = '34999998881';

  const clientNotes =
    'Anotação privada de teste';

  const sendMail = vi
    .fn()
    .mockResolvedValue(true);

  /*
   * Os horários são calculados para dois
   * dias no futuro, respeitando os limites
   * da página pública.
   */
  function bookingStartsAt(
    hour: number,
    minute = 0,
  ): string {
    const value = DateTime.now()
      .setZone(timezone)
      .plus({
        days: 2,
      })
      .startOf('day')
      .set({
        hour,
        minute,
      })
      .toISO();

    if (!value) {
      throw new Error(
        'Não foi possível gerar o horário do teste',
      );
    }

    return value;
  }

  function bookingPayload(
    phone: string,
    startsAt: string,
  ) {
    return {
      employeeId,
      serviceId,
      startsAt,

      client: {
        name: clientName,
        phone,
        email: clientEmail,
      },

      notes: clientNotes,
    };
  }

  function createPublicBooking(
    phone: string,
    startsAt: string,
  ) {
    return request(
      app.getHttpServer(),
    )
      .post(
        `/public/tenants/${tenantSlug}/appointments`,
      )
      .send(
        bookingPayload(
          phone,
          startsAt,
        ),
      );
  }

  async function getAudit(
    targetAppointmentId: string,
  ) {
    return prisma.appointmentAuditLog.findMany({
      where: {
        tenantId,
        appointmentId:
          targetAppointmentId,
      },

      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  beforeAll(
    async () => {
      /*
       * SEGURANÇA
       *
       * Nunca executar com o banco
       * de desenvolvimento.
       */
      const databaseUrl =
        process.env.DATABASE_URL;

      if (
        !databaseUrl ||
        new URL(databaseUrl).pathname !==
          '/agendamento_test'
      ) {
        throw new Error(
          'SEGURANÇA: o teste deve usar agendamento_test',
        );
      }

      const moduleRef =
        await Test.createTestingModule({
          imports: [AppModule],
        })
          .overrideProvider(
            EmailService,
          )
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

      prisma =
        app.get(PrismaService);

      /*
       * Empresa exclusiva deste teste.
       */
      const registration =
        await request(
          app.getHttpServer(),
        )
          .post(
            '/auth/register',
          )
          .send({
            name:
              'Owner Auditoria Pública',
            email:
              ownerEmail,
            password,
            companyName:
              `Empresa Auditoria Publica ${runId}`,
          });

      expect(
        registration.status,
      ).toBe(201);

      tenantId =
        registration.body.tenant.id;

      tenantSlug =
        registration.body.tenant.slug;

      ownerUserId =
        registration.body.user.id;

      const login =
        await request(
          app.getHttpServer(),
        )
          .post(
            '/auth/login',
          )
          .send({
            email:
              ownerEmail,
            password,
          });

      expect(
        [200, 201],
      ).toContain(
        login.status,
      );

      ownerToken =
        login.body.accessToken;

      /*
       * Profissional.
       */
      const employee =
        await prisma.employee.create({
          data: {
            tenantId,
            name:
              'Profissional Auditoria Pública',
          },
        });

      employeeId =
        employee.id;

      /*
       * Serviço.
       */
      const service =
        await prisma.service.create({
          data: {
            tenantId,
            name:
              'Corte Auditoria Pública',
            durationMin: 30,
            priceCents: 5000,
          },
        });

      serviceId =
        service.id;

      /*
       * Vincula profissional ao serviço.
       */
      await prisma.employeeService.create({
        data: {
          employeeId,
          serviceId,
        },
      });

      /*
       * Disponibilidade nos sete dias
       * da semana, das 08:00 às 18:00.
       */
      await prisma.availabilityRule.createMany({
        data: (
          [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
            'SUNDAY',
          ] as const
        ).map((dayOfWeek) => ({
          tenantId,
          employeeId,
          dayOfWeek,
          startMinute: 480,
          endMinute: 1080,
        })),
      });
    },
    60000,
  );

  afterAll(
    async () => {
      auditControl.shouldFail = false;

      /*
       * Remove somente os registros
       * criados por este teste.
       */
      if (
        prisma &&
        tenantId
      ) {
        await prisma.tenant.deleteMany({
          where: {
            id: tenantId,
          },
        });
      }

      if (
        prisma &&
        ownerUserId
      ) {
        await prisma.user.deleteMany({
          where: {
            id: ownerUserId,
          },
        });
      }

      if (app) {
        await app.close();
      }
    },
    30000,
  );

  it(
    'cria agendamento PENDING, notificação e auditoria PUBLIC',
    async () => {
      const startsAt =
        bookingStartsAt(10);

      const response =
        await createPublicBooking(
          clientPhone,
          startsAt,
        );

      expect(
        response.status,
      ).toBe(201);

      expect(
        response.body.status,
      ).toBe('PENDING');

      appointmentId =
        response.body.id;

      const saved =
        await prisma.appointment.findUnique({
          where: {
            id: appointmentId,
          },
        });

      expect(saved).not.toBeNull();

      expect(saved?.status).toBe(
        'PENDING',
      );

      /*
       * Notificação na Transactional Outbox.
       */
      const notification =
        await prisma.notificationDelivery.findFirst({
          where: {
            tenantId,
            appointmentId,
            type:
              'APPOINTMENT_REQUESTED',
          },
        });

      expect(
        notification,
      ).not.toBeNull();

      /*
       * Histórico na mesma operação.
       */
      const audit =
        await getAudit(
          appointmentId,
        );

      expect(audit).toHaveLength(1);

      expect(
        audit[0],
      ).toMatchObject({
        tenantId,
        appointmentId,
        action: 'CREATED',
        actorType: 'PUBLIC',
        actorUserId: null,
      });

      expect(
        audit[0].after,
      ).toMatchObject({
        status: 'PENDING',
        employeeId,
        serviceId,
        startsAt:
          DateTime.fromISO(
            startsAt,
          )
            .toUTC()
            .toISO(),
      });
    },
  );

  it(
    'não grava dados pessoais no snapshot da auditoria',
    async () => {
      const audit =
        await getAudit(
          appointmentId,
        );

      expect(audit).toHaveLength(1);

      const snapshot = JSON.stringify({
        before: audit[0].before,
        after: audit[0].after,
      });

      expect(snapshot).not.toContain(
        clientName,
      );

      expect(snapshot).not.toContain(
        clientEmail,
      );

      expect(snapshot).not.toContain(
        clientPhone,
      );

      expect(snapshot).not.toContain(
        clientNotes,
      );

      expect(
        audit[0].actorType,
      ).toBe('PUBLIC');

      expect(
        audit[0].actorUserId,
      ).toBeNull();
    },
  );

  it(
    'permite consultar o evento público na rota administrativa',
    async () => {
      const response =
        await request(
          app.getHttpServer(),
        )
          .get(
            `/appointments/${appointmentId}/history`,
          )
          .set(
            'Authorization',
            `Bearer ${ownerToken}`,
          );

      expect(
        response.status,
      ).toBe(200);

      expect(
        response.body.data,
      ).toHaveLength(1);

      expect(
        response.body.data[0],
      ).toMatchObject({
        action: 'CREATED',
        actorType: 'PUBLIC',
        actorUserId: null,
      });
    },
  );

  it(
    'não cria outra auditoria quando o cliente tenta reservar o mesmo horário',
    async () => {
      const startsAt =
        bookingStartsAt(10);

      const beforeAudit =
        await prisma.appointmentAuditLog.count({
          where: {
            tenantId,
          },
        });

      const beforeNotifications =
        await prisma.notificationDelivery.count({
          where: {
            tenantId,
          },
        });

      const response =
        await createPublicBooking(
          clientPhone,
          startsAt,
        );

      expect(
        response.status,
      ).toBe(409);

      const afterAudit =
        await prisma.appointmentAuditLog.count({
          where: {
            tenantId,
          },
        });

      const afterNotifications =
        await prisma.notificationDelivery.count({
          where: {
            tenantId,
          },
        });

      expect(
        afterAudit,
      ).toBe(beforeAudit);

      expect(
        afterNotifications,
      ).toBe(beforeNotifications);
    },
  );

  it(
    'desfaz a criação de outro cliente quando o horário já está ocupado',
    async () => {
      const secondPhone =
        '34999998882';

      const response =
        await createPublicBooking(
          secondPhone,
          bookingStartsAt(10),
        );

      expect(
        response.status,
      ).toBe(409);

      /*
       * O cadastro do cliente é criado
       * dentro da transação.
       *
       * Como o horário estava ocupado,
       * o cliente não pode permanecer
       * salvo isoladamente.
       */
      const clients =
        await prisma.client.count({
          where: {
            tenantId,
            phone: secondPhone,
          },
        });

      expect(clients).toBe(0);
    },
  );

  it(
    'executa rollback completo se a auditoria falhar',
    async () => {
      const rollbackPhone =
        '34999998883';

      const startsAt =
        bookingStartsAt(11);

      const beforeAppointments =
        await prisma.appointment.count({
          where: {
            tenantId,
          },
        });

      const beforeNotifications =
        await prisma.notificationDelivery.count({
          where: {
            tenantId,
          },
        });

      const beforeAudits =
        await prisma.appointmentAuditLog.count({
          where: {
            tenantId,
          },
        });

      /*
 * Simula falha apenas na escrita
 * da auditoria.
 */
auditControl.shouldFail = true;

let response: Awaited<
  ReturnType<typeof createPublicBooking>
    > | undefined;

    try {
    response =
        await createPublicBooking(
        rollbackPhone,
        startsAt,
        );
    } finally {
    auditControl.shouldFail = false;
    }

    /*
    * A API deve retornar erro porque
    * a auditoria lançou uma exceção.
    */
    expect(
    response?.status,
    ).toBe(500);

      const afterAppointments =
        await prisma.appointment.count({
          where: {
            tenantId,
          },
        });

      const afterNotifications =
        await prisma.notificationDelivery.count({
          where: {
            tenantId,
          },
        });

      const afterAudits =
        await prisma.appointmentAuditLog.count({
          where: {
            tenantId,
          },
        });

      /*
       * A transação deve ter desfeito
       * todas as operações.
       */
      expect(
        afterAppointments,
      ).toBe(beforeAppointments);

      expect(
        afterNotifications,
      ).toBe(beforeNotifications);

      expect(
        afterAudits,
      ).toBe(beforeAudits);

      /*
       * O cliente criado durante a
       * tentativa também deve ser desfeito.
       */
      const client =
        await prisma.client.findFirst({
          where: {
            tenantId,
            phone: rollbackPhone,
          },
        });

      expect(client).toBeNull();
    },
  );
});
