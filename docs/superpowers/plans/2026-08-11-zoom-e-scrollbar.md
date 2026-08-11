# Zoom do painel e barra de rolagem pixelada — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa.
> Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Dar ao painel uma barra de rolagem com a identidade pixelada do resto
da extensão em todas as telas e nos dois navegadores, e uma configuração de zoom
que escala o conteúdo da extensão como o Ctrl+/- do navegador, sem tocar na
página do jogo.

**Architecture:** HTML/CSS/JS sem build. O zoom sai da propriedade CSS `zoom`,
aplicada em dois lugares independentes e nunca aninhados: nos três filhos do
container do overlay (`content.js`) e no `body` de cada iframe
(`components/panel-zoom.js`). A caixa do painel nunca muda de tamanho, então
toda a matemática de drag/resize/maximizar continua em pixels reais. A barra de
rolagem é estilizada em `pixel-theme.css` escopada sob `.px-scroll` — obrigatório,
porque esse arquivo também é injetado na página do jogo.

**Spec:** `docs/superpowers/specs/2026-08-11-zoom-e-scrollbar-design.md`

## Global Constraints

- **Sem build, sem npm, sem dependências.** Verificação é sempre manual,
  carregando a extensão sem empacotar (`AGENTS.md`).
- **Nunca afetar a página do jogo.** Toda regra CSS que chega lá é escopada por
  `#pokemon-type-matchup-overlay` ou por `.px-scroll`. `--ph-zoom` mora no
  container, nunca em `:root`.
- **Não alterar `strict_min_version` do `manifest.firefox.json`** (`109.0`). O
  suporte a `zoom` no Gecko começa no 126; a linha de config se esconde sozinha
  onde não há suporte.
- **Não bumpar a versão nos manifests** — só em release (`AGENTS.md`).
- **Escada de zoom, valor canônico:** `0.67 · 0.75 · 0.8 · 0.9 · 1 · 1.1 · 1.25
  · 1.5 · 1.75 · 2`. Guardado como número, exibido como porcentagem inteira.
- **Identificadores internos em inglês, docs e commits em português.**
- Os dois manifests e os dois build scripts **não** mudam: `components/*.js` já
  é wildcard e a pasta é copiada inteira.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `components/panel-zoom.js` (novo) | Dono único do fator de zoom: escada, snap, persistência, notificação. Auto-aplica `body { zoom }` só em páginas da extensão |
| `pixel-theme.css` | Bloco de scrollbar escopado sob `.px-scroll` |
| `data/extension-storage.js` | Campo `panelZoom` nos defaults |
| `content.js` | `--ph-zoom` no container + regras nos três filhos + `.px-scroll` no container |
| `components/settings-panel.js` | Linha `Zoom` na UI + snap na sanitização de import |
| `components/tooltip.js` | Escala a caixa junto e corrige as coordenadas |
| `background.js` | `panel-zoom.js` na lista de injeção do isolated world |
| 5 `*.html` de iframe | `.px-scroll` no `<html>` + `<script>` do `panel-zoom.js` |
| `README.md`, `docs/DEVELOPMENT.md` | Documentar a config nova e o componente novo |

---

## Fase 1 — Barra de rolagem

Entrega sozinha, sem depender do zoom.

### Task 1: Bloco de scrollbar pixelada

**Files:**
- Modify: `pixel-theme.css:122-124` (as três regras `.px-scroll` atuais)
- Modify: `index.html:2`, `index.html:35`
- Modify: `chart.html:2`, `chart.html:151`
- Modify: `battle.html:2`, `myPokemons.html:2`, `auction.html:2`
- Modify: `content.js` (`build()`, logo após `container.id = ID;`)

**Interfaces:**
- Produces: a classe `.px-scroll` passa a valer no `<html>` das cinco telas e no
  container do overlay. Nenhuma outra tarefa depende disso.

- [ ] **Passo 1: Substituir as três regras atuais em `pixel-theme.css`**

