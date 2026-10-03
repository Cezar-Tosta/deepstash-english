import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { newId } from '../domain/ids';
import type { ChatMessage } from '../domain/types';
import { getSettings } from '../services/settings';
import { AIError, type AIProvider, type ChatTurn } from './AIProvider';
import { createProvider } from './feedback';

/** Quantas mensagens anteriores acompanham cada pergunta. Conversas longas não crescem sem limite. */
const HISTORY_LIMIT = 20;
const CARDS_LIMIT = 6000;

export interface IdeaChatContext {
  bookTitle: string;
  ideaTitle: string;
  cardsText: string;
  mainIdea: string;
  opinion: string;
  soWhat: string;
  chunks: string[];
}

export function buildChatSystem(ctx: IdeaChatContext): string {
  return [
    'Você conversa com um brasileiro que estuda inglês lendo ideias de livros (Deepstash). O assunto da conversa é a ideia abaixo.',
    'Seu papel é ajudar a pensar: traga insights, exemplos concretos, conexões com outras áreas, contrapontos e perguntas que aprofundem. Baseie-se no texto dos cards e deixe claro quando algo for conhecimento seu, de fora do texto.',
    'Responda SEMPRE em português do Brasil, inclusive quando ele escrever em inglês e inclusive nas perguntas que você fizer. Palavras e trechos do texto original podem ser citados em inglês, entre aspas, seguidos da tradução.',
    'Se ele escrever em inglês, acrescente no fim uma linha iniciada por "Inglês:" apontando, em português, no máximo dois erros relevantes da mensagem dele (ou nada, se não houver).',
    'Seja direto: até 150 palavras por resposta, a não ser que ele peça mais. Termine, quando fizer sentido, com uma pergunta que o faça avançar.',
    // Só entram as partes que existem para esta ideia.
    ...[
      ctx.bookTitle && `Livro: ${ctx.bookTitle}`,
      `Ideia: ${ctx.ideaTitle}`,
      ctx.cardsText && `Texto dos cards:\n${ctx.cardsText.slice(0, CARDS_LIMIT)}`,
      ctx.mainIdea && `Ideia principal, nas palavras dele: ${ctx.mainIdea}`,
      ctx.opinion && `Opinião que ele escreveu: ${ctx.opinion}`,
      ctx.soWhat && `Ação que ele se propôs: ${ctx.soWhat}`,
      ctx.chunks.length > 0 && `Expressões que ele está aprendendo: ${ctx.chunks.join('; ')}`,
    ].filter(Boolean),
  ].join('\n');
}

/** Junta o que se sabe da ideia para dar contexto à conversa. */
export async function loadChatContext(ideaId: string): Promise<IdeaChatContext | null> {
  const idea = await db.ideas.get(ideaId);
  if (!idea) return null;
  const [cards, reflection, chunks] = await Promise.all([
    db.cards.where('ideaId').equals(ideaId).sortBy('position'),
    db.reflections.where('ideaId').equals(ideaId).first(),
    db.chunks.where('sourceIdeaId').equals(ideaId).toArray(),
  ]);
  return {
    bookTitle: idea.bookTitle,
    ideaTitle: idea.title,
    cardsText: cards
      .map((c) => c.content.trim())
      .filter(Boolean)
      .join('\n\n'),
    mainIdea: idea.mainIdea,
    opinion: reflection?.userOpinion ?? '',
    soWhat: reflection?.soWhat ?? '',
    chunks: chunks.map((c) => c.text),
  };
}

export async function getChat(ideaId: string): Promise<ChatMessage[]> {
  return db.ideaChats.where('ideaId').equals(ideaId).sortBy('createdAt');
}

async function store(ideaId: string, role: ChatMessage['role'], content: string): Promise<void> {
  await db.ideaChats.add({ id: newId(), ideaId, role, content, createdAt: nowISO() });
}

/**
 * Guarda a mensagem do usuário, consulta a IA com o histórico recente e guarda a
 * resposta. Se a IA falhar, a mensagem do usuário fica guardada e o erro sobe, para
 * a tela oferecer "tentar de novo" sem ele redigitar.
 */
export async function sendChatMessage(ideaId: string, text: string, provider?: AIProvider): Promise<void> {
  const content = text.trim();
  if (!content) return;
  const context = await loadChatContext(ideaId);
  if (!context) throw new AIError('Ideia não encontrada.');
  await store(ideaId, 'user', content);
  await answer(ideaId, context, provider);
}

/** Pede de novo a resposta para a última mensagem do usuário, depois de uma falha. */
export async function retryChat(ideaId: string, provider?: AIProvider): Promise<void> {
  const context = await loadChatContext(ideaId);
  if (!context) throw new AIError('Ideia não encontrada.');
  await answer(ideaId, context, provider);
}

async function answer(ideaId: string, context: IdeaChatContext, injected?: AIProvider): Promise<void> {
  const provider = injected ?? (await createProvider((await getSettings()).ai));
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');

  const history = (await getChat(ideaId)).slice(-HISTORY_LIMIT);
  // A conversa enviada precisa começar por uma mensagem do usuário.
  const firstUser = history.findIndex((m) => m.role === 'user');
  const turns: ChatTurn[] = history.slice(Math.max(firstUser, 0)).map((m) => ({ role: m.role, content: m.content }));
  if (turns.at(-1)?.role !== 'user') throw new AIError('Não há mensagem sua esperando resposta.');

  const reply = (await provider.chat(buildChatSystem(context), turns)).trim();
  if (!reply) throw new AIError('A IA respondeu sem texto.');
  await store(ideaId, 'assistant', reply);
}

export async function clearChat(ideaId: string): Promise<void> {
  await db.ideaChats.where('ideaId').equals(ideaId).delete();
}
