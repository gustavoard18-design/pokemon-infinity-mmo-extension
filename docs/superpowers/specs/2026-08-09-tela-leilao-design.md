# Tela de Leilão — Especificação

**Data:** 2026-08-09  
**Status:** proposta para validação  
**Base:** `AGENTS.md`, `docs/DEVELOPMENT.md`, tela atual do jogo e contratos de
rede observados localmente em 2026-08-09, incorporados abaixo de forma
sanitizada; as capturas locais não fazem parte desta documentação

## Objetivo

Adicionar ao overlay uma tela de leilão mais legível para pesquisar e comparar
Pokémon e, numa segunda etapa controlada, preparar e enviar vários anúncios com
preço individual ou preço comum.

A extensão não deve se tornar um cliente autônomo do jogo: toda compra ou venda
continua sendo uma ação explícita do jogador, usando a sessão aberta no
`infinitymmo.net`, com confirmação e resposta visível para cada operação.

## Conclusão de viabilidade

| Capacidade | Evidência disponível | Viabilidade | Limite conhecido |
|---|---|---|---|
| Consultar anúncios | `GET /api/auction/browse` e resposta paginada | Alta | O contrato foi inferido de amostras, não é uma API pública/versionada |
| Exibir preço e detalhes | `price`, `snapshot`, vendedor e datas | Alta | Preço chega como string e deve ser convertido/validado |
| Filtrar e ordenar | query params observados | Alta | Só devem ser enviados parâmetros comprovados |
| Mostrar Pokémon vendáveis | `GET /api/auction/sellables` | Alta para Pokémon | O servidor já filtra os Pokémon elegíveis da conta |
| Anunciar um Pokémon | `POST /api/auction/list` | Média | Preço, taxa, duração e limites confirmados; faltam erros de concorrência |
| Anunciar vários | várias chamadas individuais a `/list` | Média, não atômica | Não existe endpoint batch observado; sucesso parcial é possível |
| Comprar | `POST /api/auction/buy` | Tecnicamente possível, fora do MVP | Operação financeira irreversível, anúncio pode mudar/sumir; faltam erros de conflito |
| Meus anúncios | `GET /api/auction/browse?tab=mine` | Alta | Mesmo contrato paginado da busca |
| Consultar/alterar favoritos | `GET ...?tab=favorites` + `POST /api/auction/favorite` | Alta | Idempotência para repetir o mesmo estado ainda não foi comprovada |
| Cancelar anúncio próprio | `POST /api/auction/cancel` | Média | Só foi observado sucesso; faltam respostas de erro |
| Histórico | Nenhuma rota ou resposta observada | Não especificado | Não deve aparecer até existir contrato comprovado |
| “Avaliar preço justo” | É possível comparar anúncios similares | Parcial | Não há histórico de vendas; anúncios ativos são preços pedidos, não preços realizados |

Portanto, uma tela de **consulta organizada** é possível com boa confiança. A
venda assistida também parece tecnicamente possível, mas deve entrar atrás de
uma validação dos endpoints no jogo e não pode oferecer transação em lote
atômica. O endpoint de vendáveis está confirmado; a ativação de `/list` continua
condicionada à validação dos cenários de falha e do comportamento de lote.

## Contratos de rede observados

### Busca

A resposta de `GET /api/auction/browse` contém:

- raiz: `ok`, `listings`, `total`, `page`, `pageSize`, `pages`;
- anúncio: `id`, `kind`, `price`, `seller_name`, `seller_id`, `expires_at`,
  `created_at`, `is_mine`, `favorited`;
- snapshot de Pokémon: nome, espécie, nível, shiny, tipos, gênero, natureza,
  habilidade, item equipado, catch rate e os seis IVs.

A amostra tem seis resultados por página e comprova que o card pode mostrar
mais informação que a lista original do jogo sem buscar detalhes adicionais.

### Filtros comprovados

Os exemplos de `browse` comprovam estes parâmetros:

