# Agendamento SaaS

Sistema SaaS multiempresa para gerenciamento de agendamentos, desenvolvido como projeto de portfólio.

A aplicação permite que diferentes empresas utilizem a mesma plataforma de forma isolada, cada uma com seus próprios usuários, funcionários, serviços, clientes, horários, bloqueios, agendamentos e configurações.

O projeto possui painel administrativo, controle de acesso por função, página pública de agendamento, proteção contra conflitos de horários, notificações por e-mail e lembretes automáticos.

---

## Tecnologias

### Frontend

- Next.js 16
- React
- TypeScript
- Tailwind CSS

### Backend

- NestJS
- TypeScript
- Prisma ORM
- JWT
- bcrypt
- Luxon
- NestJS Throttler
- NestJS Schedule
- Nodemailer

### Banco de dados

- PostgreSQL

### Testes

- Vitest
- Supertest
- Testes E2E

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

Os dados de uma empresa não podem ser acessados por outra.

O `tenantId` do usuário autenticado é utilizado no backend para limitar o acesso aos recursos pertencentes à empresa correta.

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
   ↓
CONFIRMED
   ↓
COMPLETED
```

Também é possível transformar um agendamento confirmado em:

```text
NO_SHOW
```

Agendamentos cancelados não voltam para estados ativos.

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

Também é possível copiar ou abrir diretamente o link público da empresa.

---

## Notificações por e-mail

O sistema possui suporte a notificações por e-mail utilizando:

```text
Nodemailer
SMTP
```

Atualmente são enviados e-mails nos seguintes eventos:

### Solicitação de agendamento público

Quando o cliente realiza um agendamento pela página pública:

```text
PENDING
```

ele recebe uma mensagem informando que a solicitação foi recebida.

### Confirmação

Quando a empresa altera o agendamento de:

```text
PENDING
```

para:

```text
CONFIRMED
```

o cliente recebe um e-mail de confirmação.

### Cancelamento

Quando um agendamento é cancelado, o cliente recebe uma notificação contendo também o motivo do cancelamento, quando informado.

### Reagendamento

Quando a data ou horário realmente é alterado, o cliente recebe um e-mail contendo:

```text
data anterior
horário anterior
nova data
novo horário
```

Caso o mesmo horário seja enviado novamente, nenhum e-mail redundante de reagendamento é disparado.

---

## Lembretes automáticos

O sistema possui um processo automático de lembretes utilizando:

```text
@nestjs/schedule
```

O scheduler verifica periodicamente os agendamentos elegíveis.

Atualmente o lembrete é enviado para agendamentos:

```text
CONFIRMED
```

que estejam dentro das próximas:

```text
24 horas
```

e cujo cliente possua e-mail cadastrado.

A verificação é executada periodicamente pelo backend.

Cada agendamento possui o campo:

```text
reminderSentAt
```

Esse campo registra quando o lembrete foi enviado e impede o envio duplicado.

Fluxo:

```text
CONFIRMED
    ↓
entra na janela das próximas 24 horas
    ↓
scheduler encontra o agendamento
    ↓
e-mail de lembrete é enviado
    ↓
reminderSentAt é preenchido
    ↓
agendamento não é selecionado novamente
```

Se o envio do e-mail falhar:

```text
reminderSentAt permanece NULL
```

permitindo uma nova tentativa em uma execução futura.

Se um agendamento for realmente reagendado:

```text
reminderSentAt = NULL
```

permitindo que um novo lembrete seja enviado para o novo horário.

Caso o horário não tenha sido alterado, o valor existente é preservado.

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

Falhas no SMTP não desfazem operações importantes como confirmação, cancelamento ou reagendamento.

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
GET  /appointments
POST /appointments

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

ou:

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

```text
Node.js
pnpm
Docker
Docker Compose
```

---

### 1. Clone o projeto

```bash
git clone https://github.com/edununesprado/agendamento-saas.git
```

Entre na pasta:

```bash
cd agendamento-saas
```

---

### 2. Instale as dependências

```bash
pnpm install
```

---

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

---

### 4. Configure a API

Crie o arquivo:

```text
apps/api/.env
```

Exemplo:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agendamento"

JWT_ACCESS_SECRET="sua-chave-secreta"

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

---

### 5. Execute as migrations

```bash
cd apps/api
pnpm prisma migrate deploy
```

Gere o Prisma Client:

```bash
pnpm prisma generate
```

---

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

---

### 7. Configure o frontend

Crie:

```text
apps/web/.env.local
```

Com:

```env
NEXT_PUBLIC_API_URL=http://localhost:3333
```

---

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

### Aplicando migrations no banco de testes

No PowerShell:

```powershell
$env:DATABASE_URL = ((Get-Content .env.test | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', '').Trim('"').Trim("'")

pnpm prisma migrate deploy

Remove-Item Env:DATABASE_URL
```

Antes de executar migrations manualmente, é possível conferir o banco selecionado:

```powershell
node -e "console.log(new URL(process.env.DATABASE_URL).pathname)"
```

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

Estado atual da suíte:

```text
Test Files: 17 passed
Tests:      147 passed
```

Entre os testes existem verificações para:

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
- lembretes automáticos

---

## Build de produção

### API

```bash
cd apps/api
pnpm build
```

### Frontend

```bash
cd apps/web
pnpm build
```

Atualmente os builds da API e do frontend passam sem erros.

---

## Estado atual do projeto

O projeto já possui o fluxo principal de um sistema SaaS de agendamentos funcionando:

```text
Empresa
   ↓
Usuários e permissões
   ↓
Serviços
   ↓
Funcionários
   ↓
Horários de trabalho
   ↓
Clientes
   ↓
Disponibilidade
   ↓
Agenda interna
   ↓
Página pública
   ↓
Solicitação de agendamento
   ↓
PENDING
   ↓
Confirmação pela empresa
   ↓
CONFIRMED
   ↓
Notificação por e-mail
   ↓
Lembrete automático
   ↓
Atendimento
```

Também estão implementados:

```text
Multi-tenancy
RBAC
Conflito de horários
Advisory Locks
Rate Limit
Agendamento público
Reagendamento
SMTP
Mailpit
Notificações
Lembretes automáticos
Testes E2E
```

O desenvolvimento continua com novas funcionalidades sendo adicionadas gradualmente.

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
- transações
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

```text
https://github.com/edununesprado
```