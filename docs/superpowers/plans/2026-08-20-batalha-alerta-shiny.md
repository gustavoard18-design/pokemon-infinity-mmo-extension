# Batalha — Alerta Shiny Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar um encontro shiny imediatamente reconhecível por texto, forma e cor.

**Architecture:** `battle.js` deriva uma chave visual do oponente e renderiza o alerta sem mudar o contrato de mensagens. CSS local fornece destaque finito e respeita movimento reduzido.

**Tech Stack:** JavaScript, HTML/CSS, Node para harness sem dependências.

**Spec:** `docs/superpowers/specs/2026-08-20-batalha-alerta-shiny-design.md`

## Global Constraints

- Não usar `state.over` dentro de `battle.js`.
- Não alterar manifests ou versão.
- Não depender somente de cor.

---

### Task 1: Derivação do alerta shiny

**Files:**
- Create: `scripts/test-battle-shiny.js`
- Modify: `battle.js`

**Interfaces:**
- Produces: `shinyVisualState(foe, battleId, activeIndex) -> { visible, key, entering }`

- [ ] **Step 1: Escrever teste falhando** para comum, primeiro shiny, payload repetido e troca de oponente; carregar `battle.js` em `vm` com stubs mínimos e verificar a função exportada no harness.
- [ ] **Step 2: Rodar** `node scripts/test-battle-shiny.js`; esperado: FAIL porque `shinyVisualState` não existe.
- [ ] **Step 3: Implementar estado mínimo** com chave ``${battleId || 'battle'}:${activeIndex ?? 0}:${normalizeSpecies(foe.species || foe.name)}`` e um `Set` de chaves já anunciadas, limpo por `resetBattle`.
- [ ] **Step 4: Rodar** `node scripts/test-battle-shiny.js`; esperado: todos os casos PASS.
- [ ] **Step 5: Commit** `git add battle.js scripts/test-battle-shiny.js && git commit -m "feat: destaca encontro shiny"`.

### Task 2: Render e acessibilidade

**Files:**
- Modify: `battle.js`
- Modify: `battle.html`

**Interfaces:**
- Consumes: `shinyVisualState(...)` da Task 1.

- [ ] **Step 1: Ampliar o harness** para exigir `role="alert"`, texto `SHINY ENCONTRADO`, classe `enc-card--shiny` e ausência total em comum.
- [ ] **Step 2: Rodar o teste** e confirmar FAIL nos seletores novos.
- [ ] **Step 3: Renderizar** banner antes do card, selo `SHINY` junto ao nome e classes `enc-card--shiny`/`enc-card--shiny-entering`.
- [ ] **Step 4: Adicionar CSS** de borda dourada, banner com alto contraste, `animation-iteration-count: 3` e bloco `@media (prefers-reduced-motion: reduce)` removendo animação.
- [ ] **Step 5: Rodar** `node --check battle.js` e `node scripts/test-battle-shiny.js`; esperado: exit 0.
- [ ] **Step 6: Verificar manualmente** comum/shiny, troca de oponente, painel encaixado/expandido e zoom extremo.
- [ ] **Step 7: Documentar** o alerta em `README.md` e commitar com `git commit -m "docs: documenta alerta de shiny"`.

