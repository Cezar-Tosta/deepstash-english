# Deepstash English Study System

Aplicação web (PWA) que digitaliza o método de estudo do planner "Deepstash + English": usar os cards diários do Deepstash para aprender inglês por recuperação ativa, produção e repetição espaçada.

A aplicação não estuda pelo usuário. Ela organiza o esforço: **tentar → recuperar → produzir → receber retorno → revisar**.

## Metodologia: ideias → 1 → 3 → 1

O Deepstash apresenta **ideias de livros**. Cada ideia é uma sequência de **cards**, lida como uma história, e a quantidade de ideias e de cards varia. Por isso a unidade de estudo do app é a ideia, não o card.

| | O que | Etapas da sessão |
|---|---|---|
| **Ideias** | as ideias lidas no dia, quantas forem, cada uma com seus cards em ordem | READ |
| **1** | Idea of the Day: uma ideia inteira para aprofundar | IDEA OF THE DAY, CHECK |
| **3** | chunks úteis, no máximo, por dia | MINE, PERSONALIZE |
| **1** | explicação oral recontando a ideia | RETELL |

A sessão diária é um assistente de 10 etapas, uma por tela, com salvamento automático:
REVIEW → READ → IDEA OF THE DAY → CHECK → MINE → RETELL → PERSONALIZE → REFLECT → SO WHAT? → SCHEDULE REVIEW.

Na etapa READ, cada ideia registra o livro, o título e os cards. O texto dos cards é opcional e pode ser colado de uma vez (uma linha em branco separa um card do outro).

### Livro → ideias → cards

Toda a biblioteca segue essa hierarquia. Em **Knowledge**:

- **Livros:** cada livro lista suas ideias na ordem de leitura e tem um fechamento ("Explain this book in two minutes" e "What stays with me from this book?"). O livro é o título informado em cada ideia; títulos que só diferem em maiúsculas, acentos ou espaços são tratados como o mesmo livro.
- **Ideias:** cada ideia tem sua página com os cards em sequência e links para a ideia anterior e a seguinte do mesmo livro.
- **My English:** os chunks em repetição espaçada.
- **Dicionário:** palavras e expressões consultadas na leitura.

### Leitura com clique nas palavras

Na página de uma ideia, cada palavra dos cards é clicável. Um clique seleciona a palavra; um segundo clique, em outra palavra do mesmo card, estende a seleção até formar a expressão. O painel mostra a frase em que ela aparece e, a pedido, o significado em português naquele contexto (pela IA). "Adicionar ao dicionário" guarda termo, significado, frase e explicação. Sem IA, o significado pode ser digitado. O dicionário não entra na repetição espaçada; ele alimenta os exercícios.

### Retelling gravado e transcrito

Na etapa RETELL, o cronômetro grava o microfone. Ao parar, você pode ouvir a própria fala e, com Groq (ou outro serviço compatível com OpenAI) configurado, ela é transcrita. Sobre a transcrição há a ação "Evaluate my retelling". O áudio não é guardado; a transcrição sim.

### Acompanhamento das ações

Três dias depois de registrar um "So what?", a tela Today pergunta "Did you do it?", com um campo "What happened?" em inglês e as respostas *Yes, I did it*, *Partly* e *Not yet*. A resposta fica na página da ideia.

### Exercícios (menu Practice)

Montados só com o que você já estudou, em rodadas de até 8 questões:

| Exercício | Material usado |
|---|---|
| Dicionário: português → inglês | entradas do dicionário com significado |
| Completar a frase | suas frases com os chunks e as frases do dicionário |
| Escrever com a expressão | chunks e dicionário; a IA comenta depois, se ligada |
| Ouvir e escrever | frases dos cards, lidas pela voz do navegador |

Os resultados das rodadas não são guardados.

Decisões que preservam o método:

