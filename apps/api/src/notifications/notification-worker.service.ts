
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service.js';

import {
  EmailService,
  SmtpDeliveryUncertainError,
} from './email.service.js';

type ProcessResult =
  | 'sent'
  | 'retry'
  | 'failed'
  | 'skipped';

type ClaimedDelivery = {
  id: string;
  tenantId: string;
  appointmentId: string | null;

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
    | 'CANCELED'
    | 'UNCERTAIN';

  recipient: string;
  subject: string;
  text: string;
  html: string | null;
  dedupeKey: string;

  attempts: number;
  maxAttempts: number;

  processingStartedAt: Date | null;
};

@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(
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
        .get<string>('NOTIFICATION_QUEUE_ENABLED')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  private isSmtpExplicitlyDisabled() {
    return (
      this.configService
        .get<string>('SMTP_ENABLED')
        ?.trim()
        .toLowerCase() === 'false'
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

    const index = Math.min(
      Math.max(attempts - 1, 0),
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

    if (!dedupeKey.startsWith(prefix)) {
      return null;
    }

    const value = dedupeKey.slice(
      prefix.length,
    );

    const startsAt = new Date(value);

    if (Number.isNaN(startsAt.getTime())) {
      return null;
    }

    return startsAt;
  }

  @Cron(
    CronExpression.EVERY_MINUTE,
    {
      waitForCompletion: true,
    },
  )
  async handleNotificationQueue() {
    if (!this.isWorkerEnabled()) {
      return;
    }

    /*
     * SMTP desativado propositalmente:
     *
     * Não buscamos entregas,
     * não fazemos claim,
     * não incrementamos attempts
     * e não transformamos nada em FAILED.
     *
     * As notificações permanecem na fila
     * para processamento futuro.
     */
    if (this.isSmtpExplicitlyDisabled()) {
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
          : String(error);

      this.logger.error(
        `Falha ao processar fila de notificações: ${message}`,
      );
    }
  }

  async processDueNotifications(
    now = new Date(),
  ) {
    await this.recoverStaleProcessing(now);

    /*
     * UNCERTAIN não é elegível
     * para processamento automático.
     *
     * Apenas PENDING e FAILED
     * sem failedAt podem ser processados.
     */
    const candidates =
      await this.prisma.notificationDelivery.findMany({
        where: {
          OR: [
            {
              status: 'PENDING',

              nextAttemptAt: {
                lte: now,
              },
            },

            {
              status: 'FAILED',

              failedAt: null,

              nextAttemptAt: {
                lte: now,
              },
            },
          ],
        },

        select: {
          id: true,
        },

        orderBy: [
          {
            nextAttemptAt: 'asc',
          },
          {
            createdAt: 'asc',
          },
        ],

        take: 50,
      });

    let sent = 0;
    let retry = 0;
    let failed = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const result =
        await this.processNotification(
          candidate.id,
          now,
        );

      if (result === 'sent') {
        sent += 1;
      }

      if (result === 'retry') {
        retry += 1;
      }

      if (result === 'failed') {
        failed += 1;
      }

      if (result === 'skipped') {
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

        if (!lockResult[0]?.locked) {
          return null;
        }

        const delivery =
          await tx.notificationDelivery.findFirst({
            where: {
              id,

              OR: [
                {
                  status: 'PENDING',
                },

                {
                  status: 'FAILED',
                  failedAt: null,
                },
              ],

              nextAttemptAt: {
                lte: now,
              },
            },
          });

        if (!delivery) {
          return null;
        }

        if (
          delivery.attempts >=
          delivery.maxAttempts
        ) {
          await tx.notificationDelivery.update({
            where: {
              id: delivery.id,
            },

            data: {
              status: 'FAILED',

              failedAt:
                delivery.failedAt ?? now,

              processingStartedAt: null,
            },
          });

          return null;
        }

        /*
         * Cada claim incrementa attempts
         * e registra seu início.
         *
         * Esses valores identificam
         * a tentativa responsável.
         */
        return tx.notificationDelivery.update({
          where: {
            id: delivery.id,
          },

          data: {
            status: 'PROCESSING',

            attempts: {
              increment: 1,
            },

            lastAttemptAt: now,

            processingStartedAt: now,

            lastError: null,
          },
        });
      },
    );
  }

  /*
   * Cancela a notificação somente
   * se a tentativa ainda possuir
   * o claim atual.
   */
  private async cancelDelivery(
    delivery: ClaimedDelivery,
    reason: string,
  ) {
    await this.prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,

        status: 'PROCESSING',

        attempts: delivery.attempts,

        processingStartedAt:
          delivery.processingStartedAt,
      },

      data: {
        status: 'CANCELED',

        processingStartedAt: null,

        failedAt: null,

        lastError: reason.slice(
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

    if (!delivery.appointmentId) {
      await this.cancelDelivery(
        delivery,
        'Lembrete cancelado porque não possui appointmentId',
      );

      return false;
    }

    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id: delivery.appointmentId,

          tenantId: delivery.tenantId,
        },

        select: {
          status: true,

          startsAt: true,

          reminderSentAt: true,

          tenant: {
            select: {
              appointmentRemindersEnabled:
                true,
            },
          },
        },
      });

    if (!appointment) {
      await this.cancelDelivery(
        delivery,
        'Lembrete cancelado porque o agendamento não existe mais',
      );

      return false;
    }

    if (
      !appointment.tenant
        .appointmentRemindersEnabled
    ) {
      await this.cancelDelivery(
        delivery,
        'Lembrete cancelado porque os lembretes foram desativados para a empresa',
      );

      return false;
    }

    /*
     * CORREÇÃO:
     *
     * O motivo do cancelamento deve
     * informar o status real do
     * agendamento.
     *
     * Exemplo:
     * status CANCELED.
     */
    if (
      appointment.status !==
      'CONFIRMED'
    ) {
      await this.cancelDelivery(
        delivery,
        `Lembrete cancelado porque o agendamento está com status ${appointment.status}`,
      );

      return false;
    }

    if (appointment.reminderSentAt) {
      await this.cancelDelivery(
        delivery,
        'Lembrete cancelado porque o agendamento já possui reminderSentAt',
      );

      return false;
    }

    if (
      appointment.startsAt.getTime() <=
      now.getTime()
    ) {
      await this.cancelDelivery(
        delivery,
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
       * O agendamento mudou de horário.
       * Esta entrega pertence ao horário
       * antigo e não pode ser enviada.
       */
      await this.cancelDelivery(
        delivery,
        'Lembrete cancelado porque o agendamento foi reagendado',
      );

      return false;
    }

    return true;
  }

  /*
   * Registra sucesso somente se
   * a tentativa ainda possuir o claim.
   *
   * Retorna false quando o claim
   * foi perdido.
   */
  private async markSent(
    delivery: ClaimedDelivery,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.notificationDelivery.updateMany({
            where: {
              id: delivery.id,

              status: 'PROCESSING',

              attempts:
                delivery.attempts,

              processingStartedAt:
                delivery.processingStartedAt,
            },

            data: {
              status: 'SENT',

              sentAt: now,

              failedAt: null,

              processingStartedAt: null,

              lastError: null,
            },
          });

        /*
         * Uma tentativa antiga não
         * pode atualizar a entrega
         * nem reminderSentAt.
         */
        if (updated.count !== 1) {
          return false;
        }

        if (
          delivery.type !==
            'APPOINTMENT_REMINDER' ||
          !delivery.appointmentId
        ) {
          return true;
        }

        const reminderStartsAt =
          this.getReminderStartsAtFromDedupeKey(
            delivery.appointmentId,
            delivery.dedupeKey,
          );

        if (!reminderStartsAt) {
          this.logger.warn(
            `Notificação de lembrete ${delivery.id} foi enviada, mas não foi possível identificar o horário no dedupeKey`,
          );

          return true;
        }

        /*
         * reminderSentAt só é preenchido
         * depois de um envio confirmado.
         *
         * O horário do agendamento também
         * deve continuar o mesmo.
         */
        await tx.appointment.updateMany({
          where: {
            id: delivery.appointmentId,

            tenantId: delivery.tenantId,

            status: 'CONFIRMED',

            reminderSentAt: null,

            startsAt: reminderStartsAt,
          },

          data: {
            reminderSentAt: now,
          },
        });

        return true;
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

    if (!delivery) {
      return 'skipped';
    }

    const currentDelivery =
      delivery as ClaimedDelivery;

    /*
     * Lembretes são revalidados
     * imediatamente antes do SMTP.
     */
    const canSend =
      await this.validateReminderBeforeSend(
        currentDelivery,
        now,
      );

    if (!canSend) {
      return 'skipped';
    }

    try {
      /*
       * O SMTP acontece fora
       * de qualquer transação
       * do banco de dados.
       */
      const emailSent =
        await this.emailService.sendMail({
          to: currentDelivery.recipient,

          subject: currentDelivery.subject,

          text: currentDelivery.text,

          html:
            currentDelivery.html ??
            undefined,
        });

      if (emailSent) {
        const markedSent =
          await this.markSent(
            currentDelivery,
            now,
          );

        /*
         * Uma tentativa antiga pode
         * receber sucesso do SMTP
         * após perder seu claim.
         */
        return markedSent
          ? 'sent'
          : 'skipped';
      }

      return this.markFailure(
        currentDelivery,
        'O serviço de e-mail não confirmou o envio',
        now,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      /*
       * Confirmação SMTP incerta:
       *
       * Não sabemos se o servidor
       * aceitou a mensagem.
       *
       * Registramos UNCERTAIN
       * em vez de agendar retry.
       */
      if (
        error instanceof
        SmtpDeliveryUncertainError
      ) {
        return this.markUncertain(
          currentDelivery,
          message,
        );
      }

      /*
       * Falhas comuns permanecem
       * no fluxo original de retry.
       */
      return this.markFailure(
        currentDelivery,
        message,
        now,
      );
    }
  }

  /*
   * Registra confirmação SMTP incerta.
   *
   * A atualização exige o claim
   * da tentativa atual, impedindo
   * que uma tentativa antiga
   * sobrescreva outra.
   */
  private async markUncertain(
    delivery: ClaimedDelivery,
    errorMessage: string,
  ): Promise<ProcessResult> {
    const updated =
      await this.prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,

          status: 'PROCESSING',

          attempts:
            delivery.attempts,

          processingStartedAt:
            delivery.processingStartedAt,
        },

        data: {
          status: 'UNCERTAIN',

          processingStartedAt: null,

          sentAt: null,

          failedAt: null,

          lastError:
            errorMessage.slice(
              0,
              2000,
            ),
        },
      });

    if (updated.count !== 1) {
      return 'skipped';
    }

    this.logger.warn(
      `Notificação ${delivery.id} com confirmação SMTP incerta após ${delivery.attempts} tentativa(s). Reenvio automático bloqueado.`,
    );

    /*
     * O resultado é contado como skipped:
     * não houve confirmação de sucesso
     * nem agendamento de retry.
     */
    return 'skipped';
  }

  /*
   * Falhas comuns continuam seguindo
   * a política de retry existente.
   *
   * A atualização exige a propriedade
   * do claim atual.
   */
  private async markFailure(
    delivery: ClaimedDelivery,
    errorMessage: string,
    now: Date,
  ): Promise<ProcessResult> {
    const exhausted =
      delivery.attempts >=
      delivery.maxAttempts;

    const nextAttemptAt =
      exhausted
        ? now
        : new Date(
            now.getTime() +
              this.getRetryDelayMs(
                delivery.attempts,
              ),
          );

    const updated =
      await this.prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,

          status: 'PROCESSING',

          attempts:
            delivery.attempts,

          processingStartedAt:
            delivery.processingStartedAt,
        },

        data: {
          status: 'FAILED',

          processingStartedAt: null,

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

    if (updated.count !== 1) {
      return 'skipped';
    }

    if (exhausted) {
      this.logger.error(
        `Notificação ${delivery.id} falhou definitivamente após ${delivery.attempts} tentativa(s): ${errorMessage}`,
      );

      return 'failed';
    }

    this.logger.warn(
      `Notificação ${delivery.id} falhou na tentativa ${delivery.attempts}/${delivery.maxAttempts} e será tentada novamente`,
    );

    return 'retry';
  }

  /*
   * ETAPA 2.8 - RECUPERAÇÃO SEGURA
   *
   * Uma entrega abandonada em PROCESSING
   * possui resultado SMTP desconhecido.
   *
   * Não importa se ainda existem
   * tentativas disponíveis ou se
   * maxAttempts já foi atingido:
   * nenhuma dessas situações confirma
   * que o SMTP não recebeu a mensagem.
   *
   * Por isso, a recuperação registra
   * UNCERTAIN e não agenda retry.
   *
   * Preservamos as condições de
   * concorrência no updateMany.
   */
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
          status: 'PROCESSING',

          processingStartedAt: {
            lte: staleBefore,
          },
        },

        select: {
          id: true,
          attempts: true,
        },

        take: 100,
      });

    for (const delivery of staleDeliveries) {
      /*
       * Proteção contra condição de corrida:
       *
       * Um processamento pode ter sido
       * renovado depois do findMany.
       *
       * Por isso, repetimos no updateMany
       * as condições de status e tempo.
       *
       * Se a tentativa foi renovada,
       * nenhuma alteração será efetuada.
       */
      const updated =
        await this.prisma.notificationDelivery.updateMany({
          where: {
            id: delivery.id,

            status: 'PROCESSING',

            processingStartedAt: {
              lte: staleBefore,
            },
          },

          data: {
            status: 'UNCERTAIN',

            processingStartedAt: null,

            failedAt: null,

            lastError:
              'Processamento anterior foi interrompido antes de ser concluído; resultado SMTP incerto',
          },
        });

      if (updated.count === 1) {
        this.logger.warn(
          `Notificação ${delivery.id} estava em PROCESSING abandonado após ${delivery.attempts} tentativa(s) e foi marcada como UNCERTAIN. Reenvio automático bloqueado.`,
        );
      }
    }
  }
}
