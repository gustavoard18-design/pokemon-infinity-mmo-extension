# Painel — Trava e Movimentação Segura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir travar o painel, ampliar áreas seguras de arrasto e recuperar posições inacessíveis.

**Architecture:** Um helper puro limita geometria; o shell centraliza todos os iniciadores de drag e consulta a preferência persistida.

**Tech Stack:** JavaScript DOM/Pointer Events, chrome.storage, CSS injetado.

**Spec:** `docs/superpowers/specs/2026-08-20-painel-trava-movimentacao-design.md`

## Global Constraints

- Não iniciar drag em elementos interativos nem iframes.
- Manter redimensionamento disponível quando travado.
- Botão de trava fica à esquerda de expandir.

---

### Task 1: Geometria recuperável

**Files:**
- Create: `components/panel-position.js`
- Create: `scripts/test-panel-position.js`
- Modify: `background.js`
- Modify: `scripts/build-chrome.sh`
- Modify: `scripts/build-firefox.sh`

**Interfaces:**
- Produces: `PokemonHelperPanelPosition.clamp({ top, right, width, height }, { width, height }, { headerHeight })`.

- [ ] Testar posições válidas e extrapoladas nos quatro lados; esperado inicial: módulo ausente.
- [ ] Implementar função pura que limita `top` a `[0, viewport.height-headerHeight]` e `right` a `[0, viewport.width-MIN_VISIBLE_WIDTH]`, com números inválidos voltando aos defaults.
- [ ] Adicionar o arquivo à ordem de injeção antes de `content.js` e ao `FILES` dos dois builds.
- [ ] Rodar `node scripts/test-panel-position.js`; esperado: PASS; commitar.

### Task 2: Preferência e botão de trava

**Files:**
- Modify: `data/extension-storage.js`
- Modify: `components/header-buttons.js`
- Modify: `content.js`

**Interfaces:**
- Produces: `panelLocked: false` e botão `.ph-lock-btn`.

- [ ] Adicionar teste de default/migração e ordem visual do botão; confirmar FAIL.
- [ ] Inserir `panelLocked:false` nos settings, botão antes de `.ph-maximize-btn`, `aria-pressed` e tooltip dinâmico.
- [ ] No clique, atualizar settings/storage sem alterar maximização.
- [ ] Rodar checks/harness e commitar.

### Task 3: Áreas de drag e clamp

**Files:**
- Modify: `content.js`

**Interfaces:**
- Consumes: `panelLocked` e `PokemonHelperPanelPosition.clamp`.

- [ ] Testar `isDragHandle(target)` para área vazia do header/status e rejeição de `button,a,input,select,textarea,[role=button],iframe`.
- [ ] Centralizar início de Pointer Events; abortar apenas drag quando travado.
- [ ] Aplicar clamp na restauração, em `pointermove`, `pointerup` e `window.resize`; persistir somente a posição já corrigida.
- [ ] Rodar `node --check content.js` e harness.
- [ ] Verificar manualmente trava, resize, maximização, status bar e viewport reduzido; documentar e commitar.

