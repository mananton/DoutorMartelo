create table if not exists public.obras_sync (
  obra_id text primary key,
  local_id text,
  ativa text,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ferias_sync (
  source_key text primary key,
  nome text not null,
  data_admissao date,
  dias_total integer not null default 0,
  ano_ref_inicio date,
  ano_ref_fim date,
  dias_usados integer not null default 0,
  dias_disponiveis integer not null default 0,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ferias_sync_nome on public.ferias_sync(nome);

create table if not exists public.viagens_sync (
  source_key text primary key,
  data date,
  dia_sem integer not null default 0,
  v_padrao numeric default 0,
  v_real numeric,
  v_efetivas numeric default 0,
  viatura text,
  obra text,
  custo_via numeric default 0,
  custo_dia numeric default 0,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_viagens_sync_data on public.viagens_sync(data);
create index if not exists idx_viagens_sync_obra on public.viagens_sync(obra);

create table if not exists public.legacy_materiais_sync (
  source_key text primary key,
  data date,
  obra text,
  fase text,
  material text,
  unidade text,
  quantidade numeric default 0,
  custo_unit numeric default 0,
  custo_total_sem_iva numeric default 0,
  iva numeric default 0,
  custo_total_com_iva numeric default 0,
  custo_total numeric default 0,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_legacy_materiais_sync_data on public.legacy_materiais_sync(data);
create index if not exists idx_legacy_materiais_sync_obra on public.legacy_materiais_sync(obra);

notify pgrst, 'reload schema';
