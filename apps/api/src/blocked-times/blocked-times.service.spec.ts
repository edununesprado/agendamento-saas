
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
import { BlockedTimesService } from './blocked-times.service.js';

/*
 * TESTES UNITÁRIOS — BLOCKED TIMES SERVICE
 *
 * O BlockedTimesService depende
 * do PrismaService.
 *
 * Utilizamos um mock para evitar
 * conexões com o banco de dados real.
 */

describe('BlockedTimesService', () => {
  let service: BlockedTimesService;

  /*
   * Simula os métodos do Prisma
   * utilizados pelo serviço.
   */
  const prismaMock = {
    employee: {
      findFirst: vi.fn(),
    },

    blockedTime: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          BlockedTimesService,

          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<BlockedTimesService>(
        BlockedTimesService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
