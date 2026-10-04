import { liveQuery } from 'dexie';
import { describe, expect, it } from 'vitest';
import { startCycle } from './cycles';
import { loadStatsInput } from './library';
import { deleteSpeaking, listWeekSpeaking, weekContents } from './maintenance';
import { recordSpeaking, startSession } from './sessions';
import { loadSuggestion } from './study';
import { loadWeekBundle } from './weekly';

const DAY = '2026-10-06';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Observa uma consulta como a tela faz, aplica uma mudança e devolve o que a tela viu. */
async function watch<T>(query: () => Promise<T>, pick: (value: T) => unknown, change: () => Promise<unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const subscription = liveQuery(query).subscribe((value) => seen.push(pick(value)));
  await pause(150);
  await change();
  await pause(250);
  subscription.unsubscribe();
  // Uma mesma mudança pode reemitir mais de uma vez; importa o valor antes e o valor depois.
  return [seen[0], seen.at(-1)];
}

// As consultas que dependem do ciclo leem os ajustes antes dos dados. Se essa leitura
// sair da zona do Dexie, a tela mostra o valor certo uma vez e nunca mais se atualiza.
describe('telas por ciclo continuam reagindo às mudanças do banco', () => {
  const speak = () => recordSpeaking({ kind: 'weekly', sessionId: null, ideaId: null, date: DAY, durationSec: 60, targetSec: 180 });

  it('falas do ciclo: a lista esvazia ao excluir', async () => {
    await startSession(DAY);
    const id = String(await speak());
    expect(
      await watch(
        () => listWeekSpeaking(DAY),
        (items) => items.length,
        () => deleteSpeaking(id),
      ),
    ).toEqual([1, 0]);
  });

  it('fechamento, conteúdo do ciclo e estatísticas: refletem uma fala nova', async () => {
    await startSession(DAY);
    expect(
      await watch(
        () => loadWeekBundle(DAY),
        (b) => b.speaking.length,
        speak,
      ),
    ).toEqual([0, 1]);
    expect(
      await watch(
        () => weekContents(DAY),
        (c) => c.speaking,
        speak,
      ),
    ).toEqual([1, 2]);
    expect(await watch(loadStatsInput, (input) => input.speaking.length, speak)).toEqual([2, 3]);
  });

  it('sugestão do dia: muda quando o ciclo começa', async () => {
    const first = (plan: Awaited<ReturnType<typeof loadSuggestion>>) => plan[0]?.title;
    expect(
      await watch(
        () => loadSuggestion(DAY),
        first,
        () => startCycle(DAY),
      ),
    ).toEqual(['Comece um novo ciclo com a sessão de hoje', 'Faça a sessão de hoje']);
  });
});
