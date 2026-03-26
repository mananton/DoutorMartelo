alter table if exists public.colaboradores_sync
  add column if not exists eur_h numeric default 0;

notify pgrst, 'reload schema';