- `tab=browse`, `page` e `kind=mon|item|skin`;
- `sort=new|price_asc|price_desc|ending`;
- `shiny=1`, `perfect=1`, `nature=<nome>` e `type=<id>`;
- `q=<nome ou trecho>` para busca por nome;
- `levelMin`, `levelMax`, `priceMin` e `priceMax`.

O campo de nome usa `q` no servidor. A digitação aplica debounce de 700 ms:
cada nova tecla cancela o timer anterior e somente o valor estabilizado reinicia
a consulta na página 1. Limpar o campo também dispara uma nova busca.

### Abas do browse

O parâmetro `tab` foi observado com três valores que compartilham o mesmo
envelope `listings`, `total`, `page`, `pageSize` e `pages`:

| `tab` | Conteúdo | Observações |
|---|---|---|
| `browse` | mercado geral | `is_mine` e `favorited` variam por anúncio |
| `mine` | anúncios do jogador | resultados observados têm `is_mine: true` |
| `favorites` | favoritos do jogador | resultados observados têm `favorited: true` |

A aba Favoritos usa a mesma consulta e pode alterar o estado por uma ação
explícita no card. A mutação é confirmada pela resposta do servidor e não é
repetida automaticamente após falha ou resposta ambígua.

### Vendáveis, anúncio e cancelamento

`GET /api/auction/sellables` retorna `ok`, `mons`, `items`, `skins` e `count`.
Segundo a regra funcional confirmada, `mons` representa os Pokémon da conta que
podem ser vendidos: não vinculados à conta e não travados. Cada
Pokémon tem `id`, `location` (`party` ou `pc`), `snapshot` e `raidLockH`. A
amostra contém 52 Pokémon e todos têm `raidLockH = 0`. A presença futura de um
valor positivo não deve, sozinha, criar uma regra de bloqueio no cliente: a
lista retornada pelo servidor continua sendo a fonte de elegibilidade até que
o significado e o comportamento desse campo sejam validados.

O anúncio observado é individual:

```json
{ "kind": "mon", "monId": 185848, "price": 10000 }
```

e a resposta de sucesso contém `ok` e `listingId`. “Anunciar múltiplos” será,
assim, uma fila no cliente, não uma única transação do servidor.

O preço enviado a `/list` é um inteiro entre **1 e 999.999.999**, inclusive.
Valores fora desse intervalo são bloqueados no cliente antes da confirmação.

Todos os anúncios duram **7 dias**. Não há cobrança para criar ou para deixar
um anúncio expirar sem venda. Quando a venda é concluída, o jogo retém **5% do
preço** e credita 95% ao vendedor. O limite simultâneo é de **10 anúncios para
contas sem VIP** e **30 anúncios para contas com VIP**. A UI usa o estado `vip`
mais recente do personagem e a quantidade de `tab=mine`; enquanto o estado VIP
não estiver disponível, aplica o limite conservador de 10. O servidor continua
sendo a autoridade final caso o estado mude entre a consulta e o envio.

O cancelamento observado também é individual:

```json
{ "listingId": "25571" }
```

enviado via `POST /api/auction/cancel`. A resposta mínima de sucesso observada
foi `{ "ok": true, "kind": "mon" }`. A UI deve confirmar o anúncio antes da
chamada, remover o card somente após sucesso e atualizar “Meus anúncios”.

Para qualquer falha de `/cancel`, independentemente do status/corpo, a UI mostra
exatamente **“Não foi possível realizar a operação, necessário voltar para o
inicio do leilão”**. Ao confirmar, limpa o estado transitório, volta para
**Explorar** e refaz a sequência inicial (`bootstrap` em memória + busca da
página 1 e prefetch da página 2). Não há retry automático do cancelamento.

### Favoritar e desfavoritar

O estado desejado é enviado individualmente:

```json
{ "listingId": "26208", "on": true }
```

via `POST /api/auction/favorite`. Para remover, envia o mesmo corpo com
`on: false`. A resposta mínima observada é `{ "ok": true, "on": <boolean> }`.
A UI só consolida o novo estado quando `ok === true` e `on` coincide com o valor
pedido; depois atualiza a aba Favoritos quando necessário. A UI não oferece uma
ação que envie o estado atual novamente e não faz retry automático.

