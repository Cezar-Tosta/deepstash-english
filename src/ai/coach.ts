import type { StepId } from '../domain/types';
import { getSettings } from '../services/settings';
import { AIError, type ImageInput } from './AIProvider';
import { createProvider } from './feedback';
import { type ImportedIdea, parseIdeaJSON } from '../domain/ideaImport';

/** O objetivo de cada etapa e o tipo de ajuda que faz sentido nela. */
const STEP_GUIDE: Record<StepId, string> = {
  review:
    'REVIEW — recuperar da memória as expressões agendadas antes de ver a resposta. Dê técnicas de recuperação (lembrar a situação em que aprendeu, dizer uma frase em voz alta) e como avaliar honestamente a própria lembrança.',
  text: 'TEXT — registrar o texto do dia sem lê-lo ainda, porque a primeira passada será só ouvindo. Dê critérios para escolher um bom texto de estudo (de 150 a 400 palavras, assunto de interesse, um pouco acima do nível atual) e o que observar no título antes de ouvir.',
  listen:
    'LISTEN (listening) — ouvir o texto antes de ler e anotar o que entendeu; depois, ditado de frases do texto. Dê estratégias de escuta (primeiro a ideia geral, depois palavras-chave, ouvir de novo em velocidade menor), diga em que prestar atenção sem revelar o conteúdo e como lidar com as palavras que não reconhecer.',
  read: 'READ (reading) — ler o texto, formular a ideia principal em uma frase em inglês e conferir o que entendeu ao ouvir. Diga em que prestar atenção (tese, exemplos, palavras-chave), aponte trechos que costumam ser mal interpretados e sugira estruturas para a frase da ideia principal, sem escrevê-la.',
  mine: 'MINE (reading) — escolher no máximo 3 chunks reutilizáveis. Sugira de 4 a 6 expressões candidatas tiradas do texto, dizendo em uma linha por que cada uma é reutilizável; a escolha final é do aluno.',
  aloud:
    'READ ALOUD (speaking) — ouvir o modelo e ler um parágrafo em voz alta (shadowing). Aponte no texto palavras de pronúncia difícil para brasileiros (com uma dica curta de cada), onde fazer pausas, quais palavras recebem ênfase e ligações entre palavras (connected speech).',
  retell:
    'RETELL (speaking) — recontar o texto em voz alta, sem olhar. Sugira um roteiro em 3 ou 4 tópicos (só palavras-chave em inglês) e conectores úteis; não escreva a fala.',
  personalize:
    'PERSONALIZE (writing) — criar uma frase pessoal com cada chunk. Para cada chunk escolhido, sugira 2 situações da vida real (trabalho, estudo, rotina) em que ele caberia; não escreva as frases.',
  reflect:
    'REFLECT (writing) — concordar, discordar ou qualificar o texto. Sugira 3 ângulos para questionar as ideias dele (quando falham, para quem não valem, o que ignoram) e estruturas de frase em inglês para opinar.',
  sowhat:
    'SO WHAT? (writing) — transformar o texto em uma ação concreta. Sugira 3 tipos de ação pequena e verificável que ele inspira, e a estrutura "I\'ll ... when/before/after ...".',
  schedule:
    'SCHEDULE REVIEW — encerrar a sessão. Diga o que conferir antes de finalizar e como aproveitar as revisões D1, D3, D7, D14 e D30.',
};

export interface CoachContext {
  step: StepId;
  /** Semana do ciclo de 4 semanas (1 a 4). */
  cycleWeek: number;
  /** Fonte do texto (opcional). */
  bookTitle: string;
  /** Título do texto em estudo. */
  ideaTitle: string;
  /** O texto em estudo. */
  cardsText: string;
  mainIdea: string;
  chunks: string[];
  /** O que o aluno já escreveu nesta etapa, se houver. */
  attempt: string;
  /** Rascunho em português do que ele quer dizer (REFLECT e SO WHAT). */
  draftPt: string;
}

