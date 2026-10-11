import { describe, expect, it } from 'vitest';
import type { BackupFile } from '../data/backup';
import { DATA_TABLES } from '../data/db';
import { mergePayloads } from './merge';

type Row = Record<string, unknown>;

function payload(tables: Partial<Record<string, Row[]>>, settings: BackupFile['settings'] = null): BackupFile {
  const data = Object.fromEntries(DATA_TABLES.map((t) => [t, tables[t] ?? []])) as BackupFile['data'];
  return { app: 'deepstash-english', version: 2, exportedAt: '2026-10-11T00:00:00.000Z', settings, data };
}

const ids = (p: BackupFile, table: 'ideas' | 'chunks' | 'reflections') => p.data[table].map((r) => r['id']).sort();
const row = (p: BackupFile, table: 'ideas' | 'chunks' | 'reflections', id: string) => p.data[table].find((r) => r['id'] === id);

describe('mesclagem registro por registro', () => {
  const base = payload({ ideas: [{ id: 'a', title: 'A', mainIdea: '' }] });

  it('textos novos dos dois lados ficam todos', () => {
    const local = payload({
      ideas: [
        { id: 'a', title: 'A', mainIdea: '' },
        { id: 'casa', title: 'Casa' },
      ],
    });
    const remote = payload({
      ideas: [
        { id: 'a', title: 'A', mainIdea: '' },
        { id: 'trabalho', title: 'Trabalho' },
      ],
    });
    const { merged, conflicts } = mergePayloads(base, local, remote);
    expect(ids(merged, 'ideas')).toEqual(['a', 'casa', 'trabalho']);
    expect(conflicts).toBe(0);
  });

  it('o lado que mudou vence; o que ficou igual à base não desfaz a mudança', () => {
    const local = payload({ ideas: [{ id: 'a', title: 'A', mainIdea: 'Sleep matters.' }] });
    const { merged } = mergePayloads(base, local, base);
    expect(row(merged, 'ideas', 'a')).toMatchObject({ mainIdea: 'Sleep matters.' });
    expect(row(mergePayloads(base, base, local).merged, 'ideas', 'a')).toMatchObject({ mainIdea: 'Sleep matters.' });
  });

  it('o mesmo registro mudado em campos diferentes junta as duas mudanças', () => {
    const local = payload({ ideas: [{ id: 'a', title: 'A', mainIdea: 'Sleep matters.' }] });
    const remote = payload({ ideas: [{ id: 'a', title: 'A (revisto)', mainIdea: '' }] });
    const { merged, conflicts } = mergePayloads(base, local, remote);
    expect(row(merged, 'ideas', 'a')).toEqual({ id: 'a', title: 'A (revisto)', mainIdea: 'Sleep matters.' });
    expect(conflicts).toBe(0);
  });

  it('o mesmo campo mudado nos dois lados: vence o registro alterado por último', () => {
    const start = payload({ reflections: [{ id: 'r', userOpinion: '', updatedAt: '2026-10-10T10:00:00.000Z' }] });
    const local = payload({ reflections: [{ id: 'r', userOpinion: 'casa', updatedAt: '2026-10-11T09:00:00.000Z' }] });
    const remote = payload({ reflections: [{ id: 'r', userOpinion: 'trabalho', updatedAt: '2026-10-11T12:00:00.000Z' }] });
    const { merged, conflicts } = mergePayloads(start, local, remote);
    expect(row(merged, 'reflections', 'r')).toMatchObject({ userOpinion: 'trabalho' });
    expect(conflicts).toBe(1);
  });

  it('sem data de alteração, o conflito fica com este navegador', () => {
    const local = payload({ ideas: [{ id: 'a', title: 'casa', mainIdea: '' }] });
    const remote = payload({ ideas: [{ id: 'a', title: 'trabalho', mainIdea: '' }] });
    expect(row(mergePayloads(base, local, remote).merged, 'ideas', 'a')).toMatchObject({ title: 'casa' });
  });

  it('excluir de um lado vale, se o outro não mexeu no registro', () => {
    const local = payload({ ideas: [] });
    expect(ids(mergePayloads(base, local, base).merged, 'ideas')).toEqual([]);
    expect(ids(mergePayloads(base, base, local).merged, 'ideas')).toEqual([]);
  });

  it('excluído de um lado e editado do outro: o editado fica, para não perder trabalho', () => {
    const edited = payload({ ideas: [{ id: 'a', title: 'A', mainIdea: 'Editado.' }] });
    const deleted = payload({ ideas: [] });
    expect(row(mergePayloads(base, deleted, edited).merged, 'ideas', 'a')).toMatchObject({ mainIdea: 'Editado.' });
    expect(row(mergePayloads(base, edited, deleted).merged, 'ideas', 'a')).toMatchObject({ mainIdea: 'Editado.' });
  });

  it('a ordem das chaves nos objetos não conta como mudança', () => {
    const reordered = payload({ ideas: [{ mainIdea: '', title: 'A', id: 'a' }] });
    const { merged, conflicts } = mergePayloads(base, reordered, base);
    expect(conflicts).toBe(0);
    expect(row(merged, 'ideas', 'a')).toMatchObject({ title: 'A' });
  });

  it('os ajustes também são mesclados campo a campo', () => {
    const settings = { theme: 'system', cycleStartDate: null, ai: { provider: 'none', baseUrl: '', model: '', apiKey: '' } } as const;
    const start = payload({}, settings);
    const local = payload({}, { ...settings, theme: 'dark' });
    const remote = payload({}, { ...settings, cycleStartDate: '2026-10-06' });
    expect(mergePayloads(start, local, remote).merged.settings).toMatchObject({ theme: 'dark', cycleStartDate: '2026-10-06' });
  });
});