### Compra

O corpo observado é `{ "listingId": "24271" }`. A resposta informa saldo,
preço, comprador, vendedor e ganho do vendedor. Embora isso demonstre o
endpoint, compra não faz parte desta spec: o benefício principal é consulta e
venda assistida, enquanto um clique de compra incorreto tem impacto imediato.
Quando o comprador não possui ouro suficiente, a resposta contém um campo
`error` informando o valor necessário e o saldo disponível. Esse erro pertence
à compra e não indica taxa ou saldo mínimo para criar anúncios.

## Experiência proposta

### Navegação

Adicionar a aba **Leilão** ao cabeçalho do overlay, abrindo `auction.html` em
um iframe próprio. O estado da tela sobrevive apenas enquanto o iframe existir;
preferências duráveis pequenas (última ordenação/filtros, se desejado) usam
`PokemonHelperStorage`.

A tela possui quatro modos:

1. **Explorar** — lista paginada de anúncios e filtros.
2. **Meus anúncios** — anúncios ativos do jogador.
3. **Favoritos** — anúncios favoritados e ação explícita para alterar o estado.
4. **Anunciar** — seleção de Pokémon elegíveis e preparação da fila.

“Histórico” não aparece até que seu contrato seja observado. A estrela de
“Favoritos” fica bloqueada enquanto sua própria request estiver em andamento.

### Explorar

- Barra de resumo com quantidade carregada/total e estado de atualização.
- Filtros de servidor: categoria, tipo, nível, preço, raridade (shiny/perfeito),
  natureza e ordenação.
- Busca por nome no servidor (`q`), com debounce de 700 ms.
- Paginação incremental: a página 2 é buscada automaticamente assim que a
  página 1 renderiza; da página 3 em diante, um sentinela próximo ao final da
  lista carrega a próxima página conforme o scroll.
- Resultados novos são anexados aos anteriores, com deduplicação por `listing.id`;
  não há controles numéricos de paginação.
- Estados explícitos: carregando, vazio, erro de sessão/rede e dados inválidos.
- Atualização manual; sem polling agressivo.

Cada anúncio usa o **mesmo componente base** do card de “Meus Pokémons”, não uma
variação compacta. O markup e CSS estrutural ficam em
`components/pokemon-card.js`/`.css`; cada tela fornece apenas view model,
detalhes e metadados adicionais. A extração preserva a base visual atual de
Meus Pokémons. O Leilão usa a mesma grade responsiva de `.pokemon-list`,
organizando cards em linhas e colunas conforme a largura disponível. Cards
nascem recolhidos para manter a grade legível. O componente também centraliza
as linhas comuns de detalhes: Natureza com legenda de atributo aumentado e
reduzido, Habilidade com tooltip descritivo, Item e grade de IVs. O card mostra:

- sprite, nome, gênero, nível, shiny, tipos e IV total;
- preço em moeda do jogo, tempo restante e vendedor;
- natureza com legenda, habilidade com tooltip, item e IVs individuais;
- vendedor e expiração como extensões do detalhe, e preço no cabeçalho;
- marcadores “MEU” e “FAVORITO” quando os campos do payload indicarem;
- botão “Ver detalhes”. Não haverá “Comprar” no MVP.

O preço usa o mesmo tamanho de fonte do nível (`12px`). Ele pode ocupar uma
linha própria e aumentar discretamente a altura do cabeçalho do card; a
legibilidade tem prioridade sobre manter a altura mínima.

Em comparação a Meus Pokémons, o Leilão não mostra Posição, Golpes nem valor de
Captura. O tooltip de Habilidade usa o mesmo cache e
`PokemonAbilityInfo.hydrate()` da tela de Meus Pokémons.

Acima da lista há a opção **Detalhes de todos**, equivalente à de Meus
Pokémons. Ela alterna todos os cards entre expandidos/recolhidos; quando ativa,
cards recebidos por scroll também entram expandidos. O usuário ainda pode
recolher ou expandir um card individualmente sem desligar a opção global.

