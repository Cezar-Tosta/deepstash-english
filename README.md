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

Na página de uma ideia, cada palavra dos cards é clicável. Um clique seleciona a palavra; um segundo clique, em outra palavra do mesmo card, estende a seleção até formar a expressão. O painel mostra a frase em que ela aparece e, pouco depois do clique, a análise naquele contexto (pela IA): tradução em português num campo editável, transcrição fonética (IPA) e uma explicação do uso. Expressões de várias palavras são analisadas como uma unidade. "Adicionar ao dicionário" guarda tudo isso junto com a frase. Sem IA, a tradução é digitada.

A mesma palavra pode ter sentidos diferentes em frases diferentes, então cada par termo + frase é uma entrada própria do dicionário, e clicar numa palavra já conhecida em outra frase refaz a análise naquele contexto.

**Termos conhecidos sublinhados.** Tudo o que está no dicionário ou nos chunks aparece sublinhado nos textos dos cards de qualquer ideia, de qualquer livro (na página da ideia e na releitura da etapa CHECK), mesmo que ainda não tenha tradução anotada. Clicar num termo sublinhado mostra o que está salvo, com Editar e Excluir. Excluir vale para o termo inteiro (todos os registros dele no dicionário, ou o chunk com seu histórico) e o destaque some de todos os textos na hora. Chunks também podem ser excluídos em Knowledge → My English. Passar o mouse mostra tradução, fonética, explicação e a frase em que cada sentido foi registrado. Expressões são reconhecidas inteiras, e a mais longa vence a palavra contida nela.

O dicionário, na aba e na página de cada ideia, é listado em ordem alfabética. O dicionário não entra na repetição espaçada; ele alimenta os exercícios.

### Retelling gravado e transcrito

Na etapa RETELL, o cronômetro grava o microfone. Ao parar, você pode ouvir a própria fala e, com Groq (ou outro serviço compatível com OpenAI) configurado, ela é transcrita. Sobre a transcrição há a ação "Evaluate my retelling". O áudio não é guardado; a transcrição sim.

### Acompanhamento das ações

Três dias depois de registrar um "So what?", a tela Today pergunta "Did you do it?", com um campo "What happened?" em inglês e as respostas *Yes, I did it*, *Partly* e *Not yet*. A resposta fica na página da ideia.

### Exercícios (menu Practice)

Nenhum exercício mostra palavra solta: o termo sempre aparece dentro de uma frase. Um termo sem frase registrada fica fora dos exercícios até ganhar uma (a tela avisa quantos estão nessa situação).

- **Treino.** Escolhe os termos em que você mais erra e alterna três formas: completar a frase (com a tradução como dica opcional), ouvir a frase e escrever a palavra que falta, e ouvir uma frase curta e escrevê-la inteira. A pergunta errada volta algumas posições adiante, na mesma rodada, até duas vezes.
- **Tempos verbais.** Frases com lacuna para conjugar, no tempo pedido, os verbos selecionados nas suas ideias (ver "Verbos da ideia").
- **Flashcards.** A frente mostra a frase com o termo destacado; o verso traz a tradução, a classe gramatical (verbo, substantivo, phrasal verb…) e como o termo é usado naquele contexto. Você escolhe a origem e a quantidade; por padrão entram primeiro os mais difíceis.

**Dificuldade de um termo:** erros nos exercícios pesam o dobro dos acertos; para chunks, "não lembrei" e "difícil" nas revisões espaçadas também contam; termos nunca treinados têm prioridade sobre os dominados. O bloco "Onde você mais erra" mostra os campeões de erro. O desempenho por termo é guardado e sincronizado.

A classe gramatical e a explicação de contexto vêm da análise da IA feita ao clicar na palavra no card. Entradas antigas, ou chunks cadastrados à mão, não as têm; basta clicar no termo de novo para a IA analisar.

### Verbos da ideia

Na página de cada ideia, "Encontrar os verbos desta ideia" pede à IA os verbos principais do texto (até 8), com tradução, formas (he/she/it, past simple, past participle, -ing), a forma e o tempo em que cada um aparece no texto, e quatro frases com lacuna em tempos diferentes. Você marca quais quer estudar; só os marcados entram em "Tempos verbais". "Treinar estes verbos" abre a rodada só com os verbos daquela ideia.

