
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
import { ServicesService } from './services.service.js';

/*
 * TESTES UNITÁRIOS — SERVICES SERVICE
 *
 * O ServicesService depende do
 * PrismaService para realizar
 * operações no banco de dados.
 *
 * Neste teste, utilizamos um
 * PrismaService simulado.
 *
 * Assim, nenhuma conexão real
 * com PostgreSQL é necessária.
 */

describe('ServicesService', () => {
  let service: ServicesService;

  /*
   * MOCK DO PRISMA
   *
   * Simula as operações utilizadas
   * pelo ServicesService.
   */
  const prismaMock = {
    service: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          ServicesService,

          /*
           * Fornece a dependência
           * PrismaService simulada.
           */
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<ServicesService>(
        ServicesService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
