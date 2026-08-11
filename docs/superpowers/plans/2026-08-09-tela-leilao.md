# Tela de Leilão — Plano de Implementação

> Implementar em duas entregas. A Fase 1 é somente leitura. A Fase 2 só começa
> quando o gate de escrita da spec estiver satisfeito com contratos sanitizados
> incorporados à documentação. Capturas de rede locais nunca entram no Git.

**Goal:** Criar uma aba de leilão organizada, com pesquisa/paginação e apoio à
comparação de preços; depois, habilitar anúncio múltiplo assistido como fila de
operações individuais, segura e auditável na própria tela.

**Architecture:** HTML/CSS/JS sem build. `auction.html` roda em iframe; comandos
passam por `content.js`. `interceptor.js`, no MAIN world, espera a primeira
request de leilão feita pelo jogo, captura `Authorization` somente em memória e
reaproveita a primeira resposta. Só depois chama a API com ações fechadas e
respostas sanitizadas. Batalha e personagem continuam intactos.

**Spec:** `docs/superpowers/specs/2026-08-09-tela-leilao-design.md`

---

## Fase 0 — Consolidar contratos versionáveis

### Task 1: Registrar contratos sem depender de capturas locais

**Files:**
- Modify: `docs/superpowers/specs/2026-08-09-tela-leilao-design.md`
- Optional Add: `docs/superpowers/specs/auction-contracts.md`

- [ ] Não adicionar a pasta local de capturas ao Git nem referenciar seus nomes
  nos artefatos versionados.
- [x] Copiar somente schemas ou exemplos mínimos sanitizados de `browse`,
  vendáveis, `list`, `cancel`, `favorite` e `buy`, distinguindo confirmado,
  inferido e desconhecido.
- [ ] Registrar `browse` com `tab=browse|mine|favorites` e envelope comum
  `listings,total,page,pageSize,pages`.
- [ ] Registrar `cancel` como `POST` com `{ listingId }` e sucesso mínimo
  `{ ok: true, kind: "mon" }`.
- [x] Registrar `GET /api/auction/sellables` e a regra de que `mons` já contém
  apenas Pokémon elegíveis da conta.
- [x] Registrar `POST /api/auction/favorite` com `{ listingId, on }` e resposta
  `{ ok: true, on }`, sem ação redundante nem retry automático.
- [x] Registrar preço permitido de 1 a 999.999.999.
- [ ] Registrar que `price`/IDs alternam string/número e normalizar sem perder
  precisão (`Number.isSafeInteger`).
- [ ] Verificar que token, cookie, headers de fingerprint, dados pessoais e
  caminhos de capturas não foram copiados para `docs/`.
- [ ] Recomendar revogação/rotação de qualquer sessão exposta na captura.

### Task 2: Captura manual dos contratos faltantes

**Files:**
- Modify: `docs/superpowers/specs/2026-08-09-tela-leilao-design.md`
- Optional Modify: `docs/superpowers/specs/auction-contracts.md`

- [x] Confirmar URL/método da resposta de vendáveis sem versionar a captura.
- [ ] Validar erros de `/list` pelo roteiro da spec: limites inválidos, Pokémon
  que deixou de ser elegível, sessão expirada e, somente se ocorrer naturalmente,
  rate limit. Registrar status/corpo sanitizado/efeito final.
- [x] Manter somente `Authorization`; não inferir anti-CSRF ou headers extras.
- [x] Registrar taxa de 5% somente na venda concluída, duração de 7 dias e limite
  de 10 anúncios sem VIP ou 30 com VIP.
- [x] Para qualquer erro de `/cancel`, usar recuperação genérica sem depender do
  status/corpo: mensagem definida, Explorar, página 1 e prefetch da página 2.
- [x] Registrar a mutação de favoritos sem permitir envio redundante do mesmo
  estado; ainda observar falha para anúncio vendido/expirado.
- [ ] Gate: marcar venda assistida como habilitável apenas quando vendáveis e
  erros essenciais estiverem entendidos. Caso contrário, encerrar em consulta.

