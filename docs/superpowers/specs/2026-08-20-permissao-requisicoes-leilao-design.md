# Configuração — permitir requests da extensão ao leilão

**Data:** 2026-08-20  
**Status:** pronto para implementação

## Definição

Adicionar uma configuração que permita ao jogador autorizar ou impedir que a
extensão faça requisições aos endpoints do leilão no servidor do jogo.

Essa configuração **não é uma configuração de token**. O jogador não informa,
edita ou salva credenciais. A extensão continua apenas observando o header
`Authorization` de uma request legítima feita pelo próprio jogo e, quando
autorizada, mantém esse valor exclusivamente em memória para as requests do
leilão iniciadas pela extensão.

## Preferência e padrão

- Chave: `auctionRequestsEnabled`.
- Tipo: booleano.
- Padrão: `false` (opt-in explícito).
- Local: preferências da extensão em `chrome.storage.local`.
- A única informação persistida é o booleano; token/header nunca vai ao storage.

Texto sugerido em Configurações → LEILÃO:

> **Permitir acesso ao leilão**  
> Autoriza a extensão a reutilizar temporariamente sua sessão para consultar e
> executar ações no leilão. A credencial não é salva.

## Comportamento desligado

- `interceptor.js` não conserva o header `Authorization` observado.
- Comandos `browse`, `favorite`, `sellables`, `list` e `cancel` não fazem rede e
  retornam erro estruturado `auction_requests_disabled`.
- `bootstrap` continua sem rede e informa status `disabled`.
- A aba mostra uma mensagem persistente, sem spinner:

> Para usar o Leilão, ative “Permitir acesso ao leilão” nas Configurações.

- A mensagem oferece botão `ABRIR CONFIGURAÇÕES`, que pede ao shell para navegar
  à tela de configurações; não ativa a preferência diretamente.
- Uma request nativa do jogo continua inalterada e recebe sua resposta normal;
  a extensão apenas deixa de guardar/reutilizar a credencial.

## Comportamento ligado

- O fluxo atual permanece: a primeira request nativa de `/api/auction/` fornece
  o `Authorization`, mantido somente no MAIN world.
- Até essa request acontecer, a aba informa `Abra o leilão no jogo para
  conectar.`
- Após a captura, os comandos permitidos usam a credencial em memória.
- `401/403` apaga a cópia em memória e volta ao estado `waiting`; o booleano
  permanece ligado.

## Mudança da preferência em tempo real

Ao desligar:

1. o isolated world envia ao MAIN world o novo estado por evento específico;
2. o MAIN world apaga imediatamente `window.__pkmnHelperAuctionAuth`;
3. novas requests da extensão são bloqueadas;
4. a UI muda para `disabled`.

Requests já enviadas não podem ser desfeitas, mas suas respostas não devem
provocar uma nova request. Ao ligar, o estado começa como `waiting`; a extensão
não recupera credencial antiga e aguarda uma nova request legítima do jogo.

## Fronteiras de segurança

- O iframe nunca envia nem recebe `Authorization`.
- O evento de preferência carrega somente `{ enabled: boolean }`.
- O content script só aceita comandos do iframe de leilão conhecido.
- A allowlist de ações e as validações de IDs/preços permanecem inalteradas.
- Nunca registrar headers, cookies ou credenciais no console.

## Critérios de aceite

1. Instalação/configuração antiga começa com requests da extensão desativadas.
2. Desligado, abrir o leilão nativo não armazena credencial na extensão.
3. Desligado, nenhum comando do iframe provoca request ao servidor.
4. A aba explica como ativar e abre Configurações por ação explícita.
5. Ligado, é necessário abrir o leilão nativo para estabelecer a sessão.
6. Ligado e conectado, explorar, favoritar, anunciar e cancelar mantêm o fluxo.
7. Desligar apaga imediatamente a credencial em memória e bloqueia novas ações.
8. Religar exige nova captura; nenhum token anterior é restaurado.
9. `401/403` limpa memória sem desligar a preferência.
10. `chrome.storage.local` não contém token/header antes, durante ou depois.

## Fora de escopo

Campo de token, persistência de credencial, login pela extensão, renovação de
sessão e mudança nas requests feitas pelo próprio jogo.

