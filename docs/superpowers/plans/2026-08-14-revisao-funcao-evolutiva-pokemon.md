# Revisão da Função e Potencial Evolutivo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a função para refletir a identidade dos base stats da espécie atual e adicionar tendência/potencial evolutivo sem permitir que IVs escolham a função.

**Architecture:** O refresh da Pokédex calcula estatísticas globais, perfis relativos e relações evolutivas uma vez por versão das regras. O avaliador local mantém a função atual imutável em relação aos IVs e usa o exemplar somente para nota, adequação e compatibilidade com caminhos evolutivos.

**Tech Stack:** JavaScript puro, Manifest V3, `chrome.storage.local`, harness Node.js sem dependências, validação manual em Chrome e Firefox.

## Global Constraints

- Base stats são o sinal dominante da função atual; IVs nunca escolhem ou trocam essa função.
- A função sempre descreve a espécie atual; evoluções são diagnósticos separados.
- Não usar corte absoluto isolado para decidir `fast`, `agile` ou `slow`.
- Potencial evolutivo começa oculto e não altera a nota atual.
- Cálculos globais e relações evolutivas são preparados no refresh/versionamento da Pokédex, não durante renderizações.
- Não adicionar dependências, alterar versões dos manifests, `state.over`, bridge do Leilão ou identificadores históricos.
- Chrome e Firefox devem permanecer em sincronia.

---

## Estrutura de arquivos

- Modify: `data/pokemon-role-rules.js` — taxonomia, pesos e versão das regras.
- Modify: `data/pokemon-species-profiler.js` — estatísticas globais, relevância interna e perfis evolutivos.
- Create: `data/pokemon-evolution-lines.js` — relações evolutivas estáticas e versionadas.
- Modify: `components/pokemon-evaluation.js` — nota do exemplar e compatibilidade evolutiva, sem reclassificação por IV.
- Modify: `background.js` — enriquecimento diário em duas passagens.
- Modify: `data/extension-storage.js` — preferência opcional de potencial evolutivo.
- Modify: `components/settings-panel.js` — toggle inicialmente desligado.
- Modify: `components/pokemon-card.js`, `myPokemons.js`, `battle.js`, `auction.js` — apresentação opcional compartilhada.
- Modify: `scripts/test-pokemon-evaluation.js` — regressões de Zubat, Eevee, fronteiras e invariantes.
- Modify: `README.md`, `docs/DEVELOPMENT.md` — semântica de função e evolução.

### Task 1: Fixar o contrato conceitual em testes

**Files:**
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Consumes: `PokemonSpeciesProfiler.profileAll(items, generatedAt)` e `PokemonEvaluation.evaluate(pokemon, profile)`.
- Produces: regressões que impedem IVs e thresholds absolutos de escolher a função.

- [ ] **Step 1: Adicionar fixtures de Zubat, Crobat, Eevee e evoluções**

```js
const zubat = species('zubat', [40, 45, 35, 30, 40, 55], { evolvesTo:['golbat'] });
const golbat = species('golbat', [75, 80, 70, 65, 75, 90], { evolvesTo:['crobat'] });
const crobat = species('crobat', [85, 90, 80, 70, 80, 130]);
const eevee = species('eevee', [55, 55, 50, 45, 65, 55], {
  evolvesTo:['vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon','sylveon']
});
```

- [ ] **Step 2: Escrever invariantes falhos**

```js
const profiled = indexProfiles(PokemonSpeciesProfiler.profileAll(evolutionFixtures, NOW));
assert.equal(profiled.zubat.candidates[0].id, 'physical_agile_attacker');
assert.notEqual(profiled.zubat.candidates[0].id, 'physical_slow_attacker');
assert.equal(profiled.eevee.evolutionPotential.length, 8);

const weak = PokemonEvaluation.evaluate(zubatWithIvs(0, 0), profiled.zubat);
const strong = PokemonEvaluation.evaluate(zubatWithIvs(31, 31), profiled.zubat);
assert.equal(weak.role.id, strong.role.id);
assert.notEqual(weak.rating.score, strong.rating.score);
assert.equal(strong.evolutionPotential.some(item => item.species === 'crobat'), true);
```

