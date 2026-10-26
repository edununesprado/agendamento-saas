
'use client';

import Script from 'next/script';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

/*
 * ETAPA 6.2 — CLOUDFLARE TURNSTILE
 *
 * Componente reutilizável para
 * proteção de formulários públicos.
 *
 * FUNCIONALIDADES:
 *
 * - Carregamento do script oficial.
 * - Renderização explícita do widget.
 * - Geração do token de segurança.
 * - Tratamento de erros.
 * - Tratamento de tokens expirados.
 * - Reset após tentativa de envio.
 * - Recuperação após falha de conexão.
 * - Botão para tentar novamente.
 *
 * IMPORTANTE:
 *
 * A aprovação do widget não substitui
 * a validação obrigatória no backend.
 */

type TurnstileOptions = {
  sitekey: string;

  action?: string;

  theme?: 'auto' | 'light' | 'dark';

  callback?: (
    token: string,
  ) => void;

  'expired-callback'?: () => void;

  'error-callback'?: (
    errorCode?: string,
  ) => boolean;

  'timeout-callback'?: () => void;

  'response-field'?: boolean;
};

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: TurnstileOptions,
  ) => string | undefined;

  reset: (
    widgetId: string,
  ) => void;

  remove: (
    widgetId: string,
  ) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileWidgetProps = {
  siteKey: string;

  onTokenChange: (
    token: string | null,
  ) => void;

  /*
   * O formulário pode aumentar
   * resetKey para solicitar um
   * token novo após uma tentativa
   * de agendamento.
   */
  resetKey?: number;
};

