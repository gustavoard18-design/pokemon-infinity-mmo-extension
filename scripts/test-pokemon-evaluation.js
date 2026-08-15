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
if (fs.existsSync(path.join(ROOT, 'components/pokemon-card.js'))) load('components/pokemon-card.js');

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
    shedinja: [1,90,45,30,30,40],
    zubat: [40,45,35,30,40,55], golbat: [75,80,70,65,75,90], crobat: [85,90,80,70,80,130],
    eevee: [55,55,50,45,65,55], vaporeon: [130,65,60,110,95,65], jolteon: [65,65,60,110,95,130],
    flareon: [65,130,60,95,110,65], espeon: [65,65,60,130,95,110], umbreon: [95,65,110,60,130,65],
    leafeon: [65,110,130,60,65,95], glaceon: [65,60,110,130,95,65], sylveon: [95,65,65,110,130,60],
    slowpoke: [90,65,65,40,40,15], slowbro:[95,75,110,100,80,30], slowking:[95,75,80,100,110,30]
};
const evolutionFixtures = {
    zubat:['golbat'], golbat:['crobat'],
    eevee:['vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon'],
    slowpoke:['slowbro','slowking']
};
const species = (slug, extra = {}) => {
    const [hp,atk,def,spa,spd,spe] = speciesFixtures[slug];
    const evo = evolutionFixtures[slug]?.map((target) => ({ slug:target, name:target.toUpperCase() })) || null;
    return { slug, name:slug.toUpperCase(), base:{ hp,atk,def,spa,spd,spe }, abilities:[], types:[], evo, levelMoves:[], ...extra };
};

test('Zubat usa velocidade relativa e Eevee preserva todos os caminhos evolutivos', () => {
    const slugs = ['zubat','golbat','crobat','eevee','vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon','sylveon'];
    const profiled = new Map(PokemonSpeciesProfiler.profileAll(slugs.map((slug) => species(slug)), '2026-08-14T12:00:00.000Z')
        .map((item) => [item.slug, item.evaluationProfile]));
    assert.equal(profiled.get('zubat').candidates[0].id, 'physical_agile_attacker');
    assert.notEqual(profiled.get('zubat').candidates[0].id, 'physical_slow_attacker');
    assert.equal(profiled.get('eevee').evolutionPotential.length, 7);
    assert.equal(profiled.get('zubat').evolutionTrend.species, 'crobat');
});

test('todo candidato produzido pelo perfilador possui regra registrada', () => {
    const profiled = PokemonSpeciesProfiler.profileAll(Object.keys(speciesFixtures).map((slug) => species(slug)), '2026-08-14T12:00:00.000Z');
    for (const item of profiled) for (const candidate of item.evaluationProfile.candidates) {
        assert.ok(Object.prototype.hasOwnProperty.call(PokemonRoleRules.ROLES, candidate.id), `${item.slug}: ${candidate.id}`);
    }
});

test('IVs alteram a nota do Zubat sem alterar sua função atual', () => {
    const [profiled] = PokemonSpeciesProfiler.profileAll([species('zubat')], '2026-08-14T12:00:00.000Z');
    const base = { id:42, species:'zubat', nature:'Hardy', moves:[] };
    const weak = PokemonEvaluation.evaluate({ ...base, ivs:{ hp:0, atk:0, def:0, spa:0, spd:0, spe:0 } }, profiled.evaluationProfile);
    const strong = PokemonEvaluation.evaluate({ ...base, ivs:{ hp:31, atk:31, def:31, spa:31, spd:31, spe:31 } }, profiled.evaluationProfile);
    assert.equal(weak.role.id, strong.role.id);
    assert.equal(strong.role.id, 'physical_agile_attacker');
    assert.notEqual(weak.rating.score, strong.rating.score);
});

