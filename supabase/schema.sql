-- English Study System (antigo Deepstash English): armazenamento na nuvem.
-- Rode uma vez no SQL Editor do seu projeto Supabase.
--
-- Cada usuário tem uma única linha com todos os seus dados de estudo. As políticas
-- abaixo (RLS) garantem que cada conta só lê e grava a própria linha, por isso a
-- chave pública do projeto pode ficar no site sem expor os dados de ninguém.

create table if not exists public.user_data (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  -- Sobe 1 a cada gravação. O app só grava se a versão ainda for a que ele leu,
  -- o que impede dois navegadores de sobrescreverem um ao outro sem aviso.
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
create policy "user_data_select_own" on public.user_data
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_data_insert_own" on public.user_data;
create policy "user_data_insert_own" on public.user_data
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_data_update_own" on public.user_data;
create policy "user_data_update_own" on public.user_data
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Áudios das falas (leitura em voz alta, retell, fala do ciclo).
-- Bucket privado: cada arquivo fica em "<id do usuário>/<id da fala>", e as políticas
-- abaixo deixam cada conta ler, gravar e apagar só a própria pasta.
-- Pode rodar este arquivo de novo num projeto que já tinha a tabela: nada é duplicado.

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

drop policy if exists "recordings_select_own" on storage.objects;
create policy "recordings_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recordings_insert_own" on storage.objects;
create policy "recordings_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recordings_update_own" on storage.objects;
create policy "recordings_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recordings_delete_own" on storage.objects;
create policy "recordings_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
