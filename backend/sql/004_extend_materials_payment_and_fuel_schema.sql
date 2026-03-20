alter table if exists public.faturas
  add column if not exists id_compromisso text,
  add column if not exists paga boolean default false,
  add column if not exists data_pagamento date;

alter table if exists public.faturas_itens
  add column if not exists uso_combustivel text,
  add column if not exists matricula text;

alter table if exists public.afetacoes_obra
  add column if not exists uso_combustivel text;

alter table if exists public.materiais_mov
  add column if not exists uso_combustivel text,
  add column if not exists matricula text;

notify pgrst, 'reload schema';
