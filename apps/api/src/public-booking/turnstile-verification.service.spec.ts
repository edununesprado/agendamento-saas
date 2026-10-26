
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { TurnstileVerificationService } from './turnstile-verification.service.js';

describe('TurnstileVerificationService', () => {
  let service: TurnstileVerificationService;

  const verifyUrl =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  const validToken =
    'token-valido-de-teste';

  const officialTestSecret =
    '1x0000000000000000000000000000000AA';

  const officialRejectSecret =
    '2x0000000000000000000000000000000AA';

  const fetchMock = vi.fn();

  /*
   * SIMULAÇÃO DO CLOUDFLARE
   *
   * As respostas são simuladas para
   * executar os testes sem internet
   * e sem criar agendamentos reais.
   */
  function mockResponse(
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

  /*
   * CONFIGURAÇÃO PADRÃO
   *
   * Utiliza uma chave fictícia
   * diferente das credenciais
   * oficiais de teste.
   *
   * Assim conseguimos verificar
   * as regras das chaves reais.
   */
  beforeEach(() => {
    vi.resetAllMocks();

    service =
      new TurnstileVerificationService();

    vi.stubEnv(
      'NODE_ENV',
      'test',
    );

    vi.stubEnv(
      'TURNSTILE_ENABLED',
      'true',
    );

    vi.stubEnv(
      'TURNSTILE_SECRET_KEY',
      'segredo-de-teste',
    );

    vi.stubEnv(
      'TURNSTILE_ALLOWED_HOSTNAMES',
      'localhost,agenda.exemplo.com',
    );

    vi.stubGlobal(
      'fetch',
      fetchMock,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /*
   * TESTE 1
   *
   * A configuração desativada
   * preserva o comportamento
   * do desenvolvimento.
   */
  it('permite continuar quando a proteção está desativada', async () => {
    vi.stubEnv(
      'TURNSTILE_ENABLED',
      'false',
    );

    await expect(
      service.verify(),
    ).resolves.toBeUndefined();

    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });

  /*
   * TESTE 2
   *
   * Token obrigatório quando
   * a proteção está habilitada.
   */
  it('bloqueia token ausente quando a proteção está ativa', async () => {
    await expect(
      service.verify(),
    ).rejects.toThrow(
      BadRequestException,
    );

    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });

  /*
   * TESTE 3
   */
  it('bloqueia token vazio', async () => {
    await expect(
      service.verify('   '),
    ).rejects.toThrow(
      BadRequestException,
    );

    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });

  /*
   * TESTE 4
   *
   * Limite máximo de 2048 caracteres.
   */
  it('bloqueia token acima de 2048 caracteres', async () => {
    const oversizedToken =
      'x'.repeat(2049);

    await expect(
      service.verify(oversizedToken),
    ).rejects.toThrow(
      BadRequestException,
    );

    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });

  /*
   * TESTE 5
   *
   * A ausência da chave secreta
   * não pode liberar agendamentos.
   */
  it('bloqueia quando a chave secreta não está configurada', async () => {
    vi.stubEnv(
      'TURNSTILE_SECRET_KEY',
      '',
    );

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });

  /*
   * TESTE 6
   *
   * Confirma o envio correto
   * dos dados à API Siteverify.
   */
  it('envia o token para validação no Cloudflare', async () => {
    mockResponse({
      success: true,
      action: 'public_booking',
      hostname: 'localhost',
    });

    await expect(
      service.verify(validToken),
    ).resolves.toBeUndefined();

    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(1);

    expect(
      fetchMock,
    ).toHaveBeenCalledWith(
      verifyUrl,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
      }),
    );

    const requestOptions =
      fetchMock.mock.calls[0][1] as RequestInit;

    const form =
      new URLSearchParams(
        requestOptions.body as string,
      );

    expect(
      form.get('secret'),
    ).toBe('segredo-de-teste');

    expect(
      form.get('response'),
    ).toBe(validToken);
  });

  /*
   * TESTE 7
   *
   * Resposta de token inválido.
   */
  it('bloqueia token rejeitado pelo Cloudflare', async () => {
    mockResponse({
      success: false,
      'error-codes': [
        'invalid-input-response',
      ],
    });

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ForbiddenException,
    );
  });

  /*
   * TESTE 8
   *
   * Token expirado ou reutilizado.
   */
  it('bloqueia token expirado ou reutilizado', async () => {
    mockResponse({
      success: false,
      'error-codes': [
        'timeout-or-duplicate',
      ],
    });

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ForbiddenException,
    );
  });

  /*
   * TESTE 9
   *
   * Uma chave real não deve aceitar
   * tokens de outros formulários.
   */
  it('bloqueia token de outra ação', async () => {
    mockResponse({
      success: true,
      action: 'outro_formulario',
      hostname: 'localhost',
    });

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ForbiddenException,
    );
  });

  /*
   * TESTE 10
   *
   * Domínio não autorizado.
   */
  it('bloqueia token de domínio não autorizado', async () => {
    mockResponse({
      success: true,
      action: 'public_booking',
      hostname: 'site-desconhecido.com',
    });

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ForbiddenException,
    );
  });

  /*
   * TESTE 11
   *
   * Domínio autorizado.
   */
  it('permite token de domínio autorizado', async () => {
    mockResponse({
      success: true,
      action: 'public_booking',
      hostname: 'agenda.exemplo.com',
    });

    await expect(
      service.verify(validToken),
    ).resolves.toBeUndefined();
  });

  /*
   * TESTE 12
   *
   * Falha HTTP do Cloudflare.
   */
  it('bloqueia quando o Cloudflare retorna erro HTTP', async () => {
    mockResponse(
      {
        success: false,
      },
      503,
    );

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  /*
   * TESTE 13
   *
   * Falha de conexão.
   */
  it('bloqueia quando ocorre falha de conexão', async () => {
    fetchMock.mockRejectedValueOnce(
      new Error('Erro de rede'),
    );

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  /*
   * TESTE 14
   *
   * Resposta que não contém
   * JSON válido.
   */
  it('bloqueia quando o Cloudflare retorna JSON inválido', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        'resposta-invalida',
        {
          status: 200,
        },
      ),
    );

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  /*
   * TESTE 15
   *
   * Em produção a proteção
   * é obrigatória.
   */
  it('exige proteção em produção quando não há configuração explícita', async () => {
    vi.stubEnv(
      'NODE_ENV',
      'production',
    );

    vi.stubEnv(
      'TURNSTILE_ENABLED',
      '',
    );

    vi.stubEnv(
      'TURNSTILE_SECRET_KEY',
      '',
    );

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });

  /*
   * ==================================
   * NOVOS TESTES — ETAPA 6.2
   * ==================================
   *
   * Os testes seguintes verificam
   * a correção aplicada após o
   * erro HTTP 403 encontrado
   * durante o agendamento real.
   */

  /*
   * TESTE 16
   *
   * Reproduz a resposta obtida
   * na requisição real à Cloudflare.
   *
   * A resposta aprovada com a chave
   * oficial de teste pode não trazer
   * o campo action e retornar
   * hostname = example.com.
   *
   * Essa exceção só é permitida
   * porque estamos usando uma
   * chave oficial de teste.
   */
  it('aceita resposta simplificada da chave oficial de teste', async () => {
    vi.stubEnv(
      'TURNSTILE_SECRET_KEY',
      officialTestSecret,
    );

    mockResponse({
      challenge_ts:
        '2026-10-26T02:13:38.093Z',

      'error-codes': [],

      hostname: 'example.com',

      metadata: {
        result_with_testing_key: true,
      },

      success: true,
    });

    await expect(
      service.verify(validToken),
    ).resolves.toBeUndefined();

    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(1);
  });

  /*
   * TESTE 17
   *
   * Aceita action = test somente
   * com a chave oficial de teste
   * e fora de produção.
   */
  it('aceita action test com credencial oficial de desenvolvimento', async () => {
    vi.stubEnv(
      'TURNSTILE_SECRET_KEY',
      officialTestSecret,
    );

    mockResponse({
      success: true,
      action: 'test',
      hostname: 'example.com',
    });

    await expect(
      service.verify(validToken),
    ).resolves.toBeUndefined();
  });

  /*
   * TESTE 18
   *
   * Mesmo com a chave oficial
   * de teste, success = false
   * precisa bloquear a operação.
   */
  it('bloqueia resposta negativa com chave oficial de teste', async () => {
    vi.stubEnv(
      'TURNSTILE_SECRET_KEY',
      officialRejectSecret,
    );

    mockResponse({
      success: false,

      'error-codes': [
        'invalid-input-response',
      ],

      metadata: {
        result_with_testing_key: true,
      },
    });

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ForbiddenException,
    );
  });

  /*
   * TESTE 19
   *
   * Chaves oficiais de teste
   * não podem ser utilizadas
   * em produção.
   *
   * A configuração
   * TURNSTILE_ENABLED=false
   * também não pode desativar
   * essa proteção.
   */
  it('proíbe chave oficial de teste em produção mesmo com proteção desativada no ambiente', async () => {
    vi.stubEnv(
      'NODE_ENV',
      'production',
    );

    vi.stubEnv(
      'TURNSTILE_ENABLED',
      'false',
    );

    vi.stubEnv(
      'TURNSTILE_SECRET_KEY',
      officialTestSecret,
    );

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });

  /*
   * TESTE 20
   *
   * Uma chave real não deve
   * aceitar uma resposta
   * simplificada de teste.
   *
   * Mesmo que a resposta contenha
   * metadata.result_with_testing_key,
   * o backend só utiliza a exceção
   * quando a chave configurada
   * é oficialmente de teste.
   */
  it('não permite que metadata de teste dispense a ação com chave real', async () => {
    mockResponse({
      success: true,
      hostname: 'example.com',

      metadata: {
        result_with_testing_key: true,
      },
    });

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ForbiddenException,
    );
  });

  /*
   * TESTE 21
   *
   * A ação correta sozinha não
   * basta quando o hostname
   * não é retornado.
   */
  it('exige hostname autorizado com chave real', async () => {
    mockResponse({
      success: true,
      action: 'public_booking',
    });

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ForbiddenException,
    );
  });

  /*
   * TESTE 22
   *
   * Em produção, a lista de
   * domínios autorizados precisa
   * estar configurada.
   */
  it('bloqueia produção sem configuração de domínios autorizados', async () => {
    vi.stubEnv(
      'NODE_ENV',
      'production',
    );

    vi.stubEnv(
      'TURNSTILE_ALLOWED_HOSTNAMES',
      '',
    );

    mockResponse({
      success: true,
      action: 'public_booking',
      hostname: 'localhost',
    });

    await expect(
      service.verify(validToken),
    ).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  /*
   * TESTE 23
   *
   * Demonstra o cenário esperado
   * com uma chave real:
   *
   * - Proteção obrigatória.
   * - Chave não pertencente às
   *   credenciais oficiais de teste.
   * - Ação correta.
   * - Domínio autorizado.
   *
   * Tudo é simulado; nenhuma
   * credencial real é utilizada.
   */
  it('permite resposta válida com chave real em produção', async () => {
    vi.stubEnv(
      'NODE_ENV',
      'production',
    );

    vi.stubEnv(
      'TURNSTILE_ENABLED',
      'false',
    );

    vi.stubEnv(
      'TURNSTILE_ALLOWED_HOSTNAMES',
      'agenda.exemplo.com',
    );

    mockResponse({
      success: true,
      action: 'public_booking',
      hostname: 'agenda.exemplo.com',
    });

    await expect(
      service.verify(validToken),
    ).resolves.toBeUndefined();

    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(1);
  });
});
