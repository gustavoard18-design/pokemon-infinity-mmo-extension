# Discovery — internacionalização da extensão

**Data:** 2026-08-20  
**Status:** arquitetura compreendida; conteúdo e variantes requerem decisão

## Escopo confirmado

Traduzir somente a interface da extensão: shell, configurações e cinco iframes.
Não observar, substituir ou traduzir elementos da página do jogo. Idiomas alvo:
português do Brasil, inglês, espanhol e chinês.

## Direção técnica proposta

Criar um módulo local `PokemonHelperI18n` com catálogos JSON empacotados,
fallback `idioma escolhido -> pt-BR -> chave`, interpolação nomeada simples e
API `t(key, params)`. A preferência global é explícita e persistente. O shell
propaga o locale aos iframes; textos vindos do jogo (nomes, itens, habilidades)
permanecem como recebidos, salvo tabelas próprias já localizadas. Não usar API
de tradução, rede ou alteração automática do DOM do jogo.

## Perguntas obrigatórias

1. “Chinês” significa simplificado (`zh-CN`), tradicional (`zh-TW`) ou ambos?
2. Quem valida inglês, espanhol e chinês e qual é a fonte do glossário Pokémon?
3. Nomes oficiais de Pokémon, tipos, golpes, naturezas e habilidades devem ser
   traduzidos quando houver tabela local, ou permanecer como o jogo entrega?
4. Locale padrão segue navegador na primeira instalação ou continua `pt-BR`?
5. Textos de docs/README entram ou apenas UI executável?

## Dados e inventário necessários

- Catálogo de todos os literais visíveis, incluindo HTML, templates JS,
  tooltips, `aria-label`, erros e confirmações.
- Glossário aprovado para “Party”, “PC”, IV, Nature, shiny e termos do leilão.
- Regras de plural de cada locale e política para conteúdo interpolado.
- Fonte/cobertura de glifos chineses: Silkscreen provavelmente não cobre CJK;
  definir fallback empacotado ou fonte de sistema aceitável.
- Matriz visual com textos longos de espanhol/inglês e CJK em todos os zooms.

## Critério de prontidão

Responder as cinco perguntas, aprovar glossário e decidir fonte CJK. Depois,
criar uma spec de infraestrutura e planos incrementais por tela.

