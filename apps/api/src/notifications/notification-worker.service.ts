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

import { EmailService } from './email.service.js';

type ProcessResult =
  | 'sent'
  | 'retry'
  | 'failed'
  | 'skipped';

type ClaimedDelivery = {
  id: string;

  tenantId: string;

  appointmentId:
    | string
    | null;

  type:
    | 'APPOINTMENT_REQUESTED'
    | 'APPOINTMENT_CONFIRMED'
    | 'APPOINTMENT_CANCELED'
    | 'APPOINTMENT_RESCHEDULED'
    | 'APPOINTMENT_REMINDER';

  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'SENT'
    | 'FAILED'
    | 'CANCELED';

  recipient: string;

  subject: string;

  text: string;

  html:
    | string
    | null;

  dedupeKey: string;

  attempts: number;

  maxAttempts: number;
};

@Injectable()
export class NotificationWorkerService {
  private readonly logger =
    new Logger(
      NotificationWorkerService.name,
    );

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  private isWorkerEnabled() {
    return (
      this.configService
        .get<string>(
          'NOTIFICATION_QUEUE_ENABLED',
        )
        ?.trim()
        .toLowerCase() ===
      'true'
    );
  }

  private isSmtpExplicitlyDisabled() {
    return (
      this.configService
        .get<string>(
          'SMTP_ENABLED',
        )
        ?.trim()
        .toLowerCase() ===
      'false'
    );
  }

  private getRetryDelayMs(
    attempts: number,
  ) {
    const delaysMinutes = [
      1,
      5,
      15,
      60,
      180,
    ];

    const index =
      Math.min(
        Math.max(
          attempts - 1,
          0,
        ),
        delaysMinutes.length - 1,
      );

    return (
      delaysMinutes[index] *
      60 *
      1000
    );
  }

  private getReminderStartsAtFromDedupeKey(
    appointmentId: string,
    dedupeKey: string,
  ) {
    const prefix =
      `appointment:${appointmentId}:reminder:`;

    if (
      !dedupeKey.startsWith(
        prefix,
      )
    ) {
      return null;
    }

    const value =
      dedupeKey.slice(
        prefix.length,
      );

    const startsAt =
      new Date(
        value,
      );

    if (
      Number.isNaN(
        startsAt.getTime(),
      )
    ) {
      return null;
    }

    return startsAt;
  }

