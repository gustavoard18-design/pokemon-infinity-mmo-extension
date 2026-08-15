# Sistema de avaliação funcional de Pokémon — especificação

## Resumo

Substituir o avaliador atual, que classifica o ataque principal comparando
somente `atk` e `spa`, por um sistema compartilhado que identifica a função do
Pokémon e avalia a qualidade do exemplar para essa função.

Na primeira entrega, a interface continuará exibindo apenas os dois campos já
existentes:

- **Avaliação**, agora calculada conforme a função;
- **Função**, substituindo completamente **Atq Principal**.

O modelo poderá produzir explicações e classificações adicionais, mas elas
ficarão ocultas por padrão e serão habilitadas por configuração. O mesmo núcleo
será consumido por Meus Pokémon, Encontro Atual e Leilão.

## Objetivos

- Classificar o papel funcional do Pokémon, e não apenas sua inclinação física
  ou especial.
- Avaliar IVs e Nature conforme os atributos relevantes para a função.
- Separar características fixas da espécie de características mutáveis do
  exemplar.
- Pré-calcular informações fixas uma vez por atualização diária da Pokédex.
- Evitar cálculos repetidos nas renderizações frequentes de Meus Pokémon.
- Expor um contrato único e explicável para todas as telas.
- Permitir ordenar e filtrar Meus Pokémon pela nova avaliação.

## Fora do escopo inicial

- Alterar o algoritmo de recomendação de melhor jogada em batalha.
- Consultar Smogon, PokeAPI ou outra fonte competitiva durante a avaliação.
- Classificar funções por aprendizado de máquina.
- Inferir estratégia completa de equipe.
- Exibir por padrão todos os diagnósticos produzidos pelo avaliador.
- Alterar a versão dos manifests fora de uma release.

## Problema atual

`components/iv-evaluation.js` lê `pokemon.stats.atk` e
`pokemon.stats.spa`. Se a diferença for de até 10% do maior valor, retorna
`Neutro`; caso contrário, retorna `Físico` ou `Especial`. Essa escolha define
pesos fixos para os IVs e aparece como **Atq Principal**.

Essa heurística possui quatro problemas:

1. usa stats atuais, sujeitos a nível, Nature, IVs, EVs e arredondamento;
2. ignora HP, defesas, velocidade, habilidade e moveset;
3. trata atacantes rápidos, atacantes resistentes, tanks e suportes como se
   fossem equivalentes;
4. recalcula a mesma conclusão básica da espécie a cada avaliação.

## Princípios do novo modelo

### Separação obrigatória de responsabilidades

O sistema responde a três perguntas diferentes e não pode misturá-las:

1. **Função atual da espécie:** qual papel é sugerido pela distribuição dos
   base stats, tipos, habilidades possíveis e learnset da espécie atual.
2. **Qualidade do exemplar:** quão adequados são IVs, Nature, EVs, habilidade
   efetiva e moveset para a função atual.
3. **Potencial evolutivo:** quais funções podem surgir nas evoluções seguintes
   e quão compatível o exemplar é com cada caminho.

Base stats são o sinal dominante da função. IVs não escolhem nem trocam a
função atual; eles pontuam a qualidade do exemplar para uma função previamente
identificada. Nature, EVs, habilidade efetiva e moveset produzem adequação e
podem desempatar candidatas estruturalmente próximas, mas não devem contrariar
uma identidade estatística clara.

### Perfil fixo da espécie

Representa o potencial natural da espécie e é calculado quando a Pokédex remota
é atualizada, atualmente a cada 24 horas. Usa apenas informações que não mudam
entre exemplares:

- base stats;
- tipos;
- habilidades possíveis e suas tags funcionais;
- learnset disponível na resposta da Pokédex;
- regras e versão do classificador.

O perfil fixo não decide sozinho como um exemplar está montado. Ele fornece
funções candidatas e os pesos iniciais de cada uma.

### Avaliação dinâmica do exemplar

É calculada localmente a partir do perfil fixo e dos campos do exemplar:

- IVs;
- Nature;
- EVs, quando disponíveis;
- moveset atual;
- habilidade efetiva;
- nível apenas quando necessário para avaliar moveset incompleto.

Esse cálculo deve ser puro, determinístico e barato. Trocar um golpe ou receber
novos EVs muda a adequação do exemplar e só desempata funções candidatas quando
o perfil fixo da espécie não tiver uma identidade estatística clara.

