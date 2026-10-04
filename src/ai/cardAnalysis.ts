import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { getSettings } from '../services/settings';
import { AIError, type AIProvider } from './AIProvider';
import { createProvider } from './feedback';

/** Os quatro aspectos comentados, na ordem em que aparecem. */
export const ANALYSIS_ASPECTS = ['Gramática', 'Ortografia', 'Sintaxe', 'Semântica'] as const;

export function buildCardAnalysisPrompt(cardText: string, ideaTitle: string): { system: string; user: string } {
  return {
    system: [
      'Você é professor de inglês de um aluno brasileiro que estuda lendo cards curtos de ideias de livros.',
      'Comente a estrutura do texto do card abaixo, em português do Brasil, para ele entender como o inglês foi construído.',
      'Use exatamente estas quatro seções, nesta ordem, cada uma com o título em negrito em uma linha própria e de um a três itens em lista markdown:',
      '**Gramática**: tempos verbais, concordância, artigos, preposições e classes de palavras que valem a pena notar.',
      '**Ortografia**: grafias que costumam confundir brasileiros, contrações, plurais irregulares, hífens e maiúsculas. Se não houver nada a notar, diga isso em um item.',
      '**Sintaxe**: como as frases estão montadas: ordem das palavras, orações subordinadas, conectores, paralelismos e inversões.',
      '**Semântica**: o sentido de palavras e expressões naquele contexto, colocações, sentidos figurados e falsos cognatos.',
      'Em cada item, cite entre aspas o trecho do card a que você se refere, em inglês, e explique em uma frase curta.',
      'Comente só o que está no texto: não invente trechos, não resuma a ideia e não traduza o card inteiro. No máximo 200 palavras.',
    ].join('\n'),
    user: ideaTitle ? `Ideia: ${ideaTitle}\n\nTexto do card:\n${cardText}` : `Texto do card:\n${cardText}`,
  };
}

/** Gera o comentário da estrutura do texto de um card e o guarda no próprio card. */
export async function analyzeCard(cardId: string, injected?: AIProvider): Promise<string> {
  const card = await db.cards.get(cardId);
  if (!card) throw new AIError('Card não encontrado.');
  const text = card.content.trim();
  if (!text) throw new AIError('Este card não tem texto para comentar.');

  const provider = injected ?? (await createProvider((await getSettings()).ai));
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');

  const idea = await db.ideas.get(card.ideaId);
  const analysis = (await provider.complete(buildCardAnalysisPrompt(text, idea?.title ?? ''))).trim();
  if (!analysis) throw new AIError('A IA respondeu sem texto.');
  await db.cards.update(cardId, { analysis, analysisAt: nowISO(), analysisOf: text });
  return analysis;
}
