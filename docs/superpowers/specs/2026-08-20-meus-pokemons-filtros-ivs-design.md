# Meus Pokémon — filtros por avaliação/habilidade e visualização de IVs

**Data:** 2026-08-20  
**Status:** pronto para implementação

## Entendimento atual

O filtro por faixas de Avaliação já existe em `PokemonFilters`, mas só aparece
quando a avaliação global está ativa. Falta filtro de Habilidade. A grade de IVs
já é compartilhada por `PokemonCard`; a tela de batalha ainda possui composição
própria. A solução deve consolidar a apresentação num componente, não copiar
markup da batalha.

## Filtros

- Avaliação: seleção múltipla por rótulo (`Ruim` a `Excelente`), semântica OR.
- Habilidade: busca com autocomplete e chips, seleção múltipla OR, comparação
  por slug normalizado e rótulo hidratado por `PokemonAbilityInfo`.
- Avaliação e Habilidade combinam por AND com os demais grupos de filtros.
- Só oferecer habilidades presentes na lista ativa (real ou importada), em
  ordem alfabética; habilidades desconhecidas continuam filtráveis.
- Ao desligar Avaliação nas configurações, ocultar e limpar critérios aplicados
  de avaliação para não manter filtro invisível.

## Componente de IVs

Extrair uma API de apresentação compartilhada em `PokemonCard.ivGrid(viewModel,
options)`, com `options.showStats` (padrão `false` para preservar consumidores).
Quando `true`, cada célula mostra IV e status calculado disponível; quando
`false`, mostra somente IV. A batalha passa a usar essa API com
`showStats: true`; Meus Pokémon ganha um controle persistente “Mostrar status
com IVs”, padrão desligado. Leilão permanece somente IV nesta entrega.

## Critérios de aceite

1. É possível combinar várias avaliações e habilidades com filtros existentes.
2. Opções de habilidade refletem a lista ativa e não duplicam aliases/capitalização.
3. Limpar filtros remove chips e critérios novos.
4. Desligar avaliação nunca deixa a lista vazia por um filtro oculto.
5. Batalha e Meus Pokémon usam o mesmo renderer de IVs.
6. O toggle de status reflete imediatamente, persiste e não altera o leilão.
7. Importação/exportação e agrupamento continuam funcionando.

## Fora de escopo

Filtro por tags funcionais de habilidade, edição de IVs e alteração do algoritmo
de Avaliação.

