# Copilot Instructions — Dashboard Doutor Martelo

## Contexto do Projecto
Dashboard de gestão de obra para empresa de construção civil portuguesa.
Servido como Google Apps Script Web App via `HtmlService`.
Toda a UI vive num único ficheiro `index.html`.

---

## Stack e Restrições ABSOLUTAS
- **HTML5 + CSS3 + JavaScript ES6 vanilla** — sem frameworks, sem bundlers
- **Nunca sugerir:** React, Vue, Angular, npm, webpack, import/export, require()
- **Chart.js v4** (CDN) — único para todos os gráficos
- **Font Awesome 6** (CDN) — ícones
- **Google Fonts: Inter** — tipografia
- Tudo em **funções globais** — o GAS concatena e serve como HTML único
- Compatível com **Google Apps Script HtmlService** (sem acesso ao DOM server-side)

---

## Ficheiros do Projecto
| Ficheiro | Função |
|---|---|
| `index.html` | Toda a UI: CSS + HTML + JS (~4100 linhas) |
| `main.gs` | Backend GAS: lê o Google Sheets e devolve JSON |
| `appsscript.json` | Configuração do GAS (não alterar) |
| `.clasp.json` | Config do clasp CLI (não alterar) |

---

## Como os Dados Chegam ao Frontend
```js
// Chamada assíncrona ao backend GAS
google.script.run
  .withSuccessHandler(onDataLoaded)
  .withFailureHandler(onDataError)
  .getDashboardData();

// onDataLoaded recebe uma string JSON
function onDataLoaded(jsonStr) {
  dashData = JSON.parse(jsonStr);
  // dashData é a variável global com todos os dados
}
```

## Estrutura do JSON (dashData)
```js
dashData = {
  global: {
    custo_total,        // número, €
    custo_mao_obra,     // número, €
    custo_deslocacoes,  // número, €
    horas_total,        // número
    total_atrasos,      // número, minutos
    obras_ativas,       // número
    colaboradores,      // número (únicos)
    faltas,             // número
    custo_viagens,      // número, €
    total_viagens,      // número
    last_update         // string "dd/MM/yyyy HH:mm"
  },
  obras: {
    "Nome da Obra": {
      custo_mao_obra, custo_deslocacoes, custo_total,
      horas_total, atraso_total, trabalhadores, faltas, dias,
      all_dates,  // array de strings "YYYY-MM-DD"
      daily:    [{ DATA_str, Custo, Horas, Atraso, Trabalhadores, Faltas }],
      weekly:   [{ Semana, Custo, Horas }],
      monthly:  [{ Mes, Custo, Horas }],
      workers:  [{ "Nome (auto)", "Função (auto)", Fase, Custo, Horas, Atraso, Dias, Faltas }],
      assiduidade: [{ nome, funcao, dias: { "YYYY-MM-DD": { horas, falta, custo, atraso_min, motivo } } }],
      fases:    [{ Fase, Custo, Horas, Workers, Dias, Faltas }]
    }
  },
  obras_info:    [{ Obra_ID, Local_ID, Ativa }],
  colaboradores: [{ Nome, Funcao, Eur_h }],
  deslocacoes:   [{ data, obra, origem, qtd, custo }],
  viagens:       [{ Data_str, DiaSem, V_Padrao, V_Real, V_Efetivas, Viatura, Obra, Custo_Via, custo_dia }]
}
```

---

## Variáveis Globais Principais (definidas no `<script>` do index.html)
```js
let dashData = null;        // todos os dados, populado após getDashboardData()
let currentObra = null;     // nome da obra actualmente seleccionada
let currentSection = null;  // secção activa da sidebar
// Instâncias de gráficos (Chart.js) — sempre destruir antes de recriar:
//   dailyChart, weeklyChart, workersChart, fasesChart,
//   deslObraChart, deslTimeChart, equipaFuncaoChart, equipaTopChart,
//   compCustosChart, compRadarChart, compEvoChart,
//   compFaseCustoChart, compFaseHorasChart
```

---

