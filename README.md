# Agendamento SaaS

Sistema SaaS multiempresa para gerenciamento de agendamentos, desenvolvido como projeto de portfólio Full Stack.

A aplicação permite que diferentes empresas utilizem a mesma plataforma de forma isolada, cada uma com seus próprios usuários, funcionários, serviços, clientes, horários, bloqueios, agendamentos e configurações.

O projeto possui painel administrativo, controle de acesso por função, página pública de agendamento, proteção contra conflitos de horários, notificações por e-mail, lembretes automáticos e processamento assíncrono de notificações com persistência em PostgreSQL.

A arquitetura de notificações utiliza **Transactional Outbox**, garantindo que as alterações dos agendamentos e a criação das respectivas notificações sejam realizadas dentro da mesma transação de banco de dados.

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
- JWT
- bcrypt
- Luxon
- NestJS Throttler
- NestJS Schedule
- Nodemailer

### Banco de dados

- PostgreSQL
- Transações ACID
- PostgreSQL Advisory Locks

### Testes

- Vitest
- Supertest
- Testes E2E
- Testes de concorrência
- Testes de rollback transacional
- Testes da fila de notificações

### Infraestrutura

- Docker
- Docker Compose
- Mailpit
- pnpm Workspaces

---

## Arquitetura

O projeto utiliza uma estrutura monorepo:

```text
agendamento-saas/
├── apps/
│   ├── api/                 # API NestJS
│   └── web/                 # Frontend Next.js
├── packages/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

A aplicação segue uma arquitetura multi-tenant, onde os registros são associados a uma empresa (`tenant`) e as operações da API respeitam esse isolamento.

O backend concentra as regras de negócio, validações, autorização, controle de concorrência e persistência.

As notificações são processadas de forma assíncrona por um worker, utilizando o PostgreSQL como armazenamento persistente da fila.

---

## Funcionalidades implementadas

### Autenticação

- Cadastro de usuário e empresa
- Login com JWT
- Identificação do usuário autenticado
- Associação automática do usuário OWNER à empresa
- Isolamento entre empresas
- Proteção de rotas autenticadas

---

## Multi-tenant

Cada empresa possui seus próprios:

- usuários
- funcionários
- serviços
- clientes
- horários de trabalho
- bloqueios
- agendamentos
- configurações
- regras de agendamento público
- notificações

Os dados de uma empresa não podem ser acessados por outra.

O `tenantId` do usuário autenticado é utilizado no backend para limitar o acesso aos recursos pertencentes à empresa correta.

O isolamento também é considerado na criação e no processamento das notificações.

---

## Controle de acesso

O sistema possui quatro funções:

```text
OWNER
ADMIN
RECEPTIONIST
STAFF
```

### OWNER

Possui acesso completo à empresa.

Pode:

- gerenciar usuários
- alterar funções
- vincular usuários a funcionários
- gerenciar funcionários
- gerenciar serviços
- gerenciar clientes
- gerenciar agenda
- alterar configurações da empresa

### ADMIN

Pode administrar a maior parte da operação da empresa.

Pode:

- consultar usuários
- gerenciar funcionários
- gerenciar serviços
- gerenciar clientes
- gerenciar horários
- gerenciar agenda
- alterar configurações da empresa

### RECEPTIONIST

Pode:

- consultar agenda
- criar agendamentos
- reagendar
- confirmar
- concluir
- registrar ausência
- cancelar
- gerenciar clientes
- consultar funcionários
- consultar serviços

### STAFF

Possui acesso restrito à própria agenda.

Pode consultar apenas os próprios atendimentos e não possui acesso às configurações administrativas da empresa.

---

## Serviços

O sistema permite:

- criar serviços
- listar serviços
- consultar serviço
- editar serviços
- desativar serviços
- restaurar serviços

Cada serviço possui informações como:

```text
nome
descrição
duração
preço
status
```

---

## Funcionários

É possível:

- cadastrar funcionários
- editar funcionários
- desativar funcionários
- restaurar funcionários
- vincular serviços aos funcionários
- configurar horários de trabalho
- cadastrar bloqueios de horário
- vincular funcionário a um usuário STAFF

---

## Disponibilidade

O sistema calcula automaticamente os horários disponíveis considerando:

- horário de trabalho do funcionário
- duração do serviço
- serviços realizados pelo funcionário
- horários bloqueados
- agendamentos existentes
- status dos agendamentos
- timezone da empresa

Os horários são calculados utilizando o timezone configurado pela empresa.

Por padrão:

```text
America/Sao_Paulo
```

---

## Clientes

O sistema permite:

- cadastrar clientes
- editar clientes
- pesquisar clientes
- ativar clientes
- desativar clientes
- armazenar telefone
- armazenar e-mail
- armazenar data de nascimento
- armazenar observações

Clientes criados pela página pública também ficam associados somente à empresa responsável pelo agendamento.

O telefone informado no agendamento público é normalizado antes da busca e do armazenamento, evitando duplicidades causadas por diferentes formatos.

Exemplos tratados como o mesmo telefone:

```text
(34) 99999-3333
34 99999-3333
+55 34 99999-3333
5534999993333
```

---

## Agendamentos

O sistema possui suporte aos seguintes status:

```text
PENDING
CONFIRMED
COMPLETED
CANCELED
NO_SHOW
```

No painel administrativo é possível:

- criar agendamento
- listar agenda por data
- consultar períodos
- filtrar por funcionário
- filtrar por status
- confirmar agendamento
- concluir atendimento
- registrar ausência
- cancelar
- reagendar

Agendamentos criados internamente começam como:

```text
CONFIRMED
```

Agendamentos feitos pela página pública começam como:

```text
PENDING
```

As transições de status são controladas pelo backend.

Exemplo:

```text
PENDING
   |
   v
