
import {
  Test,
  TestingModule,
} from '@nestjs/testing';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AvailabilityService } from '../availability/availability.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppointmentsService } from './appointments.service.js';

/*
 * TESTES UNITÁRIOS — APPOINTMENTS SERVICE
 *
 * O AppointmentsService depende de:
 *
 * 1. PrismaService
 * 2. AvailabilityService
 * 3. NotificationsService
 *
 * Utilizamos mocks para que o teste
 * não dependa do banco de dados,
 * da disponibilidade real ou do
 * sistema de notificações.
 */

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  /*
   * MOCK DO PRISMA
   *
   * Simula o acesso aos dados
   * dos agendamentos.
   */
  const prismaMock = {
    appointment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },

    employee: {
      findFirst: vi.fn(),
    },

    service: {
      findFirst: vi.fn(),
    },

    client: {
      findFirst: vi.fn(),
    },

    tenant: {
      findUnique: vi.fn(),
    },

    notificationDelivery: {
      create: vi.fn(),
    },

    $transaction: vi.fn(),
  };

  /*
   * MOCK DE DISPONIBILIDADE
   */
  const availabilityMock = {
    getAvailableSlots: vi.fn(),
  };

  /*
   * MOCK DE NOTIFICAÇÕES
   */
  const notificationsMock = {
    notifyAppointmentRequested: vi.fn(),
    notifyAppointmentConfirmed: vi.fn(),
    notifyAppointmentCanceled: vi.fn(),
    notifyAppointmentRescheduled: vi.fn(),
    notifyAppointmentReminder: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          AppointmentsService,

          {
            provide: PrismaService,
            useValue: prismaMock,
          },

          {
            provide: AvailabilityService,
            useValue: availabilityMock,
          },

          {
            provide: NotificationsService,
            useValue: notificationsMock,
          },
        ],
      }).compile();

    service =
      module.get<AppointmentsService>(
        AppointmentsService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
