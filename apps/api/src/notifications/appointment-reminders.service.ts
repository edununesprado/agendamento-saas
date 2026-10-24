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
  | 'sent'
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
        result.sent > 0 ||
        result.failed > 0 ||
        result.skipped > 0
      ) {
        this.logger.log(
          `Lembretes processados: ${result.sent} enviado(s), ${result.failed} falha(s), ${result.skipped} ignorado(s)`,
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
    let sent = 0;
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
          result === 'sent'
        ) {
          sent += 1;
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
      sent,
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
      return await this.prisma.$transaction(
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
            return 'skipped';
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
           * Revalidamos todas as condições
           * depois de adquirir o lock.
           *
           * Isso protege contra mudanças
           * ocorridas desde a primeira busca.
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
           * O e-mail é enviado antes de
           * preencher reminderSentAt.
           *
           * Se o SMTP falhar, o campo fica
           * NULL e o scheduler poderá tentar
           * novamente futuramente.
           */
          const emailSent =
            await this.notificationsService.notifyAppointmentReminder({
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
            });

          if (
            !emailSent
          ) {
            return 'failed';
          }

          /*
           * updateMany adiciona mais uma
           * proteção contra duplicidade.
           *
           * Só atualizamos se o lembrete
           * continuar sem marcação.
           */
          const updated =
            await tx.appointment.updateMany({
              where: {
                id:
                  appointment.id,

                status:
                  'CONFIRMED',

                reminderSentAt:
                  null,
              },

              data: {
                reminderSentAt:
                  new Date(),
              },
            });

          if (
            updated.count !== 1
          ) {
            return 'skipped';
          }

          return 'sent';
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