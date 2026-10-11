# English Study System

Aplicação web (PWA) para aprender inglês a partir de **qualquer texto** que você escolher (artigo, notícia, página de livro, post, letra de música), trabalhando as quatro habilidades: **listening, reading, speaking e writing**, com recuperação ativa e repetição espaçada.

A aplicação não estuda pelo usuário. Ela organiza o esforço: **tentar → recuperar → produzir → receber retorno → revisar**.

> O app nasceu como "Deepstash English", para estudar com os cards do Deepstash. O banco local (`deepstash-english`), as tabelas `ideas`/`cards` e o identificador dos backups mantêm o nome antigo, para que dados, backups e a sincronização de antes continuem valendo. Na interface, uma "ideia" é um **texto** e um "card" é um **parágrafo**.

## Metodologia: 1 texto → 4 habilidades

| Habilidade | O que | Etapas da sessão |
|---|---|---|
| **Listening** | ouvir o texto antes de ler, anotar o que entendeu e fazer o ditado de 3 frases dele | LISTEN |
| **Reading** | ler com clique nas palavras, resumir a ideia principal e guardar até 3 chunks | READ, MINE |
| **Speaking** | ler um parágrafo em voz alta imitando o modelo (shadowing) e recontar o texto sem olhar | READ ALOUD, RETELL |
| **Writing** | frases pessoais com os chunks, opinião e uma ação concreta | PERSONALIZE, REFLECT, SO WHAT? |

A sessão diária é um assistente de 11 etapas (~30 min), uma por tela, com salvamento automático. No topo, caixas numeradas mostram onde você está e levam direto a qualquer etapa; uma faixa colorida embaixo de cada uma indica a habilidade trabalhada:
REVIEW → TEXT → LISTEN → READ → MINE → READ ALOUD → RETELL → PERSONALIZE → REFLECT → SO WHAT? → SCHEDULE REVIEW.

### O texto do dia

Na etapa TEXT você informa o título, a fonte (opcional: livro, site, autor…) e cola o texto. Cada parágrafo vira uma unidade de leitura: o texto é dividido por linhas em branco ou, se não houver nenhuma (comum em texto copiado da web), por quebras de linha. Com a IA configurada, o texto também pode vir de fotos ou screenshots. O primeiro texto registrado na sessão é o texto em estudo; a recomendação é colar sem ler, porque a primeira passada é só ouvindo.

### Listening

Na etapa LISTEN o texto fica escondido. Você ouve o texto inteiro (ou um parágrafo por vez), na velocidade que quiser, e anota o que entendeu, em inglês ou em português. Depois vem o ditado de 3 frases tiradas do próprio texto, escolhidas pelo tamanho (de 6 a 30 palavras) e espalhadas do começo ao fim. A conferência é só pelas palavras, e o que faltou aparece em destaque. Na etapa READ, o que você entendeu ouvindo aparece ao lado do texto, para comparar.

A leitura em voz alta usa a voz do navegador, frase por frase, para não ser cortada em textos longos.

### Reading

Na etapa READ o texto aparece com cada palavra clicável (ver "Leitura com clique nas palavras"), seguido da ideia principal em uma frase em inglês, do que você entendeu errado e do vocabulário de compreensão. A etapa MINE guarda até 3 chunks do texto para a repetição espaçada.

### Speaking

Na etapa READ ALOUD você escolhe um parágrafo, ouve o modelo e grava a sua leitura. O cronômetro mostra o tempo esperado em ritmo natural (~130 palavras por minuto). Com Groq (ou outro serviço compatível com OpenAI), a gravação é transcrita e comparada com o parágrafo: as palavras que a transcrição não reconheceu aparecem em destaque, como pista de pronúncia. Na etapa RETELL você esconde o texto e o reconta em voz alta (ver "Retelling gravado e transcrito").

### Writing

PERSONALIZE (uma frase sua com cada chunk), REFLECT (concordo? por quê?) e SO WHAT? (uma ação concreta) recebem retorno da IA, quando configurada.

### Progresso por habilidade

Em Progress, o quadro "As quatro habilidades neste ciclo" mostra: dias ouvindo o texto antes de ler e o acerto no ditado (listening), palavras e textos lidos (reading), tempo lendo em voz alta e recontando, com a fração de palavras reconhecidas na leitura (speaking), e palavras escritas nas frases, reflexões, ações e no texto do ciclo (writing). O resumo da etapa SCHEDULE também é dividido pelas quatro habilidades.

