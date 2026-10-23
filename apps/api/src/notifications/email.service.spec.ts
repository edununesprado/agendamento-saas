import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { EmailService } from './email.service.js';

vi.mock(
  'nodemailer',
  () => ({
    default: {
      createTransport:
        vi.fn(),
    },
  }),
);

describe(
  'EmailService',
  () => {
    const sendMail =
      vi.fn();

    const createTransport =
      vi.mocked(
        nodemailer.createTransport,
      );

    beforeEach(() => {
      vi.clearAllMocks();

      sendMail.mockResolvedValue({
        messageId:
          'test-message-id',
      });

      createTransport.mockReturnValue({
        sendMail,
      } as never);
    });

    function createService(
      values: Record<
        string,
        string | undefined
      >,
    ) {
      const configService = {
        get: vi.fn(
          (
            key: string,
          ) =>
            values[key],
        ),
      } as unknown as ConfigService;

      return new EmailService(
        configService,
      );
    }

    it(
      'não envia e-mail quando SMTP_ENABLED está false',
      async () => {
        const service =
          createService({
            SMTP_ENABLED:
              'false',

            SMTP_HOST:
              '127.0.0.1',

            SMTP_PORT:
              '1025',

            SMTP_SECURE:
              'false',

            SMTP_USER:
              'mailpit',

            SMTP_PASS:
              'mailpit',

            SMTP_FROM_EMAIL:
              'nao-responda@agendamento.local',
          });

        const result =
          await service.sendMail({
            to:
              'cliente@teste.com',

            subject:
              'Teste',

            text:
              'Mensagem de teste',
          });

        expect(
          result,
        ).toBe(false);

        expect(
          createTransport,
        ).not.toHaveBeenCalled();

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não envia e-mail quando a configuração SMTP está incompleta',
      async () => {
        const service =
          createService({
            SMTP_ENABLED:
              'true',

            SMTP_HOST:
              '127.0.0.1',

            SMTP_PORT:
              '1025',

            SMTP_SECURE:
              'false',
          });

        const result =
          await service.sendMail({
            to:
              'cliente@teste.com',

            subject:
              'Teste',

            text:
              'Mensagem de teste',
          });

        expect(
          result,
        ).toBe(false);

        expect(
          createTransport,
        ).not.toHaveBeenCalled();

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'cria transporte SMTP e envia e-mail quando está habilitado e configurado',
      async () => {
        const service =
          createService({
            SMTP_ENABLED:
              'true',

            SMTP_HOST:
              '127.0.0.1',

            SMTP_PORT:
              '1025',

            SMTP_SECURE:
              'false',

            SMTP_USER:
              'mailpit',

            SMTP_PASS:
              'mailpit',

            SMTP_FROM_NAME:
              'Agendamento SaaS',

            SMTP_FROM_EMAIL:
              'nao-responda@agendamento.local',
          });

        const result =
          await service.sendMail({
            to:
              'cliente@teste.com',

            subject:
              'Agendamento confirmado',

            text:
              'Seu agendamento foi confirmado.',

            html:
              '<p>Seu agendamento foi confirmado.</p>',
          });

        expect(
          result,
        ).toBe(true);

        expect(
          createTransport,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          createTransport,
        ).toHaveBeenCalledWith({
          host:
            '127.0.0.1',

          port:
            1025,

          secure:
            false,

          auth: {
            user:
              'mailpit',

            pass:
              'mailpit',
          },
        });

        expect(
          sendMail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).toHaveBeenCalledWith({
          from: {
            name:
              'Agendamento SaaS',

            address:
              'nao-responda@agendamento.local',
          },

          to:
            'cliente@teste.com',

          subject:
            'Agendamento confirmado',

          text:
            'Seu agendamento foi confirmado.',

          html:
            '<p>Seu agendamento foi confirmado.</p>',
        });
      },
    );

    it(
      'usa porta 587 e nome padrão quando não informados',
      async () => {
        const service =
          createService({
            SMTP_ENABLED:
              'true',

            SMTP_HOST:
              'smtp.teste.com',

            SMTP_USER:
              'usuario',

            SMTP_PASS:
              'senha',

            SMTP_FROM_EMAIL:
              'envio@teste.com',
          });

        const result =
          await service.sendMail({
            to:
              'cliente@teste.com',

            subject:
              'Teste',

            text:
              'Mensagem',
          });

        expect(
          result,
        ).toBe(true);

        expect(
          createTransport,
        ).toHaveBeenCalledWith({
          host:
            'smtp.teste.com',

          port:
            587,

          secure:
            false,

          auth: {
            user:
              'usuario',

            pass:
              'senha',
          },
        });

        expect(
          sendMail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            from: {
              name:
                'Agendamento SaaS',

              address:
                'envio@teste.com',
            },
          }),
        );
      },
    );
  },
);