CONFIRMED
   |
   v
COMPLETED
```

Também é possível transformar um agendamento confirmado em:

```text
NO_SHOW
```

Agendamentos cancelados não voltam para estados ativos.

As operações que geram notificações utilizam transações PostgreSQL para manter a consistência entre os dados do agendamento e a fila de notificações.

---

## Proteção contra conflito de horários

A API utiliza transações e PostgreSQL Advisory Locks para evitar que duas requisições simultâneas criem agendamentos conflitantes.

A proteção é utilizada principalmente em operações como:

- criação de agendamento
- agendamento público
- reagendamento
- prevenção de duplicidade de cliente
- processamento de lembretes

Agendamentos com status diferente de:

```text
CANCELED
```

bloqueiam o intervalo de horário correspondente.

Também existe proteção contra agendamentos públicos simultâneos do mesmo cliente para horários sobrepostos.

---

## Agendamento público

Cada empresa possui uma página pública própria:

```text
http://localhost:3000/agendar/{slug-da-empresa}
```

Exemplo:

```text
http://localhost:3000/agendar/barbearia-alpha
```

O cliente não precisa criar conta nem fazer login.

O fluxo público permite:

1. escolher o serviço
2. escolher o profissional
3. escolher a data
4. escolher um horário disponível
5. informar os dados pessoais
6. enviar a solicitação de agendamento

Após o envio, o agendamento fica com status:

```text
PENDING
```

aguardando confirmação da empresa.

A criação do cliente, quando necessária, o agendamento e a notificação de solicitação são realizados na mesma transação PostgreSQL.

Caso a criação obrigatória da notificação falhe, a transação é revertida, evitando que o agendamento seja persistido sem o respectivo registro de notificação.

---

## Regras configuráveis de agendamento público

Cada empresa pode definir suas próprias regras para o agendamento público.

Atualmente é possível configurar:

```text
Antecedência mínima para agendar
Limite máximo de dias à frente
```

Exemplo:

```text
Antecedência mínima: 120 minutos
Agenda disponível: até 14 dias à frente
```

Os valores são armazenados separadamente para cada empresa.

Valores padrão:

```text
bookingMinAdvanceMinutes = 60
bookingMaxAdvanceDays = 7
```

Limites permitidos:

```text
Antecedência mínima:
0 até 1440 minutos

