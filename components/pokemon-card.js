// Card estrutural compartilhado por Meus Pokémon e Leilão. As telas montam o
// view model e os detalhes; este componente mantém a hierarquia visual única.
var PokemonCard = globalThis.PokemonCard || (() => {
    const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
    const ivPercentColor = (percent) => percent >= 80 ? 'var(--px-good)' : percent >= 50 ? 'var(--px-mid)' : 'var(--px-bad)';
    const ivStatColor = (iv) => iv >= 26 ? 'var(--px-good)' : iv >= 15 ? 'var(--px-mid)' : 'var(--px-bad)';
    const ivTooltipText = (ivs) => STAT_KEYS.map((stat) => `${stat.toUpperCase()} ${ivs?.[stat] ?? 0}`).join(' · ');

    function natureModsHTML(nature) {
        const effect = typeof getNatureEffect === 'function' ? getNatureEffect(nature) : null;
        if (!effect) return '';
        if (effect.increases === effect.decreases) return '<span class="nat-mod" style="color:var(--px-mid)">NEUTRA</span>';
        return `<span class="nat-mod" style="color:var(--px-good)">${effect.increases}⬆</span><span class="nat-mod" style="color:var(--px-bad)">${effect.decreases}⬇</span>`;
    }

    function detailRows(viewModel, options = {}) {
        const ability = viewModel.ability || '';
        const abilityLabel = typeof PokemonAbilityInfo !== 'undefined' ? PokemonAbilityInfo.label(ability) : ability;
        return `${options.beforeRows || ''}
            <div class="detail-row"><span class="detail-key">Natureza</span><span class="detail-val">${escapeHtml(viewModel.natureName || '—')} ${natureModsHTML(viewModel.natureName)}</span></div>
            <div class="detail-row"><span class="detail-key">Habilidade</span><span class="detail-val" data-ability="${escapeHtml(ability)}">${escapeHtml(abilityLabel || '—')}</span></div>
            <div class="detail-row"><span class="detail-key">Item</span><span class="detail-val">${escapeHtml(viewModel.heldItem || '—')}</span></div>
            ${options.afterRows || ''}`;
    }

    // mesma leitura da grade de IVs do Encontro (battle.js): barra proporcional
    // a iv/31 na cor da faixa, com o número logo abaixo
    function ivGrid(viewModel) {
        return `<div class="pokemon-iv-grid">${STAT_KEYS.map((stat) => {
            const iv = Math.min(Math.max(Number(viewModel.ivs?.[stat] ?? 0), 0), 31);
            const color = ivStatColor(iv);
            return `<div class="pokemon-iv" data-tip="${stat.toUpperCase()} — IV ${iv}/31">
                <span class="k">${stat.toUpperCase()}</span>
                <span class="px-bar"><span class="px-bar-fill" style="width:${Math.round(iv / 31 * 100)}%;background:${color}"></span></span>
                <span class="v" style="color:${color}">${iv}</span>
            </div>`;
        }).join('')}</div>`;
    }

    function evaluationRows(viewModel, preferences = {}) {
        const result = viewModel.evaluation;
        if (!result || preferences.enabled === false) return '';
        let rows = '';
        if (preferences.showCoreFields !== false) rows += `
            <div class="detail-row"><span class="detail-key">Avaliação</span><span class="detail-val">${PokemonEvaluation.ratingHTML(result)}</span></div>
            <div class="detail-row"><span class="detail-key">Função</span><span class="detail-val">${PokemonEvaluation.roleHTML(result)}</span></div>`;
        if (preferences.showConfidence) rows += `<div class="detail-row"><span class="detail-key">Confiança</span><span class="detail-val">${escapeHtml(result.role.confidence)}</span></div>`;
        if (preferences.showNatureFit) rows += `<div class="detail-row"><span class="detail-key">Nature</span><span class="detail-val">${escapeHtml(result.nature.fit)}</span></div>`;
        if (preferences.showMovesetFit) rows += `<div class="detail-row"><span class="detail-key">Golpes</span><span class="detail-val">${escapeHtml(result.moveset.fit === 'unknown' ? 'Não determinada' : result.moveset.fit)}</span></div>`;
        if (preferences.showAlternativeRole && result.role.secondaryLabel) rows += `<div class="detail-row"><span class="detail-key">Alternativa</span><span class="detail-val">${escapeHtml(result.role.secondaryLabel)}</span></div>`;
        return rows;
    }

    function render(viewModel, options = {}) {
        const expanded = options.expanded === true;
        const detailsId = options.detailsId || `pokemon-details-${String(viewModel.key).replace(/[^a-z0-9_-]/gi, '-')}`;
        const icon = viewModel.iconUrl
            ? `<img class="pokemon-icon" src="${escapeHtml(viewModel.iconUrl)}" alt="${escapeHtml(viewModel.name)} icon">`
            : '<span class="pokemon-icon"><span class="pxl-pokeball"></span></span>';
        const genderClass = viewModel.gender?.class === 'male' ? 'pokemon-gender-m' : viewModel.gender?.class === 'female' ? 'pokemon-gender-f' : '';
        const gender = genderClass ? `<span class="${genderClass}">${escapeHtml(viewModel.gender.symbol)}</span>` : '';
        const shiny = viewModel.shiny ? '<span data-tip="Shiny!">✨</span>' : '';
        const chips = (viewModel.typeKeys || []).map((type) => typeTagHTML(type, { stack: true })).join('');
        const ivColor = ivPercentColor(viewModel.ivPercent || 0);
        const cardStyle = viewModel.typeKeys?.[0] ? ` style="--card-type-color:${PokemonPixelIcons.typeColor(viewModel.typeKeys[0])}"` : '';
        const location = escapeHtml(viewModel.location || 'all');
        return `<article class="pokemon-card pokemon-card--${location}${options.className ? ` ${escapeHtml(options.className)}` : ''}" data-pokemon-key="${escapeHtml(viewModel.key)}"${cardStyle}>
            <button type="button" class="pokemon-card-toggle" aria-expanded="${expanded}" aria-controls="${detailsId}">
                ${icon}
                <span class="pokemon-id-col"><span class="pokemon-name"><span class="pokemon-name-text">${escapeHtml(viewModel.name)}</span>${gender}${shiny}${options.nameBadgesHtml || ''}</span><span class="pokemon-chips">${chips}</span>${options.badgesHtml || ''}</span>
                <span class="pokemon-right">${options.rightTopHtml || `<span class="pokemon-level">Lv. ${viewModel.level || '—'}</span>`}<span class="pokemon-ivbar" data-tip="${escapeHtml(ivTooltipText(viewModel.ivs))}"><span class="px-bar"><span class="px-bar-fill" style="width:${viewModel.ivPercent || 0}%;background:${ivColor}"></span></span><span class="pokemon-ivbar-label" style="color:${ivColor}">${viewModel.ivPercent || 0}%</span></span></span>
            </button>
            ${options.metaHtml || ''}
            <div class="pokemon-details" id="${detailsId}" ${expanded ? '' : 'hidden'}>${options.detailsHtml || ''}</div>
        </article>`;
    }

    return { render, detailRows, ivGrid, evaluationRows };
})();