Trocar o bloco de `pixel-theme.css:122-124` por:

```css
/* ---------------------------------------------------------------------
   Barra de rolagem pixelada. ESCOPADA sob .px-scroll de propósito: este
   arquivo também é injetado no <head> da página do jogo por content.js,
   e uma regra solta aqui repintaria as barras do próprio jogo. A classe
   vive no <html> das telas de iframe e no container do overlay; o
   seletor com `*` pega qualquer descendente rolável (filtros avançados,
   overflow horizontal da tabela de tipos, painel de configurações) sem
   precisar marcar um por um.
--------------------------------------------------------------------- */
.px-scroll::-webkit-scrollbar,
.px-scroll *::-webkit-scrollbar { width: 10px; height: 10px; }

.px-scroll::-webkit-scrollbar-track,
.px-scroll *::-webkit-scrollbar-track {
    background: var(--px-bg);
    box-shadow: inset 1px 0 0 var(--px-border);
}
.px-scroll::-webkit-scrollbar-track:horizontal,
.px-scroll *::-webkit-scrollbar-track:horizontal {
    box-shadow: inset 0 1px 0 var(--px-border);
}

.px-scroll::-webkit-scrollbar-thumb,
.px-scroll *::-webkit-scrollbar-thumb {
    background: var(--px-bg-badge);
    border-radius: 0;
    box-shadow: inset 0 0 0 1px var(--px-border-btn);
}
.px-scroll::-webkit-scrollbar-thumb:hover,
.px-scroll *::-webkit-scrollbar-thumb:hover { background: var(--px-border-tip); }
.px-scroll::-webkit-scrollbar-thumb:active,
.px-scroll *::-webkit-scrollbar-thumb:active {
    background: var(--px-accent);
    box-shadow: inset 0 0 0 1px var(--px-accent-hover);
}

.px-scroll::-webkit-scrollbar-button,
.px-scroll *::-webkit-scrollbar-button { display: none; }
.px-scroll::-webkit-scrollbar-corner,
.px-scroll *::-webkit-scrollbar-corner { background: var(--px-bg); }

/* Firefox não tem os pseudo-elementos webkit. Bloco SEPARADO porque no
   Chrome declarar scrollbar-color/scrollbar-width num elemento DESLIGA
   as regras ::-webkit-scrollbar dele — no mesmo bloco, o Chrome perderia
   todo o visual pixelado e cairia na barra padrão só recolorida. A
   condição é verdadeira só no Gecko, sem sniffing de navegador. */
@supports not selector(::-webkit-scrollbar) {
    .px-scroll,
    .px-scroll * {
        scrollbar-width: thin;
        scrollbar-color: var(--px-bg-badge) var(--px-bg);
    }
}
```

- [ ] **Passo 2: Mover a classe para o `<html>` nas cinco telas**

Em `index.html`, `chart.html`, `battle.html`, `myPokemons.html` e `auction.html`,
trocar `<html lang="pt-BR">` por `<html lang="pt-BR" class="px-scroll">`.

Em `index.html:35` e `chart.html:151`, remover a classe do body:
`<body class="px-scroll">` → `<body>`. (As outras três já estão sem.)

- [ ] **Passo 3: Aplicar a classe no container do overlay**

Em `content.js`, dentro de `build()`, logo depois de `container.id = ID;`:

```js
        // cobre o scroll do painel de Configurações (.ph-settings) com o mesmo
        // visual das telas; escopa as regras de pixel-theme.css, que também é
        // injetado na página do jogo, só ao que é nosso
        container.className = 'px-scroll';
```

- [ ] **Passo 4: Verificar no Chrome**

Recarregar a extensão em `chrome://extensions` e abrir o painel no jogo.
Conferir, com o painel estreito o bastante para forçar rolagem:
Meus Pokémon, Leilão, Encontro, Calculadora, Tabela de tipos (barra horizontal
inclusive) e Configurações — todas com a barra de 10px, thumb quadrado com
contorno, âmbar ao arrastar, sem setinhas.
Conferir que as barras da **página do jogo** continuam as padrão do navegador.

