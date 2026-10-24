import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type LoginResponse = {
  accessToken: string;
};

describe(
  'Reagendamento de agendamento (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let ownerToken: string;
    let tenantId: string;

    let employeeId: string;
    let serviceId: string;
    let clientId: string;

    let appointmentId: string;

    const notifyAppointmentRequested =
      vi.fn();

    const notifyAppointmentConfirmed =
      vi.fn();

    const notifyAppointmentCanceled =
      vi.fn();

    const notifyAppointmentRescheduled =
      vi.fn();

    const password =
      'Teste@12345';

    const ownerEmail =
      'owner.reschedule.e2e@teste.com';

    /*
     * 10/11/2026 é terça-feira.
     *
     * America/Sao_Paulo:
     * 09:00 local = 12:00 UTC
     * 10:00 local = 13:00 UTC
     */
    const appointmentDate =
      '2026-11-10';

    const originalStartsAt =
      '2026-11-10T12:00:00.000Z';

    const originalEndsAt =
      '2026-11-10T12:30:00.000Z';

    const newStartsAtLocal =
      '2026-11-10T10:00:00-03:00';

    const newStartsAtUtc =
      '2026-11-10T13:00:00.000Z';

    const newEndsAtUtc =
      '2026-11-10T13:30:00.000Z';

    async function login(
      email: string,
    ) {
      const response =
        await request(
          app.getHttpServer(),
        )
          .post(
            '/auth/login',
          )
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

    beforeAll(
      async () => {
        /*
         * Proteção para impedir que o teste
         * apague dados fora do banco E2E.
         */
        if (
          !process.env.DATABASE_URL?.includes(
            'agendamento_test',
          )
        ) {
          throw new Error(
            'SEGURANÇA: o teste deve usar agendamento_test',
          );
        }

        const moduleRef =
          await Test.createTestingModule({
            imports: [
              AppModule,
            ],
          })
            .overrideProvider(
              NotificationsService,
            )
            .useValue({
              notifyAppointmentRequested,
              notifyAppointmentConfirmed,
              notifyAppointmentCanceled,
              notifyAppointmentRescheduled,
            })
            .compile();

        app =
          moduleRef.createNestApplication();

        app.useGlobalPipes(
          new ValidationPipe({
            whitelist:
              true,

            transform:
              true,
          }),
        );

        await app.init();

        prisma =
          app.get(
            PrismaService,
          );

        /*
         * Limpa somente o banco de testes.
         */
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        /*
         * Empresa + OWNER.
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
                'Owner Reschedule E2E',

              email:
                ownerEmail,

              password,

              companyName:
                'Empresa Reschedule E2E',
            });

        expect(
          registerResponse.status,
        ).toBe(201);

        ownerToken =
          await login(
            ownerEmail,
          );

        /*
         * Descobre o tenant criado.
         */
        const tenantResponse =
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
          tenantResponse.status,
        ).toBe(200);

        tenantId =
          tenantResponse.body.id;

        expect(
          tenantId,
        ).toBeTruthy();

        /*
         * Cria funcionário.
         */
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
                'Carlos Reschedule E2E',

              email:
                'carlos.reschedule.e2e@teste.com',
            });

        expect(
          employeeResponse.status,
        ).toBe(201);

        employeeId =
          employeeResponse.body.id;

        /*
         * Cria serviço de 30 minutos.
         */
        const serviceResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              '/services',
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              name:
                'Corte Reschedule E2E',

              durationMin:
                30,

              priceCents:
                5000,
            });

        expect(
          serviceResponse.status,
        ).toBe(201);

        serviceId =
          serviceResponse.body.id;

        /*
         * Cria cliente com e-mail para
         * permitir a notificação.
         */
        const clientResponse =
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
                'Maria Reschedule E2E',

              email:
                'maria.reschedule.e2e@teste.com',
            });

        expect(
          clientResponse.status,
        ).toBe(201);

        clientId =
          clientResponse.body.id;

        /*
         * Funcionário precisa realizar o
         * serviço para o AvailabilityService.
         */
        await prisma.employeeService.create({
          data: {
            employeeId,
            serviceId,
          },
        });

        /*
         * Terça-feira das 08:00 às 12:00.
         *
         * 08:00 = 480 minutos.
         * 12:00 = 720 minutos.
         */
        await prisma.availabilityRule.create({
          data: {
            tenantId,
            employeeId,

            dayOfWeek:
              'TUESDAY',

            startMinute:
              480,

            endMinute:
              720,
          },
        });

        /*
         * Agenda inicial às 09:00
         * America/Sao_Paulo.
         *
         * Simula que o cliente já recebeu
         * um lembrete antes do reagendamento.
         */
        const appointment =
          await prisma.appointment.create({
            data: {
              tenantId,
              employeeId,
              serviceId,
              clientId,

              startsAt:
                new Date(
                  originalStartsAt,
                ),

              endsAt:
                new Date(
                  originalEndsAt,
                ),

              durationMin:
                30,

              priceCents:
                5000,

              status:
                'CONFIRMED',

              reminderSentAt:
                new Date(
                  '2026-11-10T09:00:00.000Z',
                ),

              notes:
                'Agendamento para teste de reagendamento',
            },
          });

        appointmentId =
          appointment.id;
      },
      30000,
    );

    beforeEach(() => {
      vi.clearAllMocks();

      notifyAppointmentRequested.mockResolvedValue(
        true,
      );

      notifyAppointmentConfirmed.mockResolvedValue(
        true,
      );

      notifyAppointmentCanceled.mockResolvedValue(
        true,
      );

      notifyAppointmentRescheduled.mockResolvedValue(
        true,
      );
    });

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

    it(
      'OWNER consegue reagendar e a notificação recebe o horário anterior e o novo',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${appointmentId}/reschedule`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              startsAt:
                newStartsAtLocal,
            });

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.id,
        ).toBe(
          appointmentId,
        );

        expect(
          response.body.status,
        ).toBe(
          'CONFIRMED',
        );

        expect(
          response.body.startsAt,
        ).toBe(
          newStartsAtUtc,
        );

        expect(
          response.body.endsAt,
        ).toBe(
          newEndsAtUtc,
        );

        /*
         * Confirma também diretamente
         * no banco de dados.
         */
        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointmentId,
            },
          });

        expect(
          savedAppointment,
        ).not.toBeNull();

        expect(
          savedAppointment?.startsAt.toISOString(),
        ).toBe(
          newStartsAtUtc,
        );

        expect(
          savedAppointment?.endsAt.toISOString(),
        ).toBe(
          newEndsAtUtc,
        );

        /*
         * Como houve mudança real de horário,
         * o lembrete anterior precisa ser
         * invalidado para permitir um novo
         * lembrete do novo horário.
         */
        expect(
          savedAppointment?.reminderSentAt,
        ).toBeNull();

        /*
         * A integração com NotificationsService
         * precisa ser chamada apenas depois do
         * reagendamento ter sido concluído.
         */
        expect(
          notifyAppointmentRescheduled,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          notifyAppointmentRescheduled,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            clientName:
              'Maria Reschedule E2E',

            clientEmail:
              'maria.reschedule.e2e@teste.com',

            tenantName:
              'Empresa Reschedule E2E',

            serviceName:
              'Corte Reschedule E2E',

            employeeName:
              'Carlos Reschedule E2E',

            timezone:
              'America/Sao_Paulo',

            previousStartsAt:
              expect.any(
                Date,
              ),

            startsAt:
              expect.any(
                Date,
              ),
          }),
        );

        const notificationData =
          notifyAppointmentRescheduled
            .mock
            .calls[0][0];

        expect(
          notificationData.previousStartsAt.toISOString(),
        ).toBe(
          originalStartsAt,
        );

        expect(
          notificationData.startsAt.toISOString(),
        ).toBe(
          newStartsAtUtc,
        );
      },
    );

    it(
      'não envia outra notificação quando o horário informado é exatamente o mesmo',
      async () => {
        /*
         * O primeiro teste deixou o
         * agendamento às 10:00.
         *
         * Simulamos que, depois disso,
         * um novo lembrete já foi enviado.
         */
        const reminderSentAt =
          new Date(
            '2026-11-10T10:30:00.000Z',
          );

        await prisma.appointment.update({
          where: {
            id:
              appointmentId,
          },

          data: {
            reminderSentAt,
          },
        });

        /*
         * Reagenda para exatamente o mesmo
         * horário já salvo: 10:00.
         */
        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${appointmentId}/reschedule`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              startsAt:
                newStartsAtLocal,
            });

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.startsAt,
        ).toBe(
          newStartsAtUtc,
        );

        /*
         * Como não houve mudança real de horário,
         * reminderSentAt deve permanecer intacto.
         */
        const savedAppointment =
          await prisma.appointment.findUnique({
            where: {
              id:
                appointmentId,
            },
          });

        expect(
          savedAppointment,
        ).not.toBeNull();

        expect(
          savedAppointment?.reminderSentAt?.toISOString(),
        ).toBe(
          reminderSentAt.toISOString(),
        );

        /*
         * O AppointmentsService não deve
         * gerar e-mail redundante quando
         * não houve mudança real de horário.
         */
        expect(
          notifyAppointmentRescheduled,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não permite reagendar um agendamento cancelado',
      async () => {
        /*
         * Criamos outro agendamento para
         * não alterar o cenário principal.
         */
        const canceledAppointment =
          await prisma.appointment.create({
            data: {
              tenantId,
              employeeId,
              serviceId,
              clientId,

              startsAt:
                new Date(
                  '2026-11-10T14:00:00.000Z',
                ),

              endsAt:
                new Date(
                  '2026-11-10T14:30:00.000Z',
                ),

              durationMin:
                30,

              priceCents:
                5000,

              status:
                'CANCELED',

              canceledAt:
                new Date(),
            },
          });

        const response =
          await request(
            app.getHttpServer(),
          )
            .patch(
              `/appointments/${canceledAppointment.id}/reschedule`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              startsAt:
                '2026-11-10T11:30:00-03:00',
            });

        expect(
          response.status,
        ).toBe(400);

        expect(
          response.body.message,
        ).toContain(
          'CANCELED',
        );

        expect(
          notifyAppointmentRescheduled,
        ).not.toHaveBeenCalled();
      },
    );
  },
);