- **Revisão:** primeiro só a expressão; significado, frases e card de origem aparecem depois de REVELAR.
- **Vocabulário de compreensão** e **chunks para aprender** são coisas diferentes. Só os chunks entram na repetição espaçada.
- **Sem meta numérica de leitura.** Ler uma ideia já conta; o progresso não premia quantidade.
- **Limite de 3 chunks por dia.** O quarto só entra substituindo um dos três.
- **IA opcional e sempre depois da tentativa.** Ela comenta um texto já salvo e nunca o sobrescreve.
- **Ciclos de 4 semanas** ajustam a meta de speaking (≈1 min → 1–2 → 2 → 2–3) e a orientação sobre tradução.

## Stack

- React 19 + TypeScript (estrito) + Vite
- Tailwind CSS 4
- Dexie (IndexedDB) no navegador e Supabase (Postgres + Auth) na nuvem
- vite-plugin-pwa (instalável, funciona offline)
- Vitest + fake-indexeddb, oxlint, oxfmt

### Onde os dados ficam

O app é um site estático (GitHub Pages), sem servidor próprio. Os dados seguem dois níveis:

- **No navegador (IndexedDB):** é onde o app lê e grava. Por isso ele é rápido e continua funcionando se a rede cair.
- **Na nuvem (Supabase):** uma cópia versionada, ligada à sua conta. Cada alteração é enviada em poucos segundos, e qualquer navegador onde você entrar recebe os mesmos estudos.

A nuvem é opcional. Sem as duas variáveis do Supabase no build, o app funciona sem login e guarda tudo só no navegador.

## Arquitetura

```
ui  ──►  services  ──►  data (Dexie/IndexedDB)
 │           │
 └───────────┴──►  domain (TypeScript puro, sem I/O)
                     ai (AIProvider + implementações, opcional)
```

- **domain**: regras puras e testáveis: agendamento, ciclo, progresso da sessão, estatísticas.
- **data**: esquema do banco, migrations e backup.
- **services**: casos de uso (abrir sessão, escolher a Idea of the Day, avaliar revisão…), cada um numa transação.
- **sync**: login e sincronização. `SyncEngine` decide entre enviar, baixar ou pedir a decisão do usuário e só conhece a interface `CloudStore`; o Supabase é uma implementação dela.
- **ai**: interface `AIProvider`, provedores e o fluxo de retorno. Carregado só quando usado.
- **ui**: telas e componentes. Não acessa o banco diretamente.

### Estrutura de pastas

```
src/
  domain/
    types.ts            entidades
    dates.ts            aritmética de dias (yyyy-mm-dd)
    session.ts          etapas, limite de chunks, progresso
    cycle.ts            ciclo de 4 semanas e metas de speaking
    chunks.ts           pendente / atrasado / difícil
    stats.ts            estatísticas semanais e totais
    books.ts            livro → ideias → cards
    reader.ts           palavras clicáveis, seleção e frase de contexto
    exercises.ts        montagem e correção dos exercícios
    srs/
      scheduler.ts      interface ReviewScheduler
      fixedInterval.ts  D1/D3/D7/D14/D30
      index.ts          algoritmo em uso
  data/
    db.ts               esquema Dexie e versões
    migrations.ts       conversão de dados entre versões
    backup.ts           export/import JSON
  services/             sessions, reviews, library, weekly, study (livros, ações, dicionário, exercícios), settings
  sync/                 engine (regras), cloudStore (interface), supabase (implementação), cloud (estado)
  ai/                   AIProvider, anthropicProvider, openAICompatibleProvider, feedback
  ui/
    session/            assistente da sessão diária
    pages/              Today, Review, Knowledge, Book, IdeaDetail, Practice, Progress, Weekly, Settings
    components/         botões, campos, cronômetro, fluxo de revisão, gráfico
supabase/schema.sql      tabela e políticas de acesso
scripts/generate-icons.mjs
```

## Instalação

Requer Node 22+ e pnpm.

```bash
pnpm install
```

## Execução

Desenvolvimento:

```bash
pnpm dev
```

Build de produção e pré-visualização:

```bash
pnpm build
pnpm preview
```

## Publicação: GitHub Pages + Supabase

### 1. Criar o projeto no Supabase

1. Crie uma conta e um projeto em https://supabase.com (o plano gratuito basta).
2. Em **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**. Isso cria a tabela `user_data` e as políticas que fazem cada conta enxergar só os próprios dados.
3. Em **Authentication → Users → Add user → Create new user**, crie a sua conta com e-mail e senha e marque **Auto Confirm User**.
4. Em **Authentication → Sign In / Providers → Email**, desligue **Allow new users to sign up**. Assim ninguém mais cria conta no seu projeto.
5. Em **Project Settings → API** (ou no botão **Connect**), copie a **Project URL** e a chave pública (**anon** ou **publishable**). Nunca use a chave `service_role`/secreta.

### 2. Publicar no GitHub Pages

1. Envie o projeto para um repositório no GitHub (pelo GitHub Desktop: **Publish repository**, público).
2. No repositório, em **Settings → Secrets and variables → Actions → aba Variables → New repository variable**, crie:
   - `SUPABASE_URL` com a Project URL
   - `SUPABASE_ANON_KEY` com a chave pública
3. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions** (não "Deploy from a branch").
4. Em **Actions**, abra a última execução de "Deploy to GitHub Pages" e use **Re-run all jobs** (a primeira roda antes dos passos 2 e 3).
5. Abra `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/` e entre com o e-mail e a senha criados no Supabase.

O workflow `.github/workflows/deploy.yml` roda lint, testes e build a cada push na `main`. A URL e a chave pública ficam visíveis no site publicado, o que é esperado: quem protege os dados são o login e as políticas do banco.

### Como a sincronização se comporta

- **Envio automático:** cerca de 2 segundos depois de cada alteração.
- **Outro navegador:** ao entrar, ou ao voltar para a aba, o app baixa o que mudou.
- **Sem rede:** você continua estudando; o envio acontece quando a conexão volta.
- **Conflito:** se dois navegadores mudarem dados diferentes sem se sincronizar, o app não sobrescreve nenhum deles. Ele mostra a tela "Qual versão vale?" e você escolhe entre a nuvem e o navegador atual. O lado não escolhido é substituído; não há mesclagem.
- **Sair da conta:** só é permitido depois de tudo enviado, e apaga os dados daquele navegador (eles continuam na nuvem).
- **Chave de IA:** não vai para a nuvem; é informada em cada navegador.

### Testar a nuvem em desenvolvimento

```bash
cp .env.example .env.local
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
pnpm dev
```

## Banco de dados

No navegador: IndexedDB, banco `deepstash-english`. Na nuvem: uma linha por usuário em `public.user_data` (coluna `data` em JSON, no mesmo formato do backup, e `version` para detectar gravações concorrentes). Tabelas: `settings`, `sessions`, `ideas`, `cards`, `vocab`, `chunks`, `reviews`, `speaking`, `reflections`, `weeklyReviews`, `writings`, `aiFeedback`.

- Uma sessão por data. A Idea of the Day é `session.ideaOfDayId`, sem campo duplicado na ideia.
- `ideas` guarda livro, título e ideia principal; `cards` guarda o texto de cada card, com `ideaId` e `position` (ordem de leitura).
- `reviews` só recebe inclusões: cada tentativa de revisão fica registrada.
- **Migrations:** para mudar o esquema, acrescente uma nova `this.version(n).stores({...}).upgrade(...)` em `src/data/db.ts`. Nunca edite uma versão já publicada. A versão 2 converte os cards antigos em ideias (`src/data/migrations.ts`); backups antigos são convertidos na importação.

### Repetição espaçada

Calendário fixo a partir de D0 (dia em que o chunk foi criado): D1, D3, D7, D14, D30.