Dias disponíveis:
1 até 365 dias
```

As regras são utilizadas pelo frontend para melhorar a experiência do usuário e são obrigatoriamente validadas novamente pelo backend.

O backend permanece como fonte definitiva de validação.

---

## Configurações da empresa

No painel é possível configurar:

- nome da empresa
- telefone
- e-mail
- logo
- cor principal
- timezone
- antecedência mínima do agendamento público
- quantidade máxima de dias disponíveis para agendamento
- ativação dos lembretes automáticos
- antecedência dos lembretes

Também é possível copiar ou abrir diretamente o link público da empresa.

As configurações de lembretes são armazenadas individualmente para cada empresa.

---

## Notificações por e-mail

O sistema utiliza:

- Nodemailer
- SMTP
- PostgreSQL
- Fila persistente de notificações
- Worker para processamento assíncrono
- Transactional Outbox

Atualmente existem notificações para os seguintes eventos:

### Solicitação de agendamento público

Quando o cliente realiza um agendamento pela página pública, recebe uma notificação informando que a solicitação foi recebida.

Tipo:

```text
APPOINTMENT_REQUESTED
```

### Confirmação

Quando um agendamento é confirmado, o cliente recebe uma notificação de confirmação.

Tipo:

```text
APPOINTMENT_CONFIRMED
```

### Cancelamento

Quando um agendamento é cancelado, o cliente recebe uma notificação contendo também o motivo do cancelamento, quando informado.

Tipo:

```text
APPOINTMENT_CANCELED
```

### Reagendamento

Quando a data ou o horário realmente é alterado, o cliente recebe uma notificação contendo:

- data anterior
- horário anterior
- nova data
- novo horário

Tipo:

```text
APPOINTMENT_RESCHEDULED
```

Caso o mesmo horário seja informado novamente, nenhuma notificação redundante de reagendamento é criada.

### Lembrete automático

Quando um agendamento confirmado entra na janela configurada de lembrete, uma notificação é preparada para envio.

Tipo:

```text
APPOINTMENT_REMINDER
```

O envio efetivo é responsabilidade do worker.

---

## Fila persistente de notificações

O sistema possui uma fila persistente no PostgreSQL por meio do modelo:

```text
NotificationDelivery
```

Cada registro contém informações necessárias para acompanhar o processamento da notificação, incluindo:

- empresa
- agendamento relacionado
- canal
- tipo
- destinatário
- assunto
- conteúdo
- chave de deduplicação
- status
- quantidade de tentativas
- limite de tentativas
- data da próxima tentativa
- início do processamento
- data de envio
- data de falha
- último erro
- identificador retornado pelo provedor

### Estados da fila

Os estados existentes são:

```text
PENDING
PROCESSING
SENT
FAILED
CANCELED
```

Fluxo principal:

```text
PENDING
   |
   v
PROCESSING
   |
   +---- sucesso SMTP ----> SENT
   |
   +---- falha recuperável ----> PENDING
   |
   +---- limite de tentativas -> FAILED
```

O estado `CANCELED` também está disponível para notificações que não devem mais ser enviadas.

### Responsabilidade do worker

O worker é responsável por:

1. identificar notificações pendentes e elegíveis;
2. reservar a notificação para processamento;
3. executar o envio através do serviço SMTP;
4. registrar o resultado;
5. programar novas tentativas quando necessário;
6. marcar falhas definitivas quando o limite de tentativas for atingido.

O envio SMTP é realizado fora das transações responsáveis pela criação ou alteração dos agendamentos.

Isso evita manter uma transação de banco aberta durante uma operação de rede.

### Tentativas automáticas

O sistema possui política de novas tentativas com intervalos progressivos.

Intervalos utilizados:

```text
1 minuto
5 minutos
15 minutos
60 minutos
180 minutos
```

O modelo registra `attempts`, `maxAttempts` e `nextAttemptAt`.

O worker utiliza essas informações para controlar quando uma notificação deve voltar a ser processada.

### Deduplicação

Cada notificação possui uma chave única:

```text
dedupeKey
```

Essa chave ajuda a impedir a criação duplicada do mesmo evento de notificação.

Exemplos conceituais:

```text
appointment:{id}:requested

appointment:{id}:confirmed

appointment:{id}:canceled

appointment:{id}:rescheduled:{startsAtISO}

