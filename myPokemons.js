let LOCAL_PAYLOAD = { party: [], pc: [] };

// lista importada de um arquivo: vive só na memória do iframe, nunca vai para
// o chrome.storage e nunca se mistura ao payload real do jogo (LOCAL_PAYLOAD,
// que continua sendo atualizado em segundo plano enquanto o modo está ativo)
const IMPORT_STATE = { active: false, fileName: '', payload: null };

function activePayload() {
    return IMPORT_STATE.active ? IMPORT_STATE.payload : LOCAL_PAYLOAD;
}

function payloadIsEmpty(payload) {
    return !(payload?.party?.length) && !(payload?.pc?.some((box) => box?.pokemon?.length));
}

const ICON_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/dream-world/';
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const DATA_STATE = {
    sourcePokemon: [],
    filteredPokemon: [],
    groups: []
};

const FILTER_STATE = {
    advancedEnabled: false,
    liveName: '',
    appliedName: '',
    applied: PokemonFilters.defaultValues(),
    isFiltering: false
};

const UI_STATE = {
    expandedGroups: new Set(),
    expandedPokemon: new Set(),
    knownGroups: new Set(),
    initialized: false,
    // ligado/desligado pela mensagem 'panel-mode' do shell (modo full) —
    // nunca persistido: some assim que o iframe volta ao modo encaixado.
    forceExpandAll: false,
    // no modo full os detalhes começam todos abertos, mas o usuário pode
    // recolher card a card — os recolhidos vivem aqui, fora do Set
    // persistido (expandedPokemon), e zeram a cada entrada no modo full.
    fullCollapsed: new Set(),
    // seção de golpes de todos os cartões — estado só da sessão, como os
    // outros dois toggles globais da barra de ferramentas
    showMoves: true
};

// defaults de expansão da tela (Configurações → TELAS). Começa com os
// defaults síncronos: se o primeiro payload chegar antes da leitura do
// storage resolver, o comportamento é o padrão — aceitável e raro.
let SCREEN_PREFS = Object.assign({}, PokemonHelperStorage.DEFAULT_UI_PREFERENCES.screens.myPokemons);
let EVALUATION_PREFS = Object.assign({}, PokemonHelperStorage.DEFAULT_UI_PREFERENCES.evaluation);
let pokedexProfiles = new Map();
const evaluationCache = PokemonEvaluation.createCache();
PokemonHelperStorage.getUiPreferences()
    .then((prefs) => { SCREEN_PREFS = prefs.screens.myPokemons; EVALUATION_PREFS = prefs.evaluation; renderIfLoaded(); })
    .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[PokemonHelperStorage.KEYS.pokedex]) {
        const items = changes[PokemonHelperStorage.KEYS.pokedex].newValue?.items || [];
        pokedexProfiles = new Map(items.map((item) => [normalizeSearch(item.slug || item.name), item.evaluationProfile]));
        evaluationCache.clear();
        rebuildDataState(); applyFilters(); renderIfLoaded();
    }
    if (!changes[PokemonHelperStorage.KEYS.uiPreferences]) return;
    // re-render para o link do Smogon aparecer/sumir assim que a configuração
    // muda, sem precisar fechar e reabrir a aba
    PokemonHelperStorage.getUiPreferences()
        .then((prefs) => {
            SCREEN_PREFS = prefs.screens.myPokemons;
            EVALUATION_PREFS = prefs.evaluation;
            if (!EVALUATION_PREFS.enabled) { evaluationCache.clear(); FILTER_STATE.applied.ratingLabels = []; }
            rebuildDataState(); applyFilters(); renderIfLoaded();
        })
        .catch(() => {});
});
PokemonHelperStorage.getPokedex().then((cached) => {
    pokedexProfiles = new Map((cached.items || []).map((item) => [normalizeSearch(item.slug || item.name), item.evaluationProfile]));
    rebuildDataState(); applyFilters(); renderIfLoaded();
}).catch(() => {});

let filterController = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function calculateIvPercent(ivs) {
    const total = STAT_KEYS.reduce((sum, stat) => {
        const value = Number(ivs?.[stat] ?? 0);
        return sum + Math.min(Math.max(value, 0), 31);
    }, 0);
    return Math.round((total / (31 * STAT_KEYS.length)) * 100);
}