### Função atual e evolução

A função exibida sempre descreve a espécie atual. Uma evolução nunca substitui
retroativamente esse papel. A linha evolutiva é registrada em campos separados:

- `evolutionTrend`: função esperada quando existe um único caminho relevante;
- `evolutionPotential`: alternativas quando há ramificações, cada uma com
  espécie de destino, função e compatibilidade do exemplar.

Em uma linha simples, Zubat pode ser **Atacante físico ágil** atualmente e ter
tendência para **Atacante físico rápido/pivô** ao chegar a Crobat. Em uma linha
ramificada, Eevee permanece **Versátil** e expõe separadamente potenciais como
Jolteon/Espeon (atacante especial rápido), Umbreon (tank especial), Flareon
(atacante físico resistente) e as demais evoluções disponíveis no jogo.

Potencial evolutivo é diagnóstico opcional e começa oculto. Ele não altera a
nota nem a função atual e não exige cálculo repetido nas telas: a estrutura da
linha e os perfis das espécies são pré-calculados junto da Pokédex; somente a
compatibilidade dos IVs do exemplar é calculada localmente.

### Explicabilidade

Toda função contém:

- rótulo em português;
- atributos prioritários;
- função secundária opcional;
- confiança;
- razões estruturadas que explicam a escolha.

O hover de **Função** mostra obrigatoriamente os principais atributos, por
exemplo: `Prioriza ATK e SPE; HP é complementar.`

## Alternativas consideradas

### A. Avaliar tudo durante cada renderização

É simples, mas repete análise de base stats, learnset e habilidades em cada
card. Foi rejeitada pela frequência de atualização de Meus Pokémon e por
duplicar trabalho entre telas.

### B. Manter uma tabela manual de função por espécie

É rápida em runtime, porém exige manutenção manual para centenas de espécies e
fica desatualizada quando o jogo altera stats, habilidades ou learnsets. Foi
rejeitada como fonte principal; pequenas tabelas manuais continuam aceitáveis
somente para exceções explícitas.

### C. Perfil diário enriquecido + ajuste local do exemplar

É a abordagem escolhida. O refresh diário transforma a Pokédex remota em uma
Pokédex enriquecida. As telas fazem somente lookup por espécie e avaliação dos
dados mutáveis. Mantém atualização automática, bom desempenho e um contrato
compartilhado.

## Arquitetura

### Componentes propostos

#### `data/pokemon-role-rules.js`

Contém dados estáticos e versionados:

- identificadores de função;
- rótulos e descrições;
- pesos de IV por função;
- atributos essenciais e complementares;
- limiares de classificação;
- tags funcionais de habilidades;
- exceções pequenas e justificadas;
- `ROLE_RULES_VERSION`.

Não acessa DOM nem `chrome.*`.

#### `data/pokemon-species-profiler.js`

Função pura executável no service worker e em testes manuais. Recebe uma
entrada remota da Pokédex e produz `evaluationProfile`.

Responsabilidades:

- normalizar base stats;
- calcular ofensiva física/especial, bulk físico/especial e velocidade;
- analisar a distribuição de categorias no learnset quando houver detalhes
  suficientes;
- aplicar tags de habilidades;
- produzir funções candidatas ordenadas e razões estruturadas;
- aplicar exceções explícitas como Ditto e Shedinja;
- registrar a versão das regras usada no cálculo.

#### `components/pokemon-evaluation.js`

API pura compartilhada pelas telas. Substitui a responsabilidade de
`components/iv-evaluation.js`.

Responsabilidades:

- combinar `evaluationProfile` com o exemplar;
- selecionar função principal e secundária;
- calcular potencial dos IVs para cada função candidata;
- classificar Nature separadamente;
- medir compatibilidade do moveset;
- produzir os campos prontos para apresentação, ordenação e filtros;
- fornecer HTML somente em helpers periféricos, mantendo o cálculo sem DOM.

#### Consumidores

- `myPokemons.js`: lookup e memoização por assinatura do exemplar;
- `battle.js`: avaliação do oponente usando perfil por espécie e dados
  disponíveis no encontro;
- `auction.js`: avaliação do snapshot sanitizado do anúncio;
- `components/pokemon-card.js`: renderização compartilhada dos campos.

### Fluxo de dados