---

## Fase 1 — MVP somente leitura

### Task 3: Bootstrap passivo e bridge autenticado no MAIN world

**Files:**
- Modify: `interceptor.js`
- Modify: `content.js`

- [ ] Reler “Interceptação de dados” em `docs/DEVELOPMENT.md` antes da edição.
- [ ] Reconhecer `/api/auction/` no wrapper existente de `window.fetch`, sem
  impedir nem modificar a request original do jogo.
- [ ] Extrair `Authorization` de forma case-insensitive tanto de `init.headers`
  (`Headers`, objeto ou pares) quanto de `Request.headers`; nunca logar o valor.
- [ ] Guardar o header somente em memória no MAIN world e atualizá-lo quando o
  jogo fizer uma nova request autenticada. Nunca usar `chrome.storage`, DOM,
  atributo HTML, `postMessage` ou `CustomEvent` para transportar a credencial.
- [ ] Quando a primeira request for `browse`, clonar e sanitizar sua resposta e
  guardá-la como bootstrap; não disparar uma segunda consulta.
- [ ] Sanitizar também os query params da primeira busca e refletir seus filtros
  na UI antes do prefetch, evitando misturar página 1 e página 2 de consultas diferentes.
- [ ] Adicionar ação `bootstrap`, sem rede, que retorna `waiting|ready` e a busca
  inicial sanitizada quando disponível. Isso cobre o caso em que a resposta do
  jogo chegou antes de `auction.html` terminar de carregar.
- [ ] Adicionar listener idempotente para `pkmn-helper-auction-command` com
  allowlist inicial `bootstrap|browse`.
- [ ] Construir internamente `/api/auction/browse`; rejeitar URL, método e
  headers fornecidos pelo chamador.
- [ ] Validar/coagir `tab=browse|mine|favorites`, `page`, `kind`, `sort`, flags
  e ranges; usar apenas os parâmetros comprovados na spec.
- [ ] Aceitar `q` como texto sanitizado (trim e tamanho máximo), sem permitir
  que o iframe forneça URL, método ou headers.
- [ ] Recusar `browse` com `AUTH_REQUIRED` enquanto não houver token capturado.
- [ ] Executar fetch same-origin com `Authorization` capturado, timeout e
  tratamento HTTP/JSON; nunca expor credenciais.
- [ ] Em `401`/`403`, apagar token/bootstrap da memória, responder
  `AUTH_REQUIRED` e bloquear novas consultas até observar nova request do jogo.
- [ ] Sanitizar a resposta para o schema do leilão e emitir
  `pkmn-helper-auction-result` com `requestId`.
- [ ] Em `content.js`, encaminhar comandos apenas do `auctionFrame` e resultados
  apenas para ele. Validar origem/source e formato das mensagens.
- [ ] Preservar integralmente eventos/duck-typing de batalha e personagem.
- [ ] Rodar `node --check interceptor.js` e `node --check content.js`.

### Task 4: Adicionar a aba e o iframe de Leilão

**Files:**
- Modify: `content.js`
- Modify: `components/header-buttons.js` ou mapa usado pelo cabeçalho
- Modify: `components/pixel-icon.js` (somente se faltar ícone adequado)
- Add: `auction.html`
- Add: `auction.js`

- [ ] Adicionar item `auction` ao cabeçalho e ao mapa de views, com label e
  tooltip em PT-BR.
- [ ] Criar `pokemon-auction-frame`, carregá-lo como os demais iframes e incluí-lo
  em modo, atalhos, foco e `setActiveView`.
- [ ] Incluir `pixel-theme.css`, type tags, tooltips, IV/nature/ability helpers e
  `shortcut-forwarder.js` na ordem correta em `auction.html`.
- [ ] Implementar estado local previsível: `mode`, filtros, página, status,
  resultados e request em voo; respostas antigas não substituem consulta nova.
- [ ] Implementar cliente interno por `postMessage` com `requestId` e timeout.
- [ ] No load, pedir apenas `bootstrap`; não chamar `browse` automaticamente.
- [ ] Remover o comportamento provisório que chama `requestBrowse()` ao final
  da inicialização de `auction.js`.