### Fluência na fala

Embaixo de cada retell transcrito aparecem, sem IA: palavras por minuto (sem contar as hesitações), a porcentagem de palavras diferentes, quantas hesitações ("um", "uh", "you know"…) e quantos chunks do dia foram usados. Em Progress, o speaking mostra as palavras por minuto do ciclo e há um gráfico da evolução.

### Dificuldade por fase

Além da meta de fala, a fase (1 a 4) define o listening: o LISTEN começa em 0,75× na fase 1 e em 1× nas outras, e o ditado tem 2, 3, 4 ou 5 frases de até 14, 20, 25 ou 30 palavras.

### Nível do texto

Ao colar o texto na etapa TEXT, o app mostra o tamanho e um nível aproximado (A1–A2, B1, B2 ou C1–C2), estimado pelo tamanho das frases e das palavras (índice Flesch–Kincaid). Acima de 400 palavras, ele sugere estudar só um trecho e oferece "Usar só os primeiros N parágrafos".

### Do dicionário para a revisão

Toda entrada do dicionário tem "Revisar com repetição espaçada": ela vira um chunk de hoje, com o significado e a frase, e entra no calendário D1–D30. Conta no limite de 3 chunks por dia, e um termo que já está na revisão não entra de novo.

### Versão nova do app

Quando há uma versão nova publicada, uma faixa avisa "Nova versão disponível" com o botão Recarregar. O app confere a cada hora e sempre que a aba volta a ficar visível. A troca só acontece ao recarregar, para uma aba aberta não ficar pedindo arquivos da versão antiga.

### Fonte → textos → parágrafos

Toda a biblioteca segue essa hierarquia. Em **Knowledge**:

- **Textos:** cada texto tem sua página com os parágrafos em sequência e links para o texto anterior e o seguinte da mesma fonte. Na lista, os textos ficam agrupados por fonte.
- **Fontes:** cada fonte lista seus textos na ordem de leitura e tem um fechamento opcional ("Explain what you learned from this source in two minutes" e "What stays with me from these texts?"). Nomes que só diferem em maiúsculas, acentos ou espaços são tratados como a mesma fonte.
- **My English:** os chunks em repetição espaçada.
- **Dicionário:** palavras e expressões consultadas na leitura.

### Leitura com clique nas palavras

Na etapa READ e na página de cada texto, cada palavra é clicável. Um clique seleciona a palavra; um segundo clique, em outra palavra do mesmo parágrafo, estende a seleção até formar a expressão. O painel mostra a frase em que ela aparece e, pouco depois do clique, a análise naquele contexto (pela IA): tradução em português num campo editável, transcrição fonética (IPA) e uma explicação do uso. Expressões de várias palavras são analisadas como uma unidade. "Adicionar ao dicionário" guarda tudo isso junto com a frase. Sem IA, a tradução é digitada.

A mesma palavra pode ter sentidos diferentes em frases diferentes, então cada par termo + frase é uma entrada própria do dicionário, e clicar numa palavra já conhecida em outra frase refaz a análise naquele contexto.

**Termos conhecidos sublinhados.** Tudo o que está no dicionário ou nos chunks aparece sublinhado em qualquer texto, de qualquer fonte (na etapa READ e na página do texto), mesmo que ainda não tenha tradução anotada. Clicar num termo sublinhado mostra o que está salvo, com Editar e Excluir. Excluir vale para o termo inteiro (todos os registros dele no dicionário, ou o chunk com seu histórico) e o destaque some de todos os textos na hora. Chunks também podem ser excluídos em Knowledge → My English. Passar o mouse mostra tradução, fonética, explicação e a frase em que cada sentido foi registrado. Expressões são reconhecidas inteiras, e a mais longa vence a palavra contida nela.

O dicionário, na aba e na página de cada texto, é listado em ordem alfabética. O dicionário não entra na repetição espaçada; ele alimenta os exercícios.

### Retelling gravado e transcrito

Na etapa RETELL, o cronômetro grava o microfone (o mesmo vale para o READ ALOUD). Ao parar, você pode ouvir a própria fala e, com Groq (ou outro serviço compatível com OpenAI) configurado, ela é transcrita. Sobre a transcrição há a ação "Evaluate my retelling". O áudio não é guardado; a transcrição sim.

