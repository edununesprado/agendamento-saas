
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

import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';

/*
 * TESTES UNITÁRIOS — CLIENTS CONTROLLER
 *
 * O controller utiliza:
 *
 * 1. ClientsService
 * 2. JwtAuthGuard
 * 3. RolesGuard
 *
 * Utilizamos mocks para testar
 * a inicialização do controller
 * sem conectar ao PostgreSQL
 * ou validar tokens reais.
 *
 * Os testes específicos de
 * autenticação e permissões
 * devem validar os guards
 * separadamente.
 */

describe('ClientsController', () => {
  let controller: ClientsController;

  /*
   * MOCK DO CLIENTS SERVICE
   */
  const clientsServiceMock = {
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
   * Usado exclusivamente para
   * isolar a inicialização
   * deste controller no teste.
   */
  const guardMock = {
    canActivate: vi.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          ClientsController,
        ],

        providers: [
          {
            provide: ClientsService,
            useValue: clientsServiceMock,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(guardMock)
        .overrideGuard(RolesGuard)
        .useValue(guardMock)
        .compile();

    controller =
      module.get<ClientsController>(
        ClientsController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
