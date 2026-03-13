# Plano Simples de Preparacao para Supabase

Estado: preparacao apenas. Sem mexer ainda na base de dados.
Ultima revisao: 2026-03-13

## Objetivo
Preparar a futura passagem parcial para Supabase sem partir o que hoje ja funciona com:
- Google Sheets
- Google Apps Script
- AppSheet
- dashboard atual

Ideia principal:
- nao trocar tudo de uma vez
- primeiro desenhar bem o mapa
- depois testar uma parte pequena

Analogia:
- antes de mudares de casa, primeiro fazes caixas com etiquetas
- so depois comecas a levar os moveis

## O que nao vamos fazer para ja
- nao vamos desligar o Google Sheets
- nao vamos mexer no AppSheet
- nao vamos criar ja a base de dados final
- nao vamos trocar o dashboard para ler de outro lado

## Fase 1 - Fazer o mapa do que existe hoje
Objetivo:
- perceber claramente o que entra no sistema e de onde vem

Tarefas:
- listar as folhas realmente importantes
- marcar quais sao operacionais e quais sao auxiliares
- confirmar quais campos sao mesmo obrigatorios
- assinalar problemas conhecidos de qualidade de dados

Resultado esperado:
- uma lista simples do tipo:
  - esta folha serve para isto
  - estes campos sao essenciais
  - estes problemas existem hoje

## Fase 2 - Escolher a primeira parte a mudar no futuro
Objetivo:
- decidir qual e a primeira parte pequena e segura para um teste futuro

Sugestao:
- comecar pela leitura de dados do dashboard
- nao comecar pelo input do AppSheet

Razao simples:
- mexer na leitura e menos arriscado do que mexer onde os utilizadores registam dados

Analogia:
- e melhor trocar primeiro o espelho do carro do que os travoes

Resultado esperado:
- decisao clara sobre qual sera a primeira "peca" a sair do Sheets no futuro

## Fase 3 - Desenhar o encaixe sem construir ainda
Objetivo:
- preparar o desenho da futura ligacao ao Supabase

Tarefas:
- decidir que folha iria para que tabela
- decidir nomes simples e estaveis
- definir o que precisa de continuar igual para o dashboard nao notar a diferenca

Regra importante:
- o dashboard, no futuro, deve receber os dados com formato o mais parecido possivel com o atual

Resultado esperado:
- um mapa simples de equivalencia:
  - folha atual
  - futura tabela
  - campos principais

## Fase 4 - Preparar um teste pequeno
Objetivo:
- deixar pronta a ideia do primeiro teste sem o executar ainda

Teste sugerido:
- copiar uma parte dos registos para o novo destino
- comparar os totais com o dashboard atual
- confirmar se os numeros batem certo

Resultado esperado:
- checklist curta do primeiro teste futuro

## Regra recomendada para a futura sincronizacao
Quando chegar a altura de ligar Sheets/AppSheet ao Supabase, a regra recomendada e esta:

- tentar enviar os dados logo apos cada alteracao
- se o envio falhar, nao partir a operacao
- guardar margem para nova tentativa

Em termos simples:
- o registo entra primeiro no sistema atual
- depois tenta seguir para o Supabase
- se naquele momento nao conseguir, o processo nao deve perder o dado nem bloquear quem esta a trabalhar

Analogia:
- o estafeta tenta entregar logo a encomenda
- se a porta estiver fechada, volta a tentar mais tarde

## Ordem recomendada
1. Conhecer bem o que existe hoje.
2. Escolher a primeira parte pequena a testar.
3. Desenhar o encaixe com Supabase.
4. So depois pensar em implementacao.

## Sinais de que estamos prontos para a fase seguinte
- os dados principais estao arrumados
- os campos obrigatorios estao claros
- ja sabemos qual e a primeira parte pequena a testar
- o dashboard atual esta estavel

## Proximo passo recomendado
Criar um documento curto a responder a estas 3 perguntas:
- que folhas sao mesmo essenciais hoje?
- qual e a primeira parte que um dia faria sentido tirar do Sheets?
- que formato o dashboard precisa de continuar a receber?
