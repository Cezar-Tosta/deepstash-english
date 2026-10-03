import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type BackupFile, parseBackup } from '../data/backup';
import { CloudError, type CloudStore } from './cloudStore';

const URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** Sem as duas variáveis no build, o app funciona como antes: só neste navegador, sem login. */
export const cloudEnabled = URL !== '' && KEY !== '';

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  client ??= createClient(URL, KEY);
  return client;
}

const TABLE = 'user_data';
const UNIQUE_VIOLATION = '23505';

/** Os dados do usuário ficam numa única linha de `user_data`, protegida por RLS. */
export function createSupabaseStore(supabase: SupabaseClient, userId: string): CloudStore {
  return {
    async load() {
      const { data, error } = await supabase
        .from(TABLE)
        .select('data, version')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new CloudError(error.message);
      if (!data) return null;
      try {
        return {
          payload: parseBackup(JSON.stringify(data['data'])),
          version: Number(data['version']),
        };
      } catch {
        throw new CloudError('Os dados guardados na nuvem estão em um formato que este app não reconhece.');
      }
    },

    async save(payload: BackupFile, expectedVersion: number) {
      if (expectedVersion === 0) {
        const { error } = await supabase.from(TABLE).insert({ user_id: userId, data: payload, version: 1 });
        if (error?.code === UNIQUE_VIOLATION) return null;
        if (error) throw new CloudError(error.message);
        return 1;
      }
      const next = expectedVersion + 1;
      const { data, error } = await supabase
        .from(TABLE)
        .update({ data: payload, version: next, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('version', expectedVersion)
        .select('version');
      if (error) throw new CloudError(error.message);
      // Nenhuma linha alterada: a versão na nuvem já não é a que este navegador conhecia.
      return data.length === 0 ? null : next;
    },
  };
}
