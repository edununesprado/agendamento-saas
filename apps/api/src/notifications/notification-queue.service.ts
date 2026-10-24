import {
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

type NotificationType =
  | 'APPOINTMENT_REQUESTED'
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_CANCELED'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_REMINDER';

type EnqueueEmailInput = {
  tenantId: string;

  appointmentId?:
    | string
    | null;

  type: NotificationType;

  recipient: string;

  subject: string;

  text: string;

  html?:
    | string
    | null;

  dedupeKey: string;

  maxAttempts?: number;

  nextAttemptAt?: Date;
};

/*
 * Apenas a parte do Prisma necessária
 * para registrar uma NotificationDelivery.
 *
 * Tanto PrismaService quanto o `tx`
 * recebido por uma transação interativa
 * possuem esse delegate.
 */
export type NotificationQueueClient =
  Pick<
    PrismaService,
    'notificationDelivery'
  >;

@Injectable()
export class NotificationQueueService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async enqueueEmail(
    input: EnqueueEmailInput,
    client: NotificationQueueClient =
      this.prisma,
  ) {
    const recipient =
      input.recipient.trim();

    if (!recipient) {
      return null;
    }

    const dedupeKey =
      input.dedupeKey.trim();

    if (!dedupeKey) {
      throw new Error(
        'dedupeKey da notificação é obrigatório',
      );
    }

    const maxAttempts =
      Math.min(
        10,
        Math.max(
          1,
          input.maxAttempts ??
            5,
        ),
      );

    /*
     * O dedupeKey é UNIQUE no banco.
     *
     * Usamos upsert para que duas partes
     * do sistema tentando enfileirar a
     * mesma notificação resultem em apenas
     * um registro.
     *
     * Não atualizamos registros existentes:
     * depois que uma notificação foi criada,
     * seu conteúdo representa o evento
     * ocorrido naquele momento.
     *
     * Quando `client` for um TransactionClient,
     * a criação da NotificationDelivery fará
     * parte da mesma transação da operação
     * que originou a notificação.
     */
    return client.notificationDelivery.upsert({
      where: {
        dedupeKey,
      },

      update: {},

      create: {
        tenantId:
          input.tenantId,

        appointmentId:
          input.appointmentId ??
          null,

        channel:
          'EMAIL',

        type:
          input.type,

        status:
          'PENDING',

        recipient,

        subject:
          input.subject,

        text:
          input.text,

        html:
          input.html ??
          null,

        dedupeKey,

        attempts:
          0,

        maxAttempts,

        nextAttemptAt:
          input.nextAttemptAt ??
          new Date(),
      },
    });
  }
}