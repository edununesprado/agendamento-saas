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
     * Depois também teremos validação
     * no DTO das configurações da empresa,
     * mas o scheduler não deve confiar
     * cegamente no valor armazenado.
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
       * Isso evita que agendamentos de
       * uma empresa ocupem todo o lote
       * e prejudiquem outras empresas.
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
          result === 'queued'
        ) {
          queued += 1;
        }

        if (
          result === 'failed'
        ) {
          failed += 1;
        }

        if (
          result === 'skipped'
        ) {
          skipped += 1;
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
       * A transação abaixo serve somente para:
       *
       * 1. adquirir o lock;
       * 2. revalidar tenant e agendamento;
       * 3. preparar os dados do lembrete.
       *
       * Nenhum SMTP e nenhuma operação da
       * NotificationQueueService acontece
       * dentro desta transação.
       */
      const notificationData =
        await this.prisma.$transaction(
          async (tx) => {
            /*
             * Evita que duas instâncias da API
             * processem o mesmo lembrete ao
             * mesmo tempo.
             *
             * pg_try_advisory_xact_lock não
             * fica esperando: se outro processo
             * já possuir o lock, ignoramos esta
             * execução e tentamos novamente
             * futuramente.
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
              return null;
            }

            /*
             * Buscamos novamente a configuração
             * dentro da transação.
             *
             * A empresa pode ter desativado os
             * lembretes entre a consulta inicial
             * e este processamento.
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
              return null;
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
             * Revalidamos todas as condições
             * depois de adquirir o lock.
             *
             * reminderSentAt continua NULL até
             * o worker confirmar que o e-mail
             * foi realmente enviado.
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
              return null;
            }

            return {
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
            };
          },
        );

      if (
        !notificationData
      ) {
        return 'skipped';
      }

      /*
       * A partir daqui a transação já terminou.
       *
       * NotificationsService apenas registra
       * NotificationDelivery PENDING.
       * O SMTP será executado posteriormente
       * pelo NotificationWorkerService.
       */
      const queued =
        await this.notificationsService.notifyAppointmentReminder(
          notificationData,
        );

      if (
        !queued
      ) {
        return 'failed';
      }

      /*
       * Não preenchemos reminderSentAt aqui.
       *
       * O worker fará isso somente depois de
       * confirmar o envio com sucesso.
       */
      return 'queued';
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