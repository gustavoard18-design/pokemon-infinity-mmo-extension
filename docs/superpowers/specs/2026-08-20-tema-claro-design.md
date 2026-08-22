# Interface — tema claro

**Data:** 2026-08-20  
**Status:** pronto para implementação

## Objetivo e abordagem

Oferecer leitura de alto contraste em fundo claro sem manter uma segunda folha
de estilos completa. O design system passa a usar tokens semânticos; o tema
claro sobrescreve os tokens em `[data-theme="light"]`. A preferência global
`theme` aceita `dark|light`, padrão `dark`; não segue o sistema nesta entrega.

O atributo é aplicado ao shell e a cada iframe antes ou imediatamente após a
leitura do storage, minimizando flash. As cores semânticas de tipos, IVs,
sucesso, alerta e erro mantêm significado e precisam atingir contraste legível.
Imagens/sprites não são modificados.

`components/theme.js` é injetado no isolated world antes de
`components/settings-panel.js` e carregado por cada iframe. Por ser um novo
arquivo do bundle, entra nos dois scripts de build; os manifests só mudam se os
curingas atuais não o cobrirem.

## Critérios de aceite

1. Toggle global alterna todas as telas abertas sem reinjetar o overlay.
2. Escolha persiste e o padrão atual continua escuro.
3. Texto normal, texto secundário, inputs, bordas e foco são legíveis no claro.
4. Estados shiny, erro, sucesso, seleção e barras de IV não dependem só da cor.
5. Não restam cores estruturais literais fora das tabelas/tokens justificadas.
6. Chrome e Firefox exibem o mesmo tema.

## Fora de escopo

Tema automático, customização livre de cores e mudanças na página do jogo.