## Secções do Dashboard (sidebar nav)
1. **Overview** — KPIs globais animados
2. **Obras** — selecção de obra + gráficos diário/semanal/mensal + workers + fases
3. **Deslocações** — custos e viagens por obra/origem
4. **Equipa** — colaboradores, assiduidade, ranking
5. **Comparativa** — análise entre obras, radar, evolução temporal
6. **Assiduidade** — heatmap estilo GitHub por colaborador e obra

---

## Fases de Obra (valores possíveis)
```
A - projetos
B - abertura estaleiro
C - movimentação terras
D - estrutura
E - paredes exteriores e interiores
F - capoto/isolamento
G - eletricidade
(podem existir outras)
```

---

## Convenções de Código OBRIGATÓRIAS

### Formatação
```js
// Moeda — sempre assim:
valor.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })

// Datas internas — sempre string "YYYY-MM-DD"
// Datas para display — converter para "DD/MM/YYYY"

// Horas — ex: 125.5 → "125h 30m"
function fmtHoras(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}

// Atrasos — minutos → "Xh Ym"
function fmtMinutos(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
```

### Gráficos Chart.js
```js
// SEMPRE destruir antes de recriar — nunca omitir este passo
if (window.xyzChart instanceof Chart) window.xyzChart.destroy();
window.xyzChart = new Chart(ctx, { ... });

// Cores padrão do tema
const CORES = {
  accent:   '#e94560',
  accent2:  '#ff6b6b',
  info:     '#63b3ed',
  success:  '#48bb78',
  warning:  '#f6ad55',
  muted:    '#a0aec0'
};
```

### Toasts / Feedback
```js
// Usar sempre para feedback ao utilizador
showToast('Mensagem', 'success');  // tipos: success | warning | error | info
```

### CSS Custom Properties (não alterar os nomes)
```css
--bg-dark, --bg-card, --bg-sidebar, --bg-hover
--accent, --accent2
--text, --text-muted, --text-dim
--border, --success, --warning, --info
--radius, --radius-sm
--sidebar-w, --sidebar-wc, --topbar-h
--transition
```

---

## Regras de Edição do index.html
- O ficheiro tem ~4100 linhas. Ao editar, **nunca reescrever blocos inteiros** sem necessidade.
- Usar `str_replace` ou edições cirúrgicas sempre que possível.
- Ao adicionar um novo gráfico: declarar a variável no topo do `<script>`, destruir no `destroyXxxCharts()` correspondente.
- Ao adicionar uma nova secção: criar o botão na sidebar, o painel HTML, e a lógica em `showSection()`.
- **Nunca** usar `document.write()`.
- **Nunca** usar `eval()`.
- **Nunca** adicionar `<script>` tags extra dentro de event handlers HTML inline; usar `addEventListener` ou funções globais referenciadas por `onclick`.

---

## Idioma
- Toda a UI em **Português europeu** (não brasileiro)
- Comentários no código podem ser em inglês ou português
- Labels, tooltips, mensagens de erro: sempre PT-PT
- Exemplos: "Guardar" não "Salvar", "Eliminar" não "Deletar", "Seleccionar" ou "Selecionar"

---

## Sheets do Google Sheets (backend — não alterar nomes)
| Constante GAS | Nome real da Sheet |
|---|---|
| SHEET_REGISTOS | `REGISTOS_POR_DIA` |
| SHEET_OBRAS | `OBRAS` |
| SHEET_COLAB | `COLABORADORES` |
| SHEET_VIAGENS | `VIAGENS_DIARIAS` |
| SHEET_DESLOCACOES | `REGISTO_DESLOCACOES` |

---

## O que NÃO fazer (aprendido com sessões anteriores)
- Não sugerir separar o index.html em múltiplos ficheiros (decisão tomada: manter num único ficheiro)
- Não usar `localStorage` para guardar dados de negócio (apenas preferências de UI como tema)
- Não fazer chamadas directas ao Google Sheets pelo frontend — tudo passa pelo `getDashboardData()`
- Não adicionar dependências CDN novas sem confirmação explícita
- Não reescrever funções existentes que funcionam — preferir estender

## Testes mobile
Testar sempre no Chrome mobile (Android/iOS).
Brave browser distorce o layout — não usar como referência.