- [ ] Mostrar “Abra o leilão no jogo para conectar” enquanto o status for
  `waiting`; quando `ready`, renderizar diretamente a primeira resposta.
- [ ] Se chegar `AUTH_REQUIRED`, voltar ao estado de espera sem retry/polling.
- [ ] Rodar `node --check auction.js` e `node --check content.js`.

### Task 5: Implementar abas de consulta, filtros, paginação e estados

**Files:**
- Modify: `auction.html`
- Modify: `auction.js`
- Modify: `components/pokemon-filters.js/css` somente se a extensão do componente
  for genérica e não causar regressão em Meus Pokémons

- [ ] Criar Explorar, Meus anúncios e Favoritos sobre o mesmo cliente/renderer,
  variando `tab` e estados vazios.
- [ ] Nesta fase de consulta, manter Meus anúncios sem cancelamento e deixar a
  mutação de Favoritos para a tarefa escrita específica; não renderizar ações
  antes de seu bridge e tratamento de falha estarem prontos.
- [ ] Criar controles para categoria, tipo, nível, preço, shiny, perfeito,
  natureza e as quatro ordenações comprovadas.
- [ ] Omitir parâmetros vazios; validar min ≤ max; mudança de filtro volta à
  página 1.
- [ ] Aplicar debounce de 700 ms à busca server-side por nome (`q`), cancelando
  o timer anterior e ignorando eventos durante composição IME.
- [ ] Acumular páginas em uma lista deduplicada por `listing.id`; mudança de
  aba/filtro cria uma geração nova, limpa resultados e invalida respostas antigas.
- [ ] Após renderizar a página 1, buscar a página 2 automaticamente uma única vez.
- [ ] Da página 3 em diante, usar `IntersectionObserver` num sentinela ao fim da
  lista, com fallback de evento de scroll, para carregar até `pages`.
- [ ] Tornar o sentinela clicável com “CLIQUE OU ROLE PARA CARREGAR MAIS”; clique
  e scroll chamam a mesma função protegida contra concorrência.
- [ ] Manter no máximo uma próxima página em voo; erro incremental preserva cards
  já carregados e oferece “Tentar novamente”.
- [ ] Remover controles de paginação e mostrar `carregados/total`.
- [ ] Busca estabilizada reinicia geração, acumulado e página 1; respostas da
  busca anterior permanecem invalidadas pelo `requestId`/geração.
- [ ] Renderizar loading skeleton, vazio, erro recuperável e botão atualizar.
- [ ] Desabilitar/ignorar resposta de request superseded para evitar corrida.

### Task 6: Implementar cards de anúncio

**Files:**
- Add: `components/pokemon-card.js`
- Add: `components/pokemon-card.css`
- Modify: `auction.html`
- Modify: `auction.js`
- Modify: `myPokemons.html`
- Modify: `myPokemons.js`

- [ ] Mapear cada `snapshot` para view model sem mutar o payload.
- [ ] Mover o markup base de `renderPokemonCard` e o CSS estrutural correspondente
  para o componente compartilhado, mantendo classes/hierarquia/layout atuais.
- [ ] Expor slots controlados para badges, conteúdo lateral e detalhes extras;
  escapar dados antes de passá-los aos slots.
- [ ] Centralizar no componente as linhas Natureza, Habilidade, Item e IVs.
  Natureza usa a mesma legenda +/- e Habilidade usa `data-ability` com
  `PokemonAbilityInfo.hydrate()` em ambas as telas.
- [ ] Migrar Meus Pokémons para o renderer compartilhado sem mudança visual.
- [ ] Migrar Leilão para o mesmo renderer e a mesma grade responsiva
  `.pokemon-list`, organizando cards em linhas e colunas como Meus Pokémons.
- [ ] Manter cards recolhidos por padrão e adicionar “Detalhes de todos” com
  `aria-pressed`, expandindo/recolhendo todos os cards carregados.
