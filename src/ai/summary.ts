import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { type DayDigest, isDigestEmpty, loadDayDigest } from '../services/digest';
import { getSettings } from '../services/settings';
import { AIError, type AIProvider } from './AIProvider';
import { createProvider, FEEDBACK_LABELS } from './feedback';

const WHERE: Record<string, string> = {
  mainIdea: 'ideia principal (CHECK)',
  chunkSentence: 'frase com chunk (PERSONALIZE)',
  opinion: 'opinião (REFLECT)',
  soWhat: 'ação (SO WHAT)',
  retell: 'fala transcrita (RETELL)',
  writing: 'texto do fechamento',
  followUp: 'Did you do it?',
  bookTakeaway: 'resumo do livro',
  practice: 'exercício',
};

/** Os dados do dia em texto corrido, para a IA resumir o que estudar. */
export function describeDigest(digest: DayDigest): string {
  const parts: string[] = [];
  if (digest.corrections.length > 0) {
    parts.push(
      'CORREÇÕES DE HOJE (o que ele escreveu → como ficou corrigido; comentário do professor):',
      ...digest.corrections.map(
        (c, i) =>
          `${i + 1}. [${WHERE[c.target] ?? c.target} · ${FEEDBACK_LABELS[c.kind]}] "${c.original}" → "${c.corrected}"${c.why ? ` | ${c.why}` : ''}`,
      ),
    );
  }
  if (digest.hardTerms.length > 0) {
    parts.push(
      'TERMOS EM QUE ELE MAIS ERRA NOS EXERCÍCIOS:',
      ...digest.hardTerms.map((t) => `- ${t.term}${t.meaning ? ` (${t.meaning})` : ''}: ${t.wrong} erros, ${t.right} acertos`),
    );
  }
  if (digest.hardVerbs.length > 0) {
    parts.push(
      'VERBOS EM QUE ELE MAIS ERRA NOS TEMPOS VERBAIS:',
      ...digest.hardVerbs.map((v) => `- to ${v.base}: ${v.wrong} erros, ${v.right} acertos`),
    );
  }
  if (digest.forgotten.length > 0) {
    parts.push(
      'CHUNKS QUE ELE NÃO LEMBROU NAS REVISÕES DE HOJE:',
      ...digest.forgotten.map((c) => `- ${c.text}${c.meaning ? ` (${c.meaning})` : ''}`),
    );
  }
  if (digest.unusedChunks.length > 0) {
    parts.push('CHUNKS DE HOJE QUE ELE NÃO USOU AO RECONTAR A IDEIA EM VOZ ALTA:', ...digest.unusedChunks.map((c) => `- ${c}`));
  }
  return parts.join('\n');
}

export function buildSummaryPrompt(digest: DayDigest): { system: string; user: string } {
  return {
    system: [
      'Você é professor de inglês de um aluno brasileiro que estuda lendo ideias de livros.',
      'Abaixo estão os dados da sessão de hoje: as correções que ele recebeu, os erros nos exercícios e as revisões que não lembrou.',
      'Escreva, em português do Brasil, um resumo do que ele deve estudar. Use só o que está nos dados: não invente erros.',
      'Formato: de 3 a 6 tópicos em lista markdown. Cada tópico começa com o ponto a estudar em **negrito** (por exemplo, **concordância do verbo com o sujeito**), dá um exemplo tirado dos erros dele (o errado e o certo, em inglês) e diz em uma frase o que praticar.',
      'Agrupe erros do mesmo tipo em um tópico só, e comece pelo que mais se repete. Vocabulário e chunks a reforçar entram em um tópico próprio.',
      'Termine com uma linha iniciada por "Próximo passo:" com uma ação concreta e curta para a próxima sessão.',
      'No máximo 180 palavras. Sem introdução e sem elogios genéricos.',
    ].join('\n'),
    user: describeDigest(digest),
  };
}

/**
 * Gera o resumo "o que estudar" da sessão e o guarda nela. Sem nada a reforçar no
 * dia, não consulta a IA: devolve texto vazio.
 */
export async function generateStudySummary(sessionId: string, injected?: AIProvider): Promise<string> {
  const digest = await loadDayDigest(sessionId);
  if (!digest) throw new AIError('Sessão não encontrada.');
  if (isDigestEmpty(digest)) return '';

  const provider = injected ?? (await createProvider((await getSettings()).ai));
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');

  const summary = (await provider.complete(buildSummaryPrompt(digest))).trim();
  if (!summary) throw new AIError('A IA respondeu sem texto.');
  await db.sessions.update(sessionId, { studySummary: summary, studySummaryAt: nowISO() });
  return summary;
}
