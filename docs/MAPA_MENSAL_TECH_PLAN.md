# Mapa Mensal / Pagamento - Plano Tecnico

Estado: fase 1 implementada no frontend atual; validacao e eventual otimizacao backend pendentes.
Ultima revisao: 2026-03-13

## Objetivo tecnico
Implementar o Mapa Mensal com o menor desvio possivel da arquitetura atual:
- backend GAS continua a expor `getDashboardData({ mode: 'raw_v2' })`
- frontend continua a trabalhar sobre `DATA`
- nova funcionalidade entra como secao read-only adicional
- impressao/PDF nasce primeiro a partir de HTML imprimivel no frontend

## Estado atual
- A Fase 1 descrita abaixo ja foi executada no repositorio.
- O calculo mensal esta hoje no frontend a partir de `DATA.registos`.
- A secao, a tabela-resumo e a vista de impressao ja existem.
- Este plano passa a servir como referencia para validacao, refino e decisao sobre uma futura fase 2.

## Decisao de arquitetura
### Fase 1 - Sem alterar o payload base
Na primeira iteracao, o mapa mensal deve ser calculado no frontend a partir de `DATA.registos`.

Estado atual:
- implementada

Razoes:
- o projeto ja recebe os registos brutos em `raw_v2`
- evita abrir ja uma segunda via de agregacao no GAS
- reduz risco de divergencia entre agregadores antigos e novos
- permite validar rapidamente regras de negocio e layout

### Fase 2 - Otimizacao opcional
Se houver problemas de performance ou necessidade de reutilizacao server-side:
- criar agregador dedicado no GAS para o mapa mensal
- manter exatamente a mesma estrutura de saida definida abaixo

Estado atual:
- ainda nao iniciada

## Encaixe no codigo atual
### Backend existente relevante
- `src/Composer.gs` ja envia `registos` em `buildRawData_`
- `src/Readers.gs` ja normaliza campos criticos:
  - `data`
  - `nome`
  - `funcao`
  - `horas`
  - `atraso_min`
  - `falta`
  - `motivo`
  - `dispensado`
  - `custo`

### Frontend existente relevante
- `src/js.html` ja faz normalizacao central via `normalizeDashboardPayload_` / `buildDashboardFromRaw_`
- navegacao por secoes ja existe com `showSection(id)`
- o dashboard ja tem tabelas densas e comportamento mobile reutilizavel

## Nova secao proposta
Adicionar nova secao `mapa-mensal`.

### Navegacao
- sidebar desktop: novo item `Mapa Mensal`
- mobile bottom nav: novo item apenas se houver espaco util; se nao houver, manter acesso por sidebar/menu

### IDs base sugeridos
- `section-mapa-mensal`
- `mapa-mensal-month`
- `mapa-mensal-status`
- `mapa-mensal-table`
- `mapa-mensal-tbody`
- `mapa-mensal-print-btn`
- `mapa-mensal-print-view`

## Estado frontend sugerido
Adicionar estado global minimo em `src/js.html`:

```js
let mapaMensalMonth = '';
let mapaMensalStatus = 'provisorio';
let mapaMensalCache = {};
```

### Significado
- `mapaMensalMonth`: chave `YYYY-MM`
- `mapaMensalStatus`: `provisorio` ou `fechado`
- `mapaMensalCache`: cache por mes para evitar recomputacao desnecessaria

## Funcoes frontend sugeridas
### Base
- `initMapaMensal_()`
- `setMapaMensalMonth(monthKey)`
- `setMapaMensalStatus(status)`
- `buildMapaMensalData_(monthKey, status)`
- `renderMapaMensalSummary_(mapaData)`
- `renderMapaMensalPrintView_(mapaData)`
- `printMapaMensal_()`

### Helpers
- `getMapaMensalRange_(monthKey, status)`
- `getMapaMensalDaysInMonth_(monthKey)`
- `getMapaMensalWeekdayLabel_(dateKey)`
- `normalizeMapaCellValue_(dayData)`
- `formatMapaHorasDisplay_(minutes)`
- `formatMapaAtrasoDisplay_(minutes)`

## Estrutura de dados proposta no frontend
O builder do mapa mensal deve devolver um objeto unico por mes.

