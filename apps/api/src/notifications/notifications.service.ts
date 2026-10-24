import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { EmailService } from './email.service.js';
import { NotificationQueueService } from './notification-queue.service.js';

type AppointmentNotificationData = {
  clientName: string;

  clientEmail?:
    | string
    | null;

  tenantName: string;

  serviceName: string;

  employeeName: string;

  startsAt:
    | Date
    | string;

  timezone: string;

  cancelReason?:
    | string
    | null;
};

type RequestedAppointmentNotificationData =
  AppointmentNotificationData & {
    tenantId: string;
    appointmentId: string;
  };

type ConfirmedAppointmentNotificationData =
  AppointmentNotificationData & {
    tenantId: string;
    appointmentId: string;
  };

type ReminderAppointmentNotificationData =
  AppointmentNotificationData & {
    tenantId: string;
    appointmentId: string;
  };

type CanceledAppointmentNotificationData =
  AppointmentNotificationData & {
    tenantId: string;
    appointmentId: string;
  };

type RescheduledAppointmentNotificationData =
  AppointmentNotificationData & {
    tenantId: string;
    appointmentId: string;

    previousStartsAt:
      | Date
      | string;
  };

@Injectable()
export class NotificationsService {
  private readonly logger =
    new Logger(
      NotificationsService.name,
    );

  constructor(
    private readonly emailService: EmailService,
    private readonly notificationQueueService: NotificationQueueService,
  ) {}

  private escapeHtml(
    value: string,
  ) {
    return value
      .replaceAll(
        '&',
        '&amp;',
      )
      .replaceAll(
        '<',
        '&lt;',
      )
      .replaceAll(
        '>',
        '&gt;',
      )
      .replaceAll(
        '"',
        '&quot;',
      )
      .replaceAll(
        "'",
        '&#039;',
      );
  }

  private formatDate(
    startsAt:
      | Date
      | string,
    timezone: string,
  ) {
    return new Intl.DateTimeFormat(
      'pt-BR',
      {
        day:
          '2-digit',

        month:
          '2-digit',

        year:
          'numeric',

        timeZone:
          timezone,
      },
    ).format(
      new Date(
        startsAt,
      ),
    );
  }

  private formatTime(
    startsAt:
      | Date
      | string,
    timezone: string,
  ) {
    return new Intl.DateTimeFormat(
      'pt-BR',
      {
        hour:
          '2-digit',

        minute:
          '2-digit',

        timeZone:
          timezone,
      },
    ).format(
      new Date(
        startsAt,
      ),
    );
  }

