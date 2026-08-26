// Aba "Farm de dinheiro": rankeia LOCAIS pelo dinheiro dos treinadores/NPCs.
// Mapas de andares/salas do mesmo lugar são agrupados (ex: Rock Túnel 1F + B1F
// = "Rock Túnel"; toda a Liga = "Pokemon Liga"). Filtros: região e ordenação
// (com foco em custo-benefício = ¥ por inimigo). Dados: wiki-encounters.json.

(() => {
    let LOCS = [];        // [{base, region, npcs, total, avg, key, maps:[{name, floor, npcs, total, trainers}]}]
    let mapKey = '';

    const body = document.getElementById('fm-body');
    const summaryEl = document.getElementById('fm-summary');
    const sortSel = document.getElementById('fm-sort');

    const ENC_URL = 'https://infinitymmo.net/assets/data/wiki-encounters.json';
    const normMap = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = (n) => '¥' + Number(n || 0).toLocaleString('pt-BR');

    // nome do "local base" (sem andar/sala) pra agrupar mapas do mesmo lugar
    function baseLoc(name) {
        let s = String(name).trim();
        if (/\bLiga\b/i.test(s)) return 'Pokemon Liga';
        s = s.replace(/\s+Room\s*\d*$/i, '');
        for (let i = 0; i < 2; i++) {
            s = s.replace(/\s+B?\s*\d+\s*F$/i, '');
            s = s.replace(/\s+(Entrance|Back|Stairs|Exterior|Interior|Front)$/i, '');
        }
        return s.trim();
    }
    function floorLabel(name, base) {
        const s = String(name).trim();
        if (s.toLowerCase().startsWith(base.toLowerCase())) {
            const rest = s.slice(base.length).trim();
            return rest || s;
        }
        return s;
    }

    // detecção de ilha: "Cinco Ilha ..." -> "Ilha 5" (pra juntar toda a ilha numa caixa)
    const NUM = { one: 1, uma: 1, two: 2, duas: 2, three: 3, 'três': 3, tres: 3, four: 4, quatro: 4, five: 5, cinco: 5, six: 6, seis: 6, seven: 7, sete: 7 };
    function islandOf(name) {
        const m = String(name).match(/^\s*([A-Za-zÀ-ÿ]+)\s+(Ilha|Island)/i);
        if (m) { const n = NUM[m[1].toLowerCase()]; return n ? ('Ilha ' + n) : null; }
        return null;
    }
    // rótulo do mapa dentro da caixa da ilha (tira o prefixo "X Ilha ")
    const islandFloor = (name) => String(name).replace(/^\s*[A-Za-zÀ-ÿ]+\s+(Ilha|Island)\s+/i, '').trim() || name;

    function buildLocs(data) {
        const byBase = new Map();
        (data.maps || []).forEach((m) => {
            const tr = (Array.isArray(m.trainers) ? m.trainers : []).map((t) => ({
                name: t.name || t.id || '?', cls: t.cls || '', prize: Number(t.prize) || 0,
                maxLv: Math.max(0, ...((t.party || []).map((p) => Number(p.level) || 0)))
            }));
            if (!tr.length) return;
            const name = m.name || m.id;
            const isl = islandOf(name);
            const groupKey = isl || baseLoc(name);   // toda a ilha numa caixa; Kanto agrupa por local
            const total = tr.reduce((s, t) => s + t.prize, 0);
            if (!byBase.has(groupKey)) byBase.set(groupKey, { base: groupKey, isle: !!isl, key: normMap(m.id) || normMap(name), maps: [] });
            const g = byBase.get(groupKey);
            const floor = isl ? islandFloor(name) : floorLabel(name, groupKey);
            g.maps.push({ name, floor, key: normMap(m.id) || normMap(name), npcs: tr.length, total, trainers: tr });
        });
        LOCS = [...byBase.values()].map((g) => {
            const npcs = g.maps.reduce((s, m) => s + m.npcs, 0);
            const total = g.maps.reduce((s, m) => s + m.total, 0);
            g.maps.sort((a, b) => b.total - a.total);
            return { ...g, npcs, total, avg: npcs ? Math.round(total / npcs) : 0 };
        });
    }

    function render() {
        if (!LOCS.length) { body.innerHTML = '<div class="fm-wait">Não foi possível carregar os dados. Abra o jogo e recarregue.</div>'; summaryEl.textContent = ''; return; }
        const sort = sortSel.value;

        const sumT = LOCS.reduce((s, m) => s + m.total, 0);
        const sumN = LOCS.reduce((s, m) => s + m.npcs, 0);
        summaryEl.innerHTML = `${LOCS.length} locais · ${sumN} inimigos · <b>${money(sumT)}</b>` +
            (sumN ? ` · ${money(Math.round(sumT / sumN))}/inimigo` : '');

        const cmp = {
            per: (a, b) => b.avg - a.avg,
            total: (a, b) => b.total - a.total,
            npcs: (a, b) => b.npcs - a.npcs,
            name: (a, b) => a.base.localeCompare(b.base)
        }[sort] || ((a, b) => b.avg - a.avg);

        const list = LOCS.slice().sort(cmp);
        body.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'fm-list';
        list.forEach((loc, i) => {
            const here = mapKey && loc.maps.some((mp) => mp.key === normMap(mapKey));
            const card = document.createElement('div');
            card.className = 'fm-map' + (here ? ' here' : '');
            const mhead = document.createElement('div');
            mhead.className = 'fm-map-head';
            const floorsTxt = loc.maps.length > 1 ? ` · ${loc.maps.length} ${loc.isle ? 'mapas' : 'andares'}` : '';
            const nameTxt = (loc.isle ? '🏝️ ' : '') + loc.base;
            mhead.innerHTML =
                `<span class="fm-rank">${i + 1}</span>` +
                `<span class="fm-map-info">` +
                    `<span class="fm-map-name">${escapeHtml(nameTxt)}${here ? ' 📍' : ''}</span>` +
                    `<span class="fm-map-sub">${loc.npcs} inimigos · ${money(loc.avg)}/inimigo${floorsTxt}</span>` +
                `</span>` +
                `<span class="fm-map-money"><div class="fm-total">${money(loc.total)}</div></span>` +
                `<span class="fm-caret">▸</span>`;
            mhead.addEventListener('click', () => {
                card.classList.toggle('open');
                mhead.querySelector('.fm-caret').textContent = card.classList.contains('open') ? '▾' : '▸';
            });
            card.appendChild(mhead);

            const trBox = document.createElement('div');
            trBox.className = 'fm-trainers';
            loc.maps.forEach((mp) => {
                if (loc.maps.length > 1) {
                    const fh = document.createElement('div');
                    fh.className = 'fm-floor';
                    fh.innerHTML = `<span>${escapeHtml(mp.floor)}</span><span class="fm-floor-tot">${money(mp.total)}</span>`;
                    trBox.appendChild(fh);
                }
                mp.trainers.slice().sort((a, b) => b.prize - a.prize).forEach((t) => {
                    const row = document.createElement('div');
                    row.className = 'fm-tr';
                    row.innerHTML =
                        `<span class="fm-tr-nm">${escapeHtml(t.name)} <span class="fm-tr-cls">${escapeHtml(t.cls)}</span></span>` +
                        `<span class="fm-tr-lv">${t.maxLv ? 'Nv' + t.maxLv : ''}</span>` +
                        `<span class="fm-tr-money">${money(t.prize)}</span>`;
                    trBox.appendChild(row);
                });
            });
            card.appendChild(trBox);
            wrap.appendChild(card);
        });
        body.appendChild(wrap);
    }

    sortSel.addEventListener('change', render);

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'dex-data') return;
        const p = msg.payload || {};
        if ((p.mapKey || '') !== mapKey) { mapKey = p.mapKey || ''; if (LOCS.length) render(); }
    });

    // ---- Timer de re-batalha (15 min) ----------------------------------------
    // Você bate os treinadores, clica "Iniciar" e ele avisa quando os 15 min
    // passarem (recompensa disponível de novo): apito + notificação + destaque.
    // O estado fica no localStorage, então sobrevive a recolher/reabrir o painel.
    (function setupTimer() {
        const DURATION = 15 * 60 * 1000;
        const KEY = 'idh_farm_timer';
        const timerEl = document.getElementById('fm-timer');
        const clockEl = document.getElementById('fm-clock');
        const btn = document.getElementById('fm-timer-btn');
        const repChk = document.getElementById('fm-timer-rep');
        if (!timerEl || !clockEl || !btn) return;

        const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
        const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
        let st = load();
        if (typeof st.repeat === 'boolean') repChk.checked = st.repeat;

        function fmt(ms) {
            const t = Math.max(0, Math.ceil(ms / 1000));
            return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
        }
        function beep() {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                const ctx = new AC();
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.connect(g); g.connect(ctx.destination);
                o.type = 'sine'; g.gain.value = 0.18;
                const t = ctx.currentTime;
                o.frequency.setValueAtTime(880, t);
                o.frequency.setValueAtTime(660, t + 0.15);
                o.frequency.setValueAtTime(990, t + 0.3);
                o.start(t); o.stop(t + 0.45);
                setTimeout(() => { try { ctx.close(); } catch (_) {} }, 900);
            } catch (_) {}
        }
        function notify() {
            try {
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    new Notification('Infinity Dex Helper', { body: '✅ Recompensa disponível! Bora bater de novo (15 min).' });
                }
            } catch (_) {}
        }

        function setReady(on) {
            timerEl.classList.toggle('ready', on);
            btn.textContent = on ? 'Reiniciar' : (st.running ? 'Zerar' : 'Iniciar');
            if (on) clockEl.textContent = '00:00';
        }
        function fire() {
            beep(); notify(); setReady(true);
            if (repChk.checked) { start(); } // recomeça o ciclo automaticamente
            else { st.running = false; save(st); }
        }
        function start() {
            st = { running: true, endTime: Date.now() + DURATION, repeat: repChk.checked };
            save(st); timerEl.classList.remove('ready'); btn.textContent = 'Zerar'; tick();
        }
        function stop() {
            st = { running: false, repeat: repChk.checked }; save(st);
            timerEl.classList.remove('ready'); clockEl.textContent = fmt(DURATION); btn.textContent = 'Iniciar';
        }
        let fired = false;
        function tick() {
            if (!st.running) { return; }
            const rem = st.endTime - Date.now();
            if (rem <= 0) { if (!fired) { fired = true; fire(); } return; }
            fired = false;
            clockEl.textContent = fmt(rem);
        }

        btn.addEventListener('click', () => {
            if (timerEl.classList.contains('ready') || st.running) { stop(); }
            else {
                if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                    try { Notification.requestPermission(); } catch (_) {}
                }
                start();
            }
        });
        repChk.addEventListener('change', () => { st.repeat = repChk.checked; save(st); });

        // retoma o estado salvo ao carregar o iframe
        if (st.running && st.endTime) { fired = false; tick(); }
        else { clockEl.textContent = fmt(DURATION); }
        setInterval(tick, 500);
    })();

    fetch(ENC_URL).then((r) => r.json()).then((d) => {
        buildLocs(d);
        render();
    }).catch(() => { body.innerHTML = '<div class="fm-wait">Falha ao carregar os dados de treinadores.</div>'; });
})();
