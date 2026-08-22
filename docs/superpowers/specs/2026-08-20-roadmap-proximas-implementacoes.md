# Roadmap de próximas implementações

**Data:** 2026-08-20  
**Status:** documentação inicial aprovada  
**Escopo:** extensão Infinity MMO; nenhuma alteração no DOM ou no código do jogo

## Documentos prontos para implementação

| Prioridade | Domínio | Spec | Plano |
|---|---|---|---|
| P0 | Alerta de shiny em batalha | `2026-08-20-batalha-alerta-shiny-design.md` | `../plans/2026-08-20-batalha-alerta-shiny.md` |
| P0 | Permissão para requests do leilão | `2026-08-20-permissao-requisicoes-leilao-design.md` | `../plans/2026-08-20-permissao-requisicoes-leilao.md` |
| P1 | Filtros e IVs em Meus Pokémon | `2026-08-20-meus-pokemons-filtros-ivs-design.md` | `../plans/2026-08-20-meus-pokemons-filtros-ivs.md` |
| P1 | Trava e movimentação segura do painel | `2026-08-20-painel-trava-movimentacao-design.md` | `../plans/2026-08-20-painel-trava-movimentacao.md` |
| P2 | Tema claro | `2026-08-20-tema-claro-design.md` | `../plans/2026-08-20-tema-claro.md` |

P0 trata risco de perda de shiny e torna explícita a autorização de acesso ao
leilão. P1 melhora fluxos frequentes sem depender de novos contratos externos.
P2 é independente, mas tem superfície visual maior.

## Specs que exigem refinamento

| Dependência sugerida | Spec | Motivo do bloqueio |
|---|---|---|
| Depois da permissão de requests | `2026-08-20-leilao-filtros-itens-skins-discovery.md` | payloads e endpoints de itens/skins ainda desconhecidos |
| Antes de traduzir telas | `2026-08-20-internacionalizacao-discovery.md` | variante chinesa, glossário e catálogo de textos |
| Antes de mudar os alarmes | `2026-08-20-refresh-wiki-discovery.md` | “tamanho” e semântica de mudança precisam ser definidos |

## Regras transversais

- HTML/CSS/JS puro, sem dependências ou build de desenvolvimento.
- Chrome e Firefox devem continuar equivalentes.
- Não alterar a versão dos manifests fora de uma release.
- Manter identificadores internos legados `pokemon-helper-*`/`pkmn-helper-*`.
- Toda mudança visual precisa ser conferida encaixada, expandida e com zoom.
- Tradução futura cobre somente a extensão.
- Nenhum token do jogo é persistido; a permissão do leilão é um booleano.