O tempo restante é derivado de `expires_at - Date.now()` e nunca usado como
garantia de disponibilidade. Strings vindas do servidor são escapadas antes de
entrar no HTML.

### Meus anúncios e cancelamento

- Usa a mesma lista, filtros e carregamento incremental de Explorar com `tab=mine`.
- O card mostra data de criação, expiração, preço e ação “Cancelar anúncio”.
- A ação abre confirmação com Pokémon e preço; não há cancelamento em massa.
- Durante a chamada, o botão fica bloqueado contra duplo clique.
- Em sucesso, atualiza a consulta; em erro ou timeout, não repete automaticamente.
- Em qualquer falha, aplica a recuperação genérica definida no contrato:
  mensagem única, retorno para Explorar e nova busca inicial.
- A aba entra no MVP somente leitura. Cancelamento fica na Fase 2.

### Favoritos

- Usa `tab=favorites` e o mesmo componente de listagem.
- Exibe o marcador e permite favoritar/desfavoritar por ação explícita no card.
- Envia o estado desejado (`on: true|false`), bloqueia duplo clique e só atualiza
  a UI se a resposta confirmar o mesmo valor.
- Não envia o estado atual novamente e não repete automaticamente uma falha.

### Apoio à precificação

Ao selecionar um Pokémon vendável, a tela pode consultar anúncios ativos da
mesma espécie e exibir:

- menor preço, mediana e faixa dos resultados obtidos;
- quantidade de amostras e filtros usados;
- aviso “baseado em anúncios ativos, não em vendas concluídas”.

Comparações opcionais por shiny, natureza, nível ou faixa de IV só serão
oferecidas quando puderem ser expressas pelos filtros do servidor ou calculadas
sobre uma amostra suficientemente identificada. Não chamar isso de “valor de
mercado” nem sugerir preço automaticamente sem mostrar a base.

### Anunciar múltiplos

1. Carregar a lista oficial de vendáveis.
2. Exibir cards selecionáveis, com origem Party/PC e bloqueio visível.
3. Permitir “aplicar a todos” e sobrescrever o preço por card.
4. Validar preço como inteiro positivo e limites conhecidos do jogo.
5. Mostrar revisão final: Pokémon, preço individual e total nominal.
6. Exigir confirmação explícita.
7. Enviar **uma requisição por vez**, mantendo a ordem visual.
8. Registrar por item: pendente, enviando, anunciado (`listingId`) ou erro.
9. Nunca reenviar automaticamente uma falha ambígua; oferecer repetição manual
   apenas depois de atualizar os vendáveis/anúncios para evitar duplicata.

Não existe rollback: se três de cinco chamadas funcionarem, os três anúncios
permanecem e os outros dois são apresentados como falha. Fechar o painel durante
o envio pede confirmação; a fila não continua em background.

Pokémon da Party podem ser anunciados. Pokémon com item equipado são vendidos
com o item. Antes de incluir na fila um Pokémon **shiny ou com item equipado**,
a UI exige uma segunda confirmação, separada da revisão geral, mostrando
claramente os dois riscos quando ambos se aplicarem. Pokémon vinculados ou
travados não aparecem em `/sellables` e não precisam ser reconstruídos a partir
de outras listas.

Se `raidLockH > 0`, o card exibe uma tag **“Lock de raid”**. O campo é somente
informativo: sua presença não remove nem desabilita um Pokémon que o servidor
incluiu em `/sellables`. Quando `raidLockH = 0`, nenhuma tag é renderizada.

## Arquitetura

Os iframes da extensão têm origem `chrome-extension://`/`moz-extension://` e
não devem receber token, cookie ou cabeçalho `Authorization`. Como a API exige
o token que o jogo inclui nas próprias chamadas, o bootstrap será **passivo**:
a extensão não dispara uma consulta ao carregar. O hook no **MAIN world** espera
a primeira request do próprio jogo para `/api/auction/`, extrai o valor de
`Authorization` de `Request.headers` ou `init.headers`, clona a primeira resposta
de `browse` e mantém ambos somente em memória durante a vida da página. Os query
params sanitizados dessa busca também inicializam os controles da extensão, para
que o prefetch da página 2 use exatamente o mesmo conjunto de filtros.

