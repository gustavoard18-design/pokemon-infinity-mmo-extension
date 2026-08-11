# Zoom do painel e barra de rolagem pixelada — Especificação

**Data:** 2026-08-11
**Status:** proposta para validação
**Base:** `AGENTS.md`, `docs/DEVELOPMENT.md`, código atual do overlay
(`content.js`, `components/`, `pixel-theme.css`) e das cinco telas de iframe

## Objetivo

Dois problemas de uso em telas fora do "tamanho médio", resolvidos juntos porque
interagem:

1. **Barra de rolagem sem identidade.** A classe `.px-scroll` existe, mas cobre
   só `::-webkit-scrollbar` (ignorada pelo Firefox) e está aplicada em apenas
   duas das seis superfícies roláveis. Meus Pokémon, Leilão, Encontro e o painel
   de Configurações caem na barra padrão do navegador, que destoa do resto.
2. **Falta de zoom.** Não há como ajustar o tamanho do conteúdo do painel para
   monitores muito grandes ou muito pequenos.

O zoom deve reproduzir o comportamento do Ctrl+/- do navegador — escalar **e**
refluir o layout — sem afetar em nada a página do jogo.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| O que o zoom escala | O conteúdo da extensão (textos, ícones, imagens, cabeçalho, status, configurações, telas). A caixa do painel **não** muda de tamanho |
| Onde se controla | Só na tela de Configurações, seção PAINEL. Sem atalhos de teclado, sem Ctrl+scroll |
| Degraus | Escada do Chrome: 67% · 75% · 80% · 90% · 100% · 110% · 125% · 150% · 175% · 200% |
| Escopo da preferência | Valor único e global, não por view |
| Barra de rolagem | Visual pixelado completo no Chrome (`::-webkit-scrollbar`), aproximação por cores no Firefox (propriedades padrão) |

## Zoom

### Mecanismo

A propriedade CSS `zoom`. É a única que reproduz o Ctrl+/- de verdade: escala e
recalcula o layout. `transform: scale()` foi descartada porque só estica pixels
— deixa borrado e não refaz quebras de linha nem contagem de colunas de grid.

### Onde é aplicada

Em dois lugares independentes, **nunca aninhados**:

1. **Chrome do painel** (`content.js`): `zoom: var(--ph-zoom, 1)` em
   `.ph-header`, `.ph-status` e `.ph-settings`. A variável fica no container
   `#pokemon-type-matchup-overlay`.
2. **Dentro de cada iframe**: o componente novo `components/panel-zoom.js`
   injeta um `<style>` com `body { zoom: X }`.

O container em si **não** recebe `zoom`. Ele é `position: fixed` com
`top`/`right`/`width`/`height` em px, e `zoom` escalaria também esses offsets,
quebrando drag, resize e maximizar. Mantendo o zoom só nos filhos, toda a
matemática de geometria continua em pixels reais e intocada.

A `.ph-body` **não** recebe `zoom`, porque contém os `<iframe>`. `zoom` num
ancestral de iframe propaga para o documento filho no Blink, mas isso não é
garantido no Gecko — e se propagasse enquanto o iframe também se auto-escala,
daria zoom ao quadrado. Aplicar explicitamente dentro de cada documento é
determinístico nos dois navegadores.

### Por que `body` e não `documentElement` dentro do iframe

O tooltip global se anexa em `doc.documentElement` de propósito
(`components/tooltip.js`). Zoom no `<html>` colocaria a caixa do tooltip dentro
da árvore escalada, e aí `getBoundingClientRect()` — que devolve coordenada
visual da viewport — não bateria mais com `style.left`/`top`, interpretados em
unidades já escaladas: o tooltip sairia deslocado pelo fator de zoom. Com o zoom
no `body`, a caixa fica fora da árvore escalada.

### Garantia de não afetar o jogo

Três razões independentes:

1. `zoom` escala o elemento onde é declarada e os descendentes dele. Os alvos
   são filhos do container do overlay; o DOM do jogo não é descendente de
   nenhum deles.
2. O container é `position: fixed` pendurado direto em `document.documentElement`
   — fora do fluxo. O cabeçalho dobrar de altura empurra a `.ph-body` para baixo
   dentro da caixa do painel e nada mais.
3. Todas as regras injetadas na página do jogo são prefixadas com o id do
   container, e `--ph-zoom` fica no container, não em `:root` — não herda pela
   árvore do jogo.

O zoom dos iframes acontece em documentos `chrome-extension://` separados, sem
relação com o documento do jogo.

O Ctrl+/- do navegador continua escalando página e painel juntos, como hoje.
Isso não é regressão: a config nova é independente e se soma a ele, permitindo
compensar na direção contrária e deixar o painel confortável sem mexer no jogo.

### Persistência

Campo `panelZoom` (número, default `1`) em `DEFAULT_UI_PREFERENCES`
(`data/extension-storage.js`). Entra automaticamente no exportar/importar de
configurações, que já copia `uiPreferences` inteiro.

