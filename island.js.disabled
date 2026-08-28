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
        MON = all.filter(Boolean).map((p) => {
            const dex = dexOf(p);
            const shiny = p.shiny === true;
            return {
                name: p.name || p.species || '?',
                level: Number(p.level ?? 0),
                typeKeys: toKeys(p.types),
                dex,
                shiny,
                power: expPower(p, dex, shiny)
            };
        });
        return true;
    }

    // ---- Expedições: poder de cada Pokémon ------------------------------------
    // Fórmula do jogo: bruto = PS×0,05 + ATQ + DEF + AT.ESP + DEF.ESP + VEL×0,75
    //                  poder = bruto×0,35 ; shiny ×1,10 ; lendário/mítico +50
    //                  poder final = máx(1), arredondado
    // (IVs/EVs/nível já vêm embutidos nos stats reais que o jogo manda.)
    const LEGENDARY = new Set([
        144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251,
        377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
        480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
        494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649
    ]);
    function expPower(p, dex, shiny) {
        const s = p.stats || {};
        const n = (k) => Number(s[k] ?? 0);
        let bruto = n('hp') * 0.05 + n('atk') + n('def') + n('spa') + n('spd') + n('spe') * 0.75;
        let poder = bruto * 0.35;
        if (shiny) poder *= 1.10;
        const isLeg = p.legendary === true || p.mythical === true || p.isLegendary === true || (dex && LEGENDARY.has(dex));
        if (isLeg) poder += 50;
        return Math.max(1, Math.round(poder));
    }

    // destinos: [nome, emoji, limite de pokémon, poder p/ ~95% de sucesso]
    const EXPEDITIONS = [
        { emoji: '🌳', name: 'Floresta de Viridian', limit: 3, p95: 1100 },
        { emoji: '🌙', name: 'Caverna da Lua', limit: 5, p95: 1650 },
        { emoji: '🌊', name: 'Ilhas Espumantes', limit: 7, p95: 2200 },
        { emoji: '🏜️', name: 'Ruínas do Deserto', limit: 9, p95: 2600 },
        { emoji: '👻', name: 'Lavender', limit: 11, p95: 3050 },
        { emoji: '❄️', name: 'Montanhas Gélidas', limit: 13, p95: 3400 },
        { emoji: '🌋', name: 'Vulcão de Cinnabar', limit: 15, p95: 3850 }
    ];
    // chance estimada: linear até o ponto de 95% (único ponto conhecido),
    // saturando acima. É estimativa — o jogo mostra o valor exato na tela.
    function chanceOf(power, p95) {
        const r = power / p95;
        const pct = r >= 1 ? 95 + (r - 1) * 20 : r * 95;
        return Math.max(1, Math.min(99, Math.round(pct)));
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

        renderExpeditions();

        // ---- versáteis: Pokémon que se encaixam em mais de um posto ----------
        const versatile = MON
            .map((m) => ({ m, posts: POSTS.filter((p) => m.typeKeys.some((t) => p.types.includes(t))) }))
            .filter((x) => x.posts.length > 1)
            .sort((a, b) => (b.posts.length - a.posts.length) || (b.m.level - a.m.level));

        if (versatile.length) {
            const box = document.createElement('div');
            box.className = 'isl-post isl-versatile';
            const head = document.createElement('div');
            head.className = 'isl-post-head';
            head.innerHTML = `<span class="isl-post-emoji">🎯</span>` +
                `<span><span class="isl-post-name">Versáteis</span> ` +
                `<span class="isl-post-desc">— servem em vários postos</span></span>` +
                `<span class="isl-post-n">${versatile.length}</span>`;
            box.appendChild(head);
            versatile.slice(0, 30).forEach(({ m, posts }) => {
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
                const badges = document.createElement('span');
                badges.className = 'isl-posts';
                badges.innerHTML = posts.map((p) => `<span class="isl-post-badge" title="${escapeHtml(p.name)}">${p.emoji}</span>`).join('');
                const lv = document.createElement('span');
                lv.className = 'isl-lv';
                lv.textContent = m.level ? `Nv${m.level}` : '';
                row.append(nm, badges, lv);
                box.appendChild(row);
            });
            if (versatile.length > 30) {
                const more = document.createElement('div');
                more.className = 'isl-empty';
                more.textContent = `+${versatile.length - 30} outros…`;
                box.appendChild(more);
            }
            body.appendChild(box);
        }

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

    // ---- render da seção de Expedições ---------------------------------------
    function renderExpeditions() {
        const ranked = MON.slice().sort((a, b) => b.power - a.power);
        const box = document.createElement('div');
        box.className = 'isl-post isl-exped';

        const head = document.createElement('div');
        head.className = 'isl-post-head';
        head.innerHTML = `<span class="isl-post-emoji">🧭</span>` +
            `<span><span class="isl-post-name">Expedições</span> ` +
            `<span class="isl-post-desc">— manda seus mais fortes; % é estimativa</span></span>`;
        box.appendChild(head);

        // timer editável (você define a duração da expedição em minutos)
        const timer = document.createElement('div');
        timer.className = 'isl-timer';
        timer.id = 'isl-exp-timer';
        timer.innerHTML =
            `<span class="isl-timer-emoji">⏰</span>` +
            `<span class="isl-timer-clock" id="isl-exp-clock">--:--</span>` +
            `<label class="isl-timer-min">min <input type="number" id="isl-exp-min" min="1" max="1440" value="60"></label>` +
            `<button type="button" class="isl-timer-btn" id="isl-exp-btn">Iniciar</button>`;
        box.appendChild(timer);

        EXPEDITIONS.forEach((dest) => {
            const team = ranked.slice(0, dest.limit);
            const power = team.reduce((s, m) => s + m.power, 0);
            const chance = chanceOf(power, dest.p95);
            const cls = chance >= 95 ? 'ok' : (chance >= 60 ? 'mid' : 'bad');

            const card = document.createElement('div');
            card.className = 'isl-dest';
            const dh = document.createElement('div');
            dh.className = 'isl-dest-head';
            dh.innerHTML =
                `<span class="isl-dest-emoji">${dest.emoji}</span>` +
                `<span class="isl-dest-info">` +
                    `<span class="isl-dest-name">${escapeHtml(dest.name)}</span>` +
                    `<span class="isl-dest-sub">até ${dest.limit} · ⚡${power.toLocaleString('pt-BR')} / ${dest.p95.toLocaleString('pt-BR')}</span>` +
                `</span>` +
                `<span class="isl-dest-chance ${cls}">${chance}%</span>` +
                `<span class="isl-caret">▸</span>`;
            card.appendChild(dh);

            const teamBox = document.createElement('div');
            teamBox.className = 'isl-team';
            if (!team.length) {
                teamBox.innerHTML = '<div class="isl-empty">Sem Pokémon no box.</div>';
            } else {
                team.forEach((m, idx) => {
                    const row = document.createElement('div');
                    row.className = 'isl-row';
                    row.innerHTML =
                        `<span class="isl-rank">${idx + 1}</span>` +
                        (m.dex ? `<img class="isl-spr" src="${gifUrl(m.dex)}" onerror="this.style.display='none'">` : '') +
                        `<span class="isl-nm">${escapeHtml(m.name)}${m.shiny ? ' <span class="isl-shiny">★</span>' : ''}</span>` +
                        `<span class="isl-lv">${m.level ? 'Nv' + m.level : ''}</span>` +
                        `<span class="isl-pow">⚡${m.power.toLocaleString('pt-BR')}</span>`;
                    teamBox.appendChild(row);
                });
            }
            card.appendChild(teamBox);
            dh.addEventListener('click', () => {
                card.classList.toggle('open');
                dh.querySelector('.isl-caret').textContent = card.classList.contains('open') ? '▾' : '▸';
            });
            box.appendChild(card);
        });

        body.appendChild(box);
        wireExpTimer();
    }

    // timer de expedição: duração definida por você; avisa ao terminar.
    let expTimerWired = false;
    function wireExpTimer() {
        const KEY = 'idh_exp_timer';
        const clockEl = document.getElementById('isl-exp-clock');
        const minEl = document.getElementById('isl-exp-min');
        const btn = document.getElementById('isl-exp-btn');
        const timerEl = document.getElementById('isl-exp-timer');
        if (!clockEl || !btn || !minEl) return;

        const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
        const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
        let st = load();
        if (st.minutes) minEl.value = st.minutes;
        const fmt = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
        function beep() { try { const AC = window.AudioContext || window.webkitAudioContext; const c = new AC(); const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; g.gain.value = 0.18; const t = c.currentTime; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(660, t + 0.15); o.frequency.setValueAtTime(990, t + 0.3); o.start(t); o.stop(t + 0.45); setTimeout(() => { try { c.close(); } catch (_) {} }, 900); } catch (_) {} }
        function notify() { try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Infinity Dex Helper', { body: '✅ Expedição concluída!' }); } catch (_) {} }

        function paint() {
            st = load();
            const t = document.getElementById('isl-exp-timer');
            const c = document.getElementById('isl-exp-clock');
            const b = document.getElementById('isl-exp-btn');
            if (!c || !b || !t) return;
            if (st.running && st.endTime) {
                const rem = st.endTime - Date.now();
                if (rem <= 0) { c.textContent = '00:00'; t.classList.add('ready'); b.textContent = 'Zerar'; }
                else { c.textContent = fmt(rem); t.classList.remove('ready'); b.textContent = 'Zerar'; }
            } else { c.textContent = '--:--'; t.classList.remove('ready'); b.textContent = 'Iniciar'; }
        }
        function start() {
            const mins = Math.max(1, Math.min(1440, Number(document.getElementById('isl-exp-min').value) || 60));
            st = { running: true, endTime: Date.now() + mins * 60000, minutes: mins }; save(st);
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
            paint();
        }
        function stop() { st = { running: false, minutes: Number(document.getElementById('isl-exp-min').value) || 60 }; save(st); paint(); }

        btn.onclick = () => { const s = load(); (s.running ? stop : start)(); };
        minEl.onchange = () => { const s = load(); s.minutes = Number(minEl.value) || 60; save(s); };
        paint();

        if (!expTimerWired) {
            expTimerWired = true;
            let fired = false;
            setInterval(() => {
                const s = load();
                if (s.running && s.endTime) {
                    if (s.endTime - Date.now() <= 0) { if (!fired) { fired = true; beep(); notify(); } }
                    else fired = false;
                }
                paint();
            }, 500);
        }
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'character-data') return;
        if (ingest(msg.payload)) render();
    });
})();
