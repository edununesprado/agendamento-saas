import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { EmailService } from './email.service.js';

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

type RescheduledAppointmentNotificationData =
  AppointmentNotificationData & {
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

  async notifyAppointmentRequested(
    data: AppointmentNotificationData,
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

    return this.safeSend({
      to:
        data.clientEmail,

      subject:
        `Recebemos seu agendamento - ${data.tenantName}`,

      text: [
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
      ),

      html: `
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
      `,
    });
  }

  async notifyAppointmentConfirmed(
    data: AppointmentNotificationData,
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

    return this.safeSend({
      to:
        data.clientEmail,

      subject:
        `Agendamento confirmado - ${data.tenantName}`,

      text: [
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
      ),

      html: `
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
      `,
    });
  }

  async notifyAppointmentReminder(
    data: AppointmentNotificationData,
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

    return this.safeSend({
      to:
        data.clientEmail,

      subject:
        `Lembrete do seu agendamento - ${data.tenantName}`,

      text: [
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
        '\n',
      ),

      html: `
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
      `,
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

    return this.safeSend({
      to:
        data.clientEmail,

      subject:
        `Agendamento reagendado - ${data.tenantName}`,

      text: [
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
      ),

      html: `
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
      `,
    });
  }

  async notifyAppointmentCanceled(
    data: AppointmentNotificationData,
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

    return this.safeSend({
      to:
        data.clientEmail,

      subject:
        `Agendamento cancelado - ${data.tenantName}`,

      text: [
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
      ),

      html: `
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
      `,
    });
  }
}