- [ ] **Step 3: Executar para confirmar a falha**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: FAIL porque funções ágeis e contratos evolutivos ainda não existem.

- [ ] **Step 4: Commit dos testes falhos**

```bash
git add scripts/test-pokemon-evaluation.js
git commit -m "test: cobre função relativa e potencial evolutivo"
```

### Task 2: Calcular relevância interna e distribuição global

**Files:**
- Modify: `data/pokemon-role-rules.js`
- Modify: `data/pokemon-species-profiler.js`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Produces: `buildPopulationStats(items)` e `profileSpecies(species, context, generatedAt)`.
- `context` contém `{ populationStats, speciesBySlug }`.
- Cada indicador contém `{ raw, relativeToMean, relativeToMax, percentile }`.

- [ ] **Step 1: Adicionar IDs e pesos das funções ágeis**

```js
physical_attacker: defineRole('physical_attacker', 'Atacante físico',
  { hp:15, atk:50, def:10, spa:0, spd:10, spe:15 }, ['atk'], ['hp','spe']),
special_attacker: defineRole('special_attacker', 'Atacante especial',
  { hp:15, atk:0, def:10, spa:50, spd:10, spe:15 }, ['spa'], ['hp','spe']),
mixed_attacker: defineRole('mixed_attacker', 'Atacante misto',
  { hp:10, atk:30, def:10, spa:30, spd:10, spe:10 }, ['atk','spa'], ['hp','spe']),
physical_agile_attacker: defineRole('physical_agile_attacker', 'Atacante físico ágil',
  { hp:10, atk:40, def:5, spa:0, spd:5, spe:40 }, ['atk','spe'], ['hp']),
special_agile_attacker: defineRole('special_agile_attacker', 'Atacante especial ágil',
  { hp:10, atk:0, def:5, spa:40, spd:5, spe:40 }, ['spa','spe'], ['hp']),
mixed_agile_attacker: defineRole('mixed_agile_attacker', 'Atacante misto ágil',
  { hp:5, atk:30, def:5, spa:30, spd:5, spe:25 }, ['atk','spa','spe'], ['hp'])
```

Incrementar `ROLE_RULES_VERSION`. Não mudar `SCHEMA_VERSION` enquanto o formato continuar retrocompatível.

- [ ] **Step 2: Implementar estatísticas da população**

`buildPopulationStats` ordena os valores de cada stat uma vez e fornece percentil determinístico com empates usando `count(value <= raw) / count`. Entradas sem os seis base stats são excluídas da população, mas continuam recebendo fallback individual.

- [ ] **Step 3: Substituir thresholds rígidos por sinais combinados**

Para Spe, calcular:

```text
relativeToMean = spe / mean(hp, atk, def, spa, spd, spe)
relativeToMax  = spe / max(hp, atk, def, spa, spd, spe)
percentile     = posição de spe na população
```

Classificar como:

- `fast`: percentil >= 0,75 e `relativeToMean >= 1,10`;
- `agile`: `relativeToMax >= 0,90` e `relativeToMean >= 1,15`;
- `slow`: percentil <= 0,35, `relativeToMean <= 0,85` e `relativeToMax <= 0,75`;
- sem qualificador de velocidade: demais casos, escolhendo resistente, suporte ou função ofensiva genérica conforme os outros indicadores.

Se `fast` e `agile` forem verdadeiros, `fast` prevalece. Os valores ficam centralizados e versionados em `PokemonRoleRules`, não espalhados no profiler.

- [ ] **Step 4: Testar fronteiras e determinismo**

Adicionar casos imediatamente abaixo/no/acima dos limites e afirmar que reordenar a Pokédex não muda percentis nem funções.

- [ ] **Step 5: Executar e versionar**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: Zubat ágil, Crobat rápido e regressões anteriores aprovadas.

```bash
git add data/pokemon-role-rules.js data/pokemon-species-profiler.js scripts/test-pokemon-evaluation.js
git commit -m "fix: classifica função pela relevância dos base stats"
```

