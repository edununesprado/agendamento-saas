# Agendamento SaaS

Sistema **SaaS multiempresa (multi-tenant)** para gerenciamento de agendamentos, desenvolvido como projeto de portfólio Full Stack com TypeScript.

A plataforma permite que diferentes empresas gerenciem, de forma isolada, seus usuários, funcionários, serviços, clientes, horários, bloqueios, agendamentos e configurações. Inclui painel administrativo, página pública de agendamento, controle de acesso por função, proteção contra conflitos de horários, notificações por e-mail, lembretes automáticos e uma **Central de Notificações**.

As notificações usam **Transactional Outbox** e uma fila persistida no PostgreSQL. O processamento é assíncrono e considera falhas de SMTP, deduplicação, tentativas controladas e resultados de entrega incertos.

## Estado do projeto

| Área | Situação |
| --- | --- |
| Autenticação, empresas e permissões | Implementada |
| Serviços, funcionários, clientes e agenda | Implementados |
| Disponibilidade e agendamento público | Implementados |
| Proteção contra concorrência e conflitos | Implementada |
| Transactional Outbox | Implementado e testado |
| Worker de notificações e tratamento de `UNCERTAIN` | Implementados e testados |
| Painel de Notificações no Next.js | Implementado e validado manualmente |
| Testes E2E | **227 aprovados em 37 arquivos** (25/10/2026) |
| Preparação para produção e deploy | Etapas futuras |

**Último marco documentado:** `22f0eee` — `feat(notifications): add admin notification dashboard`.

> O projeto está funcional em ambiente de desenvolvimento. Isso não equivale a uma homologação completa de produção.

---

## Tecnologias

### Frontend

- Next.js 16
- React
- TypeScript
- Tailwind CSS

### Backend

- NestJS 12
- TypeScript
- Prisma ORM 7
- JWT e bcrypt
- Luxon (datas e fusos horários)
- `@nestjs/throttler` (rate limit)
- `@nestjs/schedule` (tarefas agendadas)
- Nodemailer (SMTP)

### Dados, testes e infraestrutura

- PostgreSQL, transações ACID e Advisory Locks
- Vitest e Supertest: testes E2E, de concorrência, falhas e rollback
- Docker e Docker Compose
- Mailpit para testes locais de e-mail
- pnpm Workspaces

## Arquitetura

Estrutura monorepo:

```text
agendamento-saas/
├── apps/
│   ├── api/                 # API NestJS, Prisma e testes
│   └── web/                 # Interface Next.js
├── packages/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

O backend concentra as regras de negócio, autorização, isolamento entre empresas, persistência, transações e proteção contra concorrência.

Os dados de cada empresa são associados a um `tenantId`. Nas rotas administrativas, a API identifica a empresa pelo usuário autenticado, **não por um `tenantId` arbitrário enviado pelo navegador**.

### Fluxo principal de um agendamento

```text
Empresa e usuários
      |
Serviços + funcionários + horários
      |
Clientes + disponibilidade
      |
Agenda interna ou página pública
      |
Agendamento (PENDING ou CONFIRMED)
      |
Transação PostgreSQL (Transactional Outbox)
      |
NotificationDelivery persistida
      |
Worker de notificações
      |
SMTP / Mailpit em desenvolvimento
      |