- [ ] **Passo 5: Verificar no Firefox**

Carregar via `about:debugging` com `manifest.firefox.json`. As mesmas telas devem
mostrar barra fina nas cores do tema (sem o contorno quadrado — é o limite do
Gecko). Confirmar que o Chrome **não** regrediu para a barra padrão recolorida:
se regrediu, o `@supports` está vazando e a regra padrão está desligando os
pseudo-elementos.

- [ ] **Passo 6: Commit**

```bash
git add pixel-theme.css index.html chart.html battle.html myPokemons.html auction.html content.js
git commit -m "feat(ui): barra de rolagem pixelada em todas as telas e no Firefox"
```

---

## Fase 2 — Zoom

### Task 2: Componente `panel-zoom.js` e persistência

Ao fim desta tarefa o zoom já funciona **dentro dos iframes**, testável mudando
o storage na mão. O chrome do painel e a UI de config vêm nas tarefas seguintes.

**Files:**
- Create: `components/panel-zoom.js`
- Modify: `data/extension-storage.js:44-74` (`DEFAULT_UI_PREFERENCES`)
- Modify: `background.js:222` (lista de injeção)
- Modify: `index.html`, `chart.html`, `battle.html`, `myPokemons.html`, `auction.html`

**Interfaces:**
- Consumes: `PokemonHelperStorage.getUiPreferences()` /
  `setUiPreferences()` / `KEYS.uiPreferences` (`data/extension-storage.js`).
- Produces: `globalThis.PokemonHelperZoom` com
  - `LEVELS: readonly number[]` — a escada, em ordem crescente;
  - `supported: boolean` — `CSS.supports('zoom', '2')`;
  - `factor(): number` — fator atual;
  - `snap(value: unknown): number` — degrau válido mais próximo, `1` para lixo;
  - `step(delta: -1 | 1): Promise<number>` — anda um degrau, persiste, resolve
    com o valor novo;
  - `subscribe(fn: (factor: number) => void): () => void` — chama `fn` já com o
    valor atual e a cada mudança; devolve a função de cancelamento.

- [ ] **Passo 1: Adicionar `panelZoom` aos defaults**

Em `data/extension-storage.js`, dentro de `DEFAULT_UI_PREFERENCES`, logo depois
de `autoSwitchToBattle: true,`:

```js
        panelZoom: 1,                 // fator de zoom do conteúdo do painel (ver components/panel-zoom.js)
```

O merge raso de `mergeUiPreferences` já cuida das configs antigas sem o campo.

- [ ] **Passo 2: Criar `components/panel-zoom.js`**

