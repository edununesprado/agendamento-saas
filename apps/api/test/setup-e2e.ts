import { config } from 'dotenv';

config({
  path: '.env.test',
  override: true,
});

if (
  !process.env.DATABASE_URL?.includes(
    'agendamento_test',
  )
) {
  throw new Error(
    'SEGURANÇA: os testes E2E devem usar o banco agendamento_test',
  );
}