- [ ] Enquanto a expansão global estiver ativa, páginas anexadas pelo scroll
  devem renderizar os novos cards já expandidos; toggles individuais continuam
  funcionando por meio de exceções locais.
- [ ] No Leilão, adicionar apenas Vendedor, Expira e Preço ao card comum e omitir
  Posição, Golpes e Captura.
- [ ] Renderizar Preço com o mesmo `font-size` de Nível (`12px`), aceitando um
  pequeno aumento vertical do card para preservar legibilidade.
- [ ] Mostrar preço, vendedor, expiração, espécie, nível, gênero, shiny, tipos,
  IV%, natureza, habilidade, item e detalhes de IV.
- [ ] Escapar nome/vendedor/ability/item/nature antes de interpolar HTML.
- [ ] Tratar imagem ausente, campos nulos e data expirada.
- [ ] Mostrar `MEU`/`FAVORITO`, sem adicionar ações ainda.

### Task 7: Comparação de preço baseada em anúncios ativos

**Files:**
- Modify: `auction.js`
- Modify: `auction.html`

- [ ] Adicionar ação “Comparar” no card/detalhe de Pokémon.
- [ ] Consultar resultados comparáveis usando `q` e os demais filtros comprovados;
  validar correspondência exata da espécie no cliente antes das estatísticas.
- [ ] Calcular mínimo, mediana e faixa após validar preços.
- [ ] Mostrar tamanho da amostra, página(s) consideradas e aviso de que são
  anúncios ativos, não vendas concluídas.
- [ ] Não preencher automaticamente um preço de venda no MVP.

### Task 8: Empacotamento e QA da Fase 1

**Files:**
- Modify: `manifest.json`
- Modify: `manifest.firefox.json`
- Modify: `scripts/build-chrome.sh`
- Modify: `scripts/build-firefox.sh`
- Modify: `docs/DEVELOPMENT.md`

- [ ] Manter os manifests equivalentes sem alterar
  `browser_specific_settings.gecko.id` nem a versão.
- [ ] Incluir novos arquivos nos dois `FILES` quando não cobertos por cópia de
  pasta e em `web_accessible_resources` quando necessário.
- [ ] Documentar a nova tela, o bridge e o protocolo interno.
- [ ] Rodar `node --check` em todos os JS alterados.
- [ ] Rodar ambos os scripts de build e conferir conteúdo dos zips; não editar
  `dist/` manualmente.
- [ ] QA unpacked em Chrome e Firefox: navegação, filtros, scroll incremental, erros,
  três abas de consulta, cards, atalhos/foco e regressão das telas existentes.
- [ ] Confirmar página 2 automática, páginas seguintes no scroll, ausência de
  duplicatas e nenhuma request após alcançar `pages`.
- [ ] Comparar visualmente cards de Meus Pokémons antes/depois da extração.
- [ ] Confirmar grade responsiva do Leilão em painel encaixado e expandido,
  recolhimento inicial, expansão global e novos cards expandidos após scroll.
- [ ] Confirmar Nature +/-, tooltip de Habilidade nas duas telas, ausência de
  Captura/Golpes no Leilão, clique no sentinela e debounce de busca por nome.
- [ ] Confirmar no Network/console que token/cookie não atravessam ao iframe e
  não são logados.
- [ ] Confirmar no Network que abrir a tela da extensão antes do leilão do jogo
  produz zero requests e que a primeira busca do jogo não é duplicada.
- [ ] Confirmar captura nos formatos `fetch(url, { headers })` e
  `fetch(new Request(...))`, conforme os formatos realmente usados pelo jogo.
- [ ] Confirmar rotação do token e limpeza após `401`/`403` e reload da página.

---

## Fase 2 — Venda assistida (somente após o gate)

### Task 9: Estender bridge para vendáveis, anúncio e cancelamento individual

**Files:**
- Modify: `interceptor.js`
- Modify: `content.js`
- Modify: `auction.js`

- [x] Adicionar ações fechadas `sellables`, `list`, `cancel` e `favorite`; continuar
  proibindo URL, método e headers arbitrários.