appointment:{id}:reminder:{startsAtISO}
```

A deduplicação ocorre na persistência dos eventos.

É importante observar que a deduplicação no banco não garante, isoladamente, entrega exatamente uma vez pelo SMTP. Em cenários de falha após o aceite do provedor, uma tentativa posterior pode provocar uma entrega duplicada.

---

## Transactional Outbox

A aplicação implementa o padrão **Transactional Outbox** para tornar atômica a persistência dos agendamentos e das notificações relacionadas.

O objetivo é evitar a seguinte situação:

```text
Agendamento salvo no banco
           |
           v
Falha antes de criar a notificação
           |
           v
Agendamento sem registro de envio
```

Com o Transactional Outbox, as alterações do agendamento e a criação do registro `NotificationDelivery` fazem parte da mesma transação PostgreSQL.

### Fluxo transacional

```text
Requisição
    |
    v
Início da transação PostgreSQL
    |
    v
Criar ou alterar Appointment
    |
    v
Criar NotificationDelivery
    |
    v
Commit da transação
    |
    v
Worker encontra a notificação
    |
    v
Envio SMTP
    |
    v
Atualização do status da entrega
```

Se uma operação obrigatória de persistência falhar antes do commit, a transação é revertida.

Dessa forma, evita-se que apenas parte das alterações transacionais seja gravada.

### Fluxos protegidos

A implementação contempla:

**1. Agendamento público**

- criação ou associação do cliente;
- criação do agendamento PENDING;
- criação de APPOINTMENT_REQUESTED.

**2. Criação interna**

- criação do agendamento CONFIRMED;
- criação de APPOINTMENT_CONFIRMED.

**3. Confirmação**

- alteração para CONFIRMED;
- criação de APPOINTMENT_CONFIRMED.

**4. Cancelamento**

- alteração para CANCELED;
- atualização dos dados de cancelamento;
- criação de APPOINTMENT_CANCELED.

**5. Reagendamento**

- alteração de `startsAt`;
- alteração de `endsAt`;
- reinicialização de `reminderSentAt` quando o horário muda;
- criação de APPOINTMENT_RESCHEDULED.

**6. Lembretes automáticos**

- obtenção de lock;
- revalidação das condições do agendamento;
- criação de APPOINTMENT_REMINDER dentro da transação.

### Separação entre persistência e envio

O Transactional Outbox garante a consistência da gravação entre as operações de negócio e os registros de notificação.

Ele não significa que o e-mail será entregue imediatamente ou que o provedor SMTP nunca falhará.

Depois do commit, a notificação permanece disponível para processamento pelo worker.

Falhas de SMTP são tratadas pela fila, sem desfazer um agendamento já confirmado no banco.

### Testes de rollback

Foram implementados testes E2E específicos para verificar que falhas simuladas na criação da notificação provocam rollback das alterações transacionais correspondentes.

Os testes cobrem:

- criação pública
- criação interna
- confirmação
- cancelamento
- reagendamento
- preparação de lembretes

Esses cenários fazem parte da suíte E2E aprovada.

---

## Lembretes automáticos

O sistema possui um processo automático de lembretes utilizando:

```text
@nestjs/schedule
```

O scheduler verifica periodicamente os agendamentos elegíveis.

Os lembretes podem ser configurados individualmente por empresa.

Valor padrão de antecedência:

```text
24 horas
```

Também existem testes para configurações de:

```text
1 hora
24 horas
48 horas
```

Para ser elegível, o agendamento precisa atender às regras de negócio, incluindo:

- estar confirmado;
- possuir cliente com e-mail;
- estar dentro da janela de lembrete;
- não possuir registro de envio do lembrete correspondente;
- pertencer a uma empresa com lembretes habilitados.

### Fluxo atual

```text
Appointment CONFIRMED
          |
          v
Entra na janela de lembrete
          |
          v
Scheduler encontra o agendamento
          |
          v
Transação PostgreSQL
          |
          v
Revalidação + Advisory Lock
          |
          v
NotificationDelivery PENDING
          |
          v
Commit
          |
          v
Worker processa a entrega
          |
          v
