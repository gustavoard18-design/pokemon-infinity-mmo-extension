// Aba "Neste mapa aparecem": lista os Pokémon selvagens do mapa atual,
// separados por método (grama, surfe, caverna, vara velha/boa/super) e com o
// horário (☀️ dia / 🌙 noite / 🕐 sempre). A chave interna do mapa
// (window.G.mapKey) e os capturados vêm do jogo via postMessage; os dados de
// encontro vêm do wiki-encounters.json (organizado por mapa e método).

(() => {
    let MAPS = [];               // maps do wiki-encounters.json
    let caught = new Set();
    let mapKey = '';

    const body = document.getElementById('sp-body');
    const countEl = document.getElementById('sp-count');

    const ENC_URL = 'https://infinitymmo.net/assets/data/wiki-encounters.json';
    const gifUrl = (dex) => `https://infinitymmo.net/assets/pokemon-bw/${dex}/front.gif`;
    const pngUrl = (slug) => `https://infinitymmo.net/assets/pokemon/${slug}.png`;

    const normMap = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const inCaught = (e) => caught.has(e.dex) || caught.has(String(e.dex)) || caught.has(e.slug);
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // grupos de método na ordem de exibição (vara detalhada por tipo)
    const GROUP_ORDER = ['grass', 'surf', 'cave', 'fish-old', 'fish-good', 'fish-super'];
    const GROUP_META = {
        grass:       { emoji: '🌿', label: 'Grama' },
        surf:        { emoji: '🌊', label: 'Surfe / Água' },
        cave:        { emoji: '🕳️', label: 'Caverna' },
        'fish-old':  { emoji: '🎣', label: 'Vara Velha' },
        'fish-good': { emoji: '🎣', label: 'Vara Boa' },
        'fish-super':{ emoji: '🎣', label: 'Super Vara' }
    };
    const metaOf = (k) => GROUP_META[k] || { emoji: '•', label: k };

    // reúne as linhas de um mapa por grupo de método
    function rowsByGroup(mapEntry) {
        const methods = mapEntry.methods || {};
        const groups = new Map(); // key -> array de entradas
        const add = (key, arr) => {
            if (!Array.isArray(arr) || !arr.length) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(...arr);
        };
        add('grass', methods.grass);
        add('surf', methods.surf);
        add('cave', methods.cave);
        if (methods.fish && typeof methods.fish === 'object') {
            add('fish-old', methods.fish.old);
            add('fish-good', methods.fish.good);
            add('fish-super', methods.fish.super);
        }
        // qualquer método extra (à prova de futuro) — sem lump "Outros"
        Object.keys(methods).forEach((k) => {
            if (['grass', 'surf', 'cave', 'fish'].includes(k)) return;
            add(k, methods[k]);
        });
        return groups;
    }

    function timeBadge(t) {
        if (t === 'day') return '<span class="sp-time day">☀️ Dia</span>';
        if (t === 'night') return '<span class="sp-time night">🌙 Noite</span>';
        return '<span class="sp-time always">🕐 Sempre</span>';
    }

    function loadEncounters() {
        return fetch(ENC_URL)
            .then((r) => r.json())
            .then((d) => { MAPS = (d && d.maps) || []; })
            .catch(() => { MAPS = []; });
    }

    function render() {
        if (!MAPS.length) { body.innerHTML = '<div class="sp-wait">Carregando os dados de encontros…<br>Se não aparecer, abra o jogo e recarregue.</div>';  return; }
        if (!mapKey) { body.innerHTML = '<div class="sp-wait">Aguardando o mapa…<br>Abra o InfinityMMO nesta aba (F5) e ande até um mapa com encontros.</div>';  return; }

        const key = normMap(mapKey);
        const mapEntry = MAPS.find((m) => normMap(m.id) === key || normMap(m.name) === key);
        if (!mapEntry) { body.innerHTML = '<div class="sp-wait">Nenhum encontro selvagem conhecido neste mapa.<br>(pode ser área interna, cidade, ou não mapeado na wiki)</div>';  return; }

        const groups = rowsByGroup(mapEntry);
        const orderedKeys = [
            ...GROUP_ORDER.filter((k) => groups.has(k)),
            ...[...groups.keys()].filter((k) => !GROUP_ORDER.includes(k))
        ];
        const total = [...groups.values()].reduce((n, arr) => n + arr.length, 0);
        
        if (!total) { body.innerHTML = '<div class="sp-wait">Nenhum encontro selvagem conhecido neste mapa.</div>'; return; }

        body.innerHTML = '';
        orderedKeys.forEach((gk) => {
            const items = groups.get(gk).slice().sort((a, b) => (Number(b.pct) || 0) - (Number(a.pct) || 0));
            const meta = metaOf(gk);
            const head = document.createElement('div');
            head.className = 'sp-group';
            head.innerHTML = `<span class="sp-group-emoji">${meta.emoji}</span>${escapeHtml(meta.label)}`;
            body.appendChild(head);

            const listEl = document.createElement('div');
            listEl.className = 'sp-list';
            items.forEach((e) => {
                const row = document.createElement('div');
                row.className = 'sp-row';
                const lvl = e.max != null && e.max !== e.min ? `Nv${e.min}-${e.max}` : `Nv${e.min}`;
                const pct = e.pct != null ? `${e.pct}%` : '?';
                const img = document.createElement('img');
                img.className = 'sp-spr';
                img.onerror = () => { if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = pngUrl(e.slug); } else { img.style.display = 'none'; } };
                img.src = gifUrl(e.dex);
                const nm = document.createElement('span');
                nm.className = 'sp-nm';
                nm.textContent = e.name;
                const meta2 = document.createElement('span');
                meta2.className = 'sp-meta';
                meta2.innerHTML = `${timeBadge(e.time)} <span class="sp-lv">${lvl} · ${pct}</span>`;
                row.append(img, nm, meta2);
                listEl.appendChild(row);
            });
            body.appendChild(listEl);
        });
    }

    let lastSig = '';
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'dex-data') return;
        const p = msg.payload || {};
        const sig = JSON.stringify([p.mapKey || '', (p.caught || []).length]);
        if (sig === lastSig) return;
        lastSig = sig;
        caught = new Set(Array.isArray(p.caught) ? p.caught : []);
        mapKey = p.mapKey || '';
        render();
    });

    loadEncounters().then(render).catch(() => render());
})();
