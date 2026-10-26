
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

import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/*
 * TESTES UNITÁRIOS — DASHBOARD CONTROLLER
 *
 * O DashboardController depende de:
 *
 * 1. DashboardService
 * 2. JwtAuthGuard
 * 3. RolesGuard
 *
 * Utilizamos mocks para que
 * este teste não dependa do
 * banco de dados ou da
 * autenticação real.
 *
 * Os testes de segurança devem
 * validar os guards separadamente.
 */

describe('DashboardController', () => {
  let controller: DashboardController;

  /*
   * MOCK DO DASHBOARD SERVICE
   *
   * Simula a geração dos
   * indicadores do dashboard.
   */
  const dashboardServiceMock = {
    getDashboard: vi.fn(),
  };

  /*
   * MOCK DOS GUARDS
   *
   * Utilizado exclusivamente
   * para isolar a inicialização
   * do controller neste teste.
   */
  const guardMock = {
    canActivate: vi.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          DashboardController,
        ],

        providers: [
          {
            provide: DashboardService,
            useValue: dashboardServiceMock,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(guardMock)
        .overrideGuard(RolesGuard)
        .useValue(guardMock)
        .compile();

    controller =
      module.get<DashboardController>(
        DashboardController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
