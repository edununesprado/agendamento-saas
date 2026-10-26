
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
import { DashboardService } from './dashboard.service.js';

/*
 * TESTES UNITÁRIOS — DASHBOARD SERVICE
 *
 * O DashboardService depende do
 * PrismaService para consultar os
 * dados e gerar os indicadores.
 *
 * Utilizamos um mock para que
 * o teste não dependa de uma
 * conexão real com PostgreSQL.
 */

describe('DashboardService', () => {
  let service: DashboardService;

  /*
   * MOCK DO PRISMA
   *
   * Simula as consultas utilizadas
   * pelo DashboardService.
   */
  const prismaMock = {
    tenant: {
      findUnique: vi.fn(),
    },

    appointment: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          DashboardService,

          /*
           * Fornece o PrismaService
           * simulado ao NestJS.
           */
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<DashboardService>(
        DashboardService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
