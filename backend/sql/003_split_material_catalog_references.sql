alter table if exists public.materiais_cad
  add column if not exists item_oficial text,
  add column if not exists natureza text,
  add column if not exists unidade text,
  add column if not exists observacoes text,
  add column if not exists estado_cadastro text,
  add column if not exists sheet_row_num integer,
  add column if not exists created_at timestamptz default now(),
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
    and tc.table_name = 'materiais_cad'
    and tc.constraint_type = 'PRIMARY KEY'
  group by tc.constraint_name;

  if current_pk_name is not null and current_pk_columns = array['id_item'] then
    null;
  else
    if current_pk_name is not null then
      execute format('alter table public.materiais_cad drop constraint %I', current_pk_name);
    end if;

    alter table public.materiais_cad add constraint materiais_cad_id_item_pkey primary key (id_item);
  end if;
exception
  when undefined_table then
    null;
end $$;

create table if not exists public.materiais_referencias (
  id_referencia text primary key,
  descricao_original text not null,
  id_item text not null references public.materiais_cad(id_item) on delete cascade,
  observacoes text,
  estado_referencia text,
  sheet_row_num integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materiais_cad'
      and column_name = 'descricao_original'
  ) then
    insert into public.materiais_referencias (
      id_referencia,
      descricao_original,
      id_item,
      observacoes,
      estado_referencia,
      sheet_row_num,
      created_at,
      updated_at
    )
    select
      concat('REF-', lpad(row_number() over (order by cad.id_item, cad.descricao_original)::text, 6, '0')),
      cad.descricao_original,
      cad.id_item,
      cad.observacoes,
      coalesce(cad.estado_cadastro, 'ATIVA'),
      cad.sheet_row_num,
      coalesce(cad.created_at, now()),
      coalesce(cad.updated_at, now())
    from public.materiais_cad cad
    where coalesce(btrim(cad.descricao_original), '') <> ''
      and not exists (
        select 1
        from public.materiais_referencias ref
        where lower(btrim(ref.descricao_original)) = lower(btrim(cad.descricao_original))
      );
  end if;
end $$;

notify pgrst, 'reload schema';
