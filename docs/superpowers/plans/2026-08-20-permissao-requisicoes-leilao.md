# Permissão de Requests do Leilão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir autorização explícita antes de a extensão capturar credencial em memória e fazer requests ao leilão.

**Architecture:** O booleano persistido vive nas preferências; o content script o sincroniza com o MAIN world sem transportar segredo. O interceptor aplica o bloqueio na captura e em cada comando, enquanto o iframe representa `disabled|waiting|ready`.

**Tech Stack:** JavaScript, chrome.storage.local, CustomEvent/postMessage, Node harness.

**Spec:** `docs/superpowers/specs/2026-08-20-permissao-requisicoes-leilao-design.md`

## Global Constraints

- Persistir somente `auctionRequestsEnabled:boolean`, nunca token/header.
- Requests nativas do jogo não podem ser alteradas ou bloqueadas.
- Manter a allowlist e validações atuais do bridge.

---

### Task 1: Preferência e configuração

**Files:**
- Modify: `data/extension-storage.js`
- Modify: `components/settings-panel.js`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Produces: `uiPreferences.auctionRequestsEnabled: boolean` com default `false`.

- [ ] Adicionar teste falhando para default `false` e merge de configuração antiga.
- [ ] Rodar `node scripts/test-pokemon-evaluation.js`; esperado: FAIL.
- [ ] Implementar o default e a seção LEILÃO com toggle `ph-auction-requests` e o texto da spec.
- [ ] Rodar o teste; esperado: PASS.
- [ ] Commit: `git add data/extension-storage.js components/settings-panel.js scripts/test-pokemon-evaluation.js && git commit -m "feat: adiciona permissão de acesso ao leilão"`.

### Task 2: Sincronização segura com o MAIN world

**Files:**
- Modify: `content.js`
- Modify: `interceptor.js`
- Create: `scripts/test-auction-permission.js`

**Interfaces:**
- Produces: evento `pkmn-helper-auction-permission` com `{ enabled:boolean }`.
- Consumes: mudanças em `PokemonHelperStorage.KEYS.uiPreferences`.

- [ ] Criar harness que exige estado inicial desligado, evento contendo apenas
  `enabled`, limpeza de `__pkmnHelperAuctionAuth` ao desligar e nenhuma limpeza
  da preferência em `401/403`.
- [ ] Rodar `node scripts/test-auction-permission.js`; esperado: FAIL.
- [ ] No content script, ler a preferência na injeção, emitir o evento e repetir
  somente quando o booleano mudar no storage.
- [ ] No interceptor, guardar `window.__pkmnHelperAuctionRequestsEnabled`; ao
  receber `false`, apagar imediatamente `window.__pkmnHelperAuctionAuth`.
- [ ] Rodar harness e `node --check content.js interceptor.js`; esperado: exit 0.
- [ ] Commit: `git add content.js interceptor.js scripts/test-auction-permission.js && git commit -m "feat: protege bridge do leilão por permissão"`.

### Task 3: Bloqueio de captura e comandos

**Files:**
- Modify: `interceptor.js`
- Modify: `scripts/test-auction-permission.js`

**Interfaces:**
- Produces: bootstrap `{ status:'disabled'|'waiting'|'ready' }` e erro `auction_requests_disabled`.

- [ ] Ampliar harness para provar que captura desligada não define auth e que
  cada ação de rede retorna erro sem chamar o `fetch` stub.
- [ ] Confirmar FAIL antes da guarda.
- [ ] Aplicar a guarda antes da captura de header e antes de qualquer fetch do
  bridge; deixar `bootstrap` responder sem rede.
- [ ] Preservar limpeza de auth em `401/403`, sem alterar o booleano.
- [ ] Rodar harness e checks; esperado: PASS; commitar.

### Task 4: Estados da UI e navegação para Configurações

**Files:**
- Modify: `auction.js`
- Modify: `content.js`
- Modify: `scripts/test-auction-permission.js`

**Interfaces:**
- Produces: postMessage `{ type:'auction-open-settings' }` aceito apenas do iframe do leilão.

- [ ] Testar mensagem, botão e transições `disabled -> waiting -> ready`.
- [ ] Em `auction.js`, renderizar a mensagem e botão da spec em `disabled`, sem iniciar browse.
- [ ] No shell, validar `event.source`, abrir Configurações e manter a preferência desligada até ação do usuário.
- [ ] Ao mudar a preferência, solicitar novo bootstrap para atualizar a tela.
- [ ] Rodar harness e `node --check`; esperado: exit 0.
- [ ] Testar manualmente desligado, ativação, captura, operações, desligamento e religação.
- [ ] Atualizar `README.md` e `docs/DEVELOPMENT.md`; commitar.

