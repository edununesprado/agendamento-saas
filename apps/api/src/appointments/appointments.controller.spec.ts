
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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

import { PrismaService } from '../prisma/prisma.service.js';

import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

/*
 * TESTES UNITÁRIOS — APPOINTMENTS CONTROLLER
 *
 * O AppointmentsController utiliza:
 *
 * 1. AppointmentsService
 * 2. PrismaService
 * 3. JwtAuthGuard
 * 4. RolesGuard
 *
 * Utilizamos mocks para verificar
 * a inicialização do controller
 * sem conectar ao PostgreSQL
 * ou validar tokens JWT reais.
 *
 * As regras de autenticação,
 * permissões e auditoria
 * permanecem inalteradas
 * no código de produção.
 */

describe('AppointmentsController', () => {
  let controller: AppointmentsController;

  /*
   * MOCK DO APPOINTMENTS SERVICE
   *
   * Simula as operações chamadas
   * pelo controller.
   */
  const appointmentsServiceMock = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    updateStatus: vi.fn(),
    cancel: vi.fn(),
    reschedule: vi.fn(),
  };

  /*
   * MOCK DO PRISMA
   *
   * Simula a consulta de
   * registros de auditoria.
   */
  const prismaMock = {
    appointmentAuditLog: {
      findMany: vi.fn(),
    },
  };

  /*
   * MOCK DOS GUARDS
   *
   * Isola somente este teste
   * de inicialização.
   *
   * Não modifica os guards
   * utilizados na aplicação.
   */
  const guardMock = {
    canActivate: vi.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          AppointmentsController,
        ],

        providers: [
          {
            provide: AppointmentsService,
            useValue: appointmentsServiceMock,
          },

          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(guardMock)
        .overrideGuard(RolesGuard)
        .useValue(guardMock)
        .compile();

    controller =
      module.get<AppointmentsController>(
        AppointmentsController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
