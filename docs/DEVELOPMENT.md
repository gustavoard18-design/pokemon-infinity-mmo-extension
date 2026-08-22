# Guia de desenvolvimento

Documentação técnica da **Infinity MMO Extension** (Chrome/Chromium e
Firefox, Manifest V3). Para uso, instalação e funcionalidades, veja o
[README](../README.md) — este guia cobre apenas o que é preciso para
desenvolver e publicar a extensão.

## Sumário

- [Ambiente de desenvolvimento](#ambiente-de-desenvolvimento)
- [Arquitetura](#arquitetura)
- [Interceptação de dados](#interceptação-de-dados)
- [DevTools no infinitymmo.net](#devtools-no-infinitymmonet)
- [Manifests Chrome e Firefox](#manifests-chrome-e-firefox)
- [Build e release](#build-e-release)
- [Atualizações remotas](#atualizações-remotas)
- [Convenções](#convenções)

## Ambiente de desenvolvimento

Não há build step nem dependências (sem npm, sem bundler) — é HTML/CSS/JS
puro, carregado direto pelo navegador a partir da raiz do repositório.

**Chrome/Chromium:**

1. Abra `chrome://extensions`, ative o **Modo do desenvolvedor**.
2. **Carregar sem compactação** (*Load unpacked*) → selecione a raiz do
   repositório (onde está `manifest.json`).
3. Depois de editar qualquer arquivo: clique no botão de recarregar (↻) no
   card da extensão e recarregue a aba do jogo.

**Firefox:**

1. Abra `about:debugging#/runtime/this-firefox`.
2. **Carregar extensão temporária** → selecione o arquivo
   `manifest.firefox.json` diretamente na raiz do repositório (o carregador
   temporário do Firefox aceita qualquer nome de arquivo de manifesto,
   diferente do Chrome, que exige uma pasta contendo um `manifest.json`).
3. Extensões temporárias somem ao fechar o Firefox — repita o carregamento a
   cada sessão de teste. Depois de editar, use o botão **Reload** do próprio
   card em `about:debugging`.

Não existe suíte de testes nem linter configurado neste repositório —
verificação é manual, carregando a extensão e exercitando a aba do overlay
afetada (veja [DevTools no infinitymmo.net](#devtools-no-infinitymmonet)
para inspecionar cada contexto).

### Prints do README

`scripts/screenshots.js` regenera as imagens de `docs/images/` dirigindo, via
CDP, um Chrome já logado no jogo — o mesmo Chrome com porta de debug descrito em
[DevTools no infinitymmo.net](#devtools-no-infinitymmonet), carregando a
extensão com `--load-extension`. Com o overlay marcando "CONECTADO":

```bash
# fora do repo: Playwright é utilitário de dev, não dependência do projeto
mkdir -p ~/tools/playwright && cd ~/tools/playwright && npm install playwright

cd <raiz do repositório>
NODE_PATH=~/tools/playwright/node_modules node scripts/screenshots.js docs/images
```

O script faz um pré-voo antes de fotografar: aborta se o personagem não
sincronizou, se os iframes não carregaram e — comparando ids e scripts de cada
tela com o DOM vivo — se o Chrome não está renderizando o checkout atual. Esse
último caso é a armadilha do processo: um perfil de debug que já tenha a
extensão instalada de outro diretório ignora o `--load-extension`, e os prints
sairiam de outro código sem nenhum aviso.

Isso gera sete das oito imagens. A oitava sai com a batalha já na tela:

```bash
NODE_PATH=~/tools/playwright/node_modules node scripts/screenshots.js docs/images --encontro
```

O script nunca provoca batalha na conta do jogador — com `--encontro` ele exige
um encontro ativo e a caixa MELHOR JOGADA (que só aparece contra oponente ainda
não capturado), e aborta explicando se faltar. A imagem do leilão é pulada, com
aviso, se a aba não tiver anúncios carregados: ela é passiva e depende de o
jogador ter aberto o leilão dentro do jogo.

Dados de terceiros não entram nas imagens: a capa recorta o painel de chat e
**falha** se não localizar o recorte, e o print do leilão aplica tarja sobre o
nome dos vendedores — as duas proteções ficam no script, para sobreviverem a
qualquer regeneração futura.

O passo a passo completo, com a conferência visual de cada imagem, está na skill
`.claude/skills/atualizar-prints-do-readme/`.

## Arquitetura

A extensão roda em quatro contextos isolados, que só trocam dados por
mensagens (`postMessage`, `CustomEvent`, `chrome.scripting`) — nenhum deles
compartilha escopo de JavaScript com os outros:

- **Service worker** (`background.js`): não toca na página; cuida de
  injeção sob demanda, alarmes e verificação de atualizações/dados remotos.
- **`interceptor.js`** no **MAIN world** da página do jogo: único contexto
  com acesso ao `window.fetch` real usado pelo próprio infinitymmo.net.
- **`content.js`** no **isolated world**: monta o overlay (shell, abas,
  status, foco/desfoco automático) e reencaminha os dados capturados pelo
  interceptor para os iframes internos via `postMessage`.
- **iframes** (`index.html`, `battle.html`, `chart.html`, `myPokemons.html`,
  `auction.html`):
  cada tela do overlay roda no seu próprio documento, carregado como
  `web_accessible_resource`.

A injeção acontece em `runContentScripts()` (`background.js`), disparada
pelo clique no ícone, pelo atalho `Ctrl+Shift+Y` (modo `'toggle'`, fecha o
overlay se já existir) ou automaticamente via `chrome.tabs.onUpdated` quando
uma página em `infinitymmo.net` termina de carregar (modo `'ensure'`, nunca
fecha um overlay já aberto — só garante que exista; precisa ser idempotente
porque `tabs.onUpdated` pode disparar mais de um `'complete'` para a mesma
navegação). A injeção acontece em duas chamadas de `chrome.scripting.executeScript`
separadas: uma no isolated world com a lista de arquivos abaixo (nessa ordem,
por dependência entre eles) e outra no MAIN world só com `interceptor.js`:

```
data/extension-storage.js → components/pixel-icon.js
→ components/panel-zoom.js → components/tooltip.js
→ components/header-buttons.js → components/shortcut-utils.js
→ components/settings-panel.js → content.js
```

### Tabela de arquivos

| Arquivo | Contexto | Papel |
|---|---|---|
| `background.js` | service worker | Injeta os arquivos acima no clique/atalho e automaticamente ao carregar `infinitymmo.net`; roda os alarmes de atualização e dados remotos |
| `interceptor.js` | MAIN world | Hook do `window.fetch` da página |
| `content.js` | isolated world | Overlay, abas, foco/desfoco automático |
| `index.html` / `app.js` | iframe | Calculadora de tipos |
| `battle.html` / `battle.js` | iframe | Dados do encontro atual |
| `chart.html` / `chart.js` | iframe | Tabela completa e filtros de tipos |
| `myPokemons.html` / `myPokemons.js` | iframe | Party, caixas, detalhes, ordenação e filtros de Pokémon; exportar/importar a lista (a lista importada vive só na memória do iframe, nunca no storage) |
| `auction.html` / `auction.js` | iframe | Consulta paginada do leilão, filtros, Meus anúncios e Favoritos |

**`components/`** (compartilhado entre iframes e/ou `content.js`):

| Arquivo | Papel |
|---|---|
| `pixel-icon.js` | Ícones pixel-art 7×7 do design system (bitmap via `box-shadow`) e contraste automático de texto sobre cores de tipo |
| `panel-zoom.js` | Fator de zoom do conteúdo do painel (`PokemonHelperZoom`): escada de degraus, snap, persistência em `panelZoom` e notificação por `subscribe`. Nas páginas da extensão aplica `body { zoom }` sozinho; no content script só distribui o fator, para nunca tocar na página do jogo |
| `theme.js` | Normaliza e aplica `dark|light` somente no shell/iframes da extensão; nunca marca o documento do jogo |
| `panel-position.js` | Helper puro que limita `top/right` e mantém o cabeçalho recuperável no viewport |
| `shiny-alert.js` | Estado visual por batalha/oponente para anunciar shiny uma única vez por entrada |
| `tooltip.js` | Tooltip global por delegação de eventos (`data-tip`), respeita a preferência `tooltipsEnabled` |
| `header-buttons.js` | Barra de abas do overlay (encontro / calculadora / meus pokémons / config + expandir + minimizar) |
| `shortcut-utils.js` | Normalização e exibição de combinações de atalho (formato canônico `ctrl+shift+e`, `t`, `escape`) |
| `settings-panel.js` | Painel de Configurações do overlay; recebe leitura/gravação de settings via objeto `shell` (não tem acesso ao closure de `content.js`) |
| `shortcut-forwarder.js` | Repassa `keydown` dos iframes para o shell (`content.js`), que conhece o mapa de atalhos configurado |
| `type-tag.js` / `type-tag.css` | Dados de tipo (nomes, abreviações, ícones) e template de tag/pill, usados na calculadora e em Meus Pokémon |
| `type-chart-data.js` | Tabela de efetividade de tipos, compartilhada entre `app.js` e `chart.js` |
| `pokemon-filters.js` / `pokemon-filters.css` | Painel reutilizável de filtros avançados para listas de Pokémon |
| `pokemon-card.js` / `pokemon-card.css` | Card compartilhado por Meus Pokémons e Leilão; renderiza cabeçalho, Nature +/-, Habilidade hidratável, Item e IVs, aceitando extensões de contexto |
| `pokemon-transfer.js` | Exportar/importar a lista de Meus Pokémon (`PokemonTransfer`): whitelist de campos, envelope `{ format, version, exportedAt, party, pc }`, parser tolerante que também aceita `{ party, pc }` cru, e o slug do link do Smogon. Sem DOM e sem `chrome.*` |
| `catch-rate.js` | Cálculo de taxa de captura |
| `pokemon-evaluation.js` | Avaliação pura do exemplar conforme o perfil funcional da espécie; produz Função, nota, confiança, adequações e compatibilidade evolutiva |
| `iv-evaluation.js` | Alias temporário de compatibilidade para consumidores antigos do avaliador |
| `ability-info.js` | Normalização e lookup de dados de habilidade |
| `nature-effect.js` / `nature-effect.css` | Relação entre cada Nature e os atributos que ela aumenta/diminui |
| `update-notice.js` / `update-notice.css` | Aviso compartilhado de atualização disponível, usado nas telas internas |

**`data/`** (compartilhado):

| Arquivo | Papel |
|---|---|
| `extension-storage.js` | Camada de persistência (`PokemonHelperStorage`): chaves e valores padrão de configurações, cache de pokédex/habilidades/golpes de treinador e status de atualização |
| `constants.js` | Tabela nome → ID de espécie |
| `move-types.js` | Tabela golpe → tipo, gerada a partir da PokeAPI (`type/{type}.moves`); infere o tipo dos golpes prováveis de um oponente, já que o jogo não revela o moveset real na batalha |
| `move-status.js` | Golpes de categoria "status" (sem poder de ataque), gerados a partir da PokeAPI, para não computar fraqueza/resistência de golpes que não causam dano |
| `move-details.js` | Detalhes de golpe (poder, precisão, PP, categoria, efeito), gerados a partir da PokeAPI (`/move/{slug}`); usado no tooltip de golpes em `battle.js` |
| `pokemon-role-rules.js` | Taxonomia versionada de funções, pesos de IV, faixas, thresholds relativos de velocidade, tags de habilidades e exceções |
| `pokemon-species-profiler.js` | Gera o perfil funcional fixo e resolve `prevo`/`evo` em tendência ou potenciais durante a atualização da Pokédex |

## Interceptação de dados

`interceptor.js` sobrescreve `window.fetch` no MAIN world (único contexto
com acesso ao fetch real da página). Ele reconhece duas famílias de URL, via
regex mutáveis em propriedades de `window` (não `const`), para poder
atualizar o padrão numa reinjeção futura sem recarregar a página — só o
patch do `fetch` em si acontece uma vez por carregamento
(`window.__pkmnHelperFetchPatched`):

- `window.__pkmnHelperBattleUrlRe` (`/\/battle\//`) → clona a resposta, faz
  `.json()` e dispara `CustomEvent('pkmn-helper-battle-data')` no `window`.
- `window.__pkmnHelperCharacterUrlRe` (`/\/character/`) → mesma lógica,
  disparando `CustomEvent('pkmn-helper-character-data')`.

Ambos os eventos atravessam para `content.js` (isolated world) normalmente e
são tratados pelo mesmo handler (`handleHelperPayload`), registrado uma vez
para os dois nomes de evento. `content.js` decide o que fazer **pelo formato
do payload, não pela URL exata**:

- `data.foe`, `data.state?.foe?.mon` ou `data.battleId` presente → foca na
  aba Encontro (abrindo o overlay se estiver colapsado), a menos que o
  usuário tenha desligado a troca automática. Não existe mais um estado de
  "fim de batalha" separado dentro de `battle.js`: ele guarda o último `foe`
  recebido e só mescla campos novos por cima dele, porque respostas de turno
  (ex.: atacar) nem sempre reenviam o objeto `foe` completo.
- `data.party` ou `data.pc` presente, sem `data.state.over === true` → sync
  de personagem; troca para a aba Meus Pokémon **só** se o overlay estiver
  parado na view ociosa (`calc`), pra não atropelar navegação manual do
  usuário para outras abas (Configurações, tabela...). Esse payload chega
  passivamente sempre que o jogo sincroniza, não só quando o jogador abre a
  tela de time.
- `data.state.over === true` (fim de luta) → sinal usado **apenas** em
  `content.js`, para decidir se volta para a aba que estava aberta antes de
  focar automaticamente em Encontro (`overlay.dataset.preBattleView`), com
  um atraso maior para fim de luta normal e menor quando a fuga deu certo
  (`data.state?.outcome === 'fled'` ou evento `{t: 'flee', ok: true}`).
  **`battle.js` ignora esse campo de propósito**, para não virar um estado
  de tela separado ali — há histórico específico de bug por trás disso (a
  tela de "resultado" chegou a ficar presa/inconsistente quando dependia de
  `state.over` para decidir o que mostrar).

### Bridge de consulta do leilão

O bridge só captura/reutiliza `Authorization` quando a preferência booleana
`auctionRequestsEnabled` está ativa. A preferência é persistida, a credencial
não: ela permanece exclusivamente no MAIN world e é apagada ao desativar ou em
`401/403`. Desativado, `bootstrap` responde `disabled` sem rede e todas as ações
do iframe são recusadas antes de `fetch`.

`auction.html` roda na origem da extensão e não recebe credenciais. Ele não faz
request ao carregar: mostra um estado de espera até o próprio jogo consultar
`/api/auction/`. O wrapper de `fetch` no MAIN world observa essa primeira
request sem alterá-la, guarda seu `Authorization` somente em memória e sanitiza
a primeira resposta e seus query params para reutilizá-la sem consulta duplicada.
Os controles do iframe são sincronizados com esses parâmetros antes de buscar a
página 2, impedindo mistura entre consultas diferentes.

Depois do bootstrap, `auction.js` envia ao parent uma mensagem
`auction-command`; `content.js` aceita a mensagem somente quando
`event.source` é o iframe do leilão e a converte no evento
`pkmn-helper-auction-command`. O `interceptor.js`, no MAIN world, possui uma
allowlist fechada (`bootstrap|browse|favorite|sellables|list|cancel`). Para consulta, constrói
internamente a URL `/api/auction/browse`; para favorito, aceita somente
`listingId` numérico já visto numa resposta sanitizada, além de `on` booleano,
e constrói `POST /api/auction/favorite`.
As duas operações acrescentam internamente o header mantido no MAIN world.
`bootstrap` nunca acessa a rede: retorna `waiting|ready` e a primeira resposta
cacheada.

`sellables` constrói internamente `GET /api/auction/sellables` e devolve apenas
os Pokémon, com ID, origem Party/PC, snapshot necessário ao card e `raidLockH`;
itens e skins não atravessam o bridge. O iframe recebe separadamente apenas o
booleano `vip` do payload mais recente do personagem para calcular a capacidade
visual de 10/30 anúncios, nunca o payload completo por esse caminho.

O modo Anunciar agrupa os vendáveis por Party/PC, permite
seleção múltipla e preços comum/individual entre 1 e 999.999.999, mostra lock de
raid, shiny e item equipado, e produz uma revisão local com bruto e líquido
estimado. A capacidade combina `vip` com o total de `tab=mine`. Antes de publicar,
a tela revalida a capacidade, confirma quantidade/total e exige uma segunda
confirmação se houver shiny ou item equipado. A publicação individual é o caso
de uma fila com um item; seleções múltiplas usam uma fila sequencial no iframe,
com um `/list` por vez, snapshot congelado e status por Pokémon. Rejeições
definitivas seguem para o próximo item; timeout, rede, rate limit ou outra falha
ambígua interrompem os restantes sem retry.
Tanto a revisão quanto o acompanhamento da fila reutilizam cópias somente
leitura do card compartilhado de Pokémon, preservando detalhes e acrescentando
preço e status; não usam uma lista textual paralela.
A revisão fica imediatamente abaixo das mensagens da ação de preço/seleção e
acima do resumo e da grade de Pokémon vendáveis, mantendo a decisão próxima aos
controles que a originaram sem esconder a lista de origem.

`list` aceita somente ID presente no conjunto mais recente de vendáveis e preço
inteiro válido. `cancel` aceita somente ID visto como `is_mine: true`. Ambas as
ações bloqueiam duplicidade e não têm retry automático. Rejeição de anúncio
atualiza vendáveis e Meus anúncios; qualquer falha de cancelamento mostra a
mensagem de recuperação definida, volta a Explorar e refaz a busca inicial.
Ao concluir ou interromper uma fila, vendáveis e contagem de Meus anúncios são
recarregados. Sucessos anteriores permanecem válidos e nunca há rollback
simulado. Enquanto a fila está ativa, navegação/edição são bloqueadas e o iframe
usa `beforeunload` para alertar sobre fechamento ou recarga.

A resposta é reduzida aos campos usados pela UI antes de voltar pelos eventos
`pkmn-helper-auction-result` → `auction-result`. URL, método, headers, cookies e
token nunca são aceitos do iframe nem devolvidos a ele. `401`/`403` apaga a
credencial em memória e retorna a UI ao estado de espera. As abas Explorar, Meus
anúncios e Favoritos usam o mesmo contrato com `tab=browse|mine|favorites`.
Esse bridge é independente do duck-typing de batalha/personagem descrito acima.

Favoritar/desfavoritar exige clique explícito, não envia novamente o estado
atual e mantém a estrela bloqueada durante a request. A UI só consolida a
alteração quando a resposta confirma `{ ok: true, on: estadoSolicitado }`. Não
há retry automático; falha ou resposta ambígua restaura o estado anterior e
atualiza a listagem para reconciliar anúncio vendido ou expirado.

O Leilão acumula resultados: depois da página 1, busca a página 2 imediatamente;
as seguintes são solicitadas quando o sentinela ao fim da lista entra no
viewport. A lista deduplica por ID e para em `pages`. Seus cards usam o mesmo
componente e a mesma grade responsiva de Meus Pokémons, com metadados do anúncio
inseridos por slots. Cards começam recolhidos; “Detalhes de todos” controla o
conjunto e também vale para cards anexados posteriormente pelo scroll.

A busca por nome usa `q` no servidor após debounce de 700 ms. O sentinela aceita
scroll ou clique e mostra “CLIQUE OU ROLE PARA CARREGAR MAIS”. Natureza,
Habilidade, Item e IVs vêm do componente comum; o Leilão acrescenta Vendedor,
Expira e Preço e omite Posição, Golpes e Captura.
Preço e Nível usam o mesmo tamanho de fonte (`12px`).

## DevTools no infinitymmo.net

O infinitymmo.net bloqueia DevTools normal (F12 trava a aba), então siga
esta ordem:

1. Abra o site e ative o overlay da extensão (ícone ou `Ctrl+Shift+Y`).
2. No painel do Chrome que abriu, clique no ícone de "⋮" → **More tools →
   Developer tools**, e logo em seguida arraste a janela do DevTools pra
   fora, deixando ela **undocked** (não presa na mesma janela da aba). Isso
   evita o gatilho de bloqueio por redimensionamento.
3. Vá em **Settings → Ignore list** e adicione o padrão `infinitymmo\.net`
   antes de continuar. Isso faz o `debugger;` do site ser ignorado de
   verdade (a opção `breakpointsActive: false` não resolve isso).
4. Agora escolha o que quer inspecionar, no menu de contexto (topo do
   painel Sources/Console) ou pelo `chrome://extensions`:
   - **Service worker** (`background.js`): `chrome://extensions` → card da
     extensão → link "service worker". Se o link tiver sumido, clique no
     ícone da extensão de novo pra acordá-lo.
   - **Content script / overlay** (`content.js`, `interceptor.js`): use o
     DevTools já aberto na aba (passo 2); troque o contexto no topo do
     Console entre "top" e a extensão.
   - **Iframes** (`index.html`/`app.js`, `battle.html`/`battle.js`, etc.):
     botão direito dentro do painel da tela correspondente → "Inspecionar".
     Também dá pra abrir a URL do iframe direto numa aba nova:
     `chrome-extension://<ID-DA-EXTENSAO>/index.html` (ou `battle.html`) —
     o ID aparece no card da extensão em `chrome://extensions`.
5. Depois de editar qualquer arquivo: `chrome://extensions` → botão de
   reload (↻) no card da extensão → recarregue a aba do site.

## Manifests Chrome e Firefox

`manifest.json` (Chrome) e `manifest.firefox.json` (Firefox) são mantidos
**em sync manualmente** — não há geração automática. Qualquer mudança em
permissões, `web_accessible_resources` ou lista de arquivos precisa ser
replicada nos dois. Diferenças estruturais entre eles:

| Campo | Chrome (`manifest.json`) | Firefox (`manifest.firefox.json`) |
|---|---|---|
| Background | `background.service_worker: "background.js"` | `background.scripts: ["data/extension-storage.js", "background.js"]` |
| Configuração específica | — | `browser_specific_settings.gecko` |

`browser_specific_settings.gecko.id` é `ifinitymmo-helper@andaragui` — esse
valor é mantido **de propósito**, mesmo com o nome da extensão tendo mudado
para Infinity MMO Extension. Trocar esse id faria o Firefox tratar o pacote
como uma extensão completamente diferente, e todos os usuários que já
instalaram perderiam suas configurações salvas (`chrome.storage.local`,
namespaced por id da extensão no Firefox).

## Build e release

`scripts/build-chrome.sh` e `scripts/build-firefox.sh` só são necessários
para gerar um zip de release — não são exigidos para desenvolvimento (veja
[Ambiente de desenvolvimento](#ambiente-de-desenvolvimento)). Cada script:

1. Limpa e recria `dist/<browser>/`.
2. Copia o array `FILES` (lista fixa de arquivos na raiz) para dentro dessa
   pasta — **ao adicionar um novo arquivo carregado por `content.js` ou por
   um iframe, ele precisa entrar nesse array nos dois scripts**, além de em
   `web_accessible_resources` nos dois manifests.
3. Copia as pastas `icons/`, `components/` e `data/` inteiras.
4. No caso do Firefox, copia `manifest.firefox.json` para
   `dist/firefox/manifest.json` — é assim que o Firefox recebe um manifesto
   com o nome padrão dentro do zip publicado, sem precisar manter dois
   arquivos chamados `manifest.json` no repositório.
5. Zipa o conteúdo de `dist/<browser>/` em `dist/infinity-mmo-extension-chrome.zip`
   ou `dist/infinity-mmo-extension-firefox.zip`.

`dist/` é gerado e gitignored — nunca editar à mão nem versionar seu
conteúdo.

**Versão:** o campo `version` de `manifest.json` e `manifest.firefox.json`
só é incrementado em releases reais, nunca por commit de rotina. É esse
número que o próprio background.js usa para decidir se há atualização
disponível (veja a seção abaixo) — bumpar sem necessidade quebra essa
comparação para quem já está numa versão mais nova.

## Atualizações remotas

`background.js` mantém três verificações independentes via `chrome.alarms`,
todas relançadas ao iniciar o service worker (`initializeUpdateChecks`):

- **Verificação de nova versão** (`UPDATE_ALARM`, a cada 360 minutos = 6h,
  só roda se o usuário tiver notificações de atualização ativas): busca
  `manifest.json` (Chrome) ou `manifest.firefox.json` (Firefox — a escolha
  usa a presença de `browser_specific_settings` no manifesto instalado) na
  branch escolhida (`main` = estável, `develop` = beta, conforme a
  preferência do usuário) direto do GitHub:
  `https://raw.githubusercontent.com/andaraGui/pokemon-infinity-mmo-extension/<branch>/<manifest>`.
  Compara o campo `version` remoto com `chrome.runtime.getManifest().version`
  (comparação numérica por partes, não string) e grava o resultado em
  `chrome.storage.local` para os componentes de UI lerem.
- **Pokédex, habilidades e golpes de treinador**
  (`ABILITIES_ALARM`/`POKEDEX_ALARM`/`TRAINER_MOVES_ALARM`, cada um a cada
  1440 minutos = 24h): baixam de `infinitymmo.net/assets/data/wiki-abilities.json`,
  `wiki-pokedex.json` e `trainers.json` — **não** do repositório da
  extensão. Cada verificação também roda uma vez ao iniciar o service
  worker se o cache local já tiver passado desse prazo de 24h; se o cache
  ainda estiver válido, os dados salvos são reaproveitados sem nova
  requisição. Falha de rede mantém o cache anterior e grava só a mensagem
  de erro, sem derrubar os dados já baixados.
  Golpes de treinador passam por um índice local (`indexTrainerMoves`) que
  combina espécie + nível pra dar o moveset exato de um Pokémon de
  treinador — mais confiável que a heurística por nível usada em batalhas
  selvagens; quando duas entradas colidem na mesma chave, fica com o
  moveset mais completo (times de exibição às vezes vêm sem golpes).

Ao atualizar a Pokédex, o service worker preserva base stats, tipos,
habilidades e learnset e injeta um `evaluationProfile` versionado em cada
espécie. Se apenas a versão das regras mudar, o cache ainda válido é
reprocessado localmente, sem nova request. Meus Pokémon, Encontro e Leilão
fazem lookup desse perfil por espécie e executam somente o ajuste barato do
exemplar. Meus Pokémon também memoiza por ID e fingerprint de IVs, EVs,
Nature, habilidade e golpes; mudanças apenas de HP, status ou posição não
recalculam a avaliação. O Leilão usa o cache local e não amplia o bridge nem o
snapshot sanitizado.

A função atual deriva prioritariamente dos base stats. Spe combina relevância
interna (`relativeToMean`/`relativeToMax`) e percentil na Pokédex, evitando que
um corte absoluto classifique Zubat como lento. IVs pontuam o exemplar para a
função pronta e para cada destino evolutivo, mas nunca escolhem a função atual.
O refresh preserva `prevo`/`evo` e resolve as linhas em duas passagens; caches
antigos sem `evo` forçam uma nova request em vez de simular migração offline.

Todo esse estado (preferências, resultado da checagem, caches) vive em
`data/extension-storage.js` (`PokemonHelperStorage`), lido tanto pelo
service worker quanto pelas telas do overlay.

## Convenções

- Documentação e mensagens de commit em português; identificadores de
  código (variáveis, funções, nomes de arquivo) em inglês. Siga o estilo já
  presente em cada arquivo.
- Sem suíte de testes nem linter configurado — verificação é manual,
  carregando a extensão sem compactação e exercitando a tela afetada (veja
  [DevTools no infinitymmo.net](#devtools-no-infinitymmonet)).
- `manifest.json` e `manifest.firefox.json` precisam ficar em sync a cada
  mudança de permissões, `web_accessible_resources` ou arquivos carregados
  — assim como o array `FILES` dos dois scripts de build.
- Não bumpar a versão em `manifest.json`/`manifest.firefox.json` por
  commit de rotina — só em releases reais (veja
  [Build e release](#build-e-release) e
  [Atualizações remotas](#atualizações-remotas)).
