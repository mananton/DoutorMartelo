alter table if exists public.pessoal_efetivo
  add column if not exists sheet_row_num integer;

alter table if exists public.materiais_cad
  alter column fornecedor drop not null,
  alter column descricao_original drop not null;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_atual'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_atual'
      and column_name = 'id_item'
  ) then
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'stock_atual_backup_20260326'
    ) then
      execute 'alter table public.stock_atual rename to stock_atual_backup_20260326';
    else
      execute 'drop table public.stock_atual';
    end if;
  end if;
end $$;

create table if not exists public.stock_atual (
  id_item text primary key,
  item_oficial text,
  material text,
  unidade text,
  stock_atual numeric default 0,
  custo_medio_atual numeric default 0,
  valor_stock numeric default 0,
  sheet_row_num integer,
  updated_at timestamptz default now()
);

alter table if exists public.stock_atual
  add column if not exists item_oficial text,
  add column if not exists material text,
  add column if not exists unidade text,
  add column if not exists stock_atual numeric default 0,
  add column if not exists custo_medio_atual numeric default 0,
  add column if not exists valor_stock numeric default 0,
  add column if not exists sheet_row_num integer,
  add column if not exists updated_at timestamptz default now();

do $$
declare
  current_pk_name text;
  current_pk_columns text[];
begin
  select
    tc.constraint_name,
    array_agg(kcu.column_name order by kcu.ordinal_position)
  into current_pk_name, current_pk_columns
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_schema = kcu.constraint_schema
   and tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
   and tc.table_name = kcu.table_name
  where tc.table_schema = 'public'
    and tc.table_name = 'stock_atual'
    and tc.constraint_type = 'PRIMARY KEY'
  group by tc.constraint_name;

  if current_pk_name is not null and current_pk_columns = array['id_item'] then
    null;
  else
    if current_pk_name is not null then
      execute format('alter table public.stock_atual drop constraint %I', current_pk_name);
    end if;

    alter table public.stock_atual add constraint stock_atual_pkey primary key (id_item);
  end if;
exception
  when undefined_table then
    null;
end $$;

notify pgrst, 'reload schema';