| Avaliação | Efeito |
|---|---|
| NÃO LEMBREI (AGAIN) | volta um estágio, revisa amanhã |
| DIFÍCIL (HARD) | repete o estágio com metade do intervalo |
| LEMBREI (GOOD) | segue o calendário |
| MUITO FÁCIL (EASY) | pula um estágio |

O intervalo conta a partir do dia em que a revisão foi feita, então revisões atrasadas não se empilham. Para trocar por SM-2 ou FSRS, implemente `ReviewScheduler` e altere a linha em `src/domain/srs/index.ts`.

## Backup

Em **Settings → Backup**:

- **Export Backup** gera um JSON com todos os dados.
- **Import Backup** valida o arquivo, mostra o que ele contém e substitui os dados locais numa única transação.

Com a nuvem ligada, o backup é uma cópia extra sob seu controle. Sem ela, os dados existem apenas no navegador e limpar os dados do site apaga tudo. A chave de API da IA não entra no backup.

## IA (opcional)

O app funciona inteiro sem IA. Para ligar, vá em **Settings → IA**:

| Provedor | Campos |
|---|---|
| Groq | chave de API (console.groq.com/keys); modelo opcional (padrão `llama-3.3-70b-versatile`) |
| Anthropic | chave de API; modelo opcional (padrão `claude-opus-5-5`) |
| Compatível com OpenAI | URL base, modelo, chave (vazia para servidores locais) |

O último cobre OpenAI, Google (endpoint compatível), Ollama (`http://localhost:11434/v1`) e LM Studio.

Com a IA ligada, aparecem três ações abaixo dos textos já salvos: *Check grammar*, *Improve this sentence* e *Suggest a natural expression*. Ela também explica as palavras clicadas na leitura e avalia a transcrição do retelling. A transcrição em si exige Groq ou outro serviço compatível com OpenAI (a Anthropic não transcreve áudio). O retorno vem como MY VERSION / CORRECTED / WHY? / MORE NATURAL e é guardado ao lado do original.

A chave fica no IndexedDB do navegador, nunca no código-fonte nem na nuvem. Como não há servidor, a chamada sai direto do navegador com essa chave; use uma chave com limite de gasto.

Para outro provedor, implemente `AIProvider` (`src/ai/AIProvider.ts`) e registre-o em `createProvider` (`src/ai/feedback.ts`).

## Testes

```bash
pnpm test        # regras de negócio
pnpm typecheck   # TypeScript estrito
pnpm lint        # oxlint
pnpm format      # oxfmt
```

Cobertura: criação de sessão, ideias e cards em sequência, Idea of the Day, migração do banco, limite de 3 chunks, cálculo D1–D30, revisão atrasada, avaliações AGAIN/HARD/GOOD/EASY, finalização da sessão, estatísticas semanais, ciclo de 4 semanas, sincronização com a nuvem (envio, recebimento e conflito) e leitura do retorno da IA.

## Roadmap

| Versão | Conteúdo | Situação |
|---|---|---|
| 0.1 | Sessão diária, ideias com cards em sequência, Idea of the Day, chunks, frases, reflexão, So What? | feito |
| 0.2 | Repetição espaçada, tela Review, histórico | feito |
| 0.3 | Dashboard, My Knowledge, My English, Weekly Review e Writing | feito |
| 0.4 | PWA, offline, backup | feito |
| 0.5 | IA opcional (Groq, Anthropic e compatíveis com OpenAI) | feito, não testado contra um provedor real |
| 0.7 | Livros, leitura com clique e dicionário, gravação e transcrição do retelling, acompanhamento das ações, exercícios | feito, testado com IA simulada |
| 0.6 | Login e sincronização com Supabase | feito, testado contra um servidor simulado |
| 1.0 | Entrada por screenshot/OCR, tabelas relacionais no Supabase com mesclagem por registro, testes de interface | futuro |

Fora do escopo por decisão de produto: scraping do Deepstash, rede social, ranking e gamificação pesada.