### Acompanhamento das ações

Três dias depois de registrar um "So what?", a tela Today pergunta "Did you do it?", com um campo "What happened?" em inglês e as respostas *Yes, I did it*, *Partly* e *Not yet*. A resposta fica na página do texto.

### Exercícios (menu Practice)

Nenhum exercício mostra palavra solta: o termo sempre aparece dentro de uma frase. Um termo sem frase registrada fica fora dos exercícios até ganhar uma (a tela avisa quantos estão nessa situação).

- **Treino.** Escolhe os termos em que você mais erra e alterna três formas: completar a frase (com a tradução como dica opcional), ouvir a frase e escrever a palavra que falta, e ouvir uma frase curta e escrevê-la inteira. A pergunta errada volta algumas posições adiante, na mesma rodada, até duas vezes.
- **Tempos verbais.** Frases com lacuna para conjugar, no tempo pedido, os verbos selecionados nos seus textos (ver "Verbos do texto"). Antes de começar você escolhe os verbos, os tempos verbais e a quantidade de frases. O bloco "Verbos em que você mais erra" soma os erros de cada verbo em todas as ideias e tem o atalho "Treinar só estes verbos".
- **Flashcards.** A frente mostra a frase com o termo destacado; o verso traz a tradução, a classe gramatical (verbo, substantivo, phrasal verb…) e como o termo é usado naquele contexto. Você escolhe a origem e a quantidade; por padrão entram primeiro os mais difíceis.

**Ciclos de 7 dias com início escolhido.** Em Settings você define em que data cada ciclo começa (ou ele começa sozinho na primeira sessão feita fora de um ciclo). Os dias 1 a 5 são de sessão e os dias 6 e 7, só de revisão: um ciclo iniciado na terça tem revisão no domingo e na segunda. Progress, fechamento, sugestão do dia e reset são contados por ciclo, não por semana de calendário; os dias entre o fim de um ciclo e o começo do próximo não entram no histórico. A fase (1 a 4, que define a meta de fala) sobe a cada ciclo. Dados anteriores a essa mudança continuam valendo como ciclos de segunda a domingo.

**Focus: pontos críticos.** Novo item do menu. Junta as correções da IA de todos os ciclos (uma por texto, agrupadas por ciclo), os termos e verbos em que você mais erra nos exercícios e os chunks mais esquecidos nas revisões. Com a IA configurada, gera um plano com os assuntos mais críticos, do que mais se repete para o que menos se repete, com regra, exemplos tirados dos seus erros e um mini-exercício. O plano fica guardado e sincronizado.

**Correção junto do texto.** Na página do texto (Main idea, Retell, My view, So what?) e em My English (minha frase, frases extras e frases das revisões), a correção gerada aparece logo abaixo do texto, em uma linha: o que saiu riscado e o que entrou em negrito. Se ainda não há correção, "Gerar correção" pede uma.

**Correções sucintas.** "Correções de hoje" mostra cada texto corrigido uma única vez, em uma linha, com um comentário curto, mesmo que ele tenha recebido vários pedidos de retorno.

**Menus superiores.** Today tem a visão do ciclo sempre no topo e um menu com Hoje, O que estudar, Did you do it? e Fechamento do ciclo. Settings tem um menu com Ciclos, IA, Conta e backup, Dados e Aparência. A rotina (frequência de cada etapa) fica só no Manual.

**Filtro por tipo no dicionário.** O dicionário de cada texto e o dicionário geral têm botões para filtrar por tipo: Substantivo, Verbo, Phrasal verb, Adjetivo, Advérbio, Expressão e os demais que existirem, cada um com a contagem. O tipo vem da classe gramatical registrada pela IA; termos de mais de uma palavra sem classe contam como Expressão, e palavras sem classe ficam em "Sem classe".

**Menu de exercícios.** A tela Practice tem um menu no topo com os tipos de exercício (Treino, Tempos verbais, Ditado e Flashcards) e mostra um de cada vez; "Onde você mais erra" fica ao lado.

**Estrutura de cada parágrafo.** Na leitura, depois de cada parágrafo há o botão "Comentar a estrutura do texto": a IA comenta gramática, ortografia, sintaxe e semântica daquele card, citando os trechos. O comentário fica guardado no card e uma setinha recolhe ou expande o texto.

