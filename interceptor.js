// Roda no MAIN world da página (não no isolated world do content script),
// porque só ali dá pra sobrescrever o window.fetch que o próprio jogo usa.
(function () {
    // Fica numa propriedade de window (não numa const fechada no escopo) pra
    // que reinjeções futuras (próximo clique no ícone) consigam atualizar o
    // padrão sem precisar recarregar a página — só o fetch em si é
    // sobrescrito uma única vez, o padrão de URL pode mudar depois.
    window.__pkmnHelperBattleUrlRe = /\/battle\//;
    window.__pkmnHelperCharacterUrlRe = /\/character/;

    window.__pkmnHelperAuctionUrlRe = /\/api\/auction\//;

    // Bridge estreito do leilão. A autenticação nasce exclusivamente de uma
    // request real do jogo e permanece no MAIN world, em memória.
    if (!window.__pkmnHelperAuctionBridgeAdded) {
        window.__pkmnHelperAuctionBridgeAdded = true;
        const allowedTabs = new Set(['browse', 'mine', 'favorites']);
        const allowedKinds = new Set(['mon', 'item', 'skin']);
        const allowedSorts = new Set(['new', 'price_asc', 'price_desc', 'ending']);
        const knownListingIds = new Set();
        const knownMineListingIds = new Set();
        const knownSellableMonIds = new Set();
        const intParam = (value, min, max) => {
            if (value === null || value === undefined || value === '') return null;
            const number = Number(value);
            return Number.isInteger(number) && number >= min && number <= max ? number : null;
        };
        const safeText = (value, max = 80) => typeof value === 'string' ? value.slice(0, max) : '';
        const sanitizeListing = (listing) => ({
            id: safeText(String(listing?.id ?? ''), 32),
            kind: allowedKinds.has(listing?.kind) ? listing.kind : 'mon',
            price: safeText(String(listing?.price ?? ''), 24),
            snapshot: listing?.snapshot && typeof listing.snapshot === 'object' ? {
                kind: 'mon',
                name: safeText(listing.snapshot.name),
                species: safeText(listing.snapshot.species),
                level: intParam(listing.snapshot.level, 0, 1000),
                shiny: listing.snapshot.shiny === true,
                types: Array.isArray(listing.snapshot.types) ? listing.snapshot.types.slice(0, 2).map(Number).filter(Number.isFinite) : [],
                gender: safeText(listing.snapshot.gender, 12),
                nature: safeText(listing.snapshot.nature),
                ability: safeText(listing.snapshot.ability),
                heldItem: listing.snapshot.heldItem == null ? null : safeText(listing.snapshot.heldItem),
                catchRate: intParam(listing.snapshot.catchRate, 0, 10000),
                ivs: Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map((key) => [key, intParam(listing.snapshot.ivs?.[key], 0, 31) ?? 0]))
            } : null,
            seller_name: safeText(listing?.seller_name),
            seller_id: safeText(String(listing?.seller_id ?? ''), 32),
            expires_at: safeText(listing?.expires_at, 40),
            created_at: safeText(listing?.created_at, 40),
            is_mine: listing?.is_mine === true,
            favorited: listing?.favorited === true
        });
        const sanitizeSellableMon = (mon) => {
            const id = safeText(String(mon?.id ?? ''), 32);
            if (!/^\d{1,32}$/.test(id) || !mon?.snapshot || typeof mon.snapshot !== 'object') return null;
            const sanitized = sanitizeListing({ id, snapshot: mon.snapshot }).snapshot;
            if (!sanitized) return null;
            return {
                id,
                location: mon.location === 'party' ? 'party' : 'pc',
                snapshot: sanitized,
                raidLockH: intParam(mon.raidLockH, 0, 100000) || 0
            };
        };
        const sanitizeBrowse = (data) => {
            if (!data?.ok || !Array.isArray(data.listings)) return null;
            const listings = data.listings.map(sanitizeListing);
            listings.forEach((listing) => {
                if (listing.id) knownListingIds.add(listing.id);
                if (listing.id && listing.is_mine) knownMineListingIds.add(listing.id);
            });
            return {
                listings,
                total: intParam(data.total, 0, 10000000) || 0,
                page: intParam(data.page, 1, 100000) || 1,
                pageSize: intParam(data.pageSize, 1, 1000) || data.listings.length,
                pages: intParam(data.pages, 0, 100000) || 0
            };
        };
        const parseBrowseParams = (url) => {
            const search = new URL(url, window.location.href).searchParams;
            const params = {
                tab: allowedTabs.has(search.get('tab')) ? search.get('tab') : 'browse',
                page: intParam(search.get('page'), 1, 100000) || 1,
                kind: allowedKinds.has(search.get('kind')) ? search.get('kind') : 'mon',
                sort: allowedSorts.has(search.get('sort')) ? search.get('sort') : 'new'
            };
            [['levelMin', 1, 100], ['levelMax', 1, 100], ['priceMin', 0, 999999999], ['priceMax', 0, 999999999], ['type', 0, 18]].forEach(([key, min, max]) => {
                const value = intParam(search.get(key), min, max);
                if (value !== null) params[key] = value;
            });
            if (search.get('shiny') === '1') params.shiny = true;
            if (search.get('perfect') === '1') params.perfect = true;
            if (/^[A-Za-z-]{1,24}$/.test(search.get('nature') || '')) params.nature = search.get('nature');
            const nameQuery = (search.get('q') || '').trim().slice(0, 40);
            if (/^[A-Za-z0-9 .'-]+$/.test(nameQuery)) params.q = nameQuery;
            return params;
        };
        const dispatchResult = (detail) => window.dispatchEvent(new CustomEvent('pkmn-helper-auction-result', { detail }));
        window.__pkmnHelperSanitizeAuctionBrowse = sanitizeBrowse;
        window.__pkmnHelperParseAuctionBrowseParams = parseBrowseParams;
        window.__pkmnHelperPublishAuctionBootstrap = (browse, params = null) => {
            if (browse) window.__pkmnHelperAuctionBootstrap = { tab: params?.tab || 'browse', params, browse };
            dispatchResult({ requestId: null, action: 'bootstrap', ok: true, data: {
                status: window.__pkmnHelperAuctionAuth ? 'ready' : 'waiting',
                tab: window.__pkmnHelperAuctionBootstrap?.tab || null,
                params: window.__pkmnHelperAuctionBootstrap?.params || null,
                browse: window.__pkmnHelperAuctionBootstrap?.browse || null
            } });
        };

        window.addEventListener('pkmn-helper-auction-command', async (event) => {
            const detail = event.detail;
            if (!detail || !['bootstrap', 'browse', 'favorite', 'sellables', 'list', 'cancel'].includes(detail.action) || typeof detail.requestId !== 'string') return;
            if (detail.action === 'bootstrap') {
                dispatchResult({ requestId: detail.requestId, action: 'bootstrap', ok: true, data: {
                    status: window.__pkmnHelperAuctionAuth ? 'ready' : 'waiting',
                    tab: window.__pkmnHelperAuctionBootstrap?.tab || null,
                    params: window.__pkmnHelperAuctionBootstrap?.params || null,
                    browse: window.__pkmnHelperAuctionBootstrap?.browse || null
                } });
                return;
            }
            if (!window.__pkmnHelperAuctionAuth) {
                dispatchResult({ requestId: detail.requestId, action: detail.action, ok: false,
                    error: { code: 'AUTH_REQUIRED', message: 'Abra o leilão no jogo para conectar.' } });
                return;
            }
            if (detail.action === 'favorite') {
                const listingId = safeText(String(detail.params?.listingId ?? ''), 32);
                const on = detail.params?.on;
                const result = { requestId: detail.requestId, action: 'favorite', ok: false };
                if (!/^\d{1,32}$/.test(listingId) || !knownListingIds.has(listingId) || typeof on !== 'boolean') {
                    result.error = { code: 'INVALID_PARAMS', message: 'Não foi possível alterar o favorito.' };
                    dispatchResult(result);
                    return;
                }
                try {
                    const fetchImpl = window.__pkmnHelperOriginalFetch || window.fetch;
                    const response = await fetchImpl.call(window, '/api/auction/favorite', {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            Accept: 'application/json',
                            'Content-Type': 'application/json',
                            Authorization: window.__pkmnHelperAuctionAuth
                        },
                        body: JSON.stringify({ listingId, on })
                    });
                    if (response.status === 401 || response.status === 403) {
                        delete window.__pkmnHelperAuctionAuth;
                        delete window.__pkmnHelperAuctionBootstrap;
                        throw Object.assign(new Error('Abra o leilão no jogo para reconectar.'), { code: 'AUTH_REQUIRED' });
                    }
                    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { code: 'HTTP' });
                    const data = await response.json();
                    if (data?.ok !== true || data?.on !== on) throw Object.assign(new Error('Resposta inválida'), { code: 'INVALID_RESPONSE' });
                    result.ok = true;
                    result.data = { ok: true, on };
                } catch (error) {
                    result.error = {
                        code: error?.code || 'NETWORK',
                        message: error?.code === 'AUTH_REQUIRED' ? error.message : 'Não foi possível alterar o favorito.'
                    };
                }
                dispatchResult(result);
                return;
            }
            if (detail.action === 'sellables') {
                const result = { requestId: detail.requestId, action: 'sellables', ok: false };
                try {
                    const fetchImpl = window.__pkmnHelperOriginalFetch || window.fetch;
                    const response = await fetchImpl.call(window, '/api/auction/sellables', {
                        credentials: 'include',
                        headers: { Accept: 'application/json', Authorization: window.__pkmnHelperAuctionAuth }
                    });
                    if (response.status === 401 || response.status === 403) {
                        delete window.__pkmnHelperAuctionAuth;
                        delete window.__pkmnHelperAuctionBootstrap;
                        throw Object.assign(new Error('Abra o leilão no jogo para reconectar.'), { code: 'AUTH_REQUIRED' });
                    }
                    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { code: 'HTTP' });
                    const data = await response.json();
                    if (data?.ok !== true || !Array.isArray(data.mons)) throw Object.assign(new Error('Resposta inválida'), { code: 'INVALID_RESPONSE' });
                    const mons = data.mons.map(sanitizeSellableMon).filter(Boolean);
                    knownSellableMonIds.clear();
                    mons.forEach((mon) => knownSellableMonIds.add(mon.id));
                    result.ok = true;
                    result.data = {
                        mons,
                        count: intParam(data.count, 0, 100000) ?? data.mons.length
                    };
                } catch (error) {
                    result.error = {
                        code: error?.code || 'NETWORK',
                        message: error?.code === 'AUTH_REQUIRED' ? error.message : 'Não foi possível carregar os Pokémon vendáveis.'
                    };
                }
                dispatchResult(result);
                return;
            }
            if (detail.action === 'list') {
                const monId = safeText(String(detail.params?.monId ?? ''), 32);
                const monIdNumber = intParam(monId, 1, Number.MAX_SAFE_INTEGER);
                const price = intParam(detail.params?.price, 1, 999999999);
                const result = { requestId: detail.requestId, action: 'list', ok: false };
                if (monIdNumber === null || !knownSellableMonIds.has(monId) || price === null) {
                    result.error = { code: 'INVALID_PARAMS', message: 'Pokémon ou preço inválido.' };
                    dispatchResult(result);
                    return;
                }
                try {
                    const fetchImpl = window.__pkmnHelperOriginalFetch || window.fetch;
                    const response = await fetchImpl.call(window, '/api/auction/list', {
                        method: 'POST', credentials: 'include',
                        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: window.__pkmnHelperAuctionAuth },
                        body: JSON.stringify({ kind: 'mon', monId: monIdNumber, price })
                    });
                    if (response.status === 401 || response.status === 403) {
                        delete window.__pkmnHelperAuctionAuth;
                        delete window.__pkmnHelperAuctionBootstrap;
                        throw Object.assign(new Error('Abra o leilão no jogo para reconectar.'), { code: 'AUTH_REQUIRED' });
                    }
                    if (response.status === 429) throw Object.assign(new Error('Muitas operações em pouco tempo. Aguarde antes de tentar novamente.'), { code: 'RATE_LIMIT' });
                    const data = await response.json().catch(() => null);
                    if (!response.ok || data?.ok !== true || !/^\d{1,32}$/.test(String(data.listingId ?? ''))) {
                        throw Object.assign(new Error('O servidor recusou o anúncio. Atualize os vendáveis antes de tentar novamente.'), { code: 'LIST_REJECTED' });
                    }
                    knownSellableMonIds.delete(monId);
                    result.ok = true;
                    result.data = { ok: true, listingId: safeText(String(data.listingId), 32) };
                } catch (error) {
                    result.error = { code: error?.code || 'NETWORK', message: error?.message || 'Não foi possível anunciar o Pokémon.' };
                }
                dispatchResult(result);
                return;
            }
            if (detail.action === 'cancel') {
                const listingId = safeText(String(detail.params?.listingId ?? ''), 32);
                const result = { requestId: detail.requestId, action: 'cancel', ok: false };
                if (!/^\d{1,32}$/.test(listingId) || !knownMineListingIds.has(listingId)) {
                    result.error = { code: 'INVALID_PARAMS', message: 'Não foi possível realizar a operação.' };
                    dispatchResult(result);
                    return;
                }
                try {
                    const fetchImpl = window.__pkmnHelperOriginalFetch || window.fetch;
                    const response = await fetchImpl.call(window, '/api/auction/cancel', {
                        method: 'POST', credentials: 'include',
                        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: window.__pkmnHelperAuctionAuth },
                        body: JSON.stringify({ listingId })
                    });
                    if (response.status === 401 || response.status === 403) {
                        delete window.__pkmnHelperAuctionAuth;
                        delete window.__pkmnHelperAuctionBootstrap;
                        throw Object.assign(new Error('Abra o leilão no jogo para reconectar.'), { code: 'AUTH_REQUIRED' });
                    }
                    const data = await response.json().catch(() => null);
                    if (!response.ok || data?.ok !== true || data?.kind !== 'mon') throw Object.assign(new Error('Cancelamento recusado.'), { code: 'CANCEL_REJECTED' });
                    knownMineListingIds.delete(listingId);
                    result.ok = true;
                    result.data = { ok: true, kind: 'mon' };
                } catch (error) {
                    result.error = { code: error?.code || 'NETWORK', message: error?.message || 'Não foi possível realizar a operação.' };
                }
                dispatchResult(result);
                return;
            }
            const params = detail.params || {};
            const query = new URLSearchParams();
            query.set('tab', allowedTabs.has(params.tab) ? params.tab : 'browse');
            query.set('page', String(intParam(params.page, 1, 100000) || 1));
            query.set('kind', allowedKinds.has(params.kind) ? params.kind : 'mon');
            query.set('sort', allowedSorts.has(params.sort) ? params.sort : 'new');
            [['levelMin', 1, 100], ['levelMax', 1, 100], ['priceMin', 0, 999999999], ['priceMax', 0, 999999999], ['type', 0, 18]].forEach(([key, min, max]) => {
                const value = intParam(params[key], min, max);
                if (value !== null) query.set(key, String(value));
            });
            if (params.shiny === true) query.set('shiny', '1');
            if (params.perfect === true) query.set('perfect', '1');
            if (typeof params.nature === 'string' && /^[A-Za-z-]{1,24}$/.test(params.nature)) query.set('nature', params.nature);
            if (typeof params.q === 'string') {
                const nameQuery = params.q.trim().slice(0, 40);
                if (/^[A-Za-z0-9 .'-]+$/.test(nameQuery)) query.set('q', nameQuery);
            }
            const result = { requestId: detail.requestId, action: 'browse', ok: false };
            try {
                const fetchImpl = window.__pkmnHelperOriginalFetch || window.fetch;
                const response = await fetchImpl.call(window, `/api/auction/browse?${query}`, {
                    credentials: 'include',
                    headers: { Accept: 'application/json', Authorization: window.__pkmnHelperAuctionAuth }
                });
                if (response.status === 401 || response.status === 403) {
                    delete window.__pkmnHelperAuctionAuth;
                    delete window.__pkmnHelperAuctionBootstrap;
                    throw Object.assign(new Error('Abra o leilão no jogo para reconectar.'), { code: 'AUTH_REQUIRED' });
                }
                if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { code: 'HTTP' });
                const data = await response.json();
                const sanitized = sanitizeBrowse(data);
                if (!sanitized) throw Object.assign(new Error('Resposta inválida'), { code: 'INVALID_RESPONSE' });
                result.ok = true;
                result.data = sanitized;
            } catch (error) {
                result.error = { code: error?.code || 'NETWORK', message: ['HTTP', 'AUTH_REQUIRED'].includes(error?.code) ? error.message : 'Não foi possível consultar o leilão.' };
            }
            dispatchResult(result);
        });
    }

    if (window.__pkmnHelperFetchPatched) return;
    window.__pkmnHelperFetchPatched = true;

    const originalFetch = window.fetch;
    window.__pkmnHelperOriginalFetch = originalFetch;
    window.fetch = async function (...args) {
        const input = args[0];
        const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input && input.url) || '');
        const isAuction = window.__pkmnHelperAuctionUrlRe.test(url);
        if (isAuction) {
            try {
                // init.headers tem precedência sobre os headers de Request.
                const requestHeaders = input && input.headers ? new Headers(input.headers) : new Headers();
                const initHeaders = args[1]?.headers ? new Headers(args[1].headers) : null;
                const authorization = initHeaders?.get('Authorization') || requestHeaders.get('Authorization');
                if (authorization && /^Bearer\s+\S+$/i.test(authorization)) {
                    window.__pkmnHelperAuctionAuth = authorization;
                }
            } catch (_) {
                // header malformado nunca pode interferir na request do jogo
            }
        }
        let requestActionPromise = Promise.resolve(null);
        if (window.__pkmnHelperBattleUrlRe.test(url)) {
            const initBody = args[1] && args[1].body;
            if (typeof initBody === 'string') {
                requestActionPromise = Promise.resolve().then(() => {
                    const body = JSON.parse(initBody);
                    return { battleId: body.battleId || null, action: body.action || null };
                }).catch(() => null);
            } else if (input && typeof input.clone === 'function') {
                requestActionPromise = input.clone().json().then((body) => ({ battleId: body?.battleId || null, action: body?.action || null })).catch(() => null);
            }
        }
        const response = await originalFetch.apply(this, args);
        try {
            if (isAuction) {
                if (response.status === 401 || response.status === 403) {
                    delete window.__pkmnHelperAuctionAuth;
                    delete window.__pkmnHelperAuctionBootstrap;
                    window.__pkmnHelperPublishAuctionBootstrap?.(null);
                } else if (/\/api\/auction\/browse(?:\?|$)/.test(url)) {
                    response.clone().json().then((data) => {
                        const browse = window.__pkmnHelperSanitizeAuctionBrowse?.(data);
                        const params = window.__pkmnHelperParseAuctionBrowseParams?.(url);
                        // A primeira busca inicializa a extensão; buscas seguintes
                        // do jogo apenas renovam o token e não resetam a lista.
                        if (browse && !window.__pkmnHelperAuctionBootstrap) window.__pkmnHelperPublishAuctionBootstrap?.(browse, params);
                    }).catch(() => {});
                } else if (window.__pkmnHelperAuctionAuth) {
                    window.__pkmnHelperPublishAuctionBootstrap?.(null);
                }
            }
            if (window.__pkmnHelperBattleUrlRe.test(url)) {
                response
                    .clone()
                    .json()
                    .then(async (data) => {
                        const request = await requestActionPromise;
                        if (request) data.__pokemonHelperRequest = request;
                        window.dispatchEvent(new CustomEvent('pkmn-helper-battle-data', { detail: data }));
                    })
                    .catch(() => {});
            } else if (window.__pkmnHelperCharacterUrlRe.test(url)) {
                response
                    .clone()
                    .json()
                    .then((data) => {
                        window.dispatchEvent(new CustomEvent('pkmn-helper-character-data', { detail: data }));
                    })
                    .catch(() => {});
            }
        } catch (_) {
            // nunca deixa o hook quebrar a chamada real do jogo
        }
        return response;
    };
})();
