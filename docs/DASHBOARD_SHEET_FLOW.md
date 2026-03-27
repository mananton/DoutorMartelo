# Dashboard Sheet Flow

Last updated: 2026-03-27

## Objetivo

Documentar, de forma operacional, quais as abas da Google Sheet continuam a ser a origem dos dados da dashboard legacy em `src/`, como entram no espelho/payload, e que separadores usam esses dados.

## Conclusao Curta

- A dashboard atual prefere ler o espelho em Supabase.
- Quando a leitura Supabase falha ou quando `DASHBOARD_DATA_SOURCE=sheets`, o GAS faz fallback para a Google Sheet.
- A Google Sheet continua a ser a fonte operacional principal e estas abas continuam a ser a origem do espelho manual para Supabase.

## Fluxo Runtime Atual

1. O frontend chama `getDashboardData({ mode: 'raw_v2' })` em `src/main.gs`.
2. O GAS resolve a origem runtime a partir de `DASHBOARD_DATA_SOURCE`.
3. Se a origem escolhida for `Supabase`, o GAS le as tabelas espelho em `src/SupabaseRead.gs`.
4. Se a origem escolhida for `Sheets` ou se houver fallback, o GAS executa `buildRawData_(ss)` em `src/Composer.gs`.
5. Em ambos os casos, o frontend recebe o mesmo contrato `raw_v2`.
6. O frontend transforma o payload raw em `DATA` atraves de `buildDashboardFromRaw_` em `src/js.html`.
7. Os separadores da dashboard renderizam a partir de `DATA`.

## Abas Da Google Sheet Que Alimentam a Dashboard

| Aba Google Sheet | Payload raw | DATA final | Separadores / uso principal | Notas |
|---|---|---|---|---|
| `REGISTOS_POR_DIA` | `registos` | `DATA.registos` | `Overview`, `Obra Detail`, `Equipa`, `Mapa Mensal`, `Assiduidade`, `Comparativa`, `Contabilidade` | E a fonte principal de assiduidade e mao de obra. |
| `COLABORADORES` | `colaboradores` | `DATA.colaboradores` | `Equipa`, `Ferias` | Fornece sobretudo `Nome`, `Funcao`, `EUR/h` e fallback de trabalhador. |
| `OBRAS` | `obras_info` | `DATA.obras_info` | Estado visual das obras, badge `Ativa/Inativa`, filtragem visual da lista de obras | Nao e a fonte principal dos custos. |
| `REGISTO_DESLOCACOES` | `deslocacoes` | `DATA.deslocacoes` | `Overview`, `Obra Detail`, `Deslocacoes`, `Comparativa`, `Contabilidade` | Fonte das deslocacoes e respetivo custo. |
| `FERIAS` | `ferias` | `DATA.ferias` | `Ferias` | A vista de ferias cruza depois com registos para o calendario. |
| `PESSOAL_EFETIVO` | `pessoal_efetivo` | `DATA.pessoal_efetivo` | `RH` | Fonte dedicada da secao de recursos humanos. |
| `MATERIAIS_MOV` | `materiais_mov` | `DATA.materiais_mov` | `Overview`, `Obra Detail`, `Comparativa`, `Contabilidade` | So entram em totais de dashboard os movimentos considerados consumo de obra. |
| `LEGACY_MAO_OBRA` | `legacy_mao_obra` | `DATA.legacy_mao_obra` | `Overview`, `Obra Detail`, `Comparativa`, `Contabilidade` | Complementa historico antigo de mao de obra. |
| `LEGACY_MATERIAIS` ou `MATERIAIS_LEGACY` | `legacy_materiais` | `DATA.legacy_materiais` | `Overview`, `Obra Detail`, `Comparativa`, `Contabilidade` | Complementa historico antigo de materiais/servicos. |
| `VIAGENS_DIARIAS` | `viagens` | `DATA.viagens` | Atualmente sem secao visivel relevante na UI | E lida e entra no payload, mas hoje nao encontrei um card/grafico/secao operacional que a use de forma clara na interface atual. |

## Separador -> Abas Que o Alimentam

### Overview

- `REGISTOS_POR_DIA`
- `LEGACY_MAO_OBRA`
- `REGISTO_DESLOCACOES`
- `MATERIAIS_MOV`
- `LEGACY_MATERIAIS`