**Ditado.** Em Practice, o ditado fala só a palavra ou o chunk salvo, e você escreve o que ouviu. Dá para escolher só palavras, só chunks ou os dois, e um, dois ou três termos por áudio (com mais de um, eles são ditos em sequência, com uma pausa; o mesmo termo salvo em frases diferentes não se repete no mesmo áudio). A conferência é só pelas palavras: maiúsculas, pontuação e apóstrofos não contam ("dont" vale como "don't"). Depois de conferir, cada termo aparece com o que faltou em destaque, a tradução, a pronúncia (IPA), a classe gramatical, a explicação do uso e o contexto: a frase em que ele apareceu, com o termo em negrito, a tradução da frase e o áudio dela.

**Áudio em loop nos exercícios.** Velocidade (1×, 0,75×, 0,5×) e "Repetir em loop" ficam no topo de toda rodada de treino, tempos verbais, ditado e flashcards, e valem para qualquer áudio dela.

**O que estudar (resumo do dia).** Na etapa SCHEDULE e na tela Today, depois de concluir a sessão, aparece o resumo do que estudar. Ele parte de dados do dia: retornos da IA em que houve correção, termos e verbos em que você mais erra nos exercícios, chunks não lembrados na revisão e chunks não usados no retelling. Com a IA configurada, ela escreve um resumo em tópicos ao finalizar a sessão (ou pelo botão); sem IA, as listas continuam disponíveis. O resumo fica guardado na sessão.

**Retorno da IA em um bloco só.** O retorno sobre um texto aparece uma vez, em ordem fixa: MY VERSION e, conforme os botões acionados, CORRECTED (Check grammar), IMPROVED (Improve this sentence) e MORE NATURAL (Suggest a natural expression), cada um uma única vez, seguidos de COMMENTS com um comentário curto por pedido. Clicar de novo em um botão refaz só aquela parte; "Excluir retorno" apaga tudo para pedir um novo. Se o texto mudar, o próximo pedido substitui o retorno antigo.

**Chunks no RETELL.** A etapa lista os chunks do dia para usar na fala e, depois da transcrição, marca quais foram usados.

**Correção em destaque.** No retorno da IA (READ, PERSONALIZE, REFLECT, SO WHAT e os demais textos), a comparação é feita palavra por palavra: em MY VERSION, o que saiu ou foi trocado aparece riscado; em CORRECTED e MORE NATURAL, o que mudou aparece em negrito com fundo. Se nada mudou, a tela diz que a frase já estava certa.

**Listas compactas.** O que cresce com os estudos aparece em uma linha por item, e clicar abre os detalhes: dicionário, chunks, verbos do texto, textos (agrupados por fonte, em seções que abrem e fecham) e ações pendentes. Dicionário e chunks mostram 60 itens por vez, com "Mostrar mais". No computador, as listas usam duas ou três colunas, a página da ideia põe verbos e chat lado a lado, o fechamento da semana distribui as partes em duas colunas e a orientação da IA fica ao lado da etapa da sessão.

**Termo em negrito.** No flashcard e na frase revelada depois da conferência, o termo aparece em negrito. A busca do termo na frase tolera pequenas diferenças entre o que foi cadastrado e o que está escrito: uma palavra a mais ou a menos ("one thing at time" em "one thing at a time") e outra flexão ("hold" em "holding"). Nos exercícios, a resposta esperada é sempre o trecho como está na frase.

**Tradução da frase.** Depois de conferir a resposta (no Treino e em Tempos verbais) e no verso do flashcard, a frase em inglês vem acompanhada da tradução em português, em tom mais claro. A tradução é guardada pela frase: vem junto com a análise da palavra e com os exercícios de verbo, ou é pedida à IA na primeira vez em que a frase aparece, e nunca duas vezes.

**Dificuldade de um termo:** erros nos exercícios pesam o dobro dos acertos; para chunks, "não lembrei" e "difícil" nas revisões espaçadas também contam; termos nunca treinados têm prioridade sobre os dominados. O bloco "Onde você mais erra" mostra os campeões de erro. O desempenho por termo é guardado e sincronizado.

A classe gramatical e a explicação de contexto vêm da análise da IA feita ao clicar na palavra no texto. Entradas antigas, ou chunks cadastrados à mão, não as têm; basta clicar no termo de novo para a IA analisar.

### Verbos do texto

