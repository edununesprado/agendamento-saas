
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/notifications/email.service.js';
import { NotificationWorkerService } from '../src/notifications/notification-worker.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Worker da fila de notificações (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let worker: NotificationWorkerService;

  let tenantId: string;

  const sendMail = vi.fn();

  const now = new Date('2026-10-24T12:00:00.000Z');

  beforeAll(
    async () => {
      /*
       * Segurança: os testes apagam dados.
       * Nunca executar no banco de desenvolvimento.
       */
      if (
        !process.env.DATABASE_URL?.includes(
          'agendamento_test',
        )
      ) {
        throw new Error(
          'SEGURANÇA: o teste deve usar agendamento_test',
        );
      }

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(EmailService)
        .useValue({
          sendMail,
        })
        .compile();

      app = moduleRef.createNestApplication();

      await app.init();

      prisma = app.get(PrismaService);
      worker = app.get(NotificationWorkerService);

      await prisma.notificationDelivery.deleteMany();
      await prisma.tenant.deleteMany();
      await prisma.user.deleteMany();

      const tenant = await prisma.tenant.create({
        data: {
          name: 'Empresa Worker E2E',
          slug: 'empresa-worker-e2e',
        },
      });

      tenantId = tenant.id;
    },
    30000,
  );

  beforeEach(async () => {
    vi.clearAllMocks();

    await prisma.notificationDelivery.deleteMany();

    sendMail.mockResolvedValue(true);
  });

  afterAll(
    async () => {
      if (prisma) {
        await prisma.notificationDelivery.deleteMany();
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();
      }

      if (app) {
        await app.close();
      }
    },
    30000,
  );

  it(
    'envia uma notificação pendente e marca como SENT',
    async () => {
      const delivery = await prisma.notificationDelivery.create({
        data: {
          tenantId,
          type: 'APPOINTMENT_CONFIRMED',
          status: 'PENDING',
          recipient: 'cliente@teste.com',
          subject: 'Agendamento confirmado',
          text: 'Seu agendamento foi confirmado.',
          html: '<p>Seu agendamento foi confirmado.</p>',
          dedupeKey: 'worker-e2e:success:1',
          nextAttemptAt: now,
        },
      });

      const result = await worker.processDueNotifications(now);

      expect(result).toEqual({
        sent: 1,
        retry: 0,
        failed: 0,
        skipped: 0,
      });

      expect(sendMail).toHaveBeenCalledTimes(1);

      expect(sendMail).toHaveBeenCalledWith({
        to: 'cliente@teste.com',
        subject: 'Agendamento confirmado',
        text: 'Seu agendamento foi confirmado.',
        html: '<p>Seu agendamento foi confirmado.</p>',
      });

      const saved = await prisma.notificationDelivery.findUnique({
        where: {
          id: delivery.id,
        },
      });

      expect(saved?.status).toBe('SENT');
      expect(saved?.attempts).toBe(1);

      expect(saved?.sentAt?.toISOString()).toBe(
        now.toISOString(),
      );

      expect(saved?.failedAt).toBeNull();
      expect(saved?.processingStartedAt).toBeNull();
      expect(saved?.lastError).toBeNull();
    },
  );

  it(
    'agenda retry quando o envio falha e ainda existem tentativas',
    async () => {
      sendMail.mockResolvedValue(false);

      /*
       * Este teste valida o mecanismo
       * genérico de retry da fila.
       *
       * Por isso usamos uma notificação
       * comum, sem as validações extras
       * específicas de APPOINTMENT_REMINDER.
       */
      const delivery = await prisma.notificationDelivery.create({
        data: {
          tenantId,
          type: 'APPOINTMENT_CONFIRMED',
          status: 'PENDING',
          recipient: 'retry@teste.com',
          subject: 'Teste de retry',
          text: 'Mensagem para testar retry',
          dedupeKey: 'worker-e2e:retry:1',
          maxAttempts: 3,
          nextAttemptAt: now,
        },
      });

      const result = await worker.processDueNotifications(now);

      expect(result).toEqual({
        sent: 0,
        retry: 1,
        failed: 0,
        skipped: 0,
      });

      expect(sendMail).toHaveBeenCalledTimes(1);

      const saved = await prisma.notificationDelivery.findUnique({
        where: {
          id: delivery.id,
        },
      });

      expect(saved?.status).toBe('FAILED');
      expect(saved?.attempts).toBe(1);
      expect(saved?.failedAt).toBeNull();
      expect(saved?.processingStartedAt).toBeNull();

      expect(saved?.lastError).toContain(
        'não confirmou o envio',
      );

      /*
       * Primeira falha:
       * retry após 1 minuto.
       */
      expect(saved?.nextAttemptAt.toISOString()).toBe(
        '2026-10-24T12:01:00.000Z',
      );

      /*
       * No mesmo instante o worker não
       * deve tentar novamente.
       */
      const secondResult =
        await worker.processDueNotifications(now);

      expect(secondResult).toEqual({
        sent: 0,
        retry: 0,
        failed: 0,
        skipped: 0,
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'marca falha definitiva ao atingir maxAttempts',
    async () => {
      sendMail.mockResolvedValue(false);

      const delivery = await prisma.notificationDelivery.create({
        data: {
          tenantId,
          type: 'APPOINTMENT_CANCELED',
          status: 'PENDING',
          recipient: 'falha@teste.com',
          subject: 'Agendamento cancelado',
          text: 'Seu agendamento foi cancelado.',
          dedupeKey: 'worker-e2e:failed:1',
          maxAttempts: 1,
          nextAttemptAt: now,
        },
      });

      const result = await worker.processDueNotifications(now);

      expect(result).toEqual({
        sent: 0,
        retry: 0,
        failed: 1,
        skipped: 0,
      });

      expect(sendMail).toHaveBeenCalledTimes(1);

      const saved = await prisma.notificationDelivery.findUnique({
        where: {
          id: delivery.id,
        },
      });

      expect(saved?.status).toBe('FAILED');
      expect(saved?.attempts).toBe(1);

      expect(saved?.failedAt?.toISOString()).toBe(
        now.toISOString(),
      );

      expect(saved?.sentAt).toBeNull();

      /*
       * Mesmo executando novamente depois,
       * a falha definitiva não pode voltar
       * para a fila.
       */
      await worker.processDueNotifications(
        new Date('2026-10-25T12:00:00.000Z'),
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'recupera PROCESSING abandonado e encerra quando as tentativas acabaram',
    async () => {
      const processingStartedAt = new Date(
        now.getTime() - 11 * 60 * 1000,
      );

      const delivery = await prisma.notificationDelivery.create({
        data: {
          tenantId,
          type: 'APPOINTMENT_RESCHEDULED',
          status: 'PROCESSING',
          recipient: 'travado@teste.com',
          subject: 'Agendamento reagendado',
          text: 'Seu horário foi alterado.',
          dedupeKey: 'worker-e2e:stale:1',
          attempts: 2,
          maxAttempts: 2,
          processingStartedAt,
          lastAttemptAt: processingStartedAt,
          nextAttemptAt: processingStartedAt,
        },
      });

      const result = await worker.processDueNotifications(now);

      /*
       * A recuperação acontece antes da
       * busca de candidatos.
       *
       * Como as tentativas já acabaram,
       * a notificação vira uma falha
       * definitiva e não chega ao SMTP.
       */
      expect(result).toEqual({
        sent: 0,
        retry: 0,
        failed: 0,
        skipped: 0,
      });

      expect(sendMail).not.toHaveBeenCalled();

      const saved = await prisma.notificationDelivery.findUnique({
        where: {
          id: delivery.id,
        },
      });

      expect(saved?.status).toBe('FAILED');
      expect(saved?.attempts).toBe(2);
      expect(saved?.processingStartedAt).toBeNull();

      expect(saved?.failedAt?.toISOString()).toBe(
        now.toISOString(),
      );

      expect(saved?.lastError).toContain(
        'Processamento anterior foi interrompido',
      );
    },
  );

  it(
    'não recupera PROCESSING renovado após a seleção de registros antigos',
    async () => {
      /*
       * Cenário de concorrência:
       *
       * 1. O worker seleciona uma entrega
       *    PROCESSING com mais de 10 minutos.
       *
       * 2. Outro processamento renova
       *    processingStartedAt.
       *
       * 3. O worker antigo tenta recuperar
       *    o registro selecionado.
       *
       * Resultado correto:
       * não sobrescrever a renovação.
       */
      const staleStartedAt = new Date(
        now.getTime() - 11 * 60 * 1000,
      );

      const renewedStartedAt = new Date(
        now.getTime() - 1 * 60 * 1000,
      );

      const delivery = await prisma.notificationDelivery.create({
        data: {
          tenantId,
          type: 'APPOINTMENT_CONFIRMED',
          status: 'PROCESSING',
          recipient: 'renovado@teste.com',
          subject: 'Notificação em processamento',
          text: 'Processamento renovado',
          dedupeKey: 'worker-e2e:renewed:1',
          attempts: 1,
          maxAttempts: 3,
          processingStartedAt: staleStartedAt,
          lastAttemptAt: staleStartedAt,
          nextAttemptAt: staleStartedAt,
        },
      });

      /*
       * Guardamos a implementação original
       * do Prisma antes de instalar o spy.
       */
      const originalUpdateMany =
        prisma.notificationDelivery.updateMany.bind(
          prisma.notificationDelivery,
        );

      const updateManySpy = vi.spyOn(
        prisma.notificationDelivery,
        'updateMany',
      );

      let simulatedRenewal = false;

      /*
       * Prisma 7 exige que updateMany retorne
       * um PrismaPromise.
       *
       * A transação abaixo é usada apenas
       * no mock do teste para garantir a ordem:
       *
       * 1. Renovar processingStartedAt.
       * 2. Executar a atualização original.
       *
       * A conversão de tipo fica isolada
       * neste mock de teste.
       */
      updateManySpy.mockImplementation((args) => {
        if (
          !simulatedRenewal &&
          args.where?.id === delivery.id &&
          args.where?.status === 'PROCESSING'
        ) {
          simulatedRenewal = true;

          const renewal =
            prisma.notificationDelivery.update({
              where: {
                id: delivery.id,
              },
              data: {
                processingStartedAt: renewedStartedAt,
              },
            });

          const recovery = originalUpdateMany(args);

          const simulatedRace = prisma
            .$transaction([renewal, recovery])
            .then((results) => results[1]);

          return simulatedRace as unknown as ReturnType<
            typeof originalUpdateMany
          >;
        }

        return originalUpdateMany(args);
      });

      try {
        await worker.processDueNotifications(now);
      } finally {
        updateManySpy.mockRestore();
      }

      /*
       * Confirma que o cenário de
       * concorrência foi realmente simulado.
       */
      expect(simulatedRenewal).toBe(true);

      const saved = await prisma.notificationDelivery.findUnique({
        where: {
          id: delivery.id,
        },
      });

      /*
       * A notificação renovada deve continuar
       * em PROCESSING, sem ser recuperada
       * pelo worker que a selecionou antes.
       */
      expect(saved?.status).toBe('PROCESSING');

      expect(
        saved?.processingStartedAt?.toISOString(),
      ).toBe(renewedStartedAt.toISOString());

      expect(saved?.attempts).toBe(1);
      expect(saved?.failedAt).toBeNull();

      /*
       * O worker não deve enviar a
       * notificação durante essa recuperação.
       */
      expect(sendMail).not.toHaveBeenCalled();
    },
  );
});
