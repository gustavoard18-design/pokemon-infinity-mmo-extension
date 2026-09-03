// Aba "Mochila": mostra os itens do jogador (character.bag) com imagem,
// quantidade e descrição em português. O bag vem no payload de character-data
// (mesmo que Meus Pokémon). Nomes/descrições base vêm do items.json do jogo;
// como o jogo traz a maioria das descrições em inglês, temos um dicionário PT
// (PT_DESC) pros itens mais comuns — o resto cai no texto do jogo.

(() => {
    let BAG = null;                 // { slug: qtd }
    let CAT = {};                   // slug -> { name, desc, pocket, importance }
    let MOVE_WIKI = null;           // golpes PT do jogo (pra descrição dos MTs)
    let POCKET_ORDER = ['items', 'key', 'balls', 'tm', 'berry'];

    const body = document.getElementById('bg-body');
    const sumEl = document.getElementById('bg-sum');
    const searchEl = document.getElementById('bg-search');
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cap = (s) => String(s || '').replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    const sprite = (slug) => `https://infinitymmo.net/assets/items/${slug}.png`;
    let query = '';

    const POCKET_PT = { items: 'Itens', key: 'Itens-chave', balls: 'Pokébolas', tm: 'MT / HM', berry: 'Berries' };
    // desc em inglês? (heurística — pra marcar/estilizar)
    const looksEN = (d) => /\b(the|and|to|of|held|by|boosts|restores|move|user|when|POK[ée]MON|BALL|HP|it|a|is|makes|used|its)\b/.test(d) && !/[ãõáâêéíóúç]/.test(d.replace(/POK[ée]MON/g, ''));

    // ---- descrições em PT (as mais comuns) -----------------------------------
    const PT_DESC = {
        // pokébolas
        poke_ball: 'Bola padrão pra capturar Pokémon selvagens.',
        great_ball: 'Melhor que a Poké Ball, com taxa de captura maior.',
        ultra_ball: 'Alto desempenho, taxa de captura ainda maior.',
        master_ball: 'Captura qualquer Pokémon selvagem sem falhar.',
        net_ball: 'Mais eficaz contra Pokémon de Água e Inseto.',
        dive_ball: 'Mais eficaz com Pokémon do mar/surfe.',
        nest_ball: 'Mais eficaz quanto menor o nível do selvagem.',
        repeat_ball: 'Mais eficaz contra espécies que você já capturou.',
        timer_ball: 'Fica mais eficaz quanto mais turnos a luta durar.',
        luxury_ball: 'Deixa o Pokémon capturado mais amigável.',
        premier_ball: 'Bola comemorativa; funciona como uma Poké Ball.',
        quick_ball: 'Muito eficaz se usada no 1º turno da batalha.',
        dusk_ball: 'Mais eficaz à noite ou em cavernas.',
        heal_ball: 'Cura totalmente o Pokémon ao capturá-lo.',
        // cura de PS
        potion: 'Cura 20 de PS de um Pokémon.',
        super_potion: 'Cura 50 de PS de um Pokémon.',
        hyper_potion: 'Cura 200 de PS de um Pokémon.',
        max_potion: 'Cura todo o PS de um Pokémon.',
        full_restore: 'Cura todo o PS e os status negativos.',
        revive: 'Reanima um Pokémon desmaiado com metade do PS.',
        max_revive: 'Reanima um Pokémon desmaiado com todo o PS.',
        fresh_water: 'Cura 30 de PS.', soda_pop: 'Cura 50 de PS.', lemonade: 'Cura 70 de PS.', moomoo_milk: 'Cura 100 de PS.',
        // status
        antidote: 'Cura o envenenamento.', burn_heal: 'Cura a queimadura.', ice_heal: 'Cura o congelamento.',
        paralyze_heal: 'Cura a paralisia.', parlyz_heal: 'Cura a paralisia.', awakening: 'Acorda um Pokémon dormindo.',
        full_heal: 'Cura qualquer status negativo.',
        // PP
        ether: 'Restaura 10 PP de um golpe.', max_ether: 'Restaura todo o PP de um golpe.',
        elixir: 'Restaura 10 PP de todos os golpes.', max_elixir: 'Restaura todo o PP de todos os golpes.',
        pp_up: 'Aumenta o PP máximo de um golpe.', pp_max: 'Aumenta ao máximo o PP de um golpe.',
        // vitaminas / EVs
        hp_up: 'Aumenta os EVs de PS.', protein: 'Aumenta os EVs de Ataque.', iron: 'Aumenta os EVs de Defesa.',
        calcium: 'Aumenta os EVs de At. Especial.', zinc: 'Aumenta os EVs de Def. Especial.', carbos: 'Aumenta os EVs de Velocidade.',
        rare_candy: 'Sobe 1 nível do Pokémon.',
        // itens segurados / batalha
        life_orb: 'Aumenta o dano dos golpes, mas o portador perde PS a cada golpe.',
        choice_band: 'Aumenta muito o Ataque, mas trava no 1º golpe usado.',
        choice_specs: 'Aumenta muito o At. Especial, mas trava no 1º golpe.',
        choice_scarf: 'Aumenta muito a Velocidade, mas trava no 1º golpe.',
        expert_belt: 'Aumenta o dano de golpes super efetivos.',
        muscle_band: 'Aumenta um pouco o dano dos golpes físicos.',
        wise_glasses: 'Aumenta um pouco o dano dos golpes especiais.',
        focus_band: 'Chance de sobreviver a um golpe fatal com 1 PS.',
        focus_sash: 'Sobrevive a um golpe fatal com 1 PS (1x, com PS cheio).',
        leftovers: 'Recupera um pouco de PS a cada turno.',
        black_sludge: 'Recupera PS de Pokémon Veneno; machuca os demais.',
        shell_bell: 'Recupera PS ao causar dano.',
        eviolite: 'Aumenta Defesa e Def. Esp. de quem ainda evolui.',
        assault_vest: 'Aumenta a Def. Especial, mas bloqueia golpes de status.',
        amulet_coin: 'Dobra o dinheiro ganho na batalha.',
        lucky_egg: 'Aumenta o EXP ganho pelo portador.',
        shiny_charm: 'Aumenta a chance de encontrar Pokémon Shiny.',
        thick_club: 'Dobra o Ataque de Cubone e Marowak.',
        macho_brace: 'Dobra os EVs ganhos, mas reduz a Velocidade.',
        everstone: 'Impede o Pokémon de evoluir.',
        destiny_knot: 'No breeding, passa 5 IVs entre os pais.',
        // itens de tipo (+dano do tipo)
        silk_scarf: 'Aumenta o dano de golpes Normais.', charcoal: 'Aumenta o dano de golpes de Fogo.',
        mystic_water: 'Aumenta o dano de golpes de Água.', magnet: 'Aumenta o dano de golpes Elétricos.',
        miracle_seed: 'Aumenta o dano de golpes de Planta.', never_melt_ice: 'Aumenta o dano de golpes de Gelo.',
        black_belt: 'Aumenta o dano de golpes de Luta.', poison_barb: 'Aumenta o dano de golpes de Veneno.',
        soft_sand: 'Aumenta o dano de golpes de Terra.', sharp_beak: 'Aumenta o dano de golpes Voadores.',
        twisted_spoon: 'Aumenta o dano de golpes Psíquicos.', silver_powder: 'Aumenta o dano de golpes de Inseto.',
        hard_stone: 'Aumenta o dano de golpes de Pedra.', spell_tag: 'Aumenta o dano de golpes Fantasma.',
        dragon_fang: 'Aumenta o dano de golpes de Dragão.', black_glasses: 'Aumenta o dano de golpes Sombrios.',
        metal_coat: 'Aumenta o dano de golpes de Aço (e evolui alguns por troca).',
        // treino de EV (power items)
        power_weight: 'Treino: +EVs de PS, mas reduz a Velocidade.', power_bracer: 'Treino: +EVs de Ataque, reduz Velocidade.',
        power_belt: 'Treino: +EVs de Defesa, reduz Velocidade.', power_lens: 'Treino: +EVs de At. Esp., reduz Velocidade.',
        power_band: 'Treino: +EVs de Def. Esp., reduz Velocidade.', power_anklet: 'Treino: +EVs de Velocidade, reduz Velocidade.',
        // evolução (pedras/itens)
        fire_stone: 'Pedra de evolução (Fogo e outros).', water_stone: 'Pedra de evolução (Água e outros).',
        thunder_stone: 'Pedra de evolução (Elétrico e outros).', leaf_stone: 'Pedra de evolução (Planta e outros).',
        moon_stone: 'Pedra de evolução (Clefairy, Jigglypuff, Nido...).', sun_stone: 'Pedra de evolução (Gloom, Sunkern...).',
        shiny_stone: 'Pedra de evolução (Togetic, Roselia...).', dusk_stone: 'Pedra de evolução (Murkrow, Misdreavus...).',
        dawn_stone: 'Pedra de evolução (Kirlia macho, Snorunt fêmea).', ice_stone: 'Pedra de evolução (tipo Gelo).',
        oval_stone: 'Evolui Happiny (de dia).', kings_rock: 'Evolui Poliwhirl/Slowpoke por troca; chance de recuo.',
        dragon_scale: 'Evolui Seadra em Kingdra (por troca).', razor_claw: 'Evolui Sneasel; aumenta chance de crítico.',
        razor_fang: 'Evolui Gligar; chance de recuo.', protector: 'Evolui Rhydon em Rhyperior (troca).',
        electirizer: 'Evolui Electabuzz em Electivire (troca).', magmarizer: 'Evolui Magmar em Magmortar (troca).',
        reaper_cloth: 'Evolui Dusclops em Dusknoir (troca).', up_grade: 'Evolui Porygon em Porygon2 (troca).',
        dubious_disc: 'Evolui Porygon2 em Porygon-Z (troca).', prism_scale: 'Evolui Feebas em Milotic (troca).',
        cristal_shiny: 'Cristal instável: 30% de chance de tornar um Pokémon Shiny. Some ao usar.',
        shiny_crystal: 'Cristal instável: 30% de chance de tornar um Pokémon Shiny. Some ao usar.',
        ability_capsule: 'Troca a habilidade do Pokémon pela outra habilidade normal.',
        nature_mint: 'Muda a natureza do Pokémon (efeito de stats).',
        // valiosos (venda)
        nugget: 'Item valioso para vender (~¥5.000).', big_nugget: 'Item muito valioso para vender.',
        pearl: 'Item valioso para vender.', big_pearl: 'Item muito valioso para vender.',
        stardust: 'Item valioso para vender.', star_piece: 'Item muito valioso para vender.',
        comet_shard: 'Item muito valioso para vender.', tiny_mushroom: 'Vende / usado no Relembrador de Golpes.',
        big_mushroom: 'Vende / usado no Relembrador de Golpes.', balm_mushroom: 'Item muito valioso para vender.',
        rare_bone: 'Item valioso para vender.',
        // repelentes / utilidades
        repel: 'Afasta selvagens fracos por 100 passos.', super_repel: 'Afasta selvagens fracos por 200 passos.',
        max_repel: 'Afasta selvagens fracos por 250 passos.',
        old_rod: 'Vara de pescar (básica).', good_rod: 'Vara de pescar (boa).', super_rod: 'Vara de pescar (a melhor).',
        town_map: 'Mapa da região.', acro_bike: 'Bicicleta pra andar mais rápido.', mach_bike: 'Bicicleta pra andar mais rápido.',
        // berries comuns
        oran_berry: 'Recupera 10 de PS quando o PS fica baixo.', sitrus_berry: 'Recupera 25% do PS quando fica baixo.',
        lum_berry: 'Cura qualquer status negativo (inclui confusão).', rawst_berry: 'Cura queimadura.',
        cheri_berry: 'Cura paralisia.', chesto_berry: 'Cura sono.', pecha_berry: 'Cura envenenamento.',
        aspear_berry: 'Cura congelamento.', persim_berry: 'Cura confusão.', leppa_berry: 'Restaura 10 PP de um golpe.'
    };

    // ---- traduções PT extras (todos os demais itens) -------------------------
    const PT_EXTRA = {
        // berries de sabor (curam PS, podem confundir)
        figy_berry: 'Recupera PS quando o PS fica baixo; pode confundir se a natureza não gostar do sabor.',
        wiki_berry: 'Recupera PS quando o PS fica baixo; pode confundir se a natureza não gostar do sabor.',
        mago_berry: 'Recupera PS quando o PS fica baixo; pode confundir se a natureza não gostar do sabor.',
        aguav_berry: 'Recupera PS quando o PS fica baixo; pode confundir se a natureza não gostar do sabor.',
        iapapa_berry: 'Recupera PS quando o PS fica baixo; pode confundir se a natureza não gostar do sabor.',
        // berries de stat "in a pinch"
        liechi_berry: 'Aumenta o Ataque quando o PS fica baixo.',
        ganlon_berry: 'Aumenta a Defesa quando o PS fica baixo.',
        salac_berry: 'Aumenta a Velocidade quando o PS fica baixo.',
        petaya_berry: 'Aumenta o At. Especial quando o PS fica baixo.',
        apicot_berry: 'Aumenta a Def. Especial quando o PS fica baixo.',
        lansat_berry: 'Aumenta a chance de crítico quando o PS fica baixo.',
        starf_berry: 'Aumenta muito um atributo aleatório quando o PS fica baixo.',
        // remédios / cura
        energy_powder: 'Pó bem amargo. Cura 50 de PS.',
        energy_root: 'Raiz bem amarga. Cura 200 de PS.',
        heal_powder: 'Pó bem amargo. Cura todos os status negativos.',
        revival_herb: 'Erva bem amarga. Reanima um Pokémon desmaiado com todo o PS.',
        lava_cookie: 'Cura todos os status negativos.',
        berry_juice: 'Suco puro. Cura 20 de PS.',
        sacred_ash: 'Reanima e cura totalmente todos os Pokémon desmaiados.',
        // flautas
        blue_flute: 'Flauta azul. Acorda um Pokémon dormindo.',
        yellow_flute: 'Flauta amarela. Tira um Pokémon da confusão.',
        red_flute: 'Flauta vermelha. Tira um Pokémon da atração.',
        black_flute: 'Flauta preta. Reduz o aparecimento de selvagens.',
        white_flute: 'Flauta branca. Aumenta o aparecimento de selvagens.',
        // x-items / buffs de batalha
        guard_spec: 'Impede a redução de atributos do time por 5 turnos.',
        dire_hit: 'Aumenta a chance de crítico na batalha (temporário).',
        x_attack: 'Aumenta o Ataque na batalha (temporário).',
        x_defend: 'Aumenta a Defesa na batalha (temporário).',
        x_speed: 'Aumenta a Velocidade na batalha (temporário).',
        x_accuracy: 'Aumenta a precisão na batalha (temporário).',
        x_special: 'Aumenta o At. Especial na batalha (temporário).',
        // fuga / utilidade
        poke_doll: 'Boneco: garante fuga de qualquer batalha selvagem.',
        fluffy_tail: 'Item de fuga: garante fuga de batalha selvagem.',
        escape_rope: 'Escapa na hora de cavernas/dungeons.',
        smoke_ball: 'Item segurado: garante fuga de batalhas selvagens.',
        heart_scale: 'Escama rara em forma de coração; usada no Relembrador de Golpes.',
        shoal_salt: 'Sal da Caverna Shoal (usado em fabricação).',
        shoal_shell: 'Concha da Caverna Shoal (usada em fabricação).',
        // itens segurados diversos
        bright_powder: 'Item segurado: reduz um pouco a precisão dos golpes contra o portador.',
        white_herb: 'Item segurado: restaura atributos reduzidos (1 vez).',
        exp_share: 'Item segurado: o portador ganha parte do EXP sem lutar.',
        quick_claw: 'Item segurado: chance de agir primeiro.',
        soothe_bell: 'Item segurado: aumenta a amizade mais rápido.',
        mental_herb: 'Item segurado: tira o portador da atração (1 vez).',
        cleanse_tag: 'Item segurado: reduz o encontro de selvagens.',
        soul_dew: 'Segurado por Latios/Latias: aumenta At. Esp. e Def. Esp.',
        deep_sea_tooth: 'Segurado por Clamperl: dobra o At. Especial (evolui em Huntail por troca).',
        deep_sea_scale: 'Segurado por Clamperl: dobra a Def. Especial (evolui em Gorebyss por troca).',
        scope_lens: 'Item segurado: aumenta a chance de crítico.',
        light_ball: 'Segurado por Pikachu: dobra Ataque e At. Especial.',
        sea_incense: 'Item segurado: aumenta um pouco o dano de golpes de Água.',
        lax_incense: 'Item segurado: reduz um pouco a precisão dos golpes contra o portador.',
        lucky_punch: 'Segurado por Chansey: aumenta muito a chance de crítico.',
        metal_powder: 'Segurado por Ditto: aumenta a Defesa.',
        stick: "Segurado por Farfetch'd: aumenta muito a chance de crítico.",
        // itens-chave
        coin_case: 'Estojo para as fichas do Cassino.',
        itemfinder: 'Detecta itens escondidos por perto.',
        ss_ticket: 'Passagem para o navio S.S. Anne.',
        contest_pass: 'Passe para concursos.',
        wailmer_pail: 'Regador para plantar e regar berries.',
        devon_goods: 'Mercadorias da Devon (item de história).',
        soot_sack: 'Saco para coletar cinzas vulcânicas.',
        basement_key: 'Chave do subsolo (item de história).',
        pokeblock_case: 'Estojo de PokéBlocks (concursos).',
        letter: 'Uma carta (item de história).',
        eon_ticket: 'Bilhete para a Ilha Sul (Latios/Latias).',
        red_orb: 'Orbe lendário ligado a Groudon.',
        blue_orb: 'Orbe lendário ligado a Kyogre.',
        scanner: 'Aparelho de leitura (item de história).',
        go_goggles: 'Óculos para atravessar tempestades de areia.',
        meteorite: 'Meteorito (item de história).',
        room_1_key: 'Chave da Sala 1.', room_2_key: 'Chave da Sala 2.', room_4_key: 'Chave da Sala 4.', room_6_key: 'Chave da Sala 6.',
        storage_key: 'Chave do depósito.',
        root_fossil: 'Fóssil que revive Lileep.',
        claw_fossil: 'Fóssil que revive Anorith.',
        devon_scope: 'Revela Pokémon invisíveis (Kecleon).',
        oaks_parcel: 'Encomenda para o Prof. Carvalho.',
        poke_flute: 'Flauta que acorda Pokémon adormecidos (ex.: Snorlax).',
        secret_key: 'Chave secreta (Ginásio de Cinnabar).',
        bike_voucher: 'Vale para trocar por uma bicicleta.',
        gold_teeth: 'Dentes de ouro (item de troca com um NPC).',
        old_amber: 'Fóssil que revive Aerodactyl.',
        lift_key: 'Chave do elevador (Esconderijo Rocket).',
        helix_fossil: 'Fóssil que revive Omanyte.',
        dome_fossil: 'Fóssil que revive Kabuto.',
        silph_scope: 'Revela e permite enfrentar os fantasmas da Torre Pokémon.',
        vs_seeker: 'Procura treinadores para re-batalhar.',
        fame_checker: 'Registra informações de pessoas famosas.',
        tm_case: 'Estojo que guarda seus MTs/HMs.',
        berry_pouch: 'Bolsa que guarda suas berries.',
        teachy_tv: 'TV com dicas de como jogar.',
        tri_pass: 'Passe para viajar entre as Ilhas Sevii.',
        rainbow_pass: 'Passe para viajar entre as Ilhas Sevii.',
        tea: 'Chá para dar ao guarda (libera a passagem).',
        mystic_ticket: 'Bilhete para evento especial (Ho-Oh / Lugia).',
        aurora_ticket: 'Bilhete para evento especial (Deoxys).',
        hm_tool_rock_smash: 'Picareta para quebrar pedras (Rock Smash).',
        safari_ball: 'Bola especial usada apenas na Zona Safári.',
        link_cable: 'Cabo que simula uma troca: evolui Pokémon que evoluem por troca, sem precisar trocar.'
    };
    const TYPE_PT = { normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta', ice: 'Gelo', fighting: 'Luta', poison: 'Veneno', ground: 'Terra', flying: 'Voador', psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão', dark: 'Sombrio', steel: 'Aço', fairy: 'Fada' };

    function descOf(slug) {
        if (PT_DESC[slug]) return { text: PT_DESC[slug], en: false };
        if (PT_EXTRA[slug]) return { text: PT_EXTRA[slug], en: false };
        // padrões: gems, mails, lenços de concurso, fragmentos
        let m;
        if ((m = slug.match(/^([a-z]+)_gem$/)) && TYPE_PT[m[1]]) return { text: `Item segurado: aumenta o dano do próximo golpe do tipo ${TYPE_PT[m[1]]} (some ao usar).`, en: false };
        if (/_mail$/.test(slug)) return { text: 'Carta decorativa para ser segurada por um Pokémon.', en: false };
        if (/^(red|blue|pink|green|yellow)_scarf$/.test(slug)) return { text: 'Lenço de concurso (melhora uma condição em concursos).', en: false };
        if (/_shard$/.test(slug)) return { text: 'Fragmento colorido (item de coleção/troca).', en: false };
        // MT/HM: descrição = golpe → puxa a descrição PT do wiki-meta pelo nome
        if (CAT[slug] && CAT[slug].pocket === 'tm') {
            const nm = CAT[slug].name || '';
            const mv = nm.split(/[-–]/).slice(1).join('-').trim();
            const mvSlug = mv.toLowerCase().replace(/[.'’]/g, '').replace(/[\s-]+/g, '_');
            const w = MOVE_WIKI && (MOVE_WIKI[mvSlug] || MOVE_WIKI[mvSlug.replace(/_/g, '')]);
            if (w && w.desc) return { text: `${mv}: ${w.desc}`, en: false };
        }
        const c = CAT[slug];
        const d = (c && c.desc) || '';
        return { text: d, en: d ? looksEN(d) : false };
    }
    const nameOf = (slug) => (CAT[slug] && CAT[slug].name) || cap(slug.replace(/_/g, ' '));
    const pocketOf = (slug) => (CAT[slug] && CAT[slug].pocket) || 'items';

    function render() {
        if (!BAG) return;
        const entries = Object.entries(BAG).filter(([slug, q]) => Number(q) > 0);
        if (!entries.length) { body.innerHTML = '<div class="bg-wait">Sua mochila está vazia (ou ainda não sincronizou).</div>'; sumEl.textContent = ''; return; }

        const q = query.trim().toLowerCase();
        const shown = q ? entries.filter(([slug]) => (nameOf(slug) + ' ' + slug).toLowerCase().includes(q)) : entries;
        const totalItens = entries.length, totalQtd = entries.reduce((s, [, n]) => s + Number(n), 0);
        sumEl.textContent = `${totalItens} tipos · ${totalQtd} itens no total`;

        // agrupa por bolso
        const byPocket = {};
        shown.forEach(([slug, qty]) => { const p = pocketOf(slug); (byPocket[p] = byPocket[p] || []).push([slug, qty]); });
        const order = [...POCKET_ORDER, ...Object.keys(byPocket).filter((p) => !POCKET_ORDER.includes(p))];

        let html = '';
        order.forEach((p) => {
            const list = byPocket[p]; if (!list || !list.length) return;
            list.sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])));
            html += `<div class="bg-pocket"><div class="bg-pocket-head"><span>${esc(POCKET_PT[p] || cap(p))}</span><span>${list.length}</span></div>`;
            list.forEach(([slug, qty]) => {
                const d = descOf(slug);
                html += `<div class="bg-item">` +
                    `<img class="bg-img" src="${sprite(slug)}" onerror="this.style.display='none'">` +
                    `<div class="bg-info"><span class="bg-nm">${esc(nameOf(slug))}${d.en ? '<span class="bg-en" title="descrição do jogo em inglês">EN</span>' : ''}</span>` +
                    (d.text ? `<div class="bg-desc${d.en ? ' en' : ''}">${esc(d.text)}</div>` : '') +
                    `</div><span class="bg-qty">×${qty}</span></div>`;
            });
            html += `</div>`;
        });
        body.innerHTML = html || '<div class="bg-wait">Nenhum item encontrado.</div>';
    }

    searchEl.addEventListener('input', () => { query = searchEl.value; render(); });

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'character-data') return;
        const p = msg.payload || {};
        if (p.bag && typeof p.bag === 'object') { BAG = p.bag; render(); }
    });

    // catálogo de itens do jogo (nome + descrição + bolso)
    fetch('https://infinitymmo.net/assets/data/items.json')
        .then((r) => r.json())
        .then((d) => {
            if (Array.isArray(d.pocketOrder)) POCKET_ORDER = d.pocketOrder;
            const items = d && d.items ? (Array.isArray(d.items) ? d.items : Object.values(d.items)) : [];
            items.forEach((it) => { if (it && it.slug) CAT[it.slug] = { name: it.name || it.slug, desc: (it.desc || '').replace(/\s+/g, ' ').trim(), pocket: it.pocket || 'items' }; });
            if (BAG) render();
        })
        .catch(() => {});

    // golpes em PT (pra descrição dos MTs/HMs)
    fetch('https://infinitymmo.net/assets/data/wiki-meta.json')
        .then((r) => r.json())
        .then((d) => { MOVE_WIKI = (d && d.moves) || {}; if (BAG) render(); })
        .catch(() => {});
})();