Na página de cada texto, "Encontrar os verbos deste texto" pede à IA os verbos principais do texto (até 8), com tradução, formas (he/she/it, past simple, past participle, -ing), a forma e o tempo em que cada um aparece no texto, e quatro frases com lacuna em tempos diferentes. Também dá para cadastrar um verbo à mão ("Cadastrar um verbo"): com a IA, ela completa as formas e os exercícios daquele verbo; sem IA, ele fica cadastrado só com a forma base e pode ser completado depois. Você marca quais quer estudar; só os marcados entram em "Tempos verbais". "Treinar estes verbos" abre a rodada só com os verbos daquela ideia.

### Mais prática dentro da sessão

- **PERSONALIZE:** depois dos chunks do dia, "Treinar com mais chunks" traz, de três em três, chunks de dias anteriores (os mais esquecidos nas revisões primeiro) para escrever frases novas. Elas são guardadas junto do chunk e passam a servir de contexto nos exercícios.
- **REFLECT:** os conectores ficam disponíveis por função (opinar, contrastar, explicar, exemplificar, condicionar, acrescentar, concluir); tocar em um o insere no texto.

### Áudio

Onde houver "Ouvir" (texto, parágrafos, termos, dicionário, flashcards, ditado), a leitura usa a voz do navegador e obedece a dois controles: velocidade (1×, 0.75× ou 0.5×) e "Repetir em loop". Os mesmos controles valem para as suas gravações.

**Escolha da voz.** Em Settings → Áudio dá para escolher a voz (americana, britânica, australiana… conforme o que o navegador oferece), com prévia. A escolha vale para toda leitura em voz alta e fica só no aparelho, porque cada um tem as próprias vozes.

As falas gravadas (leitura em voz alta, retelling, fala da semana, explicação de uma fonte) ficam guardadas **neste navegador** e aparecem no Weekly review, em "Minhas falas da semana", numa lista compacta: ideia, dia, duração, player e a transcrição recolhida. Cada fala pode ser excluída (com confirmação); isso remove o áudio, a transcrição e o tempo das estatísticas. Os áudios não entram no backup. Com a nuvem ligada, eles também vão para o Supabase Storage (bucket privado `recordings`, criado pelo `supabase/schema.sql`): cada aparelho envia as próprias gravações e baixa as das últimas 4 semanas feitas em outros; as mais antigas ficam só na nuvem. Em Settings dá para ver o espaço ocupado neste aparelho e apagar os áudios de mais de 4 semanas (com a nuvem, isso só libera espaço local).

### Cadastrar ideias mais rápido

Na etapa TEXT, além de colar o texto, dá para trazê-lo de imagens; o resultado volta para o formulário para você conferir antes de salvar:

- **Fotos ou screenshots do texto:** escolha as imagens, quantas forem, ou cole com Ctrl+V. A IA transcreve título e parágrafos, lendo em lotes de 4 imagens e mostrando o progresso; um texto pode ter qualquer quantidade de parágrafos. Precisa de um modelo que leia imagens: Anthropic, ou Groq com o "Modelo de visão" de Ajustes.

**Imagem por parágrafo.** Dentro de um texto já criado, em "Parágrafos", "+ Parágrafos a partir de imagens" lê uma imagem por vez: cada imagem vira um parágrafo, na ordem escolhida, com o progresso "Lendo imagem N de M". Cada parágrafo também tem "Ler de uma imagem", que preenche ou substitui só aquele parágrafo. Um ícone girando indica a leitura em andamento.

O menu lateral mostra o provedor e o modelo usado em cada função: texto, imagens e áudio.

### Conversa sobre o texto

A página de cada texto tem um chat com a IA. Ela recebe a fonte, o texto, a ideia principal e o que você já escreveu (opinião, ação, chunks), e foi instruída a trazer insights, exemplos, conexões e contrapontos, em respostas curtas. Responde sempre em português, inclusive quando você escreve em inglês (nesse caso, acrescenta uma linha apontando até dois erros da sua mensagem). A conversa fica guardada com o texto (e sincronizada), e pode ser apagada. A cada pergunta seguem as últimas 20 mensagens.

### Orientação da IA por etapa

