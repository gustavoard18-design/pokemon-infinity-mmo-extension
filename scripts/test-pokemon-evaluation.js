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

process.on('exit', () => {
    if (!process.exitCode) process.stdout.write('Avaliação Pokémon: todos os testes passaram.\n');
});
