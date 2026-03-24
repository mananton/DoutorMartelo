create table if not exists public.compromissos_obra (
  id_compromisso text primary key,
  data date not null,
  fornecedor text not null,
  nif text not null,
  tipo_doc text not null,
  doc_origem text not null,
  obra text not null,
  fase text not null,
  descricao text not null,
  valor_sem_iva numeric default 0,
  iva numeric default 0,
  valor_com_iva numeric default 0,
  estado text default 'ABERTO',
  observacoes text,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

notify pgrst, 'reload schema';