Em cada etapa da sessão há o botão "Como fazer esta etapa?". A IA responde com sugestões ligadas ao objetivo daquela etapa e ao conteúdo em estudo (fonte, texto, o que você já escreveu): estratégias de escuta no LISTEN (sem revelar o texto), perguntas-guia na leitura, pronúncia e pausas no READ ALOUD, expressões candidatas no MINE, roteiro em tópicos no RETELL, ângulos de questionamento no REFLECT, tipos de ação no SO WHAT. Ela orienta e sugere; não escreve a resposta por você.

### Manual

O menu **Manual** mostra o fluxo de estudos em uma tela: a visão geral (ouvir → ler → falar → escrever → revisar), a sessão diária com as 11 etapas agrupadas por habilidade e uma linha de instrução cada, o que acontece depois da sessão e três regras. Tempos e frequências vêm das mesmas definições usadas nas telas.

### Sugestão para hoje

A tela Today monta um plano do dia, em ordem e com o tempo de cada item, a partir do estado atual: revisões pendentes, sessão por fazer ou em andamento, ações a responder, treino (a cada 2 dias, se houver o que treinar) e fechamento da semana (na sexta, depois da sessão). No sábado e no domingo só aparecem as revisões, e a tela Today troca o cartão da sessão por um aviso de fim de semana. Só aparece o que há para fazer; com tudo em dia, ela diz isso.

### Rascunho em português

No REFLECT e no SO WHAT há um campo para rascunhar o raciocínio em português antes de escrever em inglês. Ao pedir "Como fazer esta etapa?", a IA parte desse rascunho e indica o vocabulário e as estruturas necessários para dizer aquilo em inglês, sem traduzir o texto inteiro.

### Frequência de cada etapa

Cada etapa mostra a frequência e o tempo sugerido, e a tela Today tem o quadro "Rotina":

| Atividade | Frequência |
|---|---|
| Sessão de estudo (11 etapas, ~30 min) | dias 1 a 5 do ciclo |
| Fim de semana | sábado e domingo: só as revisões agendadas |
| Revisão de cada chunk | 5 vezes: D1, D3, D7, D14, D30 |
| Did you do it? | 3 dias depois de cada ação |
| Exercícios | 2 a 3 vezes por semana |
| Weekly review | sexta-feira, depois da sessão |
| Fechamento da fonte | ao terminar uma fonte |
| Ciclo de progressão | a cada 4 semanas |

### Recomeçar

- **Resetar uma semana** (tela Progress, na semana escolhida): apaga sessões, textos, parágrafos, dicionário, chunks com seu histórico, falas, reflexões e o fechamento daquela semana, depois de mostrar o que será apagado. Revisões feitas nessa semana de chunks de semanas anteriores são mantidas.
- **Recomeçar do zero** (Settings): apaga todos os estudos, mantendo tema e configuração de IA.

Com a nuvem ligada, o que for apagado também some da sua conta. Não há como desfazer; exporte um backup antes, se quiser guardar.

### Layout

Em telas largas, as páginas usam duas colunas (por exemplo, o texto à esquerda e o que você produziu à direita) e o menu lateral mostra qual IA está em uso. No celular tudo volta a uma coluna, com navegação inferior e a IA em uso no topo; nenhum texto ou botão ultrapassa a largura da tela (palavras longas quebram).

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
- **services**: casos de uso (abrir sessão, registrar o texto, avaliar revisão…), cada um numa transação.
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
    books.ts            fonte → textos → parágrafos
    listening.ts        frases do texto para o ditado do LISTEN
    fluency.ts          palavras por minuto, variedade e hesitações da fala transcrita
    textLevel.ts        nível aproximado do texto e trecho para textos longos
    reader.ts           palavras clicáveis, seleção e frase de contexto
    exercises.ts        dificuldade por termo, treino adaptativo, flashcards
    ideaImport.ts       resposta da IA ao ler imagens → título e parágrafos
    srs/
      scheduler.ts      interface ReviewScheduler
      fixedInterval.ts  D1/D3/D7/D14/D30
      index.ts          algoritmo em uso
  data/
    db.ts               esquema Dexie e versões
    migrations.ts       conversão de dados entre versões
    backup.ts           export/import JSON
  services/             sessions, reviews, library, weekly, study (fontes, ações, dicionário), maintenance (reset, desempenho, áudios), settings
  sync/                 engine (regras), merge (mesclagem por registro), audio (áudios no Storage), cloudStore (interface), supabase (implementação), cloud (estado)
  ai/                   AIProvider, anthropicProvider, openAICompatibleProvider, feedback
  ui/
    session/            assistente da sessão diária (steps/: uma etapa por arquivo)
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
2. Em **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**. Isso cria a tabela `user_data`, o bucket privado `recordings` (áudios das falas) e as políticas que fazem cada conta enxergar só os próprios dados. Quem já tinha publicado antes pode rodar o arquivo de novo: nada é duplicado, e só a parte dos áudios é criada.
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
- **Dois navegadores mudaram:** o app junta as mudanças registro por registro, a partir da última versão em que os dois concordavam (guardada em cada navegador, fora do backup). O que só um lado mudou vence; se os dois mudaram o mesmo registro, a junção é feita campo a campo, e só quando o mesmo campo mudou nos dois fica a versão alterada por último (sem data, a do navegador atual). Excluído de um lado e editado do outro, o editado fica. Quando isso acontece, uma faixa avisa.
- **Sem a última versão em comum** (primeira vez naquele navegador, ou dados apagados do site): o app não adivinha. Ele mostra a tela "Qual versão vale?" e você escolhe entre a nuvem e o navegador atual.
- **Áudios:** vão para o bucket `recordings` e são baixados nos outros aparelhos (ver "Áudio"). Uma falha nos áudios não atrapalha a sincronização dos estudos.
- **Sair da conta:** só é permitido depois de tudo enviado, e apaga os dados daquele navegador (eles continuam na nuvem).
- **Configuração de IA:** provedor, modelos e chave vão para a sua conta e valem em todos os navegadores.

