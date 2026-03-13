# Mapa Simples para Preparacao Supabase

Estado: preparacao apenas
Ultima revisao: 2026-03-13

## Objetivo
Responder de forma simples a 3 perguntas:
- que folhas sao mesmo essenciais hoje?
- qual seria a primeira parte que um dia faria sentido tirar do Sheets?
- que formato o dashboard precisa de continuar a receber?

## 1. Folhas realmente essenciais hoje

### Essenciais
Estas sao as folhas que alimentam diretamente o dashboard atual:

- `REGISTOS_POR_DIA`
  - e a folha mais importante
  - guarda os registos diarios de trabalho
  - alimenta horas, custos, faltas, fases e mapa mensal

- `OBRAS`
  - diz que obras existem
  - ajuda a mostrar estado ativo/inativo e dados base de cada obra

- `COLABORADORES`
  - guarda nomes, funcao e custo por hora
  - serve para completar e corrigir dados dos registos

- `REGISTO_DESLOCACOES`
  - alimenta a area de deslocacoes e parte dos custos

- `FERIAS`
  - alimenta a area de ferias

- `MATERIAIS_MOV`
  - alimenta custos e tabelas de materiais

### Importantes, mas menos centrais para uma primeira passagem
- `VIAGENS_DIARIAS`
  - entra em alguns totais e leituras auxiliares

- `NAO_REGISTADOS_HIST`
  - e mais operacional do que central
  - pode esperar numa primeira fase

## 2. Qual e a primeira parte que faria sentido tirar do Sheets um dia

### Resposta curta
A primeira parte a tirar do Sheets deve ser a **leitura do dashboard**.

### Porque esta e a melhor primeira peca
Porque e a parte menos arriscada.

Em linguagem simples:
- registar dados no AppSheet mexe com a operacao do dia a dia
- ler dados para mostrar no dashboard e mais seguro para testar

Analogia:
- e melhor mudar primeiro o quadro de leitura do carro
- do que mexer logo no pedal do travao

### O que isso quer dizer na pratica
Nao quer dizer trocar tudo.

Quer dizer:
- continuar a usar Sheets + AppSheet para registar
- preparar uma futura leitura paralela para o dashboard
- comparar resultados
- so depois decidir se vale a pena continuar

## 3. Que formato o dashboard precisa de continuar a receber

### Ideia principal
O dashboard deve continuar a receber os dados num formato o mais parecido possivel com o atual.

Isto e importante porque:
- evita partir o frontend
- reduz retrabalho
- permite trocar a origem dos dados sem refazer tudo

### Em termos simples
Hoje o dashboard recebe um pacote de dados com blocos como:
- `global`
- `obras`
- `obras_info`
- `colaboradores`
- `registos`
- `deslocacoes`
- `ferias`
- `materiais_mov`

No futuro, mesmo que os dados venham de outro sitio, o dashboard idealmente deve continuar a receber quase isto.

Analogia:
- podemos mudar o armazem
- mas a encomenda deve chegar com a mesma etiqueta e a mesma divisao de caixas

## Conclusao pratica

Se um dia avancarmos para Supabase, a ordem mais segura e:

1. manter o registo diario no Sheets/AppSheet
2. preparar uma nova fonte de leitura para o dashboard
3. garantir que o dashboard recebe o mesmo tipo de pacote de dados
4. so depois pensar em mudar outras partes

## Regra simples de funcionamento futuro

### Como os dados devem andar
- AppSheet continua a escrever na Google Sheet
- edicoes manuais podem continuar a ser feitas na Google Sheet
- depois disso, o sistema tenta enviar esses dados para o Supabase
- o dashboard, mais tarde, passa a ler do Supabase

### Qual e o modo recomendado
O modo recomendado e:
- envio automatico quase em tempo real
- com nova tentativa se falhar

### Porque esta e a melhor opcao para este projeto
- mantem o trabalho diario como esta hoje
- deixa o dashboard mais atualizado
- evita depender de uma mudanca brusca na operacao
- nao obriga a trocar AppSheet logo no inicio

## Proximo passo recomendado
Quando quiseres avançar, o passo mais util sera criar um documento ainda mais concreto com 3 colunas:
- folha atual
- futura tabela
- campos principais

Esse sera o primeiro desenho serio antes de qualquer migracao.
