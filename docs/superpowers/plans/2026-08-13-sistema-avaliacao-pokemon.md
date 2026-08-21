# Sistema de Avaliação Funcional de Pokémon — Plano de Implementação

> **Revisão conceitual:** a primeira implementação deste plano revelou que
> limites absolutos de velocidade classificam incorretamente espécies como
> Zubat. A correção, incluindo relevância relativa e potencial evolutivo, está
> detalhada no plano incremental
> `docs/superpowers/plans/2026-08-14-revisao-funcao-evolutiva-pokemon.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir “Atq Principal” por uma Função explicável e recalcular a Avaliação conforme essa função, compartilhando perfis diários entre Meus Pokémon, Encontro Atual e Leilão.

**Architecture:** O service worker enriquece cada espécie da Pokédex uma vez por atualização ou mudança de versão das regras. Um avaliador puro combina esse perfil fixo com IVs, EVs, Nature, habilidade e moveset do exemplar; as telas apenas fazem lookup e reutilizam o resultado, com memoização adicional em Meus Pokémon.

**Tech Stack:** JavaScript puro (browser/Manifest V3), HTML/CSS, `chrome.storage.local`, harness Node.js sem dependências, validação manual em Chrome e Firefox.

## Global Constraints

- Não adicionar npm, bundler, biblioteca externa ou build step ao desenvolvimento.
- Não alterar o algoritmo de “Melhor Jogada” nem o tratamento intencional de `state.over` em `battle.js`.
- Não renomear identificadores históricos `pokemon-helper-*`, `pkmn-helper-*` nem o prefixo `[Pokemon Helper]`.
- Não alterar `browser_specific_settings.gecko.id` e não incrementar a versão dos manifests.
- Manter Chrome e Firefox em sincronia quando arquivos carregados mudarem.
- O recurso e os campos Avaliação/Função começam ativados; diagnósticos adicionais começam desativados.
- Falha de perfil ou atualização nunca pode impedir a renderização.
- Mensagens de commit e documentação permanecem em português; identificadores de código permanecem em inglês.

---

## Estrutura de arquivos planejada

| Arquivo | Responsabilidade |
|---|---|
| `data/pokemon-role-rules.js` | Taxonomia, pesos, limiares, tags e versões |
| `data/pokemon-species-profiler.js` | Gerar perfil fixo por espécie |
| `components/pokemon-evaluation.js` | Avaliar exemplar e formatar resultado compartilhado |
| `scripts/test-pokemon-evaluation.js` | Harness de regressão sem dependências |
| `background.js` | Enriquecer/reprocessar o cache diário |
| `data/extension-storage.js` | Defaults e merge das preferências |
| `components/settings-panel.js` | Controles globais do recurso |
| `components/pokemon-card.js` | Linhas compartilhadas de Função/Avaliação/diagnósticos |
| `components/pokemon-filters.js` | Ordenação e filtro por avaliação |
| `myPokemons.js` | Índice, fingerprint, memoização e view model |
| `battle.js` | Avaliação do encontro com confiança adequada |
| `auction.js` | Avaliação por lookup do snapshot sanitizado |
| `*.html`, manifests e docs | Ordem de scripts, empacotamento e documentação |

### Task 1: Definir regras versionadas e harness de regressão das espécies

**Files:**
- Create: `data/pokemon-role-rules.js`
- Create: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Produces: `PokemonRoleRules` congelado com `SCHEMA_VERSION`, `ROLE_RULES_VERSION`, `STATS`, `ROLES`, `RATING_BANDS`, `NATURE_ADJUSTMENTS`, `ABILITY_TAGS`, `SPECIAL_CASES` e `role(id)`.
- Test harness loads browser-style scripts with `vm.runInThisContext` and exits nonzero on failure.

- [ ] **Step 1: Criar o primeiro teste falho das regras**

No harness, carregar `data/pokemon-role-rules.js` e afirmar contratos concretos:

```js
assert.equal(PokemonRoleRules.SCHEMA_VERSION, 1);
assert.equal(PokemonRoleRules.ROLE_RULES_VERSION, 1);
assert.deepEqual(PokemonRoleRules.role('special_fast_attacker').weights,
  { hp: 10, atk: 0, def: 5, spa: 40, spd: 5, spe: 40 });
