alter table if exists public.pessoal_efetivo
  add column if not exists foto_url text;

notify pgrst, 'reload schema';
