# Mapa Concreto Sheets -> Futuras Tabelas

Estado: preparacao apenas
Ultima revisao: 2026-03-13

## Objetivo
Ter um mapa muito simples de:
- folha atual
- futura tabela
- campos principais

Nota:
- isto ainda nao e implementacao
- e apenas o desenho base para a futura passagem parcial

## Folhas centrais para a primeira fase

| Folha atual | Futura tabela | Campos principais |
|---|---|---|
| `REGISTOS_POR_DIA` | `registos_diarios` | `id_registo`, `data_registo`, `nome`, `funcao`, `obra`, `fase`, `horas`, `atraso_min`, `falta`, `motivo`, `eur_h`, `observacao`, `dispensado` |
| `OBRAS` | `obras` | `obra_id`, `local_id`, `ativa` |
| `COLABORADORES` | `colaboradores` | `nome`, `funcao`, `eur_h`, `ativo` |
| `REGISTO_DESLOCACOES` | `deslocacoes` | `id_viagem`, `data`, `obra_destino`, `destino`, `veiculo`, `motorista`, `origem`, `quantidade_viagens`, `custo_total` |
| `FERIAS` | `ferias_plafao` | `nome`, `data_admissao`, `dias_total`, `ano_ref_inicio`, `ano_ref_fim`, `dias_usados`, `dias_disponiveis` |
| `MATERIAIS_MOV` | `materiais_mov` | `id_mov`, `data`, `tipo`, `obra`, `fase`, `fornecedor`, `nif`, `nr_documento`, `material`, `unidade`, `quantidade`, `custo_unit`, `custo_total`, `iva` |
| `LEGACY_MAO_OBRA` | `legacy_mao_obra` | `data`, `obra`, `fase`, `horas`, `custo_dia`, `origem`, `nota` |

## Folhas que podem entrar depois

| Folha atual | Futura tabela | Campos principais |
|---|---|---|
| `VIAGENS_DIARIAS` | `viagens_diarias` | `data`, `dia_sem`, `v_padrao`, `v_real`, `v_efetivas`, `viatura`, `obra`, `custo_via`, `custo_dia` |
| `NAO_REGISTADOS_HIST` | `nao_registados_hist` | `data_ref`, `nome`, `funcao` |
| `MATRIZ_ROTAS` | `matriz_rotas` | `origem`, `destino`, `custo_euro` |

## Regra especial para `LEGACY_MAO_OBRA`

Esta futura tabela deve ser tratada como historico antigo resumido de mao de obra.

Isto quer dizer:
- entra em custos e horas
- pode entrar em comparativas por obra e por fase
- nao deve alimentar equipa, assiduidade ou mapa mensal

## Proposta simples para a futura tabela `legacy_mao_obra`

Campos recomendados:
- `id`
- `data`
- `obra`
- `fase`
- `horas`
- `custo_dia`
- `origem`
- `nota`
- `created_at`

Leitura pratica:
- `id` = identificador tecnico da linha
- `data` = dia do custo antigo
- `obra` = nome/local da obra
- `fase` = fase da obra nesse custo antigo
- `horas` = horas antigas conhecidas
- `custo_dia` = valor desse registo antigo
- `origem` = de onde veio a importacao
- `nota` = campo livre para contexto

Regra importante:
- esta tabela existe para preservar historico de custo
- nao para reconstruir detalhe por trabalhador

## Leitura pratica deste mapa

### O que entra primeiro
Se houver uma primeira fase real, o mais importante e:
- `REGISTOS_POR_DIA`
- `OBRAS`
- `COLABORADORES`
- `REGISTO_DESLOCACOES`
- `FERIAS`
- `MATERIAIS_MOV`

### Porque estas primeiro
Porque sao as folhas que alimentam o dashboard atual de forma mais direta.

## Regra simples para tentativas de envio

Recomendacao pratica para este projeto:

1. tentar enviar logo apos a alteracao
2. se falhar, guardar como pendente
3. voltar a tentar de 10 em 10 minutos
4. fazer ate 6 tentativas automaticas
5. se continuar a falhar, mostrar aviso interno para revisao manual

## Porque escolho esta regra

Porque ela equilibra duas coisas:
- o dashboard fica bastante atualizado
- a operacao nao parte se houver uma falha momentanea

Em linguagem simples:
- tenta logo
- se nao der, nao entra em panico
- volta a tentar durante cerca de 1 hora

## Resposta curta a tua duvida

### Quantas tentativas
- 1 tentativa imediata
- mais 6 tentativas automaticas

### Com que periodicidade
- de 10 em 10 minutos

### Isto e obrigatorio?
- nao
- e apenas a regra que eu recomendo para o teu caso

### Porque nao escolher tentativas infinitas
- porque depois ficas com erros escondidos para sempre
- e deixa de ser claro quando algo precisa mesmo de atencao

### Porque nao escolher tentativas demasiado curtas
- porque aumentava ruido e carga sem grande ganho real
- 10 minutos e um meio-termo simples e facil de gerir
