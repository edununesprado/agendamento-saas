
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

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/*
 * TESTES UNITÁRIOS — AUTH CONTROLLER
 *
 * O AuthController utiliza:
 *
 * 1. AuthService
 *
 * Além disso, a rota /auth/me
 * utiliza o JwtAuthGuard,
 * que depende de:
 *
 * 2. JwtService
 * 3. ConfigService
 *
 * Fornecemos mocks para testar
 * a inicialização do controller
 * sem acessar serviços reais.
 */

describe('AuthController', () => {
  let controller: AuthController;

  /*
   * MOCK DO AUTH SERVICE
   */
  const authServiceMock = {
    register: vi.fn(),
    login: vi.fn(),
    me: vi.fn(),
  };

  /*
   * MOCK DO JWT SERVICE
   */
  const jwtServiceMock = {
    verifyAsync: vi.fn(),
    signAsync: vi.fn(),
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
        controllers: [
          AuthController,
        ],

        providers: [
          {
            provide: AuthService,
            useValue: authServiceMock,
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

    controller =
      module.get<AuthController>(
        AuthController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
