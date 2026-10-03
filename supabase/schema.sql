-- Deepstash English: armazenamento na nuvem.
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