  private async safeSend(
    data: {
      to: string;
      subject: string;
      text: string;
      html: string;
    },
  ) {
    try {
      return await this.emailService.sendMail(
        data,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      /*
       * Uma falha no servidor SMTP
       * nunca deve desfazer um
       * agendamento já salvo.
       */
      this.logger.error(
        `Falha ao enviar notificação por e-mail: ${message}`,
      );

      return false;
    }
  }

  private async safeEnqueueRequested(
    data: {
      tenantId: string;
      appointmentId: string;
      recipient: string;
      subject: string;
      text: string;
      html: string;
    },
  ) {
    try {
      const delivery =
        await this.notificationQueueService.enqueueEmail({
          tenantId:
            data.tenantId,

          appointmentId:
            data.appointmentId,

          type:
            'APPOINTMENT_REQUESTED',

          recipient:
            data.recipient,

          subject:
            data.subject,

          text:
            data.text,

          html:
            data.html,

          dedupeKey:
            `appointment:${data.appointmentId}:requested`,
        });

      return Boolean(
        delivery,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      this.logger.error(
        `Falha ao enfileirar notificação de solicitação: ${message}`,
      );

      return false;
    }
  }

  private async safeEnqueueConfirmed(
    data: {
      tenantId: string;
      appointmentId: string;
      recipient: string;
      subject: string;
      text: string;
      html: string;
    },
  ) {
    try {
      const delivery =
        await this.notificationQueueService.enqueueEmail({
          tenantId:
            data.tenantId,

          appointmentId:
            data.appointmentId,

          type:
            'APPOINTMENT_CONFIRMED',

          recipient:
            data.recipient,

          subject:
            data.subject,

          text:
            data.text,

          html:
            data.html,

          dedupeKey:
            `appointment:${data.appointmentId}:confirmed`,
        });

      return Boolean(
        delivery,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      this.logger.error(
        `Falha ao enfileirar notificação de confirmação: ${message}`,
      );

      return false;
    }
  }

  private async safeEnqueueReminder(
    data: {
      tenantId: string;
      appointmentId: string;
      startsAt:
        | Date
        | string;
      recipient: string;
      subject: string;
      text: string;
      html: string;
    },
  ) {
    try {
      const startsAt =
        new Date(
          data.startsAt,
        ).toISOString();

      const delivery =
        await this.notificationQueueService.enqueueEmail({
          tenantId:
            data.tenantId,

          appointmentId:
            data.appointmentId,

          type:
            'APPOINTMENT_REMINDER',

          recipient:
            data.recipient,

          subject:
            data.subject,

          text:
            data.text,

          html:
            data.html,

          dedupeKey:
            `appointment:${data.appointmentId}:reminder:${startsAt}`,
        });

      return Boolean(
        delivery,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      this.logger.error(
        `Falha ao enfileirar lembrete de agendamento: ${message}`,
      );

      return false;
    }
  }

  private async safeEnqueueCanceled(
    data: {
      tenantId: string;
      appointmentId: string;
      recipient: string;
      subject: string;
      text: string;
      html: string;
    },
  ) {
    try {
      const delivery =
        await this.notificationQueueService.enqueueEmail({
          tenantId:
            data.tenantId,

          appointmentId:
            data.appointmentId,

          type:
            'APPOINTMENT_CANCELED',

          recipient:
            data.recipient,

          subject:
            data.subject,

          text:
            data.text,

          html:
            data.html,

          dedupeKey:
            `appointment:${data.appointmentId}:canceled`,
        });

      return Boolean(
        delivery,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      this.logger.error(
        `Falha ao enfileirar notificação de cancelamento: ${message}`,
      );

      return false;
    }
  }

  private async safeEnqueueRescheduled(
    data: {
      tenantId: string;
      appointmentId: string;
      startsAt:
        | Date
        | string;
      recipient: string;
      subject: string;
      text: string;
      html: string;
    },
  ) {
    try {
      const startsAt =
        new Date(
          data.startsAt,
        ).toISOString();

      const delivery =
        await this.notificationQueueService.enqueueEmail({
          tenantId:
            data.tenantId,

          appointmentId:
            data.appointmentId,

          type:
            'APPOINTMENT_RESCHEDULED',

          recipient:
            data.recipient,

          subject:
            data.subject,

          text:
            data.text,

          html:
            data.html,

          dedupeKey:
            `appointment:${data.appointmentId}:rescheduled:${startsAt}`,
        });

      return Boolean(
        delivery,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      this.logger.error(
        `Falha ao enfileirar notificação de reagendamento: ${message}`,
      );

      return false;
    }
  }

  async notifyAppointmentRequested(
    data: RequestedAppointmentNotificationData,
  ) {
    if (
      !data.clientEmail
    ) {
      return false;
    }

    const date =
      this.formatDate(
        data.startsAt,
        data.timezone,
      );

    const time =
      this.formatTime(
        data.startsAt,
        data.timezone,
      );

    const clientName =
      this.escapeHtml(
        data.clientName,
      );

    const tenantName =
      this.escapeHtml(
        data.tenantName,
      );

    const serviceName =
      this.escapeHtml(
        data.serviceName,
      );

    const employeeName =
      this.escapeHtml(
        data.employeeName,
      );

    const subject =
      `Recebemos seu agendamento - ${data.tenantName}`;

    const text = [
      `Olá, ${data.clientName}.`,
      '',
      `Recebemos sua solicitação de agendamento em ${data.tenantName}.`,
      '',
      `Serviço: ${data.serviceName}`,
      `Profissional: ${data.employeeName}`,
      `Data: ${date}`,
      `Horário: ${time}`,
      '',
      'Seu agendamento está aguardando confirmação.',
    ].join(
      '\n',
    );

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #27272a;
        "
      >
        <h2>
          Solicitação de agendamento recebida
        </h2>

        <p>
          Olá, <strong>${clientName}</strong>.
        </p>

        <p>
          Recebemos sua solicitação de agendamento em
          <strong>${tenantName}</strong>.
        </p>

        <p>
          <strong>Serviço:</strong>
          ${serviceName}
          <br />

          <strong>Profissional:</strong>
          ${employeeName}
          <br />

          <strong>Data:</strong>
          ${date}
          <br />

          <strong>Horário:</strong>
          ${time}
        </p>

        <p>
          Seu agendamento está
          <strong>aguardando confirmação</strong>.
        </p>
      </div>
    `;

    return this.safeEnqueueRequested({
      tenantId:
        data.tenantId,

      appointmentId:
        data.appointmentId,

      recipient:
        data.clientEmail,

      subject,

      text,

      html,
    });
  }

  async notifyAppointmentConfirmed(
    data: ConfirmedAppointmentNotificationData,
  ) {
    if (
      !data.clientEmail
    ) {
      return false;
    }

    const date =
      this.formatDate(
        data.startsAt,
        data.timezone,
      );

    const time =
      this.formatTime(
        data.startsAt,
        data.timezone,
      );

    const clientName =
      this.escapeHtml(
        data.clientName,
      );

    const tenantName =
      this.escapeHtml(
        data.tenantName,
      );

    const serviceName =
      this.escapeHtml(
        data.serviceName,
      );

    const employeeName =
      this.escapeHtml(
        data.employeeName,
      );

    const subject =
      `Agendamento confirmado - ${data.tenantName}`;

    const text = [
      `Olá, ${data.clientName}.`,
      '',
      `Seu agendamento em ${data.tenantName} foi confirmado.`,
      '',
      `Serviço: ${data.serviceName}`,
      `Profissional: ${data.employeeName}`,
      `Data: ${date}`,
      `Horário: ${time}`,
    ].join(
      '\n',
    );

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #27272a;
        "
      >
        <h2>
          Agendamento confirmado
        </h2>

        <p>
          Olá, <strong>${clientName}</strong>.
        </p>

        <p>
          Seu agendamento em
          <strong>${tenantName}</strong>
          foi confirmado.
        </p>

        <p>
          <strong>Serviço:</strong>
          ${serviceName}
          <br />

          <strong>Profissional:</strong>
          ${employeeName}
          <br />

          <strong>Data:</strong>
          ${date}
          <br />

          <strong>Horário:</strong>
          ${time}
        </p>
      </div>
    `;

    return this.safeEnqueueConfirmed({
      tenantId:
        data.tenantId,

      appointmentId:
        data.appointmentId,

      recipient:
        data.clientEmail,

      subject,

      text,

      html,
    });
  }

  async notifyAppointmentReminder(
    data: ReminderAppointmentNotificationData,
  ) {
    if (
      !data.clientEmail
    ) {
      return false;
    }

    const date =
      this.formatDate(
        data.startsAt,
        data.timezone,
      );

    const time =
      this.formatTime(
        data.startsAt,
        data.timezone,
      );

    const clientName =
      this.escapeHtml(
        data.clientName,
      );

    const tenantName =
      this.escapeHtml(
        data.tenantName,
      );

    const serviceName =
      this.escapeHtml(
        data.serviceName,
      );

    const employeeName =
      this.escapeHtml(
        data.employeeName,
      );

    const subject =
      `Lembrete do seu agendamento - ${data.tenantName}`;

    const text = [
      `Olá, ${data.clientName}.`,
      '',
      `Este é um lembrete do seu agendamento em ${data.tenantName}.`,
      '',
      `Serviço: ${data.serviceName}`,
      `Profissional: ${data.employeeName}`,
      `Data: ${date}`,
      `Horário: ${time}`,
      '',
      'Seu horário está confirmado. Esperamos por você!',
    ].join(
      '\\n',
    );

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #27272a;
        "
      >
        <h2>
          Lembrete de agendamento
        </h2>

        <p>
          Olá, <strong>${clientName}</strong>.
        </p>

        <p>
          Este é um lembrete do seu agendamento em
          <strong>${tenantName}</strong>.
        </p>

        <p>
          <strong>Serviço:</strong>
          ${serviceName}
          <br />

          <strong>Profissional:</strong>
          ${employeeName}
          <br />

          <strong>Data:</strong>
          ${date}
          <br />

          <strong>Horário:</strong>
          ${time}
        </p>

        <p>
          Seu horário está
          <strong>confirmado</strong>.
          Esperamos por você!
        </p>
      </div>
    `;

    return this.safeEnqueueReminder({
      tenantId:
        data.tenantId,

      appointmentId:
        data.appointmentId,

      startsAt:
        data.startsAt,

      recipient:
        data.clientEmail,

      subject,

      text,

      html,
    });
  }

  async notifyAppointmentRescheduled(
    data: RescheduledAppointmentNotificationData,
  ) {
    if (
      !data.clientEmail
    ) {
      return false;
    }

    const previousDate =
      this.formatDate(
        data.previousStartsAt,
        data.timezone,
      );

    const previousTime =
      this.formatTime(
        data.previousStartsAt,
        data.timezone,
      );

    const newDate =
      this.formatDate(
        data.startsAt,
        data.timezone,
      );

    const newTime =
      this.formatTime(
        data.startsAt,
        data.timezone,
      );

    const clientName =
      this.escapeHtml(
        data.clientName,
      );

    const tenantName =
      this.escapeHtml(
        data.tenantName,
      );

    const serviceName =
      this.escapeHtml(
        data.serviceName,
      );

    const employeeName =
      this.escapeHtml(
        data.employeeName,
      );

    const subject =
      `Agendamento reagendado - ${data.tenantName}`;

    const text = [
      `Olá, ${data.clientName}.`,
      '',
      `Seu agendamento em ${data.tenantName} foi reagendado.`,
      '',
      `Serviço: ${data.serviceName}`,
      `Profissional: ${data.employeeName}`,
      '',
      `Data anterior: ${previousDate}`,
      `Horário anterior: ${previousTime}`,
      '',
      `Nova data: ${newDate}`,
      `Novo horário: ${newTime}`,
    ].join(
      '\n',
    );

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #27272a;
        "
      >
        <h2>
          Agendamento reagendado
        </h2>

        <p>
          Olá, <strong>${clientName}</strong>.
        </p>

        <p>
          Seu agendamento em
          <strong>${tenantName}</strong>
          foi reagendado.
        </p>

        <p>
          <strong>Serviço:</strong>
          ${serviceName}
          <br />

          <strong>Profissional:</strong>
          ${employeeName}
        </p>

        <p>
          <strong>Data anterior:</strong>
          ${previousDate}
          <br />

          <strong>Horário anterior:</strong>
          ${previousTime}
        </p>

        <p>
          <strong>Nova data:</strong>
          ${newDate}
          <br />

          <strong>Novo horário:</strong>
          ${newTime}
        </p>
      </div>
    `;

    return this.safeEnqueueRescheduled({
      tenantId:
        data.tenantId,

      appointmentId:
        data.appointmentId,

      startsAt:
        data.startsAt,

      recipient:
        data.clientEmail,

      subject,

      text,

      html,
    });
  }

  async notifyAppointmentCanceled(
    data: CanceledAppointmentNotificationData,
  ) {
    if (
      !data.clientEmail
    ) {
      return false;
    }

    const date =
      this.formatDate(
        data.startsAt,
        data.timezone,
      );

    const time =
      this.formatTime(
        data.startsAt,
        data.timezone,
      );

    const clientName =
      this.escapeHtml(
        data.clientName,
      );

    const tenantName =
      this.escapeHtml(
        data.tenantName,
      );

    const serviceName =
      this.escapeHtml(
        data.serviceName,
      );

    const employeeName =
      this.escapeHtml(
        data.employeeName,
      );

    const cancelReason =
      data.cancelReason
        ? this.escapeHtml(
            data.cancelReason,
          )
        : null;

    const reasonText =
      data.cancelReason
        ? [
            '',
            `Motivo: ${data.cancelReason}`,
          ]
        : [];

    const reasonHtml =
      cancelReason
        ? `
          <p>
            <strong>Motivo:</strong>
            ${cancelReason}
          </p>
        `
        : '';

    const subject =
      `Agendamento cancelado - ${data.tenantName}`;

    const text = [
      `Olá, ${data.clientName}.`,
      '',
      `Seu agendamento em ${data.tenantName} foi cancelado.`,
      '',
      `Serviço: ${data.serviceName}`,
      `Profissional: ${data.employeeName}`,
      `Data: ${date}`,
      `Horário: ${time}`,
      ...reasonText,
    ].join(
      '\n',
    );

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #27272a;
        "
      >
        <h2>
          Agendamento cancelado
        </h2>

        <p>
          Olá, <strong>${clientName}</strong>.
        </p>

        <p>
          Seu agendamento em
          <strong>${tenantName}</strong>
          foi cancelado.
        </p>

        <p>
          <strong>Serviço:</strong>
          ${serviceName}
          <br />

          <strong>Profissional:</strong>
          ${employeeName}
          <br />

          <strong>Data:</strong>
          ${date}
          <br />

          <strong>Horário:</strong>
          ${time}
        </p>

        ${reasonHtml}
      </div>
    `;

    return this.safeEnqueueCanceled({
      tenantId:
        data.tenantId,

      appointmentId:
        data.appointmentId,

      recipient:
        data.clientEmail,

      subject,

      text,

      html,
    });
  }
}