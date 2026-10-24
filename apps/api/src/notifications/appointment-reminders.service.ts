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

const REMINDER_WINDOW_HOURS =
  24;

const REMINDER_BATCH_SIZE =
  100;

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

  private isEnabled() {
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

  /**
   * Executa a verificação a cada minuto.
   *
   * O processamento só acontece quando
   * APPOINTMENT_REMINDERS_ENABLED=true.
   *
   * waitForCompletion impede duas execuções
   * simultâneas dentro da mesma instância
   * da API.
   */
  @Cron(
    CronExpression.EVERY_MINUTE,
    {
      name:
        'appointment-reminders',

      waitForCompletion:
        true,
    },
  )
  async handleCron() {
    if (
      !this.isEnabled()
    ) {
      return;
    }

    try {
      const result =
        await this.processDueReminders();

      if (
        result.sent >
        0
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

  /**
   * Procura agendamentos confirmados que:
   *
   * - ainda não receberam lembrete;
   * - começam no futuro;
   * - começam dentro das próximas 24 horas.
   *
   * Este método é público de propósito
   * para permitir testes automatizados.
   */
  async processDueReminders(
    now = new Date(),
  ) {
    const windowEnd =
      new Date(
        now.getTime() +
          REMINDER_WINDOW_HOURS *
            60 *
            60 *
            1000,
      );

    const candidates =
      await this.prisma.appointment.findMany({
        where: {
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
            is: {
              email: {
                not:
                  null,
              },
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
          REMINDER_BATCH_SIZE,
      });

    let sent =
      0;

    let failed =
      0;

    let skipped =
      0;

    for (
      const candidate
      of candidates
    ) {
      const result =
        await this.processAppointment(
          candidate.id,
          now,
          windowEnd,
        );

      if (
        result ===
        'sent'
      ) {
        sent++;
      } else if (
        result ===
        'failed'
      ) {
        failed++;
      } else {
        skipped++;
      }
    }

    return {
      found:
        candidates.length,

      sent,
      failed,
      skipped,
    };
  }

  /**
   * Processa um único agendamento.
   *
   * O advisory lock também protege contra
   * duas instâncias da API tentando enviar
   * o mesmo lembrete simultaneamente.
   */
  private async processAppointment(
    appointmentId: string,
    now: Date,
    windowEnd: Date,
  ): Promise<ReminderResult> {
    try {
      return await this.prisma.$transaction(
        async (
          tx,
        ) => {
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
            !lockResult[0]
              ?.locked
          ) {
            return 'skipped';
          }

          /**
           * Fazemos uma segunda verificação
           * depois de adquirir o lock.
           *
           * Outro processo pode ter enviado
           * o lembrete entre a primeira busca
           * e este ponto.
           */
          const appointment =
            await tx.appointment.findFirst({
              where: {
                id:
                  appointmentId,

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
              },

              include: {
                tenant: {
                  select: {
                    name:
                      true,

                    timezone:
                      true,
                  },
                },

                employee: {
                  select: {
                    name:
                      true,
                  },
                },

                service: {
                  select: {
                    name:
                      true,
                  },
                },

                client: {
                  select: {
                    name:
                      true,

                    email:
                      true,
                  },
                },
              },
            });

          if (
            !appointment
          ) {
            return 'skipped';
          }

          if (
            !appointment
              .client
              .email
          ) {
            return 'skipped';
          }

          const emailSent =
            await this.notificationsService.notifyAppointmentReminder(
              {
                clientName:
                  appointment
                    .client
                    .name,

                clientEmail:
                  appointment
                    .client
                    .email,

                tenantName:
                  appointment
                    .tenant
                    .name,

                serviceName:
                  appointment
                    .service
                    .name,

                employeeName:
                  appointment
                    .employee
                    .name,

                startsAt:
                  appointment
                    .startsAt,

                timezone:
                  appointment
                    .tenant
                    .timezone,
              },
            );

          /**
           * Se o SMTP falhar, não marcamos
           * reminderSentAt.
           *
           * Assim o próximo ciclo poderá
           * tentar novamente.
           */
          if (
            !emailSent
          ) {
            return 'failed';
          }

          const updateResult =
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
            updateResult.count !==
            1
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