Painel de Notificações (status e histórico)
```

---

## Autenticação e controle de acesso

- Cadastro de usuário e empresa, com associação inicial do `OWNER`.
- Login com JWT; informações do usuário e da empresa autenticados.
- Proteção de rotas e autorização baseada em funções (RBAC).
- Separação de dados entre empresas.

| Função | Acesso principal |
| --- | --- |
| `OWNER` | Administração da empresa, usuários, permissões, funcionários, serviços, clientes, agenda, configurações e notificações |
| `ADMIN` | Operação administrativa, configurações, consulta de usuários e notificações |
| `RECEPTIONIST` | Atendimento, clientes, agenda e operações de agendamento permitidas |
| `STAFF` | Acesso restrito à própria agenda e aos próprios atendimentos |

O backend é a autoridade para verificar permissões. Esconder um item no menu do frontend **não substitui** a proteção da API.

### Isolamento multi-tenant

Cada empresa possui seus próprios:

- Usuários e vínculos de acesso.
- Funcionários, serviços e clientes.
- Horários de trabalho e bloqueios.
- Agendamentos e configurações.
- Regras do agendamento público.
- Notificações e histórico de entregas.

O isolamento é verificado também nos testes E2E, incluindo consultas a notificações com tentativas de informar o `tenantId` de outra empresa.

---

## Funcionalidades de gestão

### Serviços

- Criar, consultar, listar, editar e desativar serviços.
- Restaurar serviços desativados.
- Armazenar nome, descrição, duração, preço e status.

### Funcionários

- Cadastrar, editar, desativar e restaurar funcionários.
- Vincular serviços aos funcionários.
- Configurar horários de trabalho e bloqueios.
- Associar um usuário `STAFF` ao funcionário correspondente.

### Clientes

- Cadastrar, editar, pesquisar, ativar e desativar clientes.
- Registrar nome e informações de contato, data de nascimento e observações.
- Associar clientes criados pelo agendamento público à empresa correta.
- Normalizar telefones para reduzir duplicidades de cadastro.

Exemplos de formatos normalizados para a mesma identificação telefônica:

```text
(34) 99999-3333
34 99999-3333
+55 34 99999-3333
5534999993333
```

### Disponibilidade

A API calcula horários disponíveis considerando:

- Jornada e horários do funcionário.
- Duração e vínculo do serviço.
- Bloqueios de horário.
- Agendamentos existentes e seus status.
- Fuso horário configurado pela empresa.

O fuso utilizado como padrão é `America/Sao_Paulo`.

### Agendamentos

Status implementados:

```text
PENDING
CONFIRMED
COMPLETED
CANCELED
NO_SHOW
```

Operações disponíveis:

- Criar e consultar agendamentos.
- Listar por data ou período e filtrar por funcionário ou status.
- Confirmar, reagendar, cancelar, concluir e registrar ausência.
- Validar transições de status no backend.

Agendamentos internos são criados como `CONFIRMED`; solicitações públicas iniciam como `PENDING`, aguardando confirmação da empresa. Agendamentos cancelados não voltam a estados ativos por meio do fluxo normal.

### Proteção contra conflitos

A API utiliza transações e **PostgreSQL Advisory Locks** para reduzir conflitos em operações simultâneas, incluindo criação e reagendamento. Também existe proteção para agendamentos públicos concorrentes do mesmo cliente em horários sobrepostos.

Agendamentos não cancelados ocupam o intervalo correspondente. Após um cancelamento validado, o horário pode voltar a aparecer entre os disponíveis.

---

## Agendamento público

Cada empresa possui uma página pública:

```text
http://localhost:3000/agendar/{slug-da-empresa}
```

Exemplo local:

```text
http://localhost:3000/agendar/barbearia-alpha
```

O cliente não precisa fazer login. O fluxo permite selecionar serviço, profissional, data e horário, informar os dados pessoais e enviar a solicitação.

### Regras por empresa

A empresa pode configurar:

- Antecedência mínima para agendar: de **0 a 1.440 minutos** (padrão: **60**).
- Quantidade máxima de dias à frente: de **1 a 365 dias** (padrão: **7**).

Essas regras ajudam o frontend a apresentar as opções disponíveis e são **validadas novamente no backend**.

Na solicitação pública, cliente, agendamento `PENDING` e notificação `APPOINTMENT_REQUESTED` são persistidos na mesma transação PostgreSQL. Se uma gravação obrigatória falhar, ocorre rollback.

---

## Configurações da empresa

No painel administrativo é possível configurar:

- Nome, telefone, e-mail, logo e cor principal.
- Fuso horário.
- Antecedência mínima e limite de dias do agendamento público.
- Ativação e antecedência dos lembretes automáticos.
- Acesso e cópia do link público da empresa.

As configurações são armazenadas separadamente para cada empresa.

---

## Notificações por e-mail

A aplicação usa Nodemailer, SMTP, PostgreSQL, uma fila persistente e um worker assíncrono.

| Evento | Tipo |
| --- | --- |
| Solicitação recebida pelo agendamento público | `APPOINTMENT_REQUESTED` |
| Confirmação de agendamento | `APPOINTMENT_CONFIRMED` |
| Cancelamento, com motivo quando informado | `APPOINTMENT_CANCELED` |
| Mudança efetiva de data ou horário | `APPOINTMENT_RESCHEDULED` |
| Lembrete automático de agendamento | `APPOINTMENT_REMINDER` |

O reagendamento inclui informações do horário anterior e do novo horário. Informar novamente o mesmo horário não deve criar notificação redundante.

### Fila persistente: `NotificationDelivery`

Cada entrega registra, entre outras informações:

- Empresa, agendamento relacionado e canal.
- Tipo, destinatário, assunto e conteúdo.
- Chave de deduplicação (`dedupeKey`).
- Status, número de tentativas e limite (`attempts`, `maxAttempts`).
- Próxima tentativa e início do processamento.
- Datas de envio e falha, último erro e identificador do provedor, quando disponível.

#### Estados da fila

```text
PENDING      Aguardando processamento ou nova tentativa permitida
PROCESSING   Reservada para processamento
SENT         Envio confirmado pelo SMTP
FAILED       Falha definitiva
CANCELED     Entrega que não deve mais ser enviada
UNCERTAIN    Resultado SMTP desconhecido; requer análise manual
```

Fluxos principais:

```text
PENDING -> PROCESSING -> SENT
                      -> FAILED
                      -> PENDING  (falha recuperável, quando seguro)
                      -> CANCELED (entrega inválida)
                      -> UNCERTAIN (resultado desconhecido)