export function buildCoachPrompt(ctx: CoachContext): { system: string; user: string } {
  return {
    system: [
      'Você é o orientador de um brasileiro que estuda inglês a partir de textos que ele escolhe, trabalhando listening, reading, speaking e writing.',
      'Método: o aluno tenta primeiro; a IA orienta e sugere caminhos, mas não entrega a resposta pronta para copiar.',
      ...(ctx.step === 'listen' || ctx.step === 'text'
        ? ['O aluno ainda não leu o texto: não revele o conteúdo dele, só oriente a escuta.']
        : []),
      `Etapa atual e o tipo de ajuda esperada: ${STEP_GUIDE[ctx.step]}`,
      `Fase ${ctx.cycleWeek} de 4 (o aluno sobe uma fase a cada ciclo de 7 dias): ajuste a exigência (a fase 1 é mais guiada, a fase 4 pede mais autonomia).`,
      'Baseie as sugestões no conteúdo abaixo, citando trechos ou palavras dele quando ajudar.',
      ...(ctx.draftPt
        ? [
            'O aluno rascunhou em português o que quer dizer. Parta desse rascunho: aponte o vocabulário e as estruturas em inglês de que ele vai precisar para dizer exatamente isso (palavras-chave, conectores, começo de frase) e, se houver, um ponto fraco no raciocínio. Não traduza o rascunho inteiro: quem escreve a frase em inglês é ele.',
          ]
        : []),
      'Responda em português, com no máximo 8 linhas curtas, em tópicos iniciados por "- ". Exemplos de inglês vão entre aspas.',
    ].join('\n'),
    user: [
      ctx.bookTitle && `Fonte: ${ctx.bookTitle}`,
      ctx.ideaTitle && `Título: ${ctx.ideaTitle}`,
      ctx.cardsText && `Texto:\n${ctx.cardsText}`,
      ctx.mainIdea && `Ideia principal escrita pelo aluno: ${ctx.mainIdea}`,
      ctx.chunks.length > 0 && `Chunks escolhidos: ${ctx.chunks.join('; ')}`,
      ctx.draftPt && `O que o aluno quer dizer, no rascunho dele em português: ${ctx.draftPt}`,
      ctx.attempt && `O que o aluno já escreveu nesta etapa, em inglês: ${ctx.attempt}`,
      !ctx.cardsText && !ctx.ideaTitle && 'Ainda não há conteúdo registrado hoje; oriente sobre a etapa em geral.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

/** Orientação da IA para a etapa atual, considerando o objetivo dela e o conteúdo em estudo. */
export async function askCoach(ctx: CoachContext): Promise<string> {
  const provider = await createProvider((await getSettings()).ai);
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');
  return (await provider.complete(buildCoachPrompt(ctx))).trim();
}

const IMPORT_PROMPT = [
  'As imagens são fotos ou capturas de tela de um texto em inglês (artigo, página de livro, site...).',
  'Transcreva o texto exatamente como está, em inglês, sem traduzir, resumir ou corrigir. Ignore botões, menus, anúncios, números de página e contadores.',
  'Mantenha a ordem das imagens. Cada parágrafo vira um item da lista, sejam quantos forem; um parágrafo cortado entre duas imagens é um item só. Se as imagens não mostrarem um título, devolva o título vazio.',
  'Responda somente com um objeto JSON: {"title": "<título do texto>", "cards": ["<parágrafo 1>", "<parágrafo 2>"]}',
].join('\n');

/** Imagens por pedido. Os modelos de visão limitam quantas aceitam de uma vez. */
export const IMAGES_PER_REQUEST = 4;

/** Junta as partes lidas em pedidos separados: o primeiro título encontrado e todos os parágrafos, em ordem. */
export function mergeImported(parts: readonly ImportedIdea[]): ImportedIdea {
  return {
    title: parts.find((p) => p.title)?.title ?? '',
    cards: parts.flatMap((p) => p.cards),
  };
}

/**
 * Lê imagens de um texto e devolve título e parágrafos, prontos para conferir e salvar.
 * Não há limite de imagens: a leitura é feita em lotes, na ordem, e `onProgress`
 * informa quantas já foram lidas.
 */
export async function importIdeaFromImages(
  images: ImageInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportedIdea> {
  const provider = await createProvider((await getSettings()).ai);
  if (!provider?.readImages) throw new AIError('A IA configurada não lê imagens. Use Groq, Anthropic ou cole o texto.');
  const parts: ImportedIdea[] = [];
  for (let i = 0; i < images.length; i += IMAGES_PER_REQUEST) {
    onProgress?.(i, images.length);
    const batch = images.slice(i, i + IMAGES_PER_REQUEST);
    parts.push(parseIdeaJSON(await provider.readImages(IMPORT_PROMPT, batch)));
  }
  const idea = mergeImported(parts);
  if (!idea.title && idea.cards.length === 0) {
    throw new AIError('Não foi possível ler texto nas imagens. Tente capturas mais nítidas ou cole o texto.');
  }
  return idea;
}

const CARD_PROMPT = [
  'A imagem é uma foto ou captura de tela de um trecho de texto em inglês.',
  'Transcreva o trecho exatamente como está, em inglês, sem traduzir, resumir ou corrigir.',
  'Ignore botões, menus, anúncios, números de página e contadores. Junte as linhas de um mesmo parágrafo.',
  'Responda somente com o texto, sem aspas e sem comentários.',
].join('\n');

/** Lê uma imagem e devolve o texto de um parágrafo. Uma imagem = um parágrafo. */
export async function readCardFromImage(image: ImageInput): Promise<string> {
  const provider = await createProvider((await getSettings()).ai);
  if (!provider?.readImages) throw new AIError('A IA configurada não lê imagens. Use Groq ou Anthropic, ou digite o texto.');
  const text = cleanCardText(await provider.readImages(CARD_PROMPT, [image]));
  if (!text) throw new AIError('Não foi possível ler texto nesta imagem.');
  return text;
}

/** Tira a moldura que alguns modelos põem em volta da resposta (cerca de código, aspas). */
export function cleanCardText(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
    .replace(/^["“](.*)["”]$/s, '$1')
    .trim();
}
