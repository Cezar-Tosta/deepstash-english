type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

function rename(row: Row, from: string, to: string): Row {
  if (!(from in row)) return row;
  const { [from]: value, ...rest } = row;
  return { ...rest, [to]: value };
}

/**
 * Esquema 1 → 2: a unidade de estudo deixa de ser o card e passa a ser a ideia.
 *
 * Cada card antigo vira uma ideia com o mesmo id (assim todas as referências
 * continuam válidas, só mudam de nome) e, se tinha texto, um único card dentro dela.
 * Função pura: é usada tanto pela migração do banco quanto pela importação de
 * backups antigos.
 */
export function migrateV1toV2(tables: Tables): Tables {
  const oldCards = tables['cards'] ?? [];
  const mapAll = (name: string, from: string, to: string): Row[] => (tables[name] ?? []).map((row) => rename(row, from, to));

  return {
    ...tables,
    ideas: oldCards.map((c) => ({
      id: c['id'],
      sessionId: c['sessionId'],
      date: c['date'],
      bookTitle: '',
      title: c['title'] ?? '',
      mainIdea: c['mainIdea'] ?? '',
      category: c['category'] ?? '',
      notes: c['notes'] ?? '',
      createdAt: c['createdAt'],
    })),
    cards: oldCards
      .filter((c) => typeof c['content'] === 'string' && c['content'].trim() !== '')
      .map((c) => ({
        id: `${String(c['id'])}-c1`,
        ideaId: c['id'],
        sessionId: c['sessionId'],
        date: c['date'],
        position: 0,
        content: c['content'],
        createdAt: c['createdAt'],
      })),
    sessions: mapAll('sessions', 'cardOfDayId', 'ideaOfDayId'),
    chunks: mapAll('chunks', 'sourceCardId', 'sourceIdeaId'),
    vocab: mapAll('vocab', 'cardId', 'ideaId'),
    reflections: mapAll('reflections', 'cardId', 'ideaId'),
    speaking: mapAll('speaking', 'cardId', 'ideaId'),
    writings: mapAll('writings', 'cardId', 'ideaId'),
    weeklyReviews: (tables['weeklyReviews'] ?? []).map((row) =>
      rename(rename(row, 'topCardIds', 'topIdeaIds'), 'speakingCardId', 'speakingIdeaId'),
    ),
  };
}