```

### Worker e tratamento de falhas

O worker:

1. Localiza notificações pendentes e elegíveis.
2. Reserva o processamento com controles transacionais e de concorrência.
3. Revalida lembretes para evitar mensagens de agendamentos cancelados ou desatualizados.
4. Envia pelo SMTP fora da transação de negócio.
5. Registra confirmação, falha ou resultado incerto.
6. Agenda novas tentativas somente quando o resultado da tentativa permite fazê-lo com segurança.

A política de intervalos progressivos para tentativas recuperáveis utiliza:

```text
1, 5, 15, 60 e 180 minutos
```

#### Status `UNCERTAIN` — proteção contra duplicidade

Uma falha de comunicação durante a etapa SMTP `DATA` pode deixar desconhecido se o servidor recebeu a mensagem. Nessa situação, o serviço sinaliza `SmtpDeliveryUncertainError` e a entrega fica como `UNCERTAIN`.

O worker também marca como `UNCERTAIN` notificações que permaneceram em `PROCESSING` por tempo excessivo (limite de recuperação implementado: **10 minutos**), porque o resultado da operação anterior pode ser desconhecido.

**Entregas `UNCERTAIN` não são reenviadas automaticamente.** O sistema também impede que respostas atrasadas do SMTP sobrescrevam esse status ou marquem indevidamente o lembrete como enviado.

Esse comportamento reduz o risco de envio duplicado. A arquitetura **não promete entrega exatamente uma vez** pelo SMTP. Casos incertos exigem investigação antes de qualquer decisão operacional.

#### Deduplicação

Cada evento pode possuir uma chave única `dedupeKey`, usada para evitar a persistência duplicada do mesmo evento. Exemplos conceituais:

```text
appointment:{id}:requested
appointment:{id}:confirmed
appointment:{id}:canceled
appointment:{id}:rescheduled:{startsAtISO}
appointment:{id}:reminder:{startsAtISO}
```

Deduplicar eventos no PostgreSQL não significa, por si só, garantir um único recebimento de e-mail em todas as condições de falha de rede.

---

## Transactional Outbox

O padrão **Transactional Outbox** torna atômica a gravação de dados do agendamento e das notificações relacionadas.

```text
Requisição
   |
