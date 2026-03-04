# Copilot Instructions - Dashboard Doutor Martelo

## Contexto do Projeto
Dashboard de gestao de obra para empresa de construcao civil portuguesa.
O backend e Google Apps Script (`main.gs`) e a UI e servida como Web App via `HtmlService`.
Toda a interface continua concentrada num unico ficheiro `index.html`.

O projeto atual integra:
- AppSheet para input operacional diario
- Google Sheets como base de dados operacional
- Google Apps Script para agregacao, saneamento e automacoes
- Dashboard web em `index.html`

---

## Stack e Restricoes Absolutas
- HTML5 + CSS3 + JavaScript ES6 vanilla
- Nunca sugerir React, Vue, Angular, npm, webpack, import/export ou require()
- Chart.js v4 via CDN para graficos
- Font Awesome 6 via CDN para icones
- Google Fonts: Inter
- Tudo em funcoes globais, compativel com Apps Script `HtmlService`
- O frontend nao fala diretamente com Google Sheets; tudo passa pelo GAS

---

## Ficheiros do Projeto
| Ficheiro | Funcao |
|---|---|
| `index.html` | UI completa: HTML + CSS + JS |
| `main.gs` | Backend GAS: leitura de sheets, agregacao, trigger e automacoes |
| `appsscript.json` | Configuracao do Apps Script |
| `.clasp.json` | Configuracao do clasp |
| `REGRAS_DE_NEGOCIO.md` | Documento de regras, estrutura e migracao |

---

## Como os Dados Chegam ao Frontend
```js
google.script.run
  .withSuccessHandler(onDataLoaded)
  .withFailureHandler(onDataError)
  .getDashboardData();

function onDataLoaded(jsonStr) {
  DATA = JSON.parse(jsonStr);
}
```

No frontend, a variavel global principal e `DATA` (nao `dashData`).

---

## Estrutura Atual do JSON (`DATA`)
```js
DATA = {
  global: {
    custo_total,
    custo_mao_obra,
    custo_deslocacoes,
    custo_materiais,
    horas_total,
    total_atrasos,
    obras_ativas,
    colaboradores,
    faltas,
    custo_viagens,
    total_viagens,
    last_update
  },
  obras: {
    "Nome da Obra": {
      custo_mao_obra,
      custo_deslocacoes,
      qtd_deslocacoes,
      custo_materiais,
      custo_total,
      horas_total,
      atraso_total,
      trabalhadores,
      faltas,
      dias,
      all_dates,
      daily: [{ DATA_str, Custo, Horas, Atraso, Trabalhadores, Faltas }],
      weekly: [{ Semana, Custo, Horas }],
      monthly: [{ Mes, Custo, Horas }],
      workers: [{ "Nome (auto)", "Funcao (auto)", Fase, Custo, Horas, Atraso, Dias, Faltas }],
      assiduidade: [{
        nome,
        funcao,
        dias: {
          "YYYY-MM-DD": { horas, falta, dispensado, custo, atraso_min, motivo, fases }
        }
      }],
      fases: [{ Fase, Custo, Horas, Workers, Dias, Faltas }],
      materiais_fases: [{ Fase, Custo, Qtd }]
    }
  },
  obras_info: [{ Obra_ID, Local_ID, Ativa }],
  colaboradores: [{ Nome, Funcao, Eur_h }],
  viagens: [{ Data_str, DiaSem, V_Padrao, V_Real, V_Efetivas, Viatura, Obra, Custo_Via, custo_dia }],
  deslocacoes: [{ data, obra, veiculo, motorista, origem, qtd, custo }],
  ferias: [{ nome, data_admissao, dias_total, ano_ref_inicio, ano_ref_fim, dias_usados, dias_disponiveis }],
  materiais_mov: [{ id_mov, data, tipo, obra, fase, material, quantidade, custo_total }]
}
```

---

## Estrutura Atual de `REGISTOS_POR_DIA`
Ordem real atual das colunas na Google Sheet:

1. `DATA_ARQUIVO`
2. `DATA_REGISTO`
3. `Nome`
4. `Funcao`
5. `Obra`
6. `Fase de Obra`
7. `Horas`
8. `Atraso_Minutos`
9. `Falta`
10. `Motivo Falta`
11. `EUR_h`
12. `Custo Dia (€)`
13. `Observacao`
14. `ID_Registo`
15. `Dispensado`
16. `Dispensa_Processada_Em`