```text
Pokédex remota (24h)
        |
        v
pokemon-species-profiler
        |
        v
Pokédex enriquecida em chrome.storage.local
        |
        +--------------------+-------------------+
        |                    |                   |
        v                    v                   v
Meus Pokémon          Encontro Atual          Leilão
        |                    |                   |
        +--------- pokemon-evaluation -----------+
                             |
                             v
               função + avaliação + diagnósticos
```

O enriquecimento ocorre dentro do fluxo de `refreshPokedex()`, antes de
`PokemonHelperStorage.setPokedex()`. Se a rede falhar, o cache enriquecido
anterior continua válido. Se o cache possuir uma versão antiga de regras, o
service worker deve reprocessar os itens locais sem aguardar 24 horas e sem
nova request, desde que os dados-fonte necessários estejam presentes.

## Contratos de dados

### Perfil fixo injetado na Pokédex

Cada item salvo em `pkmnHelperPokedex.items` recebe:

```js
{
  slug: 'reuniclus',
  name: 'REUNICLUS',
  base: { hp: 110, atk: 65, def: 75, spa: 125, spd: 85, spe: 30 },
  abilities: ['overcoat', 'magic-guard', 'regenerator'],
  levelMoves: [],
  evaluationProfile: {
    schemaVersion: 1,
    rulesVersion: 1,
    generatedAt: '2026-08-13T12:00:00.000Z',
    candidates: [
      {
        id: 'special_bulky_attacker',
        score: 0.94,
        confidence: 'high',
        primaryStats: ['spa', 'hp'],
        secondaryStats: ['def', 'spd'],
        reasons: ['high_spa', 'high_hp', 'low_spe']
      },
      {
        id: 'special_tank',
        score: 0.81,
        confidence: 'medium',
        primaryStats: ['hp', 'spd'],
        secondaryStats: ['spa', 'def'],
        reasons: ['high_hp', 'good_spd', 'recovery_ability_pool']
      }
    ],
    specialCase: null
  }
}
```

`generatedAt` é informativo. Invalidação funcional usa `schemaVersion` e
`rulesVersion`, nunca comparação de data por item.

Para viabilizar reprocessamento offline, o cache da Pokédex deve preservar os
campos remotos necessários ao perfil: `types`, `abilities`, base stats e os
metadados de learnset efetivamente utilizados.

### Contrato evolutivo

A request e os dados rastreados atualmente não fornecem relações evolutivas.
Elas ficam em `data/pokemon-evolution-lines.js`, uma tabela estática versionada
carregada somente no enriquecimento da Pokédex. A tabela usa slugs já adotados
pelo cache e deve ser atualizada quando espécies ou evoluções mudarem no jogo.

O perfil enriquecido acrescenta:

```js
{
  evolutionTrend: {
    species: 'crobat',
    roleId: 'physical_fast_attacker',
    confidence: 'high',
    path: ['golbat', 'crobat']
  },
  evolutionPotential: []
}
```

Para ramificações, `evolutionTrend` é `null` e `evolutionPotential` contém todos
os destinos finais. Relações ausentes ou inválidas resultam em campos vazios e
baixa confiança, nunca em erro de renderização.

### Resultado dinâmico

`PokemonEvaluation.evaluate(pokemon, speciesProfile)` retorna:

```js
{
  schemaVersion: 1,
  role: {
    id: 'special_bulky_attacker',
    label: 'Atacante especial resistente',
    secondaryLabel: 'Tank especial',
    confidence: 'high',
    primaryStats: ['spa', 'hp'],
    secondaryStats: ['def', 'spd'],
    tooltip: 'Prioriza SPA e HP; DEF e SPD são complementares.'
  },
  rating: {
    score: 87,
    label: 'Muito bom',
    slug: 'muito-bom',
    sortValue: 87
  },
  nature: {
    fit: 'favorable',
    adjustment: 3
  },
  moveset: {
    fit: 'compatible',
    confidence: 'high'
  },
  alternatives: [
    { roleId: 'special_tank', score: 82 }
  ],
  ivPercent: 76,
  fingerprint: '...'
}
```

Os nomes no contrato são estáveis e em inglês. Rótulos apresentados ao usuário
permanecem em português.

### Ausência de perfil

Se a espécie não existir no cache ou o perfil for inválido:

1. aplicar fallback local baseado nos stats disponíveis;
2. marcar confiança como `low`;
3. nunca bloquear a renderização;
4. manter o último cache válido quando uma atualização remota falhar.

## Taxonomia inicial de funções