```js
{
  month: '2026-02',
  month_label: 'Fevereiro 2026',
  status: 'provisorio' | 'fechado',
  generated_at: '12/03/2026 18:20',
  period: {
    start: '2026-02-01',
    end: '2026-02-28',
    effective_end: '2026-02-15'
  },
  days: [
    {
      date: '2026-02-01',
      day_number: 1,
      weekday_short: 'Dom',
      weekend_type: 'dom' | 'sab' | 'weekday'
    }
  ],
  workers: [
    {
      nome: 'Joao Silva',
      total_minutes_valid: 9270,
      total_horas_label: '154:30',
      dias_equiv_int: 19,
      dias_compact_label: '19+2:30',
      atrasos_min: 45,
      atrasos_label: '45 m',
      counts: {
        F: 1,
        FJ: 0,
        Bxa: 0,
        Fer: 2,
        Dps: 1
      },
      cells: {
        '2026-02-01': {
          raw_minutes: 480,
          valid_minutes: 450,
          atraso_min: 30,
          code: '',
          display: '8',
          suppress_hours: false,
          is_dps_with_hours: false
        },
        '2026-02-04': {
          raw_minutes: 480,
          valid_minutes: 0,
          code: 'F',
          display: 'F',
          suppress_hours: true,
          is_dps_with_hours: false
        },
        '2026-02-07': {
          raw_minutes: 480,
          valid_minutes: 0,
          code: 'Dps',
          display: 'Dsp',
          suppress_hours: true,
          is_dps_with_hours: false
        }
      }
    }
  ],
  totals: {
    workers: 23,
    minutes_valid: 104520,
    counts: {
      F: 5,
      FJ: 2,
      Bxa: 1,
      Fer: 8,
      Dps: 4
    },
    atrasos_min: 315
  }
}
```

## Regra tecnica de consolidacao diaria
Cada trabalhador deve ser consolidado por dia antes do calculo mensal.

### Passo 1 - Agrupar por `nome + data`
Combinar todas as linhas do mesmo trabalhador no mesmo dia.

### Passo 2 - Determinar codigo dominante do dia
Ordem de prioridade:
1. `F`
2. `FJ`
3. `Bxa`
4. `Fer`
5. `Dps`
6. vazio

Observacao:
- a prioridade acima serve apenas para o display diario e bloqueio de horas
- `Dps` so bloqueia outras ausencias no sentido administrativo, mas nao bloqueia horas quando nao existe falta

### Passo 3 - Determinar minutos validos
- se existir `F`, `FJ`, `Bxa` ou `Fer`: `valid_minutes = 0`
- se existir `Dps`: `valid_minutes = 0`
- se nao existir ausencia: `valid_minutes = max(0, raw_minutes - atraso_min)`

### Passo 4 - Determinar display da celula
- `F`, `FJ`, `Bxa`, `Fer` -> mostrar so o codigo
- `Dsp` -> mostrar `Dsp`
- horas sem ausencia -> mostrar `valid_minutes` ja com o atraso descontado, por exemplo `8`, `7:30`, `4`

Nota:
- o atraso continua somado na coluna/resumo mensal, mas deixa de aparecer como indicador visual na celula diaria

## Parsing tecnico das ausencias
O campo `motivo` deve ser traduzido para o codigo do mapa por funcao dedicada.

Funcao sugerida:
- `getMapaAusenciaCode_(registo)`

Mapeamento minimo acordado:
- `F` -> `F`
- `FJ` -> `FJ`
- `Bxa` -> `Bxa`
- `Fer`, `Fér` -> `Fer`
- `dispensado = true` -> `Dps`

Nota:
- a implementacao deve normalizar acentos e maiusculas/minusculas
- se houver ambiguidade em `motivo`, a funcao deve devolver vazio e nao inventar classificacao

## Parsing tecnico das horas
Como os registos atuais ja chegam com `horas` numericas em `DATA.registos`, o mapa mensal deve trabalhar internamente em minutos:
- `raw_minutes = Math.round((registo.horas || 0) * 60)`

Display sugerido:
- 480 -> `8`
- 450 -> `7:30`
- 270 -> `4:30`

