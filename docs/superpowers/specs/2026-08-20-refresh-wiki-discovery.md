# Discovery — atualização condicional dos arquivos da wiki

**Data:** 2026-08-20  
**Status:** requer definição segura de mudança

## Entendimento atual

`background.js` baixa Pokédex e habilidades com `cache:'no-store'`. A Pokédex é
normalizada por `PokemonSpeciesProfiler.preparePokedexItems`, gerando dados de
avaliação. Evitar reprocessamento quando a fonte não mudou é desejável, mas
“tamanho” pode significar bytes, `Content-Length`, quantidade de itens ou JSON
serializado. Tamanhos iguais não provam conteúdo igual; usar apenas igualdade de
tamanho pode deixar dados desatualizados.

## Recomendação provisória

Usar validação HTTP nesta ordem: `ETag`/`If-None-Match`; depois
`Last-Modified`/`If-Modified-Since`; se o servidor não oferecer ambos, calcular
hash do corpo. `Content-Length` ou quantidade serve como diagnóstico/atalho,
nunca como única prova de igualdade. Só executar `preparePokedexItems` e gravar
storage quando a fonte mudar. Mesmo sem mudança, atualizar `checkedAt` sem
substituir `items` nem `generatedAt`.

## Perguntas obrigatórias

1. A regra pedida realmente exige “mesmo tamanho = não atualizar”, aceitando o
   risco, ou o objetivo é apenas evitar trabalho quando o conteúdo não mudou?
2. A regra vale para Pokédex, habilidades e golpes de treinadores ou só Pokédex?
3. Uma mudança de versão em `PokemonSpeciesProfiler` deve forçar reprocessamento
   mesmo com fonte remota igual? Recomendação: sim, via `needsReprofile`.
4. Em erro de headers/hash, manter cache e registrar erro ou tentar atualização
   completa? Recomendação: manter cache e registrar erro.

## Dados necessários

- Headers reais de GET/HEAD para `wiki-pokedex.json` e `wiki-abilities.json`.
- Estabilidade de ETag/Last-Modified em pelo menos duas verificações.
- Tamanho em bytes, quantidade de itens e custo medido de parse/perfil/gravação.
- Exemplos de mudança com mesma contagem para validar que contagem é insuficiente.

## Cenários de teste futuros

`304`; ETag alterada; corpo alterado com mesmo tamanho; profiler versionado com
fonte igual; rede offline com cache; cache antigo sem metadados; JSON inválido.

## Critério de prontidão

Responder às quatro perguntas e registrar os headers/medições. A spec final deve
definir o verificador como função pura testável antes de alterar os alarmes.

