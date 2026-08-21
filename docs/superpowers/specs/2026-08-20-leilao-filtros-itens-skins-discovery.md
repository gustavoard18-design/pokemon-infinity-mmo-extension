# Discovery — filtros locais, itens e skins do leilão

**Data:** 2026-08-20  
**Status:** filtros parcialmente definíveis; itens/skins requerem captura

## Entendimento atual

O servidor aceita apenas os filtros já enviados por `auction.js`; filtros novos
devem operar no front sobre anúncios acumulados. Isso significa que “nenhum
resultado” pode significar “nenhum na amostra carregada”, não ausência global.
O bridge atualmente sanitiza apenas Pokémon e exclui itens/skins de `sellables`.

## Filtros locais candidatos

Reutilizar o contrato de `PokemonFilters` sobre campos já presentes: shiny,
item equipado, natureza, habilidade, avaliação, IV mínimo, tipo e ordenações
locais. A UI deve rotular `FILTRANDO N ANÚNCIOS CARREGADOS`, aplicar o filtro a
todas as páginas já obtidas e reaplicar quando o scroll acrescentar resultados.
Não buscar páginas indefinidamente para satisfazer um filtro local.

## Perguntas sobre filtros

1. Quais candidatos entram na primeira entrega e em que prioridade?
2. Filtro local deve conviver visualmente com filtros de servidor ou ficar numa
   seção “Resultados carregados”?
3. Quando zero resultados locais, oferecer “carregar próxima página” manual?

## Itens e skins: perguntas

1. Quais tabs/tipos (`pokemon`, `item`, `skin`) a API usa?
2. Comprar itens/skins entra no escopo ou apenas explorar/favoritar/anunciar?
3. Item/skin é empilhável? Anúncio tem quantidade, variante, raridade, slot ou
   vínculo com Pokémon?
4. Como funciona `sellables`, listagem, cancelamento, taxa e limites para cada
   tipo? A capacidade é compartilhada com Pokémon?
5. Quais avisos irreversíveis existem para skins equipadas/itens raros?
6. O card compartilhado comporta esses recursos ou precisam de cards próprios?

## Capturas necessárias (redigidas)

- Request/response de browse, mine, favorites e sellables para item e skin.
- Payload e resposta de list/cancel/favorite para cada tipo.
- Query params aceitos e exemplos de erros 400/401/403/409/429.
- Screenshots da tela nativa e regras de preço, taxa, quantidade e expiração.
- Identificadores estáveis, imagens/ícones e metadados localizáveis.

Remover token, cookie, nome do jogador e IDs de conta das amostras.

## Critério de prontidão

Filtros: fechar as três decisões. Itens/skins: obter a matriz completa de
payloads e regras; então produzir specs separados para explorar e anunciar.

