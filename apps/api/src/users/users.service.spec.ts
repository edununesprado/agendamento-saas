
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
import { UsersService } from './users.service.js';

/*
 * TESTES UNITÁRIOS — USERS SERVICE
 *
 * O UsersService utiliza o
 * PrismaService para consultar
 * os usuários.
 *
 * Utilizamos um mock para
 * que os testes não dependam
 * de uma conexão real com
 * o PostgreSQL.
 */

describe('UsersService', () => {
  let service: UsersService;

  /*
   * MOCK DO PRISMA
   *
   * Simula o método utilizado
   * para localizar usuários
   * por e-mail ou identificador.
   */
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          UsersService,

          /*
           * Injeta o PrismaService
           * simulado no módulo
           * de teste do NestJS.
           */
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<UsersService>(
        UsersService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
