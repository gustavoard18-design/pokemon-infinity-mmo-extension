# Política de Privacidade — Infinity MMO Extension

Última atualização: 11 de agosto de 2026.

A Infinity MMO Extension funciona exclusivamente nas páginas do domínio
`infinitymmo.net` para exibir um overlay com informações e ferramentas
relacionadas ao jogo.

## Dados processados

A extensão processa localmente, no navegador do usuário:

- respostas do jogo relacionadas a batalhas, personagem, Party, PC e leilão;
- preferências da extensão, como aparência, posição do painel e atalhos;
- a credencial de autenticação já usada pelo próprio site, somente em memória,
  para executar ações de leilão solicitadas explicitamente pelo usuário.

Esses dados não são vendidos, usados para publicidade, análise de comportamento
ou avaliação de crédito. A extensão não envia dados pessoais, conteúdo do jogo
ou credenciais ao desenvolvedor nem a terceiros.

## Armazenamento e transmissão

Preferências e caches de dados públicos do jogo são armazenados localmente por
meio de `chrome.storage.local`. A credencial de autenticação do site não é
gravada pela extensão e é descartada quando o contexto da página é encerrado ou
quando a sessão deixa de ser válida.

Quando o usuário consulta, favorita, anuncia ou cancela um item no leilão, a
extensão envia a solicitação diretamente para `infinitymmo.net`, usando a sessão
já aberta no site. A extensão também consulta arquivos públicos de dados em
`infinitymmo.net` e o manifesto público do projeto no GitHub para verificar
atualizações. Nenhum dado do usuário é incluído nessas consultas de atualização.

## Compartilhamento

O desenvolvedor não coleta nem compartilha dados dos usuários da extensão. A
transmissão necessária para ações do jogo ocorre diretamente entre o navegador
do usuário e `infinitymmo.net`.

## Controle do usuário

O usuário pode remover os dados locais desinstalando a extensão ou limpando os
dados da extensão nas configurações do navegador. A extensão pode ser desativada
ou removida a qualquer momento.

## Alterações e contato

Alterações relevantes nesta política serão publicadas neste arquivo. Dúvidas ou
solicitações podem ser abertas na página de issues do projeto:

https://github.com/andaraGui/pokemon-infinity-mmo-extension/issues