Valor fora da escada (config importada adulterada) é ajustado para o degrau
válido mais próximo, dentro de `sanitizeUiPreferences`
(`components/settings-panel.js`), no mesmo espírito do que ela já faz com os
enums `startView` e `startCollapsed`.

### Controle

Uma linha `Zoom` na seção **PAINEL** das Configurações, logo abaixo de
`Largura`, reaproveitando as classes `.ph-step` e `.ph-width-value` já
existentes: `[-] 100% [+]`. O valor é exibido em porcentagem inteira; o fator é
guardado como número (`1.25`, não `125`).

Nos extremos da escada o botão correspondente fica `disabled` — 67% desabilita o
`-`, 200% desabilita o `+`. Clique morto é pior que botão apagado.

O rótulo da linha é pintado por `subscribe()`, não pelo retorno do clique: assim
ele também acompanha mudanças vindas de fora (importar configurações, restaurar
tudo) sem precisar reabrir o painel.

A linha é escondida quando `CSS.supports('zoom', '2')` é falso. O `zoom` só
existe no Gecko a partir do 126 e o `strict_min_version` do
`manifest.firefox.json` é `109.0`; esconder o controle evita um botão morto sem
cortar usuários de Firefox antigo da extensão inteira. O `strict_min_version`
**não** deve ser alterado.

### Fora do escopo do zoom, de propósito

- **A bolha minimizada** (48×48 fixos): escalar o emoji dentro de uma caixa que
  não cresce só causaria overflow.
- **As alças de resize**: são a borda do container, que por definição não muda.
- **Clamp por largura de painel**: em 200% dentro de um painel de 250px o
  conteúdo fica apertado. É a escolha do usuário — o navegador também deixa
  zoomar até quebrar. Não é bug.
- **`.ph-header` clipando os próprios controles em zoom alto**: em vez de
  esconder botões, o cabeçalho quebra linha (`flex-wrap: wrap`) e cresce em
  altura — clipar esconderia os controles que tirariam o usuário do zoom alto.

## Barra de rolagem

### Escopo obrigatório

`pixel-theme.css` não é só das telas da extensão: o `content.js` injeta esse
mesmo arquivo no `<head>` da **página do jogo**. Qualquer regra de scrollbar sem
escopo ali repintaria as barras do próprio jogo.

A estilização fica escopada sob `.px-scroll`, que passa a viver em dois lugares:

- `<html class="px-scroll">` nas cinco páginas de iframe (hoje está no `<body>`
  de apenas duas; mover para `<html>` também cobre a barra da viewport);
- na classe do container do overlay em `content.js`, o que cobre o
  `.ph-settings`, que já rola.

Seletor `.px-scroll, .px-scroll *` — pega todo descendente rolável de uma vez,
incluindo `.pokemon-advanced-filters` e o overflow horizontal da tabela de
tipos, sem marcar cada um. O jogo, sem a classe em ancestral nenhum, fica
intocado.

### Chrome — visual pixelado

Via `::-webkit-scrollbar`:

- largura/altura **10px** (hoje 7px, finos demais para o peso do resto da UI);
- track `--px-bg` com uma linha `--px-border` de 1px do lado que encosta no
  conteúdo (`box-shadow: inset`), virando uma calha desenhada em vez de vazio;
- thumb quadrado (`border-radius: 0`), preenchimento `--px-bg-badge` com
  contorno interno de 1px em `--px-border-btn` — mesma gramática de borda dos
  `.px-btn` e `.ph-key`;
- hover clareia o thumb; arrastando, vai para `--px-accent`, o mesmo âmbar do
  botão de view ativo e dos valores numéricos;
- `::-webkit-scrollbar-button` e `-corner` neutralizados: sem setinhas nem
  quadrado cinza.

### Firefox — aproximação

Via `scrollbar-width: thin` e `scrollbar-color: <thumb> <track>` com as mesmas
cores. O Gecko não expõe forma nem borda do thumb, então fica a mesma paleta e
proporção, sem o contorno quadrado. É o teto do que dá para fazer sem
reimplementar a barra em JS — descartado por ser código novo para manter em seis
telas e por costumar quebrar rolagem por teclado, touch e acessibilidade.

### Separação obrigatória dos dois blocos

No Chrome, declarar `scrollbar-color` ou `scrollbar-width` num elemento
**desliga** as regras `::-webkit-scrollbar` dele. Se as duas famílias saírem no
mesmo bloco, o Chrome perde todo o visual pixelado e cai na barra padrão só
recolorida.

As propriedades padrão ficam isoladas em
`@supports not (background: -webkit-named-image(i))`. Não dá para usar
`@supports not selector(::-webkit-scrollbar)`: o Firefox 153 passou a
reconhecer esse seletor (sem implementar a estilização dele), então o teste
vira verdadeiro só até o Firefox 152 — a partir do 153 a negação dá falso e o
bloco de propriedades padrão simplesmente para de ser aplicado, deixando o
Firefox sem nenhum visual de barra pixelada. `-webkit-named-image()` só
existe em Blink/WebKit, então `@supports not` sobre ela é verdadeira em
qualquer motor que não seja esses — Firefox incluído, em qualquer versão —
sem sniffing de navegador.

