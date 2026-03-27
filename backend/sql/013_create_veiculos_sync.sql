-- Cria tabela de sincronização da aba VEICULOS
-- Permite que o dashboard leia nome do veículo + matrícula diretamente do Supabase

create table if not exists public.veiculos_sync (
  matricula text primary key,
  veiculo   text not null default '',
  sheet_row_num integer
);

notify pgrst, 'reload schema';
