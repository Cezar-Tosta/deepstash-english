import type { StepId } from '../domain/types';
import { getSettings } from '../services/settings';
import { AIError, type ImageInput } from './AIProvider';
import { createProvider } from './feedback';
import { type ImportedIdea, parseIdeaJSON } from '../domain/ideaImport';

/** O objetivo de cada etapa e o tipo de ajuda que faz sentido nela. */
const STEP_GUIDE: Record<StepId, string> = {
  review:
    'REVIEW — recuperar da memória as expressões agendadas antes de ver a resposta. Dê técnicas de recuperação (lembrar a situação em que aprendeu, dizer uma frase em voz alta) e como avaliar honestamente a própria lembrança.',
  read: 'READ — ler as ideias em inglês sem traduzir e formular a ideia principal de cada uma. Diga em que prestar atenção neste texto (tese, exemplos, palavras-chave) e sugira 2 ou 3 perguntas-guia para a leitura.',
  focus:
    'IDEA OF THE DAY — escolher uma única ideia para aprofundar. Sugira critérios de escolha (utilidade na vida do aluno, novidade, vocabulário reutilizável) aplicados às ideias lidas hoje.',
  check:
    'CHECK — confirmar a compreensão e escrever a ideia principal em uma frase em inglês. Aponte os trechos do texto que costumam ser mal interpretados e sugira estruturas de frase para o resumo, sem escrever o resumo.',
  mine: 'MINE — escolher no máximo 3 chunks reutilizáveis. Sugira de 4 a 6 expressões candidatas tiradas do texto, dizendo em uma linha por que cada uma é reutilizável; a escolha final é do aluno.',
  retell:
    'RETELL — recontar a ideia em voz alta, sem olhar. Sugira um roteiro em 3 ou 4 tópicos (só palavras-chave em inglês) e conectores úteis; não escreva a fala.',
  personalize:
    'PERSONALIZE — criar uma frase pessoal com cada chunk. Para cada chunk escolhido, sugira 2 situações da vida real (trabalho, estudo, rotina) em que ele caberia; não escreva as frases.',
  reflect:
    'REFLECT — concordar, discordar ou qualificar a ideia. Sugira 3 ângulos para questionar esta ideia (quando ela falha, para quem não vale, o que ela ignora) e estruturas de frase em inglês para opinar.',
  sowhat:
    'SO WHAT? — transformar a ideia em uma ação concreta. Sugira 3 tipos de ação pequena e verificável que esta ideia inspira, e a estrutura "I\'ll ... when/before/after ...".',
  schedule:
    'SCHEDULE REVIEW — encerrar a sessão. Diga o que conferir antes de finalizar e como aproveitar as revisões D1, D3, D7, D14 e D30.',
};

export interface CoachContext {
  step: StepId;
  /** Semana do ciclo de 4 semanas (1 a 4). */
  cycleWeek: number;
  bookTitle: string;
  ideaTitle: string;
  /** Texto dos cards da ideia em foco (ou das ideias do dia, antes da escolha). */
  cardsText: string;
  mainIdea: string;
  chunks: string[];
  /** O que o aluno já escreveu nesta etapa, se houver. */
  attempt: string;
}

export function buildCoachPrompt(ctx: CoachContext): { system: string; user: string } {
  return {
    system: [
      'Você é o orientador de um brasileiro que estuda inglês lendo ideias de livros (Deepstash).',
      'Método: o aluno tenta primeiro; a IA orienta e sugere caminhos, mas não entrega a resposta pronta para copiar.',
      `Etapa atual e o tipo de ajuda esperada: ${STEP_GUIDE[ctx.step]}`,
      `Semana ${ctx.cycleWeek} do ciclo de 4 semanas: ajuste a exigência (semana 1 é mais guiada, semana 4 pede mais autonomia).`,
      'Baseie as sugestões no conteúdo abaixo, citando trechos ou palavras dele quando ajudar.',
      'Responda em português, com no máximo 8 linhas curtas, em tópicos iniciados por "- ". Exemplos de inglês vão entre aspas.',
    ].join('\n'),
    user: [
      ctx.bookTitle && `Livro: ${ctx.bookTitle}`,
      ctx.ideaTitle && `Ideia: ${ctx.ideaTitle}`,
      ctx.cardsText && `Texto dos cards:\n${ctx.cardsText}`,
      ctx.mainIdea && `Ideia principal escrita pelo aluno: ${ctx.mainIdea}`,
      ctx.chunks.length > 0 && `Chunks escolhidos: ${ctx.chunks.join('; ')}`,
      ctx.attempt && `O que o aluno já escreveu nesta etapa: ${ctx.attempt}`,
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
  'As imagens são capturas de tela de uma ideia do aplicativo Deepstash: um título e uma sequência de cards.',
  'Transcreva o texto exatamente como está, em inglês, sem traduzir, resumir ou corrigir. Ignore botões, menus e contadores da interface.',
  'Mantenha a ordem das imagens. Cada card vira um item da lista.',
  'Responda somente com um objeto JSON: {"title": "<título da ideia>", "cards": ["<texto do card 1>", "<texto do card 2>"]}',
].join('\n');

/** Lê screenshots de uma ideia e devolve título e cards, prontos para conferir e salvar. */
export async function importIdeaFromImages(images: ImageInput[]): Promise<ImportedIdea> {
  const provider = await createProvider((await getSettings()).ai);
  if (!provider?.readImages) throw new AIError('A IA configurada não lê imagens. Use Groq, Anthropic ou cole o texto.');
  const idea = parseIdeaJSON(await provider.readImages(IMPORT_PROMPT, images));
  if (!idea.title && idea.cards.length === 0) {
    throw new AIError('Não foi possível ler texto nas imagens. Tente capturas mais nítidas ou cole o texto.');
  }
  return idea;
}

const CARD_PROMPT = [
  'A imagem é a captura de tela de um único card do aplicativo Deepstash.',
  'Transcreva o texto do card exatamente como está, em inglês, sem traduzir, resumir ou corrigir.',
  'Ignore botões, menus, contadores e o nome do autor da interface. Preserve as quebras de parágrafo.',
  'Responda somente com o texto do card, sem aspas e sem comentários.',
].join('\n');

/** Lê um screenshot e devolve o texto de um card. Uma imagem = um card. */
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