```js
// ---------------------------------------------------------------------------
// Zoom do conteúdo do painel. Dono único do fator e da escada de degraus,
// compartilhado entre as telas de iframe e o content script.
//
// Nas páginas da extensão ele mesmo aplica `body { zoom: X }` por um <style>
// injetado — regra em vez de style inline porque o script pode rodar antes de
// o <body> existir. No content script (página do jogo) ele NÃO aplica nada
// sozinho: quem assina (content.js, tooltip.js) decide o que fazer com o fator.
// É isso que mantém a página do jogo intocada.
//
// O zoom vai no <body>, não no <html>, de propósito: a caixa do tooltip global
// mora em documentElement (components/tooltip.js), e dentro de uma árvore
// escalada o getBoundingClientRect() do alvo (coordenada visual) deixaria de
// bater com o style.left/top da caixa (unidades já escaladas).
// ---------------------------------------------------------------------------
var PokemonHelperZoom = globalThis.PokemonHelperZoom || (() => {
    const LEVELS = Object.freeze([0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);
    const DEFAULT = 1;

    // degrau válido mais próximo: protege contra config importada com valor
    // arbitrário e contra ruído de ponto flutuante vindo do storage
    function snap(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return DEFAULT;
        return LEVELS.reduce(
            (best, level) => (Math.abs(level - num) < Math.abs(best - num) ? level : best),
            LEVELS[0]
        );
    }

    const supported = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('zoom', '2');
    const isExtensionPage = location.protocol === 'chrome-extension:' || location.protocol === 'moz-extension:';

    let current = DEFAULT;
    const listeners = new Set();

    function set(value) {
        const next = snap(value);
        if (next === current) return;
        current = next;
        listeners.forEach((fn) => {
            try { fn(current); } catch (error) { console.warn('[Pokemon Helper] Listener de zoom falhou:', error); }
        });
    }

    function subscribe(fn) {
        listeners.add(fn);
        fn(current);
        return () => listeners.delete(fn);
    }

    function step(delta) {
        const index = LEVELS.indexOf(current);
        const next = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index + delta))];
        if (next === current) return Promise.resolve(current);
        set(next); // pinta já; o storage confirma logo em seguida
        return PokemonHelperStorage.setUiPreferences({ panelZoom: next }).then(() => next);
    }

    if (isExtensionPage && supported) {
        subscribe((factor) => {
            let style = document.getElementById('ph-zoom-style');
            if (!style) {
                style = document.createElement('style');
                style.id = 'ph-zoom-style';
                (document.head || document.documentElement).appendChild(style);
            }
            style.textContent = `body { zoom: ${factor}; }`;
        });
    }

    PokemonHelperStorage.getUiPreferences()
        .then((preferences) => set(preferences.panelZoom))
        .catch(() => {});

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes[PokemonHelperStorage.KEYS.uiPreferences]) return;
            set(changes[PokemonHelperStorage.KEYS.uiPreferences].newValue?.panelZoom);
        });
    }

    return Object.freeze({ LEVELS, supported, snap, step, subscribe, factor: () => current });
})();
globalThis.PokemonHelperZoom = PokemonHelperZoom;
```

- [ ] **Passo 3: Carregar nas cinco telas de iframe**

Em cada um dos cinco HTMLs, inserir logo **depois** de
`<script src="data/extension-storage.js"></script>` (dependência) e **antes** de
`components/tooltip.js`:

```html
    <script src="components/panel-zoom.js"></script>
```

- [ ] **Passo 4: Carregar no isolated world**

Em `background.js:222`, inserir `'components/panel-zoom.js'` entre
`'components/pixel-icon.js'` e `'components/tooltip.js'`:

```js
                files: ['data/extension-storage.js', 'components/pixel-icon.js', 'components/panel-zoom.js', 'components/tooltip.js', 'components/header-buttons.js', 'components/shortcut-utils.js', 'components/settings-panel.js', 'content.js']
```

A ordem importa: `tooltip.js` (Task 5) e `settings-panel.js` (Task 4) leem
`PokemonHelperZoom`, e ele depende de `PokemonHelperStorage`.

- [ ] **Passo 5: Verificar que os iframes escalam**

Recarregar a extensão. Com o painel aberto, no console de background (ou em
qualquer página da extensão):

```js
chrome.storage.local.get('pkmnHelperUiPreferences', (r) => {
  const p = r.pkmnHelperUiPreferences || {};
  chrome.storage.local.set({ pkmnHelperUiPreferences: { ...p, panelZoom: 1.75 } });
});
```

Esperado: o conteúdo de Meus Pokémon, Leilão, Encontro, Calculadora e Tabela
cresce e **refluia** (menos colunas na grade, quebras de linha diferentes) sem
borrar. O cabeçalho e a barra de status do painel ainda **não** escalam — é a
Task 3. A caixa do painel não muda de tamanho. O layout do jogo não se mexe.
Voltar para `panelZoom: 1` e confirmar que tudo volta ao normal.

- [ ] **Passo 6: Commit**