  @Cron(
    CronExpression.EVERY_MINUTE,
    {
      waitForCompletion:
        true,
    },
  )
  async handleNotificationQueue() {
    if (
      !this.isWorkerEnabled()
    ) {
      return;
    }

    /*
     * SMTP desativado propositalmente:
     *
     * não buscamos entregas,
     * não fazemos claim,
     * não incrementamos attempts
     * e não transformamos nada em FAILED.
     *
     * As notificações permanecem na fila
     * para serem processadas quando o SMTP
     * for ativado novamente.
     */
    if (
      this.isSmtpExplicitlyDisabled()
    ) {
      this.logger.debug(
        'Fila de notificações pausada porque SMTP_ENABLED=false',
      );

      return;
    }

    try {
      const result =
        await this.processDueNotifications();

      if (
        result.sent > 0 ||
        result.retry > 0 ||
        result.failed > 0 ||
        result.skipped > 0
      ) {
        this.logger.log(
          `Fila de notificações: ${result.sent} enviada(s), ${result.retry} reagendada(s), ${result.failed} falha(s) definitiva(s), ${result.skipped} ignorada(s)`,
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
        `Falha ao processar fila de notificações: ${message}`,
      );
    }
  }

  async processDueNotifications(
    now = new Date(),
  ) {
    await this.recoverStaleProcessing(
      now,
    );

    const candidates =
      await this.prisma.notificationDelivery.findMany({
        where: {
          OR: [
            {
              status:
                'PENDING',

              nextAttemptAt: {
                lte:
                  now,
              },
            },

            {
              status:
                'FAILED',

              failedAt:
                null,

              nextAttemptAt: {
                lte:
                  now,
              },
            },
          ],
        },

        select: {
          id:
            true,
        },

        orderBy: [
          {
            nextAttemptAt:
              'asc',
          },
          {
            createdAt:
              'asc',
          },
        ],

        take:
          50,
      });

    let sent = 0;
    let retry = 0;
    let failed = 0;
    let skipped = 0;

    for (
      const candidate of candidates
    ) {
      const result =
        await this.processNotification(
          candidate.id,
          now,
        );

      if (
        result === 'sent'
      ) {
        sent += 1;
      }

      if (
        result === 'retry'
      ) {
        retry += 1;
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

    return {
      sent,
      retry,
      failed,
      skipped,
    };
  }

  private async claimNotification(
    id: string,
    now: Date,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const lockResult =
          await tx.$queryRaw<
            Array<{
              locked: boolean;
            }>
          >`
            SELECT pg_try_advisory_xact_lock(
              hashtext('notification-delivery'),
              hashtext(${id})
            ) AS locked
          `;

        if (
          !lockResult[0]?.locked
        ) {
          return null;
        }

        const delivery =
          await tx.notificationDelivery.findFirst({
            where: {
              id,

              OR: [
                {
                  status:
                    'PENDING',
                },

                {
                  status:
                    'FAILED',

                  failedAt:
                    null,
                },
              ],

              nextAttemptAt: {
                lte:
                  now,
              },
            },
          });

        if (
          !delivery
        ) {
          return null;
        }

        if (
          delivery.attempts >=
          delivery.maxAttempts
        ) {
          await tx.notificationDelivery.update({
            where: {
              id:
                delivery.id,
            },

            data: {
              status:
                'FAILED',

              failedAt:
                delivery.failedAt ??
                now,

              processingStartedAt:
                null,
            },
          });

          return null;
        }

        return tx.notificationDelivery.update({
          where: {
            id:
              delivery.id,
          },

          data: {
            status:
              'PROCESSING',

            attempts: {
              increment:
                1,
            },

            lastAttemptAt:
              now,

            processingStartedAt:
              now,

            lastError:
              null,
          },
        });
      },
    );
  }

  private async cancelDelivery(
    deliveryId: string,
    reason: string,
  ) {
    await this.prisma.notificationDelivery.updateMany({
      where: {
        id:
          deliveryId,

        status:
          'PROCESSING',
      },

      data: {
        status:
          'CANCELED',

        processingStartedAt:
          null,

        failedAt:
          null,

        lastError:
          reason.slice(
            0,
            2000,
          ),
      },
    });
  }

  private async validateReminderBeforeSend(
    delivery: ClaimedDelivery,
    now: Date,
  ) {
    if (
      delivery.type !==
      'APPOINTMENT_REMINDER'
    ) {
      return true;
    }

    if (
      !delivery.appointmentId
    ) {
      await this.cancelDelivery(
        delivery.id,
        'Lembrete cancelado porque não possui appointmentId',
      );

      return false;
    }

    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id:
            delivery.appointmentId,

          tenantId:
            delivery.tenantId,
        },

        select: {
          status:
            true,

          startsAt:
            true,

          reminderSentAt:
            true,

          tenant: {
            select: {
              appointmentRemindersEnabled:
                true,
            },
          },
        },
      });

    if (
      !appointment
    ) {
      await this.cancelDelivery(
        delivery.id,
        'Lembrete cancelado porque o agendamento não existe mais',
      );

      return false;
    }

    if (
      !appointment.tenant
        .appointmentRemindersEnabled
    ) {
      await this.cancelDelivery(
        delivery.id,
        'Lembrete cancelado porque os lembretes foram desativados para a empresa',
      );

      return false;
    }

    if (
      appointment.status !==
      'CONFIRMED'
    ) {
      await this.cancelDelivery(
        delivery.id,
        `Lembrete cancelado porque o agendamento está com status ${appointment.status}`,
      );

      return false;
    }

    if (
      appointment.reminderSentAt
    ) {
      await this.cancelDelivery(
        delivery.id,
        'Lembrete cancelado porque o agendamento já possui reminderSentAt',
      );

      return false;
    }

    if (
      appointment.startsAt.getTime() <=
      now.getTime()
    ) {
      await this.cancelDelivery(
        delivery.id,
        'Lembrete cancelado porque o horário do agendamento já passou',
      );

      return false;
    }

    const expectedDedupeKey =
      `appointment:${delivery.appointmentId}:reminder:${appointment.startsAt.toISOString()}`;

    if (
      delivery.dedupeKey !==
      expectedDedupeKey
    ) {
      /*
       * O horário mudou depois que este
       * lembrete foi criado.
       *
       * Portanto esta entrega pertence
       * ao horário antigo e não deve
       * mais ser enviada.
       */
      await this.cancelDelivery(
        delivery.id,
        'Lembrete cancelado porque o agendamento foi reagendado',
      );

      return false;
    }

    return true;
  }

  private async markSent(
    delivery: ClaimedDelivery,
    now: Date,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.notificationDelivery.updateMany({
            where: {
              id:
                delivery.id,

              status:
                'PROCESSING',
            },

            data: {
              status:
                'SENT',

              sentAt:
                now,

              failedAt:
                null,

              processingStartedAt:
                null,

              lastError:
                null,
            },
          });

        if (
          updated.count !==
          1
        ) {
          return;
        }

        if (
          delivery.type !==
            'APPOINTMENT_REMINDER' ||
          !delivery.appointmentId
        ) {
          return;
        }

        const reminderStartsAt =
          this.getReminderStartsAtFromDedupeKey(
            delivery.appointmentId,
            delivery.dedupeKey,
          );

        if (
          !reminderStartsAt
        ) {
          this.logger.warn(
            `Notificação de lembrete ${delivery.id} foi enviada, mas não foi possível identificar o horário no dedupeKey`,
          );

          return;
        }

        /*
         * reminderSentAt só é preenchido
         * depois que EmailService confirmou
         * o envio.
         *
         * Também exigimos que o horário
         * continue sendo exatamente aquele
         * ao qual esta entrega pertence.
         */
        await tx.appointment.updateMany({
          where: {
            id:
              delivery.appointmentId,

            tenantId:
              delivery.tenantId,

            status:
              'CONFIRMED',

            reminderSentAt:
              null,

            startsAt:
              reminderStartsAt,
          },

          data: {
            reminderSentAt:
              now,
          },
        });
      },
    );
  }

  private async processNotification(
    id: string,
    now: Date,
  ): Promise<ProcessResult> {
    const delivery =
      await this.claimNotification(
        id,
        now,
      );

    if (
      !delivery
    ) {
      return 'skipped';
    }

    const currentDelivery =
      delivery as ClaimedDelivery;

    /*
     * Lembretes precisam ser revalidados
     * imediatamente antes do SMTP.
     *
     * Isso evita enviar lembrete antigo
     * depois de cancelamento, reagendamento
     * ou desativação dos lembretes.
     */
    const canSend =
      await this.validateReminderBeforeSend(
        currentDelivery,
        now,
      );

    if (
      !canSend
    ) {
      return 'skipped';
    }

    try {
      /*
       * IMPORTANTE:
       *
       * O SMTP acontece fora de qualquer
       * transação do banco.
       */
      const emailSent =
        await this.emailService.sendMail({
          to:
            currentDelivery.recipient,

          subject:
            currentDelivery.subject,

          text:
            currentDelivery.text,

          html:
            currentDelivery.html ??
            undefined,
        });

      if (
        emailSent
      ) {
        await this.markSent(
          currentDelivery,
          now,
        );

        return 'sent';
      }

      return this.markFailure(
        currentDelivery.id,
        currentDelivery.attempts,
        currentDelivery.maxAttempts,
        'O serviço de e-mail não confirmou o envio',
        now,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      return this.markFailure(
        currentDelivery.id,
        currentDelivery.attempts,
        currentDelivery.maxAttempts,
        message,
        now,
      );
    }
  }

  private async markFailure(
    id: string,
    attempts: number,
    maxAttempts: number,
    errorMessage: string,
    now: Date,
  ): Promise<ProcessResult> {
    const exhausted =
      attempts >=
      maxAttempts;

    const nextAttemptAt =
      exhausted
        ? now
        : new Date(
            now.getTime() +
              this.getRetryDelayMs(
                attempts,
              ),
          );

    await this.prisma.notificationDelivery.updateMany({
      where: {
        id,

        status:
          'PROCESSING',
      },

      data: {
        status:
          'FAILED',

        processingStartedAt:
          null,

        nextAttemptAt,

        lastError:
          errorMessage.slice(
            0,
            2000,
          ),

        failedAt:
          exhausted
            ? now
            : null,
      },
    });

    if (
      exhausted
    ) {
      this.logger.error(
        `Notificação ${id} falhou definitivamente após ${attempts} tentativa(s): ${errorMessage}`,
      );

      return 'failed';
    }

    this.logger.warn(
      `Notificação ${id} falhou na tentativa ${attempts}/${maxAttempts} e será tentada novamente`,
    );

    return 'retry';
  }

  private async recoverStaleProcessing(
    now: Date,
  ) {
    const staleBefore =
      new Date(
        now.getTime() -
          10 *
            60 *
            1000,
      );

    const staleDeliveries =
      await this.prisma.notificationDelivery.findMany({
        where: {
          status:
            'PROCESSING',

          processingStartedAt: {
            lte:
              staleBefore,
          },
        },

        select: {
          id:
            true,

          attempts:
            true,

          maxAttempts:
            true,
        },

        take:
          100,
      });

    for (
      const delivery of staleDeliveries
    ) {
      const exhausted =
        delivery.attempts >=
        delivery.maxAttempts;

      await this.prisma.notificationDelivery.updateMany({
        where: {
          id:
            delivery.id,

          status:
            'PROCESSING',
        },

        data: {
          status:
            'FAILED',

          processingStartedAt:
            null,

          nextAttemptAt:
            now,

          failedAt:
            exhausted
              ? now
              : null,

          lastError:
            'Processamento anterior foi interrompido antes de ser concluído',
        },
      });
    }
  }
}