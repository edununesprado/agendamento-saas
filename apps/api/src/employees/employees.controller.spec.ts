
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

import { AvailabilityService } from '../availability/availability.service.js';
import { BlockedTimesService } from '../blocked-times/blocked-times.service.js';

import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

/*
 * TESTES UNITÁRIOS — EMPLOYEES CONTROLLER
 *
 * O EmployeesController depende de:
 *
 * 1. EmployeesService
 * 2. AvailabilityService
 * 3. BlockedTimesService
 *
 * Também utiliza:
 *
 * 4. JwtAuthGuard
 * 5. RolesGuard
 *
 * Utilizamos mocks para verificar
 * a inicialização do controller
 * sem acessar o banco de dados
 * ou executar autenticação real.
 */

describe('EmployeesController', () => {
  let controller: EmployeesController;

  /*
   * MOCK DO EMPLOYEES SERVICE
   */
  const employeesServiceMock = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    findServices: vi.fn(),
    setServices: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
  };

  /*
   * MOCK DO AVAILABILITY SERVICE
   */
  const availabilityServiceMock = {
    findByEmployee: vi.fn(),
    setAvailability: vi.fn(),
  };

  /*
   * MOCK DO BLOCKED TIMES SERVICE
   */
  const blockedTimesServiceMock = {
    create: vi.fn(),
    findAll: vi.fn(),
    remove: vi.fn(),
  };

  /*
   * MOCK DOS GUARDS
   *
   * Usado somente neste teste
   * de inicialização.
   */
  const guardMock = {
    canActivate: vi.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          EmployeesController,
        ],

        providers: [
          {
            provide: EmployeesService,
            useValue: employeesServiceMock,
          },

          {
            provide: AvailabilityService,
            useValue: availabilityServiceMock,
          },

          {
            provide: BlockedTimesService,
            useValue: blockedTimesServiceMock,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(guardMock)
        .overrideGuard(RolesGuard)
        .useValue(guardMock)
        .compile();

    controller =
      module.get<EmployeesController>(
        EmployeesController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
