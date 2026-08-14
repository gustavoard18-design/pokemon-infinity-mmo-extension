const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const load = (relativePath) => vm.runInThisContext(
    fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
    { filename: relativePath }
);

function test(name, run) {
    try {
        run();
        process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
        process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
        process.exitCode = 1;
    }
}

load('data/pokemon-role-rules.js');
if (fs.existsSync(path.join(ROOT, 'data/pokemon-species-profiler.js'))) load('data/pokemon-species-profiler.js');
load('components/nature-effect.js');
if (fs.existsSync(path.join(ROOT, 'components/pokemon-evaluation.js'))) load('components/pokemon-evaluation.js');
if (fs.existsSync(path.join(ROOT, 'data/extension-storage.js'))) load('data/extension-storage.js');

test('pesos do atacante especial rápido priorizam SPA e SPE', () => {
    const role = PokemonRoleRules.role('special_fast_attacker');
    assert.deepEqual(role.weights, { hp: 10, atk: 0, def: 5, spa: 40, spd: 5, spe: 40 });
    assert.deepEqual(role.primaryStats, ['spa', 'spe']);
});

test('todas as funções possuem pesos totalizando cem', () => {
    for (const role of Object.values(PokemonRoleRules.ROLES)) {
        assert.equal(Object.values(role.weights).reduce((sum, weight) => sum + weight, 0), 100, role.id);
        assert.ok(role.label, role.id);
        assert.ok(role.primaryStats.length, role.id);
    }
});

test('faixas de nota respeitam os limites definidos', () => {
    assert.equal(PokemonRoleRules.ratingFor(39).label, 'Ruim');
    assert.equal(PokemonRoleRules.ratingFor(59).label, 'Regular');
    assert.equal(PokemonRoleRules.ratingFor(74).label, 'Bom');
    assert.equal(PokemonRoleRules.ratingFor(89).label, 'Muito bom');
    assert.equal(PokemonRoleRules.ratingFor(90).label, 'Excelente');
});

test('habilidades conhecidas retornam tags e desconhecidas são seguras', () => {
    assert.deepEqual(PokemonRoleRules.abilityTags('magic-guard'), ['indirect_damage_immunity']);
    assert.deepEqual(PokemonRoleRules.abilityTags('unknown-ability'), []);
});

const speciesFixtures = {
    lucario: [70,110,70,115,70,90], swampert: [100,110,90,85,90,60],
    gengar: [60,65,60,130,75,110], golurk: [89,124,80,55,80,55],
    solosis: [45,30,40,105,50,20], reuniclus: [110,65,75,125,85,30],
    bulbasaur: [45,49,49,65,65,45], venusaur: [80,82,83,100,100,80],
    mew: [100,100,100,100,100,100], mamoswine: [110,130,80,70,60,80], ditto: [48,48,48,48,48,48],
    shedinja: [1,90,45,30,30,40]
};
const species = (slug) => {
    const [hp,atk,def,spa,spd,spe] = speciesFixtures[slug];
    return { slug, name:slug.toUpperCase(), base:{ hp,atk,def,spa,spd,spe }, abilities:[], types:[], levelMoves:[] };
};

test('perfilador distingue arquétipos ofensivos e resistentes', () => {
    const primary = (slug) => PokemonSpeciesProfiler.profileSpecies(species(slug), '2026-08-13T12:00:00.000Z').candidates[0].id;
    assert.equal(primary('lucario'), 'mixed_fast_attacker');
    assert.equal(primary('swampert'), 'physical_bulky_attacker');
    assert.equal(primary('gengar'), 'special_fast_attacker');
    assert.equal(primary('golurk'), 'physical_slow_attacker');
    assert.equal(primary('solosis'), 'special_slow_attacker');
    assert.equal(primary('reuniclus'), 'special_bulky_attacker');
    assert.equal(primary('mamoswine'), 'physical_bulky_attacker');
});

test('perfilador reconhece versatilidade, suporte e casos especiais', () => {
    const profile = (slug) => PokemonSpeciesProfiler.profileSpecies(species(slug), '2026-08-13T12:00:00.000Z');
    assert.equal(profile('mew').candidates[0].id, 'versatile');
    assert.equal(profile('ditto').candidates[0].id, 'special_case');
    assert.equal(profile('shedinja').candidates[0].id, 'special_case');
    assert.equal(profile('bulbasaur').candidates[0].id, 'defensive_support');
    assert.ok(profile('venusaur').candidates.some(({ id }) => id === 'special_bulky_attacker'));
});

test('perfilador é determinístico e isola entrada inválida', () => {
    const input = species('reuniclus');
    const first = PokemonSpeciesProfiler.profileSpecies(input, '2026-08-13T12:00:00.000Z');
    assert.deepEqual(first, PokemonSpeciesProfiler.profileSpecies(input, '2026-08-13T12:00:00.000Z'));
    assert.equal(first.candidates[0].confidence, 'high');
    assert.equal(PokemonSpeciesProfiler.profileSpecies({ slug:'broken' }, '2026-08-13T12:00:00.000Z').candidates[0].confidence, 'low');
    assert.ok(first.candidates.every(({ score }) => score >= 0 && score <= 1));
});

