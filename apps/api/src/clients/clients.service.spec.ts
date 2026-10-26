
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
import { ClientsService } from './clients.service.js';

/*
 * TESTES UNITÁRIOS — CLIENTS SERVICE
 *
 * O ClientsService utiliza o
 * PrismaService para acessar
 * os dados dos clientes.
 *
 * Utilizamos um mock para que
 * o teste não dependa de uma
 * conexão real com PostgreSQL.
 */

describe('ClientsService', () => {
  let service: ClientsService;

  /*
   * MOCK DO PRISMA
   *
   * Simula os métodos utilizados
   * pelo ClientsService nas
   * operações com clientes.
   */
  const prismaMock = {
    client: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          ClientsService,

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
      module.get<ClientsService>(
        ClientsService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
