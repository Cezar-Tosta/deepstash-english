import { describe, expect, it } from 'vitest';
import type { BackupFile } from '../data/backup';
import type { AISettings } from '../domain/types';
import type { CloudSnapshot, CloudStore } from './cloudStore';
import { type LocalAdapter, type MetaStore, type SyncMeta, SyncEngine } from './engine';

const GROQ: AISettings = { provider: 'groq', baseUrl: '', model: 'llama', apiKey: 'gsk-secret', visionModel: '' };
const NO_AI: AISettings = { provider: 'none', baseUrl: '', model: '', apiKey: '', visionModel: '' };

function payload(ideas: string[], ai?: AISettings): BackupFile {
  return {
    app: 'deepstash-english',
    version: 2,
    exportedAt: '2026-10-05T00:00:00.000Z',
    settings: ai ? { theme: 'system', cycleStartDate: null, ai } : null,
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
      ideaChats: [],
      verbs: [],
      translations: [],
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
function browser(cloud: FakeCloud, initial: string[] = [], initialAI?: AISettings) {
  let ideas = initial;
  let ai = initialAI;
  let meta: SyncMeta | null = null;
  const configured = (x: AISettings | undefined): x is AISettings => x !== undefined && x.provider !== 'none';
  const local: LocalAdapter = {
    export: async () => payload(ideas, ai),
    restore: async (p) => {
      ideas = p.data.ideas.map((i) => String(i['id']));
      if (p.settings?.ai) ai = p.settings.ai;
    },
    isEmpty: async () => ideas.length === 0 && !configured(ai),
    adoptAI: async (remote) => {
      const theirs = remote.settings?.ai;
      if (configured(ai) || !configured(theirs)) return false;
      ai = theirs;
      return true;
    },
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
    get ai() {
      return ai;
    },
    setAI(next: AISettings) {
      ai = next;
    },
    /** Simula um navegador que sincronizou antes de a IA fazer parte da cópia. */
    forgetAIFlag() {
      if (meta) meta = { userId: meta.userId, version: meta.version, fingerprint: 'antiga' };
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

describe('a IA configurada em um navegador chega aos outros', () => {
  it('celular novo, sem dados: recebe os estudos e a IA', async () => {
    const cloud = new FakeCloud();
    const pc = browser(cloud, ['a'], GROQ);
    await pc.engine.reconcile();

    const phone = browser(cloud);
    expect(await phone.engine.reconcile()).toBe('synced');
    expect(phone.ai).toEqual(GROQ);
    expect(phone.ideas).toEqual(['a']);
  });

  it('celular que já sincronizava sem IA: adota a da nuvem e não a apaga ao enviar', async () => {
    const cloud = new FakeCloud();
    const pc = browser(cloud, ['a'], NO_AI);
    const phone = browser(cloud, [], NO_AI);
    await pc.engine.reconcile();
    await phone.engine.reconcile();

    pc.setAI(GROQ);
    await pc.engine.pushIfChanged();

    expect(await phone.engine.reconcile()).toBe('synced');
    expect(phone.ai).toEqual(GROQ);
    expect(cloud.snapshot?.payload.settings?.ai).toEqual(GROQ);
  });

  it('celular com cópia antiga, sem IA, que edita algo: a chave da nuvem não é apagada', async () => {
    const cloud = new FakeCloud();
    const pc = browser(cloud, ['a'], GROQ);
    await pc.engine.reconcile();

    // O celular baixou os estudos com uma versão antiga do app, que ignorava a IA.
    const phone = browser(cloud, [], NO_AI);
    await phone.engine.resolve('cloud');
    phone.setAI(NO_AI);
    phone.forgetAIFlag();

    phone.edit(['a', 'b']);
    expect(await phone.engine.pushIfChanged()).toBe('synced');
    expect(phone.ai).toEqual(GROQ);
    expect(cloud.snapshot?.payload.settings?.ai).toEqual(GROQ);
    expect(cloud.snapshot?.payload.data.ideas).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('conflito resolvido a favor do celular: a IA da nuvem é mantida', async () => {
    const cloud = new FakeCloud();
    const pc = browser(cloud, ['a'], GROQ);
    await pc.engine.reconcile();
    const phone = browser(cloud, ['z'], NO_AI);

    expect(await phone.engine.reconcile()).toBe('choose');
    expect(await phone.engine.resolve('local')).toBe('synced');
    expect(cloud.snapshot?.payload.settings?.ai).toEqual(GROQ);
  });

  it('remover a IA de propósito, num navegador que a tinha, vale para todos', async () => {
    const cloud = new FakeCloud();
    const pc = browser(cloud, ['a'], GROQ);
    const phone = browser(cloud);
    await pc.engine.reconcile();
    await phone.engine.reconcile();

    pc.setAI(NO_AI);
    expect(await pc.engine.pushIfChanged()).toBe('synced');
    expect(pc.ai).toEqual(NO_AI);
    expect(cloud.snapshot?.payload.settings?.ai).toEqual(NO_AI);

    expect(await phone.engine.reconcile()).toBe('synced');
    expect(phone.ai).toEqual(NO_AI);
  });
});