### Testar a nuvem em desenvolvimento

```bash
cp .env.example .env.local
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
pnpm dev
```

## Banco de dados

No navegador: IndexedDB, banco `deepstash-english`. Na nuvem: uma linha por usuário em `public.user_data` (coluna `data` em JSON, no mesmo formato do backup, e `version` para detectar gravações concorrentes). Tabelas: `settings`, `sessions`, `ideas`, `cards`, `vocab`, `chunks`, `reviews`, `speaking`, `reflections`, `weeklyReviews`, `writings`, `aiFeedback`, `bookNotes`, `practiceStats`, `ideaChats`, `verbs`, `translations` e, só neste navegador, `recordings`.

- Uma sessão por data. O texto em estudo é `session.ideaOfDayId`; o que foi feito no LISTEN fica em `session.listenGist` e `session.listenAnswers`.
- `ideas` guarda os textos (fonte em `bookTitle`, título e ideia principal); `cards` guarda cada parágrafo, com `ideaId` e `position` (ordem de leitura).
- `speaking` guarda as falas: `kind` é `daily` (retell), `aloud` (leitura em voz alta, com o parágrafo em `cardId`), `weekly` ou `book` (fechamento de uma fonte).
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
pnpm test:e2e    # testes de interface (Playwright, com o Google Chrome instalado)
pnpm typecheck   # TypeScript estrito
pnpm lint        # oxlint
pnpm format      # oxfmt
```

Cobertura: criação de sessão, texto e parágrafos em sequência, texto do dia, ditado do LISTEN, estatísticas por habilidade, migração do banco, limite de 3 chunks, cálculo D1–D30, revisão atrasada, avaliações AGAIN/HARD/GOOD/EASY, finalização da sessão, estatísticas semanais, ciclo de 4 semanas, sincronização com a nuvem (envio, recebimento, mesclagem por registro e conflito), áudios na nuvem, métricas de fluência, nível do texto e leitura do retorno da IA.

Os testes de interface (`e2e/`) rodam contra um build sem nuvem (`pnpm build:e2e`, que usa `.env.e2e`), em tela de computador e de celular: a sessão do texto ao resumo, o ditado do Practice, a sugestão de trecho para texto longo e a escolha da voz. Também rodam no CI, antes do build de produção.

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
| 0.9 | Textos de qualquer fonte, sessão nas quatro habilidades (LISTEN e READ ALOUD), progresso por habilidade | feito |
| 0.10 | Aviso de versão nova, escolha da voz, métricas de fala, dificuldade por fase, nível do texto, dicionário → revisão, mesclagem por registro na sincronização, áudios na nuvem, testes de interface | feito |
| 1.0 | Tabelas relacionais no Supabase | futuro |

Fora do escopo por decisão de produto: scraping de sites, rede social, ranking e gamificação pesada.