Transação PostgreSQL
   |
Criar ou alterar Appointment
   |
Criar NotificationDelivery
   |
Commit
   |
Worker processa a entrega
   |
SMTP
   |
Atualização do status da notificação
```

Se uma etapa obrigatória da transação falhar, as demais gravações transacionais são revertidas. O envio SMTP ocorre **depois do commit**, não dentro da transação de agendamento.

### Fluxos protegidos

- Agendamento público: cliente, solicitação e notificação.
- Criação interna: agendamento confirmado e notificação.
- Confirmação: alteração de status e notificação.
- Cancelamento: alteração, dados de cancelamento e notificação.
- Reagendamento: novo horário e notificação; atualização de `reminderSentAt` quando aplicável.
- Preparação de lembretes: revalidação, lock e criação da entrega.

A suíte E2E inclui cenários de rollback com falhas simuladas nesses fluxos.

---

## Lembretes automáticos

O scheduler do NestJS (`@nestjs/schedule`) identifica agendamentos elegíveis, respeitando a configuração individual de cada empresa.

Antecedência padrão: **24 horas**. Existem cenários de teste para 1, 24 e 48 horas.

Condições importantes:

- Agendamento confirmado.
- Cliente com e-mail.
- Janela de lembrete válida.
- Lembretes habilitados para a empresa.
- Ausência de registro de envio confirmado do lembrete correspondente.

O campo `reminderSentAt` é preenchido **apenas quando o envio SMTP é confirmado**, não quando o lembrete é colocado na fila. Em um reagendamento efetivo, o marcador é reinicializado para permitir a preparação de um lembrete para o novo horário.

Lembretes desatualizados ou de agendamentos cancelados passam por revalidação antes do envio. Um e-mail já enviado antes do cancelamento não pode ser desfeito.

---

## Central de Notificações (painel administrativo)

**Implementada** no frontend Next.js:

```text
http://localhost:3000/notificacoes
```

Arquivos principais:

```text
apps/api/src/notifications/notifications.controller.ts
apps/api/src/notifications/notifications.module.ts
apps/api/test/notifications-list.e2e-spec.ts
apps/api/test/notifications-summary.e2e-spec.ts
apps/web/app/notificacoes/page.tsx
apps/web/components/panel-shell.tsx
```

### Funcionalidades

- Indicadores: total, pendentes, processando, enviadas, falhas, canceladas e incertas.
- Histórico com destinatário, assunto, tipo, status, tentativas e datas.
- Visualização do último erro e dos detalhes da entrega.
- Filtros por status, tipo e período (`startDate` e `endDate`).
- Paginação de resultados e botão de atualização manual.
- Destaque informativo para o estado `UNCERTAIN`.
- Disponível no menu para `OWNER` e `ADMIN`.

**A interface é somente de leitura.** Não existe botão de reenvio nesta versão; especialmente, notificações `UNCERTAIN` não devem ser reenviadas automaticamente.

Os indicadores representam **todo o histórico da empresa**. Os filtros aplicam-se à listagem, não aos indicadores.

### Endpoints

```http
GET /notifications/summary
GET /notifications?page=1&limit=20
GET /notifications?status=UNCERTAIN
GET /notifications?type=APPOINTMENT_REMINDER
GET /notifications?startDate=2026-10-01&endDate=2026-10-31
GET /notifications?status=FAILED&type=APPOINTMENT_CANCELED&page=1&limit=20
```

Regras:

- JWT obrigatório.
- Apenas `OWNER` ou `ADMIN`.
- `tenantId` obtido do usuário autenticado.
- `page` começa em 1; `limit` tem padrão 20 e máximo 100.
- Datas no formato `YYYY-MM-DD`, interpretadas no fuso `America/Sao_Paulo`.
- Data final inclusiva: todos os registros do dia indicado são considerados.
- Filtros inválidos retornam HTTP `400`.
- As consultas não enviam e-mails nem modificam o status das entregas.

Resposta ilustrativa de `GET /notifications/summary`:

```json
{
  "total": 4,
  "pending": 0,
  "processing": 0,
  "sent": 4,
  "failed": 0,
  "canceled": 0,
  "uncertain": 0
}
```

O fluxo foi validado manualmente com uma empresa de desenvolvimento: solicitação pública, confirmação, lembrete, cancelamento, recebimento no Mailpit, atualização do painel e liberação do horário cancelado.

---

## SMTP e Mailpit

Configure o SMTP por variáveis de ambiente. Exemplo **somente para desenvolvimento local**:

```env
SMTP_ENABLED=true
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=mailpit
SMTP_PASS=mailpit
SMTP_FROM_NAME=Agendamento SaaS
SMTP_FROM_EMAIL=nao-responda@agendamento.local
APPOINTMENT_REMINDERS_ENABLED=true
```

Para desativar o envio SMTP ou os lembretes automáticos, utilize `SMTP_ENABLED=false` ou `APPOINTMENT_REMINDERS_ENABLED=false`, respectivamente.

### Mailpit

O Docker Compose inclui o Mailpit para capturar e-mails de desenvolvimento sem enviá-los a destinatários externos.

| Serviço | Endereço local |
| --- | --- |
| SMTP | `127.0.0.1:1025` |
| Interface web | http://localhost:8025 |

Inicialização a partir da raiz do repositório:

```bash
docker compose up -d
```

Quando a API roda diretamente no Windows e o SMTP do Docker está publicado no host, `127.0.0.1:1025` funciona como configuração local. **Se a API passar a rodar dentro de um contêiner, o hostname SMTP poderá precisar ser alterado** conforme a rede Docker.

Não utilize credenciais, endereços ou servidores SMTP de desenvolvimento em produção.

---

## Rate limit e segurança

Os endpoints públicos possuem proteção por IP com `@nestjs/throttler`. Configuração documentada:

- Rotas públicas: **120 requisições por minuto** por IP.
- Criação de agendamento público: **20 requisições por minuto** por IP.
- Ao exceder o limite: HTTP `429`.

Proteções implementadas e validadas em diferentes fluxos:

- JWT, bcrypt e RBAC.
- Isolamento multi-tenant e validação global dos DTOs com whitelist.
- Validação das regras de agendamento no backend.
- Controle de concorrência com transações e Advisory Locks.
- Rate limit e proteção contra cadastros/agendamentos duplicados.
- Transactional Outbox, fila persistente e deduplicação.
- Tratamento do estado de entrega `UNCERTAIN`.
- Banco separado e proteções para os testes E2E.

O projeto ainda requer uma **revisão específica de segurança e operação antes de produção**, incluindo gerenciamento de segredos, políticas de acesso, observabilidade, retenção de dados e implantação segura.

---

## Principais endpoints da API

> Lista resumida dos grupos documentados; não substitui uma especificação OpenAPI completa.

### Autenticação e empresa

```http
POST /auth/register
POST /auth/login
GET  /auth/me