test('avaliação mantém função atual e pontua caminhos evolutivos separadamente', () => {
    const slugs = ['eevee','vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon','sylveon'];
    const profiled = new Map(PokemonSpeciesProfiler.profileAll(slugs.map((slug) => species(slug)), '2026-08-14T12:00:00.000Z')
        .map((item) => [item.slug, item.evaluationProfile]));
    const result = PokemonEvaluation.evaluate({ species:'eevee', nature:'Timid', moves:[], ivs:{ hp:20, atk:5, def:20, spa:31, spd:20, spe:31 } }, profiled.get('eevee'));
    assert.equal(result.role.id, 'versatile');
    assert.equal(result.evolutionPotential.length, 7);
    assert.equal(result.evolutionPotential[0].rating.score >= result.evolutionPotential[1].rating.score, true);
    assert.equal(result.evolutionPotential.some((item) => item.species === 'jolteon' && item.role.id === 'special_fast_attacker'), true);
    const physicalMove = PokemonEvaluation.evaluate({ species:'eevee', nature:'Adamant', moves:[{ category:'physical', power:80 }], ivs:{ hp:20, atk:31, def:20, spa:5, spd:20, spe:20 } }, profiled.get('eevee'));
    assert.equal(physicalMove.role.id, 'versatile');
});

test('ramificação evolutiva indireta preserva todos os destinos finais', () => {
    const make = (slug, evo) => ({ ...species('zubat'), slug, name:slug.toUpperCase(), evo:evo?.map((target) => ({ slug:target })) || null });
    const profiled = PokemonSpeciesProfiler.profileAll([
        make('root', ['middle']), make('middle', ['final-a', 'final-b']), make('final-a'), make('final-b')
    ], '2026-08-14T12:00:00.000Z');
    const root = profiled.find((item) => item.slug === 'root').evaluationProfile;
    assert.equal(root.evolutionTrend, null);
    assert.deepEqual(root.evolutionPotential.map((item) => item.species), ['final-a', 'final-b']);
});

test('ramificação evolutiva não substitui a função atual da espécie', () => {
    const [slowpoke] = PokemonSpeciesProfiler.profileAll(['slowpoke','slowbro','slowking'].map((slug) => species(slug)), '2026-08-14T12:00:00.000Z');
    assert.notEqual(slowpoke.evaluationProfile.candidates[0].id, 'versatile');
    assert.equal(slowpoke.evaluationProfile.evolutionPotential.length, 2);
});

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
    assert.equal(PokemonSpeciesProfiler.needsReprofile({ items:[{ evaluationProfile:{ schemaVersion:PokemonRoleRules.SCHEMA_VERSION, rulesVersion:PokemonRoleRules.ROLE_RULES_VERSION, evolutionVersion:PokemonSpeciesProfiler.EVOLUTION_PROFILE_VERSION } }] }), false);
    assert.equal(PokemonSpeciesProfiler.canReprofile([{ slug:'zubat', base:species('zubat').base }]), false);
    assert.equal(PokemonSpeciesProfiler.canReprofile([{ slug:'crobat', base:species('crobat').base, evo:null }]), true);
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
        showNatureFit:false, showMovesetFit:false, showAlternativeRole:false,
        showEvolutionPotential:false
    });
    const disabled = PokemonHelperStorage.mergeUiPreferences({ evaluation:{ enabled:false } });
    assert.equal(disabled.evaluation.enabled, false);
    assert.equal(disabled.evaluation.showCoreFields, true);
});

test('apresentação da compatibilidade da Nature localiza texto e cor', () => {
    const cases = [
        ['very_favorable', 'Muito favorável', 'var(--px-good)'],
        ['favorable', 'Favorável', 'var(--px-good)'],
        ['compatible', 'Compatível', 'var(--px-mid)'],
        ['neutral', 'Neutra', 'var(--px-mid)'],
        ['unfavorable', 'Desfavorável', 'var(--px-accent)'],
        ['conflicting', 'Conflitante', 'var(--px-bad)'],
        ['unexpected', 'Não determinada', 'var(--px-mid)']
    ];
    for (const [fit, label, color] of cases) {
        assert.deepEqual(PokemonEvaluation.natureFitPresentation(fit), { label, color });
    }
});

