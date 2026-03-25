# REGRAS DE NEGÓCIO — Sistema de Gestão de Obras
### Doutor Martelo — Documento de Especificação para Migração de Stack

> **Objectivo deste documento:** Capturar toda a lógica de negócio, regras de cálculo,
> comportamentos da UI e estrutura de dados do sistema actual (Google Sheets + GAS + AppSheet),
> de forma suficientemente precisa para ser reimplementado em:
> **PostgreSQL (Supabase) + FastAPI (Python) + React/Vite + React Native + Supabase Auth**
>
> **Versão:** 1.1 — Março 2026
> **Estado actual do sistema:** Google Apps Script Web App + AppSheet + Google Sheets

---

## ÍNDICE

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Entidades e Modelo de Dados](#2-entidades-e-modelo-de-dados)
3. [Regras de Negócio — Colaboradores](#3-regras-de-negócio--colaboradores)
4. [Regras de Negócio — Obras](#4-regras-de-negócio--obras)
5. [Regras de Negócio — Registos Diários (Presenças)](#5-regras-de-negócio--registos-diários-presenças)
6. [Regras de Negócio — Faltas e Assiduidade](#6-regras-de-negócio--faltas-e-assiduidade)
7. [Regras de Negócio — Deslocações](#7-regras-de-negócio--deslocações)
8. [Regras de Negócio — Férias](#8-regras-de-negócio--férias)
9. [Regras de Negócio — Fases de Obra](#9-regras-de-negócio--fases-de-obra)
10. [Regras de Cálculo — KPIs e Agregações](#10-regras-de-cálculo--kpis-e-agregações)
11. [Regras de Filtro por Data](#11-regras-de-filtro-por-data)
12. [Regras de Alertas Automáticos](#12-regras-de-alertas-automáticos)
13. [Dashboard — Secções e Comportamentos](#13-dashboard--secções-e-comportamentos)
14. [Input Mobile — AppSheet / React Native](#14-input-mobile--appsheet--react-native)
15. [Autenticação e Permissões](#15-autenticação-e-permissões)
16. [Mapeamento para Novo Stack](#16-mapeamento-para-novo-stack)
17. [Schema SQL Sugerido (PostgreSQL)](#17-schema-sql-sugerido-postgresql)
18. [Endpoints API Sugeridos (FastAPI)](#18-endpoints-api-sugeridos-fastapi)

---

## 1. Visão Geral do Sistema

### O que o sistema faz

Sistema de gestão operacional para empresa de construção civil. Permite:

- Registar presenças, faltas e atrasos de trabalhadores por obra e por dia
- Calcular custos de mão de obra em tempo real
- Gerir e monitorizar deslocações entre instalações e obras
- Acompanhar férias dos trabalhadores por período contratual
- Visualizar comparativas de desempenho entre obras
- Receber alertas automáticos sobre anomalias (atrasos, faltas excessivas, custos)

### Actores do sistema

| Actor | Canal actual | Canal futuro |
|---|---|---|
| Gestor / Dono | Dashboard web (browser) | Dashboard web (React) |
| Encarregado de obra | AppSheet (mobile) | React Native app |
| Sistema | Google Apps Script (backend) | FastAPI (Python) |

### Fluxo principal

```
Encarregado regista presença no campo (mobile)
    ↓
Dado entra na base de dados
    ↓
Dashboard recalcula KPIs e agrega dados
    ↓
Gestor visualiza no browser
```

---

## 2. Entidades e Modelo de Dados

### 2.1 Colaboradores

Representa um trabalhador da empresa.

| Campo | Tipo | Descrição | Regras |
|---|---|---|---|
| nome | string | Nome completo | Chave natural. Deve ser único e consistente em todos os registos |
| funcao | string | Função/cargo | Ex: "Pedreiro", "Servente", "Armador de Ferro", "Polivalente" |
| eur_h | decimal | Custo por hora em euros | Definido por função na CONFIG, não individualmente |
| ativo | boolean | Se está activo na empresa | Para futura funcionalidade de arquivo |

**Regra crítica:** O nome do colaborador é a chave de ligação entre todas as tabelas.
Não existe ID numérico de colaborador no sistema actual — o nome é o identificador.
Na migração, deve ser criado um `id` UUID mas o nome deve manter-se único e não editável
após criação para não quebrar histórico.

**Funções existentes e custo/hora:** O custo por hora está mapeado por função numa tabela
de configuração (CONFIG). Não é um campo livre por colaborador.

Funções conhecidas: Servente, Pedreiro, Polivalente, Armador de Ferro.

### 2.2 Obras

Representa um local/projecto de construção.

| Campo | Tipo | Descrição | Regras |
|---|---|---|---|
| obra_id | string | ID interno (ex: "O01") | Código alfanumérico curto |
| local_id | string | Nome operacional (ex: "Pera I") | Nome usado em todos os registos e no dashboard |
| ativa | boolean | Se a obra está activa | Exibida no dashboard com badge "Ativa"/"Inativa" |

**Regra crítica:** Em todos os registos operacionais (presenças, deslocações), o identificador
usado é o `local_id` (nome), NÃO o `obra_id`. O `obra_id` é apenas para referência interna.

**Regra de estado:** Uma obra é considerada "Ativa" se o campo `ativa` for "Sim", "true" ou "1".

### 2.3 Registos Diários (Presenças)

Registo central do sistema. Um registo = um trabalhador + um dia + uma obra.

| Campo | Tipo | Descrição | Regras |
|---|---|---|---|
| data_arquivo | datetime | Timestamp de criação do registo | Gerado automaticamente |
| data_registo | date | Data do registo (YYYY-MM-DD) | Data efectiva de trabalho |
| nome | string | Nome do colaborador | FK para colaboradores.nome |
| funcao | string | Função no dia | Copiada do colaborador, mas pode diferir |
| obra | string | Nome da obra | FK para obras.local_id |
| fase | string | Fase de obra activa no dia | FK para fases_de_obra. Ex: "E - paredes exteriores" |
| horas | decimal | Horas trabalhadas no dia | Pode ser 0 ou positivo |
| atraso_min | integer | Minutos de atraso | 0 se sem atraso |
| falta | boolean | Se é um registo de falta | true/false |
| motivo | string | Motivo da falta | Só preenchido se falta=true |
| eur_h | decimal | Valor/hora aplicado | Snapshot do valor no momento do registo |
| custo_dia | decimal | Custo calculado | Calculado e gravado no momento |
| observacao | string | Campo livre de notas | Opcional |
| id_registo | string | ID funcional do registo | Gerado automaticamente |
| dispensado | boolean | Se o colaborador foi dispensado nesse registo | true/false |
| dispensa_processada_em | datetime | Timestamp técnico do GAS | Preenchido quando a dispensa é processada |

**Ordem real actual na Google Sheet `REGISTOS_POR_DIA`:**
`DATA_ARQUIVO, DATA_REGISTO, Nome, Função, Obra, Fase de Obra, Horas, Atraso_Minutos, Falta, Motivo Falta, €/h, Custo Dia (€), Observação, ID_Registo, Dispensado, Dispensa_Processada_Em`

**Regra de custo (fonte de verdade = GAS):**
`custo_dia = falta ? 0 : (horas - atraso_min/60) × eur_h`

Ou seja:
- se `falta = true`, o custo é sempre `0`
- se `falta = false`, o custo é recalculado no GAS pelas horas efectivas
- `dispensado = true` não altera por si só a fórmula de custo

**Regra de coexistência:** `dispensado = true` pode coexistir com:
- `falta = true`
- `motivo` preenchido
- `horas > 0`

**Regra operacional de dispensa:**
- Quando `dispensado = true` e `dispensa_processada_em` está vazio, o trigger operacional `onOperationalSheetChange(e)` no GAS:
  - remove o colaborador da sheet `COLABORADORES`
  - preenche `dispensa_processada_em`
- Isto evita reprocessar a mesma dispensa e permite recontratação futura via reinserção manual em `COLABORADORES`

**Regra de unicidade:** Não existe constraint explícita de unicidade (nome + data + obra)
no sistema actual. Na migração, deve ser avaliado se deve existir ou se o mesmo trabalhador
pode ter múltiplos registos no mesmo dia na mesma obra (turnos diferentes, fases diferentes).

### 2.4 Deslocações

Registo de viagens de transporte para obras.

| Campo | Tipo | Descrição | Regras |
|---|---|---|---|
| id_viagem | string | UUID da viagem | |
| data | date | Data da viagem | |
| obra_destino | string | Obra de destino | FK para obras.local_id. Pode ser null |
| origem | string | Localidade de origem | Ex: "Fernão Ferro I", "Oeiras" |
| quantidade_viagens | integer | Número de viagens | |
| custo_total | decimal | Custo calculado | Derivado da MATRIZ_ROTAS |

**Regra de custo:** O custo por viagem está definido na MATRIZ_ROTAS (tabela origem × destino).
`custo_total = quantidade_viagens × custo_por_rota`

**Regra de associação:** Uma deslocação não está associada a um colaborador específico,
apenas a uma obra de destino. É um custo operacional da obra, não de um trabalhador.

**Regra de afectação ao custo da obra:**
`custo_total_obra = custo_mao_obra + custo_deslocacoes_para_essa_obra`

### 2.5 Férias

Plafão e controlo de férias por colaborador.

| Campo | Tipo | Descrição | Regras |
|---|---|---|---|
| nome | string | Nome do colaborador | FK para colaboradores.nome |
| data_admissao | date | Data de admissão na empresa | Base para cálculo do período activo |
| dias_total | integer | Dias de férias no período | Definido individualmente (varia por trabalhador) |
| ano_ref_inicio | date | Início do período activo | Calculado automaticamente (ver regra abaixo) |
| ano_ref_fim | date | Fim do período activo | Calculado automaticamente |
| dias_usados | integer | Dias já consumidos | Calculado automaticamente a partir dos registos |
| dias_disponiveis | integer | Saldo disponível | `dias_total - dias_usados`. Pode ser negativo |

**Regra do período activo:**
```
Se a data de aniversário de admissão deste ano já passou:
    ano_ref_inicio = data_admissao com o ano actual
    ano_ref_fim    = data_admissao com o ano actual + 1 - 1 dia
Senão:
    ano_ref_inicio = data_admissao com o ano anterior
    ano_ref_fim    = data_admissao com o ano actual - 1 dia
```

Exemplo: admitido a 15/03/2022. Hoje é 26/02/2026.
Como 15/03/2026 ainda não passou: `período = 15/03/2025 → 14/03/2026`

**Regra de contagem de dias usados:**
Um dia de férias é contado quando existir um registo em REGISTOS_DIARIOS com:
- `nome = colaborador`
- `falta = true`
- `motivo = "Férias"` (case-insensitive)
- `data_registo` dentro do `[ano_ref_inicio, ano_ref_fim]`

**Regra de saldo negativo:** É permitido ter saldo negativo.
O dashboard mostra alerta visual animado (pulsação vermelha) mas não bloqueia novos registos.

**Regra de transição de período:** Os dias não transitam entre períodos.
Quando o período renova, o plafão reinicia de zero (baseado em `dias_total`).
Os dias não usados do período anterior são perdidos — não há acumulação.

### 2.6 Fases de Obra

Lista de fases possíveis de uma obra.

| Campo | Tipo | Descrição |
|---|---|---|
| id | string | Código curto (ex: "A", "B", "E") |
| descricao | string | Descrição completa (ex: "E - paredes exteriores e interiores") |

**Fases existentes conhecidas:**
```
A - projetos
B - abertura estaleiro
C - movimentação terras
D - estrutura
E - paredes exteriores e interiores
F - capoto
G - eletricidade
U / M - janelas/caixilharias
```

**Regra de associação:** Uma fase está associada a um registo diário (trabalhador fez X horas
na fase Y da obra Z no dia W). O mesmo trabalhador pode ter fases diferentes em obras diferentes.
Um registo diário tem exactamente uma fase.

### 2.7 Matriz de Rotas (Custos de Deslocação)

Tabela de lookup para calcular custo de viagem.

| Campo | Tipo | Descrição |
|---|---|---|
| origem | string | Localidade de partida |
| destino | string | Obra/localidade de chegada |
| custo_euro | decimal | Custo por viagem nesta rota |

**Regra:** Se origem = destino, custo = 0 (deslocação interna sem custo).

---

## 3. Regras de Negócio — Colaboradores

1. O campo `eur_h` é determinado pela **função**, não pelo colaborador individualmente.
   A tabela de configuração mapeia `funcao → eur_h`. O valor é copiado para o registo
   no momento da criação como snapshot.

2. Um colaborador pode trabalhar em **múltiplas obras simultaneamente** no mesmo dia
   (registos separados).

3. Um colaborador pode desempenhar a **mesma função** em diferentes fases da mesma obra.

4. Quando um colaborador não está na lista de colaboradores mas aparece em registos,
   o sistema cria uma entrada virtual com a função extraída do registo. Na migração,
   isto deve ser uma constraint de integridade referencial — todos os nomes nos registos
   devem existir na tabela de colaboradores.

5. O nome é **case-sensitive** e deve ser exactamente igual em todas as tabelas.
   Espaços extra ou variações de grafia causam duplicação silenciosa no sistema actual.
   Na migração, usar UUID como FK e nome apenas para display.

---

## 4. Regras de Negócio — Obras

1. Uma obra é identificada operacionalmente pelo `local_id` (nome), não pelo `obra_id`.
   O `local_id` é o que aparece em todos os registos e no dashboard.

2. O estado "Ativa/Inativa" é apenas informativo — não bloqueia novos registos.

3. Uma obra pode não ter deslocações associadas — o custo de deslocações pode ser zero.

4. `custo_total_obra = custo_mao_obra + custo_deslocacoes`
   onde `custo_mao_obra` = soma de todos os `custo_dia` dos registos da obra.

5. Uma obra é considerada "activa" no dashboard (conta para KPI "Obras Ativas")
   se tiver registos no período de filtro seleccionado. O campo `ativa` da tabela
   OBRAS é uma flag de gestão, não o critério de contagem do KPI.

---

## 5. Regras de Negócio — Registos Diários (Presenças)

1. **Granularidade:** Um registo = 1 trabalhador + 1 dia + 1 obra + 1 fase.
   Se um trabalhador trabalhar em 2 fases da mesma obra no mesmo dia,
   são 2 registos distintos.

2. **Custo calculado no momento (na prática, recalculado pelo GAS):**
   `custo_dia = falta ? 0 : (horas - atraso_min/60) × eur_h`.
   O `eur_h` é gravado no registo como snapshot, mas o GAS volta a validar o valor
   com base em `COLABORADORES`.

3. **Falta:** Quando `falta = true`, `custo_dia = 0`.
   O registo de falta existe para contar ausências — não gera custo.
   No estado actual, `horas` pode permanecer preenchido por motivos operacionais,
   mas não gera custo se a linha estiver marcada como falta.

4. **Atraso:** O atraso é em minutos e independente das horas.
   Um trabalhador pode ter atraso sem falta (chegou tarde mas trabalhou).
   O atraso reduz as horas efectivas usadas no cálculo do custo pelo GAS.

5. **Dispensado:** `dispensado = true` pode coexistir com `falta = true`,
   `motivo` preenchido e `horas > 0`. Quando isso acontece, a regra de custo continua
   a ser dominada por `falta` (custo = 0).

6. **Eliminação de registos:** Quando um registo é eliminado via AppSheet,
   a linha fica completamente vazia na sheet. O sistema tem um trigger operacional
   dedicado (`onOperationalSheetChange`) que detecta e elimina essas linhas vazias.
   Na migração, usar `DELETE` SQL standard — o problema não existe em base de dados real.

6. **Semana ISO:** Para agregação semanal, usa-se o formato `YYYY-SWW`
   (ex: "2026-S08"). A semana começa à segunda-feira.

---

## 6. Regras de Negócio — Faltas e Assiduidade

### Motivos de falta

Valores possíveis para o campo `motivo` quando `falta = true`:

| Valor | Descrição |
|---|---|
| `"Justificada"` | Falta com justificação aceite |
| `"Injustificada"` | Falta sem justificação |
| `"Baixa"` | Baixa médica |
| `"Férias"` | Dia de férias marcado |

**Regra:** Apenas faltas com `motivo = "Férias"` são contadas para o plafão de férias.
Os outros motivos contam apenas para assiduidade geral.

### Cálculo de assiduidade

```
taxa_assiduidade = dias_presentes / (dias_presentes + dias_falta) × 100
```

Onde `dias_presentes = dias com horas > 0` e `dias_falta = registos com falta = true`.

### Atrasos

- Registados em minutos inteiros.
- Para display: converter para `Xh Ym` quando >= 60 min, senão `Ym`.
- Agregados por colaborador e por obra.
- Não afectam o custo — são apenas KPI informativo.

### Secção de Assiduidade no Dashboard

A secção de Assiduidade mostra uma **lista de trabalhadores com faltas > 0**
ou com pelo menos um registo `dispensado = true` no período de filtro activo.

Colunas:
- Nome
- Função
- Nº de Faltas (clicável para ver detalhe)

Quando existirem registos `dispensado` no período, aparece um badge amarelo
`Disp X` ao lado do nome, onde `X` é o número de dias/registos com dispensa
no período filtrado.

Ao clicar no número de faltas: popup com lista cronológica de cada falta,
mostrando: `DD/MM → Motivo → Obra → Fase`

Se um registo de falta desse popup também tiver `dispensado = true`,
o item mostra adicionalmente o badge `Dispensado`.

A fase mostrada no popup de falta é a fase presente no registo do dia da falta.
Se houver múltiplas fases no mesmo dia, são mostradas separadas por vírgula.

---

## 7. Regras de Negócio — Deslocações

1. Uma deslocação não está ligada a um trabalhador — é um custo operacional da obra.

2. O custo é determinado pela rota (origem → destino), não pela data ou pelo utilizador.

3. `custo_total = qtd_viagens × custo_por_rota`

4. Deslocações aparecem no dashboard filtradas pelo filtro de datas global.

5. **KPIs de deslocações** (secção Deslocações):
   - Total de viagens (soma de `quantidade_viagens`)
   - Custo médio por viagem (`custo_total / total_viagens`)
   - Obra com mais deslocações (por `quantidade_viagens`)
   - Origem mais frequente

6. **Agrupamento para display:** As deslocações são agrupadas por obra de destino,
   depois por origem, mostrando subtotais de viagens e custo.

7. **Alerta:** Se o custo total de deslocações > 20% do custo total global,
   é disparado um toast de aviso ao carregar o dashboard.

---

## 8. Regras de Negócio — Férias

(Ver também secção 2.5 para definição da entidade)

1. O plafão é **individual** — cada trabalhador tem o seu número de dias definido
   manualmente pelo gestor na tabela FERIAS.

2. O período é calculado automaticamente com base na `data_admissao`.
   Não é um campo livre — é uma data derivada.

3. Um dia de férias é consumido quando existe um registo com `motivo = "Férias"`.
   Não há outro mecanismo de marcação de férias.

4. **Saldo negativo é possível e válido.** Ocorre quando `dias_usados > dias_total`.
   Display no dashboard: badge pulsante vermelho com valor negativo. Não bloqueia operação.

5. **Saldo amarelo (alerta leve):** Quando `dias_disponiveis >= 1 && dias_disponiveis <= 5`.

6. **Saldo verde (normal):** Quando `dias_disponiveis > 5`.

7. **Calendário de férias:** Para cada trabalhador, o dashboard mostra um calendário
   visual com os dias de férias marcados destacados a azul. Ao clicar num dia:
   popup com `data + obra + fase`.

8. **Dias não transitam entre períodos.** Não há acumulação de dias não gozados.

9. **Férias fora do período activo não contam.** Um registo com `motivo = "Férias"`
   numa data fora do `[ano_ref_inicio, ano_ref_fim]` não é contado para o saldo actual.

---

## 9. Regras de Negócio — Fases de Obra

1. Uma fase é uma etapa do processo de construção (ex: "D - estrutura").

2. Um trabalhador é registado numa fase por dia. A fase é escolhida no momento
   do registo mobile.

3. O dashboard mostra a fase de cada trabalhador na sua obra actual.
   Um trabalhador que trabalhou em múltiplas fases tem todas listadas separadas por vírgula
   (ex: "E - paredes, F - capoto").

4. Para o gráfico comparativo de fases por obra: agrega o custo de mão de obra
   por fase, filtrado pelo período activo.

5. A fase é guardada em cada registo diário como texto livre (string),
   não como FK. No sistema actual não há validação de valores permitidos.
   Na migração, deve ser FK para tabela de fases.

---

## 10. Regras de Cálculo — KPIs e Agregações

### KPIs Globais (secção "Visão Geral")

Calculados sobre TODOS os registos (ou sobre o período filtrado):

| KPI | Fórmula |
|---|---|
| Custo Total | `SUM(custo_mao_obra) + SUM(custo_deslocacoes)` |
| Mão de Obra | `SUM(registos.custo_dia)` |
| Deslocações | `SUM(deslocacoes.custo_total)` |
| Horas Trabalhadas | `SUM(registos.horas)` |
| Obras Ativas | `COUNT(DISTINCT obras com registos no período)` |
| Colaboradores | `COUNT(DISTINCT registos.nome no período)` |
| Faltas Totais | `COUNT(registos WHERE falta = true no período)` |
| Total Atrasos | `SUM(registos.atraso_min no período)` em minutos |

**Regra de "Obras Ativas" vs campo `ativa`:**
O KPI conta obras com registos no período seleccionado, NÃO o campo `ativa` da tabela OBRAS.

### KPIs por Obra

Calculados sobre os registos da obra específica, no período filtrado:

| KPI | Fórmula |
|---|---|
| Custo Total | `SUM(custo_dia) + SUM(deslocacoes.custo)` para esta obra |
| Horas | `SUM(horas)` para esta obra |
| Trabalhadores | `COUNT(DISTINCT nome)` com horas > 0 no período |
| Faltas | `COUNT(registos WHERE falta = true)` para esta obra |
| Dias Trabalhados | `COUNT(DISTINCT data_registo)` para esta obra |
| Deslocações | `SUM(deslocacoes.custo_total)` para esta obra |

### Agregações Temporais

Para cada obra são calculadas e guardadas:
- **Daily:** custo, horas, atraso, trabalhadores únicos, faltas — por dia
- **Weekly:** custo, horas — por semana ISO (`YYYY-SWW`)
- **Monthly:** custo, horas — por mês (`YYYY-MM`)

### Tabela de Trabalhadores por Obra

Cada linha = 1 trabalhador na obra, no período filtrado:

| Campo | Cálculo |
|---|---|
| nome | nome do colaborador |
| funcao | função no momento dos registos |
| fase | fase(s) trabalhadas (string, separadas por vírgula) |
| horas | `SUM(horas WHERE falta=false)` |
| custo | `SUM(custo_dia WHERE falta=false)` |
| atraso | `SUM(atraso_min)` |
| dias | `COUNT(DISTINCT data_registo WHERE falta=false)` |
| faltas | `COUNT(registos WHERE falta=true)` |

### Tabela de Colaboradores (secção Equipa)

Agrega todos os registos de um colaborador em todas as obras, no período filtrado:

| Campo | Cálculo |
|---|---|
| nome | nome do colaborador |
| funcao | função principal (da tabela COLABORADORES) |
| obras | lista de obras únicas onde teve registos (Local_IDs) |
| fase | fases únicas, ordenadas, separadas por vírgula |
| total_horas | `SUM(horas WHERE falta=false)` |
| total_custo | `SUM(custo_dia WHERE falta=false)` |
| faltas | `COUNT(registos WHERE falta=true)` |
| atrasos | `SUM(atraso_min)` em minutos |

**Regra de exibição:** Apenas mostrar colaboradores com `total_horas > 0 OR faltas > 0` no período.
Colaboradores sem qualquer actividade no período não aparecem.

---

## 11. Regras de Filtro por Data

### Filtros rápidos (Quick Filters)

| Botão | Comportamento |
|---|---|
| Hoje | `data_de = data_para = data_actual` |
| Esta Semana | `data_de = segunda-feira desta semana`, `data_para = hoje` |
| Este Mês | `data_de = primeiro dia do mês actual`, `data_para = hoje` |
| Tudo | Sem filtro (todos os registos) |

**Filtro por defeito ao abrir o dashboard:** "Hoje".
Se não houver dados para hoje, todos os KPIs mostram zero (não os totais históricos).

**Regra crítica anti-bug:** Quando o valor de um KPI filtrado é 0 (zero registos no período),
o dashboard deve mostrar 0, não o total histórico. O operador `OR` com fallback (ex: `x || total`)
está explicitamente proibido para valores numéricos.

### Filtro personalizado

O utilizador pode definir `data_de` e `data_para` manualmente via date pickers.
Ao aplicar um filtro manual, o botão de quick filter activo é desactivado.

### Propagação do filtro

O filtro de datas é **global** — afecta todas as secções do dashboard simultaneamente:
- Visão Geral (KPIs)
- Detalhe da Obra (KPIs + tabela de trabalhadores + gráfico de fases)
- Deslocações (tabela + KPIs)
- Equipa (tabela de colaboradores)
- Assiduidade (lista de faltas)
- Comparativa (gráficos)

**Excepção:** A secção Férias **não é afectada** pelo filtro de datas global —
mostra sempre o período contratual activo de cada trabalhador.

### Persistência do estado ao mudar filtro

Quando o utilizador muda o filtro e estava a ver uma obra específica (secção "Detalhe da Obra"),
a obra selecionada deve manter-se após o rebuild dos dados — não redirigir para outra secção.

Se estava noutra secção (Equipa, Deslocações, etc.), o filtro muda mas mantém a secção activa.

---

## 12. Regras de Alertas Automáticos

Alertas são mostrados como toasts (notificações temporárias) ao carregar o dashboard.

### Alertas activos

| Condição | Mensagem | Tipo | Duração |
|---|---|---|---|
| Deslocações > 20% do custo total | "Deslocações representam X% do custo total (acima de 20%)" | warning | 8s |
| Colaborador com ≥ 3 faltas (total histórico) | "Colaboradores com 3+ faltas: Nome1 (N), Nome2 (N)..." | danger | 10s |
| Saldo de férias ≤ 0 | Badge pulsante vermelho na secção Férias | visual only | permanente |

### Alertas removidos

| Condição | Motivo de remoção |
|---|---|
| Taxa de faltas global > 15% | Removido a pedido do utilizador — gerava ruído desnecessário |

### Tipos de toast

| Tipo | Cor | Ícone |
|---|---|---|
| warning | amarelo | fa-triangle-exclamation |
| danger | vermelho | fa-circle-exclamation |
| info | azul | fa-circle-info |
| success | verde | fa-circle-check |

Os toasts desaparecem automaticamente após a duração definida.
Podem ser fechados manualmente com botão "×".

---

## 13. Dashboard — Secções e Comportamentos

### Navegação

O dashboard tem 7 secções principais acessíveis por sidebar (desktop) e bottom nav (mobile):

| Secção | ID | Descrição |
|---|---|---|
| Visão Geral | `overview` | KPIs globais com animação de contadores |
| Obras | `obra-detail` | Detalhe de uma obra específica |
| Deslocações | `deslocacoes` | Tabela e KPIs de deslocações |
| Equipa | `equipa` | Lista de colaboradores com métricas |
| Assiduidade | `assiduidade` | Lista de colaboradores com faltas > 0 ou registos dispensados |
| Férias | `ferias` | Plafões e calendário de férias |
| Comparativa | `comparativa` | Gráficos comparativos entre obras |

**Atalhos de teclado:** Alt+1 a Alt+6 para `overview`, `obra-detail`, `deslocacoes`, `equipa`, `assiduidade` e `comparativa`.

**Estado por defeito:** Dashboard abre sempre na secção "Visão Geral" com filtro "Hoje".

### Secção: Visão Geral

- 8 KPI cards com animação de contador ao carregar (duração 1200ms, easing ease-out cubic)
- Cada card tem tooltip de ajuda (ícone "?") com descrição do KPI
- Cards clicáveis: "Deslocações" → navega para secção Deslocações;
  "Colaboradores" → navega para Equipa; "Faltas Totais" → navega para Assiduidade
- Badge "Atenção" vermelho no card de Faltas quando `faltas > 5`

### Secção: Detalhe de Obra

- Selector dropdown para escolher a obra
- As obras também estão listadas no submenu da sidebar
- KPIs da obra (6 cards): Custo Total, Horas, Trabalhadores, Faltas, Dias Trabalhados, Deslocações
- Badge "Ativa"/"Inativa" junto ao nome da obra
- Gráfico de barras: custo por fase (agregado no período filtrado)
- Tabela de trabalhadores na obra (colunas: Nome, Função, Fase, Horas, Custo, Atrasos, Dias, Faltas)
  - Ordenável por qualquer coluna
  - Pesquisa por nome
  - Faltas com tag vermelha

### Secção: Deslocações

- 4 KPI cards: Total Viagens, Custo Médio/Viagem, Obra c/ Mais Deslocações, Origem Mais Frequente
- Agrupamento visual por obra de destino, com origens e subtotais
- Tabela filtrável (por obra, por data local) e ordenável
- Colunas da tabela: Data, Obra, Origem, Nº Viagens, Custo

### Secção: Equipa

- Tabela de todos os colaboradores com actividade no período
- Colunas: Nome, Função, Obras (Local_IDs inline ou popup), Fase, Total Horas, Total Custo, Faltas, Atrasos
- **Coluna Obras:** Se o texto de todas as obras couber em 24 chars → mostra inline.
  Se não couber → mostra "Obra1, +N" com popup ao clicar mostrando lista completa.
  O popup tem link "Ver" para navegar para o detalhe da obra.
- **Coluna Faltas:** Número clicável → popup com lista de faltas:
  `DD/MM/YYYY • Motivo • Obra • Fase`
- **Coluna Fase:** Todas as fases únicas onde trabalhou, ordenadas, separadas por vírgula.
  Alinhamento à direita.
- Filtro por função e pesquisa por nome
- Ordenável por todas as colunas

### Secção: Assiduidade

- Lista colaboradores com `faltas > 0` ou com pelo menos um registo `dispensado = true` no período filtrado
- Colunas: Nome, Função, Faltas
- **Ao lado do nome:** badge amarelo `Disp X` quando existirem registos com dispensa no período
- **Coluna Faltas:** Clicável → popup com lista:
  `DD/MM → Motivo → Obra → Fase`
  Ordenado do mais recente para o mais antigo.
- Se um item do popup tiver `dispensado = true`, mostra também o badge `Dispensado`
- Pesquisa por nome
- Ordenável (por defeito: mais faltas primeiro)
- Se sem faltas nem dispensas no período: mensagem "Sem faltas ou dispensas no período seleccionado" com ícone verde

### Secção: Férias

- Tabela de todos os colaboradores com plafão definido
- Colunas: Nome, Função, Período Activo, Total, Usados, Disponíveis
- **Coluna Disponíveis:** Badge colorido:
  - Verde: `> 5 dias`
  - Amarelo: `1 a 5 dias`
  - Vermelho pulsante: `≤ 0 dias` (saldo negativo incluso)
- Clicar numa linha expande o calendário de férias do trabalhador
- **Calendário:** Mostra apenas os meses com dias de férias registados.
  Dias de férias destacados a azul.
  Ao clicar num dia: popup com `Data + Obra + Fase`.
- **Filtro:** não afectado pelo filtro de datas global — usa sempre o período contratual activo.

### Secção: Comparativa

- Gráfico de barras agrupadas: Mão de Obra vs Deslocações vs Total por obra
- Gráfico de barras: custo por fase agregada em todas as obras, com seleção combinável de `Mão de Obra` e `Materiais/Serviços`, ou `Total` exclusivo
- Gráfico de barras empilhadas: Custo por fase em cada obra
- Gráfico de dias por fase em cada obra

---

## 14. Input Mobile — AppSheet / React Native

### Comportamento actual (AppSheet)

A AppSheet liga directamente ao Google Sheets e escreve na sheet `REGISTOS_POR_DIA`.
Quando elimina um registo, deixa a linha completamente vazia — o trigger operacional
`onOperationalSheetChange` no GAS detecta e elimina automaticamente essas linhas.

O Google Sheets mantém também uma sheet técnica `NAO_REGISTADOS_HIST`, preenchida
automaticamente pelo GAS no fecho de cada dia útil, com snapshot dos colaboradores
que ficaram por registar nesse dia.

Estrutura actual de `NAO_REGISTADOS_HIST`:
- `DATA_REF`
- `Nome`
- `Função`

A navegação principal da app inclui actualmente:
- `Obras Ativas` — ponto de entrada para seleccionar a obra e registar trabalhadores
- `Equipa de Hoje` — lista de trabalhadores já registados hoje
- `Por Registar Hoje` — lista de trabalhadores activos em `COLABORADORES` que ainda não aparecem em `REGISTOS_POR_DIA` com `DATA_REGISTO = TODAY()`

### O que o utilizador mobile faz

1. Regista a presença diária de cada trabalhador:
  - Selecciona a obra
   - Selecciona o trabalhador (da lista COLABORADORES)
   - Define a fase
   - Introduz horas trabalhadas
   - Marca se houve atraso (em minutos)
   - Marca se houve falta e qual o motivo
   - Pode marcar `Dispensado` no mesmo registo

2. Consulta a vista `Por Registar Hoje`:
   - Vê a lista de trabalhadores ainda não registados no dia actual
   - A lista actualiza à medida que os registos vão sendo gravados
   - Um trabalhador sai desta lista quando passa a existir qualquer registo seu no dia (presença, falta ou registo com `Dispensado = true`)

3. Regista deslocações:
   - Selecciona a obra de destino
   - Selecciona a origem
   - Define a quantidade de viagens

### Campos obrigatórios no registo de presença

- data_registo
- nome (deve existir em COLABORADORES)
- obra (deve existir em OBRAS)
- fase (deve existir em FASES_DE_OBRA)
- falta (boolean)
- dispensado (boolean opcional)
- Se falta=false: horas obrigatório
- Se falta=true: motivo obrigatório

### Campos automáticos (não introduzidos pelo utilizador)

- data_arquivo (timestamp automático)
- funcao (lookup por nome em COLABORADORES)
- eur_h (lookup por funcao em CONFIG)
- custo_dia (calculado no GAS)
- id_registo (ID automático)
- dispensa_processada_em (timestamp técnico do GAS; não editável na app)

---

## 15. Autenticação e Permissões

### Estado actual

O dashboard GAS está configurado com acesso restrito ao owner (utilizador Google autenticado).
Não há sistema de roles ou multi-utilizador no sistema actual.

### Modelo futuro (Supabase Auth)

| Role | Permissões |
|---|---|
| `admin` | Acesso total: ver tudo, editar colaboradores, editar obras, ver férias |
| `encarregado` | Apenas input mobile: criar e editar os seus próprios registos do dia |
| `gestor` | Dashboard read-only: ver todos os dados, sem edição |

**Regra:** Um `encarregado` não deve conseguir editar registos de dias anteriores
(ou deve ter uma janela limitada, ex: só pode editar registos do próprio dia e do dia anterior).

**Regra:** Todos os utilizadores autenticados devem ter Row Level Security (RLS)
no Supabase para que cada um só veja os dados da sua empresa
(preparação para eventual multi-tenant).

---

## 16. Mapeamento para Novo Stack

### Google Sheets → PostgreSQL (Supabase)

| Sheet actual | Tabela PostgreSQL |
|---|---|
| `COLABORADORES` | `colaboradores` |
| `OBRAS` | `obras` |
| `REGISTOS_POR_DIA` | `registos_diarios` |
| `NAO_REGISTADOS_HIST` | `nao_registados_hist` *(snapshot operacional; opcional no novo stack)* |
| `REGISTO_DESLOCACOES` | `deslocacoes` |
| `FERIAS` | `ferias_plafao` |
| `FASES_DE_OBRA` | `fases_obra` |
| `MATRIZ_ROTAS` | `matriz_rotas` |
| `CONFIG` (funcao→eur_h) | `funcoes_custo` |
| `VIAGENS_DIARIAS` | `viagens_diarias` *(a avaliar se necessário)* |

### GAS backend → FastAPI

| Função GAS | Endpoint FastAPI |
|---|---|
| `getDashboardData()` | `GET /api/dashboard` |
| `buildData_()` (agregação completa) | `GET /api/dashboard` com query params de filtro |
| `readRegistos_()` | `GET /api/registos` |
| `readColabs_()` | `GET /api/colaboradores` |
| `readObras_()` | `GET /api/obras` |
| `readDeslocacoes_()` | `GET /api/deslocacoes` |
| `readFerias_()` | `GET /api/ferias` |
| `limparLinhasVazias_()` | Não necessário — DELETE SQL é atómico |
| `processarDispensados_()` | Lógica de serviço após criação/edição de registo |
| `registarNaoRegistadosDoDia_()` | Job agendado que grava `DATA_REF + Nome + Função` |
| `isoWeek_()` | `date_trunc('week', data)` em SQL |

### AppSheet → React Native

| Funcionalidade AppSheet | Implementação React Native |
|---|---|
| Formulário de presença | Screen `RegistarPresenca` |
| Vista `Por Registar Hoje` | Screen `PorRegistarHoje` |
| Lista de colaboradores | `GET /api/colaboradores` |
| Lista de obras | `GET /api/obras?ativas=true` |
| Lista de fases | `GET /api/fases` |
| Submissão | `POST /api/registos` |
| Marcar `Dispensado` | `POST /api/registos` com flag `dispensado=true` |
| Formulário de deslocação | Screen `RegistarDeslocacao` |
| Login | Supabase Auth (email/password ou magic link) |

---

## 17. Schema SQL Sugerido (PostgreSQL)

```sql
-- Funções e custos (substituição da CONFIG)
CREATE TABLE funcoes_custo (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funcao      TEXT UNIQUE NOT NULL,
    eur_h       DECIMAL(8,2) NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Colaboradores
CREATE TABLE colaboradores (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome           TEXT UNIQUE NOT NULL,
    funcao         TEXT NOT NULL REFERENCES funcoes_custo(funcao),
    ativo          BOOLEAN DEFAULT true,
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- Obras
CREATE TABLE obras (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id    TEXT UNIQUE NOT NULL,   -- ex: "O01"
    local_id   TEXT UNIQUE NOT NULL,   -- ex: "Pera I" — usado como FK em registos
    ativa      BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Fases de obra
CREATE TABLE fases_obra (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo    TEXT UNIQUE NOT NULL,    -- ex: "E"
    descricao TEXT NOT NULL            -- ex: "E - paredes exteriores e interiores"
);

-- Registos diários (tabela central)
CREATE TABLE registos_diarios (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_arquivo   TIMESTAMPTZ DEFAULT now(),
    data_registo   DATE NOT NULL,
    colaborador_id UUID NOT NULL REFERENCES colaboradores(id),
    obra_id        UUID NOT NULL REFERENCES obras(id),
    fase_id        UUID REFERENCES fases_obra(id),
    horas          DECIMAL(4,2) NOT NULL DEFAULT 0,
    atraso_min     INTEGER NOT NULL DEFAULT 0,
    falta          BOOLEAN NOT NULL DEFAULT false,
    motivo         TEXT,               -- "Justificada"|"Injustificada"|"Baixa"|"Férias"
    eur_h          DECIMAL(8,2) NOT NULL,   -- snapshot no momento
    dispensado     BOOLEAN NOT NULL DEFAULT false,
    dispensa_processada_em TIMESTAMPTZ,
    custo_dia      DECIMAL(10,2) GENERATED ALWAYS AS (
        CASE
            WHEN falta = true THEN 0
            ELSE (horas - (atraso_min / 60.0)) * eur_h
        END
    ) STORED,
    observacao     TEXT,
    created_by     UUID REFERENCES auth.users(id),
    created_at     TIMESTAMPTZ DEFAULT now(),

    -- Validações
    CONSTRAINT falta_motivo    CHECK (NOT (falta = true AND motivo IS NULL))
);

-- Índices para queries frequentes
CREATE INDEX idx_registos_data         ON registos_diarios(data_registo);
CREATE INDEX idx_registos_colaborador  ON registos_diarios(colaborador_id);
CREATE INDEX idx_registos_obra         ON registos_diarios(obra_id);
CREATE INDEX idx_registos_data_obra    ON registos_diarios(data_registo, obra_id);
CREATE INDEX idx_registos_falta        ON registos_diarios(falta) WHERE falta = true;
CREATE INDEX idx_registos_dispensado   ON registos_diarios(dispensado) WHERE dispensado = true;

-- Matriz de rotas
CREATE TABLE matriz_rotas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origem      TEXT NOT NULL,
    destino     TEXT NOT NULL,
    custo_euro  DECIMAL(8,2) NOT NULL DEFAULT 0,
    UNIQUE(origem, destino)
);

-- Deslocações
CREATE TABLE deslocacoes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data              DATE NOT NULL,
    obra_id           UUID REFERENCES obras(id),
    origem            TEXT NOT NULL,
    quantidade_viagens INTEGER NOT NULL DEFAULT 1,
    custo_total       DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- Plafão de férias
CREATE TABLE ferias_plafao (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    colaborador_id UUID NOT NULL REFERENCES colaboradores(id) UNIQUE,
    data_admissao  DATE NOT NULL,
    dias_total     INTEGER NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
-- Nota: dias_usados e dias_disponiveis são calculados via VIEW ou função,
-- não armazenados — derivam dos registos_diarios.

-- VIEW para férias calculadas
CREATE VIEW ferias_calculadas AS
SELECT
    fp.colaborador_id,
    c.nome,
    fp.data_admissao,
    fp.dias_total,
    -- Período activo: aniversário de admissão mais recente
    CASE
        WHEN make_date(EXTRACT(YEAR FROM NOW())::INT, EXTRACT(MONTH FROM fp.data_admissao)::INT, EXTRACT(DAY FROM fp.data_admissao)::INT) <= NOW()::DATE
        THEN make_date(EXTRACT(YEAR FROM NOW())::INT, EXTRACT(MONTH FROM fp.data_admissao)::INT, EXTRACT(DAY FROM fp.data_admissao)::INT)
        ELSE make_date(EXTRACT(YEAR FROM NOW())::INT - 1, EXTRACT(MONTH FROM fp.data_admissao)::INT, EXTRACT(DAY FROM fp.data_admissao)::INT)
    END AS ano_ref_inicio,
    -- Dias usados: contar férias no período activo
    (
        SELECT COUNT(*)
        FROM registos_diarios rd
        WHERE rd.colaborador_id = fp.colaborador_id
          AND rd.falta = true
          AND LOWER(rd.motivo) = 'férias'
          AND rd.data_registo >= (
              CASE
                  WHEN make_date(EXTRACT(YEAR FROM NOW())::INT, EXTRACT(MONTH FROM fp.data_admissao)::INT, EXTRACT(DAY FROM fp.data_admissao)::INT) <= NOW()::DATE
                  THEN make_date(EXTRACT(YEAR FROM NOW())::INT, EXTRACT(MONTH FROM fp.data_admissao)::INT, EXTRACT(DAY FROM fp.data_admissao)::INT)
                  ELSE make_date(EXTRACT(YEAR FROM NOW())::INT - 1, EXTRACT(MONTH FROM fp.data_admissao)::INT, EXTRACT(DAY FROM fp.data_admissao)::INT)
              END
          )
    ) AS dias_usados
FROM ferias_plafao fp
JOIN colaboradores c ON c.id = fp.colaborador_id;
```

---

## 18. Endpoints API Sugeridos (FastAPI)

```
# Autenticação (gerida pelo Supabase Auth — não precisa de endpoints custom)

# Colaboradores
GET    /api/colaboradores                    → lista todos
POST   /api/colaboradores                    → criar novo
PUT    /api/colaboradores/{id}               → actualizar
DELETE /api/colaboradores/{id}               → desactivar (soft delete)

# Obras
GET    /api/obras                            → lista todas (query param: ?ativas=true)
POST   /api/obras                            → criar
PUT    /api/obras/{id}                       → actualizar estado

# Fases
GET    /api/fases                            → lista todas (para dropdown mobile)

# Registos
GET    /api/registos                         → com filtros: ?data_de=&data_ate=&obra=&colaborador=
POST   /api/registos                         → criar registo (mobile input)
PUT    /api/registos/{id}                    → editar (com restrição de data)
DELETE /api/registos/{id}                    → eliminar

# Deslocações
GET    /api/deslocacoes                      → com filtros: ?data_de=&data_ate=&obra=
POST   /api/deslocacoes                      → criar

# Férias
GET    /api/ferias                           → todos os colaboradores com plafão calculado
PUT    /api/ferias/{colaborador_id}          → actualizar dias_total ou data_admissao

# Dashboard (endpoint de agregação — o mais importante)
GET    /api/dashboard                        → payload completo
       query params: ?data_de=YYYY-MM-DD&data_ate=YYYY-MM-DD

# Alertas
GET    /api/alertas                          → lista alertas activos
```

### Estrutura do payload `/api/dashboard`

O endpoint de dashboard deve devolver um JSON com a mesma estrutura que o sistema actual
devolve em `getDashboardData()`, para facilitar a migração incremental do frontend:

```json
{
  "global": {
    "custo_total": 0.00,
    "custo_mao_obra": 0.00,
    "custo_deslocacoes": 0.00,
    "custo_materiais": 0.00,
    "horas_total": 0.0,
    "total_atrasos": 0,
    "obras_ativas": 0,
    "colaboradores": 0,
    "faltas": 0,
    "last_update": "DD/MM/YYYY HH:MM"
  },
  "obras": {
    "Nome da Obra": {
      "custo_mao_obra": 0.00,
      "custo_deslocacoes": 0.00,
      "custo_total": 0.00,
      "horas_total": 0.0,
      "atraso_total": 0,
      "trabalhadores": 0,
      "faltas": 0,
      "dias": 0,
      "daily": [],
      "weekly": [],
      "monthly": [],
      "workers": [],
      "assiduidade": [],
      "fases": [],
      "materiais_fases": []
    }
  },
  "obras_info": [],
  "colaboradores": [],
  "deslocacoes": [],
  "ferias": [],
  "materiais_mov": []
}
```

---

## NOTAS PARA O DEVELOPER DE MIGRAÇÃO

1. **Prioridade 1 — base de dados:** Criar o schema PostgreSQL e migrar os dados históricos
   do Google Sheets antes de qualquer outro trabalho de frontend ou API.

2. **Prioridade 2 — API de leitura:** Implementar o endpoint `GET /api/dashboard`
   com o payload compatível com o frontend actual. Isto permite testar o novo backend
   com o frontend existente antes de migrar o frontend.

3. **Prioridade 3 — input mobile:** A AppSheet pode continuar a funcionar durante a
   transição se a nova API aceitar os mesmos campos. Migrar para React Native
   pode ser feito após a base de dados e API estarem estáveis.

4. **Nomes como chave:** O sistema actual usa o nome do colaborador como chave natural
   em todas as tabelas. Na migração, criar UUIDs mas manter o nome como campo único
   e imutável para não invalidar histórico.

5. **Cálculos no servidor:** No sistema actual, todo o processamento e agregação é feito
   no GAS em JavaScript. Na migração, mover o máximo de agregação para SQL (índices,
   views, CTEs) — é ordens de magnitude mais rápido que processar em Python row-by-row.

6. **Filtro de datas:** O filtro não é feito na query SQL no sistema actual —
   os dados chegam todos ao frontend e o filtro é feito em JavaScript.
   Na migração, o filtro deve ser feito na query SQL (`WHERE data_registo BETWEEN ? AND ?`).

7. **Semana ISO:** A função `isoWeek_` no GAS não usa o standard ISO correcto —
   usa uma aproximação. Em PostgreSQL usar `date_trunc('week', data_registo)`
   que devolve sempre segunda-feira como início de semana (ISO correcto).

---

*Documento criado em Fevereiro de 2026. Actualizar sempre que regras de negócio mudarem.*
*Localização no repositório: `/REGRAS_DE_NEGOCIO.md` (raiz do projecto)*