GET   /tenants/current
PATCH /tenants/current
```

### Serviços

```http
GET    /services
POST   /services
GET    /services/:id
PATCH  /services/:id
DELETE /services/:id
PATCH  /services/:id/restore
```

### Funcionários

```http
GET   /employees
POST  /employees
PATCH /employees/:id

GET /employees/:id/services
PUT /employees/:id/services

GET /employees/:id/availability
PUT /employees/:id/availability

GET  /employees/:id/blocked-times
POST /employees/:id/blocked-times
```

### Clientes e disponibilidade

```http
GET   /clients
POST  /clients
GET   /clients/:id
PATCH /clients/:id

GET /availability?employeeId=...&serviceId=...&date=2026-10-20
```

### Agendamentos

```http
GET   /appointments
POST  /appointments
GET   /appointments/:id
PATCH /appointments/:id/status
PATCH /appointments/:id/cancel
PATCH /appointments/:id/reschedule
```

O endpoint de alteração de status aceita transições permitidas pelas regras de negócio, como `CONFIRMED`, `COMPLETED` e `NO_SHOW`.

### Agendamento público

```http
GET  /public/tenants/:slug
GET  /public/tenants/:slug/services
GET  /public/tenants/:slug/employees
GET  /public/tenants/:slug/availability
POST /public/tenants/:slug/appointments
```

### Painel de Notificações

```http
GET /notifications
GET /notifications/summary
```

---

## Executando o projeto localmente

### Requisitos

- Node.js (ambiente de desenvolvimento utilizado: Node.js 24).
- pnpm (ambiente utilizado: pnpm 10).
- Docker e Docker Compose.
- PostgreSQL disponível pelo Docker Compose.

### 1. Clonar e instalar

```bash
git clone https://github.com/edununesprado/agendamento-saas.git
cd agendamento-saas
pnpm install
```

### 2. Iniciar PostgreSQL e Mailpit

Na raiz do projeto:

```bash
docker compose up -d
docker compose ps
```

### 3. Configurar a API

Crie `apps/api/.env` com valores adequados ao ambiente local. Exemplo **ilustrativo**, a adaptar conforme as variáveis exigidas pela implementação:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agendamento"
JWT_ACCESS_SECRET="substitua-por-uma-chave-secreta-forte"
JWT_ACCESS_EXPIRES_IN="24h"

SMTP_ENABLED=true
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=mailpit
SMTP_PASS=mailpit
SMTP_FROM_NAME=Agendamento SaaS
SMTP_FROM_EMAIL=nao-responda@agendamento.local

APPOINTMENT_REMINDERS_ENABLED=true
```