SMTP confirma o envio
          |
          v
NotificationDelivery SENT
          |
          v
reminderSentAt preenchido
```

O scheduler não preenche `reminderSentAt` apenas porque conseguiu colocar o lembrete na fila.

O campo deve ser preenchido somente após o envio SMTP ter sido confirmado.

### Falhas

Se houver falha na criação do registro da notificação, a transação é revertida.

Se houver falha no SMTP, o worker controla as tentativas da notificação.

Enquanto não houver confirmação de envio:

```text
reminderSentAt = NULL
```

### Reagendamento

Se um agendamento for realmente reagendado:

```text
reminderSentAt = NULL
```

Isso permite preparar um novo lembrete para o novo horário.

Caso o horário não tenha sido alterado, o valor existente é preservado.

Notificações de lembrete que já não correspondem ao estado atual do agendamento são tratadas pelas validações do processamento, evitando o envio de lembretes desatualizados.

---

## SMTP

O envio de e-mails é configurado através de variáveis de ambiente.

Exemplo para desenvolvimento local com Mailpit:

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

O envio de e-mails pode ser desativado através de:

```env
SMTP_ENABLED=false
```

Os lembretes automáticos também podem ser desativados:

```env
APPOINTMENT_REMINDERS_ENABLED=false
```

Falhas de envio SMTP são tratadas pelo worker.

Como o SMTP é executado fora da transação do agendamento, um erro de comunicação com o servidor de e-mail não desfaz operações de negócio já persistidas.

---

## Mailpit

O projeto utiliza Mailpit no ambiente local para testar e-mails sem enviar mensagens reais.

O serviço está configurado no:

```text
docker-compose.yml
```

Portas padrão:

```text
SMTP:
localhost:1025

Interface web:
http://localhost:8025
```

Para iniciar:

```bash
docker compose up -d mailpit
```

Depois acesse:

```text
http://localhost:8025
```

O Mailpit permite visualizar os e-mails gerados pelo sistema durante os testes manuais.

---

## Rate Limit

Os endpoints públicos possuem proteção contra excesso de requisições.

A API utiliza:

```text
@nestjs/throttler
```

Configuração atual:

```text
Endpoints públicos:
120 requisições por minuto por IP

Criação de agendamento público:
20 requisições por minuto por IP
```

Quando o limite é atingido, a API retorna:

```text
HTTP 429
```

O frontend apresenta uma mensagem amigável ao usuário.

---

## Segurança

Algumas proteções atualmente implementadas:

- autenticação JWT
- hash de senha com bcrypt
- controle de acesso por função
- isolamento multi-tenant
- validação global dos DTOs
- whitelist de propriedades
- proteção contra conflito de agendamentos
- transações no PostgreSQL
- PostgreSQL Advisory Locks
- rate limit em endpoints públicos
- validações de disponibilidade no backend
- validação das regras de agendamento público no backend
- proteção contra agendamento público duplicado
- normalização de telefone
- fila persistente de notificações
- chaves de deduplicação
- Transactional Outbox
- testes de rollback transacional
- banco separado para testes E2E
- proteção dos testes contra execução no banco de desenvolvimento

---

## Principais endpoints

### Auth

```http
POST /auth/register
POST /auth/login
GET  /auth/me
```

### Empresa

```http
GET   /tenants/current
PATCH /tenants/current
```

### Serviços

```http
POST   /services
GET    /services
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

### Clientes

```http
GET   /clients
POST  /clients
GET   /clients/:id
PATCH /clients/:id
```

### Disponibilidade

```http
GET /availability
```

Exemplo:

```http
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

Exemplo de confirmação:

```http
PATCH /appointments/:id/status
```

Body:

```json
{
  "status": "CONFIRMED"
}
```

Outros estados permitidos pelo fluxo também utilizam o mesmo endpoint de status.

Exemplo:

```json
{
  "status": "COMPLETED"
}
```

Ou:

```json
{
  "status": "NO_SHOW"
}
```

### Agendamento público

```http
GET /public/tenants/:slug

GET /public/tenants/:slug/services

GET /public/tenants/:slug/employees

GET /public/tenants/:slug/availability

