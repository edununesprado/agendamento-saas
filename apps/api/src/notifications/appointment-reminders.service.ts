import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Cron,
  CronExpression,
} from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service.js';

import { NotificationsService } from './notifications.service.js';

type ReminderResult =
  | 'queued'
  | 'failed'
  | 'skipped';

@Injectable()
export class AppointmentRemindersService {
  private readonly logger =
    new Logger(
      AppointmentRemindersService.name,
    );

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  private isSchedulerEnabled() {
    return (
      this.configService
        .get<string>(
          'APPOINTMENT_REMINDERS_ENABLED',
        )
        ?.trim()
        .toLowerCase() ===
      'true'
    );
  }

  private normalizeReminderHours(
    value: number,
  ) {
    /*
     * Proteção adicional.
     *
     * Mesmo existindo validação nas
     * configurações da empresa, o scheduler
     * não deve confiar cegamente no valor
     * armazenado.
     */
    return Math.min(
      168,
      Math.max(
        1,
        value,
      ),
    );
  }

  @Cron(
    CronExpression.EVERY_MINUTE,
    {
      waitForCompletion:
        true,
    },
  )
  async handleAppointmentReminders() {
    /*
     * Esta flag é global.
     *
     * Se estiver false, nenhum tenant
     * terá lembretes processados.
     */
    if (
      !this.isSchedulerEnabled()
    ) {
      return;
    }

    try {
      const result =
        await this.processDueReminders();

      if (
        result.queued > 0 ||
        result.failed > 0 ||
        result.skipped > 0
      ) {
        this.logger.log(
          `Lembretes processados: ${result.queued} enfileirado(s), ${result.failed} falha(s), ${result.skipped} ignorado(s)`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      this.logger.error(
        `Falha ao processar lembretes: ${message}`,
      );
    }
  }

  async processDueReminders(
    now = new Date(),
  ) {
    let queued = 0;
    let failed = 0;
    let skipped = 0;

    /*
     * Primeiro buscamos somente empresas
     * que possuem lembretes ativados.
     *
     * Cada empresa poderá possuir uma
     * antecedência diferente.
     */
    const tenants =
      await this.prisma.tenant.findMany({
        where: {
          appointmentRemindersEnabled:
            true,
        },

        select: {
          id:
            true,

          name:
            true,

          timezone:
            true,

          appointmentReminderHoursBefore:
            true,
        },

        orderBy: {
          id:
            'asc',
        },
      });

    for (
      const tenant of tenants
    ) {
      const reminderHours =
        this.normalizeReminderHours(
          tenant.appointmentReminderHoursBefore,
        );

      const windowEnd =
        new Date(
          now.getTime() +
            reminderHours *
              60 *
              60 *
              1000,
        );

      /*
       * Cada tenant possui seu próprio
       * limite de processamento.
       *
       * Isso evita que uma única empresa
       * ocupe todo o lote.
       */
      const candidates =
        await this.prisma.appointment.findMany({
          where: {
            tenantId:
              tenant.id,

            status:
              'CONFIRMED',

            reminderSentAt:
              null,

            startsAt: {
              gt:
                now,

              lte:
                windowEnd,
            },

            client: {
              email: {
                not:
                  null,
              },
            },
          },

          select: {
            id:
              true,
          },

          orderBy: {
            startsAt:
              'asc',
          },

          take:
            100,
        });

      for (
        const candidate of candidates
      ) {
        const result =
          await this.processAppointmentReminder(
            candidate.id,
            tenant.id,
            now,
          );

        if (
          result ===
          'queued'
        ) {
          queued +=
            1;
        }

        if (
          result ===
          'failed'
        ) {
          failed +=
            1;
        }

        if (
          result ===
          'skipped'
        ) {
          skipped +=
            1;
        }
      }
    }

    return {
      queued,
      failed,
      skipped,
    };
  }

  private async processAppointmentReminder(
    appointmentId: string,
    tenantId: string,
    now: Date,
  ): Promise<ReminderResult> {
    try {
      /*
       * TRANSACTIONAL OUTBOX
       *
       * Agora toda esta operação acontece
       * dentro da mesma transação:
       *
       * 1. adquire advisory lock;
       * 2. revalida tenant;
       * 3. revalida Appointment;
       * 4. cria NotificationDelivery.
       *
       * Nenhum SMTP acontece aqui.
       *
       * O envio real continua sendo
       * responsabilidade do
       * NotificationWorkerService.
       */
      return await this.prisma.$transaction(
        async (tx) => {
          /*
           * Evita que duas instâncias da API
           * processem o mesmo lembrete ao
           * mesmo tempo.
           *
           * pg_try_advisory_xact_lock não
           * espera pelo lock.
           *
           * Se outro processo estiver
           * processando o mesmo Appointment,
           * esta execução é ignorada.
           */
          const lockResult =
            await tx.$queryRaw<
              Array<{
                locked: boolean;
              }>
            >`
              SELECT pg_try_advisory_xact_lock(
                hashtext('appointment-reminder'),
                hashtext(${appointmentId})
              ) AS locked
            `;

          if (
            !lockResult[0]?.locked
          ) {
            return 'skipped';
          }

          /*
           * Revalidamos a configuração
           * da empresa depois de obter
           * o lock.
           *
           * A empresa pode ter desativado
           * os lembretes entre a primeira
           * busca e este momento.
           */
          const tenant =
            await tx.tenant.findUnique({
              where: {
                id:
                  tenantId,
              },

              select: {
                name:
                  true,

                timezone:
                  true,

                appointmentRemindersEnabled:
                  true,

                appointmentReminderHoursBefore:
                  true,
              },
            });

          if (
            !tenant ||
            !tenant.appointmentRemindersEnabled
          ) {
            return 'skipped';
          }

          const reminderHours =
            this.normalizeReminderHours(
              tenant.appointmentReminderHoursBefore,
            );

          const windowEnd =
            new Date(
              now.getTime() +
                reminderHours *
                  60 *
                  60 *
                  1000,
            );

          /*
           * Revalida o Appointment depois
           * de adquirir o lock.
           *
           * Ele precisa continuar:
           *
           * - CONFIRMED;
           * - sem reminderSentAt;
           * - dentro da janela;
           * - com cliente que possui e-mail.
           */
          const appointment =
            await tx.appointment.findFirst({
              where: {
                id:
                  appointmentId,

                tenantId,

                status:
                  'CONFIRMED',

                reminderSentAt:
                  null,

                startsAt: {
                  gt:
                    now,

                  lte:
                    windowEnd,
                },

                client: {
                  email: {
                    not:
                      null,
                  },
                },
              },

              include: {
                employee:
                  true,

                service:
                  true,

                client:
                  true,
              },
            });

          if (
            !appointment ||
            !appointment.client.email
          ) {
            return 'skipped';
          }

          /*
           * A NotificationDelivery é criada
           * ainda dentro desta transação.
           *
           * throwOnError garante que qualquer
           * falha de persistência seja
           * propagada para o Prisma.
           *
           * Nesse caso toda a transação
           * sofre rollback.
           */
          const queued =
            await this.notificationsService.notifyAppointmentReminder(
              {
                tenantId,

                appointmentId:
                  appointment.id,

                clientName:
                  appointment.client.name,

                clientEmail:
                  appointment.client.email,

                tenantName:
                  tenant.name,

                serviceName:
                  appointment.service.name,

                employeeName:
                  appointment.employee.name,

                startsAt:
                  appointment.startsAt,

                timezone:
                  tenant.timezone,
              },
              {
                client:
                  tx,

                throwOnError:
                  true,
              },
            );

          /*
           * Normalmente, tendo e-mail válido,
           * queued será true.
           *
           * Mantemos esta proteção caso o
           * NotificationsService decida não
           * criar a entrega.
           */
          if (
            !queued
          ) {
            return 'failed';
          }

          /*
           * IMPORTANTE:
           *
           * reminderSentAt continua NULL.
           *
           * Ele só será preenchido pelo
           * NotificationWorkerService depois
           * que o SMTP confirmar o envio.
           */
          return 'queued';
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      this.logger.error(
        `Falha ao processar lembrete do agendamento ${appointmentId}: ${message}`,
      );

      return 'failed';
    }
  }
}