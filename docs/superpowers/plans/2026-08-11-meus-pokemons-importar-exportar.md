# Meus Pokémon — importar/exportar e ajustes de leitura — Plano de Implementação

**Goal:** Exportar a lista completa de Pokémon como JSON, importar um arquivo no
mesmo modelo para visualizar a lista de outra pessoa na mesma tela, e três
ajustes de leitura: toggle global de golpes, barra colorida por IV e link do
Smogon configurável.

**Architecture:** HTML/CSS/JS sem build. Serialização/validação isoladas em
`components/pokemon-transfer.js` (sem DOM, sem `chrome.*`); `myPokemons.js` cuida
de UI e estado. A lista importada substitui `LOCAL_PAYLOAD` no render sem nunca
tocar em `chrome.storage`.

**Spec:** `docs/superpowers/specs/2026-08-11-meus-pokemons-importar-exportar-design.md`

---

## Fase 1 — Ajustes de leitura (independentes, baixo risco)

### Task 1: Barra colorida por IV

**Files:**
- Modify: `components/pokemon-card.js`
- Modify: `components/pokemon-card.css`

- [x] Em `ivGrid`, renderizar por atributo: rótulo, `<span class="px-bar">` com
  `px-bar-fill` em `width: round(iv/31*100)%` e cor de `ivStatColor(iv)`, e o
  número já existente.
- [x] Manter as faixas atuais (`>=26` bom, `>=15` médio, resto ruim) e adicionar
  `data-tip` por célula (`HP — IV 31/31`), como no Encontro.
- [x] CSS: `.pokemon-iv .px-bar { width: 78%; }`, mantendo a grade de 6 colunas e
  a altura compacta do cartão recolhido/expandido.
- [x] Conferir que o Leilão (`auction.js`, três chamadas de `ivGrid`) herda a
  barra — o view model de lá também traz `ivs` com as seis chaves.

### Task 2: Toggle global de golpes

**Files:**
- Modify: `myPokemons.html`
- Modify: `myPokemons.js`

- [x] Adicionar `<button id="toggle-moves" class="px-btn" aria-pressed="true">`
  em `.pokemon-toolbar-actions`, com `data-tip` explicando o que some.
- [x] Novo campo `showMoves: true` em `UI_STATE` (sessão, não persistido).
- [x] `renderPokemonCard` só concatena `renderMoveDetails(viewModel)` quando
  `UI_STATE.showMoves`.
- [x] Handler de clique inverte o estado, atualiza `aria-pressed` e re-renderiza.
- [x] `syncGlobalControls` mantém o `aria-pressed` coerente após re-render.

### Task 3: Link do Smogon — componente e preferência

**Files:**
- Create: `components/pokemon-transfer.js`
- Modify: `data/extension-storage.js`
- Modify: `components/settings-panel.js`

- [x] Criar `components/pokemon-transfer.js` com o IIFE/global no padrão dos
  outros componentes (`var X = globalThis.X || (() => {...})()`).
- [x] Implementar `smogonUrl(name)`: normaliza NFD sem acentos, minúsculas,
  `♀`→`-f`, `♂`→`-m`, remove `'` e `.`, troca espaço/`_` por `-`, colapsa `-`
  repetidos e apara as pontas; devolve `null` para nome vazio.
- [x] Base do link: `https://www.smogon.com/dex/sm/pokemon/<slug>/`.
- [x] `data/extension-storage.js`: `showSmogonLink: true` em
  `DEFAULT_UI_PREFERENCES.screens.myPokemons` (o merge profundo já existente
  cuida das configs antigas sem o campo).
- [x] `settings-panel.js`: linha "Link do Smogon" em TELAS → MEUS POKÉMON, com
  `ph-mp-smogon` + `bindPrefToggle`, seguindo o par de linhas já existente.

### Task 4: Link do Smogon — renderização no cartão

**Files:**
- Modify: `components/pokemon-card.js`
- Modify: `components/pokemon-card.css`
- Modify: `myPokemons.html`
- Modify: `myPokemons.js`

- [x] `PokemonCard.render`: novo slot `options.nameBadgesHtml`, injetado na linha
  do nome logo após gênero e shiny. Sem o slot, markup idêntico ao atual.
- [x] `myPokemons.js` monta o selo quando `SCREEN_PREFS.showSmogonLink` e
  `smogonUrl(nome)` não é nulo:
  `<span class="smogon-link" role="link" tabindex="0" data-smogon="URL" data-tip="Abrir no Smogon — build, stats e estratégias">S</span>`.
- [x] No delegador de clique de `#content`, tratar `.smogon-link` **antes** de
  `.pokemon-card-toggle`, com `stopPropagation()` e
  `window.open(url, '_blank', 'noopener')`.
- [x] Teclado: `Enter`/`Espaço` sobre o selo abrem o link e não propagam para o
  botão do cartão.
- [x] O listener de `chrome.storage.onChanged` passa a chamar `render()` depois
  de atualizar `SCREEN_PREFS`, para o toggle refletir sem recarregar.
- [x] CSS `.smogon-link`: selo monoespaçado ~8px, `padding: 1px 4px`, fundo
  `--px-bg-btn2`, cor `--px-text-dim`, hover em `--px-accent`, `cursor: pointer`,
  `flex: 0 0 auto` para não competir com o ellipsis do nome.
- [x] `myPokemons.html` carrega `components/pokemon-transfer.js` antes de
  `myPokemons.js`.

---

## Fase 2 — Exportar e importar

### Task 5: Serialização e validação

**Files:**
- Modify: `components/pokemon-transfer.js`