### Funções ofensivas

- `physical_attacker` — Atacante físico;
- `special_attacker` — Atacante especial;
- `mixed_attacker` — Atacante misto;
- `physical_fast_attacker` — Atacante físico rápido;
- `special_fast_attacker` — Atacante especial rápido;
- `mixed_fast_attacker` — Atacante misto rápido;
- `physical_agile_attacker` — Atacante físico ágil;
- `special_agile_attacker` — Atacante especial ágil;
- `mixed_agile_attacker` — Atacante misto ágil;
- `physical_bulky_attacker` — Atacante físico resistente;
- `special_bulky_attacker` — Atacante especial resistente;
- `physical_slow_attacker` — Atacante físico lento;
- `special_slow_attacker` — Atacante especial lento.

### Funções defensivas e utilitárias

- `physical_tank` — Tank físico;
- `special_tank` — Tank especial;
- `mixed_tank` — Tank misto;
- `fast_support` — Suporte rápido;
- `defensive_support` — Suporte defensivo;
- `offensive_pivot` — Pivô ofensivo.

### Funções abertas

- `versatile` — Versátil;
- `special_case` — Função especial.

A taxonomia inicial deve permanecer pequena. Combinações são apresentadas como
função principal mais secundária, sem criar um identificador para cada frase
possível.

**Rápido** indica velocidade alta no conjunto global da Pokédex. **Ágil** indica
que Spe é estruturalmente relevante dentro da própria espécie, mesmo sem estar
na faixa global dos mais rápidos. **Lento** só pode ser usado quando Spe for
baixa globalmente e também pouco relevante na distribuição interna; um único
limite absoluto nunca é suficiente para aplicar esse rótulo.

## Identificação da função

### Indicadores fixos

Os base stats são normalizados em dois eixos independentes:

- **relevância interna:** posição, razão para a média e distância do maior stat
  dentro da própria espécie;
- **posição global:** percentil do stat entre todas as espécies válidas
  disponíveis na Pokédex. Segmentação por estágio evolutivo fica fora desta
  revisão; a relevância interna evita penalizar espécies em desenvolvimento.

Os indicadores derivados são:

- `physicalOffense` deriva de Atk;
- `specialOffense` deriva de SpA;
- `physicalBulk` deriva de HP e Def;
- `specialBulk` deriva de HP e SpD;
- `speed` deriva de Spe;
- `balance` mede ausência de especialização dominante.

Bulk deve considerar a combinação de HP com a defesa correspondente, e não a
defesa isoladamente. Velocidade não usa cortes rígidos como `Spe <= 55`: combina
relevância interna e percentil global. A fórmula, percentis e limiares ficam
centralizados nas regras, são versionados e validados contra espécies de
referência e casos próximos das fronteiras.

Zubat é uma regressão obrigatória: como Spe 55 é seu maior base stat e cerca de
135% da média dos seus seis stats, sua velocidade é relevante. Ele não pode ser
classificado como atacante lento, ainda que seu percentil global não justifique
o rótulo rápido; o resultado esperado é **Atacante físico ágil**.

Habilidades e learnset ajustam pontuações, mas não devem superar sozinhos um
perfil estatístico muito claro. Habilidades recebem tags manuais versionadas;
descrições textuais não serão interpretadas em runtime.

### Ajustes do exemplar

- Moveset físico/especial/status mede adequação e só desempata candidatas
  estruturalmente próximas.
- Nature pode desempatar candidatas, mas não redefine a espécie sozinha.
- EVs medem especialização do exemplar e não substituem a função da espécie.
- IVs determinam potencial para a função; não devem ser o principal sinal para
  escolher ou trocar a função, evitando uma avaliação circular.
- Habilidade efetiva seleciona somente as tags daquela habilidade, não de toda
  a lista possível da espécie.

### Confiança

- `high`: base stats, habilidade e moveset convergem;
- `medium`: perfil da espécie é claro, mas o exemplar possui dados incompletos
  ou parcialmente divergentes;
- `low`: espécie ausente, moveset insuficiente, stats incompletos ou caso
  altamente versátil.

## Avaliação orientada à função

### Pesos iniciais

