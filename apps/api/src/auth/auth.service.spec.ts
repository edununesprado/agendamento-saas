
import {
  Test,
  TestingModule,
} from '@nestjs/testing';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

/*
 * TESTES UNITÁRIOS — AUTH SERVICE
 *
 * O AuthService depende de:
 *
 * 1. PrismaService
 * 2. UsersService
 * 3. JwtService
 * 4. ConfigService
 *
 * Utilizamos mocks para que o teste
 * não precise acessar PostgreSQL,
 * consultar usuários reais ou
 * gerar tokens JWT reais.
 */

describe('AuthService', () => {
  let service: AuthService;

  /*
   * MOCK DO PRISMA
   */
  const prismaMock = {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },

    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },

    membership: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },

    $transaction: vi.fn(),
  };

  /*
   * MOCK DO USERS SERVICE
   */
  const usersServiceMock = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
  };

  /*
   * MOCK DO JWT SERVICE
   */
  const jwtServiceMock = {
    signAsync: vi.fn(),
    verifyAsync: vi.fn(),
  };

  /*
   * MOCK DO CONFIG SERVICE
   */
  const configServiceMock = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          AuthService,

          {
            provide: PrismaService,
            useValue: prismaMock,
          },

          {
            provide: UsersService,
            useValue: usersServiceMock,
          },

          {
            provide: JwtService,
            useValue: jwtServiceMock,
          },

          {
            provide: ConfigService,
            useValue: configServiceMock,
          },
        ],
      }).compile();

    service =
      module.get<AuthService>(
        AuthService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
