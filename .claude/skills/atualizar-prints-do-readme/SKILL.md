---
name: atualizar-prints-do-readme
description: Use when o usuário pedir para atualizar, regerar, corrigir ou adicionar imagens, prints ou screenshots do README ou de docs/images desta extensão — inclusive quando disser que as imagens estão desatualizadas depois de mudanças de UI, ou que uma imagem do README está quebrada.
---

# Atualizar os prints do README

## Overview

As imagens de `docs/images/` saem do jogo real: um Chrome logado no
infinitymmo.net, com esta extensão carregada, dirigido por CDP.
`scripts/screenshots.js` faz a captura das seis imagens automatizáveis.

**O trabalho não é rodar o script — é garantir que o navegador esteja
fotografando o código certo, com dados certos, e conferir o resultado com os
próprios olhos.** O script não sabe se a imagem ficou boa.

## Antes de qualquer coisa

**Os prints saem do código que está em checkout.** Confirme com o usuário de
qual branch as imagens devem sair; não deduza. Se a branch tiver trabalho que
não pode ir a público (veja `MEMORY.md` do projeto), pare e pergunte.

## Procedimento

1. **Instale o Playwright fora do repositório.** O projeto não tem
   `package.json` de propósito (`AGENTS.md`) — não crie um.

   ```bash
   mkdir -p ~/tools/playwright && cd ~/tools/playwright && npm install playwright
   ```

2. **Peça ao usuário** para subir o Chrome de debug e logar no jogo. Você não
   loga e não pede credencial:

   ```bash
   google-chrome \
     --user-data-dir=/tmp/perfil-debug-prints \
     --remote-debugging-port=9222 \
     --load-extension=<raiz do repositório> \
     https://infinitymmo.net
   ```

3. **Espere o rodapé do overlay marcar "CONECTADO"** (não "AGUARDANDO DADOS").

4. **Rode o script** da raiz do repositório:

   ```bash
   NODE_PATH=~/tools/playwright/node_modules node scripts/screenshots.js docs/images
   ```

   Ele faz o pré-voo sozinho: aborta se o personagem não sincronizou, se o
   overlay não está aberto, ou se o Chrome não está renderizando este checkout.
   **Leia a mensagem de erro e corrija a causa** — não contorne o pré-voo.

5. **Abra cada PNG gerado e olhe.** Obrigatório (veja abaixo).

6. **Commite só o que mudou de verdade.** São binários; `capa-overlay.png`
   passa de 600 KB. `git status --short docs/images` antes de `git add`.

## Conferência (o script não valida nada)

Abra cada PNG e olhe. Duas checagens objetivas primeiro, porque pegam build
errada mais rápido que o olho:

- **Contagem de abas no cabeçalho.** A build atual tem **5** (Encontro,
  Calculadora, Meus Pokémon, Leilão, Configurações). Se aparecerem 4, o print
  saiu de código antigo — pare tudo.
- **Largura.** As telas encaixadas saem com a largura do painel (363px na
  configuração padrão). Uma imagem com largura diferente das outras encaixadas
  veio de outro lugar.

| Imagem | O que precisa aparecer |
|---|---|
| todas | sem tooltip aberto; rodapé "CONECTADO"; aba correta em destaque |
| `capa-overlay.png` | **nenhum nome ou mensagem de outro jogador** |
| `aba-leilao.png` | anúncios variados (não um resultado de busca preso) e **a tarja sobre todos os vendedores** |
| `aba-calculadora.png` | um tipo selecionado e a lista de multiplicadores preenchida |
| `aba-meus-pokemon.png` | a fita de botões (GOLPES / EXPORTAR / IMPORTAR), filtros avançados **e** cards, tudo na mesma imagem — por isso essa é tirada em modo full |
| `tela-configuracoes.png` | os cinco blocos, de PAINEL a ATALHOS |
| `modo-full.png` | tabela de tipos ao lado, com tipo ainda selecionado |
| `tabela-tipos.png` | grade 18×18 inteira, sem corte |

## `aba-encontro.png` depende do usuário

Ela exige uma batalha em andamento, e a ferramenta não deve provocar batalha na
conta do usuário. Peça para ele entrar numa **batalha selvagem com oponente
ainda não capturado** — sem isso não aparece a caixa MELHOR JOGADA, que é o que
a legenda do README promete — e avisar. Com a batalha de pé:

```bash
NODE_PATH=~/tools/playwright/node_modules node scripts/screenshots.js docs/images --encontro
```

O script confere o encontro e a caixa antes de fotografar, e aborta explicando
o que falta. É rápido: dá para rodar enquanto o usuário segura o turno.

## Armadilhas

| Sintoma | Causa real |
|---|---|
| Prints saem sem a UI nova | O perfil de debug já tinha a extensão instalada de **outro diretório**; aí o `--load-extension` da linha de comando é ignorado e o que roda é a instalação antiga. O pré-voo detecta. Confira o caminho real em `chrome://extensions` (ou em `<perfil>/Default/Preferences`, campo `path` da extensão) — não confie na linha de comando do processo. Corrija recarregando a extensão (↻) e a página; se o caminho registrado for outro, remova-a do perfil e recarregue sem compactação a partir da raiz do repositório. |
| `Cannot find module 'playwright'` | Faltou o `NODE_PATH` do passo 4. |
| Tooltip aparece no print | Clique real deixa o cursor no botão. Use clique programático (`element.click()` via `evaluate`), nunca `page.click`, e chame `semTooltip()` antes de fotografar. |
| Tela vazia ou "AGUARDANDO DADOS" | O overlay foi injetado depois do `/character/`. Recarregue a página do jogo. |
| O modo full não fica de pé | O jogo manda payload o tempo todo e o shell reavalia; o script já reaplica em laço. |
| Script aborta no recorte do chat | Ele prefere falhar a publicar o chat. Capture a capa à mão com o chat fechado. |
| Print do leilão pulado | A aba é passiva: só tem dados se o jogador tiver aberto o leilão dentro do jogo nesta sessão. Peça isso e rode de novo. |
| Script aborta na tarja do vendedor | O card do leilão mudou e a linha "Vendedor" não foi encontrada. Corrija o seletor — **não** gere a imagem sem tarja. |

## Erros comuns

- **Confiar no `{"feitos": [...]}`.** Ele só diz que o arquivo foi escrito.
- **Regerar tudo por hábito.** Cada rodada gera bytes diferentes mesmo com a
  tela igual; commitar as seis sempre incha o histórico à toa.
- **Deixar o Chrome de debug de lado.** É a sessão real do usuário; o script
  devolve o overlay ao estado encaixado, mas avise que mexeu nele.