**Não copie credenciais de exemplo para produção e não publique `.env` com segredos.**

### 4. Aplicar migrações e gerar Prisma Client

Dentro de `apps/api`:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

A migração que introduziu `NotificationStatus.UNCERTAIN` faz parte do histórico do Prisma e deve ser aplicada em novos ambientes antes de executar os módulos de notificações.

### 5. Iniciar backend

Ainda em `apps/api`:

```bash
pnpm start:dev
```

API local: http://localhost:3333

Verificação de saúde:

```bash
curl -i http://localhost:3333/health/database
```

### 6. Configurar e iniciar frontend

Em `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3333
```

Dentro de `apps/web`:

```bash
pnpm dev
```

Frontend local: http://localhost:3000

Rotas úteis:

```text
/login
/dashboard
/agenda
/notificacoes
/agendar/{slug-da-empresa}
```

---

## Testes automatizados

### Banco exclusivo de testes

Os testes E2E usam o banco PostgreSQL separado:

```text
agendamento_test
```

Configuração em `apps/api/.env.test`. Exemplo ilustrativo:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agendamento_test"
JWT_ACCESS_SECRET="test-e2e-secret-key"
JWT_ACCESS_EXPIRES_IN="15m"
NODE_ENV="test"
APPOINTMENT_REMINDERS_ENABLED=false
```

**Atenção: os testes E2E podem excluir registros e empresas. Nunca utilize `agendamento` ou um banco de produção para executá-los.** O projeto implementa verificações de segurança para impedir a execução de suítes destrutivas fora de `agendamento_test`.

### Migrações do banco de testes

Antes de executar migrações, confira cuidadosamente a URL de conexão. Exemplo em PowerShell, dentro de `apps/api`:

```powershell
$env:DATABASE_URL = ((Get-Content .env.test | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', '').Trim('"').Trim("'")

node -e "console.log(new URL(process.env.DATABASE_URL).pathname)"
# Deve mostrar: /agendamento_test

pnpm exec prisma migrate deploy
Remove-Item Env:DATABASE_URL
```

### Executar a suíte E2E

Dentro de `apps/api`:

```bash
pnpm vitest run --config ./vitest.config.e2e.ts
```

Para executar somente os testes da Central de Notificações:

```bash
pnpm vitest run --config ./vitest.config.e2e.ts test/notifications-list.e2e-spec.ts
pnpm vitest run --config ./vitest.config.e2e.ts test/notifications-summary.e2e-spec.ts
```

### Último resultado validado — 25/10/2026

```text
Test Files  37 passed (37)
Tests       227 passed (227)
```

Inclui:

- Autenticação, permissões e isolamento multi-tenant.
- Clientes, serviços, funcionários, agenda e regras públicas.
- Rate limit, concorrência e conflito de horários.
- Transações, Transactional Outbox e rollback de todos os principais fluxos.
- Fila persistente, worker SMTP, lembretes e tratamento de entregas incertas.
- **26 testes E2E da listagem de notificações.**
- **9 testes E2E dos indicadores de notificações.**

Na execução completa, algumas mensagens `ERROR` são provenientes de **falhas simuladas intencionalmente pelos testes**. Também foram observados avisos de depreciação do driver PostgreSQL, que merecem investigação futura, mas não impediram a aprovação da suíte.

---

## Build

Backend (`apps/api`):

```bash
pnpm build
```

Frontend (`apps/web`):

```bash
pnpm build
```

Os builds da API e do frontend foram validados após a criação do Painel de Notificações.

---

## Histórico das etapas

| Etapa | Resultado |
| --- | --- |
| Transactional Outbox | Concluída: gravações atômicas e rollback E2E |
| Hardening do worker | Concluída: recuperação de processamento, falhas SMTP e `UNCERTAIN` |
| Migração PostgreSQL para `UNCERTAIN` | Aplicada e verificada no desenvolvimento |
| Painel de Notificações | Concluído: API, testes E2E e interface Next.js |
| Teste manual integrado | Concluído: agendamento público, confirmação, e-mails, cancelamento e liberação do horário |

O Painel de Notificações foi registrado no commit `22f0eee`. O sistema continua em desenvolvimento e evoluirá de forma incremental.

## Melhorias futuras a avaliar

Estas são **oportunidades de evolução**, não funcionalidades já entregues:

1. **Segurança e preparação para produção:** revisão de secrets, autenticação, autorização, proteção de dados e requisitos operacionais.
2. **Operação e observabilidade:** métricas, logs estruturados, alertas para falhas SMTP e entregas `UNCERTAIN`.
3. **Experiência do painel:** acessibilidade, responsividade, estados de carregamento, mensagens e testes de interface.
4. **Notificações:** políticas de retenção, auditoria e processo operacional seguro para investigação de entregas incertas. Qualquer reprocessamento manual deve respeitar o risco de duplicidade.
5. **Confiabilidade:** investigar avisos de depreciação do PostgreSQL, revisar concorrência e ampliar testes conforme novas funcionalidades.
6. **Produto SaaS:** avaliar planos, assinatura/cobrança, onboarding, personalização e relatórios conforme as necessidades do produto.
7. **Infraestrutura:** pipeline de integração contínua, backups com restauração testada, deploy, HTTPS e configuração de SMTP de produção.

A ordem dessas melhorias será definida após uma revisão técnica específica. **Não é recomendável tratar o deploy como próximo passo automático sem essa avaliação.**

---

## Objetivo do projeto

Demonstrar e aprimorar conhecimentos em:

- Arquitetura SaaS e multi-tenancy.
- APIs REST e autorização por funções.
- Integridade, concorrência e transações PostgreSQL.
- Processamento assíncrono, filas persistentes e idempotência.
- Transactional Outbox e tratamento de falhas.
- Testes automatizados e proteção contra regressões.
- Desenvolvimento Full Stack com TypeScript, NestJS e Next.js.
- Experiência de uso do painel administrativo e do agendamento público.

## Autor

**Eduardo Nunes Prado**

GitHub: https://github.com/edununesprado
