
import { config } from 'dotenv';

/*
 * CONFIGURAÇÃO GLOBAL DOS TESTES E2E
 *
 * Carrega exclusivamente as variáveis
 * do ambiente de testes.
 */
config({
  path: '.env.test',
  override: true,
});

/*
 * PROTEÇÃO DO BANCO DE DADOS
 *
 * Nunca executar testes E2E
 * no banco de desenvolvimento
 * ou de produção.
 */
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'SEGURANÇA: DATABASE_URL não configurada para os testes E2E.',
  );
}

const databaseName =
  new URL(databaseUrl).pathname.slice(1);

if (databaseName !== 'agendamento_test') {
  throw new Error(
    'SEGURANÇA: os testes E2E devem usar o banco agendamento_test.',
  );
}

/*
 * ETAPA 6.3 — COMPATIBILIDADE E2E
 *
 * Os testes antigos de agendamento
 * verificam regras de negócio,
 * conflitos, auditoria e notificações.
 *
 * Nesses testes, o Turnstile
 * permanece desativado.
 *
 * Os testes específicos de segurança,
 * em public-booking-turnstile.e2e-spec.ts,
 * ativam a proteção explicitamente
 * com vi.stubEnv('TURNSTILE_ENABLED', 'true').
 *
 * Essa configuração só é carregada
 * pelo Vitest E2E.
 *
 * Não altera o .env da aplicação
 * nem a proteção em produção.
 */
process.env.TURNSTILE_ENABLED = 'false';