- [x] `FORMAT = 'infinity-mmo-extension/my-pokemons'`, `VERSION = 1`.
- [x] `sanitizePokemon(entry)`: whitelist da spec — `name`, `species`, `level`,
  `gender`, `shiny`, `nature`, `ability`, `heldItem`, `types[]`, `ivs` e `stats`
  (chaves `hp/atk/def/spa/spd/spe`), `moves[{name,type,category,pp}]`. IVs com
  clamp 0–31; números via `Number()` com fallback; strings via `String()`;
  entradas nulas devolvem `null`.
- [x] `buildExport(payload)`: `{ format, version, exportedAt, party, pc }`, com
  `party` sanitizada e `pc` como `[{ name, pokemon: [...] }]`.
- [x] `parse(text)`: `JSON.parse` protegido; raiz precisa ser objeto não-array;
  `party`/`pc`, quando presentes, precisam ser arrays; devolve
  `{ ok: true, payload: { party, pc }, count }` já sanitizado, ou
  `{ ok: false, error: 'json' | 'shape' | 'empty' }`.
- [x] Aceitar tanto o envelope quanto `{ party, pc }` cru; `version` desconhecida
  não bloqueia.
- [x] `filename(date)` → `meus-pokemons-AAAA-MM-DD.json`.
- [x] Exportar tudo congelado em `Object.freeze({...})`, como os componentes
  vizinhos.

### Task 6: UI de exportar/importar

**Files:**
- Modify: `myPokemons.html`
- Modify: `myPokemons.js`

- [x] `myPokemons.html`: botões `#export-pokemon` e `#import-pokemon` na fita de
  ações, `<input type="file" id="import-file" accept="application/json,.json"
  hidden>`, `<p id="transfer-status" class="transfer-status" hidden></p>` e a
  faixa `#imported-banner` (rótulo + botão VOLTAR AOS MEUS), oculta por padrão.
- [x] CSS local para `.transfer-status` (mono 10px, cor por
  `data-kind="ok|erro"`) e `.imported-banner` (borda `--px-accent`, fita fina).
- [x] Exportar: `PokemonTransfer.buildExport(activePayload())` →
  `JSON.stringify(obj, null, 2)` → `Blob` → `URL.createObjectURL` → âncora com
  `download` → clique → `revokeObjectURL`. Falha vai para
  `navigator.clipboard.writeText` com mensagem própria.
- [x] Botão de exportar desabilitado enquanto a lista ativa não tiver Pokémon;
  reavaliar a cada render.
- [x] Importar: `FileReader.readAsText`, `PokemonTransfer.parse`, e em caso de
  erro exibir a mensagem da spec **sem** trocar a lista visível.
- [x] Limpar `input.value` após cada leitura, para reimportar o mesmo arquivo.

### Task 7: Modo importado

**Files:**
- Modify: `myPokemons.js`

- [x] `IMPORT_STATE = { active: false, fileName: '', payload: null }`.
- [x] `activePayload()` devolve `IMPORT_STATE.payload` quando ativo, senão
  `LOCAL_PAYLOAD`; `rebuildDataState` passa a consumir essa função.
- [x] O listener de `character-data` continua atualizando `LOCAL_PAYLOAD`, mas só
  reconstrói/renderiza quando `IMPORT_STATE.active` é falso.
- [x] Entrar/sair do modo importado limpa `UI_STATE.expandedPokemon`,
  `UI_STATE.fullCollapsed` e `UI_STATE.knownGroups`, e zera
  `UI_STATE.initialized` para os defaults de expansão valerem na lista nova.
- [x] A faixa mostra `LISTA IMPORTADA · <arquivo>`; VOLTAR AOS MEUS zera
  `IMPORT_STATE` e re-renderiza com `LOCAL_PAYLOAD`.
- [x] Filtros e busca continuam operando sobre a lista ativa, seja qual for.

---

## Fase 3 — Verificação e documentação

### Task 8: Verificação

**Files:** nenhum

Feito nesta sessão, fora do navegador:

- [x] `node --check` em todos os arquivos JS alterados.
- [x] Harness temporário (stub de DOM + `chrome.*`) rodando o pipeline real de
  `myPokemons.js`: 24 verificações cobrindo render inicial, barra por IV, selo do
  Smogon (inclusive `Farfetch'd`), toggle de golpes, exportação (envelope e
  ausência de campos internos), parse de arquivo inválido, entrada/saída do modo
  importado e o desligamento do selo pela configuração. O harness ficou fora do
  repositório — o projeto não tem suíte de testes configurada.
- [x] Revisão de código do Leilão (`auction.js`), que usa `ivGrid` e o slot
  `badgesHtml`, distinto do novo `nameBadgesHtml`.

Pendente com o usuário, exige navegador:

- [ ] Carregar sem compactar no Chrome e percorrer os 12 critérios de aceite da
  spec, em especial o download real dentro do iframe e a abertura do Smogon.
- [ ] Conferir o layout da barra de ferramentas com cinco botões no painel
  encaixado (250–380px) e a grade de IVs do Leilão com a barra nova.
- [ ] Conferir no `chrome://extensions` que nenhum erro novo aparece no console.

### Task 9: Documentação

**Files:**
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`

- [x] README: na seção "Meus Pokémon", documentar exportar/importar (incluindo
  que a lista importada é temporária), o toggle de golpes, a barra de IV e o link
  do Smogon; em "Configurações", a linha "Link do Smogon".
- [x] DEVELOPMENT: registrar `components/pokemon-transfer.js` na tabela de
  componentes e descrever o formato do arquivo em uma linha.
- [x] Não alterar a versão dos manifests.