test('rótulo compacto de Função abrevia palavras completas sem mutar avaliação', () => {
    const result = { role:{ label:'Atacante misto / Suporte' } };
    assert.equal(PokemonEvaluation.roleDisplayLabel('Atacante físico ágil'), 'Atac. físico ágil');
    assert.equal(PokemonEvaluation.roleDisplayLabel('Suporte defensivo'), 'Sup. defensivo');
    assert.equal(PokemonEvaluation.roleDisplayLabel(result.role.label), 'Atac. misto / Sup.');
    assert.equal(PokemonEvaluation.roleDisplayLabel('Tank especial'), 'Tank especial');
    assert.equal(result.role.label, 'Atacante misto / Suporte');
});

test('card posiciona Compat. Natureza após Natureza e Tendência Evol. por último', () => {
    const viewModel = {
        natureName:'Adamant', ability:'inner-focus', heldItem:'—',
        evaluation:{
            role:{ label:'Atacante físico ágil', tooltip:'Prioriza ATK e SPE.', confidence:'high', secondaryLabel:null },
            rating:{ label:'Bom', slug:'bom', score:70 },
            nature:{ fit:'favorable' }, moveset:{ fit:'unknown' },
            evolutionTrend:{ species:'crobat', role:{ label:'Atacante físico rápido' }, rating:{ label:'Bom', score:70 }, path:['crobat'] }
        }
    };
    const preferences = { enabled:true, showCoreFields:true, showNatureFit:true, showConfidence:true, showEvolutionPotential:true };
    const html = PokemonCard.detailRows(viewModel, {
        afterNatureRows:PokemonCard.natureFitRow(viewModel, preferences),
        afterRows:PokemonCard.evaluationRows(viewModel, preferences)
    });
    assert.ok(html.indexOf('Natureza') < html.indexOf('Compat. Natureza'));
    assert.ok(html.indexOf('Compat. Natureza') < html.indexOf('Habilidade'));
    assert.match(html, /Função<\/span><span class="detail-val"><span[^>]*>Atac\. físico ágil<\/span>/);
    assert.equal(html.includes('Atacante físico ágil</span></div>'), false);
    assert.ok(html.lastIndexOf('Tendência Evol.') > html.lastIndexOf('Confiança'));
    assert.match(html, /detail-row detail-row--evolution/);
});

test('grade do Encontro expande Tendência Evol. somente quando fica isolada', () => {
    const result = {
        evolutionTrend:{ species:'crobat', role:{ label:'Atacante físico rápido' }, rating:{ label:'Bom', score:70 }, path:['crobat'] }
    };
    const render = (presentation, wide) => `${presentation.key}:${wide ? 'wide' : 'normal'}`;
    assert.deepEqual(
        PokemonEvaluation.appendEvolutionGridCell(['habilidade', 'natureza'], result, render),
        ['habilidade', 'natureza', 'Tendência Evol.:wide']
    );
    assert.deepEqual(
        PokemonEvaluation.appendEvolutionGridCell(['habilidade'], result, render),
        ['habilidade', 'Tendência Evol.:normal']
    );
    assert.deepEqual(PokemonEvaluation.appendEvolutionGridCell(['habilidade'], {}, render), ['habilidade']);
});

test('integração carrega o profiler e oferece diagnóstico opcional compartilhado', () => {
    const background = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
    assert.match(background, /data\/pokemon-species-profiler\.js/);
    const firefox = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.firefox.json'), 'utf8'));
    assert.ok(firefox.background.scripts.includes('data/pokemon-species-profiler.js'));
    const settings = fs.readFileSync(path.join(ROOT, 'components/settings-panel.js'), 'utf8');
    assert.match(settings, /ph-eval-evolution/);
    assert.match(settings, /showEvolutionPotential/);
    const card = fs.readFileSync(path.join(ROOT, 'components/pokemon-card.js'), 'utf8');
    assert.match(card, /showEvolutionPotential/);
    assert.match(card, /PokemonEvaluation\.evolutionPresentation/);
});

process.on('exit', () => {
    if (!process.exitCode) process.stdout.write('Avaliação Pokémon: todos os testes passaram.\n');
});
