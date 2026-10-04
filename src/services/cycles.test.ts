import { describe, expect, it } from 'vitest';
import { exportBackup, parseBackup, restoreBackup } from '../data/backup';
import { db } from '../data/db';
import { getCycleInfo, getCycleStarts, listCycles, removeCycle, restartPhases, startCycle } from './cycles';
import { resetAll, resetWeek } from './maintenance';
import { addIdea, recordSpeaking, startSession, updateIdea } from './sessions';
import { loadWeekBundle } from './weekly';

// 06/10/2026 é uma terça-feira; 15/10/2026, a quinta-feira da semana seguinte.
const TUESDAY = '2026-10-06';
const THURSDAY = '2026-10-15';

describe('ciclos de 7 dias com início escolhido', () => {
  it('ciclo iniciado na terça: sessão até sábado, revisão no domingo e na segunda', async () => {
    await startCycle(TUESDAY);
    expect(await getCycleInfo(TUESDAY)).toMatchObject({ day: 1, rest: false, week: 1 });
    expect(await getCycleInfo('2026-10-10')).toMatchObject({ day: 5, rest: false });
    expect(await getCycleInfo('2026-10-11')).toMatchObject({ day: 6, rest: true });
    expect(await getCycleInfo('2026-10-12')).toMatchObject({ day: 7, rest: true });
  });

  it('terça e quarta entre um ciclo e outro: nenhum ciclo em andamento, e a referência é o último', async () => {
    await startCycle(TUESDAY);
    await startCycle(THURSDAY);
    const gap = await getCycleInfo('2026-10-13');
    expect(gap.period).toBeNull();
    expect(gap.day).toBeNull();
    expect(gap.rest).toBe(false);
    expect(gap.reference).toMatchObject({ start: TUESDAY, end: '2026-10-12' });
    expect(await getCycleInfo(THURSDAY)).toMatchObject({ day: 1, week: 2 });
  });

  it('o ciclo pode ser marcado para uma data futura: até lá, a sessão do dia abre outro ciclo', async () => {
    await startCycle(THURSDAY);
    expect((await getCycleInfo('2026-10-14')).period).toBeNull();
    await startSession(THURSDAY);
    expect(await getCycleStarts()).toEqual([THURSDAY]);
  });

  it('não aceita dois ciclos começando na mesma data', async () => {
    await startCycle(TUESDAY);
    await expect(startCycle(TUESDAY)).rejects.toThrow('Já existe um ciclo');
  });

  it('remover um ciclo tira os dias do histórico, sem apagar os estudos', async () => {
    await startSession(TUESDAY);
    await startCycle(THURSDAY);
    await removeCycle(TUESDAY);
    expect((await listCycles()).map((c) => c.start)).toEqual([THURSDAY]);
    expect(await db.sessions.count()).toBe(1);
  });

  it('o fechamento e o reset valem para os 7 dias do ciclo, não para a semana de calendário', async () => {
    const first = await startSession(TUESDAY);
    const a = await addIdea(first.id, { title: 'A' });
    await db.sessions.update(first.id, { ideaOfDayId: a.id });
    // Segunda 12/10 é o dia 7 do ciclo; terça 13/10 fica fora; quinta 15/10 abre o segundo ciclo.
    await recordSpeaking({ kind: 'weekly', sessionId: null, ideaId: a.id, date: '2026-10-12', durationSec: 60, targetSec: 180 });
    const second = await startSession(THURSDAY);
    const b = await addIdea(second.id, { title: 'B' });
    await updateIdea(b.id, { mainIdea: 'x' });
    await db.sessions.update(second.id, { ideaOfDayId: b.id });

    const bundle = await loadWeekBundle(TUESDAY);
    expect(bundle.weekEnd).toBe('2026-10-12');
    expect(bundle.ideas.map((i) => i.idea.title)).toEqual(['A']);
    expect(bundle.speaking).toHaveLength(1);

    await resetWeek(TUESDAY);
    expect((await db.ideas.toArray()).map((i) => i.title)).toEqual(['B']);
    expect(await db.speaking.count()).toBe(0);
    // O ciclo continua na lista, vazio, para ser refeito.
    expect(await getCycleStarts()).toEqual([TUESDAY, THURSDAY]);
  });

  it('voltar para a fase 1 vale a partir do ciclo em andamento', async () => {
    await startCycle('2026-09-28');
    await startCycle(TUESDAY);
    expect((await getCycleInfo('2026-10-08')).week).toBe(2);
    await restartPhases('2026-10-08');
    expect((await getCycleInfo('2026-10-08')).week).toBe(1);
    await startCycle(THURSDAY);
    expect((await getCycleInfo(THURSDAY)).week).toBe(2);
  });

  it('os ciclos vão no backup e voltam na restauração; resetar tudo zera a lista', async () => {
    await startSession(TUESDAY);
    await startCycle(THURSDAY);
    const file = JSON.stringify(await exportBackup());

    await resetAll();
    expect(await getCycleStarts()).toEqual([]);

    await restoreBackup(parseBackup(file));
    expect(await getCycleStarts()).toEqual([TUESDAY, THURSDAY]);
  });
});