```bash
git add components/panel-zoom.js data/extension-storage.js background.js index.html chart.html battle.html myPokemons.html auction.html
git commit -m "feat(painel): componente de zoom e aplicação nas telas dos iframes"
```

---

### Task 3: Zoom no chrome do painel

**Files:**
- Modify: `content.js` (`injectStyle()` por volta de `:608-641`, e `build()`)

**Interfaces:**
- Consumes: `PokemonHelperZoom.subscribe()` e `.factor()` (Task 2).
- Produces: a custom property `--ph-zoom` no container do overlay.

- [ ] **Passo 1: Regras de zoom no CSS injetado**

Em `content.js`, dentro do template de `injectStyle()`, logo depois da regra de
`#${ID} .ph-frame`, acrescentar:

```css
            /* zoom só nos filhos, nunca no container: ele é position: fixed com
               top/right/width/height em px, e zoom escalaria esses offsets junto,
               quebrando arrastar/redimensionar/maximizar. A .ph-body fica de fora
               porque contém os iframes, que já se auto-escalam por dentro
               (components/panel-zoom.js) — zoom aqui daria zoom ao quadrado. */
            #${ID} .ph-header,
            #${ID} .ph-status,
            #${ID} .ph-settings { zoom: var(--ph-zoom, 1); }
            #${ID} .ph-step:disabled { opacity: .35; cursor: default; }
```

- [ ] **Passo 2: Alimentar `--ph-zoom` no `build()`**

Em `content.js`, dentro de `build()`, logo depois de `container.className = 'px-scroll';`
(Task 1):

```js
        container.style.setProperty('--ph-zoom', String(PokemonHelperZoom.factor()));
```

E, junto do bloco `if (!window.__pkmnHelperPrefsListenerAdded)` que já existe em
`content.js:65-75`, registrar a assinatura uma única vez:

```js
    if (!window.__pkmnHelperZoomListenerAdded) {
        window.__pkmnHelperZoomListenerAdded = true;
        PokemonHelperZoom.subscribe((factor) => {
            const container = document.getElementById(ID);
            if (container) container.style.setProperty('--ph-zoom', String(factor));
        });
    }
```

- [ ] **Passo 3: Verificar o chrome escalando**

Repetir o truque de storage do Passo 5 da Task 2 com `panelZoom: 1.75`. Agora os
ícones do cabeçalho, a barra de status e o painel de Configurações crescem junto
com as telas. Conferir especificamente:
- a caixa do painel **não** mudou de largura nem de altura;
- arrastar pelo cabeçalho, redimensionar pelas bordas e maximizar continuam
  respondendo no lugar certo do cursor (a matemática é em px reais);
- **o `.ph-settings` continua preenchendo o corpo do painel.** Ele é
  `position: absolute; inset: 0` (`content.js:640`) — se em algum navegador ele
  encolher ou vazar com o zoom, mover o `zoom` para um wrapper interno do painel
  de configurações em vez do `.ph-settings` (registrado como risco na spec);
- a bolha minimizada continua 48×48 e a página do jogo, imóvel.

- [ ] **Passo 4: Commit**

```bash
git add content.js
git commit -m "feat(painel): cabeçalho, status e configurações escalam com o zoom"
```

---

### Task 4: Linha `Zoom` nas Configurações

**Files:**
- Modify: `components/settings-panel.js:14-19` (bloco PAINEL do template)
- Modify: `components/settings-panel.js:256-273` (`sanitizeUiPreferences`)
- Modify: `components/settings-panel.js:424-452` (junto do bloco de largura)

**Interfaces:**
- Consumes: `PokemonHelperZoom.{LEVELS, supported, snap, step, subscribe}` (Task 2).

- [ ] **Passo 1: Markup da linha**

Em `components/settings-panel.js`, logo **depois** da `.ph-setting-row` de
Largura (a que termina em `ph-width-plus`):

