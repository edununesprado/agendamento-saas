
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';

import { Test } from '@nestjs/testing';
import request from 'supertest';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PublicBookingService } from '../src/public-booking/public-booking.service.js';

/*
 * ETAPA 6.2 — TESTE E2E DO TURNSTILE
 *
 * Verifica a integração entre:
 *
 * HTTP
 * -> ValidationPipe
 * -> ThrottlerGuard
 * -> PublicBookingController
 * -> TurnstileVerificationService
 * -> PublicBookingService
 *
 * A chamada ao Cloudflare é simulada.
 *
 * A criação de agendamento também é
 * simulada para garantir que os testes
 * de segurança não alterem a agenda.
 */

describe(
  'Agendamento público com Turnstile (E2E)',
  () => {
    let app: INestApplication;

    const createAppointmentMock = vi.fn();
    const findServicesMock = vi.fn();

    const fetchMock = vi.fn();

    const endpoint =
      '/public/tenants/empresa-turnstile-test/appointments';

    const verifyUrl =
      'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    const validToken =
      'turnstile-token-de-teste';

    const bookingData = {
      employeeId: 'employee-test-id',
      serviceId: 'service-test-id',
      startsAt: '2026-12-02T15:00:00.000Z',

      client: {
        name: 'Cliente Teste Turnstile',
        phone: '34999999999',
        email: 'cliente@example.test',
      },

      notes: 'Teste E2E de segurança',
    };

    /*
     * Simula a resposta do Cloudflare.
     *
     * O HTTP externo nunca será chamado
     * de verdade durante estes testes.
     */
    function mockCloudflareResponse(
      data: Record<string, unknown>,
      status = 200,
    ) {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify(data),
          {
            status,
            headers: {
              'Content-Type':
                'application/json',
            },
          },
        ),
      );
    }

    function mockValidToken() {
      mockCloudflareResponse({
        success: true,
        action: 'public_booking',
        hostname: 'localhost',
      });
    }

    /*
     * Envia uma requisição real à API
     * NestJS criada para os testes.
     */
    function postBooking(
      token?: string,
    ) {
      return request(
        app.getHttpServer(),
      )
        .post(endpoint)
        .send({
          ...bookingData,

          ...(token !== undefined
            ? {
                turnstileToken: token,
              }
            : {}),
        });
    }

    beforeAll(async () => {
      /*
       * PROTEÇÃO DO AMBIENTE E2E
       *
       * Somente o banco agendamento_test
       * pode ser utilizado.
       */
      const databaseUrl =
        process.env.DATABASE_URL;

      if (
        !databaseUrl ||
        new URL(databaseUrl).pathname !==
          '/agendamento_test'
      ) {
        throw new Error(
          'SEGURANÇA: os testes E2E devem usar agendamento_test',
        );
      }

      /*
       * Ativa o Turnstile exclusivamente
       * no processo de testes.
       *
       * Não modifica arquivos .env.
       */
      vi.stubEnv(
        'TURNSTILE_ENABLED',
        'true',
      );

      vi.stubEnv(
        'TURNSTILE_SECRET_KEY',
        'segredo-e2e-de-teste',
      );

      vi.stubEnv(
        'TURNSTILE_ALLOWED_HOSTNAMES',
        'localhost',
      );

      /*
       * Simula apenas a criação.
       *
       * O controller e o serviço real
       * de validação permanecem ativos.
       */
      const moduleRef =
        await Test.createTestingModule({
          imports: [AppModule],
        })
          .overrideProvider(
            PublicBookingService,
          )
          .useValue({
            findTenant: vi.fn(),

            findServices:
              findServicesMock,

            findEmployees: vi.fn(),

            findAvailability: vi.fn(),

            createAppointment:
              createAppointmentMock,
          })
          .compile();

      app =
        moduleRef.createNestApplication();

      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
        }),
      );

      await app.init();

      /*
       * Substitui fetch somente depois
       * de inicializar a aplicação.
       *
       * Isso permite testar o serviço
       * real de verificação do Turnstile.
       */
      vi.stubGlobal(
        'fetch',
        fetchMock,
      );
    }, 60000);

    beforeEach(() => {
      /*
       * Reinicia os mocks para que
       * um teste não interfira no outro.
       */
      fetchMock.mockReset();

      createAppointmentMock.mockReset();

      findServicesMock.mockReset();

      createAppointmentMock.mockResolvedValue({
        id: 'appointment-test-id',
        status: 'PENDING',
      });

      findServicesMock.mockResolvedValue([]);

      vi.stubEnv(
        'TURNSTILE_ENABLED',
        'true',
      );

      vi.stubEnv(
        'TURNSTILE_SECRET_KEY',
        'segredo-e2e-de-teste',
      );

      vi.stubEnv(
        'TURNSTILE_ALLOWED_HOSTNAMES',
        'localhost',
      );
    });

    afterAll(async () => {
      if (app) {
        await app.close();
      }

      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }, 30000);

    /*
     * TESTE 1
     *
     * O token válido autoriza
     * a continuação do fluxo.
     */
    it(
      'permite criar agendamento com token válido',
      async () => {
        mockValidToken();

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(201);

        expect(
          response.body.id,
        ).toBe('appointment-test-id');

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          createAppointmentMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          createAppointmentMock,
        ).toHaveBeenCalledWith(
          'empresa-turnstile-test',
          expect.objectContaining({
            employeeId:
              bookingData.employeeId,

            serviceId:
              bookingData.serviceId,

            turnstileToken: validToken,
          }),
        );
      },
    );

    /*
     * TESTE 2
     *
     * O token não foi enviado.
     */
    it(
      'bloqueia agendamento sem token com HTTP 400',
      async () => {
        const response =
          await postBooking();

        expect(
          response.status,
        ).toBe(400);

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 3
     *
     * Token vazio.
     */
    it(
      'bloqueia agendamento com token vazio',
      async () => {
        const response =
          await postBooking('');

        expect(
          response.status,
        ).toBe(400);

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 4
     *
     * Cloudflare rejeita o token.
     */
    it(
      'bloqueia token rejeitado pelo Cloudflare',
      async () => {
        mockCloudflareResponse({
          success: false,

          'error-codes': [
            'invalid-input-response',
          ],
        });

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(403);

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 5
     *
     * Token expirado ou duplicado.
     */
    it(
      'bloqueia token expirado ou reutilizado',
      async () => {
        mockCloudflareResponse({
          success: false,

          'error-codes': [
            'timeout-or-duplicate',
          ],
        });

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(403);

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 6
     *
     * O token foi aprovado para
     * outra ação.
     */
    it(
      'bloqueia token de outra ação',
      async () => {
        mockCloudflareResponse({
          success: true,
          action: 'outro_formulario',
          hostname: 'localhost',
        });

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(403);

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 7
     *
     * Token emitido para outro domínio.
     */
    it(
      'bloqueia token de domínio não autorizado',
      async () => {
        mockCloudflareResponse({
          success: true,
          action: 'public_booking',
          hostname: 'site-externo.com',
        });

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(403);

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 8
     *
     * Chave secreta ausente.
     */
    it(
      'não permite agendamento quando falta a chave secreta',
      async () => {
        vi.stubEnv(
          'TURNSTILE_SECRET_KEY',
          '',
        );

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(503);

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 9
     *
     * Serviço externo indisponível.
     */
    it(
      'não libera agendamento quando Cloudflare retorna HTTP 503',
      async () => {
        mockCloudflareResponse(
          {
            success: false,
          },
          503,
        );

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(503);

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 10
     *
     * Falha de conexão.
     */
    it(
      'não libera agendamento quando ocorre falha de rede',
      async () => {
        fetchMock.mockRejectedValueOnce(
          new Error(
            'Falha simulada de conexão',
          ),
        );

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(503);

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 11
     *
     * JSON inválido do serviço externo.
     */
    it(
      'não libera agendamento quando Cloudflare retorna JSON inválido',
      async () => {
        fetchMock.mockResolvedValueOnce(
          new Response(
            'resposta-invalida',
            {
              status: 200,
            },
          ),
        );

        const response =
          await postBooking(validToken);

        expect(
          response.status,
        ).toBe(503);

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 12
     *
     * O token de uso único não
     * pode ser reaproveitado.
     *
     * Simula uma primeira aprovação
     * e uma segunda rejeição.
     */
    it(
      'bloqueia a reutilização de token após primeira aprovação',
      async () => {
        mockValidToken();

        mockCloudflareResponse({
          success: false,

          'error-codes': [
            'timeout-or-duplicate',
          ],
        });

        const first =
          await postBooking(validToken);

        expect(
          first.status,
        ).toBe(201);

        const second =
          await postBooking(validToken);

        expect(
          second.status,
        ).toBe(403);

        expect(
          createAppointmentMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    /*
     * TESTE 13
     *
     * DTO inválido é rejeitado antes
     * de chamar o Turnstile.
     */
    it(
      'rejeita dados inválidos antes da verificação',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .post(endpoint)
            .send({
              turnstileToken: validToken,
            });

        expect(
          response.status,
        ).toBe(400);

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );

    /*
     * TESTE 14
     *
     * A configuração desativada
     * preserva o comportamento
     * de desenvolvimento.
     */
    it(
      'mantém compatibilidade quando proteção está desativada',
      async () => {
        vi.stubEnv(
          'TURNSTILE_ENABLED',
          'false',
        );

        const response =
          await postBooking();

        expect(
          response.status,
        ).toBe(201);

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();

        expect(
          createAppointmentMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    /*
     * TESTE 15
     *
     * Consultas públicas continuam
     * disponíveis sem CAPTCHA.
     */
    it(
      'mantém a listagem pública de serviços disponível',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/public/tenants/empresa-turnstile-test/services',
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body,
        ).toEqual([]);

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();

        expect(
          createAppointmentMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
