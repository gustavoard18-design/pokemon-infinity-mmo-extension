# Batalha — alerta inequívoco de shiny

**Data:** 2026-08-20  
**Status:** pronto para implementação

## Problema e objetivo

O indicador atual é apenas uma estrela pequena ao lado do nome. Jogadores podem
não percebê-lo e fugir da batalha. Um shiny deve ser reconhecível em menos de um
segundo, sem depender somente de cor e sem cobrir dados ou controles.

## Design

Quando `foe.shiny === true`, o cabeçalho do encontro recebe três sinais
redundantes:

1. faixa persistente `★ SHINY ENCONTRADO ★` imediatamente acima do card;
2. borda e brilho dourado discretamente animados no card;
3. selo textual `SHINY` junto ao nome, substituindo a estrela isolada.

A animação acontece três vezes ao entrar ou ao trocar para um oponente shiny e
depois para; não reinicia a cada payload de turno. Com
`prefers-reduced-motion: reduce`, não há animação. O anúncio possui
`role="alert"` e texto real. Pokémon comuns mantêm o layout atual sem espaço
reservado. O sinal não dispara som, notificação do sistema nem impede a fuga.

## Estado e integração

`battle.js` registra a chave visual do encontro (`battleId` + espécie/posição do
oponente). A classe de entrada só é aplicada na primeira renderização dessa
chave; o estado não é persistido. `state.over` continua ignorado em `battle.js`.

## Arquivos

- `battle.js`: markup, chave de anúncio e classes condicionais.
- `battle.html`: CSS local do banner/card e regra de movimento reduzido.
- `scripts/test-pokemon-evaluation.js`: não é o lugar desta regra; criar um
  harness DOM focado em `scripts/test-battle-shiny.js`.
- `README.md`: registrar o alerta visual.

## Critérios de aceite

1. Shiny exibe faixa, selo textual e destaque de borda; comum não exibe nenhum.
2. Atualizações de HP/turno não reiniciam o pulso.
3. Troca para outro shiny em batalha de treinador gera novo anúncio.
4. O alerta é legível em painel encaixado, expandido e com zoom mínimo/máximo.
5. A experiência continua clara em escala de cinza e sem animação.
6. Nenhuma mudança usa `state.over` para controlar a tela.

## Fora de escopo

Som, notificação nativa, confirmação antes de fugir e alterações no jogo.

