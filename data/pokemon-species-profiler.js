var PokemonSpeciesProfiler = globalThis.PokemonSpeciesProfiler || (() => {
    const EVOLUTION_PROFILE_VERSION = 1;
    const clamp = (value, min = 0, max = 255) => Math.min(max, Math.max(min, Number(value) || 0));
    const normalizeSlug = (value) => String(value || '').trim().toLowerCase().replace(/[ _]+/g, '-');
    const baseFor = (species) => Object.fromEntries(PokemonRoleRules.STATS.map((stat) => [stat, clamp(species?.base?.[stat])]));
    const validBase = (base) => PokemonRoleRules.STATS.every((stat) => base[stat] > 0);
    const evolutionTargets = (species) => (Array.isArray(species?.evo) ? species.evo : []).map((item) => normalizeSlug(item?.slug || item?.name)).filter(Boolean);
    const candidate = (id, score, confidence, reasons = []) => {
        const role = PokemonRoleRules.role(id);
        return Object.freeze({ id, score:Math.min(1, Math.max(0, Math.round(score * 100) / 100)), confidence, primaryStats:[...role.primaryStats], secondaryStats:[...role.secondaryStats], reasons });
    };

    function buildPopulationStats(items) {
        const valid = (Array.isArray(items) ? items : []).map(baseFor).filter(validBase);
        const sorted = Object.fromEntries(PokemonRoleRules.STATS.map((stat) => [stat, valid.map((base) => base[stat]).sort((a, b) => a - b)]));
        const percentile = (stat, raw) => {
            const values = sorted[stat] || [];
            if (!values.length) return null;
            let low = 0; let high = values.length;
            while (low < high) { const mid = (low + high) >> 1; if (values[mid] <= raw) low = mid + 1; else high = mid; }
            return low / values.length;
        };
        return Object.freeze({ count:valid.length, percentile });
    }

    function speedSignals(base, populationStats) {
        const values = Object.values(base);
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const relativeToMean = base.spe / mean;
        const relativeToMax = base.spe / Math.max(...values);
        const percentile = populationStats?.count >= 10 ? populationStats.percentile('spe', base.spe) : null;
        const t = PokemonRoleRules.SPEED_THRESHOLDS;
        const fast = percentile == null ? base.spe >= 90 : percentile >= t.fastPercentile && relativeToMean >= t.fastRelativeMean;
        const agile = relativeToMax >= t.agileRelativeMax && relativeToMean >= t.agileRelativeMean;
        const slow = (percentile == null ? base.spe <= 55 : percentile <= t.slowPercentile) && relativeToMean <= t.slowRelativeMean && relativeToMax <= t.slowRelativeMax;
        return Object.freeze({ raw:base.spe, relativeToMean, relativeToMax, percentile, fast, agile, slow });
    }

    function profileSpecies(species, contextOrGeneratedAt, maybeGeneratedAt) {
        const context = contextOrGeneratedAt && typeof contextOrGeneratedAt === 'object' ? contextOrGeneratedAt : {};
        const generatedAt = typeof contextOrGeneratedAt === 'string' ? contextOrGeneratedAt : (maybeGeneratedAt || new Date().toISOString());
        const slug = normalizeSlug(species?.slug || species?.name);
        const base = baseFor(species);
        const common = { schemaVersion:PokemonRoleRules.SCHEMA_VERSION, rulesVersion:PokemonRoleRules.ROLE_RULES_VERSION, generatedAt, evolutionVersion:EVOLUTION_PROFILE_VERSION };
        const emptyEvolution = { evolutionTrend:null, evolutionPotential:[] };
        const specialRole = PokemonRoleRules.SPECIAL_CASES[slug];
        if (specialRole) return Object.freeze({ ...common, candidates:[candidate(specialRole, 1, 'high', ['species_exception'])], specialCase:slug, indicators:null, ...emptyEvolution });
        if (!validBase(base)) return Object.freeze({ ...common, candidates:[candidate('versatile', 0, 'low', ['missing_base_stats'])], specialCase:null, indicators:null, ...emptyEvolution });

        const offenseMax = Math.max(base.atk, base.spa);
        const attackGap = Math.abs(base.atk - base.spa);
        const balancedOffense = attackGap <= offenseMax * 0.1;
        const statRange = Math.max(...Object.values(base)) - Math.min(...Object.values(base));
        const avgDefense = (base.def + base.spd) / 2;
        const physicalBulk = Math.sqrt(base.hp * base.def);
        const specialBulk = Math.sqrt(base.hp * base.spd);
        const speed = speedSignals(base, context.populationStats);
        const candidates = [];
        const openPotentialRole = PokemonRoleRules.OPEN_POTENTIAL_CASES[slug];
        const developingSupport = base.hp <= 60 && offenseMax <= 70 && avgDefense >= offenseMax * 0.85 && !speed.agile;

        if (openPotentialRole) candidates.push(candidate(openPotentialRole, 0.96, 'low', ['species_exception', 'open_potential']));
        else if (developingSupport) candidates.push(candidate('defensive_support', 0.92, 'medium', ['low_offense', 'supporting_bulk']));
        else if (statRange <= 15 && balancedOffense) candidates.push(candidate('versatile', 0.96, 'low', ['balanced_stats', 'balanced_offense']));
        else {
            const prefix = balancedOffense ? 'mixed' : base.atk > base.spa ? 'physical' : 'special';
            const highBulk = base.hp >= 80 && (avgDefense >= 75 || (base.hp >= 100 && avgDefense >= 65));
            const roleId = speed.fast ? `${prefix}_fast_attacker`
                : speed.agile ? `${prefix}_agile_attacker`
                    : highBulk && base.hp >= 100 ? `${prefix}_bulky_attacker`
                        : speed.slow ? `${prefix}_slow_attacker`
                            : highBulk ? `${prefix}_bulky_attacker` : `${prefix}_attacker`;
            const speedReason = speed.fast ? 'high_speed' : speed.agile ? 'relative_speed' : speed.slow ? 'low_speed' : 'neutral_speed';
            candidates.push(candidate(roleId, 0.9, attackGap >= 20 || balancedOffense ? 'high' : 'medium', [balancedOffense ? 'balanced_offense' : base.atk > base.spa ? 'physical_offense' : 'special_offense', speedReason]));
            if (prefix === 'mixed') {
                const suffix = roleId.slice('mixed_'.length);
                candidates.push(candidate(`physical_${suffix}`, 0.86, 'medium', ['balanced_offense', 'physical_variant', speedReason]));
                candidates.push(candidate(`special_${suffix}`, 0.86, 'medium', ['balanced_offense', 'special_variant', speedReason]));
            }
        }

        if (base.hp >= 80 && physicalBulk >= 90) candidates.push(candidate('physical_tank', 0.76, 'medium', ['physical_bulk']));
        if (base.hp >= 80 && specialBulk >= 90) candidates.push(candidate('special_tank', 0.76, 'medium', ['special_bulk']));
        if (base.hp >= 80 && Math.min(physicalBulk, specialBulk) >= 85) candidates.push(candidate('mixed_tank', 0.78, 'medium', ['mixed_bulk']));
        if (avgDefense >= offenseMax * 0.9 || (base.spd >= offenseMax && !speed.fast)) candidates.push(candidate('defensive_support', 0.7, 'medium', ['defenses_match_offense']));
        const abilityTags = (species?.abilities || []).flatMap(PokemonRoleRules.abilityTags);
        if (abilityTags.includes('pivot') && (speed.fast || speed.agile)) candidates.push(candidate('offensive_pivot', 0.82, 'medium', ['pivot_ability', 'relevant_speed']));
        return Object.freeze({ ...common, candidates:[...new Map(candidates.map((item) => [item.id, item])).values()], specialCase:null, indicators:Object.freeze({ speed, physicalBulk, specialBulk }), ...emptyEvolution });
    }

    function profileAll(items, generatedAt = new Date().toISOString()) {
        const source = (Array.isArray(items) ? items : []).filter((item) => item?.slug || item?.name);
        const speciesBySlug = new Map(source.map((item) => [normalizeSlug(item.slug || item.name), item]));
        const context = { populationStats:buildPopulationStats(source), speciesBySlug };
        const firstPass = source.map((item) => ({ ...item, evaluationProfile:profileSpecies(item, context, generatedAt) }));
        const profileBySlug = new Map(firstPass.map((item) => [normalizeSlug(item.slug || item.name), item.evaluationProfile]));
        const finalTargetsFor = (start) => {
            const results = [];
            const visit = (current, path, visited) => {
                if (visited.has(current) || path.length > speciesBySlug.size) return;
                const next = evolutionTargets(speciesBySlug.get(current)).filter((target) => speciesBySlug.has(target));
                if (!next.length) { if (current !== start) results.push(Object.freeze({ species:current, path:Object.freeze([...path]) })); return; }
                const seen = new Set(visited); seen.add(current);
                next.forEach((target) => visit(target, [...path, target], seen));
            };
            visit(start, [], new Set());
            return [...new Map(results.map((item) => [item.species, item])).values()];
        };
        return firstPass.map((item) => {
            const slug = normalizeSlug(item.slug || item.name);
            const finals = finalTargetsFor(slug).map((target) => Object.freeze({ ...target, roleId:profileBySlug.get(target.species)?.candidates?.[0]?.id || 'versatile', confidence:profileBySlug.has(target.species) ? 'high' : 'low' }));
            const branched = finals.length > 1;
            const evaluationProfile = Object.freeze({ ...item.evaluationProfile, evolutionTrend:!branched && finals.length === 1 ? finals[0] : null, evolutionPotential:branched ? finals : [] });
            return { ...item, evaluationProfile };
        });
    }

    function preparePokedexItems(items, generatedAt = new Date().toISOString()) {
        const sanitized = (Array.isArray(items) ? items : []).filter((item) => item?.slug).map((item) => ({
            slug:item.slug, name:item.name, catchRate:Number(item.catchRate) || 0,
            types:Array.isArray(item.types) ? [...item.types] : [], abilities:Array.isArray(item.abilities) ? [...item.abilities] : [],
            prevo:item.prevo && typeof item.prevo === 'object' ? { slug:item.prevo.slug, name:item.prevo.name } : null,
            evo:Array.isArray(item.evo) ? item.evo.filter((entry) => entry?.slug).map((entry) => ({ slug:entry.slug, name:entry.name, level:Number(entry.level) || 0, via:entry.via || '' })) : null,
            base:item.base && typeof item.base === 'object' ? { ...item.base } : null,
            levelMoves:Array.isArray(item.levelMoves) ? item.levelMoves.filter((move) => move?.slug && Number.isFinite(Number(move.lv))).map((move) => ({ lv:Number(move.lv), slug:move.slug })) : []
        }));
        return profileAll(sanitized, generatedAt);
    }

    function needsReprofile(cached) {
        const items = Array.isArray(cached?.items) ? cached.items : [];
        return items.length > 0 && items.some((item) => item?.evaluationProfile?.schemaVersion !== PokemonRoleRules.SCHEMA_VERSION || item?.evaluationProfile?.rulesVersion !== PokemonRoleRules.ROLE_RULES_VERSION || item?.evaluationProfile?.evolutionVersion !== EVOLUTION_PROFILE_VERSION);
    }

    function canReprofile(items) {
        return (Array.isArray(items) ? items : []).every((item) => Object.prototype.hasOwnProperty.call(item || {}, 'evo'));
    }

    return Object.freeze({ EVOLUTION_PROFILE_VERSION, profileSpecies, profileAll, preparePokedexItems, buildPopulationStats, needsReprofile, canReprofile });
})();
globalThis.PokemonSpeciesProfiler = PokemonSpeciesProfiler;