- [x] Para `list`, aceitar apenas `monId` presente no conjunto retornado por
  `/sellables` recém-carregado e preço inteiro entre 1 e 999.999.999.
- [x] Vincular comando a gesto/fluxo confirmado no iframe e bloquear duplicata
  enquanto houver request em voo.
- [x] Normalizar erros observados para os códigos internos da spec.
- [x] Para `cancel`, aceitar somente `listingId` presente em resposta recente de
  `tab=mine` com `is_mine: true`; a confirmação acontece no iframe.
- [x] Para `favorite`, aceitar `listingId` de card atual e booleano `on`; validar
  que a resposta confirma o mesmo estado solicitado.
- [x] Não implementar retry automático.
- [ ] Rodar checks de sintaxe e testar sessão expirada sem vazar dados.

### Task 10: Tela de seleção e precificação

**Files:**
- Modify: `auction.html`
- Modify: `auction.js`

- [x] Criar modo “Anunciar” com cards da lista oficial de vendáveis.
- [x] Separar/identificar Party e PC. Tratar a lista de `/sellables` como fonte
  de elegibilidade, inclusive para Pokémon da Party.
- [x] Permitir seleção múltipla, selecionar visíveis e limpar seleção.
- [x] Exibir tag “Lock de raid” somente quando `raidLockH > 0`, sem bloquear um
  Pokémon que esteja presente em `/sellables`.
- [x] Adicionar preço comum “aplicar aos selecionados” e campo individual por
  Pokémon; alteração comum não deve apagar sobrescritas sem confirmação clara.
- [x] Validar todos os preços antes de habilitar revisão.
- [x] Aplicar `min=1`, `max=999999999`, passo inteiro e a mesma validação no
  modelo antes de enviar ao bridge.
- [x] Exibir contagem, preços finais e total nominal na revisão.
- [x] Exibir por item o preço bruto e o líquido estimado após a taxa de 5%; não
  apresentar taxa de criação, pois ela não existe. Manter “estimado” até que o
  arredondamento de valores fracionários seja confirmado.
- [x] Obter o estado `vip` mais recente do personagem e combinar com o total de
  `tab=mine`: limitar a 10 sem VIP ou estado desconhecido e a 30 com VIP.
- [x] Contabilizar na capacidade anúncios ativos e o item individual confirmado;
  revalidar `tab=mine` antes da confirmação final.
- [x] Para Pokémon shiny ou com item equipado, exigir uma segunda confirmação
  explícita e informar que o item será vendido junto com o Pokémon.

### Task 10A: Publicação individual

**Files:**
- Modify: `interceptor.js`
- Modify: `content.js`
- Modify: `auction.js`
- Modify: `auction.html`

- [x] Habilitar publicação somente quando exatamente um Pokémon estiver
  selecionado e seu preço continuar válido.
- [x] Revalidar `tab=mine` imediatamente antes da confirmação.
- [x] Congelar ID, nome, preço, shiny e item durante a confirmação.
- [x] Exigir confirmação de Pokémon/preço e uma confirmação adicional para
  shiny ou item equipado.
- [x] Aceitar sucesso somente com `{ ok: true, listingId }`, sem retry automático.
- [x] Em rejeição ou timeout, atualizar vendáveis e Meus anúncios antes de uma
  nova tentativa; `401`/`403` volta à tela inicial sem dados.
- [x] Manter a publicação individual como caso de uma fila com um item.

### Task 11: Executor sequencial e resultado parcial

**Files:**
- Modify: `auction.js`
- Modify: `auction.html`

- [x] Exigir confirmação final com quantidade e total.
- [x] Congelar snapshot da fila para que seleção/preço não mudem durante envio.
- [x] Executar um `/list` por vez e mostrar `pending/running/success/error`.
- [x] Mostrar revisão e progresso com cópias somente leitura dos cards
  selecionados, incluindo preço e status individual.
- [x] Posicionar a revisão abaixo do feedback de preço aplicado e acima do
  resumo/grade de Pokémon vendáveis.
