
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

import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';

/*
 * TESTES UNITÁRIOS — SERVICES CONTROLLER
 *
 * O ServicesController utiliza:
 *
 * 1. ServicesService
 * 2. JwtAuthGuard
 * 3. RolesGuard
 *
 * Utilizamos mocks para verificar
 * a inicialização do controller
 * sem acessar o PostgreSQL
 * ou validar tokens reais.
 *
 * A autenticação e as permissões
 * continuam sendo verificadas
 * nos testes específicos e E2E.
 */

describe('ServicesController', () => {
  let controller: ServicesController;

  /*
   * MOCK DO SERVICES SERVICE
   *
   * Simula os métodos utilizados
   * pelo controller.
   */
  const servicesServiceMock = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
  };

  /*
   * MOCK DOS GUARDS
   *
   * Isola somente este teste
   * de inicialização do controller.
   */
  const guardMock = {
    canActivate: vi.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          ServicesController,
        ],

        providers: [
          {
            provide: ServicesService,
            useValue: servicesServiceMock,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(guardMock)
        .overrideGuard(RolesGuard)
        .useValue(guardMock)
        .compile();

    controller =
      module.get<ServicesController>(
        ServicesController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
