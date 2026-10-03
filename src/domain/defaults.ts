import type { UserSettings } from './types';

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'settings',
  theme: 'system',
  cycleStartDate: null,
  ai: { provider: 'none', baseUrl: '', model: '', apiKey: '' },
  lastBackupAt: null,
};
