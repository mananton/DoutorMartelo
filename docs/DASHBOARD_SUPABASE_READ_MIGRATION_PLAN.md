# Dashboard Supabase Read Migration Plan

Status: em execucao controlada
Last updated: 2026-03-27

## Objetivo

Definir a ordem tecnica mais segura para migrar a leitura da dashboard legacy em `src/` de Google Sheets para Supabase, sem partir o comportamento atual, sem depender de Railway, e mantendo a Google Sheet como fonte operacional principal.

## Resposta Curta

Sim, faz sentido migrar a leitura da dashboard para Supabase.

A ordem recomendada nao e:
- trocar logo o frontend
- nem desligar logo a leitura do Sheets

A ordem recomendada e:

1. melhorar a experiencia de loading atual com cache local
2. completar o espelho manual Sheets -> Supabase para todas as abas que a dashboard usa
3. criar uma segunda fonte de leitura server-side que devolva o mesmo payload atual
4. validar paridade entre `Sheets` e `Supabase`
5. ativar `Supabase` com fallback para `Sheets`
6. so depois otimizar mais a UI e os payloads

## Estado Atual Das Fases

- `Fase 0`: concluida
  - cache local do payload
  - restauro basico do estado da UI
  - reabertura mais suave no telemovel
- `Fase 1`: concluida
  - espelho manual fechado para as entidades runtime da dashboard
- `Fase 2`: concluida
  - contrato `raw_v2` mantido como fronteira estavel
- `Fase 3`: concluida
  - leitura Supabase criada no lado servidor GAS
- `Fase 4`: concluida
  - paridade `Sheets vs Supabase` validada com sucesso
- `Fase 5`: concluida
  - dashboard operacional com `Supabase` como origem preferida e fallback para `Sheets`
- `Fase 6`: em curso
  - cache derivado por periodo e lazy-build inicial ja implementados
  - continuam possiveis otimizacoes adicionais por secao/payload

## Porque Esta Ordem E A Mais Segura

Hoje a dashboard depende de 2 coisas pesadas ao mesmo tempo:

- leitura live de varias abas da Google Sheet
- agregacao/render de muitas secoes logo no arranque

Se trocarmos a origem dos dados sem fechar antes o contrato do payload e sem validar a paridade, o risco e:
- mostrar numeros diferentes
- perder comportamentos em secoes especificas
- culpar a Supabase por problemas que na verdade sao de frontend/render

## Principios Da Migracao

- A Google Sheet continua a ser a fonte operacional principal.
- A Supabase passa a ser uma fonte de leitura otimizada para a dashboard.
- O frontend deve continuar a receber o mesmo formato base de payload (`raw_v2`) durante a primeira fase da migracao.
- A troca de origem deve acontecer no lado servidor, nao primeiro no frontend.
- A dashboard deve mostrar claramente a hora da ultima sincronizacao bem sucedida quando passar a ler da Supabase.

## Situacao Atual

### Fonte de leitura da dashboard

Hoje a dashboard chama:
- `getDashboardData()` em `src/main.gs`

Hoje o GAS resolve a origem runtime por configuracao:
- `src/SupabaseRead.gs` quando a dashboard le o espelho Supabase
- `src/Composer.gs` + `src/Readers.gs` quando a dashboard le diretamente da Google Sheet ou entra em fallback

Depois o frontend normaliza e agrega tudo em:
- `buildDashboardFromRaw_()` em `src/js.html`

### Abas que a dashboard usa hoje

Ver documento de referencia:
- `docs/DASHBOARD_SHEET_FLOW.md`

As abas atualmente relevantes para a leitura runtime sao:

- `REGISTOS_POR_DIA`
- `COLABORADORES`
- `OBRAS`
- `REGISTO_DESLOCACOES`
- `FERIAS`
- `PESSOAL_EFETIVO`
- `MATERIAIS_MOV`
- `LEGACY_MAO_OBRA`
- `LEGACY_MATERIAIS` ou `MATERIAIS_LEGACY`
- `VIAGENS_DIARIAS`

### Cobertura atual do espelho manual

O espelho local/manual para Supabase ja cobre as entidades runtime da dashboard, incluindo:

- `OBRAS`
- `FERIAS`
- `VIAGENS_DIARIAS`
- `LEGACY_MATERIAIS`

Isto permitiu fechar a leitura runtime pela Supabase sem partir o contrato antigo do frontend.

## Fase 0 - Melhorar ja a UX de loading