Notas:
- Os KPI globais sao recalculados a partir destas fontes.
- `COLABORADORES` nao e a fonte principal do KPI global de colaboradores; esse numero nasce dos registos.

### Obra Detail

- `REGISTOS_POR_DIA`
- `LEGACY_MAO_OBRA`
- `REGISTO_DESLOCACOES`
- `MATERIAIS_MOV`
- `LEGACY_MATERIAIS`
- `OBRAS`

Notas:
- Os custos, horas, trabalhadores, fases e assiduidade por obra nascem do agregado construido em `buildDashboardFromRaw_`.
- `OBRAS` entra sobretudo para metadados e estado visual da obra.

### Deslocacoes

- `REGISTO_DESLOCACOES`

### Equipa

- `REGISTOS_POR_DIA`
- `COLABORADORES`

Notas:
- Exemplo direto do fluxo pedido: `REGISTOS_POR_DIA` alimenta a agregacao de horas, custo, faltas, atrasos e obras por trabalhador.
- `COLABORADORES` completa funcao e `EUR/h`, e serve de roster base/fallback.

### Mapa Mensal

- `REGISTOS_POR_DIA`

Notas:
- O mapa mensal e uma vista derivada dos registos diarios.
- Nao depende de `LEGACY_MAO_OBRA`.

### Assiduidade

- `REGISTOS_POR_DIA`

Notas:
- Exemplo direto do fluxo pedido: `REGISTOS_POR_DIA` e a fonte da tabela de faltas/dispensados e do detalhe de cada trabalhador.

### Ferias

- `FERIAS`
- `COLABORADORES`
- `REGISTOS_POR_DIA`

Notas:
- `FERIAS` fornece o saldo base.
- `COLABORADORES` fornece a funcao.
- O calendario e o popup de detalhe cruzam com `REGISTOS_POR_DIA` para identificar dias marcados como ferias e a respetiva obra/fase.

### Comparativa

- `REGISTOS_POR_DIA`
- `LEGACY_MAO_OBRA`
- `REGISTO_DESLOCACOES`
- `MATERIAIS_MOV`
- `LEGACY_MATERIAIS`

Notas:
- Os graficos de mao de obra por fase usam `REGISTOS_POR_DIA` + `LEGACY_MAO_OBRA`.
- Os graficos de materiais/servicos usam `MATERIAIS_MOV` + `LEGACY_MATERIAIS`.
- Os graficos de deslocacoes usam `REGISTO_DESLOCACOES`.

### Contabilidade

- `REGISTOS_POR_DIA`
- `LEGACY_MAO_OBRA`
- `REGISTO_DESLOCACOES`
- `MATERIAIS_MOV`
- `LEGACY_MATERIAIS`

### RH

- `PESSOAL_EFETIVO`

## Abas Da Workbook Que Hoje Nao Alimentam Diretamente a Dashboard

Estas abas existem na workbook, mas nao fazem parte do caminho de leitura atual da dashboard:

- `CONFIG`
- `FASES_DE_OBRA`
- `VEICULOS`
- `NAO_REGISTADOS_HIST`
- `AUDIT_LOG`
- `MATRIZ_ROTAS`
- `FORNECEDORES`
- `FATURAS`
- `FATURAS_ITENS`
- `NOTAS_CREDITO_ITENS`
- `MATERIAIS_CAD`
- `MATERIAIS_REFERENCIAS`
- `AFETACOES_OBRA`
- `COMPROMISSOS_OBRA`
- `STOCK_ATUAL`

Podem ser relevantes para outros fluxos do projeto, para o backoffice, para sincronizacao, ou para preparacao futura da migracao, mas hoje nao entram no contrato runtime principal da dashboard.

## Ficheiros De Codigo A Confirmar Quando Houver Duvida

- `src/main.gs`
- `src/Composer.gs`
- `src/Readers.gs`
- `src/js.html`

## Nota De Manutencao

Este documento ja nao descreve a origem runtime final da dashboard; descreve a origem operacional na workbook e o mapa `aba -> payload -> separadores` que continua a ser valido tanto para a leitura direta por Sheets como para o espelho manual em Supabase.
