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
        const openPotential = base.reasons?.includes('open_potential');
        if (!openPotential && base.id.startsWith('mixed_') && summary.known && summary.physical !== summary.special) {
            const suffix = base.id.slice('mixed_'.length);
            const desired = `${summary.physical > summary.special ? 'physical' : 'special'}_${suffix}`;
            const alternative = candidates.find((item) => item.id === desired && base.score - item.score <= PokemonRoleRules.ROLE_TIE_MARGIN);
            if (alternative) id = alternative.id;
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

    function scoreForRole(ivs, role, natureAdjustment = 0) {
        let score = PokemonRoleRules.STATS.reduce((sum, stat) => sum + (ivs[stat] / 31) * role.weights[stat], 0) + natureAdjustment;
        const essential = role.primaryStats.map((stat) => ivs[stat]);
        const minimum = Math.min(...essential);
        if (minimum <= 5) score = Math.min(score - 20, 39);
        else if (minimum <= 15) score = Math.min(score, 74);
        return clampScore(score);
    }

    function evaluatedEvolution(target, ivs) {
        const role = PokemonRoleRules.role(target?.roleId);
        const score = scoreForRole(ivs, role);
        const band = PokemonRoleRules.ratingFor(score);
        return Object.freeze({
            species:String(target?.species || ''), path:Object.freeze([...(target?.path || [])]), confidence:target?.confidence || 'low',
            role:Object.freeze({ id:role.id, label:role.label, primaryStats:[...role.primaryStats] }),
            rating:Object.freeze({ score, label:band.label, slug:band.slug, sortValue:score })
        });
    }

    function evaluate(pokemon, profile) {
        const selected = selectRole(pokemon, profile);
        const role = selected.definition;
        const ivs = Object.fromEntries(PokemonRoleRules.STATS.map((stat) => [stat, clampIv(pokemon?.ivs?.[stat])]));
        const nature = natureFor(pokemon, role);
        const score = scoreForRole(ivs, role, nature.adjustment);
        const band = PokemonRoleRules.ratingFor(score);
        const secondary = selected.candidates.find((item) => item.id !== role.id);
        const secondaryLabel = secondary ? PokemonRoleRules.role(secondary.id).label : null;
        const primaryText = role.primaryStats.map(statLabel).join(' e ');
        const secondaryText = role.secondaryStats.map(statLabel).join(', ');
        const evolutionTrend = profile?.evolutionTrend ? evaluatedEvolution(profile.evolutionTrend, ivs) : null;
        const evolutionPotential = (profile?.evolutionPotential || []).map((target) => evaluatedEvolution(target, ivs)).sort((a, b) => b.rating.score - a.rating.score || a.species.localeCompare(b.species));
        return Object.freeze({
            schemaVersion:PokemonRoleRules.SCHEMA_VERSION,
            role:Object.freeze({ id:role.id, label:role.label, secondaryLabel, confidence:selected.confidence, primaryStats:[...role.primaryStats], secondaryStats:[...role.secondaryStats], tooltip:`Prioriza ${primaryText}${secondaryText ? `; ${secondaryText} é complementar.` : '.'}` }),
            rating:Object.freeze({ score, label:band.label, slug:band.slug, sortValue:score }),
            nature:Object.freeze(nature), moveset:Object.freeze(movesetFit(role.id, selected.summary)),
            alternatives:selected.candidates.filter((item) => item.id !== role.id).map((item) => ({ roleId:item.id, score:Math.round(item.score * 100) })),
            evolutionTrend, evolutionPotential:Object.freeze(evolutionPotential),
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
    function evolutionPresentation(result) {
        if (result?.evolutionTrend) {
            const item = result.evolutionTrend;
            return { key:'Tendência', value:`${item.species.toUpperCase()} — ${item.role.label}`, tooltip:`Compatibilidade ${item.rating.label} (${item.rating.score}/100). Caminho: ${item.path.join(' → ') || item.species}.` };
        }
        const items = result?.evolutionPotential || [];
        if (!items.length) return null;
        return { key:'Potencial evolutivo', value:`${items.length} possibilidades`, tooltip:items.map((item) => `${item.species.toUpperCase()}: ${item.role.label} — ${item.rating.label} (${item.rating.score}/100)`).join(' · ') };
    }
    function createCache() {
        const entries = new Map();
        return {
            evaluate(pokemon, profile) {
                const id = String(pokemon?.id ?? `${pokemon?.species || pokemon?.name || 'unknown'}:${pokemon?.level || 0}`);
                const signature = `${fingerprint(pokemon)}|${profile?.rulesVersion || 0}|${profile?.evolutionVersion || 0}|${profile?.candidates?.[0]?.id || ''}`;
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

    return Object.freeze({ evaluate, fingerprint, scoreForRole, ratingHTML, roleHTML, evolutionPresentation, createCache });
})();
globalThis.PokemonEvaluation = PokemonEvaluation;
