(function () {
    const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/dream-world/';
    const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const NATURES = ['Adamant','Bashful','Bold','Brave','Calm','Careful','Docile','Gentle','Hardy','Hasty','Impish','Jolly','Lax','Lonely','Mild','Modest','Naive','Naughty','Quiet','Quirky','Rash','Relaxed','Sassy','Serious','Timid'];
    const state = {
        tab: 'browse', page: 0, pages: 0, total: 0, listings: [], listingIds: new Set(),
        loading: false, authenticated: false, activeRequest: null, generation: 0,
        incrementalError: null, expandAll: false, expandedIds: new Set(), collapsedWhenAll: new Set(),
        favoriteRequests: new Map(), pendingFavoriteIds: new Set(),
        sellables: [], sellRequestId: null, selectedSellableIds: new Set(), sellPrices: new Map(),
        vip: null, mineTotal: null, pendingQueueDraft: null, listingQueue: null, actionRequest: null
    };
    const byId = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
    const number = (value) => Number.isSafeInteger(Number(value)) ? Number(value) : null;
    const money = (value) => number(value) === null ? '—' : new Intl.NumberFormat('pt-BR').format(Number(value));
    const formatText = (value) => value ? String(value).replace(/[-_]/g, ' ').split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : '—';
    const ivPercent = (ivs) => Math.round(STAT_KEYS.reduce((sum, key) => sum + (number(ivs?.[key]) || 0), 0) / 186 * 100);
    let searchTimer = null;
    let searchComposing = false;

    function setupOptions() {
        TYPES.forEach((key) => byId('type').insertAdjacentHTML('beforeend', `<option value="${Object.keys(TYPE_MAPPER).find((id) => TYPE_MAPPER[id] === key)}">${escapeHtml(LABELS[key])}</option>`));
        NATURES.forEach((name) => byId('nature').insertAdjacentHTML('beforeend', `<option value="${name}">${name}</option>`));
    }

    function params(page) {
        const readInt = (id) => { const value = byId(id).value; return value === '' ? null : number(value); };
        return { tab: state.tab, page, kind: 'mon', sort: byId('sort').value, q: byId('name-search').value.trim(),
            type: readInt('type'), nature: byId('nature').value, levelMin: readInt('level-min'), levelMax: readInt('level-max'),
            priceMin: readInt('price-min'), priceMax: readInt('price-max'), shiny: byId('shiny').checked, perfect: byId('perfect').checked };
    }

    function filtersAreValid(values) {
        return !(values.levelMin > values.levelMax || (values.priceMax !== null && values.priceMin > values.priceMax));
    }

    function requestPage(page, replace = false) {
        if (!state.authenticated) { showWaiting(); return; }
        if (state.loading || page < 1 || (state.pages > 0 && page > state.pages)) return;
        const values = params(page);
        if (!filtersAreValid(values)) { showInitialError('O valor mínimo não pode ser maior que o máximo.'); return; }
        state.loading = true;
        state.incrementalError = null;
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        state.activeRequest = { requestId, generation: state.generation, page, replace, kind: 'browse' };
        if (replace) {
            byId('auction-content').innerHTML = '<p class="empty">Consultando leilão…</p>';
            byId('summary').textContent = 'ATUALIZANDO…';
        }
        paintSentinel();
        window.parent.postMessage({ type: 'auction-command', action: 'browse', requestId, params: values }, '*');
        window.setTimeout(() => {
            if (state.activeRequest?.requestId !== requestId) return;
            state.loading = false;
            state.activeRequest = null;
            if (replace) showInitialError('A consulta demorou demais. Tente atualizar.');
            else { state.incrementalError = 'A próxima página demorou demais.'; paintSentinel(); }
        }, 15000);
    }

    function resetAndLoad() {
        state.generation += 1;
        state.page = 0; state.pages = 0; state.total = 0; state.listings = [];
        state.listingIds = new Set(); state.activeRequest = null; state.loading = false;
        state.incrementalError = null; state.expandedIds = new Set(); state.collapsedWhenAll = new Set();
        requestPage(1, true);
    }

    function favoriteFeedback(message = '', isError = false) {
        const feedback = byId('favorite-feedback');
        feedback.textContent = message;
        feedback.classList.toggle('error', isError);
    }

    function requestFavorite(listingId) {
        const listing = state.listings.find((item) => item.id === listingId);
        if (!listing || state.tab === 'mine' || state.pendingFavoriteIds.has(listingId)) return;
        const on = !listing.favorited;
        const requestId = `favorite-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        state.favoriteRequests.set(requestId, { listingId, on, generation: state.generation });
        state.pendingFavoriteIds.add(listingId);
        favoriteFeedback();
        render();
        window.parent.postMessage({ type: 'auction-command', action: 'favorite', requestId, params: { listingId, on } }, '*');
        window.setTimeout(() => {
            const request = state.favoriteRequests.get(requestId);
            if (!request) return;
            state.favoriteRequests.delete(requestId);
            state.pendingFavoriteIds.delete(request.listingId);
            favoriteFeedback('Não foi possível alterar o favorito. A listagem será atualizada.', true);
            render();
            resetAndLoad();
        }, 15000);
    }

    function requestBootstrap() {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        state.activeRequest = { requestId, generation: state.generation, page: 0, replace: true, kind: 'bootstrap' };
        window.parent.postMessage({ type: 'auction-command', action: 'bootstrap', requestId, params: {} }, '*');
    }

    function showWaiting() {
        state.authenticated = false; state.loading = false; state.activeRequest = null;
        byId('sell-toolbar').hidden = true;
        byId('sell-review').hidden = true;
        byId('auction-content').innerHTML = '<p class="empty">Abra o leilão no jogo para conectar.<br>A primeira busca será aproveitada automaticamente.</p>';
        byId('summary').textContent = 'AGUARDANDO LEILÃO DO JOGO';
        byId('expand-all-pokemon').disabled = true;
        paintSentinel();
    }

    function requestSellables() {
        if (!state.authenticated || state.sellRequestId) return;
        const requestId = `sellables-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        state.sellRequestId = requestId;
        byId('auction-content').innerHTML = '<p class="empty">Carregando Pokémon vendáveis…</p>';
        window.parent.postMessage({ type: 'auction-command', action: 'sellables', requestId, params: {} }, '*');
        window.setTimeout(() => {
            if (state.sellRequestId !== requestId) return;
            state.sellRequestId = null;
            showInitialError('Não foi possível carregar os Pokémon vendáveis.');
        }, 15000);
    }

    function requestMineCount(purpose = 'capacity') {
        if (!state.authenticated || state.activeRequest) return;
        const requestId = `mine-count-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        state.activeRequest = { requestId, generation: state.generation, page: 1, replace: false, kind: 'mine-count', purpose };
        window.parent.postMessage({ type: 'auction-command', action: 'browse', requestId, params: {
            tab: 'mine', page: 1, kind: 'mon', sort: 'new', levelMin: 1, levelMax: 100, priceMin: 0
        } }, '*');
        window.setTimeout(() => {
            if (state.activeRequest?.requestId !== requestId) return;
            state.activeRequest = null;
            if (purpose === 'publish') {
                state.pendingQueueDraft = null;
                favoriteFeedback('Não foi possível revalidar o limite de anúncios.', true);
            }
            renderSellables();
        }, 15000);
    }

    function setSellMode(enabled) {
        byId('auction-filters').hidden = enabled;
        byId('sell-toolbar').hidden = !enabled;
        byId('expand-all-pokemon').hidden = false;
        byId('refresh').textContent = enabled ? 'ATUALIZAR VENDÁVEIS' : 'ATUALIZAR';
        byId('sell-review').hidden = true;
        favoriteFeedback();
    }

    function enterSellMode() {
        window.clearTimeout(searchTimer);
        state.tab = 'sell';
        state.generation += 1;
        state.activeRequest = null;
        state.loading = false;
        state.mineTotal = null;
        setSellMode(true);
        document.querySelectorAll('.auction-tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === 'sell')));
        requestSellables();
    }

    function showInitialError(message) {
        byId('auction-content').innerHTML = `<p class="empty error">${escapeHtml(message)}</p>`;
        byId('summary').textContent = 'FALHA NA CONSULTA';
        byId('expand-all-pokemon').disabled = true;
        paintSentinel();
    }

    function appendPage(data, replace) {
        if (replace) { state.listings = []; state.listingIds = new Set(); }
        (data.listings || []).forEach((listing) => {
            if (!listing.id || state.listingIds.has(listing.id)) return;
            state.listingIds.add(listing.id); state.listings.push(listing);
        });
        state.total = data.total; state.page = Math.max(state.page, data.page); state.pages = data.pages;
        render();
        // A segunda página é prefetch obrigatório; as demais dependem do sentinela.
        if (data.page === 1 && data.pages >= 2) requestPage(2);
    }

    function applyBootstrap(data) {
        state.authenticated = data?.status === 'ready';
        if (!state.authenticated) { showWaiting(); return; }
        if (data?.params) {
            const setValue = (id, value, fallback = '') => { byId(id).value = value ?? fallback; };
            state.tab = data.params.tab || 'browse';
            document.querySelectorAll('.auction-tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab)));
            setValue('sort', data.params.sort, 'new'); setValue('type', data.params.type);
            setValue('nature', data.params.nature); setValue('level-min', data.params.levelMin, 1);
            setValue('level-max', data.params.levelMax, 100); setValue('price-min', data.params.priceMin, 0);
            setValue('price-max', data.params.priceMax);
            setValue('name-search', data.params.q);
            byId('shiny').checked = data.params.shiny === true;
            byId('perfect').checked = data.params.perfect === true;
        }
        state.generation += 1;
        setSellMode(false);
        if (data?.browse && data.tab === state.tab) appendPage(data.browse, true);
        else resetAndLoad();
    }

    function remaining(iso) {
        const ms = new Date(iso).getTime() - Date.now();
        if (!Number.isFinite(ms) || ms <= 0) return 'Expirado';
        const hours = Math.floor(ms / 3600000);
        return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.floor(ms % 3600000 / 60000)}m`;
    }

    function pokemonViewModel(listing) {
        const mon = listing.snapshot || {};
        const species = String(mon.species || '').toLowerCase();
        const pokemonId = POKEMON_NAME_TO_ID[species] || null;
        const genderKey = String(mon.gender || '').toUpperCase();
        return {
            key: `auction:${listing.id}`, location: 'auction', name: mon.name || species || 'Desconhecido',
            iconUrl: pokemonId ? `${SPRITES}${pokemonId}.svg` : null,
            gender: genderKey === 'M' ? { class: 'male', symbol: '♂' } : genderKey === 'F' ? { class: 'female', symbol: '♀' } : { class: '', symbol: '—' },
            level: number(mon.level) || 0, shiny: mon.shiny === true,
            natureName: mon.nature || '—', ability: mon.ability || '', heldItem: formatText(mon.heldItem),
            typeKeys: [...new Set((mon.types || []).map((id) => TYPE_MAPPER[id]).filter(Boolean))],
            ivs: Object.fromEntries(STAT_KEYS.map((key) => [key, number(mon.ivs?.[key]) || 0])),
            ivPercent: ivPercent(mon.ivs)
        };
    }

    function sellableViewModel(mon) {
        const viewModel = pokemonViewModel({ id: `sell-${mon.id}`, snapshot: mon.snapshot });
        viewModel.key = `sell:${mon.id}`;
        viewModel.location = mon.location;
        return viewModel;
    }

    function detailRows(listing, viewModel) {
        const auctionRows = `<div class="detail-row"><span class="detail-key">Vendedor</span><span class="detail-val">${escapeHtml(listing.seller_name || 'Desconhecido')}</span></div>
            <div class="detail-row"><span class="detail-key">Expira em</span><span class="detail-val">${remaining(listing.expires_at)}</span></div>`;
        return PokemonCard.detailRows(viewModel, { beforeRows: auctionRows }) + PokemonCard.ivGrid(viewModel);
    }

    function card(listing) {
        const viewModel = pokemonViewModel(listing);
        const badges = `<span class="auction-badges">${listing.is_mine ? '<span class="auction-badge">MEU</span>' : ''}${listing.favorited ? '<span class="auction-badge">FAVORITO</span>' : ''}</span>`;
        const expanded = state.expandAll
            ? !state.collapsedWhenAll.has(viewModel.key)
            : state.expandedIds.has(viewModel.key);
        const favoritePending = state.pendingFavoriteIds.has(listing.id);
        const cancelPending = state.actionRequest?.action === 'cancel' && state.actionRequest.listingId === listing.id;
        const cardAction = state.tab === 'mine'
            ? `<div class="auction-card-actions"><button type="button" class="px-btn auction-cancel listing-action" data-listing-id="${escapeHtml(listing.id)}" ${cancelPending || state.actionRequest ? 'disabled' : ''}>${cancelPending ? 'CANCELANDO…' : 'CANCELAR ANÚNCIO'}</button></div>`
            : `<div class="auction-card-actions"><button type="button" class="px-btn auction-favorite" data-listing-id="${escapeHtml(listing.id)}" aria-pressed="${listing.favorited}" aria-label="${listing.favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" data-tip="${listing.favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" ${favoritePending ? 'disabled' : ''}>${listing.favorited ? '★' : '☆'}</button></div>`;
        return PokemonCard.render(viewModel, {
            expanded,
            badgesHtml: badges,
            rightTopHtml: `<span class="auction-price">● ${money(listing.price)}</span><span class="pokemon-level">Lv. ${viewModel.level || '—'}</span>`,
            metaHtml: cardAction,
            detailsHtml: detailRows(listing, viewModel)
        });
    }

    function render() {
        if (state.tab === 'sell') { renderSellables(); return; }
        byId('auction-content').innerHTML = state.listings.length
            ? `<div class="pokemon-list auction-list">${state.listings.map(card).join('')}</div>`
            : '<p class="empty">Nenhum anúncio encontrado.</p>';
        byId('summary').textContent = `${state.listings.length}/${state.total} ANÚNCIO(S) CARREGADO(S)`;
        const expandButton = byId('expand-all-pokemon');
        expandButton.disabled = state.listings.length === 0;
        expandButton.setAttribute('aria-pressed', String(state.expandAll));
        expandButton.textContent = state.expandAll ? 'RECOLHER TODOS' : 'DETALHES DE TODOS';
        PokemonAbilityInfo.hydrate(byId('auction-content'));
        paintSentinel();
    }

    function sellCapacity() {
        const limit = state.vip === true ? 30 : 10;
        const active = Number.isInteger(state.mineTotal) ? state.mineTotal : null;
        return { limit, active, available: active === null ? 0 : Math.max(0, limit - active) };
    }

    function visibleSellables() {
        const query = byId('sell-search').value.trim().toLowerCase();
        return query ? state.sellables.filter((mon) => String(mon.snapshot?.name || mon.snapshot?.species || '').toLowerCase().includes(query)) : state.sellables;
    }

    function validSellPrice(value) {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 999999999;
    }

    function saleBusy() {
        return state.pendingQueueDraft !== null || state.listingQueue?.running === true || state.actionRequest?.action === 'list';
    }

    function sellableCard(mon) {
        const viewModel = sellableViewModel(mon);
        const selected = state.selectedSellableIds.has(mon.id);
        const price = state.sellPrices.get(mon.id) || '';
        const warnings = `${mon.snapshot?.shiny ? '<span class="sell-warning">SHINY</span>' : ''}${mon.snapshot?.heldItem ? `<span class="sell-warning">ITEM: ${escapeHtml(formatText(mon.snapshot.heldItem))}</span>` : ''}`;
        const badges = `<span class="auction-badges"><span class="auction-badge">${mon.location === 'party' ? 'PARTY' : 'PC'}</span>${mon.raidLockH > 0 ? '<span class="auction-badge">LOCK DE RAID</span>' : ''}${warnings}</span>`;
        const expanded = state.expandAll ? !state.collapsedWhenAll.has(viewModel.key) : state.expandedIds.has(viewModel.key);
        const busy = saleBusy();
        const meta = `<div class="sell-card-meta"><label class="sell-select"><input class="sell-checkbox" type="checkbox" data-mon-id="${mon.id}" ${selected ? 'checked' : ''} ${busy ? 'disabled' : ''}> SELECIONAR</label><input class="px-input sell-price" type="number" min="1" max="999999999" step="1" data-mon-id="${mon.id}" value="${escapeHtml(price)}" placeholder="Preço individual" aria-label="Preço de ${escapeHtml(viewModel.name)}" ${busy ? 'disabled' : ''}></div>`;
        return PokemonCard.render(viewModel, {
            expanded,
            className: selected ? 'sell-selected' : '',
            badgesHtml: badges,
            metaHtml: meta,
            detailsHtml: PokemonCard.detailRows(viewModel) + PokemonCard.ivGrid(viewModel)
        });
    }

    function reviewSellableCard(mon, price, status = null, listingId = null) {
        const viewModel = sellableViewModel(mon);
        viewModel.key = `sell-review:${mon.id}:${status || 'draft'}`;
        const labels = { pending: 'PENDENTE', running: 'ENVIANDO…', success: 'ANUNCIADO', error: 'FALHA', not_sent: 'NÃO ENVIADO' };
        const statusHtml = status ? `<span class="sell-queue-status ${status === 'success' ? 'success' : status === 'error' || status === 'not_sent' ? 'error' : ''}">${labels[status]}${listingId ? ` #${escapeHtml(listingId)}` : ''}</span>` : '';
        const warnings = `${mon.snapshot?.shiny ? '<span class="sell-warning">SHINY</span>' : ''}${mon.snapshot?.heldItem ? `<span class="sell-warning">ITEM: ${escapeHtml(formatText(mon.snapshot.heldItem))}</span>` : ''}`;
        const badges = `<span class="auction-badges"><span class="auction-badge">${mon.location === 'party' ? 'PARTY' : 'PC'}</span>${mon.raidLockH > 0 ? '<span class="auction-badge">LOCK DE RAID</span>' : ''}${warnings}${statusHtml}</span>`;
        return PokemonCard.render(viewModel, {
            expanded: false,
            className: 'sell-review-card',
            badgesHtml: badges,
            rightTopHtml: `<span class="auction-price">● ${money(price)}</span><span class="pokemon-level">Lv. ${viewModel.level || '—'}</span>`,
            detailsHtml: PokemonCard.detailRows(viewModel) + PokemonCard.ivGrid(viewModel)
        });
    }

    function renderSellables() {
        if (state.tab !== 'sell') return;
        const visible = visibleSellables();
        const groups = [['party', 'PARTY'], ['pc', 'PC']].map(([location, label]) => {
            const mons = visible.filter((mon) => mon.location === location);
            return mons.length ? `<h2 class="sell-group-title">${label} · ${mons.length}</h2><div class="pokemon-list auction-list">${mons.map(sellableCard).join('')}</div>` : '';
        }).join('');
        byId('auction-content').innerHTML = groups || '<p class="empty">Nenhum Pokémon vendável encontrado.</p>';
        const capacity = sellCapacity();
        const selected = state.selectedSellableIds.size;
        const valid = [...state.selectedSellableIds].every((id) => validSellPrice(state.sellPrices.get(id)));
        byId('summary').textContent = `${state.sellables.length} POKÉMON VENDÁVEL(IS)`;
        byId('sell-selection-summary').textContent = `${selected} selecionado(s)`;
        byId('sell-capacity').textContent = capacity.active === null
            ? `Capacidade: verificando… (limite ${capacity.limit})`
            : `Anúncios: ${capacity.active}/${capacity.limit} · disponíveis: ${capacity.available}`;
        const busy = saleBusy();
        byId('sell-review-button').disabled = selected === 0 || !valid || selected > capacity.available || busy;
        byId('sell-select-visible').disabled = busy;
        byId('sell-clear-selection').disabled = busy;
        byId('sell-apply-price').disabled = busy;
        const expandButton = byId('expand-all-pokemon');
        expandButton.disabled = visible.length === 0;
        expandButton.setAttribute('aria-pressed', String(state.expandAll));
        expandButton.textContent = state.expandAll ? 'RECOLHER TODOS' : 'DETALHES DE TODOS';
        PokemonAbilityInfo.hydrate(byId('auction-content'));
        byId('auction-sentinel').textContent = '';
    }

    function showSellReview() {
        const selected = state.sellables.filter((mon) => state.selectedSellableIds.has(mon.id));
        const capacity = sellCapacity();
        if (!selected.length || selected.length > capacity.available || selected.some((mon) => !validSellPrice(state.sellPrices.get(mon.id)))) return;
        const total = selected.reduce((sum, mon) => sum + Number(state.sellPrices.get(mon.id)), 0);
        const risky = selected.filter((mon) => mon.snapshot?.shiny || mon.snapshot?.heldItem);
        const cards = selected.map((mon) => reviewSellableCard(mon, state.sellPrices.get(mon.id))).join('');
        const review = byId('sell-review');
        const label = selected.length === 1 ? 'ANUNCIAR ESTE POKÉMON' : `ANUNCIAR ${selected.length} POKÉMON EM SEQUÊNCIA`;
        review.innerHTML = `<h2>REVISÃO DO${selected.length === 1 ? '' : 'S'} ANÚNCIO${selected.length === 1 ? '' : 'S'}</h2><p>${selected.length} Pokémon · bruto ${money(total)} · líquido estimado ${money(Math.floor(total * .95))}</p><div class="pokemon-list sell-review-cards">${cards}</div>${risky.length ? `<p class="sell-warning">${risky.length} Pokémon exigirá(ão) dupla confirmação por ser shiny e/ou segurar item. O item será vendido junto.</p>` : ''}<button id="sell-publish-queue" class="px-btn listing-action" type="button">${label}</button>`;
        review.hidden = false;
        PokemonAbilityInfo.hydrate(review);
        review.scrollIntoView({ block: 'nearest' });
    }

    function startListingQueue() {
        if (state.actionRequest || saleBusy() || state.selectedSellableIds.size === 0) return;
        const items = state.sellables.filter((mon) => state.selectedSellableIds.has(mon.id)).map((mon) => ({
            monId: mon.id,
            price: Number(state.sellPrices.get(mon.id)),
            name: mon.snapshot?.name || mon.snapshot?.species || 'Pokémon',
            shiny: mon.snapshot?.shiny === true,
            heldItem: mon.snapshot?.heldItem || null,
            mon,
            status: 'pending', listingId: null, error: null
        }));
        if (!items.length || items.some((item) => !validSellPrice(item.price))) return;
        state.pendingQueueDraft = { items };
        favoriteFeedback('Revalidando o limite de anúncios…');
        renderSellables();
        requestMineCount('publish');
    }

    function confirmAndStartQueue() {
        const draft = state.pendingQueueDraft;
        state.pendingQueueDraft = null;
        if (!draft?.items?.length || state.actionRequest) return;
        const capacity = sellCapacity();
        if (capacity.available < draft.items.length) { favoriteFeedback('Não há capacidade para todos os anúncios selecionados.', true); renderSellables(); return; }
        const total = draft.items.reduce((sum, item) => sum + item.price, 0);
        if (!window.confirm(`Anunciar ${draft.items.length} Pokémon, um por vez, pelo total de ${money(total)}? Não existe rollback se apenas parte da fila funcionar.`)) { renderSellables(); return; }
        const risky = draft.items.filter((item) => item.shiny || item.heldItem);
        if (risky.length && !window.confirm(`ATENÇÃO: ${risky.length} Pokémon da fila são shiny e/ou seguram item. Os itens serão vendidos junto. Confirme novamente para continuar.`)) { renderSellables(); return; }
        state.listingQueue = { items: draft.items, index: 0, running: true, paused: false, finished: false };
        favoriteFeedback('Iniciando fila de anúncios…');
        renderSellables();
        renderQueueReview();
        runNextQueueItem();
    }

    function renderQueueReview() {
        const queue = state.listingQueue;
        if (!queue) return;
        const cards = queue.items.map((item) => reviewSellableCard(item.mon, item.price, item.status, item.listingId)).join('');
        const success = queue.items.filter((item) => item.status === 'success').length;
        const failed = queue.items.filter((item) => item.status === 'error').length;
        const pending = queue.items.filter((item) => item.status === 'pending' || item.status === 'running' || item.status === 'not_sent').length;
        byId('sell-review').innerHTML = `<h2>FILA DE ANÚNCIOS</h2><p>${success} anunciado(s) · ${failed} falha(s) · ${pending} pendente(s)</p><div class="pokemon-list sell-review-cards">${cards}</div>${queue.paused ? '<p class="error">Fila interrompida por uma falha ambígua. Os itens restantes não foram enviados.</p>' : queue.finished ? '<p>Fila concluída. Vendáveis e Meus anúncios estão sendo atualizados.</p>' : '<p>Não feche ou recarregue a extensão durante o envio.</p>'}`;
        byId('sell-review').hidden = false;
        PokemonAbilityInfo.hydrate(byId('sell-review'));
    }

    function runNextQueueItem() {
        const queue = state.listingQueue;
        if (!queue?.running || state.actionRequest) return;
        if (queue.index >= queue.items.length) { finishListingQueue(false); return; }
        const item = queue.items[queue.index];
        item.status = 'running';
        const requestId = `list-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        state.actionRequest = { requestId, action: 'list', monId: item.monId, queueIndex: queue.index, generation: state.generation };
        favoriteFeedback(`Publicando ${queue.index + 1}/${queue.items.length}: ${item.name}…`);
        renderSellables();
        renderQueueReview();
        window.parent.postMessage({ type: 'auction-command', action: 'list', requestId, params: { monId: item.monId, price: item.price } }, '*');
        window.setTimeout(() => {
            if (state.actionRequest?.requestId !== requestId) return;
            state.actionRequest = null;
            item.status = 'error';
            item.error = 'TIMEOUT';
            finishListingQueue(true);
        }, 15000);
    }

    function finishListingQueue(paused) {
        const queue = state.listingQueue;
        if (!queue) return;
        queue.running = false;
        queue.paused = paused;
        queue.finished = !paused;
        if (paused) queue.items.forEach((item) => { if (item.status === 'pending') item.status = 'not_sent'; });
        state.actionRequest = null;
        state.mineTotal = null;
        favoriteFeedback(paused ? 'Fila interrompida sem retry automático.' : 'Fila concluída. Atualizando dados.', paused);
        renderSellables();
        renderQueueReview();
        requestSellables();
    }

    function recoverCancelFailure() {
        window.alert('Não foi possível realizar a operação, necessário voltar para o inicio do leilão');
        state.actionRequest = null;
        state.tab = 'browse';
        setSellMode(false);
        document.querySelectorAll('.auction-tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === 'browse')));
        resetAndLoad();
    }

    function requestCancel(listingId) {
        if (state.actionRequest || state.tab !== 'mine') return;
        const listing = state.listings.find((item) => item.id === listingId && item.is_mine);
        if (!listing) return;
        const name = listing.snapshot?.name || listing.snapshot?.species || 'Pokémon';
        if (!window.confirm(`Cancelar o anúncio de ${name}, Lv. ${listing.snapshot?.level || '—'}, por ${money(listing.price)}?`)) return;
        const requestId = `cancel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        state.actionRequest = { requestId, action: 'cancel', listingId, generation: state.generation };
        render();
        window.parent.postMessage({ type: 'auction-command', action: 'cancel', requestId, params: { listingId } }, '*');
        window.setTimeout(() => { if (state.actionRequest?.requestId === requestId) recoverCancelFailure(); }, 15000);
    }

    function paintSentinel() {
        const sentinel = byId('auction-sentinel');
        sentinel.classList.remove('can-load');
        if (state.tab === 'sell') { sentinel.textContent = ''; return; }
        if (!state.authenticated || state.pages === 0) { sentinel.textContent = ''; return; }
        if (state.loading && state.page > 0) { sentinel.textContent = 'CARREGANDO MAIS…'; return; }
        if (state.incrementalError) { sentinel.innerHTML = `<span class="error">${escapeHtml(state.incrementalError)}</span>&nbsp;<button class="px-btn" id="retry-next" type="button">TENTAR NOVAMENTE</button>`; return; }
        const canLoad = state.page < state.pages;
        sentinel.classList.toggle('can-load', canLoad);
        sentinel.textContent = canLoad ? 'CLIQUE OU ROLE PARA CARREGAR MAIS' : 'TODOS OS ANÚNCIOS FORAM CARREGADOS';
    }

    function maybeLoadNext() {
        if (!state.authenticated || state.loading || state.incrementalError || state.page < 2 || state.page >= state.pages) return;
        requestPage(state.page + 1);
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window.parent || event.data?.type !== 'auction-result') return;
        const result = event.data.result;
        if (!result) return;
        if (result.action === 'bootstrap' && result.requestId === null) { applyBootstrap(result.data); return; }
        if (result.action === 'sellables') {
            if (result.requestId !== state.sellRequestId) return;
            state.sellRequestId = null;
            if (!result.ok) {
                if (result.error?.code === 'AUTH_REQUIRED') { showWaiting(); return; }
                showInitialError(result.error?.message || 'Não foi possível carregar os Pokémon vendáveis.');
                return;
            }
            state.sellables = Array.isArray(result.data?.mons) ? result.data.mons : [];
            const sellableIds = new Set(state.sellables.map((mon) => mon.id));
            state.selectedSellableIds = new Set([...state.selectedSellableIds].filter((id) => sellableIds.has(id)));
            state.sellPrices = new Map([...state.sellPrices].filter(([id]) => sellableIds.has(id)));
            renderSellables();
            requestMineCount();
            return;
        }
        if (result.action === 'favorite') {
            const request = state.favoriteRequests.get(result.requestId);
            if (!request) return;
            state.favoriteRequests.delete(result.requestId);
            state.pendingFavoriteIds.delete(request.listingId);
            if (request.generation !== state.generation) return;
            if (!result.ok) {
                if (result.error?.code === 'AUTH_REQUIRED') { showWaiting(); return; }
                favoriteFeedback(result.error?.message || 'Não foi possível alterar o favorito. A listagem será atualizada.', true);
                render();
                resetAndLoad();
                return;
            }
            const listing = state.listings.find((item) => item.id === request.listingId);
            if (!listing || result.data?.ok !== true || result.data?.on !== request.on) {
                favoriteFeedback('A resposta do favorito não pôde ser confirmada. A listagem será atualizada.', true);
                resetAndLoad();
                return;
            }
            if (state.tab === 'favorites' && request.on === false) {
                state.listings = state.listings.filter((item) => item.id !== request.listingId);
                state.listingIds.delete(request.listingId);
                state.total = Math.max(0, state.total - 1);
            } else {
                listing.favorited = request.on;
            }
            favoriteFeedback(request.on ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
            render();
            return;
        }
        if (result.action === 'list' || result.action === 'cancel') {
            const request = state.actionRequest;
            if (!request || result.requestId !== request.requestId || result.action !== request.action) return;
            state.actionRequest = null;
            if (result.action === 'cancel') {
                if (!result.ok) { recoverCancelFailure(); return; }
                state.listings = state.listings.filter((listing) => listing.id !== request.listingId);
                state.listingIds.delete(request.listingId);
                state.total = Math.max(0, state.total - 1);
                favoriteFeedback('Anúncio cancelado. Atualizando Meus anúncios.');
                resetAndLoad();
                return;
            }
            const queue = state.listingQueue;
            const item = queue?.items?.[request.queueIndex];
            if (!queue?.running || !item || item.monId !== request.monId) return;
            if (!result.ok) {
                item.status = 'error';
                item.error = result.error?.code || 'UNKNOWN';
                if (result.error?.code === 'AUTH_REQUIRED') {
                    queue.running = false;
                    queue.paused = true;
                    queue.items.forEach((queued) => { if (queued.status === 'pending') queued.status = 'not_sent'; });
                    showWaiting();
                    return;
                }
                if (['INVALID_PARAMS', 'LIST_REJECTED'].includes(result.error?.code)) {
                    queue.index += 1;
                    favoriteFeedback(`${item.name} não foi anunciado; seguindo para o próximo.`, true);
                    renderSellables();
                    renderQueueReview();
                    window.setTimeout(runNextQueueItem, 0);
                } else {
                    finishListingQueue(true);
                }
                return;
            }
            item.status = 'success';
            item.listingId = result.data?.listingId || null;
            state.selectedSellableIds.delete(request.monId);
            state.sellPrices.delete(request.monId);
            state.sellables = state.sellables.filter((mon) => mon.id !== request.monId);
            state.mineTotal = Number.isInteger(state.mineTotal) ? state.mineTotal + 1 : null;
            queue.index += 1;
            favoriteFeedback(`${item.name} anunciado com sucesso.`);
            renderSellables();
            renderQueueReview();
            window.setTimeout(runNextQueueItem, 0);
            return;
        }
        if (result.requestId !== state.activeRequest?.requestId) return;
        const request = state.activeRequest;
        if (request.generation !== state.generation) return;
        state.loading = false; state.activeRequest = null;
        if (result.action === 'bootstrap') { applyBootstrap(result.data); return; }
        if (request.kind === 'mine-count') {
            if (!result.ok) {
                if (result.error?.code === 'AUTH_REQUIRED') { showWaiting(); return; }
                state.pendingQueueDraft = null;
                favoriteFeedback('Não foi possível verificar o limite de anúncios.', true);
            } else {
                state.mineTotal = Number.isInteger(result.data?.total) ? result.data.total : 0;
            }
            renderSellables();
            if (result.ok && request.purpose === 'publish') confirmAndStartQueue();
            return;
        }
        if (!result.ok) {
            if (result.error?.code === 'AUTH_REQUIRED') { showWaiting(); return; }
            if (request.replace) showInitialError(result.error?.message || 'Não foi possível consultar o leilão.');
            else { state.incrementalError = result.error?.message || 'Não foi possível carregar a próxima página.'; paintSentinel(); }
            return;
        }
        appendPage(result.data, request.replace);
    });

    window.addEventListener('message', (event) => {
        if (event.source !== window.parent || event.data?.type !== 'auction-character-meta' || typeof event.data.vip !== 'boolean') return;
        state.vip = event.data.vip;
        if (state.tab === 'sell') renderSellables();
    });

    document.querySelector('.auction-tabs').addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]'); if (!button || button.dataset.tab === state.tab) return;
        if (state.actionRequest || saleBusy()) { favoriteFeedback('Aguarde a operação atual terminar.', true); return; }
        if (button.dataset.tab === 'sell') { enterSellMode(); return; }
        window.clearTimeout(searchTimer);
        state.tab = button.dataset.tab;
        setSellMode(false);
        document.querySelectorAll('.auction-tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab === button)));
        resetAndLoad();
    });
    byId('auction-filters').addEventListener('submit', (event) => { event.preventDefault(); if (state.actionRequest || saleBusy()) return; window.clearTimeout(searchTimer); resetAndLoad(); });
    const scheduleNameSearch = () => {
        window.clearTimeout(searchTimer);
        if (searchComposing || state.actionRequest || saleBusy()) return;
        searchTimer = window.setTimeout(resetAndLoad, 700);
    };
    byId('name-search').addEventListener('compositionstart', () => { searchComposing = true; window.clearTimeout(searchTimer); });
    byId('name-search').addEventListener('compositionend', () => { searchComposing = false; scheduleNameSearch(); });
    byId('name-search').addEventListener('input', scheduleNameSearch);
    byId('refresh').addEventListener('click', () => {
        if (state.actionRequest || saleBusy()) { favoriteFeedback('Aguarde a operação atual terminar.', true); return; }
        window.clearTimeout(searchTimer);
        if (state.tab === 'sell') {
            state.generation += 1;
            state.activeRequest = null;
            state.sellRequestId = null;
            state.mineTotal = null;
            requestSellables();
            return;
        }
        resetAndLoad();
    });
    byId('expand-all-pokemon').addEventListener('click', () => {
        state.expandAll = !state.expandAll;
        state.expandedIds.clear();
        state.collapsedWhenAll.clear();
        render();
    });
    byId('clear').addEventListener('click', () => { if (state.actionRequest || saleBusy()) return; window.clearTimeout(searchTimer); byId('auction-filters').reset(); byId('level-min').value = 1; byId('level-max').value = 100; byId('price-min').value = 0; resetAndLoad(); });
    byId('auction-content').addEventListener('click', (event) => {
        const cancelButton = event.target.closest('.auction-cancel');
        if (cancelButton) { requestCancel(cancelButton.dataset.listingId); return; }
        const favoriteButton = event.target.closest('.auction-favorite');
        if (favoriteButton) { requestFavorite(favoriteButton.dataset.listingId); return; }
        const button = event.target.closest('.pokemon-card-toggle'); if (!button) return;
        const cardElement = button.closest('.pokemon-card');
        const details = cardElement?.querySelector('.pokemon-details'); if (!details) return;
        const key = cardElement.dataset.pokemonKey;
        if (state.expandAll) {
            if (details.hidden) state.collapsedWhenAll.delete(key);
            else state.collapsedWhenAll.add(key);
        } else if (details.hidden) state.expandedIds.add(key);
        else state.expandedIds.delete(key);
        details.hidden = !details.hidden; button.setAttribute('aria-expanded', String(!details.hidden));
    });
    byId('auction-content').addEventListener('change', (event) => {
        const checkbox = event.target.closest('.sell-checkbox');
        if (!checkbox || state.tab !== 'sell') return;
        if (state.actionRequest || saleBusy()) { checkbox.checked = state.selectedSellableIds.has(checkbox.dataset.monId); return; }
        const id = checkbox.dataset.monId;
        const capacity = sellCapacity();
        if (checkbox.checked) {
            if (capacity.active === null || state.selectedSellableIds.size >= capacity.available) {
                checkbox.checked = false;
                favoriteFeedback(capacity.active === null ? 'Aguarde a verificação do limite de anúncios.' : 'O limite de anúncios foi atingido.', true);
                return;
            }
            state.selectedSellableIds.add(id);
        } else {
            state.selectedSellableIds.delete(id);
        }
        byId('sell-review').hidden = true;
        renderSellables();
    });
    byId('auction-content').addEventListener('input', (event) => {
        const input = event.target.closest('.sell-price');
        if (!input || state.tab !== 'sell') return;
        if (state.actionRequest || saleBusy()) return;
        state.sellPrices.set(input.dataset.monId, input.value);
        byId('sell-review').hidden = true;
        const selected = state.selectedSellableIds.size;
        const capacity = sellCapacity();
        byId('sell-review-button').disabled = selected === 0 || selected > capacity.available || [...state.selectedSellableIds].some((id) => !validSellPrice(state.sellPrices.get(id)));
    });
    byId('sell-search').addEventListener('input', () => { if (saleBusy()) return; byId('sell-review').hidden = true; renderSellables(); });
    byId('sell-clear-selection').addEventListener('click', () => { if (state.actionRequest || saleBusy()) return; state.selectedSellableIds.clear(); byId('sell-review').hidden = true; renderSellables(); });
    byId('sell-select-visible').addEventListener('click', () => {
        if (state.actionRequest || saleBusy()) return;
        const capacity = sellCapacity();
        if (capacity.active === null) { favoriteFeedback('Aguarde a verificação do limite de anúncios.', true); return; }
        const slots = Math.max(0, capacity.available - state.selectedSellableIds.size);
        visibleSellables().filter((mon) => !state.selectedSellableIds.has(mon.id)).slice(0, slots).forEach((mon) => state.selectedSellableIds.add(mon.id));
        if (slots === 0) favoriteFeedback('O limite de anúncios foi atingido.', true);
        byId('sell-review').hidden = true;
        renderSellables();
    });
    byId('sell-apply-price').addEventListener('click', () => {
        if (state.actionRequest || saleBusy()) return;
        const value = byId('sell-common-price').value;
        if (!validSellPrice(value) || state.selectedSellableIds.size === 0) { favoriteFeedback('Informe um preço válido e selecione ao menos um Pokémon.', true); return; }
        const overwrites = [...state.selectedSellableIds].some((id) => state.sellPrices.has(id) && state.sellPrices.get(id) !== value);
        if (overwrites && !window.confirm('Substituir os preços individuais dos Pokémon selecionados?')) return;
        state.selectedSellableIds.forEach((id) => state.sellPrices.set(id, value));
        favoriteFeedback('Preço aplicado aos Pokémon selecionados.');
        byId('sell-review').hidden = true;
        renderSellables();
    });
    byId('sell-review-button').addEventListener('click', showSellReview);
    byId('sell-review').addEventListener('click', (event) => {
        if (event.target.closest('#sell-publish-queue')) { startListingQueue(); return; }
        const button = event.target.closest('.pokemon-card-toggle');
        if (!button) return;
        const details = button.closest('.pokemon-card')?.querySelector('.pokemon-details');
        if (!details) return;
        details.hidden = !details.hidden;
        button.setAttribute('aria-expanded', String(!details.hidden));
    });
    byId('auction-sentinel').addEventListener('click', (event) => {
        if (event.target.closest('#retry-next')) state.incrementalError = null;
        maybeLoadNext();
    });

    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) maybeLoadNext(); }, { rootMargin: '240px 0px' }).observe(byId('auction-sentinel'));
    }
    window.addEventListener('scroll', () => {
        const sentinel = byId('auction-sentinel');
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 240) maybeLoadNext();
    }, { passive: true });

    window.addEventListener('beforeunload', (event) => {
        if (!state.listingQueue?.running) return;
        event.preventDefault();
        event.returnValue = '';
    });

    setupOptions();
    requestBootstrap();
})();
