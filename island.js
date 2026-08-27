// Aba "Ilha": cruza o seu box (party + PC, recebido via character-data) com os
// tipos ideais de cada posto da mecânica de ilhas — recomendando quais Pokémon
// render mais (bônus de tipo +50%). Somente leitura, usa dados que a extensão
// já recebe do jogo.

(() => {
    let MON = [];   // [{name, level, typeKeys, dex, shiny}]

    const body = document.getElementById('isl-body');

    const gifUrl = (dex) => `https://infinitymmo.net/assets/pokemon-bw/${dex}/front.gif`;
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // postos da ilha e os tipos que dão bônus (mecânica de ilhas do InfinityMMO)
    const POSTS = [
        { key: 'arvore',   emoji: '🌳', name: 'Árvore',   desc: '+50% madeira',            types: ['grass', 'fighting'] },
        { key: 'pedreira', emoji: '⛏️', name: 'Pedreira', desc: '+50% pedra (às vezes ferro)', types: ['rock', 'ground', 'steel'] },
        { key: 'horta',    emoji: '🌱', name: 'Horta',    desc: 'produz apricorns',        types: ['grass'] },
        { key: 'fornalha', emoji: '🔥', name: 'Fornalha', desc: 'funde ferro / cura apricorns', types: ['fire'] }
    ];

    function dexOf(mon) {
        try {
            if (typeof POKEMON_NAME_TO_ID === 'undefined') return null;
            for (const v of [mon.name, mon.species]) {
                if (!v) continue;
                const k = String(v).trim().toLowerCase();
                const id = POKEMON_NAME_TO_ID[k] || POKEMON_NAME_TO_ID[k.replace(/[_-]+/g, ' ')];
                if (id) return id;
            }
        } catch (_) {}
        return null;
    }

    function toKeys(types) {
        const map = (typeof TYPE_MAPPER !== 'undefined') ? TYPE_MAPPER : {};
        return [...new Set((types || []).map((t) => map[t] || String(t).toLowerCase()).filter(Boolean))];
    }

    function ingest(payload) {
        const party = Array.isArray(payload && payload.party) ? payload.party : [];
        // `pc` é um array de CAIXAS ({name, pokemon:[...]}), não de Pokémon —
        // então achatamos os pokémon de todas as caixas antes de juntar à party.
        const pcBoxes = Array.isArray(payload && payload.pc) ? payload.pc : [];
        const pc = pcBoxes.reduce((acc, box) => acc.concat(Array.isArray(box?.pokemon) ? box.pokemon : []), []);
        const all = party.concat(pc);
        if (!all.length) return false;
        MON = all.filter(Boolean).map((p) => ({
            name: p.name || p.species || '?',
            level: Number(p.level ?? 0),
            typeKeys: toKeys(p.types),
            dex: dexOf(p),
            shiny: p.shiny === true
        }));
        return true;
    }

    function tagsHTML(typeKeys) {
        try { if (typeof typeTagHTML === 'function') return typeTagHTML(typeKeys, { stack: true }); } catch (_) {}
        return typeKeys.map((t) => `<span class="type-tag mini">${escapeHtml(t)}</span>`).join('');
    }

    function render() {
        if (!MON.length) {
            body.innerHTML = '<div class="isl-wait">Aguardando seu box…<br>Abra a aba "Meus Pokémon" no jogo (ou dentro da extensão) pra sincronizar.</div>';
            return;
        }
        body.innerHTML = '';
        POSTS.forEach((post) => {
            const matches = MON
                .filter((m) => m.typeKeys.some((t) => post.types.includes(t)))
                .sort((a, b) => b.level - a.level);

            const box = document.createElement('div');
            box.className = 'isl-post';
            const head = document.createElement('div');
            head.className = 'isl-post-head';
            head.innerHTML = `<span class="isl-post-emoji">${post.emoji}</span>` +
                `<span><span class="isl-post-name">${escapeHtml(post.name)}</span> ` +
                `<span class="isl-post-desc">— ${escapeHtml(post.desc)} · ${post.types.map((t) => (typeof LABELS !== 'undefined' && LABELS[t]) || t).join('/')}</span></span>` +
                `<span class="isl-post-n">${matches.length}</span>`;
            box.appendChild(head);

            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'isl-empty';
                empty.textContent = 'Nenhum Pokémon desses tipos no seu box.';
                box.appendChild(empty);
            } else {
                matches.slice(0, 30).forEach((m) => {
                    const row = document.createElement('div');
                    row.className = 'isl-row';
                    if (m.dex) {
                        const img = document.createElement('img');
                        img.className = 'isl-spr';
                        img.onerror = () => { img.style.display = 'none'; };
                        img.src = gifUrl(m.dex);
                        row.appendChild(img);
                    }
                    const nm = document.createElement('span');
                    nm.className = 'isl-nm';
                    nm.innerHTML = `${escapeHtml(m.name)}${m.shiny ? ' <span class="isl-shiny">★</span>' : ''}`;
                    const tags = document.createElement('span');
                    tags.className = 'isl-tags';
                    tags.innerHTML = tagsHTML(m.typeKeys);
                    const lv = document.createElement('span');
                    lv.className = 'isl-lv';
                    lv.textContent = m.level ? `Nv${m.level}` : '';
                    row.append(nm, tags, lv);
                    box.appendChild(row);
                });
                if (matches.length > 30) {
                    const more = document.createElement('div');
                    more.className = 'isl-empty';
                    more.textContent = `+${matches.length - 30} outros…`;
                    box.appendChild(more);
                }
            }
            body.appendChild(box);
        });
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'character-data') return;
        if (ingest(msg.payload)) render();
    });
})();
