const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(file, context = {}) {
    const sandbox = { console, ...context };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename:file });
    return sandbox;
}

function test(name, fn) {
    try { fn(); process.stdout.write(`PASS ${name}\n`); }
    catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test('preferências novas são seguras e migram configurações antigas', () => {
    const chrome = { storage:{ local:{ get(){}, set(){} } }, runtime:{} };
    const { PokemonHelperStorage: storage } = load('data/extension-storage.js', { chrome });
    const prefs = storage.mergeUiPreferences({ screens:{ myPokemons:{} } });
    assert.equal(prefs.auctionRequestsEnabled, false);
    assert.equal(prefs.theme, 'dark');
    assert.equal(prefs.screens.myPokemons.showStatsWithIvs, false);
    assert.equal(storage.DEFAULT_OVERLAY_SETTINGS.panelLocked, false);
});

test('geometria mantém o cabeçalho acessível e recupera números inválidos', () => {
    const { PokemonHelperPanelPosition: position } = load('components/panel-position.js');
    assert.deepEqual(JSON.parse(JSON.stringify(position.clamp({ top:-20, right:-40, width:300, height:360 }, { width:800, height:600 }, { headerHeight:30 }))),
        { top:0, right:0, width:300, height:360 });
    assert.equal(position.clamp({ top:999, right:999, width:300, height:360 }, { width:800, height:600 }, { headerHeight:30 }).top, 570);
    assert.deepEqual(position.clamp({ top:NaN, right:NaN, width:300, height:360 }, { width:800, height:600 }, { headerHeight:30 }).top, 16);
});

test('tema normaliza valores e aplica atributo no elemento indicado', () => {
    const root = { dataset:{} };
    const document = { documentElement:root };
    const { PokemonHelperTheme: theme } = load('components/theme.js', { document });
    assert.equal(theme.normalize('sepia'), 'dark');
    assert.equal(theme.apply('light', root), 'light');
    assert.equal(root.dataset.theme, 'light');
});

test('habilidades são normalizadas e deduplicadas pelo slug', () => {
    const { PokemonFilters: filters } = load('components/pokemon-filters.js');
    assert.deepEqual(Array.from(filters.defaultValues().abilitySlugs), []);
    assert.deepEqual(JSON.parse(JSON.stringify(filters.normalizeAbilityOptions([
        { slug:'Magic Guard', label:'Magic Guard' }, { slug:'magic-guard', label:'Duplicada' }, { slug:'LEVITATE', label:'Levitate' }
    ]))), [
        { slug:'levitate', label:'Levitate' }, { slug:'magic-guard', label:'Magic Guard' }
    ]);
});

test('toggle de habilidades altera só a visibilidade e preserva a seleção', () => {
    const { PokemonFilters: filters } = load('components/pokemon-filters.js');
    const section = { hidden:false, querySelectorAll:() => [{ selected:true }, { selected:false }] };
    const toggle = { checked:false, attributes:{}, setAttribute(name, value) { this.attributes[name] = value; } };
    filters.setAbilitySectionExpanded(section, toggle, false);
    assert.equal(section.hidden, true);
    assert.equal(toggle.attributes['aria-expanded'], 'false');
    assert.deepEqual(section.querySelectorAll().map((option) => option.selected), [true, false]);
    filters.setAbilitySectionExpanded(section, toggle, true);
    assert.equal(section.hidden, false);
    assert.equal(toggle.attributes['aria-expanded'], 'true');
});

test('grade compartilhada mostra status somente quando solicitado', () => {
    const { PokemonCard: card } = load('components/pokemon-card.js', { PokemonEvaluation:{} });
    const model = { ivs:{ hp:31,atk:1,def:2,spa:3,spd:4,spe:5 }, stats:{ hp:120,atk:21,def:22,spa:23,spd:24,spe:25 } };
    assert.doesNotMatch(card.ivGrid(model), /120/);
    assert.match(card.ivGrid(model, { showStats:true }), /120/);
});

if (!process.exitCode) process.stdout.write('Roadmap: todos os testes passaram.\n');