```html
            <div class="ph-setting-row" id="ph-zoom-row" data-tip="Tamanho do conteúdo do painel, de 67% a 200%. Não afeta a página do jogo.">
                <span class="ph-setting-label">Zoom</span>
                <button type="button" class="ph-step" id="ph-zoom-minus">-</button>
                <span class="ph-width-value" id="ph-zoom-value"></span>
                <button type="button" class="ph-step" id="ph-zoom-plus">+</button>
            </div>
```

A regra `.ph-setting-row[hidden] { display: none; }` já existe em `content.js`.

- [ ] **Passo 2: Ligar os botões**

Logo abaixo do bloco de `applyWidth` (por volta de `settings-panel.js:446`):

```js
        const zoomRow = panel.querySelector('#ph-zoom-row');
        const zoomValue = panel.querySelector('#ph-zoom-value');
        const zoomMinus = panel.querySelector('#ph-zoom-minus');
        const zoomPlus = panel.querySelector('#ph-zoom-plus');
        if (!PokemonHelperZoom.supported) {
            // Firefox < 126 não tem a propriedade zoom; some com o controle em
            // vez de deixar um botão que não faz nada
            zoomRow.hidden = true;
        } else {
            const levels = PokemonHelperZoom.LEVELS;
            // pintado por subscribe (não pelo retorno do clique) pra acompanhar
            // também mudanças vindas de importar config e de "Restaurar tudo"
            PokemonHelperZoom.subscribe((factor) => {
                zoomValue.textContent = `${Math.round(factor * 100)}%`;
                zoomMinus.disabled = factor === levels[0];
                zoomPlus.disabled = factor === levels[levels.length - 1];
            });
            const stepZoom = (delta) => PokemonHelperZoom.step(delta).catch((error) => {
                console.warn('[Pokemon Helper] Não foi possível salvar o zoom:', error);
            });
            zoomMinus.addEventListener('click', () => stepZoom(-1));
            zoomPlus.addEventListener('click', () => stepZoom(1));
        }
```

- [ ] **Passo 3: Sanitizar no import**

Em `sanitizeUiPreferences`, junto das duas validações de enum que já existem:

```js
            if ('panelZoom' in ui) ui.panelZoom = PokemonHelperZoom.snap(ui.panelZoom);
```

- [ ] **Passo 4: Verificar a UI**

Abrir Configurações → PAINEL. Conferir:
- `[-] 100% [+]` logo abaixo de Largura, e o valor mudando pelos degraus da
  escada (67 · 75 · 80 · 90 · 100 · 110 · 125 · 150 · 175 · 200);
- em 67% o `-` fica apagado e sem efeito; em 200%, o `+`;
- o painel inteiro (config incluída) reage a cada clique, imediatamente;
- fechar e reabrir o navegador mantém o valor;
- **Exportar configurações** gera um JSON com `"panelZoom"`; editar o arquivo
  para `"panelZoom": 3.7` e importar deve cair em `2` (degrau mais próximo), não
  quebrar;
- **Restaurar tudo** volta para 100% e o rótulo se atualiza sozinho.

- [ ] **Passo 5: Commit**

```bash
git add components/settings-panel.js
git commit -m "feat(config): linha de zoom no bloco PAINEL"
```

---

### Task 5: Tooltip ciente do zoom

**Files:**
- Modify: `components/tooltip.js:59-70` (`position`)

**Interfaces:**
- Consumes: `globalThis.PokemonHelperZoom.factor()` (Task 2), com degradação
  para `1` quando ausente.

- [ ] **Passo 1: Reescrever `position`**