### Task 3: Enriquecer relações e potenciais evolutivos

**Files:**
- Create: `data/pokemon-evolution-lines.js`
- Modify: `data/pokemon-species-profiler.js`
- Modify: `background.js`
- Modify: `manifest.firefox.json`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Produces no perfil: `evolutionTrend: EvolutionTarget|null` e `evolutionPotential: EvolutionTarget[]`.
- `EvolutionTarget` é `{ species, roleId, confidence, path }`.

- [ ] **Step 1: Criar tabela evolutiva versionada**

A request atual não contém relações evolutivas. Criar
`PokemonEvolutionLines` com `VERSION`, `targetsFor(slug)` e mapa congelado de
destinos imediatos. Cobrir todas as espécies presentes na Pokédex, começando
pelas linhas usadas nos testes. Ausência de slug retorna `[]`; nenhuma tela ou
avaliação realiza request adicional.

```js
const LINES = Object.freeze({
  zubat: Object.freeze(['golbat']),
  golbat: Object.freeze(['crobat']),
  eevee: Object.freeze(['vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon','sylveon'])
});
```

- [ ] **Step 2: Transformar o enriquecimento em duas passagens**

Primeira passagem: calcular `populationStats` e o perfil atual de todas as espécies. Segunda: resolver os destinos usando `speciesBySlug` e anexar funções já calculadas, sem perfilar novamente.

Carregar `data/pokemon-evolution-lines.js` antes do profiler via `importScripts`
no Chrome e antes de `background.js` em `manifest.firefox.json`. Não alterar a
versão dos manifests.

- [ ] **Step 3: Representar linha única e ramificações**

- Um único destino final alcançável: preencher `evolutionTrend` e manter `evolutionPotential=[]`.
- Mais de um destino final: `evolutionTrend=null` e uma entrada em `evolutionPotential` para cada destino.
- Sem evolução: ambos vazios/nulos.
- Ciclo, destino ausente ou profundidade acima do número de espécies: interromper aquele caminho e registrar confiança baixa, sem bloquear o refresh.

- [ ] **Step 4: Testar Zubat e Eevee**

Zubat aponta para Crobat sem mudar a própria função. Eevee retorna oito destinos distintos e não escolhe um vencedor no perfil fixo.

- [ ] **Step 5: Executar e versionar**

Run: `node scripts/test-pokemon-evaluation.js`

```bash
git add data/pokemon-evolution-lines.js data/pokemon-species-profiler.js background.js manifest.firefox.json scripts/test-pokemon-evaluation.js
git commit -m "feat: adiciona perfis de potencial evolutivo"
```

### Task 4: Avaliar exemplar sem reclassificar sua função

**Files:**
- Modify: `components/pokemon-evaluation.js`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- `evaluate()` preserva `profile.candidates[0].id` como função atual.
- Produces: `evolutionTrend` e `evolutionPotential[{ species, role, rating }]`.

- [ ] **Step 1: Remover seleção de função orientada por IV**

IVs entram somente em `scoreForRole(ivs, role)`. Moveset, Nature, EVs e habilidade produzem campos de adequação; somente podem desempatar candidatas cujo score estrutural esteja dentro da margem versionada `ROLE_TIE_MARGIN`.

- [ ] **Step 2: Pontuar compatibilidade evolutiva**

Para cada destino, reutilizar exatamente `scoreForRole` com os pesos da função de destino. Não alterar `rating.score`, `role.id` ou confiança da função atual.

- [ ] **Step 3: Ordenar potenciais sem eleger evolução**

Ordenar cópia para apresentação por score decrescente e slug estável. Manter todos os destinos; o primeiro é “mais compatível”, não “evolução recomendada”.

- [ ] **Step 4: Verificar regressões**

Run: `node scripts/test-pokemon-evaluation.js`

Expected: trocar todos os IVs do Zubat muda notas, nunca `role.id`; Eevee mantém `versatile` com oito compatibilidades.

- [ ] **Step 5: Versionar**

