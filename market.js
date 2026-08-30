// Aba "Mercado": mostra preços de referência do mercado de jogadores
// (Pokémon, itens, ouro, skins) pra você anunciar e vender com lucro.
// Os dados vêm do MAIN world (interceptor) que busca /api/market/* com o
// token do jogo. SOMENTE LEITURA — a extensão nunca compra nem vende nada.

(() => {
    let DATA = null;
    const body = document.getElementById('mk-body');
    const tsEl = document.getElementById('mk-ts');
    const refreshBtn = document.getElementById('mk-refresh');
    const money = (n) => 'R$' + Number(n || 0).toFixed(2).replace('.', ',');
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cap = (s) => String(s || '').replace(/(^|\s)\S/g, (c) => c.toUpperCase());

    let query = '';

    function request() {
        body.innerHTML = '<div class="mk-wait">Buscando o mercado ao vivo…<br>(pode levar alguns segundos)</div>';
        try { parent.postMessage({ type: 'market-req' }, '*'); } catch (_) {}
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'market-data' || !msg.raw) return;
        try { DATA = JSON.parse(msg.raw); } catch (_) { DATA = { error: 'parse' }; }
        render();
    });

    refreshBtn.addEventListener('click', request);

    function priceCell(o) {
        return `<span class="mk-price">menor <b>${money(o.min)}</b> · méd ${money(o.med)}</span>`;
    }

    function render() {
        if (!DATA) return;
        if (DATA.error) {
            const txt = DATA.error === 'no-auth'
                ? 'Não consegui ler o token do jogo ainda.<br>Abra/atualize o jogo (fique logado) e toque em <b>Atualizar</b>.'
                : `Falha ao carregar o mercado (${esc(DATA.error)}).<br>Tente <b>Atualizar</b>.`;
            body.innerHTML = `<div class="mk-wait">${txt}</div>`;
            tsEl.textContent = '';
            return;
        }

        const ageMin = Math.round((Date.now() - (DATA.ts || Date.now())) / 60000);
        tsEl.textContent = `Atualizado ${ageMin <= 0 ? 'agora' : 'há ' + ageMin + ' min'} · ${DATA.totals.mon} Pokémon · ${DATA.totals.item} itens à venda`;

        const g = DATA.gold || {}, mb = DATA.monBands || {};
        const parts = [];

        // ---- OURO ----
        parts.push(
            `<div class="mk-card"><div class="mk-card-head">🪙 Ouro (cotação)</div>` +
            `<div class="mk-gold"><span class="mk-gold-big">${money(g.med)}</span><span class="mk-gold-sub">por 1M · varia ${money(g.min)}–${money(g.max)} · ${g.n} anúncios</span></div>` +
            `<div class="mk-note">Pra vender rápido, anuncie um pouco abaixo de ${money(g.med)}/1M.</div></div>`
        );

        // ---- FAIXAS DE PREÇO DOS POKÉMON ----
        parts.push(
            `<div class="mk-card"><div class="mk-card-head">📊 Pokémon · faixas de preço</div>` +
            `<div class="mk-bands">` +
                `<div class="mk-band"><div class="mk-band-n">${mb.u10}</div><div class="mk-band-l">&lt; R$10</div></div>` +
                `<div class="mk-band"><div class="mk-band-n">${mb.b1030}</div><div class="mk-band-l">10–30</div></div>` +
                `<div class="mk-band"><div class="mk-band-n">${mb.b3060}</div><div class="mk-band-l">30–60</div></div>` +
                `<div class="mk-band"><div class="mk-band-n">${mb.o60}</div><div class="mk-band-l">60+</div></div>` +
            `</div>` +
            `<div class="mk-kpis"><span>mediana geral <b>${money(mb.med)}</b></span><span>IV perfeito (6×31) <b>${money(mb.perfMed)}</b></span><span>shiny <b>${money(mb.shinyMed)}</b></span></div>` +
            `<div class="mk-note">A maioria é barata. O valor está em <b>IV 6×31</b>, <b>lendários</b> e espécies escassas. Shiny sozinho quase não valoriza.</div></div>`
        );

        // ---- BUSCA ----
        parts.push(`<input type="text" class="mk-search" id="mk-search" placeholder="🔎 buscar Pokémon ou item pra ver o preço…" value="${esc(query)}">`);

        const q = query.trim().toLowerCase();
        if (q) {
            const mons = (DATA.monsAgg || []).filter((m) => (m.name || m.sp).toLowerCase().includes(q)).sort((a, b) => b.med - a.med).slice(0, 20);
            const items = (DATA.itemsAgg || []).filter((m) => (m.name || m.slug).toLowerCase().includes(q)).slice(0, 20);
            let rows = '';
            items.forEach((o) => { rows += `<div class="mk-row"><span class="mk-nm">${esc(cap(o.name || o.slug))}</span><span class="mk-n">${o.n}×</span>${priceCell(o)}</div>`; });
            mons.forEach((o) => {
                const tag = o.n >= 8 ? '<span class="mk-tag glut">saturado</span>' : (o.n <= 2 ? '<span class="mk-tag hot">escasso</span>' : '');
                rows += `<div class="mk-row"><span class="mk-nm">${esc(cap(o.name || o.sp))}${o.shiny ? ' ✨' : ''}</span>${tag}<span class="mk-n">${o.n}×</span>${priceCell(o)}</div>`;
            });
            parts.push(`<div class="mk-card"><div class="mk-card-head">Resultados</div>${rows || '<div class="mk-note">Nada encontrado.</div>'}</div>`);
        } else {
            // ---- ITENS (referência) ----
            let irows = '';
            (DATA.itemsAgg || []).slice(0, 24).forEach((o) => {
                const tag = o.n === 1 ? '<span class="mk-tag hot">único</span>' : (o.qty >= 100 ? '<span class="mk-tag glut">estoque alto</span>' : '');
                irows += `<div class="mk-row"><span class="mk-nm">${esc(cap(o.name || o.slug))}</span>${tag}<span class="mk-n">${o.n}×</span>${priceCell(o)}</div>`;
            });
            parts.push(`<div class="mk-card"><div class="mk-card-head">🎒 Itens · preço de referência</div>${irows}</div>`);

            // ---- ESCASSOS E VALIOSOS (bom pra vender) ----
            const scarce = (DATA.monsAgg || []).filter((m) => m.n <= 2 && m.med >= 30).sort((a, b) => b.med - a.med).slice(0, 12);
            if (scarce.length) {
                let rows = '';
                scarce.forEach((o) => { rows += `<div class="mk-row"><span class="mk-nm">${esc(cap(o.name || o.sp))}${o.shiny ? ' ✨' : ''}</span><span class="mk-tag hot">escasso</span><span class="mk-n">${o.n}×</span>${priceCell(o)}</div>`; });
                parts.push(`<div class="mk-card"><div class="mk-card-head">💎 Pokémon escassos e valiosos</div>${rows}<div class="mk-note">Pouca oferta + preço alto = você dita o preço.</div></div>`);
            }

            // ---- SATURADOS (evite / desconte) ----
            const glut = (DATA.monsAgg || []).slice().sort((a, b) => b.n - a.n).slice(0, 12);
            let grows = '';
            glut.forEach((o) => { grows += `<div class="mk-row"><span class="mk-nm">${esc(cap(o.name || o.sp))}${o.shiny ? ' ✨' : ''}</span><span class="mk-tag glut">${o.n}×</span>${priceCell(o)}</div>`; });
            parts.push(`<div class="mk-card"><div class="mk-card-head">⚠️ Pokémon saturados (muita oferta)</div>${grows}<div class="mk-note">Mercado cheio — só vale se desconto agressivo. Evite pra vender com lucro.</div></div>`);
        }

        // ---- rodapé ----
        if (DATA.stats) {
            parts.push(`<div class="mk-note">Suas vendas: <b>${DATA.stats.vendas || 0}</b> · volume ${money(DATA.stats.volume || 0)}. Taxa ~12,5% por venda. Preços em R$ (PIX).</div>`);
        }

        body.innerHTML = parts.join('');

        const s = document.getElementById('mk-search');
        if (s) {
            s.addEventListener('input', () => { query = s.value; render(); s2 = document.getElementById('mk-search'); if (s2) { s2.focus(); s2.setSelectionRange(query.length, query.length); } });
        }
    }
    let s2;

    // pede os dados assim que a aba carrega
    request();
})();