POST /public/tenants/:slug/appointments
```

---

## Executando o projeto

### Requisitos

Tenha instalado:

- Node.js
- pnpm
- Docker
- Docker Compose

Ambiente utilizado durante o desenvolvimento:

```text
Node.js 24
pnpm 10
PostgreSQL
```

### 1. Clone o projeto

```bash
git clone https://github.com/edununesprado/agendamento-saas.git
```

Entre na pasta:

```bash
cd agendamento-saas
```

### 2. Instale as dependências

```bash
pnpm install
```

### 3. Inicie os containers

Na raiz do projeto:

```bash
docker compose up -d
```

Esse comando inicia os serviços configurados no Docker Compose, incluindo PostgreSQL e Mailpit.

Para conferir:

```bash
docker compose ps
```

### 4. Configure a API

Crie o arquivo:

```text
apps/api/.env
```

Exemplo:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agendamento"

JWT_ACCESS_SECRET="substitua-por-uma-chave-secreta-forte"

JWT_ACCESS_EXPIRES_IN="15m"

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

Os valores acima são exemplos de desenvolvimento local.

Não utilize credenciais de desenvolvimento em produção.

### 5. Execute as migrations

```bash
cd apps/api
pnpm prisma migrate deploy
```

Gere o Prisma Client:

```bash
pnpm prisma generate
```

### 6. Inicie a API

Dentro de:

```text
apps/api
```

execute:

```bash
pnpm start:dev
```

A API será executada em:

```text
http://localhost:3333
```

### 7. Configure o frontend

Crie:

```text
apps/web/.env.local
```

Com:

```env
NEXT_PUBLIC_API_URL=http://localhost:3333
```

### 8. Inicie o frontend

Dentro de:

```text
apps/web
```

execute:

```bash
pnpm dev
```

O frontend será executado em:

```text
http://localhost:3000
```

---

## Testes E2E

Os testes utilizam um banco separado:

```text
agendamento_test
```

Arquivo:

```text
apps/api/.env.test
```

Exemplo:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agendamento_test"

JWT_ACCESS_SECRET="test-e2e-secret-key"

JWT_ACCESS_EXPIRES_IN="15m"

NODE_ENV="test"

APPOINTMENT_REMINDERS_ENABLED=false
```

Os lembretes automáticos permanecem desativados durante os testes E2E para evitar interferência do scheduler nos cenários automatizados.

Os serviços de lembrete podem ser chamados diretamente pelos testes para validar seu comportamento.

**Atenção:** os testes E2E realizam operações de limpeza de dados. Utilize exclusivamente o banco de testes.

### Aplicando migrations no banco de testes

No PowerShell, dentro de `apps/api`:

```powershell
$env:DATABASE_URL = ((Get-Content .env.test | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', '').Trim('"').Trim("'")

pnpm prisma migrate deploy

Remove-Item Env:DATABASE_URL
```

Antes de executar migrations manualmente, confira o banco selecionado:

```powershell
node -e "console.log(new URL(process.env.DATABASE_URL).pathname)"
```

Execute essa verificação enquanto `DATABASE_URL` estiver definida no terminal.

O esperado para E2E é:

```text
/agendamento_test
```

### Executando todos os testes

Dentro de:

```text
apps/api
```

execute:

```bash
pnpm test:e2e
```

Para salvar o resultado em arquivo, no Git Bash:

```bash
pnpm test:e2e 2>&1 | tee resultado-e2e.txt
```

### Resultado validado em 24/10/2026

```text
Test Files  34 passed (34)
Tests       185 passed (185)
```

A suíte passou integralmente após a implementação do Transactional Outbox.

Entre os cenários de teste estão:

- autenticação
- permissões
- isolamento multi-tenant
- clientes
- serviços
- funcionários
- agenda de funcionários
- acesso do STAFF
- agendamento público
- normalização de telefone
- criação pública concorrente
- conflito de cliente
- rate limit
- regras configuráveis de agendamento público
- reagendamento
- notificações
- fila persistente
- worker de notificações
- tentativas e falhas de entrega
- lembretes automáticos
- proteção contra lembretes desatualizados
- rollback da criação pública
- rollback da criação interna
- rollback da confirmação
- rollback do cancelamento
- rollback do reagendamento
- rollback da preparação de lembretes

