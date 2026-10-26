
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type TurnstileVerifyResponse = {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
  metadata?: {
    result_with_testing_key?: boolean;
  };
};

@Injectable()
export class TurnstileVerificationService {
  private readonly verifyUrl =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  private readonly expectedAction =
    'public_booking';

  private readonly timeoutMs = 8000;

  /*
   * ETAPA 6.2 — CLOUDFLARE TURNSTILE
   *
   * Chaves secretas oficiais de teste.
   *
   * 1x = aprovação simulada
   * 2x = reprovação simulada
   * 3x = token duplicado simulado
   *
   * Essas chaves não oferecem
   * proteção real contra bots.
   */
  private readonly testSecrets = new Set([
    '1x0000000000000000000000000000000AA',
    '2x0000000000000000000000000000000AA',
    '3x0000000000000000000000000000000AA',
  ]);

  /*
   * Em produção, a proteção é
   * obrigatória, independentemente
   * de TURNSTILE_ENABLED.
   */
  private isProduction(): boolean {
    return (
      process.env.NODE_ENV === 'production'
    );
  }

  private isEnabled(): boolean {
    if (this.isProduction()) {
      return true;
    }

    const setting =
      process.env.TURNSTILE_ENABLED
        ?.trim()
        .toLowerCase();

    return setting === 'true';
  }

  /*
   * Identifica exclusivamente
   * as chaves oficiais de teste.
   */
  private isTestSecret(
    secret: string,
  ): boolean {
    return this.testSecrets.has(secret);
  }

  /*
   * Domínios permitidos.
   *
   * Exemplo em desenvolvimento:
   * localhost
   *
   * Exemplo em produção:
   * agenda.exemplo.com
   */
  private getAllowedHostnames(): string[] {
    return (
      process.env.TURNSTILE_ALLOWED_HOSTNAMES ??
      ''
    )
      .split(',')
      .map((hostname) =>
        hostname.trim().toLowerCase(),
      )
      .filter(Boolean);
  }

  /*
   * VERIFICAÇÃO DO AGENDAMENTO PÚBLICO
   *
   * Executada pelo controller antes
   * da criação do agendamento.
   */
  async verify(
    token?: string,
  ): Promise<void> {
    /*
     * Desenvolvimento sem Turnstile:
     * mantém o comportamento anterior.
     *
     * Produção:
     * a validação sempre será exigida.
     */
    if (!this.isEnabled()) {
      return;
    }

    const secret =
      process.env.TURNSTILE_SECRET_KEY
        ?.trim();

    /*
     * Nunca prosseguir quando a
     * proteção estiver ativada
     * e a chave não existir.
     */
    if (!secret) {
      throw new ServiceUnavailableException(
        'A verificação de segurança está indisponível. Tente novamente mais tarde.',
      );
    }

    const usingTestSecret =
      this.isTestSecret(secret);

    /*
     * PROTEÇÃO DE PRODUÇÃO
     *
     * Chaves de teste são proibidas
     * em produção, mesmo que a
     * Cloudflare retorne sucesso.
     */
    if (
      this.isProduction() &&
      usingTestSecret
    ) {
      throw new ServiceUnavailableException(
        'A verificação de segurança não está configurada para produção.',
      );
    }

    /*
     * A requisição precisa conter
     * um token válido estruturalmente.
     *
     * O limite oficial é de
     * 2048 caracteres.
     */
    if (
      typeof token !== 'string' ||
      !token.trim() ||
      token.length > 2048
    ) {
      throw new BadRequestException(
        'Conclua a verificação de segurança antes de agendar.',
      );
    }

    const form =
      new URLSearchParams();

    form.set(
      'secret',
      secret,
    );

    form.set(
      'response',
      token.trim(),
    );

    let result: TurnstileVerifyResponse;

    /*
     * VALIDAÇÃO NO SERVIDOR
     *
     * O token é enviado diretamente
     * à API Siteverify da Cloudflare.
     *
     * O segredo permanece somente
     * no backend.
     */
    try {
      const response =
        await fetch(
          this.verifyUrl,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded',
            },

            body: form.toString(),

            signal: AbortSignal.timeout(
              this.timeoutMs,
            ),
          },
        );

      if (!response.ok) {
        throw new Error(
          'Falha HTTP na verificação Turnstile',
        );
      }

      result =
        (await response.json()) as TurnstileVerifyResponse;
    } catch {
      /*
       * Em falhas de conexão,
       * timeout ou resposta inválida,
       * a operação não é liberada.
       */
      throw new ServiceUnavailableException(
        'Não foi possível verificar a solicitação. Tente novamente.',
      );
    }

    /*
     * VALIDAÇÃO OBRIGATÓRIA
     *
     * A Cloudflare precisa responder
     * success: true.
     *
     * Isso também se aplica às
     * credenciais oficiais de teste.
     */
    if (
      !result ||
      result.success !== true
    ) {
      throw new ForbiddenException(
        'A verificação de segurança não foi aprovada. Realize uma nova verificação.',
      );
    }

    /*
     * CORREÇÃO — CHAVES DE TESTE
     *
     * As credenciais oficiais de teste
     * podem retornar uma resposta
     * simplificada, por exemplo:
     *
     * {
     *   success: true,
     *   hostname: "example.com",
     *   metadata: {
     *     result_with_testing_key: true
     *   }
     * }
     *
     * Nesse caso, "action" pode
     * não estar presente e o domínio
     * pode ser apenas demonstrativo.
     *
     * Como a chave oficial de teste
     * já foi identificada e produção
     * foi bloqueada acima, aceitamos
     * o sucesso da API de teste sem
     * exigir action ou hostname.
     *
     * IMPORTANTE:
     * Essa exceção NÃO se aplica
     * a chaves reais.
     */
    if (usingTestSecret) {
      return;
    }

    /*
     * SEGURANÇA COM CHAVES REAIS
     *
     * O token precisa corresponder
     * à operação public_booking.
     *
     * Tokens sem action ou com
     * action diferente são rejeitados.
     */
    if (
      result.action !== this.expectedAction
    ) {
      throw new ForbiddenException(
        'A verificação de segurança não corresponde a esta operação.',
      );
    }

    /*
     * VALIDAÇÃO DOS DOMÍNIOS
     *
     * Uma lista deve ser configurada
     * no ambiente de produção.
     */
    const allowedHostnames =
      this.getAllowedHostnames();

    if (
      this.isProduction() &&
      allowedHostnames.length === 0
    ) {
      throw new ServiceUnavailableException(
        'Os domínios autorizados da verificação de segurança não estão configurados.',
      );
    }

    /*
     * Se houver domínios definidos,
     * o hostname retornado precisa
     * pertencer à lista.
     */
    if (
      allowedHostnames.length > 0
    ) {
      const hostname =
        result.hostname
          ?.trim()
          .toLowerCase();

      if (
        !hostname ||
        !allowedHostnames.includes(
          hostname,
        )
      ) {
        throw new ForbiddenException(
          'A verificação de segurança não pertence a um domínio autorizado.',
        );
      }
    }

    /*
     * VERIFICAÇÃO APROVADA
     *
     * O controller poderá executar
     * o fluxo normal de criação
     * do agendamento.
     *
     * Nenhum token é armazenado
     * no banco de dados.
     */
  }
}
