
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

import { TenantsController } from './tenants.controller.js';
import { TenantsService } from './tenants.service.js';

/*
 * TESTES UNITÁRIOS — TENANTS CONTROLLER
 *
 * O TenantsController utiliza:
 *
 * 1. TenantsService
 * 2. JwtAuthGuard
 * 3. RolesGuard
 *
 * Utilizamos mocks para testar
 * a inicialização do controller
 * sem acessar o PostgreSQL
 * ou validar tokens JWT reais.
 *
 * As regras de autenticação
 * e permissões de produção
 * permanecem inalteradas.
 */

describe('TenantsController', () => {
  let controller: TenantsController;

  /*
   * MOCK DO TENANTS SERVICE
   *
   * Simula os métodos chamados
   * pelo controller.
   */
  const tenantsServiceMock = {
    findCurrent: vi.fn(),
    updateCurrent: vi.fn(),
  };

  /*
   * MOCK DOS GUARDS
   *
   * Utilizado exclusivamente
   * neste teste de inicialização.
   */
  const guardMock = {
    canActivate: vi.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          TenantsController,
        ],

        providers: [
          {
            provide: TenantsService,
            useValue: tenantsServiceMock,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(guardMock)
        .overrideGuard(RolesGuard)
        .useValue(guardMock)
        .compile();

    controller =
      module.get<TenantsController>(
        TenantsController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
