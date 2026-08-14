var PokemonEvaluation = globalThis.PokemonEvaluation || (() => {
    const clampIv = (value) => Math.min(31, Math.max(0, Number(value) || 0));
    const clampScore = (value) => Math.min(100, Math.max(0, Math.round(value)));
    const statLabel = (stat) => String(stat || '').toUpperCase();
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[char]);

    function movesetSummary(moves) {
        const damaging = (Array.isArray(moves) ? moves : []).filter((move) => move && move.category !== 'status' && Number(move.power || 1) > 0);
        const physical = damaging.filter((move) => move.category === 'physical').length;
        const special = damaging.filter((move) => move.category === 'special').length;
        return { physical, special, status:(Array.isArray(moves) ? moves : []).filter((move) => move?.category === 'status').length, known:damaging.length > 0 };
    }

    function selectRole(pokemon, profile) {
        const candidates = Array.isArray(profile?.candidates) && profile.candidates.length
            ? profile.candidates : [{ id:'versatile', confidence:'low', score:0, reasons:['missing_profile'] }];
        const base = candidates[0];
        const summary = movesetSummary(pokemon?.moves);
        let id = base.id;
        if (['mixed_fast_attacker', 'versatile'].includes(id) && summary.known && summary.physical !== summary.special) {
            id = summary.physical > summary.special ? 'physical_fast_attacker' : 'special_fast_attacker';
        }
        const definition = PokemonRoleRules.role(id);
        const confidence = !profile ? 'low' : summary.known && base.confidence === 'high' ? 'high' : base.confidence || 'medium';
        return { definition, confidence, candidates, summary };
    }

    function natureFor(pokemon, role) {
        const effect = typeof getNatureEffect === 'function' ? getNatureEffect(pokemon?.nature) : null;
        if (!effect || effect.increases === effect.decreases) return { fit:'neutral', adjustment:0 };
        const increase = String(effect.increases).toLowerCase();
        const decrease = String(effect.decreases).toLowerCase();
        const primary = new Set(role.primaryStats);
        const incPrimary = primary.has(increase);
        const decPrimary = primary.has(decrease);
        const incIrrelevant = (role.weights[increase] || 0) === 0;
        const decIrrelevant = (role.weights[decrease] || 0) === 0;
        let fit = 'compatible';
        if (incPrimary && decIrrelevant) fit = 'very_favorable';
        else if (incPrimary && !decPrimary) fit = 'favorable';
        else if (decPrimary && incIrrelevant) fit = 'conflicting';
        else if (decPrimary) fit = 'unfavorable';
        return { fit, adjustment:PokemonRoleRules.NATURE_ADJUSTMENTS[fit] || 0 };
    }

    function movesetFit(roleId, summary) {
        if (!summary.known) return { fit:'unknown', confidence:'low' };
        const physical = roleId.startsWith('physical_');
        const special = roleId.startsWith('special_');
        const mixed = roleId.startsWith('mixed_') || roleId === 'versatile' || roleId === 'offensive_pivot';
        const fit = physical ? (summary.physical >= summary.special ? 'compatible' : 'incompatible')
            : special ? (summary.special >= summary.physical ? 'compatible' : 'incompatible')
                : mixed && summary.physical && summary.special ? 'compatible' : 'partial';
        return { fit, confidence:'high' };
    }

    function fingerprint(pokemon) {
        const moves = (Array.isArray(pokemon?.moves) ? pokemon.moves : []).map((move) => [move?.slug || move?.name || '', move?.category || '', Number(move?.power) || 0]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        const statsObject = (source) => Object.fromEntries(PokemonRoleRules.STATS.map((stat) => [stat, Number(source?.[stat]) || 0]));
        return JSON.stringify({
            species:String(pokemon?.species || pokemon?.name || '').toLowerCase(),
            ivs:statsObject(pokemon?.ivs), evs:statsObject(pokemon?.evs),
            nature:String(pokemon?.nature || '').toLowerCase(), ability:String(pokemon?.ability || '').toLowerCase(), moves
        });
    }

    function evaluate(pokemon, profile) {
        const selected = selectRole(pokemon, profile);
        const role = selected.definition;
        const ivs = Object.fromEntries(PokemonRoleRules.STATS.map((stat) => [stat, clampIv(pokemon?.ivs?.[stat])]));
        const nature = natureFor(pokemon, role);
        let score = PokemonRoleRules.STATS.reduce((sum, stat) => sum + (ivs[stat] / 31) * role.weights[stat], 0) + nature.adjustment;
        const essential = role.primaryStats.map((stat) => ivs[stat]);
        const minimum = Math.min(...essential);
        if (minimum <= 5) score = Math.min(score - 20, 39);
        else if (minimum <= 15) score = Math.min(score, 74);
        score = clampScore(score);
        const band = PokemonRoleRules.ratingFor(score);
        const secondary = selected.candidates.find((item) => item.id !== role.id);
        const secondaryLabel = secondary ? PokemonRoleRules.role(secondary.id).label : null;
        const primaryText = role.primaryStats.map(statLabel).join(' e ');
        const secondaryText = role.secondaryStats.map(statLabel).join(', ');
        return Object.freeze({
            schemaVersion:PokemonRoleRules.SCHEMA_VERSION,
            role:Object.freeze({ id:role.id, label:role.label, secondaryLabel, confidence:selected.confidence, primaryStats:[...role.primaryStats], secondaryStats:[...role.secondaryStats], tooltip:`Prioriza ${primaryText}${secondaryText ? `; ${secondaryText} é complementar.` : '.'}` }),
            rating:Object.freeze({ score, label:band.label, slug:band.slug, sortValue:score }),
            nature:Object.freeze(nature), moveset:Object.freeze(movesetFit(role.id, selected.summary)),
            alternatives:selected.candidates.filter((item) => item.id !== role.id).map((item) => ({ roleId:item.id, score:Math.round(item.score * 100) })),
            ivPercent:Math.round(PokemonRoleRules.STATS.reduce((sum, stat) => sum + ivs[stat], 0) / (31 * PokemonRoleRules.STATS.length) * 100),
            fingerprint:fingerprint(pokemon), ivs:Object.freeze(ivs)
        });
    }

    function ratingHTML(result) {
        return `<span class="iv-rating" data-rating="${escapeHtml(result?.rating?.slug || 'ruim')}">${escapeHtml(result?.rating?.label || 'Ruim')}</span>`;
    }
    function roleHTML(result) {
        return `<span data-tip="${escapeHtml(result?.role?.tooltip || '')}">${escapeHtml(result?.role?.label || 'Versátil')}</span>`;
    }
    function createCache() {
        const entries = new Map();
        return {
            evaluate(pokemon, profile) {
                const id = String(pokemon?.id ?? `${pokemon?.species || pokemon?.name || 'unknown'}:${pokemon?.level || 0}`);
                const signature = `${fingerprint(pokemon)}|${profile?.rulesVersion || 0}|${profile?.candidates?.[0]?.id || ''}`;
                const existing = entries.get(id);
                if (existing?.signature === signature) return existing.result;
                const result = evaluate(pokemon, profile);
                entries.set(id, { signature, result });
                return result;
            },
            retain(ids) { const keep = new Set((ids || []).map(String)); for (const key of entries.keys()) if (!keep.has(key)) entries.delete(key); },
            clear() { entries.clear(); },
            get size() { return entries.size; }
        };
    }

    return Object.freeze({ evaluate, fingerprint, ratingHTML, roleHTML, createCache });
})();
globalThis.PokemonEvaluation = PokemonEvaluation;