| Função | HP | Atk | Def | SpA | SpD | Spe |
|---|---:|---:|---:|---:|---:|---:|
| Atacante físico | 15 | 50 | 10 | 0 | 10 | 15 |
| Atacante especial | 15 | 0 | 10 | 50 | 10 | 15 |
| Atacante misto | 10 | 30 | 10 | 30 | 10 | 10 |
| Atacante físico rápido | 10 | 40 | 5 | 0 | 5 | 40 |
| Atacante especial rápido | 10 | 0 | 5 | 40 | 5 | 40 |
| Atacante misto rápido | 5 | 30 | 5 | 30 | 5 | 25 |
| Atacante físico resistente | 25 | 35 | 15 | 0 | 15 | 10 |
| Atacante especial resistente | 25 | 0 | 15 | 35 | 15 | 10 |
| Atacante físico lento | 25 | 45 | 15 | 0 | 15 | 0 |
| Atacante especial lento | 25 | 0 | 15 | 45 | 15 | 0 |
| Tank físico | 35 | 5 | 40 | 0 | 15 | 5 |
| Tank especial | 35 | 0 | 15 | 5 | 40 | 5 |
| Tank misto | 35 | 0 | 27,5 | 0 | 27,5 | 10 |
| Suporte rápido | 25 | 0 | 15 | 0 | 15 | 45 |
| Suporte defensivo | 35 | 0 | 25 | 0 | 25 | 15 |

Esses pesos são configuração versionada. Pivô ofensivo deriva do atacante
físico, especial ou misto correspondente, transferindo parte do peso ofensivo
para HP e Spe. `Versátil` não usa média uniforme: calcula todas as candidatas
compatíveis e escolhe a melhor para o exemplar.

### Pontuação

Para cada função candidata:

```text
ivScore = soma((IV / 31) × peso)
score = clamp(round(ivScore + ajusteNature), 0, 100)
```

Moveset não altera a qualidade intrínseca dos IVs; ele produz uma medida
separada de adequação e influencia qual candidata é exibida como função atual.

### Faixas

| Pontuação | Rótulo |
|---:|---|
| 0–39 | Ruim |
| 40–59 | Regular |
| 60–74 | Bom |
| 75–89 | Muito bom |
| 90–100 | Excelente |

### Atributos essenciais

- IV essencial entre 0 e 5: penalidade forte e indicação na explicação;
- entre 6 e 15: a nota fica limitada a `Bom`;
- entre 16 e 25: sem limitador adicional;
- entre 26 e 31: faixa ideal.

O limitador é aplicado ao conjunto essencial da função. Um atributo irrelevante
baixo nunca reduz a avaliação. Em funções com três atributos essenciais, um
único IV baixo aplica penalidade proporcional antes de limitar a nota, evitando
que um ponto isolado destrua artificialmente o conjunto.

### Nature

- `very_favorable`: +5;
- `favorable`: +3;
- `neutral` ou `compatible`: 0;
- `unfavorable`: -5;
- `conflicting`: -8.

Nature é apresentada separadamente e possui influência limitada. Não converte
IVs ruins em excelentes nem invalida sozinha um exemplar de IVs altos.

## Desempenho em Meus Pokémon

Meus Pokémon recebe payloads passivamente e pode renderizar com frequência. O
desenho adota cinco proteções:

1. **Perfil diário:** análise de espécie já vem pronta no cache da Pokédex.
2. **Índice em memória:** `Map<speciesSlug, evaluationProfile>` construído uma
   vez ao carregar ou quando o storage da Pokédex muda.
3. **Memoização por exemplar:** cache por `pokemon.id` e fingerprint apenas dos
   campos relevantes: espécie, IVs, EVs, Nature, habilidade e golpes.
4. **Preservação entre payloads:** se o fingerprint não mudou, reutilizar o
   mesmo resultado mesmo que HP, posição ou status tenham mudado.
5. **Cálculo único por ciclo:** o view model recebe `evaluation`; filtros,
   ordenação e card reutilizam esse objeto, sem chamar o avaliador novamente.

O cache em memória é limitado aos Pokémon do último conjunto normalizado. Ao
trocar para uma lista importada ou receber nova Party/PC, entradas ausentes são
descartadas. Não é necessário persistir avaliações individuais no
`chrome.storage.local`.

O renderizador deve continuar reconstruindo a tela conforme o padrão atual,
mas o trabalho de avaliação passa a ser proporcional apenas aos exemplares
alterados.

## Uso nas telas

### Meus Pokémon