## Regra de inclusao final do trabalhador
Depois da consolidacao do mes:
- incluir trabalhadores com `total_minutes_valid > 0`
- incluir tambem trabalhadores com `total_minutes_valid = 0` se tiverem pelo menos um registo em `F`, `FJ`, `Bxa` ou `Fer`
- nao incluir trabalhadores com apenas `Dsp` e zero horas validas

## Dashboard summary table
### Colunas
- Trabalhador
- Dias
- Total Horas
- F
- FJ
- Bxa
- Fer
- Atrasos

### Dados por coluna
- `Total Horas` = `formatMapaTotalHoursLabel_(total_minutes_valid)`
- `Dias` = `formatMapaCompactDaysLabel_(total_minutes_valid)` com formato compacto, por exemplo `17+4` ou `17+4:30`
- `Atrasos` = total mensal informativo

## Print/PDF view
### Primeira iteracao tecnica recomendada
Gerar uma vista HTML dedicada para impressao dentro do proprio dashboard.

Vantagens:
- zero dependencia nova
- sem servicos externos
- sem gerar ficheiros no backend
- utilizador pode usar `Imprimir > Guardar como PDF`

### Estrutura sugerida
- wrapper escondido no ecrã normal
- visivel apenas em modo impressao ou numa modal/tela dedicada
- CSS `@media print` especifico para:
  - orientar tabela em paisagem
  - repetir cabecalho em cada pagina
  - reduzir paddings e fontes
  - aplicar cores de sabado/domingo

## Alteracoes minimas por ficheiro
### `src/index.html`
- novo item de navegacao
- nova secao `section-mapa-mensal`
- contentores da tabela-resumo
- contentor oculto de impressao

### `src/css.html`
- estilos da tabela-resumo
- estilos compactos mobile
- estilos de grelha diaria imprimivel
- `@media print` dedicado

### `src/js.html`
- novo estado global
- builder mensal
- render da tabela-resumo
- render da vista de impressao
- handlers de mes/estado/impressao

### Backend
Nenhuma alteracao obrigatoria na fase 1.

## Fases de implementacao recomendadas
### Fase A - Data builder sem UI final
- construir `buildMapaMensalData_(monthKey, status)`
- validar com `console.log` e testes reais de fevereiro

Estado atual:
- concluida

### Fase B - Tabela-resumo dashboard
- adicionar secao
- adicionar seletor de mes
- renderizar tabela-resumo

Estado atual:
- concluida

### Fase C - Vista imprimivel PDF
- montar grelha mensal completa
- cabecalho duplo
- totais finais
- `window.print()` ou equivalente

Estado atual:
- concluida na primeira entrega

### Fase D - Refino opcional
- cache por mes
- melhor ordenacao/filtros
- eventual agregacao server-side

Estado atual:
- parcialmente concluida no que toca a cache por mes
- validacao funcional e decisao sobre agregacao server-side mantem-se em aberto

## Principais riscos
- variacoes reais do campo `motivo` para mapear F/FJ/Bxa/Fer
- multiplas linhas no mesmo dia para o mesmo trabalhador
- meses com muitos trabalhadores podem gerar PDF largo e pesado
- o mapa tem de alinhar com o custo liquido sem perder o atraso como dado auditavel separado

## Validacao recomendada
Antes de considerar a funcionalidade correta, validar pelo menos:
- um dia com horas simples
- um dia com `F` e horas > 0
- um dia com `FJ` e horas > 0
- um dia com `Bxa` e horas > 0
- um dia com `Fer` e horas > 0
- um dia com `Dps` e horas > 0
- um dia com `Dps` sem horas
- trabalhador com apenas ausencias e zero horas validas no mes
- mes em curso em modo `provisorio`
- mes fechado completo

## Resultado esperado da primeira entrega
No fim da primeira entrega, o utilizador deve conseguir:
- abrir a secao Mapa Mensal
- escolher um mes
- ver a tabela-resumo correta
- abrir/imprimir o mapa diario completo desse mes
- guardar esse mapa em PDF via impressao do browser

Estado atual:
- estes pontos ja se encontram implementados no frontend atual