Notas importantes:
- `main.gs` le `A:P`
- `Dispensado` e um `Yes/No` funcional para AppSheet e dashboard
- `Dispensa_Processada_Em` e tecnico; o GAS usa-o para evitar reprocessar a mesma dispensa

---

## Estrutura Atual de `NAO_REGISTADOS_HIST`
Ordem atual das colunas na Google Sheet:

1. `DATA_REF`
2. `Nome`
3. `Funcao`

Notas importantes:
- Esta sheet e preenchida apenas pelo GAS
- O registo e um snapshot do fecho do dia util
- Guarda os colaboradores que nao tiveram qualquer registo em `REGISTOS_POR_DIA` nessa data
- `Falta` e `Dispensado` contam como "registado", por isso esses nomes nao entram aqui

---

## Comportamento Atual de `Dispensado`
- O campo `Dispensado` e marcado na mesma linha de `REGISTOS_POR_DIA`
- Pode coexistir com `Falta = true`
- Pode coexistir com `Motivo Falta` preenchido
- Se `Falta = true`, o custo continua a ser `0`, mesmo com `Dispensado = true`
- Quando `Dispensado = true` e `Dispensa_Processada_Em` esta vazio:
  - o trigger `onSheetChange(e)` processa a linha
  - o colaborador e removido fisicamente da sheet `COLABORADORES`
  - o GAS grava a data/hora em `Dispensa_Processada_Em`

---

## Secoes Atuais do Dashboard
1. `overview` - KPIs globais
2. `obra-detail` - detalhe de uma obra
3. `deslocacoes` - custos e tabela de deslocacoes
4. `equipa` - tabela de colaboradores agregados no periodo
5. `assiduidade` - lista de faltas e registos com `dispensado`
6. `ferias` - saldo e calendario de ferias
7. `comparativa` - comparacao entre obras

Notas:
- A secao `assiduidade` nao usa heatmap; a implementacao ativa e uma tabela
- A secao `assiduidade` mostra trabalhadores com faltas ou com registos `dispensado` no periodo
- Na tabela de assiduidade, um badge `Disp X` aparece ao lado do nome quando existem registos `dispensado`

---

## Variaveis Globais Principais no `index.html`
```js
let DATA = null;
let currentSection = 'overview';
let currentObraName = null;
let matMovAll = [];

let obraCharts = {};
let deslCharts = {};
let equipaCharts = {};
let compCharts = {};
```

---

## Convencoes de Codigo Obrigatorias

### Edicao do `index.html`
- Fazer edicoes cirurgicas
- Nunca reestruturar o ficheiro inteiro sem necessidade
- Ao adicionar UI nova, preservar o padrao atual de funcoes globais
- Nunca adicionar dependencias novas sem aprovacao explicita
- Nao usar `eval()`
- Nao usar `document.write()`

### Edicao do `main.gs`
- Preservar compatibilidade com o Google Sheets atual
- Ao mexer em `REGISTOS_POR_DIA`, respeitar sempre a ordem real `A:P`
- Nao assumir que `VIAGENS_DIARIAS` existe em todas as copias locais; a fonte operacional e a Google Sheet real
- Automatismos de trigger devem ser idempotentes sempre que possivel

### Formatos
```js
// Datas internas: "YYYY-MM-DD"
// Datas de display: "DD/MM/YYYY" ou "DD/MM"

// Moeda
valor.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
```

---

## Regras de UI e Dados a Preservar
- Toda a UI em portugues europeu
- `COLABORADORES` continua a ser a fonte da lista ativa de trabalhadores
- O AppSheet tem atualmente uma vista de apoio `Por Registar Hoje`
- O dashboard nao deve depender de escrita local ou `localStorage` para dados de negocio
- O frontend nao deve recalcular regras de negocio que ja foram decididas no GAS, exceto filtros de data de display

---

## O que Nao Fazer
- Nao separar `index.html` em multiplos ficheiros
- Nao mover logica de negocio para o frontend se ela ja existir no GAS
- Nao sugerir trocar AppSheet por outra ferramenta sem pedido explicito
- Nao reescrever funcoes existentes que estao estaveis; preferir extensao incremental

---

## Testes Recomendados
- Validar sempre desktop e mobile
- Testar no Chrome mobile como referencia principal
- Quando houver mudancas em `Dispensado`, testar:
  - registo com `Falta = true`
  - registo com `Falta = false`
  - remocao da `COLABORADORES`
  - reflexo no dashboard (`assiduidade`)
