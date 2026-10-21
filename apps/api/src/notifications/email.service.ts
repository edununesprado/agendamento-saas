import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, {
  type Transporter,
} from 'nodemailer';

type SendEmailData = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class EmailService {
  private readonly logger =
    new Logger(
      EmailService.name,
    );

  private transporter:
    | Transporter
    | null = null;

  constructor(
    private readonly configService: ConfigService,
  ) {}

  private getBoolean(
    value:
      | string
      | undefined,
  ) {
    return (
      value?.trim().toLowerCase() ===
      'true'
    );
  }

  private isConfigured() {
    const host =
      this.configService.get<string>(
        'SMTP_HOST',
      );

    const user =
      this.configService.get<string>(
        'SMTP_USER',
      );

    const pass =
      this.configService.get<string>(
        'SMTP_PASS',
      );

    const fromEmail =
      this.configService.get<string>(
        'SMTP_FROM_EMAIL',
      );

    return Boolean(
      host &&
        user &&
        pass &&
        fromEmail,
    );
  }

  private getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const host =
      this.configService.get<string>(
        'SMTP_HOST',
      );

    const port =
      Number(
        this.configService.get<string>(
          'SMTP_PORT',
        ) ?? '587',
      );

    const secure =
      this.getBoolean(
        this.configService.get<string>(
          'SMTP_SECURE',
        ),
      );

    const user =
      this.configService.get<string>(
        'SMTP_USER',
      );

    const pass =
      this.configService.get<string>(
        'SMTP_PASS',
      );

    if (
      !host ||
      !user ||
      !pass
    ) {
      return null;
    }

    this.transporter =
      nodemailer.createTransport({
        host,
        port,
        secure,

        auth: {
          user,
          pass,
        },
      });

    return this.transporter;
  }

  async sendMail(
    data: SendEmailData,
  ) {
    if (
      !this.isConfigured()
    ) {
      return false;
    }

    const transporter =
      this.getTransporter();

    if (!transporter) {
      return false;
    }

    const fromName =
      this.configService.get<string>(
        'SMTP_FROM_NAME',
      ) ??
      'Agendamento SaaS';

    const fromEmail =
      this.configService.get<string>(
        'SMTP_FROM_EMAIL',
      );

    if (!fromEmail) {
      return false;
    }

    await transporter.sendMail({
      from: {
        name:
          fromName,
        address:
          fromEmail,
      },

      to:
        data.to,

      subject:
        data.subject,

      text:
        data.text,

      html:
        data.html,
    });

    this.logger.log(
      `E-mail enviado para ${data.to}`,
    );

    return true;
  }
}