```text
auction.js (iframe)
  -> estado inicial: aguardando o jogador abrir o leilão no jogo
interceptor.js (MAIN world)
  -> observa a primeira request real do jogo, sem alterá-la ou duplicá-la
  -> guarda Authorization em memória e sanitiza/cacheia a primeira resposta
auction.js (iframe)
  -> postMessage: bootstrap ou comando permitido + requestId + dados validados
content.js (isolated world)
  -> CustomEvent: comando permitido + requestId + dados validados
interceptor.js (MAIN world)
  -> fetch same-origin com o Authorization capturado
  -> CustomEvent: resultado sanitizado + requestId
content.js
  -> postMessage somente para auctionFrame
```

O bridge usa uma allowlist fechada (`bootstrap`, `browse`, `sellables`, `list`,
`cancel` e `favorite`) e nunca aceita URL, método ou headers arbitrários do
iframe. Cada operação escrita tem payload validado por ação; `bootstrap` não
faz request: apenas informa `waiting|ready` e devolve a
primeira busca sanitizada, se já observada. O MAIN world lê o header apenas para
uso interno, nunca o transmite, persiste ou registra. Respostas são limitadas
aos campos necessários. `requestId` correlaciona respostas e um timeout impede
loading infinito.

O token fica em `window.__pkmnHelperAuctionAuth` ou closure equivalente no MAIN
world, desaparece no reload/fechamento da aba e é substituído quando uma request
posterior do próprio jogo traz novo `Authorization`. Resposta `401`/`403` limpa
o valor e devolve `AUTH_REQUIRED`; a UI volta a pedir que o jogador abra o
leilão no jogo. A extensão nunca tenta obter token de storage, cookie, DOM ou
payload de resposta.

Essa mudança em `interceptor.js` exige ler e preservar as regras de
interceptação em `docs/DEVELOPMENT.md`: patch idempotente, nomes internos
legados intactos e nenhum roteamento dos payloads existentes de batalha/personagem
por URL.

### Contratos internos

- `auction-command`: `{ requestId, action, params }` do iframe ao shell.
- `pkmn-helper-auction-command`: evento do isolated para MAIN.
- `pkmn-helper-auction-result`: `{ requestId, action, ok, data?, error? }`.
- `auction-result`: mesma resposta sanitizada do shell ao iframe.

Erros públicos são códigos estáveis (`NETWORK`, `HTTP`, `INVALID_RESPONSE`,
`TIMEOUT`, `NOT_ELIGIBLE`, `UNKNOWN`) mais mensagem segura. Corpo bruto,
stack, cookie e headers não atravessam contextos.

### Reuso e arquivos

- Novos: `auction.html`, `auction.js` e, se necessário,
  `components/auction-api.js` para validação/modelagem no iframe.
- Reusar: `pixel-theme.css`, `type-tag`, `pokemon-filters` onde o contrato
  couber, helpers de IV/nature/ability e `shortcut-forwarder`.
- Extrair o card atual de `myPokemons.js` para
  `components/pokemon-card.js`/`.css`, preservando classes, hierarquia e base do
  layout. Meus Pokémons e Leilão consomem o mesmo renderer; extensões entram por
  slots de markup (`badges`, metadados e detalhes), não por forks do componente.
- Adicionar os novos arquivos aos dois manifests e aos dois scripts de build.

## Segurança, privacidade e integridade

- Capturas de rede usadas na descoberta ficam somente locais e não entram no
  Git. Contratos necessários são copiados para esta documentação como schemas
  ou exemplos mínimos, sem credenciais nem dados pessoais. Credenciais expostas
  durante a captura devem ser revogadas, mesmo se aparentemente expiradas.
- Nunca persistir token, cookie, resposta integral ou dados da conta.
- Nunca enviar uma request de leilão antes de observar autenticação válida numa
  request originada pelo próprio jogo.