- [x] Guardar `listingId` somente em memória para o resumo da execução.
- [x] Em erro ambíguo, pausar a fila e pedir atualização antes de permitir retry.
- [x] Em erro definitivo de um item, permitir continuar os demais conforme regra
  explicitada na confirmação.
- [x] Ao terminar, recarregar vendáveis e busca; exibir sucesso parcial sem
  rollback fictício.
- [x] Ao tentar fechar/recarregar durante execução, pedir confirmação e nunca
  mover a fila para service worker/background.

### Task 12: Cancelamento assistido em Meus anúncios

**Files:**
- Modify: `auction.js`
- Modify: `auction.html`

- [x] Adicionar “Cancelar anúncio” somente a cards de `tab=mine` com
  `is_mine: true`.
- [x] Confirmar nome, nível e preço e explicar que a operação retira o anúncio.
- [x] Bloquear duplo clique e manter o card enquanto a chamada estiver em voo.
- [x] Em sucesso, atualizar `tab=mine` e vendáveis. Em qualquer erro/timeout,
  mostrar “Não foi possível realizar a operação, necessário voltar para o inicio
  do leilão”; após confirmação, voltar a Explorar e executar página 1 + prefetch
  da página 2, sem retry do cancelamento.
- [x] Não oferecer seleção ou cancelamento em massa.

### Task 13: Favoritar e desfavoritar

**Files:**
- Modify: `interceptor.js`
- Modify: `content.js`
- Modify: `auction.js`
- Modify: `auction.html`

- [x] Adicionar estrela acionável fora de `tab=mine`, enviando o estado desejado
  por `{ listingId, on }` somente após clique explícito.
- [x] Bloquear a estrela durante a request e não aplicar atualização otimista.
- [x] Consolidar o estado apenas com `{ ok: true, on: estadoSolicitado }`;
  atualizar/remover o card da aba Favoritos conforme o resultado.
- [x] Não fazer retry automático em falha ou resposta ambígua.
- [x] Nunca enviar `on` igual ao estado atual do card; um clique alterna uma vez
  e o controle permanece bloqueado até a resposta.
- [x] Em falha, restaurar o estado visual anterior e atualizar a listagem para
  reconciliar anúncio vendido/expirado.

### Task 14: QA destrutivo controlado com o usuário

**Files:** nenhum obrigatório; ajustes nos arquivos da Fase 2 conforme achados.

- [ ] Testar primeiro com um único Pokémon de baixo risco e preço confirmado
  pelo usuário.
- [ ] Verificar sucesso, remoção dos vendáveis e aparição no leilão.
- [ ] Testar lote pequeno com preços diferentes e preço comum.
- [ ] Validar cenário de sucesso parcial sem retry/duplicata.
- [ ] Validar duplo clique, fechamento durante fila, sessão expirada e Pokémon
  que deixou de ser elegível.
- [ ] Validar cancelamento de um anúncio próprio de baixo risco, atualização das
  listas e erro sem retry automático.
- [ ] Repetir regressão de batalha, personagem, atalhos, foco e demais abas em
  Chrome e Firefox.
- [ ] Só então tornar o modo “Anunciar” visível por padrão.

---

## Ordem recomendada de entrega

1. Contratos sanitizados incorporados à documentação, sem capturas no Git.
2. Consulta organizada e cards (release somente leitura).
3. Favoritar/desfavoritar, por ser a escrita de menor impacto já observada.
4. Seleção de vendáveis e comparação de preços, ainda sem publicar anúncio.
5. Venda individual pelo bridge, inicialmente protegida/experimental.
6. Cancelamento individual confirmado em Meus anúncios.
7. Fila de múltiplos anúncios após validar a operação individual.

Não implementar compra ou histórico como efeito colateral destas tarefas; cada
um precisa de contrato e spec próprios. Consulta e mutação de Favoritos, venda
assistida e cancelamento individual estão cobertos por tarefas separadas neste
plano e devem ser habilitados somente quando cada etapa estiver completa.
