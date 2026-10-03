import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { clearLocalData, exportBackup, exportForCloud, parseBackup, restoreBackup } from './backup';
import { db } from './db';

const AI = { provider: 'groq' as const, baseUrl: '', model: 'meu-modelo', apiKey: 'gsk_segredo', visionModel: 'minha-visao' };

async function configure() {
  await db.settings.put({ ...DEFAULT_SETTINGS, theme: 'dark', cycleStartDate: '2026-09-28', ai: AI });
}

describe('configuração de IA entre navegadores', () => {
  it('o arquivo de backup exportado nunca leva a chave de API', async () => {
    await configure();
    const file = await exportBackup();
    expect(file.settings).toEqual({ theme: 'dark', cycleStartDate: '2026-09-28' });
    expect(JSON.stringify(file)).not.toContain('gsk_segredo');
  });

  it('a cópia da conta leva provedor, modelos e chave', async () => {
    await configure();
    expect((await exportForCloud()).settings?.ai).toEqual(AI);
  });

  it('outro navegador recebe a configuração de IA ao baixar os dados da conta', async () => {
    await configure();
    const cloud = parseBackup(JSON.stringify(await exportForCloud()));

    // Navegador novo: nada salvo ainda.
    await clearLocalData();
    expect(await db.settings.get('settings')).toBeUndefined();

    await restoreBackup(cloud);
    expect(await db.settings.get('settings')).toMatchObject({ theme: 'dark', ai: AI });
  });

  it('importar um arquivo de backup (sem IA) mantém a IA já configurada no navegador', async () => {
    await configure();
    const file = parseBackup(JSON.stringify(await exportBackup()));
    await db.settings.update('settings', { ai: { ...AI, apiKey: 'gsk_local' } });

    await restoreBackup(file);
    expect((await db.settings.get('settings'))?.ai.apiKey).toBe('gsk_local');
  });

  it('ignora configuração de IA malformada', () => {
    const raw = { app: 'deepstash-english', version: 2, exportedAt: '', data: {}, settings: { theme: 'light', cycleStartDate: null, ai: { provider: 'inventado' } } };
    expect(parseBackup(JSON.stringify(raw)).settings).toEqual({ theme: 'light', cycleStartDate: null });
  });
});

describe('o que conta como "nada a enviar"', () => {
  it('sem sessão e sem IA, o navegador está vazio', async () => {
    const { isLocalEmpty } = await import('./backup');
    expect(await isLocalEmpty()).toBe(true);
    await db.settings.put({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect(await isLocalEmpty()).toBe(true);
  });

  it('uma IA configurada antes da primeira sessão já precisa ser enviada', async () => {
    const { isLocalEmpty } = await import('./backup');
    await configure();
    expect(await isLocalEmpty()).toBe(false);
  });
});