- Nenhuma escrita sem clique e confirmação do usuário.
- Bloquear duplo clique, IDs repetidos na fila e preço fora dos limites.
- Tratar toda resposta como não confiável e escapar texto na renderização.
- Não disparar compra, favorito, cancelamento ou anúncio em background.
- A implementação deve respeitar os termos e limites do jogo; ausência de uma
  API pública torna os endpoints sujeitos a mudança sem aviso.

## Critérios de aceite

### MVP de consulta

1. A aba Leilão abre/fecha e recebe atalhos sem quebrar as quatro telas atuais.
2. Lista Pokémon com os campos presentes na amostra, preço formatado e detalhes.
3. Filtros comprovados geram somente query params permitidos e reiniciam na
   página 1; a página 2 carrega imediatamente e as demais por scroll até `pages`.
4. Resultados acumulam sem duplicar `listing.id`; mudança de filtro/aba invalida
   respostas antigas e limpa o acumulado.
5. Explorar, Meus anúncios e Favoritos compartilham cards e carregamento, usando
   respectivamente `tab=browse`, `tab=mine` e `tab=favorites`.
6. O card renderizado nas duas telas vem do mesmo componente, sem alteração da
   base visual de Meus Pokémons; o Leilão usa a mesma grade em linhas/colunas.
7. Cards iniciam recolhidos; “Detalhes de todos” expande/recolhe o conjunto e
   também se aplica a resultados carregados depois pelo scroll.
8. Natureza e Habilidade têm a mesma apresentação/tooltip de Meus Pokémons;
   Leilão não renderiza Golpes nem Captura.
9. Consulta de Favoritos permanece disponível; a mutação só entra quando a
   ação escrita for habilitada com confirmação de resposta e sem retry automático.
10. Busca por nome envia `q` após 700 ms sem digitação, reinicia na página 1 e
    não emite uma request por tecla.
11. Loading inicial e loading incremental, vazio, timeout, HTTP e sessão inválida
   têm estados recuperáveis.
12. Nenhuma credencial chega ao iframe, console ou storage.
13. A primeira abertura mostra “Aguardando o leilão do jogo”; abrir o leilão no
   jogo alimenta a tela com a resposta já realizada, sem segunda request.
14. Após `401`/`403`, o token em memória é descartado e novas consultas ficam
    bloqueadas até outra request autenticada originada pelo jogo.

### Venda assistida (gate posterior)

1. Endpoint/contrato de vendáveis e erros de `/list` foram registrados nesta
   documentação com exemplos mínimos sanitizados.
2. Apenas Pokémon retornados como vendáveis podem entrar na fila.
3. Preço comum e sobrescrita individual funcionam e a revisão mostra todos os
   valores finais.
4. A fila é sequencial, impede duplicidade e exibe sucesso/falha por item.
5. Sucesso parcial não é mascarado; não há retry automático nem promessa de
   rollback.
6. Reabrir/atualizar a lista após venda remove os Pokémon já anunciados.
7. Cancelamento exige confirmação, aceita apenas `is_mine: true`, bloqueia
   duplo clique e atualiza a lista somente após sucesso; qualquer falha mostra
   a mensagem definida e reinicia o fluxo em Explorar.
8. Favoritar/desfavoritar envia `{ listingId, on }` e só consolida o estado
   quando a resposta confirma `ok` e o mesmo `on`.
9. Anúncios duram sete dias, não têm custo de criação e retêm 5% apenas quando
   vendidos; a revisão mostra preço bruto e valor líquido estimado de 95%.
10. A UI impede novas seleções ao atingir 10 anúncios sem VIP ou 30 com VIP,
    considerando anúncios ativos mais itens já confirmados na fila.
11. Pokémon shiny ou com item equipado exigem dupla confirmação; a revisão
    informa que o item acompanha o Pokémon.
12. `raidLockH > 0` mostra “Lock de raid”; zero não gera informação visual.

## Fora de escopo

