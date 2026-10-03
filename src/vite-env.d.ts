/** Versão do package.json, injetada pelo Vite no build. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** URL do projeto Supabase. Sem ela o app funciona só neste navegador. */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave pública (anon / publishable) do projeto Supabase. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
