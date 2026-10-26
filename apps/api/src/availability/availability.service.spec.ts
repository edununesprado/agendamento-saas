
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
import { AvailabilityService } from './availability.service.js';

/*
 * TESTES UNITÁRIOS — AVAILABILITY SERVICE
 *
 * O AvailabilityService depende
 * do PrismaService.
 *
 * Utilizamos um mock para que o
 * teste não acesse o banco de dados.
 */

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  /*
   * Simulação das operações do Prisma
   * utilizadas na consulta de horários.
   */
  const prismaMock = {
    employee: {
      findFirst: vi.fn(),
    },

    service: {
      findFirst: vi.fn(),
    },

    employeeService: {
      findFirst: vi.fn(),
    },

    tenant: {
      findUnique: vi.fn(),
    },

    availabilityRule: {
      findMany: vi.fn(),
    },

    blockedTime: {
      findMany: vi.fn(),
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
          AvailabilityService,

          /*
           * Injeta o PrismaService
           * simulado no NestJS.
           */
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<AvailabilityService>(
        AvailabilityService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
