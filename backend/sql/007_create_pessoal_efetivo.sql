CREATE TABLE IF NOT EXISTS public.pessoal_efetivo (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL UNIQUE,
    nacionalidade text,
    data_nascimento date,
    morada text,
    telefone text,
    email text,
    foto_url text,
    data_inicio_contrato date,
    data_termino_contrato date,
    carta_conducao text,
    categorias_carta text,
    cam text,
    numero_carta text,
    cartao_cidadao text,
    cartao_residencia text,
    passaporte text,
    visto text,
    certificacoes text,
    ocorrencias text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- RLS
ALTER TABLE public.pessoal_efetivo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.pessoal_efetivo
    FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON public.pessoal_efetivo
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON public.pessoal_efetivo
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON public.pessoal_efetivo
    FOR DELETE USING (true);
