# Skill: GAS-HTML Integration Specialist

## Padrão de Comunicação (The Bridge)
- **Frontend -> Backend:** Nunca gerar código que use `fetch`. Usar estritamente `google.script.run`.
- **Backend -> Frontend:** As respostas do `main.gs` devem ser sempre objetos JSON serializados ou objetos simples.
- **Tratamento de Erros:** Toda a chamada no `index.html` deve implementar `.withFailureHandler(msg => alert(msg))`.

## Gestão de Dados (Construção Civil)
- Ao lidar com "Orçamentos" ou "Medições", garantir precisão decimal (tratamento de arredondamentos em JS vs GAS).
- O backend (`main.gs`) deve centralizar a lógica de saneamento dos dados vindos do AppSheet.

## Otimização de Performance
- Proibir chamadas ao Sheets dentro de loops `for`.
- Utilizar `cacheService` para dados que não mudam a cada segundo (ex: tabelas de preços de materiais).