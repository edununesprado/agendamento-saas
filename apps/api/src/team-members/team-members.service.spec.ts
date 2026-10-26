
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

import { PrismaService } from '../prisma/prisma.service.js';
import { TeamMembersService } from './team-members.service.js';

/*
 * TESTES UNITÁRIOS — TEAM MEMBERS SERVICE
 *
 * O TeamMembersService depende
 * do PrismaService para gerenciar
 * os usuários da empresa, suas
 * funções e seus vínculos com
 * os funcionários.
 *
 * Utilizamos um mock para evitar
 * conexões reais com PostgreSQL.
 */

describe('TeamMembersService', () => {
  let service: TeamMembersService;

  /*
   * MOCK DO PRISMA
   *
   * Simula os métodos utilizados
   * pelo TeamMembersService.
   */
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },

    membership: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },

    employee: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },

    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          TeamMembersService,

          /*
           * Injeta o PrismaService
           * simulado no módulo de teste.
           */
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<TeamMembersService>(
        TeamMembersService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