function formatToText(value) {
    if (!value) return '—';
    return String(value)
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function getGenderSymbol(gender) {
    const value = String(gender ?? '').toUpperCase();
    const genders = {
        M: { class: 'male', symbol: '♂️' },
        MALE: { class: 'male', symbol: '♂️' },
        F: { class: 'female', symbol: '♀️' },
        FEMALE: { class: 'female', symbol: '♀️' }
    };
    return genders[value] || { symbol: '—', class: '' };
}

function getPokemonName(pokemon) {
    return pokemon?.name || pokemon?.species || 'Desconhecido';
}

function normalizeSearch(value) {
    return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

function getPokemonId(name) {
    return POKEMON_NAME_TO_ID[name.toLowerCase()] || null;
}

function normalizeMoves(moves) {
    if (!Array.isArray(moves)) return [];
    return moves.filter(Boolean).map((move) => ({
        name: move.name || 'Desconhecido',
        typeKey: TYPE_MAPPER[move.type] || null,
        category: formatToText(move.category),
        pp: move.pp
    }));
}

function createPokemonViewModel(pokemon, location) {
    const name = getPokemonName(pokemon);
    const typeKeys = [...new Set((pokemon.types || []).map((type) => TYPE_MAPPER[type]).filter(Boolean))];
    const natureName = pokemon.nature || '—';
    const pokemonId = getPokemonId(name);

    const profile = pokedexProfiles.get(normalizeSearch(pokemon.species || name));
    const evaluation = EVALUATION_PREFS.enabled ? evaluationCache.evaluate(pokemon, profile) : null;
    return {
        pokemon,
        key: location.key,
        groupKey: location.groupKey,
        location: location.kind,
        boxIndex: location.boxIndex,
        slotIndex: location.slotIndex,
        slotLabel: location.kind === 'party'
            ? `Meu Time - Slot ${location.slotIndex + 1}`
            : `Cx.${location.boxIndex + 1} - Slot ${location.slotIndex + 1}`,
        sourceOrder: location.sourceOrder,
        name,
        normalizedName: normalizeSearch(name),
        pokemonId,
        iconUrl: pokemonId ? `${ICON_URL}${pokemonId}.svg` : null,
        gender: getGenderSymbol(pokemon.gender),
        level: Number(pokemon.level ?? 0),
        natureName,
        natureKey: normalizeSearch(natureName),
        natureEffect: getNatureEffect(natureName),
        ability: pokemon.ability,
        heldItem: formatToText(pokemon.heldItem),
        hasItem: pokemon.heldItem !== null && pokemon.heldItem !== undefined && pokemon.heldItem !== '',
        shiny: pokemon.shiny === true,
        ivs: Object.fromEntries(STAT_KEYS.map((stat) => [stat, Math.min(Math.max(Number(pokemon.ivs?.[stat] ?? 0), 0), 31)])),
        ivPercent: calculateIvPercent(pokemon.ivs),
        typeKeys,
        typeOrder: typeKeys.map((type) => TYPES.indexOf(type)),
        moves: normalizeMoves(pokemon.moves),
        evaluation
    };
}

function rebuildDataState() {
    const data = activePayload();
    const party = Array.isArray(data?.party) ? data.party : [];
    const pc = Array.isArray(data?.pc) ? data.pc : [];
    const groups = [{ key: 'party', kind: 'party', title: 'Meu time', capacity: 6, boxIndex: null }];
    const pokemon = [];
    let sourceOrder = 0;

    party.forEach((entry, slotIndex) => {
        if (!entry) return;
        pokemon.push(createPokemonViewModel(entry, {
            key: `party:${slotIndex}`,
            groupKey: 'party',
            kind: 'party',
            boxIndex: null,
            slotIndex,
            sourceOrder: sourceOrder++
        }));
    });

    pc.forEach((box, boxIndex) => {
        const list = Array.isArray(box?.pokemon) ? box.pokemon : [];
        const groupKey = `pc:${boxIndex}`;
        groups.push({
            key: groupKey,
            kind: 'pc',
            title: box?.name || `Caixa ${boxIndex + 1}`,
            capacity: list.length || 30,
            boxIndex
        });
        list.forEach((entry, slotIndex) => {
            if (!entry) return;
            pokemon.push(createPokemonViewModel(entry, {
                key: `pc:${boxIndex}:${slotIndex}`,
                groupKey,
                kind: 'pc',
                boxIndex,
                slotIndex,
                sourceOrder: sourceOrder++
            }));
        });
    });

    DATA_STATE.sourcePokemon = pokemon;
    DATA_STATE.groups = groups;
    filterController?.setAbilities(DATA_STATE.sourcePokemon.map((pokemon) => ({ slug:pokemon.ability, label:PokemonAbilityInfo.label(pokemon.ability) })));
    evaluationCache.retain(pokemon.map((viewModel) => viewModel.pokemon?.id ?? `${viewModel.pokemon?.species || viewModel.name}:${viewModel.level}`));
}

function hasAdvancedFilter(values) {
    return values.shinyOnly
        || values.itemOnly
        || (EVALUATION_PREFS.enabled && values.ratingLabels.length > 0)
        || values.types.length > 0
        || (values.natureMode === 'name' && values.natures.length > 0)
        || (values.natureMode === 'effect' && (
            values.neutralOnly || values.natureIncrease || values.natureDecrease
        ))
        || STAT_KEYS.some((stat) => values.ivMinimum[stat] > 0)
        || values.abilitySlugs.length > 0;
}

function pokemonPassesFilters(viewModel, nameQuery, values, advancedEnabled, compiled) {
    if (nameQuery && !viewModel.normalizedName.includes(nameQuery)) return false;
    if (!advancedEnabled) return true;
    if (values.shinyOnly && !viewModel.shiny) return false;
    if (values.itemOnly && !viewModel.hasItem) return false;
    if (values.abilitySlugs.length && !values.abilitySlugs.includes(PokemonFilters.normalizeAbilitySlug(viewModel.ability))) return false;
    if (EVALUATION_PREFS.enabled && values.ratingLabels.length && !values.ratingLabels.includes(viewModel.evaluation?.rating?.label)) return false;

    if (values.types.length) {
        const matchesType = values.typeMode === 'all'
            ? values.types.every((type) => viewModel.typeKeys.includes(type))
            : values.types.some((type) => viewModel.typeKeys.includes(type));
        if (!matchesType) return false;
    }

    if (values.natureMode === 'name' && values.natures.length) {
        if (!compiled.natureKeys.has(viewModel.natureKey)) return false;
    }

    if (values.natureMode === 'effect') {
        const effect = viewModel.natureEffect;
        if (!effect) return false;
        if (values.neutralOnly) {
            if (effect.increases !== effect.decreases) return false;
        } else {
            if (values.natureIncrease && effect.increases !== values.natureIncrease) return false;
            if (values.natureDecrease && effect.decreases !== values.natureDecrease) return false;
        }
    }

    if (STAT_KEYS.some((stat) => viewModel.ivs[stat] < values.ivMinimum[stat])) return false;
    return true;
}

function compareTypeOrder(left, right) {
    const length = Math.max(left.typeOrder.length, right.typeOrder.length, 2);
    for (let index = 0; index < length; index += 1) {
        const leftOrder = left.typeOrder[index] ?? TYPES.length;
        const rightOrder = right.typeOrder[index] ?? TYPES.length;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }
    return 0;
}

function createComparator(values) {
    const direction = values.sortDirection === 'desc' ? -1 : 1;
    return (left, right) => {
        let result = 0;
        switch (values.sortBy) {
            case 'level':
                result = (left.level - right.level) * direction;
                break;
            case 'name':
                result = left.normalizedName.localeCompare(right.normalizedName, 'pt-BR');
                break;
            case 'type':
                result = compareTypeOrder(left, right);
                break;
            case 'nature':
                result = left.natureKey.localeCompare(right.natureKey, 'pt-BR');
                break;
            case 'ivPercent':
                result = (left.ivPercent - right.ivPercent) * direction;
                break;
            case 'evaluationScore':
                result = ((left.evaluation?.rating?.sortValue ?? -1) - (right.evaluation?.rating?.sortValue ?? -1)) * direction;
                if (!result) result = (left.ivPercent - right.ivPercent) * direction;
                if (!result) result = left.normalizedName.localeCompare(right.normalizedName, 'pt-BR');
                break;
            default:
                result = left.sourceOrder - right.sourceOrder;
        }
        return result || left.sourceOrder - right.sourceOrder;
    };
}

function applyFilters() {
    const advancedEnabled = FILTER_STATE.advancedEnabled;
    const values = advancedEnabled ? { ...FILTER_STATE.applied } : PokemonFilters.defaultValues();
    if (!EVALUATION_PREFS.enabled && values.sortBy === 'evaluationScore') values.sortBy = 'position';
    const nameQuery = advancedEnabled ? FILTER_STATE.appliedName : FILTER_STATE.liveName;
    FILTER_STATE.isFiltering = Boolean(nameQuery) || (advancedEnabled && hasAdvancedFilter(values));

    const noProcessing = !FILTER_STATE.isFiltering
        && (!advancedEnabled || values.sortBy === 'position');
    if (noProcessing) {
        DATA_STATE.filteredPokemon = DATA_STATE.sourcePokemon;
        return;
    }

    const compiled = {
        natureKeys: new Set(values.natures.map(normalizeSearch))
    };

    DATA_STATE.filteredPokemon = DATA_STATE.sourcePokemon
        .filter((viewModel) => pokemonPassesFilters(viewModel, nameQuery, values, advancedEnabled, compiled))
        .sort(createComparator(values));
}

// ---------------------------------------------------------------------
// Render — cartões e grupos no design system v2 (pixel).
// ---------------------------------------------------------------------

const MOVE_CATEGORY_STYLE = {
    physical: { label: 'FÍS', color: '#e0803c' },
    special: { label: 'ESP', color: '#4a90e2' },
    status: { label: 'STA', color: '#8a8aa0' }
};

function moveCategoryInfo(category) {
    const key = String(category ?? '').trim().toLowerCase();
    return MOVE_CATEGORY_STYLE[key] || { label: '—', color: 'var(--px-text-dim)' };
}

function syncUiState() {
    const groupKeys = DATA_STATE.groups.map((group) => group.key);
    const pokemonKeys = new Set(DATA_STATE.sourcePokemon.map((viewModel) => viewModel.key));
    groupKeys.forEach((key) => {
        // grupos novos (ou primeira carga) nascem expandidos só se a preferência mandar
        if ((!UI_STATE.initialized || !UI_STATE.knownGroups.has(key)) && SCREEN_PREFS.expandGroupsByDefault) {
            UI_STATE.expandedGroups.add(key);
        }
    });
    // pokémon: o default de expansão só vale na primeira carga da tela —
    // depois disso, quem manda é o toggle manual do usuário (expandedPokemon)
    if (!UI_STATE.initialized && SCREEN_PREFS.expandPokemonByDefault) {
        pokemonKeys.forEach((key) => UI_STATE.expandedPokemon.add(key));
    }
    UI_STATE.expandedGroups.forEach((key) => {
        if (!groupKeys.includes(key)) UI_STATE.expandedGroups.delete(key);
    });
    UI_STATE.expandedPokemon.forEach((key) => {
        if (!pokemonKeys.has(key)) UI_STATE.expandedPokemon.delete(key);
    });
    UI_STATE.knownGroups = new Set(groupKeys);
    UI_STATE.initialized = true;
}

function renderDetailRows(viewModel) {
    // avaliação e função já foram calculadas no view model e são reutilizadas
    // por renderização, filtros e ordenação.
    return PokemonCard.detailRows(viewModel, { afterNatureRows:PokemonCard.natureFitRow(viewModel, EVALUATION_PREFS), afterRows: `
        <div class="detail-row"><span class="detail-key">Posição</span><span class="detail-val">${escapeHtml(viewModel.slotLabel)}</span></div>
        ${PokemonCard.evaluationRows(viewModel, EVALUATION_PREFS)}
    ` });
}

function renderIvDetails(viewModel) {
    return PokemonCard.ivGrid(viewModel, { showStats:SCREEN_PREFS.showStatsWithIvs });
}

// selo ao lado do nome; markup e tooltip vêm de PokemonTransfer para não
// divergir do mesmo selo na tela de Encontro
function renderSmogonLink(viewModel) {
    if (!SCREEN_PREFS.showSmogonLink) return '';
    return PokemonTransfer.smogonLinkHTML(viewModel.name);
}

function renderMoveDetails(viewModel) {
    if (!viewModel.moves.length) {
        return `<div class="moves-head"><span class="px-label">Golpes</span></div><p class="empty">Nenhum golpe disponível.</p>`;
    }
    const rows = viewModel.moves.map((move) => {
        const category = moveCategoryInfo(move.category);
        const typeBg = move.typeKey ? PokemonPixelIcons.typeColor(move.typeKey) : 'var(--px-bg-track)';
        const typeIcon = move.typeKey ? PokemonPixelIcons.typeIcon(move.typeKey, PokemonPixelIcons.onColor(typeBg)) : '';
        return `
            <div class="pokemon-move">
                <span class="pokemon-move-type" style="background:${typeBg}">${typeIcon}</span>
                <span class="pokemon-move-name">${escapeHtml(move.name)}</span>
                <span class="pokemon-move-category" style="color:${category.color}">${category.label}</span>
                <span class="pokemon-move-pp">${move.pp ?? '—'} PP</span>
            </div>
        `;
    }).join('');
    return `<div class="moves-head"><span class="px-label">Golpes</span></div>${rows}`;
}

function renderPokemonCard(viewModel) {
    const expanded = UI_STATE.forceExpandAll
        ? !UI_STATE.fullCollapsed.has(viewModel.key)
        : UI_STATE.expandedPokemon.has(viewModel.key);
    const moves = UI_STATE.showMoves ? renderMoveDetails(viewModel) : '';
    return PokemonCard.render(viewModel, {
        expanded,
        nameBadgesHtml: renderSmogonLink(viewModel),
        detailsHtml: renderDetailRows(viewModel) + renderIvDetails(viewModel) + moves
    });
}

function renderPokemonList(viewModels, location = 'all') {
    if (!viewModels.length) return '<p class="empty">Nenhum Pokémon encontrado.</p>';
    return `<div class="pokemon-list pokemon-list--${location}">${viewModels.map(renderPokemonCard).join('')}</div>`;
}

function renderCollapsibleGroup(group, viewModels, total) {
    const expanded = UI_STATE.expandedGroups.has(group.key);
    const contentId = `pokemon-group-${group.key.replace(/:/g, '-')}`;
    const counter = FILTER_STATE.isFiltering
        ? `${viewModels.length}/${total}`
        : `${total}/${group.capacity}`;
    return `
        <section class="pokemon-group" data-group-key="${group.key}">
            <button type="button" class="pokemon-group-toggle" aria-expanded="${expanded}" aria-controls="${contentId}">
                <span class="group-title">${expanded ? '▾' : '▸'} ${escapeHtml(group.title)}</span>
                <span class="group-rule"></span>
                <span class="group-counter">${counter}</span>
            </button>
            <div class="pokemon-group-content" id="${contentId}" ${expanded ? '' : 'hidden'}>${renderPokemonList(viewModels, group.kind)}</div>
        </section>
    `;
}

function renderGrouped() {
    // primeira execução: antes do primeiro sync do personagem não existe nem
    // o grupo do time (groups[0]), e render() pode rodar antes disso via
    // 'panel-mode' do shell ou interação com busca/filtros
    if (DATA_STATE.groups.length === 0) {
        return '<p class="empty">Aguardando dados do jogo — eles chegam quando o personagem sincroniza.</p>';
    }
    const sourceByGroup = new Map(DATA_STATE.groups.map((group) => [group.key, []]));
    const filteredByGroup = new Map(DATA_STATE.groups.map((group) => [group.key, []]));
    DATA_STATE.sourcePokemon.forEach((viewModel) => sourceByGroup.get(viewModel.groupKey)?.push(viewModel));
    DATA_STATE.filteredPokemon.forEach((viewModel) => filteredByGroup.get(viewModel.groupKey)?.push(viewModel));
    const partyGroup = DATA_STATE.groups[0];
    const pcGroups = DATA_STATE.groups.slice(1);
    const party = renderCollapsibleGroup(
        partyGroup,
        filteredByGroup.get('party') || [],
        sourceByGroup.get('party')?.length || 0
    );
    const pcBoxes = pcGroups.map((group) => {
        const filtered = filteredByGroup.get(group.key) || [];
        if (FILTER_STATE.isFiltering && filtered.length === 0) return '';
        return renderCollapsibleGroup(group, filtered, sourceByGroup.get(group.key)?.length || 0);
    }).join('');

    return `${party}${pcBoxes}`;
}

function renderFlat() {
    const header = `
        <div class="pokemon-group-toggle" style="cursor:default;">
            <span class="group-title">Todos os Pokémon</span>
            <span class="group-rule"></span>
            <span class="group-counter">${DATA_STATE.filteredPokemon.length}/${DATA_STATE.sourcePokemon.length}</span>
        </div>
    `;
    return `${header}${renderPokemonList(DATA_STATE.filteredPokemon)}`;
}

function syncGlobalControls() {
    const visibleKeys = DATA_STATE.filteredPokemon.map((viewModel) => viewModel.key);
    const groupKeys = DATA_STATE.groups.map((group) => group.key);
    const allGroupsExpanded = groupKeys.length > 0 && groupKeys.every((key) => UI_STATE.expandedGroups.has(key));
    const allPokemonExpanded = UI_STATE.forceExpandAll
        ? visibleKeys.length > 0 && visibleKeys.every((key) => !UI_STATE.fullCollapsed.has(key))
        : visibleKeys.length > 0 && visibleKeys.every((key) => UI_STATE.expandedPokemon.has(key));
    const removeGroups = FILTER_STATE.advancedEnabled && FILTER_STATE.applied.removeGroups;
    const groupsToggle = document.getElementById('expand-all-groups');
    groupsToggle?.setAttribute('aria-pressed', String(allGroupsExpanded));
    if (groupsToggle) groupsToggle.hidden = removeGroups;
    document.getElementById('expand-all-pokemon')?.setAttribute('aria-pressed', String(allPokemonExpanded));
    document.getElementById('toggle-moves')?.setAttribute('aria-pressed', String(UI_STATE.showMoves));
    syncTransferControls();
}

function render() {
    const content = document.getElementById('content');
    if (!content) return;
    const evaluationSection = document.getElementById('filter-evaluation-section');
    if (evaluationSection) evaluationSection.hidden = !EVALUATION_PREFS.enabled;
    const evaluationSort = document.querySelector('#filter-sort-by option[value="evaluationScore"]');
    if (evaluationSort) evaluationSort.hidden = !EVALUATION_PREFS.enabled;
    syncUiState();
    const removeGroups = FILTER_STATE.advancedEnabled && FILTER_STATE.applied.removeGroups;
    content.innerHTML = removeGroups ? renderFlat() : renderGrouped();
    PokemonAbilityInfo.hydrate(content);
    syncGlobalControls();
}

function applyAndRender() {
    applyFilters();
    render();
}

// evita trocar a mensagem inicial de "aguardando" por um render vazio quando
// as preferências chegam antes do primeiro payload do personagem
function renderIfLoaded() {
    if (DATA_STATE.groups.length > 0) render();
}

// ---------------------------------------------------------------------
// Exportar / importar — arquivo JSON no modelo de components/pokemon-transfer.js
// ---------------------------------------------------------------------

const TRANSFER_MESSAGES = {
    json: 'Arquivo inválido: não é um JSON válido.',
    shape: 'Arquivo inválido: não contém uma lista de Pokémon.',
    empty: 'Arquivo sem Pokémon.'
};

function setTransferStatus(message, kind) {
    const status = document.getElementById('transfer-status');
    if (!status) return;
    status.textContent = message || '';
    status.hidden = !message;
    if (kind) status.dataset.kind = kind;
    else delete status.dataset.kind;
}

function syncTransferControls() {
    const exportButton = document.getElementById('export-pokemon');
    if (exportButton) exportButton.disabled = payloadIsEmpty(activePayload());
    const banner = document.getElementById('imported-banner');
    if (banner) banner.hidden = !IMPORT_STATE.active;
    const fileLabel = document.getElementById('imported-banner-file');
    if (fileLabel) fileLabel.textContent = IMPORT_STATE.fileName;
}

// a lista importada e a do jogo usam chaves de card diferentes (party:0,
// pc:2:13 apontam para Pokémon distintos), então a expansão recomeça do padrão
function resetViewState() {
    UI_STATE.expandedGroups.clear();
    UI_STATE.expandedPokemon.clear();
    UI_STATE.fullCollapsed.clear();
    UI_STATE.knownGroups.clear();
    UI_STATE.initialized = false;
}

function exportPokemon() {
    const payload = activePayload();
    if (payloadIsEmpty(payload)) {
        setTransferStatus('Nada para exportar — aguardando os dados do personagem.', 'erro');
        return;
    }
    const name = PokemonTransfer.filename();
    const json = JSON.stringify(PokemonTransfer.buildExport(payload), null, 2);
    try {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setTransferStatus(`Exportado: ${name}`, 'ok');
    } catch (error) {
        // download dentro do iframe pode ser recusado pelo navegador —
        // a área de transferência mantém o dado acessível
        console.warn('[Pokemon Helper] Falha ao baixar a exportação:', error);
        navigator.clipboard?.writeText(json)
            .then(() => setTransferStatus('Download bloqueado — JSON copiado para a área de transferência.', 'ok'))
            .catch(() => setTransferStatus('Não foi possível exportar neste navegador.', 'erro'));
    }
}

function enterImportedMode(payload, fileName, count) {
    IMPORT_STATE.active = true;
    IMPORT_STATE.payload = payload;
    IMPORT_STATE.fileName = fileName;
    resetViewState();
    rebuildDataState();
    applyAndRender();
    setTransferStatus(`Importado: ${fileName} — ${count} Pokémon.`, 'ok');
}

function exitImportedMode() {
    IMPORT_STATE.active = false;
    IMPORT_STATE.payload = null;
    IMPORT_STATE.fileName = '';
    resetViewState();
    rebuildDataState();
    applyAndRender();
    setTransferStatus('', null);
}

function importPokemonFile(file) {
    const reader = new FileReader();
    reader.onerror = () => setTransferStatus('Não foi possível ler o arquivo.', 'erro');
    reader.onload = () => {
        const result = PokemonTransfer.parse(String(reader.result || ''));
        // arquivo inválido não derruba a lista que já está na tela
        if (!result.ok) {
            setTransferStatus(TRANSFER_MESSAGES[result.error] || TRANSFER_MESSAGES.shape, 'erro');
            return;
        }
        enterImportedMode(result.payload, file.name, result.count);
    };
    reader.readAsText(file);
}

function toggleSetValue(set, key) {
    if (set.has(key)) set.delete(key);
    else set.add(key);
}

function bindControls() {
    const content = document.getElementById('content');
    const filterInput = document.getElementById('pokemon-name-filter');
    const advancedToggle = document.getElementById('toggle-advanced-filters');
    const advancedPanel = document.getElementById('pokemon-advanced-filters');
    const groupsToggle = document.getElementById('expand-all-groups');
    const pokemonToggle = document.getElementById('expand-all-pokemon');
    const movesToggle = document.getElementById('toggle-moves');

    filterController = PokemonFilters.mount(advancedPanel, {
        onApply(values) {
            FILTER_STATE.applied = values;
            FILTER_STATE.appliedName = normalizeSearch(filterInput.value);
            applyAndRender();
        },
        onClear(values) {
            filterInput.value = '';
            FILTER_STATE.liveName = '';
            FILTER_STATE.appliedName = '';
            FILTER_STATE.applied = values;
            applyAndRender();
        }
    }, { abilities:PokemonFilters.normalizeAbilityOptions(DATA_STATE.sourcePokemon.map((pokemon) => ({ slug:pokemon.ability, label:PokemonAbilityInfo.label(pokemon.ability) }))) });

    advancedToggle.addEventListener('click', () => {
        FILTER_STATE.advancedEnabled = !FILTER_STATE.advancedEnabled;
        advancedToggle.setAttribute('aria-pressed', String(FILTER_STATE.advancedEnabled));
        advancedPanel.hidden = !FILTER_STATE.advancedEnabled;
        if (!FILTER_STATE.advancedEnabled) FILTER_STATE.liveName = normalizeSearch(filterInput.value);
        applyAndRender();
    });

    filterInput.addEventListener('input', () => {
        if (FILTER_STATE.advancedEnabled) return;
        FILTER_STATE.liveName = normalizeSearch(filterInput.value);
        applyAndRender();
    });

    groupsToggle.addEventListener('click', () => {
        const shouldExpand = groupsToggle.getAttribute('aria-pressed') !== 'true';
        DATA_STATE.groups.forEach((group) => {
            if (shouldExpand) UI_STATE.expandedGroups.add(group.key);
            else UI_STATE.expandedGroups.delete(group.key);
        });
        render();
    });

    movesToggle.addEventListener('click', () => {
        UI_STATE.showMoves = !UI_STATE.showMoves;
        render();
    });

    document.getElementById('export-pokemon').addEventListener('click', exportPokemon);

    const importInput = document.getElementById('import-file');
    document.getElementById('import-pokemon').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => {
        const file = importInput.files?.[0];
        // zera o input para o mesmo arquivo poder ser reimportado depois
        importInput.value = '';
        if (file) importPokemonFile(file);
    });

    document.getElementById('exit-imported').addEventListener('click', exitImportedMode);

    pokemonToggle.addEventListener('click', () => {
        const shouldExpand = pokemonToggle.getAttribute('aria-pressed') !== 'true';
        DATA_STATE.filteredPokemon.forEach((viewModel) => {
            // no modo full o estado session-only é o de RECOLHIDOS —
            // o Set persistido não deve ser tocado por ações do modo full
            if (UI_STATE.forceExpandAll) {
                if (shouldExpand) UI_STATE.fullCollapsed.delete(viewModel.key);
                else UI_STATE.fullCollapsed.add(viewModel.key);
            } else if (shouldExpand) {
                UI_STATE.expandedPokemon.add(viewModel.key);
            } else {
                UI_STATE.expandedPokemon.delete(viewModel.key);
            }
        });
        render();
    });

    content.addEventListener('click', (event) => {
        // antes do cartão: o selo fica dentro do <button>, e sem parar aqui o
        // clique também expandiria/recolheria os detalhes
        const smogon = event.target.closest('.px-extlink');
        if (smogon) {
            event.preventDefault();
            event.stopPropagation();
            window.open(smogon.dataset.smogon, '_blank', 'noopener');
            return;
        }
        const groupButton = event.target.closest('.pokemon-group-toggle');
        if (groupButton) {
            const group = groupButton.closest('[data-group-key]');
            if (group) toggleSetValue(UI_STATE.expandedGroups, group.dataset.groupKey);
            render();
            return;
        }
        const pokemonButton = event.target.closest('.pokemon-card-toggle');
        if (pokemonButton) {
            const card = pokemonButton.closest('[data-pokemon-key]');
            if (!card) return;
            // no modo full o clique recolhe/reabre só na sessão (fullCollapsed);
            // o Set persistido (expandedPokemon) fica intocado, senão o card
            // ficaria "marcado" como expandido depois que o modo full termina,
            // mesmo sem o usuário ter pedido isso.
            toggleSetValue(UI_STATE.forceExpandAll ? UI_STATE.fullCollapsed : UI_STATE.expandedPokemon, card.dataset.pokemonKey);
            render();
        }
    });

    content.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const smogon = event.target.closest?.('.px-extlink');
        if (!smogon) return;
        event.preventDefault();
        event.stopPropagation();
        window.open(smogon.dataset.smogon, '_blank', 'noopener');
    });

    syncTransferControls();
}

bindControls();

window.addEventListener('message', (event) => {
    const { type, payload } = event?.data || {};
    const hasData = payload?.party?.length > 0 || payload?.pc?.length > 0;
    if (type !== 'character-data' || !hasData) return;
    if (payload.pc?.length > 0) LOCAL_PAYLOAD.pc = payload.pc;
    if (payload.party?.length > 0) LOCAL_PAYLOAD.party = payload.party;
    // no modo importado os dados do jogo continuam chegando e ficam guardados,
    // mas não trocam a lista que está na tela
    if (IMPORT_STATE.active) {
        syncTransferControls();
        return;
    }
    rebuildDataState();
    applyAndRender();
});

// modo full do painel (shell) — detalhes de Pokémon começam todos abertos,
// mas podem ser recolhidos card a card (fullCollapsed); grupos continuam
// manuais. Cada entrada no modo full zera os recolhidos da sessão anterior.
window.addEventListener('message', (event) => {
    if (event.data?.type !== 'panel-mode') return;
    const full = event.data.full === true;
    document.body.classList.toggle('full', full);
    if (full !== UI_STATE.forceExpandAll) UI_STATE.fullCollapsed.clear();
    UI_STATE.forceExpandAll = full;
    render();
});
