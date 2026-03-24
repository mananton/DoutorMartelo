alter table if exists public.faturas
  add column if not exists tipo_doc text default 'FATURA',
  add column if not exists doc_origem text;

create table if not exists public.notas_credito_itens (
  id_item_nota_credito text primary key,
  id_fatura text not null references public.faturas(id_fatura) on delete cascade,
  fornecedor text,
  nif text,
  nr_documento text,
  doc_origem text,
  data_fatura date,
  descricao_original text not null,
  id_item text,
  item_oficial text,
  unidade text,
  natureza text,
  quantidade numeric default 0,
  custo_unit numeric default 0,
  custo_total_sem_iva numeric default 0,
  iva numeric default 0,
  custo_total_com_iva numeric default 0,
  categoria_nota_credito text not null,
  obra text,
  fase text,
  estado text default 'GUARDADO',
  observacoes text,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

notify pgrst, 'reload schema';