Os testes de Transactional Outbox simulam falhas no enfileiramento e verificam se o banco permanece consistente.

---

## Build de produção

### API

```bash
cd apps/api
pnpm build
```

O build da API foi validado após a implementação do Transactional Outbox.

### Frontend

```bash
cd apps/web
pnpm build
```

O frontend utiliza Next.js e possui processo de build independente da API.

---

## Estado atual do projeto

O projeto possui o fluxo principal de um sistema SaaS de agendamentos implementado.

Fluxo de negócio:

```text
Empresa
   |
   v
Usuários e permissões
   |
   v
Serviços
   |
   v
Funcionários
   |
   v
Horários de trabalho
   |
   v
Clientes
   |
   v
Disponibilidade
   |
   v
Agenda interna / Página pública
   |
   v
Solicitação de agendamento
   |
   v
PENDING
   |
   v
Confirmação pela empresa
   |
   v
CONFIRMED
   |
   v
Transactional Outbox
   |
   v
NotificationDelivery
   |
   v
Worker
   |
   v
SMTP
   |
   v
Notificação enviada
   |
   v
Lembrete automático
   |
   v
Atendimento
```

Também estão implementados:

```text
Multi-tenancy
RBAC
Conflito de horários
PostgreSQL Advisory Locks
Rate Limit
Agendamento público
Reagendamento
SMTP
Mailpit
Notificações por e-mail
Fila persistente de notificações
Retry automático
Deduplicação
Transactional Outbox
Lembretes automáticos
Testes E2E
Testes de rollback
```

O desenvolvimento continua com melhorias incrementais de confiabilidade, observabilidade e usabilidade.

---

## Próximas etapas

### Etapa 1 — Transactional Outbox

**Implementação e validações concluídas.**

- Atomicidade na criação pública
- Atomicidade na criação interna
- Atomicidade na confirmação
- Atomicidade no cancelamento
- Atomicidade no reagendamento
- Preparação transacional dos lembretes
- Testes E2E de rollback
- Build da API aprovado
- 185 testes E2E aprovados

### Etapa 2 — Hardening do Worker

**Próxima etapa planejada.**

Objetivos:

- reforçar a recuperação de notificações presas em PROCESSING;
- revisar o comportamento de idempotência;
- fortalecer o tratamento de FAILED;
- implementar reprocessamento manual;
- revisar a política de novas tentativas;
- minimizar entregas duplicadas;
- ampliar os testes de falhas e concorrência.

A arquitetura de entrega considera a possibilidade de processamento repetido em situações de falha, sem prometer uma garantia de exatamente um envio SMTP.

### Etapa 3 — Painel de Notificações

**Planejada, ainda não implementada.**

Criar uma área administrativa para acompanhamento das notificações com:

- notificações enviadas
- notificações pendentes
- notificações com falha
- quantidade de tentativas
- destinatário
- tipo da notificação
- data de criação
- data do envio
- mensagem do último erro
- botão de reenvio

A página deverá respeitar o isolamento multi-tenant e as permissões definidas pelo backend.

### Melhorias técnicas futuras

- investigar avisos de depreciação do driver PostgreSQL;
- ampliar a observabilidade do worker;
- aprimorar o diagnóstico de falhas;
- fortalecer testes de concorrência;
- revisar estratégias de recuperação de entregas.

---

## Objetivo do projeto

Este projeto está sendo desenvolvido com foco em:

- arquitetura SaaS
- multi-tenancy
- segurança
- autorização baseada em funções
- APIs REST
- integridade de dados
- concorrência
- transações PostgreSQL
- Transactional Outbox
- processamento assíncrono
- filas persistentes
- idempotência
- testes automatizados
- boas práticas de backend
- frontend administrativo
- experiência de agendamento público
- notificações
- processamento de tarefas agendadas

Também faz parte do meu portfólio para demonstrar conhecimentos em desenvolvimento Full Stack com TypeScript.

---

## Autor

**Eduardo Nunes Prado**

GitHub:

https://github.com/edununesprado
