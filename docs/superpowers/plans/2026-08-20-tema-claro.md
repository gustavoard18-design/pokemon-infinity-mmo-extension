# Tema Claro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disponibilizar tema claro global e persistente usando tokens semânticos.

**Architecture:** `pixel-theme.css` define os dois mapas; storage distribui a preferência; shell e iframes aplicam `data-theme` e observam mudanças.

**Tech Stack:** CSS custom properties, JavaScript, chrome.storage.

**Spec:** `docs/superpowers/specs/2026-08-20-tema-claro-design.md`

## Global Constraints

- Tema padrão permanece `dark`.
- Não estilizar a página do jogo.
- Não duplicar folhas completas por tema.

---

### Task 1: Contrato de tema

**Files:**
- Modify: `data/extension-storage.js`
- Modify: `components/settings-panel.js`
- Create: `components/theme.js`
- Modify: `background.js`
- Modify: `scripts/build-chrome.sh`
- Modify: `scripts/build-firefox.sh`

**Interfaces:**
- Produces: `uiPreferences.theme: 'dark'|'light'`; `PokemonHelperTheme.apply(theme, root?)` e `subscribe(listener)`.

- [ ] Testar default, normalização de valor inválido, aplicação de atributo e reação a storage; confirmar FAIL.
- [ ] Implementar módulo idempotente e toggle “Tema claro” nas configurações.
- [ ] Injetar `components/theme.js` depois de `data/extension-storage.js` e antes
  de `components/settings-panel.js`; adicionar o arquivo ao `FILES` dos dois
  pacotes para que o shell sempre tenha `PokemonHelperTheme` disponível.
- [ ] Garantir que valor inválido cai em `dark`.
- [ ] Rodar harness/`node --check`; commitar.

### Task 2: Tokens do tema claro

**Files:**
- Modify: `pixel-theme.css`
- Modify: `content.js`

**Interfaces:**
- Consumes: `[data-theme="light"]`.

- [ ] Inventariar com `rg -n "#[0-9a-fA-F]{3,8}|rgb\(" --glob '*.css' --glob '*.js'` e classificar cores estruturais versus dados.
- [ ] Criar tokens para fundo, superfície, texto, texto secundário, borda, controle, foco, sucesso, aviso e erro; substituir literais estruturais do shell.
- [ ] Definir mapa claro com texto escuro e aplicar atributo ao container do overlay.
- [ ] Conferir contraste com ferramenta do DevTools (mínimo WCAG AA para texto normal) e commitar.

### Task 3: Propagação aos iframes

**Files:**
- Modify: `content.js`
- Modify: `index.html`
- Modify: `battle.html`
- Modify: `chart.html`
- Modify: `myPokemons.html`
- Modify: `auction.html`

**Interfaces:**
- Consumes: mensagem `{ type:'pokemon-helper-theme', theme }`.

- [ ] Criar teste que simula cinco frames e exige envio inicial e atualização.
- [ ] Shell envia tema a frames carregados; cada página carrega `components/theme.js` antes do script da tela e aplica mensagens apenas do parent.
- [ ] Incluir o componente nos manifests/builds se os curingas atuais não o cobrirem.
- [ ] Rodar checks e testar troca ao vivo em todas as abas; commitar.

### Task 4: Auditoria visual e documentação

**Files:**
- Modify: CSS das telas somente onde tokens não bastarem
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`

- [ ] Percorrer matriz dark/light × encaixado/expandido × zoom min/max nas cinco telas e configurações.
- [ ] Corrigir apenas regressões encontradas, preservando cores semânticas.
- [ ] Repetir inventário de literais e justificar exceções em comentário.
- [ ] Atualizar documentação e commitar.