assert.deepEqual(PokemonRoleRules.role('special_fast_attacker').primaryStats, ['spa', 'spe']);
assert.equal(PokemonRoleRules.ratingFor(90).label, 'Excelente');
assert.equal(PokemonRoleRules.ratingFor(59).label, 'Regular');
```

- [ ] **Step 2: Executar e confirmar a falha**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: FAIL porque `data/pokemon-role-rules.js` ainda não existe.

- [ ] **Step 3: Implementar a tabela mínima completa**

Definir todas as funções aprovadas na spec, pesos somando 100, atributos
primários/secundários, rótulos e templates de tooltip. Incluir tags somente
para habilidades necessárias ao conjunto de regressão; habilidades sem tag
devem retornar `[]`. Exceções iniciais: `ditto` e `shedinja` como
`special_case`.

- [ ] **Step 4: Acrescentar invariantes ao harness**

```js
for (const role of Object.values(PokemonRoleRules.ROLES)) {
  assert.equal(Object.values(role.weights).reduce((a, b) => a + b, 0), 100, role.id);
  assert.ok(role.label && role.primaryStats.length, role.id);
}
assert.deepEqual(PokemonRoleRules.abilityTags('magic-guard'), ['indirect_damage_immunity']);
assert.deepEqual(PokemonRoleRules.abilityTags('unknown-ability'), []);
```

- [ ] **Step 5: Executar e versionar**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: PASS, com resumo de regras e invariantes.

```bash
git add data/pokemon-role-rules.js scripts/test-pokemon-evaluation.js
git commit -m "feat: define regras da avaliação funcional"
```

### Task 2: Gerar o perfil fixo das espécies

**Files:**
- Create: `data/pokemon-species-profiler.js`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Consumes: `PokemonRoleRules`.
- Produces: `PokemonSpeciesProfiler.profileSpecies(species, generatedAt)` e `profileAll(items, generatedAt)`.
- `profileSpecies` returns `{ schemaVersion, rulesVersion, generatedAt, candidates, specialCase }` exactly as specified.

- [ ] **Step 1: Adicionar fixtures e testes falhos de arquétipos**

Usar objetos mínimos com `slug`, `base`, `abilities`, `types` e `levelMoves`.
Cobrir explicitamente:

```js
expectPrimary('lucario', 'mixed_fast_attacker');
expectPrimary('swampert', 'physical_bulky_attacker');
expectPrimary('gengar', 'special_fast_attacker');
expectPrimary('golurk', 'physical_slow_attacker');
expectPrimary('solosis', 'special_slow_attacker');
expectPrimary('reuniclus', 'special_bulky_attacker');
expectCandidate('bulbasaur', 'defensive_support');
expectCandidate('venusaur', 'special_bulky_attacker');
expectPrimary('mew', 'versatile');
expectPrimary('ditto', 'special_case');
expectPrimary('shedinja', 'special_case');
```

Fixtures devem copiar base stats das espécies presentes em
`payloads/pokemons.json`, sem fazer o teste depender dessa pasta não rastreada.

- [ ] **Step 2: Confirmar a falha**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: FAIL porque `PokemonSpeciesProfiler` não está definido.

- [ ] **Step 3: Implementar indicadores e ranking**

Implementar normalização/clamp dos seis base stats; calcular bulk com raiz do
produto `sqrt(hp * defense)`; gerar scores de ofensiva, bulk, velocidade,
suporte e equilíbrio; aplicar ajustes pequenos de habilidades/learnset; ordenar
de forma estável por score e ID. Nenhum ajuste isolado de habilidade/learnset
pode superar diferença estrutural de 15 pontos no indicador dominante.

- [ ] **Step 4: Testar contrato, determinismo e isolamento de erro**

```js
const first = PokemonSpeciesProfiler.profileSpecies(reuniclus, NOW);
const second = PokemonSpeciesProfiler.profileSpecies(reuniclus, NOW);
assert.deepEqual(first, second);
assert.equal(first.generatedAt, NOW);
assert.equal(first.candidates[0].confidence, 'high');
assert.equal(PokemonSpeciesProfiler.profileSpecies({ slug: 'broken' }, NOW).candidates[0].confidence, 'low');
```

Também afirmar que todos os scores ficam entre 0 e 1 e que `profileAll()` não
descarta espécies válidas quando uma entrada é inválida.

- [ ] **Step 5: Executar e versionar**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: PASS para todas as espécies de referência e invariantes.

```bash
git add data/pokemon-species-profiler.js scripts/test-pokemon-evaluation.js
git commit -m "feat: gera perfis funcionais por espécie"
```

### Task 3: Enriquecer e versionar o cache diário da Pokédex

**Files:**
- Modify: `background.js`
- Modify: `manifest.json`
- Modify: `manifest.firefox.json`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Consumes: `PokemonSpeciesProfiler.profileAll(items, generatedAt)`.
- Produces: `refreshPokedex(force)` storing source fields plus `evaluationProfile`.
- Produces helper `needsPokedexReprofile(cached)` testable without network.

- [ ] **Step 1: Escrever testes falhos para invalidação de versão**

```js
assert.equal(needsPokedexReprofile({ items: [] }), false);
assert.equal(needsPokedexReprofile({ items: [{ evaluationProfile: { rulesVersion: 0 } }] }), true);
assert.equal(needsPokedexReprofile({ items: [{ evaluationProfile: { rulesVersion: 1, schemaVersion: 1 } }] }), false);
```

Extrair o helper puro para o profiler se carregar `background.js` no Node exigir
mock excessivo; o comportamento público permanece em `refreshPokedex()`.

- [ ] **Step 2: Confirmar a falha**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: FAIL porque a invalidação ainda não existe.

- [ ] **Step 3: Integrar scripts ao service worker**

No Chrome, adicionar `importScripts('data/pokemon-role-rules.js',
'data/pokemon-species-profiler.js')` antes de usar o profiler. No Firefox,
incluir os dois arquivos antes de `background.js` em `background.scripts`.
Não mudar permissões nem versão.

- [ ] **Step 4: Enriquecer refresh e permitir reprocessamento offline**

Preservar `types`, `abilities`, `base` e metadados de learnset necessários.
Após resposta válida, chamar `profileAll`. Quando o cache ainda estiver dentro
de 24h mas sua versão estiver antiga, reprocessar os itens locais e salvar sem
fetch. Se faltarem campos-fonte, manter cache/fallback e solicitar refresh pelo
fluxo normal, sem apagar dados anteriores.

- [ ] **Step 5: Verificar testes e manifests**

Run: `node scripts/test-pokemon-evaluation.js`

Run:

```powershell
$chrome = Get-Content -Raw manifest.json | ConvertFrom-Json
$firefox = Get-Content -Raw manifest.firefox.json | ConvertFrom-Json
if ($firefox.background.scripts -notcontains 'data/pokemon-species-profiler.js') { throw 'Firefox sem profiler' }
```

Expected: PASS; nenhum campo `version` alterado.

- [ ] **Step 6: Versionar**

```bash
git add background.js manifest.json manifest.firefox.json scripts/test-pokemon-evaluation.js
git commit -m "feat: enriquece cache diário da Pokédex"
```

### Task 4: Implementar avaliação dinâmica pura e compatibilidade

**Files:**
- Create: `components/pokemon-evaluation.js`
- Modify: `components/iv-evaluation.js`
- Modify: `components/nature-effect.js`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Consumes: `PokemonRoleRules`, `getNatureEffect`, Pokémon e `evaluationProfile`.
- Produces: `PokemonEvaluation.evaluate(pokemon, profile)`, `fingerprint(pokemon)`, `ratingHTML(result)`, `roleHTML(result)`.
- Compatibility: `PokemonIvEvaluation` delegates to `PokemonEvaluation` during migration.

- [ ] **Step 1: Escrever testes falhos de pontuação e fingerprint**

Cobrir:

```js
assert.equal(evaluate(gengarPerfectSpecial, gengarProfile).rating.score, 100);
assert.equal(evaluate({ ...gengarPerfectSpecial, ivs: { ...gengarPerfectSpecial.ivs, atk: 0 } }, gengarProfile).rating.score, 100);
assert.equal(evaluate(gengarBadSpeed, gengarProfile).rating.label, 'Bom');
assert.equal(evaluate(timidGengar, gengarProfile).nature.adjustment, 5);
assert.equal(evaluate(adamantGengar, gengarProfile).nature.adjustment, -8);
assert.equal(fingerprint(mon), fingerprint({ ...mon, hp: 1, status: 'burn' }));
assert.notEqual(fingerprint(mon), fingerprint({ ...mon, nature: 'Timid' }));
```

- [ ] **Step 2: Confirmar a falha**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: FAIL porque `PokemonEvaluation` ainda não existe.

- [ ] **Step 3: Implementar seleção e pontuação**

Implementar o contrato completo da spec. Avaliar todas as candidatas; moveset,
EVs e habilidade efetiva escolhem/desempatam função, mas IVs apenas pontuam.
Aplicar ajustes de Nature e regras de IV essencial. Para perfil ausente,
produzir fallback `versatile`, confiança `low` e resultado renderizável.

- [ ] **Step 4: Implementar adequação e apresentação segura**

`moveset.fit` deve ser `compatible|partial|incompatible|unknown`.
`role.tooltip` deve listar primários e secundários com siglas estáveis.
Helpers HTML recebem resultado já calculado e escapam texto; não recalculam.

- [ ] **Step 5: Testar versatilidade e casos especiais**

```js
assert.equal(evaluate(physicalLucario, lucarioProfile).role.id, 'physical_fast_attacker');
assert.equal(evaluate(specialLucario, lucarioProfile).role.id, 'special_fast_attacker');
assert.equal(evaluate(mewWithoutMoves, mewProfile).role.confidence, 'low');
assert.equal(evaluate(auctionSnapshot, houndoomProfile).moveset.fit, 'unknown');
assert.doesNotThrow(() => evaluate({ name: 'DESCONHECIDO', ivs: {} }, null));
```

- [ ] **Step 6: Executar e versionar**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: PASS para regras, perfis, avaliação, fallback e fingerprint.

```bash
git add components/pokemon-evaluation.js components/iv-evaluation.js components/nature-effect.js scripts/test-pokemon-evaluation.js
git commit -m "feat: avalia exemplares conforme a função"
```

### Task 5: Adicionar preferências e controles globais

**Files:**
- Modify: `data/extension-storage.js`
- Modify: `components/settings-panel.js`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Produces: `prefs.evaluation` with `enabled`, `showCoreFields`, `showConfidence`, `showNatureFit`, `showMovesetFit`, `showAlternativeRole`.
- Consumers receive changes through existing `chrome.storage.onChanged` flow.

- [ ] **Step 1: Adicionar teste falho do merge profundo**

Extrair/expôr apenas se necessário o helper puro de merge e afirmar que uma
preferência antiga recebe todos os defaults, enquanto `{ evaluation:
{ enabled: false } }` preserva os demais defaults.

- [ ] **Step 2: Confirmar a falha**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: FAIL porque `evaluation` não existe nos defaults.

- [ ] **Step 3: Adicionar defaults e sanitização**

Usar exatamente:

```js
evaluation: {
  enabled: true,
  showCoreFields: true,
  showConfidence: false,
  showNatureFit: false,
  showMovesetFit: false,
  showAlternativeRole: false
}
```

Garantir importação/exportação e reset das configurações sem perder defaults.

- [ ] **Step 4: Criar seção “Avaliação de Pokémon”**

Adicionar toggles globais para os seis campos. Desabilitar visualmente os
cinco toggles de exibição quando `enabled=false`, sem apagar suas escolhas.
Persistir com `setUiPreferences({ evaluation: { [field]: value } })`.

- [ ] **Step 5: Executar harness e verificar manualmente o painel**

Run: `node scripts/test-pokemon-evaluation.js`

Manual: abrir Configurações, alternar, exportar/importar e restaurar defaults.
Expected: principais ligados; diagnósticos desligados.

- [ ] **Step 6: Versionar**

```bash
git add data/extension-storage.js components/settings-panel.js scripts/test-pokemon-evaluation.js
git commit -m "feat: adiciona preferências da avaliação Pokémon"
```

### Task 6: Compartilhar renderização nos cards e integrar Meus Pokémon

**Files:**
- Modify: `components/pokemon-card.js`
- Modify: `myPokemons.html`
- Modify: `myPokemons.js`
- Modify: `components/pokemon-filters.js`
- Modify: `components/pokemon-filters.css`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Consumes: `PokemonEvaluation`, Pokédex cache and `prefs.evaluation`.
- Produces: each view model has `evaluation`; `PokemonCard.evaluationRows(viewModel, prefs)` renders shared fields.
- Filter values add `ratingLabels: string[]`; sort key adds `evaluationScore`.

- [ ] **Step 1: Escrever testes falhos da memoização**

Extrair um helper puro `PokemonEvaluationCache` no componente de avaliação com
`evaluate(pokemon, profile)` e `retain(ids)`. Usar avaliador espião e afirmar:

```js
assert.strictEqual(cache.evaluate(mon, profile), cache.evaluate({ ...mon, hp: 1 }, profile));
assert.notStrictEqual(cache.evaluate(mon, profile), cache.evaluate({ ...mon, ivs: { ...mon.ivs, atk: 31 } }, profile));
cache.retain([]);
assert.equal(cache.size, 0);
```

- [ ] **Step 2: Confirmar a falha**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: FAIL porque o cache ainda não existe.

- [ ] **Step 3: Carregar dependências e índice uma única vez**

Em `myPokemons.html`, carregar regras e avaliador antes de `myPokemons.js`.
Em `myPokemons.js`, carregar Pokédex no início, construir
`Map<normalizedSlug, evaluationProfile>` e atualizar o Map somente em
`chrome.storage.onChanged` da Pokédex.

- [ ] **Step 4: Avaliar no view model, não no render**

Durante normalização, anexar `evaluation` usando cache por ID+fingerprint.
Após normalizar novo conjunto, chamar `retain()` com os IDs vivos. Quando
`enabled=false`, limpar cache e omitir avaliação. Remover chamadas diretas a
`PokemonIvEvaluation.evaluate()` de renderização.

- [ ] **Step 5: Renderizar Função e Avaliação**

Mover as linhas compartilháveis para `PokemonCard.evaluationRows`. Mostrar
**Função** no lugar de **Atq Principal** e usar `role.tooltip` no hover. Campos
adicionais obedecem individualmente às preferências e começam ocultos.

- [ ] **Step 6: Adicionar filtro e ordenação**

No painel, adicionar `Avaliação` ao select de ordenação e checkboxes para as
cinco faixas. Em `matchesFilters`, exigir que `viewModel.evaluation.rating.label`
esteja selecionado. Ordenar pelo score numérico; desempatar por IV%, nome e ID.
Ocultar/desabilitar esses controles quando `evaluation.enabled=false`.

- [ ] **Step 7: Testar lógica pura e desempenho funcional**

Run: `node scripts/test-pokemon-evaluation.js`

Manual: enviar duas vezes o mesmo payload e depois payload alterando apenas HP;
confirmar com contador temporário que não reavaliou. Remover o contador antes
do commit. Alterar Nature e confirmar exatamente uma reavaliação.

- [ ] **Step 8: Versionar**

```bash
git add components/pokemon-card.js components/pokemon-evaluation.js components/pokemon-filters.js components/pokemon-filters.css myPokemons.html myPokemons.js scripts/test-pokemon-evaluation.js
git commit -m "feat: integra avaliação funcional em Meus Pokémon"
```

### Task 7: Integrar Encontro Atual sem alterar o estado de batalha

**Files:**
- Modify: `battle.html`
- Modify: `battle.js`

**Interfaces:**
- Consumes: cached profile, `PokemonEvaluation.evaluate`, probable moves and evaluation preferences.
- Produces: existing meta grid with Função/Avaliação and optional diagnostics.

- [ ] **Step 1: Carregar regras e novo avaliador em ordem**

Adicionar scripts antes de `battle.js`; manter todas as dependências atuais.
Substituir uso direto de `components/iv-evaluation.js` pelo novo componente,
conservando o alias apenas para compatibilidade externa.

- [ ] **Step 2: Avaliar o foe com dados disponíveis**

Reutilizar `pokedexBySlug`. Combinar o moveset real quando presente; caso
contrário, passar os `probableMoves(foe)` como evidência inferida e reduzir a
confiança no resultado. Não modificar `state`, handlers, mesclagem do foe,
`bestPlay()` nem qualquer condição relativa ao fim da batalha.

- [ ] **Step 3: Substituir campos e obedecer preferências**

Trocar `ATQ PRINCIPAL` por `FUNÇÃO`, usar tooltip de atributos e nova
Avaliação. Esconder todos os campos quando `enabled=false`; mostrar os dois
principais quando `showCoreFields=true`; diagnósticos seguem seus toggles.

- [ ] **Step 4: Verificar manualmente cenários de batalha**

Manual: encontro selvagem, treinador, turno sem foe completo, captura, fuga e
fim normal. Expected: função permanece estável, nenhum resultado fica preso,
melhor jogada não muda e retorno de aba mantém comportamento anterior.

- [ ] **Step 5: Versionar**

```bash
git add battle.html battle.js
git commit -m "feat: integra avaliação funcional no encontro"
```

### Task 8: Integrar Leilão sem ampliar o bridge

**Files:**
- Modify: `auction.html`
- Modify: `auction.js`

**Interfaces:**
- Consumes: sanitized `snapshot.species`, cached profile, evaluation preferences.
- Produces: listing/sellable view models with `evaluation`; `moveset.fit='unknown'`.

- [ ] **Step 1: Carregar storage, regras e avaliador**

Adicionar scripts antes de `pokemon-card.js`/`auction.js`. Carregar a Pokédex
uma vez, indexar por slug e reagir somente à mudança da chave de Pokédex.

- [ ] **Step 2: Avaliar snapshots no view model**

Anexar avaliação ao `pokemonViewModel()`. Reutilizar `PokemonEvaluationCache`
por listing/sellable ID e fingerprint. Não editar `interceptor.js`: espécie,
IVs, Nature e habilidade já atravessam a allowlist; stats, moveset, token,
headers e perfil não devem atravessar.

- [ ] **Step 3: Renderizar linhas compartilhadas**

Adicionar `PokemonCard.evaluationRows` em anúncios, vendáveis, revisão e fila,
respeitando preferências. Ausência de moveset mostra adequação somente se a
opção estiver ativa, com texto “Não determinada”.

- [ ] **Step 4: Verificar bridge e paginação manualmente**

Manual: Explorar, Meus anúncios, Favoritos, vendáveis, revisão e scroll
incremental. Inspecionar eventos sanitizados e confirmar que nenhum campo novo
atravessou `interceptor.js`. Expected: cards novos recebem avaliação via lookup
local e paginação permanece responsiva.

- [ ] **Step 5: Versionar**

```bash
git add auction.html auction.js
git commit -m "feat: integra avaliação funcional no leilão"
```

### Task 9: Empacotamento, documentação e verificação final

**Files:**
- Modify: `manifest.json`
- Modify: `manifest.firefox.json`
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `scripts/build-chrome.sh` only if a new root-level loaded file was added
- Modify: `scripts/build-firefox.sh` only if a new root-level loaded file was added

**Interfaces:**
- Confirms all files required at runtime are packaged for both browsers.

- [ ] **Step 1: Auditar ordem e disponibilidade dos scripts**

Confirmar em cada HTML: regras → Nature → avaliador → card → tela. Confirmar no
service worker: storage → regras → profiler → background. Como `components/`
e `data/` são copiados integralmente, não adicionar seus arquivos ao array
`FILES`; editar os scripts de build somente se surgir arquivo novo na raiz.

- [ ] **Step 2: Atualizar documentação do usuário**

No README, substituir descrição de **Atq principal** por **Função**, explicar
que Avaliação considera a função, documentar hover, configurações, ordenação e
filtro. Não prometer os diagnósticos opcionais como visíveis por padrão.

- [ ] **Step 3: Atualizar documentação técnica**

Em DEVELOPMENT.md, documentar os três novos módulos, cache enriquecido de 24h,
invalidação por versão, fingerprint/memoização e consumidores. Registrar que o
Leilão faz lookup local e não amplia o bridge.

- [ ] **Step 4: Executar verificações automatizadas**

Run: `node scripts/test-pokemon-evaluation.js`

Run:

```powershell
$files = 'manifest.json','manifest.firefox.json'
foreach ($file in $files) { Get-Content -Raw $file | ConvertFrom-Json | Out-Null }
rg -n -S "ATQ PRINCIPAL|Atq Principal|ataque principal" --glob '!docs/superpowers/**' .
```

Expected: harness PASS; manifests válidos; busca sem ocorrências de UI/docs
ativas (comentários históricos só permanecem se ainda forem tecnicamente úteis).

- [ ] **Step 5: Gerar pacotes de validação**

Em ambiente com Bash/zip:

```bash
bash scripts/build-chrome.sh
bash scripts/build-firefox.sh
```

Expected: dois zips gerados; inspecionar ambos e confirmar regras, profiler e
avaliador. Não versionar `dist/`.

- [ ] **Step 6: Executar matriz manual final**

- Chrome e Firefox, extensão descompactada/temporária.
- Meus Pokémon: payload repetido, filtro das cinco faixas, crescente/decrescente,
  importação antiga e alteração de Nature.
- Encontro: selvagem, treinador, turno parcial, captura, fuga e fim normal.
- Leilão: browse, paginação, favoritos, meus anúncios e fluxo de venda.
- Configurações: seis toggles, reload, exportar/importar e reset.
- Falhas: cache ausente, perfil inválido e refresh remoto indisponível.

Expected: todos os 12 critérios de aceite da spec satisfeitos e nenhum erro não
tratado no console.

- [ ] **Step 7: Revisar diff e versionar documentação final**

Run: `git diff --check`

Run: `git status --short`

Confirmar que `payloads/` e outras alterações preexistentes não foram incluídas.

```bash
git add README.md docs/DEVELOPMENT.md manifest.json manifest.firefox.json scripts/build-chrome.sh scripts/build-firefox.sh
git commit -m "docs: documenta avaliação funcional de Pokémon"
```

Se manifests/build scripts não tiverem diff, omiti-los do `git add`.

## Checklist de cobertura da spec

- Perfil diário e reprocessamento por versão: Tasks 2–3.
- Funções, pesos, Nature, IV essencial e fallback: Tasks 1, 2 e 4.
- Desempenho/fingerprint de Meus Pokémon: Task 6.
- Filtro e ordenação por avaliação: Task 6.
- Preferências default-on/default-off: Task 5.
- Meus Pokémon, Encontro e Leilão: Tasks 6–8.
- Segurança do bridge: Task 8.
- Compatibilidade Chrome/Firefox e documentação: Task 9.
- Casos de regressão e validação manual: Tasks 1–4 e 9.
