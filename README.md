# IEC — Sistema de Agendamento de Laboratórios

Sistema web para gestão de reservas de laboratórios acadêmicos, baseado em máquina de estados, com integração ao CSC, Microsoft Teams e Google Calendar.

## Stack

- **Frontend/Backend**: Next.js 14 (App Router) + TypeScript
- **Banco de dados**: PostgreSQL via Supabase + Prisma ORM
- **Autenticação**: NextAuth.js com JWT
- **Integrações**: CSC API, MS Teams Webhook, Google Calendar API

## Pré-requisitos

- Node.js 20+
- Conta Supabase (ou PostgreSQL local)
- Credenciais Google Calendar (OAuth2)
- Webhook MS Teams configurado
- Conta/outlook e credenciais SMTP para envio de emails do operador de TI

## Configuração de ambiente

No arquivo `.env.local`, adicione as seguintes variáveis para o envio de email via Outlook SMTP:

- `OUTLOOK_SMTP_HOST`
- `OUTLOOK_SMTP_PORT`
- `OUTLOOK_SMTP_USER`
- `OUTLOOK_SMTP_PASS`
- `OUTLOOK_FROM_EMAIL`
- `OUTLOOK_TO_EMAILS`

## Instalação

```bash
npm install
cp .env.example .env.local
# Preencha as variáveis em .env.local

npm run db:migrate    # Aplica migrations
npm run db:generate   # Gera Prisma Client
npm run db:seed       # Popula dados iniciais (opcional)
npm run dev           # Inicia em http://localhost:3000
```

## Estrutura de pastas

```
src/
├── app/              # Pages e API Routes (App Router)
├── components/       # UI, Forms, Tables, Kanban
├── hooks/            # React hooks customizados
├── lib/
│   ├── prisma/       # Client Prisma singleton
│   ├── auth/         # NextAuth config + RBAC
│   ├── integrations/ # CSC, Teams, Google Calendar
│   └── validations/  # Schemas Zod
├── services/         # Lógica de negócio (máquina de estados)
├── stores/           # Zustand stores
├── types/            # Tipos TypeScript globais
└── tests/            # Testes unitários e E2E
```

## Perfis de acesso

| Perfil           | Permissões principais                       |
|------------------|---------------------------------------------|
| APOIO_ACADEMICO  | Criar e acompanhar reservas                 |
| OPERADOR_TI      | Confirmar, rejeitar, resolver conflitos     |
| ADMINISTRADOR    | Acesso total + gestão de usuários           |

## Máquina de estados

```
CRIADA → AGUARDANDO_CONFIRMACAO → CONFIRMADA
                               → CONFLITO_DE_DATAS → AGUARDANDO_CONFIRMACAO
                               → REJEITADA
```

## Sprints

| Sprint | Foco                        | Semanas |
|--------|-----------------------------|---------|
| 1      | Fundação, auth, RBAC        | 1–2     |
| 2      | Cadastros base              | 3–4     |
| 3      | Core de reservas            | 5–6     |
| 4      | Kanban e dashboard          | 7–8     |
| 5      | CSC + Teams                 | 9–10    |
| 6      | Google Calendar + conflitos | 11–12   |
| 7      | Testes e auditoria          | 13–14   |
| 8      | Homologação e deploy        | 15–16   |
