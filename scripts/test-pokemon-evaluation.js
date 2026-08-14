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
    mew: [100,100,100,100,100,100], ditto: [48,48,48,48,48,48],
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
});

test('perfilador reconhece versatilidade, suporte e casos especiais', () => {
    const profile = (slug) => PokemonSpeciesProfiler.profileSpecies(species(slug), '2026-08-13T12:00:00.000Z');
    assert.equal(profile('mew').candidates[0].id, 'versatile');
    assert.equal(profile('ditto').candidates[0].id, 'special_case');
    assert.equal(profile('shedinja').candidates[0].id, 'special_case');
    assert.ok(profile('bulbasaur').candidates.some(({ id }) => id === 'defensive_support'));
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

process.on('exit', () => {
    if (!process.exitCode) process.stdout.write('Avaliação Pokémon: todos os testes passaram.\n');
});
