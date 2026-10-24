
import { ConfigService } from '@nestjs/config';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { EmailService } from '../src/notifications/email.service.js';

/*
 * Mock do Nodemailer.
 *
 * O teste não estabelece conexões SMTP
 * e não envia e-mails reais.
 *
 * Interceptamos createTransport para
 * verificar as opções configuradas
 * pelo EmailService.
 */
const {
  createTransportMock,
  sendMailMock,
} = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

describe(
  'EmailService - timeouts SMTP',
  () => {
    let emailService: EmailService;

    beforeEach(() => {
      vi.clearAllMocks();

      /*
       * Simula um envio bem-sucedido.
       *
       * O método verdadeiro do Nodemailer
       * nunca será executado.
       */
      sendMailMock.mockResolvedValue({
        messageId: 'smtp-timeouts-test',
      });

      createTransportMock.mockReturnValue({
        sendMail: sendMailMock,
      });

      /*
       * Configuração simulada apenas
       * para este teste.
       *
       * Não usamos as credenciais reais
       * do arquivo .env.
       */
      const settings: Record<string, string> = {
        SMTP_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'usuario-teste',
        SMTP_PASS: 'senha-teste',
        SMTP_FROM_EMAIL:
          'notificacoes@example.test',
        SMTP_FROM_NAME:
          'Agendamento SaaS Teste',
      };

      const configService = {
        get: vi.fn(
          (key: string) => settings[key],
        ),
      } as unknown as ConfigService;

      emailService = new EmailService(
        configService,
      );
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it(
      'configura os timeouts SMTP e utiliza o transporte simulado',
      async () => {
        /*
         * Executa o fluxo normal
         * do EmailService.
         *
         * Como o Nodemailer está simulado,
         * nenhuma conexão real será aberta.
         */
        const result =
          await emailService.sendMail({
            to: 'cliente@example.test',
            subject: 'Teste de timeout SMTP',
            text: 'Mensagem de teste.',
            html: '<p>Mensagem de teste.</p>',
          });

        /*
         * O transporte precisa ser
         * criado exatamente uma vez.
         */
        expect(
          createTransportMock,
        ).toHaveBeenCalledTimes(1);

        /*
         * Verifica as configurações SMTP
         * e os três limites de tempo
         * definidos na Etapa 2.4.
         */
        expect(
          createTransportMock,
        ).toHaveBeenCalledWith({
          host: 'smtp.example.test',

          port: 587,

          secure: false,

          connectionTimeout: 30_000,

          greetingTimeout: 30_000,

          socketTimeout: 120_000,

          auth: {
            user: 'usuario-teste',
            pass: 'senha-teste',
          },
        });

        /*
         * Verifica que o EmailService
         * encaminhou a mensagem para
         * o transporte simulado.
         */
        expect(
          sendMailMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          sendMailMock,
        ).toHaveBeenCalledWith({
          from: {
            name: 'Agendamento SaaS Teste',
            address:
              'notificacoes@example.test',
          },

          to: 'cliente@example.test',

          subject: 'Teste de timeout SMTP',

          text: 'Mensagem de teste.',

          html: '<p>Mensagem de teste.</p>',
        });

        /*
         * Como o envio simulado foi
         * bem-sucedido, o serviço deve
         * retornar true.
         */
        expect(result).toBe(true);
      },
    );
  },
);
