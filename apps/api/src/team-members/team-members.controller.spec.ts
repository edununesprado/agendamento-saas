
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

import { TeamMembersController } from './team-members.controller.js';
import { TeamMembersService } from './team-members.service.js';

/*
 * TESTES UNITÁRIOS — TEAM MEMBERS CONTROLLER
 *
 * O TeamMembersController utiliza:
 *
 * 1. TeamMembersService
 * 2. JwtAuthGuard
 * 3. RolesGuard
 *
 * Utilizamos mocks para verificar
 * a inicialização do controller
 * sem conectar ao PostgreSQL
 * ou validar tokens JWT reais.
 *
 * As regras de autenticação
 * e permissões continuam
 * inalteradas na aplicação.
 */

describe('TeamMembersController', () => {
  let controller: TeamMembersController;

  /*
   * MOCK DO TEAM MEMBERS SERVICE
   *
   * Simula os métodos utilizados
   * pelo controller.
   */
  const teamMembersServiceMock = {
    findAll: vi.fn(),
    create: vi.fn(),
    updateRole: vi.fn(),
    linkEmployee: vi.fn(),
  };

  /*
   * MOCK DOS GUARDS
   *
   * Utilizado somente neste teste
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
          TeamMembersController,
        ],

        providers: [
          {
            provide: TeamMembersService,
            useValue: teamMembersServiceMock,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(guardMock)
        .overrideGuard(RolesGuard)
        .useValue(guardMock)
        .compile();

    controller =
      module.get<TeamMembersController>(
        TeamMembersController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