```bash
git add components/pokemon-evaluation.js scripts/test-pokemon-evaluation.js
git commit -m "fix: separa função da qualidade do exemplar"
```

### Task 5: Expor evolução como diagnóstico opcional

**Files:**
- Modify: `data/extension-storage.js`
- Modify: `components/settings-panel.js`
- Modify: `components/pokemon-card.js`
- Modify: `myPokemons.js`
- Modify: `battle.js`
- Modify: `auction.js`

**Interfaces:**
- Produces preferência `evaluation.showEvolutionPotential`, default `false`.
- Produces tooltip/linha compartilhada sem recalcular perfis.

- [ ] **Step 1: Adicionar default e toggle**

Adicionar `showEvolutionPotential:false` ao merge profundo existente e o controle “Potencial evolutivo” na seção de avaliação. Ele fica desabilitado quando `evaluation.enabled=false`.

- [ ] **Step 2: Renderizar somente quando solicitado**

Linha única mostra `Tendência: Crobat — Atacante físico rápido/pivô`. Ramificações mostram resumo ordenado e tooltip com todos os destinos e notas de compatibilidade. Não substituir a linha **Função**.

- [ ] **Step 3: Preservar desempenho**

Incluir a versão do perfil evolutivo na assinatura do cache; não incluir HP atual, status ou posição. Cards consomem o resultado pronto do view model.

- [ ] **Step 4: Verificar manualmente as três telas**

Com opção desligada, UI permanece como hoje. Ligada, Zubat e Eevee mostram evolução separada; paginação do Leilão e payloads repetidos de Meus Pokémon não provocam recálculo.

- [ ] **Step 5: Versionar**

```bash
git add data/extension-storage.js components/settings-panel.js components/pokemon-card.js myPokemons.js battle.js auction.js
git commit -m "feat: exibe potencial evolutivo opcional"
```

### Task 6: Documentar e verificar a revisão

**Files:**
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `scripts/test-pokemon-evaluation.js`

**Interfaces:**
- Confirma o comportamento comum nos dois navegadores e nas três telas.

- [ ] **Step 1: Atualizar documentação**

Explicar função atual, qualidade do exemplar, rápido/ágil/lento e potencial evolutivo opcional. Registrar o enriquecimento em duas passagens e a invalidação por `ROLE_RULES_VERSION`.

- [ ] **Step 2: Executar verificações automatizadas**

Run: `node scripts/test-pokemon-evaluation.js`

Run:

```powershell
$trackedJs = git ls-files '*.js'
foreach ($file in $trackedJs) { node --check $file }
Get-Content -Raw manifest.json | ConvertFrom-Json | Out-Null
Get-Content -Raw manifest.firefox.json | ConvertFrom-Json | Out-Null
```

Expected: todos os testes e checks passam; versões dos manifests permanecem inalteradas.

- [ ] **Step 3: Executar matriz manual**

- Zubat com IVs ruins e excelentes: mesma função, notas diferentes.
- Crobat: função rápida.
- Eevee: função versátil e oito potenciais quando o toggle estiver ligado.
- Meus Pokémon: payload repetido não recalcula.
- Encontro e Leilão: ausência de evolução ou perfil incompleto não quebra cards.
- Chrome e Firefox: mesmos rótulos, preferências e tooltips.

- [ ] **Step 4: Revisar e versionar**

Run: `git diff --check`

```bash
git add README.md docs/DEVELOPMENT.md scripts/test-pokemon-evaluation.js
git commit -m "docs: explica função relativa e potencial evolutivo"
```

## Checklist de cobertura

- Base stats dominam função e IVs apenas avaliam: Tasks 1, 2 e 4.
- Relevância interna, percentis e fronteiras: Tasks 1–2.
- Zubat ágil e Crobat rápido: Tasks 1–3 e 6.
- Eevee e ramificações sem evolução automática: Tasks 1, 3–6.
- Pré-cálculo diário e desempenho: Tasks 2–5.
- Configuração inicialmente desativada: Task 5.
- Três telas, Chrome e Firefox: Tasks 5–6.