### Objetivo

Reduzir a dor atual de loading no telemovel e no reabrir da app, sem ainda mudar a origem dos dados.

### Porque isto deve vir primeiro

No telemovel, quando a dashboard vai para segundo plano, o browser pode matar a pagina.
Quando a pagina volta, o `window.onload` corre novamente e faz novo loading completo.

O codigo atual nao tem um listener que force refresh ao voltar ao foreground.
O problema e que o browser volta mesmo a recarregar a pagina.

### Implementacao recomendada

Guardar localmente:

- ultimo payload valido recebido
- timestamp desse payload
- secao atual
- filtros de data ativos
- obra atual
- estado minimo de navegacao

### Comportamento esperado

Ao abrir:

1. tentar renderizar imediatamente a partir da cache local
2. mostrar badge discreto tipo `dados em cache`
3. em paralelo pedir dados novos
4. substituir a cache se o refresh for bem sucedido

### Beneficio

Mesmo que o browser destrua a pagina em segundo plano, a reabertura deixa de parecer um loading gigante, porque a app pode arrancar imediatamente com o ultimo estado guardado.

### Ficheiros alvo provaveis

- `src/js.html`

### Criterio de aceite

- Reabrir a dashboard no telemovel depois de troca de app mostra UI quase imediata com ultimo payload valido.
- O refresh live passa a ser incremental do ponto de vista do utilizador.

## Fase 1 - Fechar a cobertura do espelho manual para Supabase

### Objetivo

Garantir que todas as abas usadas pela dashboard existem tambem na Supabase com formato suficiente para reproduzir o payload atual.

### Tarefas

1. Estender `backend/scripts/sync_sheets_to_supabase.py` para incluir:
   - `OBRAS`
   - `FERIAS`
   - `VIAGENS_DIARIAS`
   - `LEGACY_MATERIAIS`

2. Criar as tabelas/migracoes SQL em Supabase que faltarem.

3. Definir chaves de deduplicacao e politica de espelho para estas entidades:
   - insert
   - update
   - delete do que ja nao existir na Sheet

4. Confirmar que o espelho continua read-only sobre a Google Sheet:
   - a sync le da Sheet
   - nao altera a Sheet

### Regra importante

O espelho deve continuar a preservar o raciocinio atual:
- `Sheets` = origem operacional
- `Supabase` = espelho estruturado para leitura

### Ficheiros alvo provaveis

- `backend/scripts/sync_sheets_to_supabase.py`
- `backend/sql/*.sql`

### Criterio de aceite

- Todas as entidades de `docs/DASHBOARD_SHEET_FLOW.md` relevantes para runtime existem em Supabase.
- Uma sync completa termina sem erros.

## Fase 2 - Congelar o contrato do payload da dashboard

### Objetivo

Evitar partir o frontend.

### Regra

A primeira leitura por Supabase deve devolver o mesmo contrato base de `buildRawData_()`:

- `registos`
- `obras_info`
- `colaboradores`
- `viagens`
- `deslocacoes`
- `ferias`
- `pessoal_efetivo`
- `materiais_mov`
- `legacy_mao_obra`
- `legacy_materiais`

### Porque isto e importante

Se mantivermos o mesmo payload:
- o frontend quase nao precisa de mudar
- conseguimos comparar `Sheets vs Supabase`
- reduzimos muito o risco da migracao

### Criterio de aceite

- Existe uma especificacao simples do payload esperado.
- Existe um construtor de payload Supabase compatível com o atual.

## Fase 3 - Criar leitura Supabase no lado servidor

### Objetivo

Trocar a origem dos dados sem obrigar o frontend a mudar logo.

### Arquitetura recomendada

Manter o frontend a chamar:
- `getDashboardData()`

Mas fazer `getDashboardData()` escolher a origem:

- `Sheets`
- `Supabase`

### Recomendacao tecnica

Criar uma nova via server-side em GAS, por exemplo:

- `buildRawDataFromSheets_()`
- `buildRawDataFromSupabase_()`

e depois:

- `getDashboardData()` usa uma flag/config para decidir qual chama

### Porque esta e a melhor opcao

- mantem o frontend estavel
- evita mexer logo na interface
- permite fallback simples
- nao depende de Railway
- usa Supabase como servico online diretamente

### Implementacao sugerida

Criar um novo modulo em `src/`, por exemplo:

- `src/SupabaseRead.gs`

responsavel por:

- ler as tabelas espelho na Supabase
- montar o mesmo payload raw atual
- devolver ao frontend exatamente a mesma estrutura base

### Seguranca

As credenciais de leitura para Supabase devem ficar no lado servidor GAS, em propriedades do script, nunca no frontend.

### Criterio de aceite

- Existe uma implementacao funcional de leitura `Supabase -> payload raw_v2`.
- O frontend continua a funcionar sem mudancas estruturais.

## Fase 4 - Validacao de paridade

### Objetivo

Confirmar que `Sheets` e `Supabase` produzem os mesmos resultados operacionais visiveis.

### Validacoes minimas

- KPI globais
- numero de obras visiveis
- custo total
- custo de mao de obra
- custo de deslocacoes
- custo de materiais
- horas totais
- faltas
- atrasos
- totais por obra
- comparativa por fase
- mapa mensal
- assiduidade

### Como validar

Criar uma rotina tecnica de comparacao para o mesmo periodo:

- `source=sheets`
- `source=supabase`

e comparar apenas valores de negocio, nao a ordem interna dos objetos.

### Criterio de aceite

- Diferencas explicadas ou corrigidas.
- Sem divergencias bloqueantes antes do cutover.

## Fase 5 - Ativar Supabase com fallback

### Objetivo

Fazer o primeiro cutover real sem risco desnecessario.

### Comportamento recomendado

- origem default = `supabase`
- se a leitura falhar, fallback automatico para `sheets`
- registo tecnico do erro
- mostrar indicador discreto de `ultima sync`

### Porque isto reduz risco

Se existir:
- problema de rede
- tabela em falta
- payload invalido

a dashboard continua operacional pelo caminho antigo.

### Criterio de aceite

- O utilizador final nao fica sem dashboard em caso de falha da nova fonte.

## Fase 6 - Otimizacoes depois do cutover

### Objetivo

Ganhar performance real, nao apenas trocar a origem dos dados.

### Melhorias recomendadas

1. Lazy render das secoes
   - nao fazer `buildAll()` pesado logo no arranque
   - renderizar primeiro `Overview`
   - carregar secoes restantes quando o utilizador as abre

2. Cache local do payload e do estado da UI
   - importante sobretudo para mobile

3. Possivel reducao de payload
   - se mais tarde fizer sentido

4. Pre-agregacoes especificas em Supabase
   - apenas depois de o contrato base estar estavel

### Nota importante

Trocar `Sheets` por `Supabase` melhora a leitura.
Mas se o frontend continuar a agregar e renderizar tudo de uma vez, a melhoria nao sera maxima.

## Ordem Resumida Recomendada

1. Cache local e reabertura suave no mobile
2. Completar espelho manual para todas as abas runtime
3. Criar leitor Supabase server-side com o mesmo payload
4. Validar paridade `Sheets vs Supabase`
5. Ativar `Supabase` com fallback para `Sheets`
6. Fazer lazy-load e outras otimizações de frontend

## O Que Nao Deve Ser Feito Primeiro

- nao trocar logo o frontend para um payload novo
- nao desligar logo a leitura por Sheets
- nao tentar otimizar todos os graficos antes de fechar a paridade
- nao assumir que so a mudanca para Supabase resolve toda a lentidao

## Principais Riscos

### Dados desatualizados

Risco:
- a dashboard passa a mostrar a fotografia da ultima sync, nao o estado live da Sheet

Mitigacao:
- mostrar `ultima sincronizacao`
- manter comando manual de sync simples

### Divergencia entre Sheet e Supabase

Risco:
- a dashboard mostrar numeros diferentes

Mitigacao:
- validacao de paridade
- ferramenta de comparacao tecnica

### Ganho de performance abaixo do esperado

Risco:
- trocar a origem mas manter muito processamento no frontend

Mitigacao:
- fase 6 de lazy render e cache local

## Criterios Finais De Sucesso

- A dashboard abre mais depressa do que hoje.
- O utilizador nao sente novo loading gigante ao reabrir no telemovel.
- Os numeros de negocio batem certo entre `Sheets` e `Supabase`.
- A dashboard continua funcional se a leitura Supabase falhar.
- A Sheet continua a ser a fonte operacional principal.

## Proximo Passo Recomendado

O proximo passo tecnico mais sensato e continuar a `Fase 6`, reduzindo trabalho repetido por secao e afinando ainda mais a performance do frontend agora que a leitura por Supabase e a paridade ja ficaram fechadas.