- substituir **Atq Principal** por **Função**;
- substituir o resultado de **Avaliação** pela nota orientada à função;
- hover de Função lista atributos prioritários;
- o view model armazena `evaluation` uma única vez;
- filtros avançados ganham filtro por faixa de avaliação;
- ordenação ganha `Avaliação crescente` e `Avaliação decrescente`;
- desempate da ordenação: score numérico, IV total, nome e ID estável;
- importações antigas sem perfil continuam avaliáveis via lookup da espécie.

Filtro inicial proposto: multisseleção dos rótulos `Ruim`, `Regular`, `Bom`,
`Muito bom` e `Excelente`. O modelo interno também aceita intervalo numérico,
mas a primeira UI usa rótulos para ser consistente com os cards.

### Encontro Atual

- substituir os mesmos dois campos existentes;
- usar os dados reais do `foe` quando presentes;
- para adversários sem moveset revelado, usar perfil fixo e movimentos
  prováveis já inferidos pela tela, com confiança reduzida;
- não alterar o tratamento intencional de `state.over`.

### Leilão

- incluir Função e Avaliação nos cards de anúncios e vendáveis;
- o snapshot sanitizado já contém espécie, IVs, Nature e habilidade;
- como o anúncio não contém stats nem moveset, usar o perfil fixo da espécie e
  registrar adequação de moveset como `unknown`;
- nenhum token, URL ou dado fora da allowlist atravessa o bridge;
- não é necessário injetar o perfil completo no snapshot: o iframe faz lookup
  no cache local pelo `species` sanitizado.

## Configurações

Adicionar preferências em `DEFAULT_UI_PREFERENCES.screens` com merge profundo
compatível com instalações existentes.

Configurações iniciais:

```js
evaluation: {
  enabled: true,
  showCoreFields: true,
  showConfidence: false,
  showNatureFit: false,
  showMovesetFit: false,
  showAlternativeRole: false,
  showEvolutionPotential: false
}
```

Semântica:

- `enabled`: ativa o cálculo e todos os recursos do novo avaliador;
- `showCoreFields`: exibe os campos existentes **Avaliação** e **Função**;
- demais opções exibem diagnósticos adicionais e começam desativadas;
- `showEvolutionPotential` mostra tendência ou caminhos evolutivos sem trocar a
  Função atual.

Quando `enabled` for `false`, não calcular avaliação dinâmica, não mostrar
campos, não oferecer filtro/ordenação por avaliação e não manter cache de
resultados. Quando `showCoreFields` for `false`, o motor pode continuar ativo
para filtros ou campos opcionais, mas os dois campos principais ficam ocultos.

A primeira entrega pode apresentar uma seção global **Avaliação de Pokémon** no
painel de Configurações. Preferências distintas por tela somente devem ser
adicionadas se surgir necessidade real; o padrão global evita combinações
redundantes.

## Compatibilidade e migração

- Preferências ausentes recebem os novos defaults; nenhuma migração destrutiva.
- O cache antigo da Pokédex sem `evaluationProfile` é reprocessado localmente
  se conservar os dados necessários; caso contrário, continua funcional com
  fallback até a próxima atualização remota bem-sucedida.
- `PokemonIvEvaluation` pode permanecer temporariamente como alias de
  compatibilidade para `PokemonEvaluation`, mas novos consumidores usam apenas
  o novo nome.
- Exportação/importação não precisa transportar o perfil fixo. Os campos do
  exemplar necessários à avaliação continuam na whitelist; EVs devem ser
  acrescentados à versão seguinte do formato se forem usados na função atual.
- Não renomear globals/eventos internos históricos `pokemon-helper-*` ou
  `pkmn-helper-*`.

## Tratamento de erros

- Falha no refresh remoto preserva o último cache enriquecido válido.
- Perfil inválido de uma espécie afeta somente aquela espécie e gera fallback.
- Campos numéricos são normalizados e limitados antes do cálculo.
- Funções desconhecidas usam `versatile`/baixa confiança, nunca quebram o card.
- Configuração inválida é substituída pelo default no merge de preferências.
- Erros de avaliação podem emitir `console.warn` com o prefixo histórico
  `[Pokemon Helper]`, sem interromper a renderização da lista.

## Validação

O repositório não possui suíte de testes. O plano de implementação deve incluir
um harness JavaScript sem dependências, executável pelo runtime disponível, para
testar as funções puras, além da verificação manual da extensão.

### Espécies de referência

O conjunto mínimo de regressão deve cobrir:

