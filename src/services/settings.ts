import { db } from '../data/db';
import { startOfWeek, today } from '../domain/dates';
import type { AISettings, ISODate, ThemePref, UserSettings } from '../domain/types';

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'settings',
  theme: 'system',
  cycleStartDate: null,
  ai: { provider: 'none', baseUrl: '', model: '', apiKey: '' },
  lastBackupAt: null,
};

export async function getSettings(): Promise<UserSettings> {
  const stored = await db.settings.get('settings');
  return stored ? { ...DEFAULT_SETTINGS, ...stored, ai: { ...DEFAULT_SETTINGS.ai, ...stored.ai } } : DEFAULT_SETTINGS;
}

async function patchSettings(patch: Partial<Omit<UserSettings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ ...(await getSettings()), ...patch });
  });
}

export function setTheme(theme: ThemePref): Promise<void> {
  return patchSettings({ theme });
}

export function setAISettings(ai: AISettings): Promise<void> {
  return patchSettings({ ai });
}

/** Recomeça a contagem das 4 semanas na semana de `date`. O histórico não é tocado. */
export function restartCycle(date: ISODate = today()): Promise<void> {
  return patchSettings({ cycleStartDate: startOfWeek(date) });
}

export function markBackupDone(at: string): Promise<void> {
  return patchSettings({ lastBackupAt: at });
}