export function TurnstileWidget({
  siteKey,
  onTokenChange,
  resetKey = 0,
}: TurnstileWidgetProps) {
  /*
   * Referência do elemento HTML
   * em que o Cloudflare renderizará
   * o widget.
   */
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  /*
   * Identificador do widget criado
   * pela API do Cloudflare.
   */
  const widgetIdRef =
    useRef<string | null>(null);

  /*
   * Preserva a função de callback
   * mais recente do componente pai.
   */
  const callbackRef =
    useRef(onTokenChange);

  /*
   * Controla solicitações externas
   * para reiniciar a verificação.
   */
  const lastResetKeyRef =
    useRef(resetKey);

  const [
    scriptReady,
    setScriptReady,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    isOffline,
    setIsOffline,
  ] = useState(false);

  /*
   * ATUALIZAÇÃO DO CALLBACK
   *
   * Evita recriar o widget quando
   * o formulário pai renderizar.
   */
  useEffect(() => {
    callbackRef.current =
      onTokenChange;
  }, [
    onTokenChange,
  ]);

  /*
   * REINICIAR VERIFICAÇÃO
   *
   * Utiliza o método oficial
   * turnstile.reset().
   *
   * Um token anterior é sempre
   * invalidado antes do reset.
   *
   * Pode ser chamado pelo botão
   * manual, pela reconexão ou
   * pela alteração de resetKey.
   */
  const retryVerification =
    useCallback(() => {
      /*
       * Nenhum token anterior
       * pode ser reutilizado.
       */
      callbackRef.current(
        null,
      );

      /*
       * Se ainda estiver offline,
       * aguarda a recuperação da
       * conexão antes de reiniciar.
       */
      if (
        !navigator.onLine
      ) {
        setIsOffline(
          true,
        );

        setError(
          'Sem conexão com a internet. Reconecte-se para realizar a verificação.',
        );

        return;
      }

      setIsOffline(
        false,
      );

      const turnstile =
        window.turnstile;

      const widgetId =
        widgetIdRef.current;

      /*
       * A biblioteca e o widget
       * precisam estar disponíveis.
       */
      if (
        !turnstile ||
        !widgetId
      ) {
        setError(
          'A verificação de segurança não está disponível. Atualize a página e tente novamente.',
        );

        return;
      }

      try {
        /*
         * Reinicia a verificação.
         *
         * A Cloudflare deverá emitir
         * um novo token após concluir
         * o desafio novamente.
         */
        turnstile.reset(
          widgetId,
        );

        setError(
          '',
        );
      } catch {
        setError(
          'Não foi possível reiniciar a verificação. Atualize a página e tente novamente.',
        );
      }
    }, []);

  /*
   * MONITORAMENTO DA CONEXÃO
   *
   * Quando o navegador perder a
   * conexão, invalidamos o token.
   *
   * Quando a conexão voltar,
   * solicitamos uma nova verificação.
   *
   * Não alteramos o formulário
   * nem apagamos os dados do cliente.
   */
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(
        true,
      );

      callbackRef.current(
        null,
      );

      setError(
        'Sem conexão com a internet. Aguarde a conexão voltar.',
      );
    };

    const handleOnline = () => {
      setIsOffline(
        false,
      );

      /*
       * Só tentamos reiniciar se
       * o widget já estiver criado.
       *
       * Caso ainda esteja carregando,
       * a renderização inicial será
       * responsável pela verificação.
       */
      if (
        widgetIdRef.current &&
        window.turnstile
      ) {
        retryVerification();
      } else {
        setError(
          '',
        );
      }
    };

    /*
     * Estado inicial da conexão.
     */
    setIsOffline(
      !navigator.onLine,
    );

    window.addEventListener(
      'offline',
      handleOffline,
    );

    window.addEventListener(
      'online',
      handleOnline,
    );

    return () => {
      window.removeEventListener(
        'offline',
        handleOffline,
      );

      window.removeEventListener(
        'online',
        handleOnline,
      );
    };
  }, [
    retryVerification,
  ]);

  /*
   * RENDERIZAÇÃO DO TURNSTILE
   *
   * Utiliza render=explicit.
   *
   * O widget somente será
   * renderizado depois que
   * o script estiver pronto.
   */
  useEffect(() => {
    if (
      !scriptReady ||
      !siteKey ||
      !containerRef.current ||
      !window.turnstile
    ) {
      return;
    }

    const turnstile =
      window.turnstile;

    let widgetId:
      string | undefined;

    try {
      widgetId =
        turnstile.render(
          containerRef.current,
          {
            sitekey: siteKey,

            /*
             * Identifica o tipo
             * de operação.
             *
             * Com chaves reais,
             * o backend exige
             * public_booking.
             */
            action:
              'public_booking',

            theme:
              'auto',

            /*
             * O token será enviado
             * explicitamente no JSON
             * para o backend.
             */
            'response-field':
              false,

            /*
             * VERIFICAÇÃO APROVADA
             *
             * Entrega o novo token
             * ao formulário pai.
             */
            callback: (token) => {
              setError(
                '',
              );

              setIsOffline(
                false,
              );

              callbackRef.current(
                token,
              );
            },

            /*
             * TOKEN EXPIRADO
             *
             * O token anterior não
             * pode mais ser utilizado.
             */
            'expired-callback': () => {
              callbackRef.current(
                null,
              );

              setError(
                'A verificação expirou. Clique em Tentar novamente para obter uma nova verificação.',
              );
            },

            /*
             * ERRO DO TURNSTILE
             *
             * Pode acontecer devido
             * a problemas de conexão,
             * configuração ou falha
             * durante a verificação.
             *
             * Mantemos a mensagem
             * visível e permitimos
             * reiniciar o widget.
             */
            'error-callback': () => {
              callbackRef.current(
                null,
              );

              if (
                !navigator.onLine
              ) {
                setIsOffline(
                  true,
                );

                setError(
                  'A conexão foi interrompida. Aguarde a internet voltar para verificar novamente.',
                );
              } else {
                setError(
                  'Não foi possível concluir a verificação de segurança. Clique em Tentar novamente.',
                );
              }

              /*
               * Informamos à Cloudflare
               * que tratamos o erro
               * na interface.
               */
              return true;
            },

            /*
             * TEMPO ESGOTADO
             *
             * O visitante poderá
             * solicitar outra
             * verificação.
             */
            'timeout-callback': () => {
              callbackRef.current(
                null,
              );

              setError(
                'O tempo da verificação terminou. Clique em Tentar novamente.',
              );
            },
          },
        );
    } catch {
      callbackRef.current(
        null,
      );

      setError(
        'Não foi possível iniciar a verificação de segurança. Atualize a página e tente novamente.',
      );

      return;
    }

    if (!widgetId) {
      callbackRef.current(
        null,
      );

      setError(
        'Não foi possível iniciar a verificação de segurança.',
      );

      return;
    }

    widgetIdRef.current =
      widgetId;

    /*
     * LIMPEZA DO COMPONENTE
     *
     * Quando o componente for
     * desmontado ou a chave mudar,
     * removemos o widget antigo.
     */
    return () => {
      if (
        widgetIdRef.current ===
        widgetId
      ) {
        widgetIdRef.current =
          null;
      }

      try {
        turnstile.remove(
          widgetId,
        );
      } catch {
        /*
         * Não interromper a
         * desmontagem caso o
         * widget já tenha sido
         * removido.
         */
      }
    };
  }, [
    scriptReady,
    siteKey,
  ]);

  /*
   * RESET SOLICITADO PELO FORMULÁRIO
   *
   * O formulário aumenta resetKey
   * após enviar um agendamento,
   * independentemente do resultado.
   *
   * Isso impede o reaproveitamento
   * de tokens de uso único.
   */
  useEffect(() => {
    if (
      lastResetKeyRef.current ===
      resetKey
    ) {
      return;
    }

    lastResetKeyRef.current =
      resetKey;

    retryVerification();
  }, [
    resetKey,
    retryVerification,
  ]);

  /*
   * CONFIGURAÇÃO AUSENTE
   *
   * A chave pública precisa
   * existir para renderizar
   * o Turnstile.
   */
  if (!siteKey) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        A verificação de segurança
        ainda não foi configurada.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/*
       * SCRIPT OFICIAL CLOUDFLARE
       *
       * Carregado pelo Next.js
       * uma única vez.
       */}
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => {
          setScriptReady(
            true,
          );
        }}
        onError={() => {
          callbackRef.current(
            null,
          );

          setError(
            'Não foi possível carregar a verificação de segurança. Confira sua conexão e atualize a página.',
          );
        }}
      />

      {/*
       * CONTAINER DO WIDGET
       */}
      <div
        ref={containerRef}
        aria-label="Verificação de segurança"
      />

      {/*
       * MENSAGEM DE CARREGAMENTO
       */}
      {!scriptReady &&
        !error &&
        !isOffline && (
          <p className="text-sm text-zinc-500">
            Carregando verificação
            de segurança...
          </p>
        )}

      {/*
       * AVISO DE CONEXÃO
       */}
      {isOffline && (
        <p
          role="status"
          className="text-sm text-amber-700"
        >
          Você está sem conexão.
          A verificação será
          reiniciada quando
          a internet voltar.
        </p>
      )}

      {/*
       * ERRO DE VERIFICAÇÃO
       */}
      {error && (
        <div
          role="alert"
          className="space-y-3"
        >
          <p className="text-sm text-red-700">
            {error}
          </p>

          {/*
           * RECUPERAÇÃO MANUAL
           *
           * Só permite tentar
           * novamente quando
           * o navegador estiver
           * conectado.
           */}
          <button
            type="button"
            onClick={
              retryVerification
            }
            disabled={isOffline}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
