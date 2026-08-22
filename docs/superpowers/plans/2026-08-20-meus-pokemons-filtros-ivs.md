# Meus Pokémon — Filtros e IVs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtrar por avaliação e habilidade e compartilhar a apresentação de IVs entre Meus Pokémon e Batalha.

**Architecture:** `PokemonFilters` recebe opções de habilidade e devolve slugs selecionados; `myPokemons.js` aplica o predicado. `PokemonCard.ivGrid` torna-se a API única de IVs com opção de status.

**Tech Stack:** JavaScript/DOM, chrome.storage, Node harness existente.

**Spec:** `docs/superpowers/specs/2026-08-20-meus-pokemons-filtros-ivs-design.md`

## Global Constraints

- Preservar o payload e o algoritmo de avaliação atuais.
- Defaults devem migrar configurações antigas por merge profundo.
- Leilão continua mostrando somente IVs.

---

### Task 1: Contrato puro dos novos filtros

**Files:**
- Modify: `components/pokemon-filters.js`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Produces: `mount(container, callbacks, { abilities })`; valores incluem `abilitySlugs: string[]`.

- [ ] Adicionar testes falhando para defaults (`abilitySlugs: []`), normalização/deduplicação e limpeza de avaliação oculta.
- [ ] Rodar `node scripts/test-pokemon-evaluation.js`; esperado: FAIL nas novas asserções.
- [ ] Implementar helpers puros `normalizeAbilitySlug` e `normalizeAbilityOptions`, exportados no objeto `PokemonFilters` para teste.
- [ ] Estender `defaultValues`, `getValues` e `clear` com `abilitySlugs`.
- [ ] Rodar o teste; esperado: PASS, e commitar `feat: adiciona contrato de filtro por habilidade`.

### Task 2: UI e aplicação do filtro de habilidade

**Files:**
- Modify: `components/pokemon-filters.js`
- Modify: `components/pokemon-filters.css`
- Modify: `myPokemons.js`

**Interfaces:**
- Consumes: `abilitySlugs` e `{ slug, label }[]`.

- [ ] Criar teste DOM/harness que seleciona duas habilidades, exige OR entre elas e AND com avaliação.
- [ ] Confirmar falha antes da UI.
- [ ] Reutilizar o padrão de autocomplete/chips de Natureza com IDs exclusivos `filter-ability-*`; montar opções a partir de `DATA_STATE.sourcePokemon`.
- [ ] Em `pokemonPassesFilters`, rejeitar quando `abilitySlugs.length > 0` e o slug do view model não estiver selecionado.
- [ ] Ao desligar avaliação, remover `ratingLabels` de `FILTER_STATE.applied` antes de reprocessar.
- [ ] Rodar harness e `node --check components/pokemon-filters.js myPokemons.js`; esperado: exit 0.
- [ ] Verificar lista real/importada, limpar e combinação de filtros; commitar.

### Task 3: API compartilhada de IVs

**Files:**
- Modify: `components/pokemon-card.js`
- Modify: `components/pokemon-card.css`
- Modify: `battle.js`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Produces: `PokemonCard.ivGrid(viewModel, { showStats?: boolean }) -> string`.

- [ ] Escrever teste falhando: sem opção não contém status; com `showStats:true` contém valor de `viewModel.stats[stat]` e mantém IV.
- [ ] Rodar teste e confirmar FAIL.
- [ ] Implementar a opção sem mudar o markup padrão dos consumidores.
- [ ] Carregar `components/pokemon-card.js` e CSS em `battle.html`, converter o view model do oponente e remover a grade duplicada de `battle.js`.
- [ ] Rodar testes e `node --check`; esperado: exit 0.
- [ ] Verificar visualmente batalha e leilão; commitar `refactor: compartilha componente de ivs`.

### Task 4: Preferência de status em Meus Pokémon

**Files:**
- Modify: `data/extension-storage.js`
- Modify: `components/settings-panel.js`
- Modify: `myPokemons.js`

**Interfaces:**
- Produces: `screens.myPokemons.showStatsWithIvs: false`.

- [ ] Adicionar asserção de default/migração no harness existente e confirmar FAIL.
- [ ] Criar a preferência e toggle “Mostrar status com IVs” em Configurações.
- [ ] Passar `{ showStats: SCREEN_PREFS.showStatsWithIvs }` ao renderer de Meus Pokémon e re-renderizar no `storage.onChanged`.
- [ ] Rodar testes, `node --check` e conferir toggle imediato/persistente.
- [ ] Atualizar `README.md`/`docs/DEVELOPMENT.md` e commitar.

