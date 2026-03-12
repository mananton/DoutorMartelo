# Mapa Mensal / Pagamento - Especificacao Funcional

Estado: acordado funcionalmente, ainda nao implementado.
Ultima revisao: 2026-03-12

## Objetivo
Definir um novo mapa mensal read-only no dashboard para apoio ao fecho de pagamento mensal.

O objetivo e ter duas vistas complementares:
- uma vista-resumo no dashboard, orientada a consulta e conferencia rapida
- uma vista detalhada para impressao/exportacao PDF, visualmente proxima da folha usada hoje

## Ambito
- Global a empresa, nao por obra.
- Baseado em mes civil completo.
- Deve permitir preview a meio do mes.
- Continua a ser uma funcionalidade totalmente read-only.

## Modos do mapa
### 1. Provisorio
Usado quando o mes ainda esta em curso.

Regras:
- considera apenas os dias ja decorridos ou ja com dados disponiveis
- deve ser identificado visualmente como Provisorio
- pode ser exportado, mas com essa marcacao explicita

### 2. Fechado
Usado para o fecho mensal definitivo.

Regras:
- considera o mes civil completo
- deve ser identificado visualmente como Fechado
- corresponde ao documento final de apoio ao pagamento

## Criterio de inclusao
Um trabalhador entra no mapa se cumprir uma destas condicoes:
- tiver pelo menos 1 hora trabalhada valida no mes
- nao tiver horas validas, mas tiver pelo menos um registo mensal de F, FJ, Bxa ou Fer

Nota:
- trabalhadores com apenas Dsp e zero horas validas continuam fora do mapa

## Taxonomia de ausencias
- F = Injustificada
- FJ = Justificada
- Bxa = Baixa
- Fer = Ferias
- Dps = Dispensado

## Regras de apuramento diario
### 1. Trabalho normal
Se no dia existirem apenas horas validas:
- essas horas contam para o acumulado mensal
- a celula diaria mostra as horas do dia

Exemplos:
- 8
- 7:30
- 4

### 2. Falta/Justificada/Baixa/Ferias com horas no mesmo dia
Se no mesmo dia existirem horas > 0 e tambem F, FJ, Bxa ou Fer:
- as horas desse dia nao contam
- o dia conta apenas na ausencia respetiva
- a celula diaria mostra apenas o codigo da ausencia

### 3. Dispensado com horas no mesmo dia
Se no mesmo dia existir Dps, nao existir F/FJ/Bxa/Fer, e houver horas > 0:
- Dsp conta
- as horas desse dia nao contam
- a celula diaria deve mostrar apenas Dsp

Nota:
- Dsp anula qualquer hora do proprio dia para efeito do mapa mensal

### 4. Dispensado sem horas
Se existir Dps e nao houver horas:
- conta apenas Dps
- a celula diaria mostra Dps

### 5. Atrasos
- os atrasos nao alteram o calculo de Dias/Horas
- os atrasos aparecem apenas como informacao visual/resumo

## Regras de apuramento mensal
### Base de calculo
- 8 horas = 1 dia equivalente
- o calculo deve ser feito em minutos para evitar erros de arredondamento

### Formula recomendada
- minutos totais = soma das horas validas do mes x 60
- dias = parte inteira de minutos totais / 480
- resto = minutos totais % 480
- horas = parte inteira de resto / 60
- minutos = resto % 60

### Display recomendado
- 17 d
- 17 d + 4 h
- 17 d + 4 h 30 m

Exemplos:
- 20h = 2 d + 4 h
- 20h30 = 2 d + 4 h 30 m
- 7h30 = 0 d + 7 h 30 m

## Vista 1 - Tabela-resumo no dashboard
Esta vista nao deve copiar a folha antiga. Deve ser simples, compacta e orientada a conferencia.

### Colunas
1. Trabalhador
2. Dias
3. Horas
4. F
5. FJ
6. Bxa
7. Fer
8. Dps
9. Atrasos

### Regras visuais
- ordenar por defeito por nome do trabalhador, A-Z
- mostrar primeiro trabalhadores com horas validas
- dentro desse grupo, trabalhadores com Dsp ficam depois dos restantes, mantendo ordem alfabetica em ambos os subgrupos
- no fim, mostrar trabalhadores sem horas validas mas com F/FJ/Bxa/Fer, tambem por ordem alfabetica
- coluna Trabalhador fixa a esquerda quando possivel
- colunas numericas centradas
- cabecalho compacto
- sem grelha diaria nesta vista
- mostrar estado do mapa: Provisorio ou Fechado

### Comportamento esperado
- usada para consulta rapida no dashboard
- adequada para mobile e desktop
- sem replicar o detalhe visual da folha manual atual

## Vista 2 - PDF diario mensal completo
Esta vista deve aproximar-se bastante da folha usada hoje, mas com maior consistencia visual.

### Estrutura do topo
- Titulo: Mapa Mensal de Pagamento
- Empresa
- Mes e ano
- Estado: Provisorio ou Fechado
- Data/hora de emissao

### Cabecalho de duas linhas
#### Linha 1
- Nome
- uma coluna por cada dia do mes, identificada pelo dia da semana
- colunas finais de resumo:
  - Total Horas
  - Dias
  - F
  - FJ
  - Bxa
  - Fer
  - Dps
  - Atrasos

#### Linha 2
- Nomes na primeira coluna (ou vazio, conforme layout final)
- numeros dos dias do mes: 1, 2, 3, ..., 28/29/30/31

## Regras das colunas diarias
- o numero de colunas varia com o mes
- Sabado deve ter fundo amarelo
- Domingo deve ter fundo vermelho claro
- dias uteis ficam com fundo branco

### Abreviaturas recomendadas para dias da semana
- Seg
- Ter
- Qua
- Qui
- Sex
- Sab
- Dom

## Conteudo das celulas diarias
### Prioridade de display
1. Se houver F/FJ/Bxa/Fer:
- mostrar apenas o codigo da ausencia
- nao mostrar horas

2. Se houver Dsp:
- mostrar Dsp
- nao mostrar horas

3. Se houver apenas horas:
- mostrar horas

4. Se nao houver registo relevante:
- celula vazia

## Colunas finais do PDF
1. Total Horas
2. Dias
3. F
4. FJ
5. Bxa
6. Fer
7. Dps
8. Atrasos

## Exemplo simplificado de uma linha no PDF
Joao Silva | 8 |  | 8 | F | 8 | 7:30 | Dps/8 |  | ... | 154:30 | 19 | 1 | 0 | 0 | 2 | 1 | 45m

## Decisao de produto
A implementacao deve seguir um modelo hibrido:
- Dashboard = resumo mensal limpo
- PDF = mapa diario detalhado e proximo da folha atual

## Fora de ambito por agora
- edicao manual no dashboard
- correcao manual de registos a partir desta vista
- logica de pagamento liquido/salario final
- exportacao Excel

## Proximo passo recomendado
Com esta especificacao fechada, o passo seguinte e desenhar a estrutura tecnica minima para implementacao:
- payload mensal agregado no backend
- nova secao read-only no dashboard
- template HTML/CSS de impressao/exportacao PDF