```js
    // A caixa mora em documentElement, FORA da árvore com zoom (que vai no
    // body) — por isso ela não escala sozinha e precisa do zoom aplicado aqui.
    // Com zoom no próprio elemento, style.left/top passam a ser interpretados
    // em unidades já escaladas, enquanto o rect do alvo vem em coordenada
    // visual: daí a divisão pelo fator na hora de escrever.
    function zoomFactor() {
        const zoom = globalThis.PokemonHelperZoom;
        const factor = zoom && zoom.factor();
        return Number.isFinite(factor) && factor > 0 ? factor : 1;
    }

    function position(box, rect, win) {
        const zoom = zoomFactor();
        box.style.zoom = zoom === 1 ? '' : String(zoom);
        // zera a posição antes de medir: um left herdado perto da borda direita
        // comprimiria a caixa (shrink-to-fit) e a medida sairia errada
        box.style.left = '0px';
        box.style.top = '0px';
        // getBoundingClientRect (e não offsetWidth) porque só ele devolve o
        // tamanho visual já com o zoom aplicado, que é a unidade de win.inner*
        const boxRect = box.getBoundingClientRect();
        const width = boxRect.width, height = boxRect.height;
        const left = Math.max(4, Math.min(rect.left, win.innerWidth - width - 4));
        let top = rect.bottom + 5;
        if (top + height > win.innerHeight - 4) top = Math.max(4, rect.top - height - 5);
        box.style.left = `${left / zoom}px`;
        box.style.top = `${top / zoom}px`;
    }
```

- [ ] **Passo 2: Verificar o tooltip em três contextos**

Em 100%, 67% e 200%, passar o mouse sobre:
- um `data-tip` do **cabeçalho do painel** (ícone de aba) — contexto content
  script, caixa no documento do jogo;
- um `data-tip` das **Configurações** (linha Largura, linha Zoom) — mesmo
  documento, dentro de área com zoom;
- um `data-tip` **dentro de um iframe** (ⓘ em Meus Pokémon ou Encontro).

Em todos: a caixa cresce/encolhe junto com o conteúdo e encosta no elemento que
a disparou, sem deslocamento proporcional ao zoom. Testar também perto das
bordas direita e inferior da tela, onde entra o clamp.

- [ ] **Passo 3: Commit**

```bash
git add components/tooltip.js
git commit -m "fix(tooltip): escalar e posicionar corretamente sob zoom do painel"
```

---

## Fase 3 — Documentação e verificação final

### Task 6: Docs

**Files:**
- Modify: `README.md:295-309` (Configurações → PAINEL)
- Modify: `docs/DEVELOPMENT.md:107-109` (ordem de injeção) e a tabela de
  `components/` (por volta de `:127`)

- [ ] **Passo 1: README**

Em `README.md`, no bloco **PAINEL**, logo depois do item **Largura**:

```markdown
- **Zoom** — stepper `-`/`+` nos degraus 67% · 75% · 80% · 90% · 100% ·
  110% · 125% · 150% · 175% · 200% (padrão 100%). Escala o conteúdo da
  extensão — textos, ícones, cartões, cabeçalho e a própria tela de
  Configurações — refluindo o layout, igual ao Ctrl+`+`/`-` do navegador.
  O tamanho da caixa do painel não muda (isso é a **Largura** e o
  redimensionamento pelas bordas), e a página do jogo não é afetada.
  No Firefox a linha só aparece a partir da versão 126.
```

- [ ] **Passo 2: DEVELOPMENT — ordem de injeção**

Atualizar o bloco de `docs/DEVELOPMENT.md:107-109` para incluir o componente
novo na posição real:

```
data/extension-storage.js → components/pixel-icon.js
→ components/panel-zoom.js → components/tooltip.js
→ components/header-buttons.js → components/shortcut-utils.js
→ components/settings-panel.js → content.js
```

- [ ] **Passo 3: DEVELOPMENT — tabela de componentes**

Acrescentar a linha na tabela de `components/`, logo antes de `tooltip.js`:

```markdown
| `panel-zoom.js` | Fator de zoom do conteúdo do painel (`PokemonHelperZoom`): escada de degraus, snap, persistência em `panelZoom` e notificação por `subscribe`. Nas páginas da extensão aplica `body { zoom }` sozinho; no content script só distribui o fator, para nunca tocar na página do jogo |
```