- Lucario — atacante misto rápido;
- Swampert — atacante físico resistente;
- Mamoswine — atacante físico resistente/agressivo;
- Arcanine — pivô ofensivo/versátil;
- Mew — versátil e baixa confiança sem exemplar;
- Houndoom — atacante especial rápido;
- Flygon — atacante físico rápido/pivô;
- Gengar — atacante especial rápido;
- Golurk — atacante físico resistente/lento;
- Solosis — atacante especial lento;
- Reuniclus — atacante especial resistente;
- Bulbasaur — suporte especial;
- Venusaur — atacante especial resistente/suporte;
- Umbreon, Blissey, Skarmory e Ferrothorn — funções defensivas;
- Ditto e Shedinja — funções especiais.
- Zubat — atacante físico ágil; Spe é o maior base stat e nunca resulta em
  `physical_slow_attacker`.
- Eevee — função atual versátil e múltiplos potenciais evolutivos independentes,
  sem eleger uma evolução única por IV.

### Casos funcionais

- IV irrelevante baixo não derruba a nota.
- IV essencial baixo aplica a penalidade definida.
- Nature favorável e conflitante produzem ajustes limitados.
- Moveset físico/especial desempata candidatas estruturalmente equivalentes de
  uma espécie versátil, sem usar IVs para escolher a função.
- Nenhum IV muda a função atual definida pelo perfil da espécie.
- Um stat dominante internamente não é descartado por ficar abaixo de um corte
  absoluto global.
- Zubat com qualquer combinação de IVs mantém função atual física ágil; seus IVs
  alteram somente a avaliação e a compatibilidade evolutiva.
- Eevee retorna todas as ramificações disponíveis, ordenadas por compatibilidade,
  sem incorporar a melhor evolução à função atual.
- Payload repetido com mesmo fingerprint reutiliza o objeto avaliado.
- Mudança somente de HP/status não invalida o cache.
- Mudança de IV, EV, Nature, habilidade ou golpe invalida o cache.
- Falta de perfil usa fallback de baixa confiança.
- Refresh com nova `rulesVersion` reprocessa sem request quando possível.
- Leilão avalia snapshot sem moveset sem atravessar dados adicionais no bridge.

### Verificação manual

- Carregar a extensão descompactada em Chrome e Firefox.
- Conferir Avaliação e Função nas três telas.
- Alternar todas as configurações e recarregar o overlay.
- Ordenar crescente/decrescente e filtrar cada faixa em Meus Pokémon.
- Simular payloads repetidos e confirmar ausência de recálculo pelo contador de
  diagnóstico temporário, removido antes do commit final.
- Confirmar que atualização da Pokédex re-renderiza consumidores sem recarregar
  a página.

## Critérios de aceite

1. **Atq Principal** deixa de existir nas três telas e é substituído por
   **Função**.
2. O hover de Função informa seus atributos prioritários.
3. Avaliação usa pesos da função e ignora atributos irrelevantes.
4. Perfil fixo é gerado no refresh da Pokédex e compartilhado via storage.
5. Meus Pokémon não recalcula exemplares cujo fingerprint não mudou.
6. Meus Pokémon ordena crescente/decrescente e filtra por avaliação.
7. O recurso e seus campos principais começam ativados.
8. Confiança, Nature, moveset e alternativa começam ocultos e podem ser
   ativados por configuração.
9. Encontro Atual preserva o comportamento existente de batalha, inclusive a
   decisão de ignorar `state.over` em `battle.js`.
10. Leilão não amplia dados sensíveis nem o contrato de autenticação do bridge.
11. Ausência ou falha do perfil não impede a renderização.
12. Chrome e Firefox recebem os mesmos arquivos e preferências aplicáveis.
13. A função atual é derivada principalmente dos base stats; IVs nunca escolhem
    ou trocam essa função.
14. Rótulos de velocidade combinam relevância interna e percentil global; Zubat
    é classificado como atacante físico ágil, não lento.
15. Evoluções são expostas separadamente como tendência ou potencial e não
    alteram função nem nota da espécie atual.

## Decisões futuras explicitamente adiadas

- Ajuste fino dos pesos após comparação com uma amostra maior de exemplares.
- Filtro por função e confiança.
- Exibição visual de função secundária nos cards.
- Avaliação de sinergia do time.
- Uso de itens na determinação da função.
- Persistência de avaliações individuais.

Essas extensões são suportadas pelo contrato, mas não fazem parte da primeira
implementação.
