create table if not exists public.colaboradores_sync (
  nome text primary key,
  funcao text,
  ativo boolean not null default true,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.registos_sync (
  id_registo text primary key,
  data_registo date,
  nome text not null,
  funcao text,
  obra text,
  fase text,
  horas numeric default 0,
  atraso_min numeric default 0,
  falta boolean not null default false,
  motivo text,
  eur_h numeric default 0,
  observacao text,
  dispensado boolean not null default false,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_registos_sync_data_registo on public.registos_sync(data_registo);
create index if not exists idx_registos_sync_obra on public.registos_sync(obra);

create table if not exists public.deslocacoes_sync (
  id_viagem text primary key,
  data date,
  obra_destino text,
  destino text,
  veiculo text,
  motorista text,
  origem text,
  quantidade_viagens integer not null default 1,
  custo_total numeric default 0,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_deslocacoes_sync_data on public.deslocacoes_sync(data);
create index if not exists idx_deslocacoes_sync_obra on public.deslocacoes_sync(obra_destino);

create table if not exists public.legacy_mao_obra_sync (
  source_key text primary key,
  data date,
  obra text,
  fase text,
  horas numeric default 0,
  custo_dia numeric default 0,
  origem text,
  nota text,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_legacy_mao_obra_sync_data on public.legacy_mao_obra_sync(data);
create index if not exists idx_legacy_mao_obra_sync_obra on public.legacy_mao_obra_sync(obra);

notify pgrst, 'reload schema';
