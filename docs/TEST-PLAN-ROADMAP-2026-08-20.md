# Plano de testes — UX, leilão e Meus Pokémon

**Branch:** `feat/roadmap-ux-leilao`  
**Data:** 2026-08-20

## Pré-condições

1. Carregar a extensão sem compactar no Chrome e no Firefox conforme
   `docs/DEVELOPMENT.md`.
2. Usar uma conta de teste com party/PC, acesso ao leilão e, para o cenário
   shiny, um payload controlado ou encontro conhecido; não provocar fuga real.
3. Abrir DevTools pelo fluxo documentado e limpar erros anteriores.
4. Repetir os casos visuais no painel encaixado, expandido e em zoom 67%/200%.

## Testes automatizados

Executar na raiz:

```powershell
node scripts/test-pokemon-evaluation.js
node scripts/test-roadmap-features.js
node scripts/test-auction-permission.js
node scripts/test-battle-shiny.js
```

Esperado: todos com exit code `0`. Depois executar `node --check` em todos os
arquivos `.js` alterados.

## 1. Permissão do leilão

- Instalação/config antiga: abrir Leilão; deve mostrar acesso desativado e não
  fazer request do bridge.
- Clicar `ABRIR CONFIGURAÇÕES`; deve navegar para Configurações sem ativar sozinho.
- Ativar a permissão sem abrir o leilão nativo; estado deve ser “aguardando”.
- Abrir o leilão nativo; a extensão deve conectar e explorar normalmente.
- Exercitar explorar, favorito, anunciar e cancelar com dados descartáveis.
- Desativar durante a sessão; a UI deve bloquear imediatamente. Reativar não
  pode reutilizar a credencial antiga: exige nova request nativa.
- Simular/observar `401/403`; deve voltar a aguardar, mantendo o toggle ligado.
- Inspecionar `chrome.storage.local`: não pode conter `Authorization`, `Bearer`
  ou token; apenas `auctionRequestsEnabled`.

## 2. Alerta shiny

- Pokémon comum: nenhuma faixa, selo ou borda shiny.
- Primeiro payload shiny: faixa `SHINY ENCONTRADO`, selo textual e três pulsos.
- Atualizar HP/turno: a animação não reinicia.
- Trocar para outro shiny em batalha de treinador: novo pulso.
- Ativar redução de movimento no SO/DevTools: faixa/borda persistem sem animação.
- Conferir contraste em tema escuro/claro e escala de cinza.

## 3. Filtros e IVs

- Abrir filtros após sincronizar: lista de habilidades deve refletir party/PC,
  sem duplicatas e em ordem alfabética.
- Selecionar duas habilidades: Pokémon com qualquer uma aparece (OR).
- Combinar habilidade, duas avaliações, tipo e IV mínimo: grupos combinam por AND.
- Limpar filtros: seleções somem e contagem total retorna.
- Desativar Avaliação com faixa aplicada: filtro invisível deve ser removido.
- Importar uma lista: opções de habilidade devem mudar para a lista importada.
- Alternar “Mostrar status com IVs”: Meus Pokémon muda imediatamente e persiste;
  Encontro sempre mostra IV/status; Leilão continua somente IV.

## 4. Trava e movimentação

- Confirmar botão à esquerda de expandir e persistência após reinjeção.
- Destravado: arrastar por espaço vazio do header e pela barra inferior.
- Tentar arrastar por botões/controles/iframe: painel não deve mover.
- Travado: drag não move; resize, minimizar e expandir continuam funcionando.
- Arrastar às quatro bordas e reduzir o viewport: cabeçalho permanece acessível.
- Salvar `top=0/right=0`, reinjetar e confirmar que permanece exatamente na borda.

## 5. Tema claro

- Alternar em Configurações: shell e cinco iframes mudam sem reload.
- Reabrir/reinjetar: escolha persiste; instalação antiga começa em dark.
- Conferir texto, texto secundário, inputs, foco, scrollbars, erros, sucesso,
  tipos, IVs, avaliação, shiny e leilão em ambos os temas.
- Inspecionar o `<html>` da página do jogo: não pode receber `data-theme` nem ter
  cores/estilos alterados pela preferência.
- Repetir no Chrome e Firefox.

## Regressão geral

- Atalhos 1–5, T, F e Q; troca automática de batalha e retorno pós-batalha.
- Minimizar/reabrir, maximizar, side-by-side e tabela de tipos.
- Importar/exportar lista, Smogon, tooltips, zoom e avisos de atualização.
- Console do service worker, content script e cinco iframes sem novos erros.

## Saída esperada

Registrar navegador/versão, caso, resultado, screenshot e erro de console. Uma
falha em permissão/token, perda de acesso ao painel ou alerta shiny é bloqueante;
contraste/layout é importante; diferenças cosméticas sem perda de uso são menores.