### Mais prática dentro da sessão

- **PERSONALIZE:** depois dos chunks do dia, "Treinar com mais chunks" traz, de três em três, chunks de dias anteriores (os mais esquecidos nas revisões primeiro) para escrever frases novas. Elas são guardadas junto do chunk e passam a servir de contexto nos exercícios.
- **REFLECT:** os conectores ficam disponíveis por função (opinar, contrastar, explicar, exemplificar, condicionar, acrescentar, concluir); tocar em um o insere no texto.

### Áudio

Onde houver "Ouvir" (cards, termos, dicionário, flashcards, ditado), a leitura usa a voz do navegador e obedece a dois controles: velocidade (1×, 0.75× ou 0.5×) e "Repetir em loop". Os mesmos controles valem para as suas gravações.

As falas gravadas (retelling, fala da semana, explicação do livro) ficam guardadas **neste navegador** e aparecem no Weekly review, em "Minhas falas da semana", numa lista compacta: ideia, dia, duração, player e a transcrição recolhida. Cada fala pode ser excluída (com confirmação); isso remove o áudio, a transcrição e o tempo das estatísticas. Os áudios não entram no backup nem vão para a nuvem; em Settings dá para ver o espaço ocupado e apagar os de mais de 4 semanas.

### Cadastrar ideias mais rápido

Na etapa READ, "Importar a ideia inteira" oferece dois caminhos, e em ambos o resultado volta para o formulário para você conferir antes de salvar:

- **Colar o texto:** a primeira linha vira o título e cada bloco separado por linha em branco vira um card. No site do Deepstash (navegador) dá para selecionar e copiar a ideia inteira.
- **Screenshots da ideia inteira:** escolha as imagens, quantas forem, ou cole com Ctrl+V. A IA transcreve título e cards, lendo em lotes de 4 imagens e mostrando o progresso; uma ideia pode ter qualquer quantidade de cards. Precisa de um modelo que leia imagens: Anthropic, ou Groq com o "Modelo de visão" de Ajustes.

**Imagem por card.** Dentro de uma ideia já criada, em "Cards da ideia", "+ Cards a partir de imagens" lê um screenshot por vez: cada imagem vira um card, na ordem escolhida, com o progresso "Lendo imagem N de M". Cada card também tem "Ler de uma imagem", que preenche ou substitui só aquele card. Um ícone girando indica a leitura em andamento.

O menu lateral mostra o provedor e o modelo usado em cada função: texto, imagens e áudio.

### Conversa sobre a ideia

A página de cada ideia tem um chat com a IA. Ela recebe o livro, o texto dos cards, a ideia principal e o que você já escreveu (opinião, ação, chunks), e foi instruída a trazer insights, exemplos, conexões e contrapontos, em respostas curtas. Responde no idioma em que você escrever; em inglês, acrescenta uma linha apontando até dois erros da sua mensagem. A conversa fica guardada com a ideia (e sincronizada), e pode ser apagada. A cada pergunta seguem as últimas 20 mensagens.

### Orientação da IA por etapa

Em cada etapa da sessão há o botão "Como fazer esta etapa?". A IA responde com sugestões ligadas ao objetivo daquela etapa e ao conteúdo em estudo (livro, texto dos cards, o que você já escreveu): perguntas-guia na leitura, expressões candidatas no MINE, roteiro em tópicos no RETELL, ângulos de questionamento no REFLECT, tipos de ação no SO WHAT. Ela orienta e sugere; não escreve a resposta por você.

### Manual

O menu **Manual** mostra o fluxo de estudos em uma tela: a visão geral (ler → aprofundar 1 → guardar 3 → falar 1 → revisar), a sessão diária com as 10 etapas agrupadas em quatro fases e uma linha de instrução cada, o que acontece depois da sessão e três regras. Tempos e frequências vêm das mesmas definições usadas nas telas.

### Sugestão para hoje

A tela Today monta um plano do dia, em ordem e com o tempo de cada item, a partir do estado atual: revisões pendentes, sessão por fazer ou em andamento, ações a responder, treino (a cada 2 dias, se houver o que treinar) e fechamento da semana (na sexta, depois da sessão). No sábado e no domingo só aparecem as revisões, e a tela Today troca o cartão da sessão por um aviso de fim de semana. Só aparece o que há para fazer; com tudo em dia, ela diz isso.