test('enriquecimento preserva dados-fonte e injeta perfil versionado', () => {
    const source = { ...species('gengar'), catchRate:45, levelMoves:[{ lv:1, slug:'hypnosis' }] };
    const [result] = PokemonSpeciesProfiler.preparePokedexItems([source], '2026-08-13T12:00:00.000Z');
    assert.deepEqual(result.types, []);
    assert.deepEqual(result.abilities, []);
    assert.deepEqual(result.levelMoves, [{ lv:1, slug:'hypnosis' }]);
    assert.equal(result.evaluationProfile.rulesVersion, PokemonRoleRules.ROLE_RULES_VERSION);
});

test('cache só precisa de reprocessamento quando possui perfil desatualizado', () => {
    assert.equal(PokemonSpeciesProfiler.needsReprofile({ items:[] }), false);
    assert.equal(PokemonSpeciesProfiler.needsReprofile({ items:[{ evaluationProfile:{ schemaVersion:1, rulesVersion:0 } }] }), true);
    assert.equal(PokemonSpeciesProfiler.needsReprofile({ items:[{ evaluationProfile:{ schemaVersion:1, rulesVersion:1 } }] }), false);
});

test('avaliação ignora IV irrelevante e pondera os essenciais da função', () => {
    const profile = PokemonSpeciesProfiler.profileSpecies(species('gengar'), '2026-08-13T12:00:00.000Z');
    const perfect = { species:'gengar', nature:'Hardy', ivs:{ hp:31, atk:31, def:31, spa:31, spd:31, spe:31 }, moves:[] };
    const irrelevantLow = { ...perfect, ivs:{ ...perfect.ivs, atk:0 } };
    assert.equal(PokemonEvaluation.evaluate(perfect, profile).rating.score, 100);
    assert.equal(PokemonEvaluation.evaluate(irrelevantLow, profile).rating.score, 100);
    const weakSpeed = { ...perfect, ivs:{ ...perfect.ivs, spe:12 } };
    assert.equal(PokemonEvaluation.evaluate(weakSpeed, profile).rating.label, 'Bom');
});

test('Nature favorável e conflitante ajustam a nota de forma limitada', () => {
    const profile = PokemonSpeciesProfiler.profileSpecies(species('gengar'), '2026-08-13T12:00:00.000Z');
    const base = { species:'gengar', ivs:{ hp:25, atk:0, def:25, spa:25, spd:25, spe:25 }, moves:[] };
    assert.equal(PokemonEvaluation.evaluate({ ...base, nature:'Timid' }, profile).nature.adjustment, 5);
    assert.equal(PokemonEvaluation.evaluate({ ...base, nature:'Adamant' }, profile).nature.adjustment, -8);
});

test('moveset refina uma espécie mista sem usar IV para escolher função', () => {
    const profile = PokemonSpeciesProfiler.profileSpecies(species('lucario'), '2026-08-13T12:00:00.000Z');
    const base = { species:'lucario', nature:'Hardy', ivs:{ hp:20, atk:20, def:20, spa:20, spd:20, spe:20 } };
    assert.equal(PokemonEvaluation.evaluate({ ...base, moves:[{ slug:'close-combat', category:'physical', power:120 }] }, profile).role.id, 'physical_fast_attacker');
    assert.equal(PokemonEvaluation.evaluate({ ...base, moves:[{ slug:'aura-sphere', category:'special', power:80 }] }, profile).role.id, 'special_fast_attacker');
});

test('fingerprint e cache ignoram HP/status e invalidam dados de build', () => {
    const profile = PokemonSpeciesProfiler.profileSpecies(species('gengar'), '2026-08-13T12:00:00.000Z');
    const mon = { id:7, species:'gengar', hp:100, status:null, nature:'Timid', ivs:{ hp:20, atk:0, def:20, spa:31, spd:20, spe:31 }, moves:[] };
    assert.equal(PokemonEvaluation.fingerprint(mon), PokemonEvaluation.fingerprint({ ...mon, hp:1, status:'burn' }));
    assert.notEqual(PokemonEvaluation.fingerprint(mon), PokemonEvaluation.fingerprint({ ...mon, nature:'Modest' }));
    const cache = PokemonEvaluation.createCache();
    assert.strictEqual(cache.evaluate(mon, profile), cache.evaluate({ ...mon, hp:1 }, profile));
    cache.retain([]);
    assert.equal(cache.size, 0);
});

test('falta de perfil produz fallback renderizável de baixa confiança', () => {
    const result = PokemonEvaluation.evaluate({ name:'DESCONHECIDO', ivs:{} }, null);
    assert.equal(result.role.confidence, 'low');
    assert.ok(result.role.label);
    assert.ok(result.rating.label);
});

test('preferências antigas recebem defaults completos de avaliação', () => {
    const prefs = PokemonHelperStorage.mergeUiPreferences({ tooltipsEnabled:false });
    assert.equal(prefs.tooltipsEnabled, false);
    assert.deepEqual(prefs.evaluation, {
        enabled:true, showCoreFields:true, showConfidence:false,
        showNatureFit:false, showMovesetFit:false, showAlternativeRole:false
    });
    const disabled = PokemonHelperStorage.mergeUiPreferences({ evaluation:{ enabled:false } });
    assert.equal(disabled.evaluation.enabled, false);
    assert.equal(disabled.evaluation.showCoreFields, true);
});

process.on('exit', () => {
    if (!process.exitCode) process.stdout.write('Avaliação Pokémon: todos os testes passaram.\n');
});