- [ ] **Passo 4: Commit**

```bash
git add README.md docs/DEVELOPMENT.md
git commit -m "docs: zoom do painel no README e panel-zoom.js no DEVELOPMENT"
```

---

### Task 7: Verificação end-to-end nos dois navegadores

Sem suíte de testes no repositório (`AGENTS.md`): a verificação é manual e é o
gate real desta entrega.

- [ ] **Passo 1: Chrome, degraus extremos**

`chrome://extensions` → recarregar sem empacotar → abrir o jogo. Em **67%** e em
**200%**, percorrer as seis telas (Encontro, Calculadora, Meus Pokémon, Leilão,
Tabela de tipos, Configurações) conferindo:
- refluxo real do layout, sem borrão (a grade de Meus Pokémon muda de número de
  colunas; textos quebram em pontos diferentes);
- cabeçalho, barra de status e Configurações na mesma escala das telas;
- tooltip alinhado ao elemento que o disparou;
- barra de rolagem pixelada em toda superfície rolável, escalando junto;
- arrastar, redimensionar pelas oito alças e maximizar respondendo no ponto
  exato do cursor;
- modo full e modo lado a lado (tabela de tipos) sem sobreposição;
- **o layout da página do jogo sem mover um pixel** — comparar antes/depois com
  a mesma tela do jogo à mostra.

- [ ] **Passo 2: Firefox**

`about:debugging` com `manifest.firefox.json`. Repetir o Passo 1. Além disso:
- barra de rolagem fina nas cores do tema;
- a linha **Zoom** presente (Firefox ≥ 126) e funcional.

- [ ] **Passo 3: Persistência e config**

Fechar e reabrir o navegador com zoom em 150%: o painel volta em 150%.
Exportar config, restaurar tudo, importar de volta: o zoom volta ao valor
exportado e o rótulo da linha acompanha sem reabrir o painel.

- [ ] **Passo 4 (opcional): Regenerar o print das Configurações**

`docs/images/tela-configuracoes.png` fica desatualizado com a linha nova. Exige
o setup de dev descrito no cabeçalho de `scripts/screenshots.js` (Chrome com
porta de debug, já logado no jogo):

```bash
NODE_PATH=~/tools/playwright/node_modules node scripts/screenshots.js docs/images
```

Commitar só a imagem que mudou.

---

## Self-review

**Cobertura da spec:** zoom via `zoom` nos dois lugares (Tasks 2 e 3); `body` e
não `documentElement`, com a razão do tooltip (Tasks 2 e 5); container fora do
zoom para preservar a geometria (Task 3); `panelZoom` nos defaults e no
export/import com snap (Tasks 2 e 4); escada do Chrome e controle só nas
Configurações, com extremos desabilitados e rótulo por `subscribe` (Task 4);
`CSS.supports` escondendo a linha sem mexer no `strict_min_version` (Tasks 2 e
4); bolha, alças e clamp por largura deliberadamente fora (respeitado — nenhuma
tarefa os toca); scrollbar escopada sob `.px-scroll` nos dois navegadores com os
blocos separados por `@supports` (Task 1); os dois riscos de teste manual com
saída definida (Tasks 3 e 2, Passos 3 e 5); verificação nos dois navegadores
(Task 7).

**Um item fora da spec:** `background.js` precisa da linha nova na lista de
injeção do isolated world (Task 2, Passo 4) — a tabela de arquivos da spec não
o citava. Não contradiz nada: os manifests e os build scripts seguem intocados,
como a spec afirma.

**Nomes conferidos entre tarefas:** `PokemonHelperZoom.{LEVELS, supported, snap,
step, subscribe, factor}` é usado com a mesma grafia nas Tasks 3, 4 e 5;
`--ph-zoom` e `#ph-zoom-style` idem; `panelZoom` bate entre
`data/extension-storage.js`, o componente e a sanitização.
