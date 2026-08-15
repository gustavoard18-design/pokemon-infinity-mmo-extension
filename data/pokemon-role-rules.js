var PokemonRoleRules = globalThis.PokemonRoleRules || (() => {
    const SCHEMA_VERSION = 1;
    const ROLE_RULES_VERSION = 2;
    const STATS = Object.freeze(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);

    const defineRole = (id, label, weights, primaryStats, secondaryStats = []) => Object.freeze({
        id, label, weights: Object.freeze(weights),
        primaryStats: Object.freeze(primaryStats), secondaryStats: Object.freeze(secondaryStats)
    });

    const ROLES = Object.freeze({
        physical_attacker: defineRole('physical_attacker', 'Atacante físico', { hp:15, atk:50, def:10, spa:0, spd:10, spe:15 }, ['atk'], ['hp', 'spe']),
        special_attacker: defineRole('special_attacker', 'Atacante especial', { hp:15, atk:0, def:10, spa:50, spd:10, spe:15 }, ['spa'], ['hp', 'spe']),
        mixed_attacker: defineRole('mixed_attacker', 'Atacante misto', { hp:10, atk:30, def:10, spa:30, spd:10, spe:10 }, ['atk', 'spa'], ['hp', 'spe']),
        physical_fast_attacker: defineRole('physical_fast_attacker', 'Atacante físico rápido', { hp:10, atk:40, def:5, spa:0, spd:5, spe:40 }, ['atk', 'spe'], ['hp']),
        special_fast_attacker: defineRole('special_fast_attacker', 'Atacante especial rápido', { hp:10, atk:0, def:5, spa:40, spd:5, spe:40 }, ['spa', 'spe'], ['hp']),
        mixed_fast_attacker: defineRole('mixed_fast_attacker', 'Atacante misto rápido', { hp:5, atk:30, def:5, spa:30, spd:5, spe:25 }, ['atk', 'spa'], ['spe']),
        physical_agile_attacker: defineRole('physical_agile_attacker', 'Atacante físico ágil', { hp:10, atk:40, def:5, spa:0, spd:5, spe:40 }, ['atk', 'spe'], ['hp']),
        special_agile_attacker: defineRole('special_agile_attacker', 'Atacante especial ágil', { hp:10, atk:0, def:5, spa:40, spd:5, spe:40 }, ['spa', 'spe'], ['hp']),
        mixed_agile_attacker: defineRole('mixed_agile_attacker', 'Atacante misto ágil', { hp:5, atk:30, def:5, spa:30, spd:5, spe:25 }, ['atk', 'spa', 'spe'], ['hp']),
        physical_bulky_attacker: defineRole('physical_bulky_attacker', 'Atacante físico resistente', { hp:25, atk:35, def:15, spa:0, spd:15, spe:10 }, ['atk', 'hp'], ['def', 'spd']),
        special_bulky_attacker: defineRole('special_bulky_attacker', 'Atacante especial resistente', { hp:25, atk:0, def:15, spa:35, spd:15, spe:10 }, ['spa', 'hp'], ['def', 'spd']),
        mixed_bulky_attacker: defineRole('mixed_bulky_attacker', 'Atacante misto resistente', { hp:25, atk:25, def:10, spa:25, spd:10, spe:5 }, ['atk', 'spa', 'hp'], ['def', 'spd']),
        physical_slow_attacker: defineRole('physical_slow_attacker', 'Atacante físico lento', { hp:25, atk:45, def:15, spa:0, spd:15, spe:0 }, ['atk', 'hp'], ['def', 'spd']),
        special_slow_attacker: defineRole('special_slow_attacker', 'Atacante especial lento', { hp:25, atk:0, def:15, spa:45, spd:15, spe:0 }, ['spa', 'hp'], ['def', 'spd']),
        mixed_slow_attacker: defineRole('mixed_slow_attacker', 'Atacante misto lento', { hp:25, atk:30, def:7.5, spa:30, spd:7.5, spe:0 }, ['atk', 'spa', 'hp'], ['def', 'spd']),
        physical_tank: defineRole('physical_tank', 'Tank físico', { hp:35, atk:5, def:40, spa:0, spd:15, spe:5 }, ['hp', 'def'], ['spd']),
        special_tank: defineRole('special_tank', 'Tank especial', { hp:35, atk:0, def:15, spa:5, spd:40, spe:5 }, ['hp', 'spd'], ['def']),
        mixed_tank: defineRole('mixed_tank', 'Tank misto', { hp:35, atk:0, def:27.5, spa:0, spd:27.5, spe:10 }, ['hp', 'def', 'spd'], ['spe']),
        fast_support: defineRole('fast_support', 'Suporte rápido', { hp:25, atk:0, def:15, spa:0, spd:15, spe:45 }, ['spe', 'hp'], ['def', 'spd']),
        defensive_support: defineRole('defensive_support', 'Suporte defensivo', { hp:35, atk:0, def:25, spa:0, spd:25, spe:15 }, ['hp', 'def', 'spd'], ['spe']),
        offensive_pivot: defineRole('offensive_pivot', 'Pivô ofensivo', { hp:20, atk:25, def:10, spa:20, spd:10, spe:15 }, ['hp', 'spe'], ['atk', 'spa']),
        versatile: defineRole('versatile', 'Versátil', { hp:20, atk:15, def:15, spa:15, spd:15, spe:20 }, ['hp', 'spe'], ['atk', 'def', 'spa', 'spd']),
        special_case: defineRole('special_case', 'Função especial', { hp:20, atk:20, def:15, spa:15, spd:15, spe:15 }, ['hp', 'atk'], ['def', 'spa', 'spd', 'spe'])
    });

    const RATING_BANDS = Object.freeze([
        Object.freeze({ min:90, label:'Excelente', slug:'excelente' }),
        Object.freeze({ min:75, label:'Muito bom', slug:'muito-bom' }),
        Object.freeze({ min:60, label:'Bom', slug:'bom' }),
        Object.freeze({ min:40, label:'Regular', slug:'regular' }),
        Object.freeze({ min:0, label:'Ruim', slug:'ruim' })
    ]);
    const NATURE_ADJUSTMENTS = Object.freeze({ very_favorable:5, favorable:3, neutral:0, compatible:0, unfavorable:-5, conflicting:-8 });
    const ABILITY_TAGS = Object.freeze({
        'magic-guard': Object.freeze(['indirect_damage_immunity']), regenerator: Object.freeze(['recovery']),
        intimidate: Object.freeze(['pivot', 'physical_bulk']), levitate: Object.freeze(['pivot']),
        'iron-fist': Object.freeze(['physical_offense']), 'no-guard': Object.freeze(['offense']),
        'thick-fat': Object.freeze(['mixed_bulk']), 'wonder-guard': Object.freeze(['special_case'])
    });
    const SPECIAL_CASES = Object.freeze({ ditto:'special_case', shedinja:'special_case' });
    const OPEN_POTENTIAL_CASES = Object.freeze({ eevee:'versatile' });
    const SPEED_THRESHOLDS = Object.freeze({ fastPercentile:0.75, fastRelativeMean:1.1, agileRelativeMax:0.9, agileRelativeMean:1.15, slowPercentile:0.35, slowRelativeMean:0.85, slowRelativeMax:0.75 });
    const ROLE_TIE_MARGIN = 0.05;
    const role = (id) => ROLES[id] || ROLES.versatile;
    const ratingFor = (score) => RATING_BANDS.find((band) => Number(score) >= band.min) || RATING_BANDS.at(-1);
    const abilityTags = (slug) => [...(ABILITY_TAGS[String(slug || '').toLowerCase()] || [])];

    return Object.freeze({ SCHEMA_VERSION, ROLE_RULES_VERSION, STATS, ROLES, RATING_BANDS, NATURE_ADJUSTMENTS, ABILITY_TAGS, SPECIAL_CASES, OPEN_POTENTIAL_CASES, SPEED_THRESHOLDS, ROLE_TIE_MARGIN, role, ratingFor, abilityTags });
})();
globalThis.PokemonRoleRules = PokemonRoleRules;