### Interação com o zoom

Como o `zoom` é aplicado no `body` de cada iframe, os 10px da barra escalam
junto com o conteúdo. Em 200% a barra vira 20px reais, na proporção certa —
exatamente o que o Ctrl+/- do navegador faz.

## Componentes e arquivos

| Arquivo | Mudança |
|---|---|
| `data/extension-storage.js` | campo `panelZoom: 1` em `DEFAULT_UI_PREFERENCES` |
| `components/panel-zoom.js` | **novo** — dono do fator de zoom |
| `components/settings-panel.js` | linha `Zoom` na seção PAINEL + snap na `sanitizeUiPreferences` |
| `content.js` | `--ph-zoom` no container, `class="px-scroll"` no container, regras de zoom nos três filhos, assinatura da mudança |
| `components/tooltip.js` | posicionamento ciente do zoom |
| `pixel-theme.css` | bloco de scrollbar escopado, substituindo as três regras atuais |
| `index.html`, `chart.html`, `battle.html`, `myPokemons.html`, `auction.html` | `class="px-scroll"` no `<html>` (removida do `<body>` onde já existe) + `<script src="components/panel-zoom.js">` |

Sem mexer nos manifests nem nos build scripts: `components/*.js` já é wildcard
nos dois manifests, e `scripts/build-*.sh` copiam a pasta `components/` inteira.

### Interface de `components/panel-zoom.js`

Único dono da regra de zoom. Expõe:

- `LEVELS` — a escada de degraus;
- `factor()` — fator atual;
- `step(delta)` — anda um degrau (`+1`/`-1`), persiste e devolve o novo valor;
- `subscribe(fn)` — chama `fn(fator)` já com o valor atual e de novo a cada
  mudança de `uiPreferences` no storage.

Quem consome decide o que fazer com o fator:

- **páginas de iframe**: o próprio componente injeta e atualiza o `<style>` com
  `body { zoom: X }`;
- **content script**: `content.js` assina e escreve `--ph-zoom` no container;
- **tooltip**: escala a caixa junto.

O modo é escolhido por `location.protocol` (`chrome-extension:` /
`moz-extension:` vs. a página do jogo), mesma ideia do auto-attach de
`components/tooltip.js`.

### Ajuste no tooltip

A caixa mora em `documentElement`, fora da árvore escalada — por isso o
posicionamento atual continua correto sem tocar em nada. Mas ela ficaria travada
em 100% enquanto o conteúdo cresce. Para escalar junto, recebe o mesmo `zoom`, e
então `position()` precisa dividir `left`/`top` pelo fator: `zoom` num elemento
escala também os offsets dele, enquanto `getBoundingClientRect()` devolve
coordenada visual. Sem essa divisão, o tooltip sai deslocado proporcionalmente
ao zoom.

Quando `PokemonHelperZoom` não existe, o fator cai para 1 e o comportamento é
idêntico ao atual.

## Casos de borda já cobertos

- **Exportar/importar config**: `panelZoom` viaja dentro de `uiPreferences`, que
  já é copiado inteiro; só falta o snap para degrau válido na sanitização.
- **"Restaurar tudo"**: volta para 100% sozinho, e o listener de `uiPreferences`
  que já existe em `content.js` repinta o painel vivo.
- **Painel encaixado vs. maximizado**: o zoom não interage com nenhum dos dois —
  a caixa não muda de tamanho em nenhum modo.

## Riscos que só o teste manual resolve

Ambos têm saída definida; nenhum bloqueia o design.

1. **`.ph-settings` é `position: absolute; inset: 0`.** Se `zoom` fizer ela
   deixar de preencher o pai em algum dos navegadores, o zoom migra para um
   wrapper interno do painel de configurações.
2. **Flash de 100% ao abrir o iframe**, já que o `panel-zoom.js` lê o storage de
   forma assíncrona. Se for perceptível, o `content.js` passa o fator no hash do
   `src` do iframe para aplicação síncrona. Não é feito de saída porque os
   iframes nascem com `display: none` e o layout nem é calculado antes de serem
   exibidos — provavelmente é invisível, e é complexidade que não vale pagar sem
   evidência.

## Verificação

O repositório não tem suíte de testes nem linter (`AGENTS.md`). A verificação é
manual, carregando a extensão sem empacotar no Chrome e no Firefox e, em cada
degrau extremo (67% e 200%), percorrendo as seis telas para conferir:

- refluxo real do layout (não estica pixel);
- cabeçalho, barra de status e painel de configurações escalando junto;
- tooltip alinhado ao elemento que o disparou;
- barra de rolagem pixelada em todas as superfícies roláveis;
- drag, resize e maximizar ainda operando em pixels reais;
- **o layout da página do jogo imóvel**;
- no Firefox, com a barra aproximada por cores e a linha `Zoom` visível
  (Firefox ≥ 126).
