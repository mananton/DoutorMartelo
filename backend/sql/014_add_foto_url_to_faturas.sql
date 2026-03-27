-- Adiciona coluna foto_url à tabela faturas para guardar URL do PDF no Google Drive

alter table if exists public.faturas
  add column if not exists foto_url text;

notify pgrst, 'reload schema';
