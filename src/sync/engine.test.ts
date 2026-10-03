import { describe, expect, it } from 'vitest';
import type { BackupFile } from '../data/backup';
import type { CloudSnapshot, CloudStore } from './cloudStore';
import { type LocalAdapter, type MetaStore, type SyncMeta, SyncEngine } from './engine';

function payload(ideas: string[]): BackupFile {
  return {
    app: 'deepstash-english',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: null,
    data: {
      sessions: ideas.length ? [{ id: 's1' }] : [],
      ideas: ideas.map((id) => ({ id })),
      cards: [],
      vocab: [],
      chunks: [],
      reviews: [],
      speaking: [],
      reflections: [],
      weeklyReviews: [],
      writings: [],
      aiFeedback: [],
      bookNotes: [],
      practiceStats: [],
    },
  };
}

/** A nuvem compartilhada entre os "navegadores" do teste. */
class FakeCloud implements CloudStore {
  snapshot: CloudSnapshot | null = null;

  async load() {
    return this.snapshot;
  }

  async save(data: BackupFile, expectedVersion: number) {
    if ((this.snapshot?.version ?? 0) !== expectedVersion) return null;
    this.snapshot = { payload: data, version: expectedVersion + 1 };
    return this.snapshot.version;
  }
}

/** Um navegador: seu banco local e o que ele lembra da última sincronização. */
function browser(cloud: FakeCloud, initial: string[] = []) {
  let ideas = initial;
  let meta: SyncMeta | null = null;
  const local: LocalAdapter = {
    export: async () => payload(ideas),
    restore: async (p) => {
      ideas = p.data.ideas.map((i) => String(i['id']));
    },
    isEmpty: async () => ideas.length === 0,
  };
  const metaStore: MetaStore = { get: () => meta, set: (m) => (meta = m) };
  return {
    engine: new SyncEngine('user-1', cloud, local, metaStore),
    get ideas() {
      return ideas;
    },
    edit(next: string[]) {
      ideas = next;
    },
  };
}

describe('sincronização com a nuvem', () => {
  it('primeiro uso: envia os dados que já estavam no navegador', async () => {
    const cloud = new FakeCloud();
    const pc = browser(cloud, ['a']);

    expect(await pc.engine.reconcile()).toBe('synced');
    expect(cloud.snapshot?.version).toBe(1);
    expect(cloud.snapshot?.payload.data.ideas).toEqual([{ id: 'a' }]);
  });

  it('não cria nada na nuvem enquanto não houver o que guardar', async () => {
    const cloud = new FakeCloud();
    expect(await browser(cloud).engine.reconcile()).toBe('synced');
    expect(cloud.snapshot).toBeNull();
  });

  it('um navegador novo recebe o que foi estudado em outro lugar', async () => {
    const cloud = new FakeCloud();
    await browser(cloud, ['a', 'b']).engine.reconcile();

    const work = browser(cloud);
    expect(await work.engine.reconcile()).toBe('synced');
    expect(work.ideas).toEqual(['a', 'b']);
  });

  it('envia cada mudança local e não reenvia quando nada mudou', async () => {
    const cloud = new FakeCloud();
    const pc = browser(cloud, ['a']);
    await pc.engine.reconcile();

    expect(await pc.engine.pushIfChanged()).toBe('synced');
    expect(cloud.snapshot?.version).toBe(1);

    pc.edit(['a', 'b']);
    expect(await pc.engine.pushIfChanged()).toBe('synced');
    expect(cloud.snapshot?.version).toBe(2);
  });

  it('ao voltar a um navegador, baixa o que mudou no outro', async () => {
    const cloud = new FakeCloud();
    const home = browser(cloud, ['a']);
    await home.engine.reconcile();
    const work = browser(cloud);
    await work.engine.reconcile();

    work.edit(['a', 'b']);
    await work.engine.pushIfChanged();

    expect(await home.engine.reconcile()).toBe('synced');
    expect(home.ideas).toEqual(['a', 'b']);
  });

  it('dois navegadores mudaram: não sobrescreve nenhum, pede a decisão', async () => {
    const cloud = new FakeCloud();
    const home = browser(cloud, ['a']);
    await home.engine.reconcile();
    const work = browser(cloud);
    await work.engine.reconcile();

    work.edit(['a', 'trabalho']);
    await work.engine.pushIfChanged();
    home.edit(['a', 'casa']);

    expect(await home.engine.pushIfChanged()).toBe('choose');
    expect(home.ideas).toEqual(['a', 'casa']);
    expect(cloud.snapshot?.payload.data.ideas).toEqual([{ id: 'a' }, { id: 'trabalho' }]);
  });

  it('a decisão "nuvem" traz os dados da nuvem; "este navegador" envia os locais', async () => {
    const cloud = new FakeCloud();
    await browser(cloud, ['nuvem']).engine.reconcile();

    const keepCloud = browser(cloud, ['local']);
    expect(await keepCloud.engine.reconcile()).toBe('choose');
    expect(await keepCloud.engine.resolve('cloud')).toBe('synced');
    expect(keepCloud.ideas).toEqual(['nuvem']);

    const keepLocal = browser(cloud, ['local']);
    expect(await keepLocal.engine.reconcile()).toBe('choose');
    expect(await keepLocal.engine.resolve('local')).toBe('synced');
    expect(cloud.snapshot?.payload.data.ideas).toEqual([{ id: 'local' }]);
  });

  it('dados locais iguais aos da nuvem são adotados sem perguntar', async () => {
    const cloud = new FakeCloud();
    await browser(cloud, ['a']).engine.reconcile();
    expect(await browser(cloud, ['a']).engine.reconcile()).toBe('synced');
    expect(cloud.snapshot?.version).toBe(1);
  });
});
