import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { EmailService } from './email.service.js';
import { NotificationQueueService } from './notification-queue.service.js';
import { NotificationsService } from './notifications.service.js';

describe(
  'NotificationsService',
  () => {
    const sendMail =
      vi.fn();

    const enqueueEmail =
      vi.fn();

    let service:
      NotificationsService;

    const appointment = {
      tenantId:
        'tenant-1',

      appointmentId:
        'appointment-1',

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

      enqueueEmail.mockResolvedValue({
        id:
          'delivery-1',
      });

      const emailService = {
        sendMail,
      } as unknown as EmailService;

      const notificationQueueService = {
        enqueueEmail,
      } as unknown as NotificationQueueService;

      service =
        new NotificationsService(
          emailService,
          notificationQueueService,
        );
    });

    it(
      'enfileira a solicitação pública sem enviar SMTP diretamente',
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
        ).not.toHaveBeenCalled();

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          enqueueEmail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId:
              'tenant-1',

            appointmentId:
              'appointment-1',

            type:
              'APPOINTMENT_REQUESTED',

            recipient:
              'maria@teste.com',

            dedupeKey:
              'appointment:appointment-1:requested',
          }),
        );

        const notification =
          enqueueEmail.mock.calls[0][0];

        expect(
          notification.subject,
        ).toContain(
          'Recebemos seu agendamento',
        );

        expect(
          notification.subject,
        ).toContain(
          'Barbearia Alpha',
        );

        expect(
          notification.text,
        ).toContain(
          'Maria Silva',
        );

        expect(
          notification.text,
        ).toContain(
          'Corte',
        );

        expect(
          notification.text,
        ).toContain(
          'Carlos Souza',
        );

        expect(
          notification.html,
        ).toContain(
          'Solicitação de agendamento recebida',
        );
      },
    );

    it(
      'enfileira a confirmação sem enviar SMTP diretamente',
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
        ).not.toHaveBeenCalled();

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          enqueueEmail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId:
              'tenant-1',

            appointmentId:
              'appointment-1',

            type:
              'APPOINTMENT_CONFIRMED',

            recipient:
              'maria@teste.com',

            dedupeKey:
              'appointment:appointment-1:confirmed',
          }),
        );
      },
    );

    it(
      'enfileira o cancelamento sem enviar SMTP diretamente',
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
        ).not.toHaveBeenCalled();

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          enqueueEmail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId:
              'tenant-1',

            appointmentId:
              'appointment-1',

            type:
              'APPOINTMENT_CANCELED',

            recipient:
              'maria@teste.com',

            dedupeKey:
              'appointment:appointment-1:canceled',
          }),
        );

        const notification =
          enqueueEmail.mock.calls[0][0];

        expect(
          notification.text,
        ).toContain(
          'Cliente solicitou cancelamento',
        );
      },
    );

    it(
      'enfileira o reagendamento com o novo horário no dedupeKey sem enviar SMTP diretamente',
      async () => {
        const previousStartsAt =
          new Date(
            '2026-10-27T12:00:00.000Z',
          );

        const newStartsAt =
          new Date(
            '2026-10-27T13:00:00.000Z',
          );

        const result =
          await service.notifyAppointmentRescheduled({
            ...appointment,

            previousStartsAt,

            startsAt:
              newStartsAt,
          });

        expect(
          result,
        ).toBe(true);

        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          enqueueEmail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId:
              'tenant-1',

            appointmentId:
              'appointment-1',

            type:
              'APPOINTMENT_RESCHEDULED',

            recipient:
              'maria@teste.com',

            dedupeKey:
              'appointment:appointment-1:rescheduled:2026-10-27T13:00:00.000Z',
          }),
        );
      },
    );

    it(
      'gera dedupeKey diferente quando o mesmo agendamento é reagendado novamente',
      async () => {
        await service.notifyAppointmentRescheduled({
          ...appointment,

          previousStartsAt:
            new Date(
              '2026-10-27T12:00:00.000Z',
            ),

          startsAt:
            new Date(
              '2026-10-27T13:00:00.000Z',
            ),
        });

        await service.notifyAppointmentRescheduled({
          ...appointment,

          previousStartsAt:
            new Date(
              '2026-10-27T13:00:00.000Z',
            ),

          startsAt:
            new Date(
              '2026-10-27T14:00:00.000Z',
            ),
        });

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          enqueueEmail.mock.calls[0][0].dedupeKey,
        ).toBe(
          'appointment:appointment-1:rescheduled:2026-10-27T13:00:00.000Z',
        );

        expect(
          enqueueEmail.mock.calls[1][0].dedupeKey,
        ).toBe(
          'appointment:appointment-1:rescheduled:2026-10-27T14:00:00.000Z',
        );
      },
    );

    it(
      'não enfileira solicitação pública quando o cliente não possui e-mail',
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

        expect(
          enqueueEmail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não enfileira confirmação quando o cliente não possui e-mail',
      async () => {
        const result =
          await service.notifyAppointmentConfirmed({
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

        expect(
          enqueueEmail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não enfileira cancelamento quando o cliente não possui e-mail',
      async () => {
        const result =
          await service.notifyAppointmentCanceled({
            ...appointment,

            clientEmail:
              null,

            cancelReason:
              'Teste',
          });

        expect(
          result,
        ).toBe(false);

        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        expect(
          enqueueEmail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não enfileira reagendamento quando o cliente não possui e-mail',
      async () => {
        const result =
          await service.notifyAppointmentRescheduled({
            ...appointment,

            clientEmail:
              null,

            previousStartsAt:
              new Date(
                '2026-10-27T12:00:00.000Z',
              ),

            startsAt:
              new Date(
                '2026-10-27T13:00:00.000Z',
              ),
          });

        expect(
          result,
        ).toBe(false);

        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        expect(
          enqueueEmail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não deixa falha ao enfileirar solicitação pública quebrar a notificação',
      async () => {
        enqueueEmail.mockRejectedValueOnce(
          new Error(
            'Banco indisponível',
          ),
        );

        const result =
          await service.notifyAppointmentRequested(
            appointment,
          );

        expect(
          result,
        ).toBe(false);

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não deixa falha ao enfileirar confirmação quebrar a notificação',
      async () => {
        enqueueEmail.mockRejectedValueOnce(
          new Error(
            'Banco indisponível',
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
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não deixa falha ao enfileirar cancelamento quebrar a notificação',
      async () => {
        enqueueEmail.mockRejectedValueOnce(
          new Error(
            'Banco indisponível',
          ),
        );

        const result =
          await service.notifyAppointmentCanceled({
            ...appointment,

            cancelReason:
              'Cliente solicitou cancelamento',
          });

        expect(
          result,
        ).toBe(false);

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'não deixa falha ao enfileirar reagendamento quebrar a notificação',
      async () => {
        enqueueEmail.mockRejectedValueOnce(
          new Error(
            'Banco indisponível',
          ),
        );

        const result =
          await service.notifyAppointmentRescheduled({
            ...appointment,

            previousStartsAt:
              new Date(
                '2026-10-27T12:00:00.000Z',
              ),

            startsAt:
              new Date(
                '2026-10-27T13:00:00.000Z',
              ),
          });

        expect(
          result,
        ).toBe(false);

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'enfileira o lembrete sem enviar SMTP diretamente',
      async () => {
        const result =
          await service.notifyAppointmentReminder(
            appointment,
          );

        expect(
          result,
        ).toBe(true);

        expect(
          sendMail,
        ).not.toHaveBeenCalled();

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          enqueueEmail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId:
              'tenant-1',

            appointmentId:
              'appointment-1',

            type:
              'APPOINTMENT_REMINDER',

            recipient:
              'maria@teste.com',

            dedupeKey:
              'appointment:appointment-1:reminder:2026-10-27T12:00:00.000Z',
          }),
        );

        const notification =
          enqueueEmail.mock.calls[0][0];

        expect(
          notification.subject,
        ).toContain(
          'Lembrete do seu agendamento',
        );

        expect(
          notification.text,
        ).toContain(
          'Maria Silva',
        );

        expect(
          notification.text,
        ).toContain(
          'Corte',
        );

        expect(
          notification.text,
        ).toContain(
          'Carlos Souza',
        );

        expect(
          notification.html,
        ).toContain(
          'Lembrete de agendamento',
        );
      },
    );

    it(
      'não deixa falha ao enfileirar lembrete quebrar a notificação',
      async () => {
        enqueueEmail.mockRejectedValueOnce(
          new Error(
            'Banco indisponível',
          ),
        );

        const result =
          await service.notifyAppointmentReminder(
            appointment,
          );

        expect(
          result,
        ).toBe(false);

        expect(
          enqueueEmail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sendMail,
        ).not.toHaveBeenCalled();
      },
    );
  },
);