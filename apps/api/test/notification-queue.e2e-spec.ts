import {
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { NotificationQueueService } from '../src/notifications/notification-queue.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe(
  'Fila de notificações (E2E)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let queueService: NotificationQueueService;

    let tenantId: string;

    beforeAll(
      async () => {
        if (
          !process.env.DATABASE_URL?.includes(
            'agendamento_test',
          )
        ) {
          throw new Error(
            'SEGURANÇA: o teste deve usar agendamento_test',
          );
        }

        const moduleRef =
          await Test.createTestingModule({
            imports: [
              AppModule,
            ],
          }).compile();

        app =
          moduleRef.createNestApplication();

        await app.init();

        prisma =
          app.get(
            PrismaService,
          );

        queueService =
          app.get(
            NotificationQueueService,
          );

        /*
         * Limpeza somente do banco E2E.
         */
        await prisma.notificationDelivery.deleteMany();
        await prisma.tenant.deleteMany();
        await prisma.user.deleteMany();

        const tenant =
          await prisma.tenant.create({
            data: {
              name:
                'Empresa Queue E2E',

              slug:
                'empresa-queue-e2e',
            },
          });

        tenantId =
          tenant.id;
      },
      30000,
    );

    beforeEach(
      async () => {
        await prisma.notificationDelivery.deleteMany();
      },
    );

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
      'cria uma notificação PENDING com os valores padrão',
      async () => {
        const result =
          await queueService.enqueueEmail({
            tenantId,

            type:
              'APPOINTMENT_CONFIRMED',

            recipient:
              ' cliente@teste.com ',

            subject:
              'Agendamento confirmado',

            text:
              'Seu agendamento foi confirmado.',

            html:
              '<p>Seu agendamento foi confirmado.</p>',

            dedupeKey:
              'queue-e2e:confirmed:1',
          });

        expect(
          result,
        ).not.toBeNull();

        expect(
          result?.tenantId,
        ).toBe(
          tenantId,
        );

        expect(
          result?.appointmentId,
        ).toBeNull();

        expect(
          result?.channel,
        ).toBe(
          'EMAIL',
        );

        expect(
          result?.type,
        ).toBe(
          'APPOINTMENT_CONFIRMED',
        );

        expect(
          result?.status,
        ).toBe(
          'PENDING',
        );

        expect(
          result?.recipient,
        ).toBe(
          'cliente@teste.com',
        );

        expect(
          result?.attempts,
        ).toBe(
          0,
        );

        expect(
          result?.maxAttempts,
        ).toBe(
          5,
        );

        expect(
          result?.sentAt,
        ).toBeNull();

        expect(
          result?.failedAt,
        ).toBeNull();

        const saved =
          await prisma.notificationDelivery.findUnique({
            where: {
              dedupeKey:
                'queue-e2e:confirmed:1',
            },
          });

        expect(
          saved,
        ).not.toBeNull();

        expect(
          saved?.status,
        ).toBe(
          'PENDING',
        );
      },
    );

    it(
      'não cria duplicata quando o mesmo dedupeKey é usado novamente',
      async () => {
        const first =
          await queueService.enqueueEmail({
            tenantId,

            type:
              'APPOINTMENT_CONFIRMED',

            recipient:
              'cliente@teste.com',

            subject:
              'Primeiro assunto',

            text:
              'Primeira mensagem',

            dedupeKey:
              'queue-e2e:dedupe:1',
          });

        const second =
          await queueService.enqueueEmail({
            tenantId,

            type:
              'APPOINTMENT_CONFIRMED',

            recipient:
              'outro@teste.com',

            subject:
              'Segundo assunto',

            text:
              'Segunda mensagem',

            dedupeKey:
              'queue-e2e:dedupe:1',
          });

        expect(
          first,
        ).not.toBeNull();

        expect(
          second,
        ).not.toBeNull();

        expect(
          second?.id,
        ).toBe(
          first?.id,
        );

        const deliveries =
          await prisma.notificationDelivery.findMany({
            where: {
              dedupeKey:
                'queue-e2e:dedupe:1',
            },
          });

        expect(
          deliveries,
        ).toHaveLength(
          1,
        );

        /*
         * O segundo enqueue não deve alterar
         * o evento que já estava registrado.
         */
        expect(
          deliveries[0].recipient,
        ).toBe(
          'cliente@teste.com',
        );

        expect(
          deliveries[0].subject,
        ).toBe(
          'Primeiro assunto',
        );

        expect(
          deliveries[0].text,
        ).toBe(
          'Primeira mensagem',
        );
      },
    );

    it(
      'não cria notificação quando o destinatário está vazio',
      async () => {
        const result =
          await queueService.enqueueEmail({
            tenantId,

            type:
              'APPOINTMENT_REMINDER',

            recipient:
              '   ',

            subject:
              'Lembrete',

            text:
              'Mensagem de lembrete',

            dedupeKey:
              'queue-e2e:empty-recipient:1',
          });

        expect(
          result,
        ).toBeNull();

        const count =
          await prisma.notificationDelivery.count();

        expect(
          count,
        ).toBe(
          0,
        );
      },
    );

    it(
      'limita maxAttempts entre 1 e 10',
      async () => {
        const minimum =
          await queueService.enqueueEmail({
            tenantId,

            type:
              'APPOINTMENT_REMINDER',

            recipient:
              'minimo@teste.com',

            subject:
              'Teste mínimo',

            text:
              'Teste',

            dedupeKey:
              'queue-e2e:max-attempts:min',

            maxAttempts:
              0,
          });

        const maximum =
          await queueService.enqueueEmail({
            tenantId,

            type:
              'APPOINTMENT_REMINDER',

            recipient:
              'maximo@teste.com',

            subject:
              'Teste máximo',

            text:
              'Teste',

            dedupeKey:
              'queue-e2e:max-attempts:max',

            maxAttempts:
              999,
          });

        expect(
          minimum?.maxAttempts,
        ).toBe(
          1,
        );

        expect(
          maximum?.maxAttempts,
        ).toBe(
          10,
        );
      },
    );
  },
);