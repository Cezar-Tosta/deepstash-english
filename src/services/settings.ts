import { db } from '../data/db';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import type { AISettings, ThemePref, UserSettings } from '../domain/types';

export { DEFAULT_SETTINGS };

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

export function markBackupDone(at: string): Promise<void> {
  return patchSettings({ lastBackupAt: at });
}
