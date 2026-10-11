import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type BackupFile, parseBackup } from '../data/backup';
import type { AudioStore } from './audio';
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
const BUCKET = 'recordings';
/** Quantos arquivos a listagem do Storage devolve por página. */
const PAGE = 1000;
const UNIQUE_VIOLATION = '23505';

/** Os dados do usuário ficam numa única linha de `user_data`, protegida por RLS. */
export function createSupabaseStore(supabase: SupabaseClient, userId: string): CloudStore {
  return {
    async load() {
      const { data, error } = await supabase.from(TABLE).select('data, version').eq('user_id', userId).maybeSingle();
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

/**
 * Os áudios das falas no Supabase Storage: bucket privado, um arquivo por fala em
 * `<usuário>/<id da fala>`. As políticas do bucket (supabase/schema.sql) deixam cada
 * conta ler e gravar só a própria pasta.
 */
export function createSupabaseAudioStore(supabase: SupabaseClient, userId: string): AudioStore {
  const bucket = () => supabase.storage.from(BUCKET);
  const path = (id: string): string => `${userId}/${id}`;
  return {
    async list() {
      const out: { id: string; createdAt: string }[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await bucket().list(userId, { limit: PAGE, offset });
        if (error) throw new CloudError(error.message);
        // O Storage cria um arquivo oculto para marcar a pasta.
        for (const file of data)
          if (!file.name.startsWith('.')) out.push({ id: file.name, createdAt: file.created_at ?? new Date(0).toISOString() });
        if (data.length < PAGE) return out;
      }
    },
    async upload(id, blob) {
      const { error } = await bucket().upload(path(id), blob, { upsert: true, contentType: blob.type || 'audio/webm' });
      if (error) throw new CloudError(error.message);
    },
    async download(id) {
      const { data, error } = await bucket().download(path(id));
      if (error) throw new CloudError(error.message);
      return data;
    },
    async remove(ids) {
      const { error } = await bucket().remove(ids.map(path));
      if (error) throw new CloudError(error.message);
    },
  };
}
