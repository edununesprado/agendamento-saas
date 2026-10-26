
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
import { TenantsService } from './tenants.service.js';

/*
 * TESTES UNITÁRIOS — TENANTS SERVICE
 *
 * O TenantsService depende do
 * PrismaService para consultar
 * e atualizar as empresas.
 *
 * Utilizamos um mock para
 * evitar conexões reais
 * com o PostgreSQL.
 */

describe('TenantsService', () => {
  let service: TenantsService;

  /*
   * MOCK DO PRISMA
   *
   * Simula os métodos utilizados
   * pelo TenantsService.
   */
  const prismaMock = {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          TenantsService,

          /*
           * Injeta a dependência
           * simulada no NestJS.
           */
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<TenantsService>(
        TenantsService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
