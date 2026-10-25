
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

/*
 * ETAPA 2.5 - ENTREGA SMTP INCERTA
 *
 * Representa uma situação em que
 * não conseguimos confirmar se o
 * servidor SMTP aceitou a mensagem.
 *
 * O erro original é preservado em
 * cause para permitir diagnóstico.
 *
 * Esta classe não decide se o e-mail
 * deve ser reenviado.
 */
export class SmtpDeliveryUncertainError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      'Não foi possível confirmar se o servidor SMTP aceitou a mensagem',
    );

    this.name =
      'SmtpDeliveryUncertainError';

    this.cause = cause;
  }
}

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
      value
        ?.trim()
        .toLowerCase() ===
      'true'
    );
  }

  private isEnabled() {
    return this.getBoolean(
      this.configService.get<string>(
        'SMTP_ENABLED',
      ),
    );
  }

  private isConfigured() {
    if (!this.isEnabled()) {
      return false;
    }

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

  /*
   * Identifica o cenário de timeout
   * durante o comando DATA do SMTP.
   *
   * Nesse ponto, a mensagem pode
   * ter sido aceita pelo servidor,
   * mesmo que a aplicação não tenha
   * recebido a confirmação.
   *
   * Classificamos conservadoramente
   * como resultado incerto.
   *
   * Outros códigos e comandos serão
   * avaliados separadamente para não
   * classificar qualquer falha como
   * uma possível entrega.
   */
  private isUncertainSmtpError(
    error: unknown,
  ) {
    if (
      typeof error !== 'object' ||
      error === null
    ) {
      return false;
    }

    const smtpError =
      error as {
        code?: unknown;
        command?: unknown;
      };

    return (
      smtpError.code ===
        'ETIMEDOUT' &&
      smtpError.command ===
        'DATA'
    );
  }

  private getTransporter() {
    if (!this.isEnabled()) {
      return null;
    }

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

    /*
     * ETAPA 2.4 - TIMEOUTS SMTP
     *
     * O worker recupera notificações
     * em PROCESSING após 10 minutos.
     *
     * Definimos limites menores para
     * conexões SMTP que não respondem:
     *
     * connectionTimeout:
     *   30 segundos para estabelecer
     *   a conexão SMTP.
     *
     * greetingTimeout:
     *   30 segundos para aguardar
     *   a saudação do servidor.
     *
     * socketTimeout:
     *   2 minutos de inatividade
     *   na conexão SMTP.
     *
     * socketTimeout não representa
     * um limite absoluto para toda
     * a duração do envio.
     */
    this.transporter =
      nodemailer.createTransport({
        host,
        port,
        secure,

        connectionTimeout:
          30_000,

        greetingTimeout:
          30_000,

        socketTimeout:
          120_000,

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
    if (!this.isConfigured()) {
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

    try {
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
    } catch (error) {
      /*
       * ETAPA 2.5
       *
       * Se ocorrer timeout durante DATA,
       * o resultado da entrega pode ser
       * incerto.
       *
       * Preservamos a causa original
       * e lançamos um erro específico.
       *
       * O EmailService não realiza
       * nenhuma tentativa adicional.
       */
      if (
        this.isUncertainSmtpError(
          error,
        )
      ) {
        throw new SmtpDeliveryUncertainError(
          error,
        );
      }

      /*
       * Demais erros permanecem com
       * seu comportamento original.
       *
       * O worker continuará responsável
       * pelo tratamento dessas falhas.
       */
      throw error;
    }

    this.logger.log(
      `E-mail enviado para ${data.to}`,
    );

    return true;
  }
}
