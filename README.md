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
- Dexie (IndexedDB) para persistência no próprio aparelho
- vite-plugin-pwa (instalável, funciona offline)
- Vitest + fake-indexeddb, oxlint, oxfmt

### Por que não Node + SQLite

O uso principal é no celular, offline e sem login. Um banco SQLite num servidor Node só atenderia o celular na mesma rede, com o computador ligado. Por isso o banco fica no navegador do aparelho e não existe backend. A persistência está isolada em `src/data` e `src/services`; sincronizar com PostgreSQL/Supabase no futuro é acrescentar um adaptador ali, sem tocar no domínio nem nas telas.

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
    srs/
      scheduler.ts      interface ReviewScheduler
      fixedInterval.ts  D1/D3/D7/D14/D30
      index.ts          algoritmo em uso
  data/
    db.ts               esquema Dexie e versões
    migrations.ts       conversão de dados entre versões
    backup.ts           export/import JSON
  services/             sessions, reviews, library, weekly, settings
  ai/                   AIProvider, anthropicProvider, openAICompatibleProvider, feedback
  ui/
    session/            assistente da sessão diária
    pages/              Today, Review, Knowledge, IdeaDetail, Progress, Weekly, Settings
    components/         botões, campos, cronômetro, fluxo de revisão, gráfico
scripts/generate-icons.mjs
```

## Instalação

Requer Node 22+ e pnpm.

```bash
pnpm install
```

## Execução

Desenvolvimento (também acessível por outros aparelhos da rede):

```bash
pnpm dev
```

Build de produção e pré-visualização:

```bash
pnpm build
pnpm preview
```

### Publicar no GitHub Pages e usar no celular

Instalar o PWA e usar offline exige HTTPS, e o GitHub Pages fornece isso. O workflow `.github/workflows/deploy.yml` roda lint, testes e build e publica a pasta `dist/` a cada push na branch `main`.

1. Crie um repositório vazio no GitHub (sem README) e envie o projeto:

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/deepstash-english.git
   git push -u origin main
   ```

2. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Acompanhe em **Actions**. Se a primeira execução falhar por ter rodado antes do passo 2, use **Re-run all jobs**. Ao terminar, o app fica em `https://SEU-USUARIO.github.io/deepstash-english/`.
4. Abra esse endereço no celular e instale:
   - Android (Chrome): menu → **Instalar app**
   - iPhone (Safari): Compartilhar → **Adicionar à Tela de Início**

O build usa caminhos relativos e rotas com `#`, então funciona na subpasta do Pages sem ajuste. O site publicado contém só o código do app: seus cards, chunks e a chave de IA ficam no aparelho e nunca vão para o GitHub.

No plano gratuito do GitHub, o Pages exige repositório público. Os dados são guardados por endereço: se o endereço do app mudar (outro nome de repositório ou de usuário), exporte um backup antes e importe no novo.

Para só testar na rede local, sem instalar, abra `http://IP-DO-PC:5173` com `pnpm dev` rodando.

## Banco de dados

IndexedDB, banco `deepstash-english`. Tabelas: `settings`, `sessions`, `ideas`, `cards`, `vocab`, `chunks`, `reviews`, `speaking`, `reflections`, `weeklyReviews`, `writings`, `aiFeedback`.

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

- **Export Backup** gera um JSON com todos os dados (no celular, abre a folha de compartilhamento).
- **Import Backup** valida o arquivo, mostra o que ele contém e substitui os dados locais numa única transação.

Os dados existem apenas no aparelho. Limpar os dados do navegador ou desinstalar o app apaga tudo, então exporte com regularidade. A chave de API da IA não entra no backup.

## IA (opcional)

O app funciona inteiro sem IA. Para ligar, vá em **Settings → IA**:

| Provedor | Campos |
|---|---|
| Groq | chave de API (console.groq.com/keys); modelo opcional (padrão `llama-3.3-70b-versatile`) |
| Anthropic | chave de API; modelo opcional (padrão `claude-opus-5-5`) |
| Compatível com OpenAI | URL base, modelo, chave (vazia para servidores locais) |

O último cobre OpenAI, Google (endpoint compatível), Ollama (`http://localhost:11434/v1`) e LM Studio.

Com a IA ligada, aparecem três ações abaixo dos textos já salvos: *Check grammar*, *Improve this sentence* e *Suggest a natural expression*. O retorno vem como MY VERSION / CORRECTED / WHY? / MORE NATURAL e é guardado ao lado do original.

A chave fica no IndexedDB do aparelho, nunca no código-fonte. Como não há servidor, a chamada sai direto do navegador com essa chave; use uma chave com limite de gasto.

Para outro provedor, implemente `AIProvider` (`src/ai/AIProvider.ts`) e registre-o em `createProvider` (`src/ai/feedback.ts`).

## Testes

```bash
pnpm test        # regras de negócio
pnpm typecheck   # TypeScript estrito
pnpm lint        # oxlint
pnpm format      # oxfmt
```

Cobertura: criação de sessão, ideias e cards em sequência, Idea of the Day, migração do banco, limite de 3 chunks, cálculo D1–D30, revisão atrasada, avaliações AGAIN/HARD/GOOD/EASY, finalização da sessão, estatísticas semanais, ciclo de 4 semanas e leitura do retorno da IA.

## Roadmap

| Versão | Conteúdo | Situação |
|---|---|---|
| 0.1 | Sessão diária, ideias com cards em sequência, Idea of the Day, chunks, frases, reflexão, So What? | feito |
| 0.2 | Repetição espaçada, tela Review, histórico | feito |
| 0.3 | Dashboard, My Knowledge, My English, Weekly Review e Writing | feito |
| 0.4 | PWA, offline, backup | feito |
| 0.5 | IA opcional (Groq, Anthropic e compatíveis com OpenAI) | feito, não testado contra um provedor real |
| 0.6 | Gravação, transcrição e avaliação do retelling | futuro (`SpeakingSession.transcript` e `audioPath` já existem) |
| 1.0 | Entrada por colar/screenshot/OCR/compartilhamento, sincronização entre aparelhos, testes de interface | futuro |

Fora do escopo por decisão de produto: scraping do Deepstash, rede social, ranking e gamificação pesada.
