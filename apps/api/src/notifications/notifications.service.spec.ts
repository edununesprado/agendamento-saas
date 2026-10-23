import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { EmailService } from './email.service.js';
import { NotificationsService } from './notifications.service.js';

describe(
  'NotificationsService',
  () => {
    const sendMail =
      vi.fn();

    let service:
      NotificationsService;

    const appointment = {
      clientName:
        'Maria Silva',

      clientEmail:
        'maria@teste.com',

      tenantName:
        'Barbearia Alpha',

      serviceName:
        'Corte',

      employeeName:
        'Carlos Souza',

      startsAt:
        new Date(
          '2026-10-27T12:00:00.000Z',
        ),

      timezone:
        'America/Sao_Paulo',
    };

    beforeEach(() => {
      vi.clearAllMocks();

      sendMail.mockResolvedValue(
        true,
      );

      const emailService = {
        sendMail,
      } as unknown as EmailService;

      service =
        new NotificationsService(
          emailService,
        );
    });

    it(
      'envia e-mail quando o agendamento público é solicitado',
      async () => {
        const result =
          await service.notifyAppointmentRequested(
            appointment,
          );

        expect(
          result,
        ).toBe(true);

        expect(
          sendMail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            to:
              'maria@teste.com',

            subject:
              expect.stringContaining(
                'Recebemos seu agendamento',
              ),
          }),
        );

        const email =
          sendMail.mock.calls[0][0];

        expect(
          email.subject,
        ).toContain(
          'Barbearia Alpha',
        );

        expect(
          email.text,
        ).toContain(
          'Maria Silva',
        );

        expect(
          email.text,
        ).toContain(
          'Corte',
        );

        expect(
          email.text,
        ).toContain(
          'Carlos Souza',
        );
      },
    );

    it(
      'envia e-mail quando o agendamento é confirmado',
      async () => {
        const result =
          await service.notifyAppointmentConfirmed(
            appointment,
          );

        expect(
          result,
        ).toBe(true);

        expect(
          sendMail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            to:
              'maria@teste.com',

            subject:
              expect.stringContaining(
                'Agendamento confirmado',
              ),
          }),
        );

        const email =
          sendMail.mock.calls[0][0];

        expect(
          email.subject,
        ).toContain(
          'Barbearia Alpha',
        );

        expect(
          email.text,
        ).toContain(
          'Corte',
        );

        expect(
          email.text,
        ).toContain(
          'Carlos Souza',
        );
      },
    );

    it(
      'envia e-mail quando o agendamento é cancelado',
      async () => {
        const result =
          await service.notifyAppointmentCanceled({
            ...appointment,

            cancelReason:
              'Cliente solicitou cancelamento',
          });

        expect(
          result,
        ).toBe(true);

        expect(
          sendMail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            to:
              'maria@teste.com',

            subject:
              expect.stringContaining(
                'Agendamento cancelado',
              ),
          }),
        );

        const email =
          sendMail.mock.calls[0][0];

        expect(
          email.text,
        ).toContain(
          'Cliente solicitou cancelamento',
        );
      },
    );

    it(
      'não tenta enviar e-mail quando o cliente não possui e-mail',
      async () => {
        const result =
          await service.notifyAppointmentRequested({
            ...appointment,

            clientEmail:
              null,
          });

        expect(
          result,
        ).toBe(false);

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não deixa uma falha no serviço de e-mail quebrar a notificação',
      async () => {
        sendMail.mockRejectedValueOnce(
          new Error(
            'SMTP indisponível',
          ),
        );

        const result =
          await service.notifyAppointmentConfirmed(
            appointment,
          );

        expect(
          result,
        ).toBe(false);

        expect(
          sendMail,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);