- Compra pelo overlay.
- Bot de compra/venda, auto-refresh, sniping ou anúncio automático.
- Garantia de preço justo ou histórico de preços sem fonte de vendas concluídas.
- Itens e skins no primeiro release, embora `kind` indique expansão futura.
- Histórico sem endpoint observado.
- Cancelamento em massa.
- Alterar o fluxo existente de batalha/personagem ou renomear eventos legados.

## Validações respondidas

1. **Vendáveis:** `GET /api/auction/sellables`; `mons` já representa os Pokémon
   da conta elegíveis, excluindo vinculados e/ou travados.
2. **Preço:** mínimo 1 e máximo 999.999.999, inclusive.
3. **Autenticação:** o local atualmente interceptado funciona para as chamadas
   reais; manter a implementação existente e capturar apenas `Authorization`.
4. **Headers adicionais:** implementar somente o que foi observado; nenhum
   anti-CSRF ou header extra será inferido.
5. **Cancelamento com erro:** não depende de interpretar o corpo. Mostrar a
   mensagem única definida, voltar para Explorar e refazer as buscas iniciais.
6. **Favoritos:** `POST /api/auction/favorite` com `{ listingId, on }`; resposta
   mínima `{ ok: true, on }`. A UI nunca envia o estado que o anúncio já possui.
7. **Economia:** taxa de 5% somente sobre venda concluída; anúncio não vendido
   não gera cobrança. Todos os anúncios duram 7 dias.
8. **Limites:** 10 anúncios ativos sem VIP e 30 com VIP.
9. **Elegibilidade:** Party pode anunciar; vinculados/travados são omitidos de
   `/sellables`; item equipado acompanha o Pokémon vendido.
10. **Proteções:** shiny ou item equipado exige dupla confirmação.
11. **Raid:** `raidLockH > 0` gera tag informativa “Lock de raid”; zero é omitido.
12. **Preço inválido:** o cliente desabilita a venda fora de 1–999.999.999 e não
    envia a request.
13. **Sessão expirada:** limpar o estado do leilão e voltar à tela inicial de
    espera pelos dados de uma nova request do jogo.
14. **Saldo para anunciar:** não aplicável, pois a taxa só ocorre após a venda.

## Questões pendentes — roteiro para validação

### Falhas de `/list`

Para cada cenário que puder ser reproduzido com segurança, registrar **status
HTTP**, corpo JSON sanitizado e efeito final (anúncio criado ou não). Não tentar
provocar rate limit por spam.

1. **Elegibilidade alterada:** se o Pokémon for anunciado, travado ou deixar de
   ser vendável após carregar `/sellables`, o servidor provavelmente rejeitará
   `/list`. Quando isso ocorrer naturalmente, qual é o status HTTP e o corpo?
   Independentemente da resposta, a UI não repete automaticamente: atualiza
   vendáveis e Meus anúncios antes de permitir uma nova tentativa.
2. **Limite alterado ou divergente:** se o VIP expirar ou outro anúncio for
   criado fora da extensão entre a consulta e `/list`, qual resposta o servidor
   envia ao exceder 10/30 anúncios?
3. **Rate limit:** rate limit é uma proteção do servidor contra muitas requests
   em um intervalo curto. Não deve ser provocado. Se acontecer durante uso
   normal ou numa fila legítima, registrar: status HTTP (normalmente `429`),
   corpo da resposta e header `Retry-After`, se existir. Isso define se a UI
   deve apenas parar a fila ou também informar quanto tempo aguardar.

### Cálculo da taxa

4. **Arredondamento:** para um preço que produza 5% fracionário, por exemplo
   101, o vendedor recebe 95, 96 ou outro valor? Até essa regra ser observada,
   a revisão mostra “líquido estimado” e não promete um valor exato.

### Favoritos

5. **Anúncio indisponível:** se um anúncio for vendido ou expirar depois de ser
   exibido, mas antes do clique na estrela, qual status e corpo `/favorite`
   retorna? Não é necessário forçar o cenário. Até essa resposta ser observada,
   qualquer falha restaura a estrela anterior, não repete a operação e atualiza
   a listagem para verificar se o anúncio ainda existe.
