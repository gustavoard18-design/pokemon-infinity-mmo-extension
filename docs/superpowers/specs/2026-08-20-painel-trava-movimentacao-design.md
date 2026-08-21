# Interface — trava e movimentação segura do painel

**Data:** 2026-08-20  
**Status:** pronto para implementação

## Objetivo

Evitar movimento acidental e impedir que a área de controle fique fora do
viewport. O botão de trava fica imediatamente à esquerda de expandir/maximizar.

## Comportamento

- Destravado: o painel pode ser arrastado pela área vazia do cabeçalho e pela
  barra de status inferior, sem iniciar arrasto sobre botões, links, inputs ou
  conteúdo dos iframes.
- Travado: nenhum ponto inicia arrasto; redimensionamento e expandir/minimizar
  continuam disponíveis.
- O botão expõe cadeado aberto/fechado, `aria-pressed` e tooltip; `panelLocked`
  persiste, padrão `false`.
- Toda restauração e todo fim de drag passam por `clampPanelToViewport`, mantendo
  ao menos o cabeçalho completo dentro da área visível. `resize`/mudança de tela
  também corrige a posição.
- Se dados antigos tiverem `top/right` inválidos, a abertura recupera o painel.

## Critérios de aceite

1. Botão aparece à esquerda de expandir e persiste entre reinjeções.
2. Cabeçalho vazio e status bar movem; controles e iframe não movem.
3. Travado não move, mas ainda redimensiona e expande.
4. Nenhum drag deixa o cabeçalho inacessível em qualquer borda.
5. Redução do viewport recupera automaticamente um painel fora da tela.

## Fora de escopo

Snap magnético, múltiplos monitores via APIs nativas e travar redimensionamento.

