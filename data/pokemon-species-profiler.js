var PokemonSpeciesProfiler = globalThis.PokemonSpeciesProfiler || (() => {
    const clamp = (value, min = 0, max = 255) => Math.min(max, Math.max(min, Number(value) || 0));
    const normalizeSlug = (value) => String(value || '').trim().toLowerCase().replace(/[ _]+/g, '-');
    const candidate = (id, score, confidence, reasons = []) => {
        const role = PokemonRoleRules.role(id);
        return Object.freeze({
            id, score: Math.min(1, Math.max(0, Math.round(score * 100) / 100)), confidence,
            primaryStats: [...role.primaryStats], secondaryStats: [...role.secondaryStats], reasons
        });
    };

    function profileSpecies(species, generatedAt = new Date().toISOString()) {
        const slug = normalizeSlug(species?.slug || species?.name);
        const base = Object.fromEntries(PokemonRoleRules.STATS.map((stat) => [stat, clamp(species?.base?.[stat])]));
        const valid = PokemonRoleRules.STATS.every((stat) => base[stat] > 0);
        const specialRole = PokemonRoleRules.SPECIAL_CASES[slug];
        if (specialRole) return Object.freeze({
            schemaVersion: PokemonRoleRules.SCHEMA_VERSION, rulesVersion: PokemonRoleRules.ROLE_RULES_VERSION,
            generatedAt, candidates:[candidate(specialRole, 1, 'high', ['species_exception'])], specialCase:slug
        });
        if (!valid) return Object.freeze({
            schemaVersion: PokemonRoleRules.SCHEMA_VERSION, rulesVersion: PokemonRoleRules.ROLE_RULES_VERSION,
            generatedAt, candidates:[candidate('versatile', 0, 'low', ['missing_base_stats'])], specialCase:null
        });

        const offenseMax = Math.max(base.atk, base.spa);
        const attackGap = Math.abs(base.atk - base.spa);
        const balancedOffense = attackGap <= offenseMax * 0.1;
        const statRange = Math.max(...Object.values(base)) - Math.min(...Object.values(base));
        const avgDefense = (base.def + base.spd) / 2;
        const physicalBulk = Math.sqrt(base.hp * base.def);
        const specialBulk = Math.sqrt(base.hp * base.spd);
        const candidates = [];

        if (statRange <= 15 && balancedOffense) {
            candidates.push(candidate('versatile', 0.96, 'low', ['balanced_stats', 'balanced_offense']));
        } else if (balancedOffense && offenseMax >= 95 && base.spe >= 80) {
            candidates.push(candidate('mixed_fast_attacker', 0.94, 'high', ['balanced_offense', 'high_speed']));
        } else {
            const physical = base.atk > base.spa;
            const prefix = physical ? 'physical' : 'special';
            const highBulk = base.hp >= 80 && avgDefense >= 75;
            const roleId = base.spe >= 90
                ? `${prefix}_fast_attacker`
                : highBulk && base.hp >= 100
                    ? `${prefix}_bulky_attacker`
                    : base.spe <= 55 ? `${prefix}_slow_attacker` : highBulk ? `${prefix}_bulky_attacker` : `${prefix}_slow_attacker`;
            candidates.push(candidate(roleId, 0.9, attackGap >= 20 ? 'high' : 'medium', [physical ? 'physical_offense' : 'special_offense', base.spe >= 90 ? 'high_speed' : base.spe <= 55 ? 'low_speed' : 'good_bulk']));
        }

        if (base.hp >= 80 && physicalBulk >= 90) candidates.push(candidate('physical_tank', 0.76, 'medium', ['physical_bulk']));
        if (base.hp >= 80 && specialBulk >= 90) candidates.push(candidate('special_tank', 0.76, 'medium', ['special_bulk']));
        if (base.hp >= 80 && Math.min(physicalBulk, specialBulk) >= 85) candidates.push(candidate('mixed_tank', 0.78, 'medium', ['mixed_bulk']));
        if (avgDefense >= offenseMax * 0.9 || (base.spd >= offenseMax && base.spe <= 80)) candidates.push(candidate('defensive_support', 0.7, 'medium', ['defenses_match_offense']));

        const abilityTags = (species?.abilities || []).flatMap(PokemonRoleRules.abilityTags);
        if (abilityTags.includes('pivot') && base.spe >= 80) candidates.push(candidate('offensive_pivot', 0.82, 'medium', ['pivot_ability', 'good_speed']));

        const unique = [...new Map(candidates.map((item) => [item.id, item])).values()];
        return Object.freeze({
            schemaVersion: PokemonRoleRules.SCHEMA_VERSION, rulesVersion: PokemonRoleRules.ROLE_RULES_VERSION,
            generatedAt, candidates:unique, specialCase:null
        });
    }

    function profileAll(items, generatedAt = new Date().toISOString()) {
        return (Array.isArray(items) ? items : []).filter((item) => item?.slug || item?.name).map((item) => ({ ...item, evaluationProfile:profileSpecies(item, generatedAt) }));
    }

    function preparePokedexItems(items, generatedAt = new Date().toISOString()) {
        const sanitized = (Array.isArray(items) ? items : []).filter((item) => item?.slug).map((item) => ({
            slug: item.slug,
            name: item.name,
            catchRate: Number(item.catchRate) || 0,
            types: Array.isArray(item.types) ? [...item.types] : [],
            abilities: Array.isArray(item.abilities) ? [...item.abilities] : [],
            base: item.base && typeof item.base === 'object' ? { ...item.base } : null,
            levelMoves: Array.isArray(item.levelMoves)
                ? item.levelMoves.filter((move) => move?.slug && Number.isFinite(Number(move.lv))).map((move) => ({ lv:Number(move.lv), slug:move.slug }))
                : []
        }));
        return profileAll(sanitized, generatedAt);
    }

    function needsReprofile(cached) {
        const items = Array.isArray(cached?.items) ? cached.items : [];
        return items.length > 0 && items.some((item) => item?.evaluationProfile?.schemaVersion !== PokemonRoleRules.SCHEMA_VERSION || item?.evaluationProfile?.rulesVersion !== PokemonRoleRules.ROLE_RULES_VERSION);
    }

    return Object.freeze({ profileSpecies, profileAll, preparePokedexItems, needsReprofile });
})();
globalThis.PokemonSpeciesProfiler = PokemonSpeciesProfiler;
