
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
import { EmployeesService } from './employees.service.js';

/*
 * TESTES UNITÁRIOS — EMPLOYEES SERVICE
 *
 * O EmployeesService depende
 * do PrismaService.
 *
 * Utilizamos um mock para que
 * os testes sejam independentes
 * do banco de dados real.
 */

describe('EmployeesService', () => {
  let service: EmployeesService;

  /*
   * Simulação das operações
   * de funcionários no Prisma.
   *
   * Nenhuma operação real será
   * executada no PostgreSQL.
   */
  const prismaMock = {
    employee: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },

    employeeService: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },

    service: {
      findMany: vi.fn(),
    },

    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          EmployeesService,

          /*
           * Fornece um PrismaService
           * simulado ao NestJS.
           */
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<EmployeesService>(
        EmployeesService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
