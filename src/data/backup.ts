import { DATA_TABLES, type DataTableName, db } from './db';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import type { AISettings, UserSettings } from '../domain/types';
import { migrateV1toV2, type Tables } from './migrations';

export const BACKUP_APP = 'deepstash-english';
export const BACKUP_VERSION = 2;

type Row = Record<string, unknown>;

export interface BackupSettings extends Pick<UserSettings, 'theme' | 'cycleStartDate'> {
  /**
   * Provedor, modelos e chave de API. Só vai na cópia da nuvem, que fica na conta do
   * usuário; o arquivo de backup exportado nunca leva a chave.
   */
  ai?: AISettings;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  settings: BackupSettings | null;
  data: Record<DataTableName, Row[]>;
}

export class BackupError extends Error {
  override readonly name = 'BackupError';
}

/**
 * Tudo o que o usuário produziu. A configuração de IA (com a chave) só entra quando
 * `includeAI` é pedido, o que acontece apenas na sincronização com a conta.
 */
export async function exportBackup(options: { includeAI?: boolean } = {}): Promise<BackupFile> {
  const data = {} as Record<DataTableName, Row[]>;
  for (const name of DATA_TABLES) {
    data[name] = (await db.table(name).toArray()) as Row[];
  }
  const settings = await db.settings.get('settings');
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings
      ? {
          theme: settings.theme,
          cycleStartDate: settings.cycleStartDate,
          ...(options.includeAI ? { ai: settings.ai } : {}),
        }
      : null,
    data,
  };
}

/** A cópia que vai para a conta do usuário: inclui a configuração de IA. */
export function exportForCloud(): Promise<BackupFile> {
  return exportBackup({ includeAI: true });
}

const AI_PROVIDERS: readonly string[] = ['none', 'anthropic', 'groq', 'openai-compatible'];

/** Lê a configuração de IA de uma cópia, se ela existir e tiver a forma esperada. */
function parseAI(raw: unknown): AISettings | null {
  if (!isRecord(raw)) return null;
  const provider = raw['provider'];
  if (typeof provider !== 'string' || !AI_PROVIDERS.includes(provider)) return null;
  const text = (key: string): string => (typeof raw[key] === 'string' ? raw[key] : '');
  return {
    provider: provider as AISettings['provider'],
    baseUrl: text('baseUrl'),
    model: text('model'),
    apiKey: text('apiKey'),
    visionModel: text('visionModel'),
  };
}

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valida a forma do arquivo antes de qualquer escrita. Lança BackupError com o motivo. */
export function parseBackup(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupError('O arquivo não é um JSON válido.');
  }
  if (!isRecord(raw) || raw['app'] !== BACKUP_APP) {
    throw new BackupError('Este arquivo não é um backup do Deepstash English.');
  }
  const version = raw['version'];
  if (typeof version !== 'number' || version > BACKUP_VERSION) {
    throw new BackupError('Backup de uma versão mais nova do app. Atualize o app e tente de novo.');
  }
  const rawData = raw['data'];
  if (!isRecord(rawData)) throw new BackupError('Backup sem dados.');

  const tables: Record<string, unknown> = { ...rawData };
  for (const name of DATA_TABLES) {
    if (!Array.isArray(tables[name] ?? [])) throw new BackupError(`Tabela "${name}" inválida.`);
  }
  // Backups feitos antes de existirem ideias são convertidos na leitura.
  const source = version < 2 ? migrateV1toV2(tables as Tables) : tables;

  const data = {} as Record<DataTableName, Row[]>;
  for (const name of DATA_TABLES) {
    const rows = source[name] ?? [];
    if (!Array.isArray(rows)) throw new BackupError(`Tabela "${name}" inválida.`);
    for (const row of rows) {
      if (!isRecord(row) || typeof row['id'] !== 'string' || row['id'] === '') {
        throw new BackupError(`Há um registro sem identificador em "${name}".`);
      }
    }
    data[name] = rows as Row[];
  }

  const rawSettings = raw['settings'];
  const theme = isRecord(rawSettings) ? rawSettings['theme'] : null;
  const cycleStartDate = isRecord(rawSettings) ? rawSettings['cycleStartDate'] : null;
  const ai = isRecord(rawSettings) ? parseAI(rawSettings['ai']) : null;
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof raw['exportedAt'] === 'string' ? raw['exportedAt'] : '',
    settings:
      theme === 'system' || theme === 'light' || theme === 'dark'
        ? {
            theme,
            cycleStartDate: typeof cycleStartDate === 'string' ? cycleStartDate : null,
            ...(ai ? { ai } : {}),
          }
        : null,
    data,
  };
}

export function backupCounts(backup: BackupFile): { sessions: number; ideas: number; chunks: number } {
  return {
    sessions: backup.data.sessions.length,
    ideas: backup.data.ideas.length,
    chunks: backup.data.chunks.length,
  };
}

/** Substitui todos os dados pelos do backup, numa única transação: ou entra tudo, ou nada. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const tables = [db.settings, ...DATA_TABLES.map((name) => db.table(name))];
  await db.transaction('rw', tables, async () => {
    for (const name of DATA_TABLES) {
      const table = db.table(name);
      await table.clear();
      await table.bulkAdd(backup.data[name]);
    }
    if (backup.settings) {
      // Num navegador novo ainda não há ajustes salvos; parte dos padrões.
      const current = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
      await db.settings.put({ ...current, ...backup.settings });
    }
  });
}

/** Apaga os dados de estudo deste navegador (usado ao sair da conta). */
export async function clearLocalData(): Promise<void> {
  const tables = [db.settings, db.recordings, ...DATA_TABLES.map((name) => db.table(name))];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.clear()));
  });
}

/**
 * Verdadeiro quando este navegador ainda não tem nada que valha enviar: nenhuma
 * sessão de estudo e nenhuma IA configurada. Uma IA configurada antes da primeira
 * sessão já conta, para que a chave chegue à conta e aos outros navegadores.
 */
export async function isLocalEmpty(): Promise<boolean> {
  const settings = await db.settings.get('settings');
  const hasAI = settings !== undefined && settings.ai.provider !== 'none';
  return (await db.sessions.count()) === 0 && !hasAI;
}