### Rascunho em português

No REFLECT e no SO WHAT há um campo para rascunhar a ideia em português antes de escrever em inglês. Ao pedir "Como fazer esta etapa?", a IA parte desse rascunho e indica o vocabulário e as estruturas necessários para dizer aquilo em inglês, sem traduzir o texto inteiro.

### Frequência de cada etapa

Cada etapa mostra a frequência e o tempo sugerido, e a tela Today tem o quadro "Rotina":

| Atividade | Frequência |
|---|---|
| Sessão de estudo (10 etapas, ~30 min) | segunda a sexta |
| Fim de semana | sábado e domingo: só as revisões agendadas |
| Revisão de cada chunk | 5 vezes: D1, D3, D7, D14, D30 |
| Did you do it? | 3 dias depois de cada ação |
| Exercícios | 2 a 3 vezes por semana |
| Weekly review | sexta-feira, depois da sessão |
| Fechamento do livro | ao terminar cada livro |
| Ciclo de progressão | a cada 4 semanas |

### Recomeçar

- **Resetar uma semana** (tela Progress, na semana escolhida): apaga sessões, ideias, cards, dicionário, chunks com seu histórico, falas, reflexões e o fechamento daquela semana, depois de mostrar o que será apagado. Revisões feitas nessa semana de chunks de semanas anteriores são mantidas.
- **Recomeçar do zero** (Settings): apaga todos os estudos, mantendo tema e configuração de IA.

Com a nuvem ligada, o que for apagado também some da sua conta. Não há como desfazer; exporte um backup antes, se quiser guardar.

### Layout

Em telas largas, as páginas usam duas colunas (por exemplo, os cards da ideia à esquerda e o que você produziu à direita) e o menu lateral mostra qual IA está em uso. No celular tudo volta a uma coluna, com navegação inferior e a IA em uso no topo; nenhum texto ou botão ultrapassa a largura da tela (palavras longas quebram).

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
    exercises.ts        dificuldade por termo, treino adaptativo, flashcards
    ideaImport.ts       texto colado ou resposta da IA → título e cards
    srs/
      scheduler.ts      interface ReviewScheduler
      fixedInterval.ts  D1/D3/D7/D14/D30
      index.ts          algoritmo em uso
  data/
    db.ts               esquema Dexie e versões
    migrations.ts       conversão de dados entre versões
    backup.ts           export/import JSON
  services/             sessions, reviews, library, weekly, study (livros, ações, dicionário), maintenance (reset, desempenho, áudios), settings
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
- **Configuração de IA:** provedor, modelos e chave vão para a sua conta e valem em todos os navegadores.

### Testar a nuvem em desenvolvimento

```bash
cp .env.example .env.local
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
pnpm dev
```

## Banco de dados

No navegador: IndexedDB, banco `deepstash-english`. Na nuvem: uma linha por usuário em `public.user_data` (coluna `data` em JSON, no mesmo formato do backup, e `version` para detectar gravações concorrentes). Tabelas: `settings`, `sessions`, `ideas`, `cards`, `vocab`, `chunks`, `reviews`, `speaking`, `reflections`, `weeklyReviews`, `writings`, `aiFeedback`, `bookNotes`, `practiceStats`, `ideaChats`, `verbs` e, só neste navegador, `recordings`.

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

A chave nunca fica no código-fonte. Sem login, ela fica só no IndexedDB do navegador. Com a nuvem ligada, o provedor, os modelos e a chave são guardados na sua conta (na sua linha de `user_data`, protegida por RLS) e passam a valer em qualquer navegador onde você entrar; o arquivo de backup exportado continua sem a chave. Como não há servidor, a chamada sai direto do navegador com essa chave; use uma chave com limite de gasto.

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
| 0.8 | Reset por semana, treino adaptativo, áudios da semana, importação por texto e screenshots, orientação da IA por etapa, layout para celular | feito, testado com IA simulada |
| 1.0 | Áudios na nuvem, tabelas relacionais no Supabase com mesclagem por registro, testes de interface | futuro |

Fora do escopo por decisão de produto: scraping do Deepstash, rede social, ranking e gamificação pesada.
