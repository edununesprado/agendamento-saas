# Agendamento SaaS

Sistema SaaS multiempresa para gerenciamento de agendamentos, desenvolvido como projeto de portfólio.

A aplicação permite que diferentes empresas utilizem a mesma plataforma de forma isolada, cada uma com seus próprios usuários, funcionários, serviços, clientes, horários e agendamentos.

O projeto possui painel administrativo, controle de acesso por função e uma página pública onde clientes podem solicitar agendamentos sem necessidade de login.

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

### Banco de dados

- PostgreSQL

### Testes

- Vitest
- Supertest
- Testes E2E

### Infraestrutura

- Docker
- Docker Compose
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

---

## Funcionalidades implementadas

### Autenticação

- Cadastro de usuário e empresa
- Login com JWT
- Identificação do usuário autenticado
- Associação automática do usuário OWNER à empresa
- Isolamento entre empresas

### Multi-tenant

Cada empresa possui seus próprios:

- usuários
- funcionários
- serviços
- clientes
- horários
- bloqueios
- agendamentos
- configurações

Os dados de uma empresa não podem ser acessados por outra.

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

### RECEPTIONIST

Pode:

- consultar agenda
- criar agendamentos
- reagendar
- confirmar
- cancelar
- gerenciar clientes
- consultar funcionários e serviços

### STAFF

Possui acesso restrito à própria agenda.

Pode consultar seus próprios atendimentos, mas não gerenciar configurações administrativas.

---

## Serviços

O sistema permite:

- criar serviços
- listar serviços
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
- desativar e restaurar funcionários
- vincular serviços aos funcionários
- configurar horários de trabalho
- cadastrar bloqueios de horário

---

## Disponibilidade

O sistema calcula automaticamente os horários disponíveis considerando:

- horário de trabalho do funcionário
- duração do serviço
- serviços realizados pelo funcionário
- horários bloqueados
- agendamentos existentes
- timezone da empresa

Os horários são calculados no timezone configurado pela empresa.

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
- ativar e desativar clientes
- armazenar telefone
- armazenar e-mail
- armazenar observações

Clientes criados pela página pública também ficam associados somente à empresa responsável pelo agendamento.

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

---

## Proteção contra conflito de horários

A API utiliza transações e PostgreSQL Advisory Locks para evitar que duas requisições simultâneas criem agendamentos para o mesmo funcionário no mesmo horário.

Além disso, agendamentos com status diferente de `CANCELED` bloqueiam o horário correspondente.

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

As regras são validadas tanto no frontend quanto no backend.

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
- Advisory Locks
- rate limit em endpoints públicos
- validações de disponibilidade no backend

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
DELETE /services/:id
PATCH  /services/:id/restore
```

### Funcionários

```http
GET  /employees
POST /employees

GET /employees/:id/services
PUT /employees/:id/services

GET /employees/:id/availability
PUT /employees/:id/availability

GET  /employees/:id/blocked-times
POST /employees/:id/blocked-times
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

PATCH /appointments/:id/reschedule
PATCH /appointments/:id/confirm
PATCH /appointments/:id/complete
PATCH /appointments/:id/cancel
PATCH /appointments/:id/no-show
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

### 3. Inicie o PostgreSQL

Na raiz do projeto:

```bash
docker compose up -d
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
```

---

### 5. Execute as migrations

```bash
cd apps/api

pnpm exec prisma migrate deploy
```

Gere o Prisma Client:

```bash
pnpm exec prisma generate
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
```

Para aplicar as migrations no banco de testes:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agendamento_test"

pnpm exec prisma migrate deploy

Remove-Item Env:DATABASE_URL
```

Para executar todos os testes E2E:

```bash
pnpm test:e2e
```

Estado atual da suíte:

```text
Test Files: 13 passed
Tests:      125 passed
```

Entre os testes existem verificações para:

- autenticação
- permissões
- isolamento multi-tenant
- clientes
- serviços
- funcionários
- agenda de funcionários
- agendamento público
- criação pública concorrente
- rate limit
- regras configuráveis de agendamento público

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

Atualmente os builds da API e do frontend estão passando sem erros.

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
Confirmação pela empresa
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
- testes automatizados
- boas práticas de backend
- frontend administrativo
- experiência de agendamento público

Também faz parte do meu portfólio para demonstrar conhecimentos em desenvolvimento Full Stack com TypeScript.

---

## Autor

**Eduardo Nunes Prado**

GitHub:

```text
https://github.com/edununesprado
```