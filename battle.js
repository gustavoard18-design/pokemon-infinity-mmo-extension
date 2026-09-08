const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
// TYPE_MAPPER e TYPES vêm de components/type-tag.js; CHART/defMultiplier vêm de
// components/type-chart-data.js; MOVE_TYPES vem de data/move-types.js;
// STATUS_MOVES vem de data/move-status.js

const state = {
    battleId: null, kind: null, foe: null, foeParty: [], party: [], youMon: null, bag: {}, turn: 1,
    canCatch: false, moves: [], caught: false, over: false, active: { you: null, foe: null },
    stages: { you: {}, foe: {} }, foeMoveUses: {}, faintedYou: new Set(),
    weather: null, screens: { you: {}, foe: {} }, heldItems: {}, trainerId: null
};

// identificador do treinador a partir do payload (campo `trainer`). Só devolve
// uma chave quando é um id DISTINTIVO (id/nome/gfx), nunca uma flag genérica —
// assim, se o jogo não expõe um id de verdade, não persistimos (evita voltar a
// vazar golpes entre treinadores diferentes).
function trainerKeyOf(t) {
    if (t == null) return null;
    if (typeof t === 'object') {
        const id = t.id ?? t.trainerId ?? t.tid ?? t.slug ?? t.name ?? t.gfx;
        return id != null && String(id).length >= 2 ? `t:${String(id)}` : null;
    }
    if (typeof t === 'string') {
        const s = t.trim().toLowerCase();
        // ignora valores genéricos que não identificam UM treinador
        if (s.length < 3 || ['true', 'trainer', 'treinador', 'npc', 'sim', 'yes', '1'].includes(s)) return null;
        return `t:${t.trim()}`;
    }
    return null;   // boolean/number → é flag, não identifica o treinador
}
let pokedexBySlug = new Map();
let trainerMovesByKey = new Map();
let discoveredMovesByKey = new Map();
// roster completo do jogador (time + caixas), achatado numa lista pra o "counter":
// { mon, inParty, label } — label = nome (time) ou "Cx.N" (PC).
let rosterMons = [];
function setRoster(roster) {
    const out = [];
    (Array.isArray(roster?.party) ? roster.party : []).forEach((mon) => {
        if (mon && (mon.species || mon.name)) out.push({ mon, inParty: true, label: mon.name || mon.species });
    });
    (Array.isArray(roster?.pc) ? roster.pc : []).forEach((box, boxIndex) => {
        (Array.isArray(box?.pokemon) ? box.pokemon : []).forEach((mon) => {
            if (mon && (mon.species || mon.name)) out.push({ mon, inParty: false, label: `Cx.${boxIndex + 1}` });
        });
    });
    rosterMons = out;
}
async function loadRoster() {
    try { setRoster(await PokemonHelperStorage.getRoster()); render(); }
    catch (error) { console.warn('[Infinity Dex Helper] Não foi possível carregar o roster:', error); }
}
const openMoves = new Set();

// Dados de golpe EM PORTUGUÊS direto do jogo (wiki-meta.json → moves): nome,
// tipo, categoria, poder, precisão, PP e descrição. Usado no banner de golpe.
let MOVE_WIKI = null;
fetch('https://infinitymmo.net/assets/data/wiki-meta.json')
    .then((r) => r.json())
    .then((d) => { MOVE_WIKI = (d && d.moves) || {}; if (typeof render === 'function') render(); })
    .catch(() => {});

// catálogo de itens do jogo (wiki-shops → items): slug -> { name, desc }.
// Usado pra mostrar o item que o Pokémon selvagem está segurando com nome legível.
let ITEM_WIKI = null;
fetch('https://infinitymmo.net/assets/data/wiki-shops.json')
    .then((r) => r.json())
    .then((d) => {
        const map = {};
        (d && d.items ? Object.values(d.items) : []).forEach((it) => { if (it && it.slug) map[it.slug] = { name: it.name || it.slug, desc: it.desc || '' }; });
        ITEM_WIKI = map;
        if (typeof render === 'function') render();
    })
    .catch(() => {});
const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
// nome legível + descrição de um item pelo slug (ou valor cru do payload)
function itemInfo(raw) {
    if (!raw) return null;
    const slug = String(raw).trim().toLowerCase().replace(/[\s'’.]+/g, '_');
    const w = ITEM_WIKI && (ITEM_WIKI[slug] || ITEM_WIKI[raw]);
    return { slug, name: (w && w.name) || titleCase(raw), desc: (w && w.desc) || '' };
}
const itemSprite = (slug) => `https://infinitymmo.net/assets/items/${slug}.png`;

// poder/categoria/precisão do golpe preferindo os valores REAIS do jogo
// (wiki-meta), depois o payload da luta e por fim o MOVE_DETAILS (PokeAPI).
function moveStats(slug, payloadMove) {
    const w = (MOVE_WIKI && slug) ? MOVE_WIKI[slug] : null;
    const d = (slug && MOVE_DETAILS[slug]) || {};
    const pm = payloadMove || {};
    const power = (w && w.pow != null) ? w.pow : (pm.power != null ? Number(pm.power) : (d.power ?? 0));
    const category = (w && w.cat) || pm.category || d.category || 'physical';
    const accuracy = (w && w.acc != null) ? w.acc : (pm.accuracy != null ? Number(pm.accuracy) : (d.accuracy ?? null));
    return { power: Number(power) || 0, category, accuracy };
}

// seções visíveis da tela (Configurações → TELAS → BATALHA)
let SCREEN_PREFS = Object.assign({}, PokemonHelperStorage.DEFAULT_UI_PREFERENCES.screens.battle);
PokemonHelperStorage.getUiPreferences()
    .then((prefs) => { SCREEN_PREFS = prefs.screens.battle; render(); })
    .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[PokemonHelperStorage.KEYS.uiPreferences]) return;
    PokemonHelperStorage.getUiPreferences()
        .then((prefs) => { SCREEN_PREFS = prefs.screens.battle; render(); })
        .catch(() => {});
});

const escapeHtml = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const normalizeSpecies = (value) => String(value || '').trim().toLowerCase().replace(/[.']/g, '').replace(/[\s-]+/g, '_');
const typeNames = (types) => [...new Set((types || []).map((id) => TYPE_MAPPER[id] || String(id).toLowerCase()).filter(Boolean))];
const row = (label, value) => `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
// verde/amarelo/vermelho por faixa de IV (0-31), usado no grid IVS/STATS e na
// célula "IVS TOTAL" da grade meta
const ivColor = (iv) => iv >= 26 ? 'var(--px-good)' : iv >= 15 ? 'var(--px-mid)' : 'var(--px-bad)';

function resetBattle(battleId) {
    Object.assign(state, {
        battleId: battleId || null, kind: null, foe: null, foeParty: [], youMon: null, turn: 1,
        canCatch: false, moves: [], caught: false, over: false,
        active: { you: null, foe: null }, stages: { you: {}, foe: {} }, foeMoveUses: {},
        faintedYou: new Set(), weather: null, screens: { you: {}, foe: {} }, trainerId: null
    });
}

// HP atual de um Pokémon (do time ou ativo), tentando os formatos possíveis do
// payload do jogo. Retorna null quando não há um campo de HP atual — nesse caso
// não dá pra afirmar que desmaiou, então o chamador não filtra por HP.
function monCurrentHp(mon) {
    if (!mon) return null;
    for (const v of [mon.hp, mon.curHp, mon.currentHp, mon.hpCur, mon.hp_cur, mon.chp]) {
        if (typeof v === 'number') return v;
    }
    return null;
}

// um Pokémon do time (pelo índice) está desmaiado? state.party é um snapshot que
// não aprende os desmaios da luta em si, então marcamos por índice sempre que o
// HP ao vivo do Pokémon EM CAMPO zera (ver updateBattle). Também respeita um HP
// atual no próprio snapshot, caso o jogo o envie atualizado.
function isYouFainted(index) {
    if (index == null || index < 0) return false;
    if (state.faintedYou.has(index)) return true;
    const cur = monCurrentHp(state.party[index]);
    return cur != null && cur <= 0;
}

// Guarda Maravilha (Wonder Guard): o Pokémon só sofre dano de golpes SUPER
// eficazes (multiplicador ≥ 2). Ex.: Shedinja. Aceita o campo de habilidade em
// qualquer formato (slug ou nome, PT ou EN).
function hasWonderGuard(mon) {
    const a = mon && (mon.ability || mon.abilitySlug || mon.hability);
    if (!a) return false;
    const n = String(a).toLowerCase().replace(/[^a-z]/g, '');
    return n.includes('wonderguard') || n.includes('guardamaravilha');
}

// chave normalizada da habilidade (slug/nome, PT ou EN) e rótulo pra exibir
function abilityKey(mon) {
    const a = mon && (mon.ability || mon.abilitySlug || mon.hability);
    return a ? String(a).toLowerCase().replace(/[^a-z]/g, '') : '';
}
function abilityLabelOf(mon) {
    const raw = mon && (mon.ability || mon.abilitySlug || mon.hability);
    if (!raw) return '';
    try { return PokemonAbilityInfo.label(raw) || String(raw); } catch (_) { return String(raw); }
}

// habilidades defensivas que ANULAM um tipo (dano 0; várias ainda curam, mas o
// que importa aqui é ser 0). Chave = habilidade normalizada, valor = tipo imune.
const ABILITY_IMMUNE = {
    levitate: 'ground', eartheater: 'ground', voar: 'ground', levitacao: 'ground',
    flashfire: 'fire', absorvercalor: 'fire',
    voltabsorb: 'electric', lightningrod: 'electric', motordrive: 'electric', pararaios: 'electric',
    waterabsorb: 'water', stormdrain: 'water', dryskin: 'water', peleseca: 'water',
    sapsipper: 'grass',
};

// Ajuste de dano por habilidade (atacante e defensor). Recebe os dois Pokémon,
// o tipo (nome) e categoria do golpe, a eficácia de tipo (effMult), se é STAB do
// atacante, e as frações de HP (pra Multiescama e habilidades "em apuros").
// Devolve { immune, mult, why }. `mult` multiplica o dano final; `immune` = 0.
function abilityFactor(attacker, defender, moveType, isSpecial, power, effMult, isStab, atkHpFrac, defHpFrac) {
    const why = [];
    let mult = 1;
    const da = abilityKey(attacker), dd = abilityKey(defender);

    // ---- defensor: imunidades ----
    if (dd === 'wonderguard' && effMult < 2) return { immune: true, mult: 0, why: [abilityLabelOf(defender) || 'Guarda Maravilha'] };
    if (ABILITY_IMMUNE[dd] === moveType) return { immune: true, mult: 0, why: [abilityLabelOf(defender)] };

    // ---- defensor: reduções / aumentos ----
    if (dd === 'thickfat' && (moveType === 'fire' || moveType === 'ice')) { mult *= 0.5; why.push(`${abilityLabelOf(defender)} ½`); }
    if ((dd === 'heatproof' || dd === 'waterbubble') && moveType === 'fire') { mult *= 0.5; why.push(`${abilityLabelOf(defender)} ½`); }
    if ((dd === 'multiscale' || dd === 'shadowshield') && atkHpFrac !== undefined && defHpFrac != null && defHpFrac >= 0.999) { mult *= 0.5; why.push(`${abilityLabelOf(defender)} ½ (HP cheio)`); }
    if ((dd === 'filter' || dd === 'solidrock' || dd === 'prismarmor') && effMult > 1) { mult *= 0.75; why.push(`${abilityLabelOf(defender)} reduz super eficaz`); }
    if (dd === 'furcoat' && !isSpecial) { mult *= 0.5; why.push(`${abilityLabelOf(defender)} ½ físico`); }
    if (dd === 'icescales' && isSpecial) { mult *= 0.5; why.push(`${abilityLabelOf(defender)} ½ especial`); }
    if (dd === 'purifyingsalt' && moveType === 'ghost') { mult *= 0.5; why.push(`${abilityLabelOf(defender)} ½ fantasma`); }
    if (dd === 'dryskin' && moveType === 'fire') { mult *= 1.25; why.push(`${abilityLabelOf(defender)} +25% fogo`); }

    // ---- atacante: boosts ----
    if ((da === 'hugepower' || da === 'purepower') && !isSpecial) { mult *= 2; why.push(`${abilityLabelOf(attacker)} (dobra Atq)`); }
    if (da === 'adaptability' && isStab) { mult *= (2 / 1.5); why.push(`${abilityLabelOf(attacker)} (STAB 2×)`); }
    if (da === 'technician' && power > 0 && power <= 60) { mult *= 1.5; why.push(`${abilityLabelOf(attacker)} +50%`); }
    if (da === 'tintedlens' && effMult > 0 && effMult < 1) { mult *= 2; why.push(`${abilityLabelOf(attacker)} (pouco eficaz 2×)`); }
    if (da === 'waterbubble' && moveType === 'water') { mult *= 2; why.push(`${abilityLabelOf(attacker)} (2× água)`); }
    const PINCH = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' };
    if (PINCH[da] && moveType === PINCH[da] && atkHpFrac != null && atkHpFrac <= 1 / 3) { mult *= 1.5; why.push(`${abilityLabelOf(attacker)} (em apuros +50%)`); }
    if (da === 'guts' && attacker && attacker.status && !isSpecial) { mult *= 1.5; why.push(`${abilityLabelOf(attacker)} (+50%)`); }
    const TYPE_BOOST = { transistor: 'electric', dragonsmaw: 'dragon', steelworker: 'steel', rockypayload: 'rock' };
    if (TYPE_BOOST[da] && moveType === TYPE_BOOST[da]) { mult *= 1.5; why.push(`${abilityLabelOf(attacker)} +50%`); }

    return { immune: false, mult, why };
}

// fração de HP de um Pokémon (0–1). Usa HP ao vivo quando existir; senão 1.
function hpFractionOf(mon, liveHp) {
    const cur = typeof liveHp === 'number' ? liveHp : monCurrentHp(mon);
    const max = Number(mon?.maxHp) || Number(mon?.stats?.hp) || null;
    if (cur == null || !max) return null;
    return Math.max(0, Math.min(1, cur / max));
}

// acha o Pokémon ativo do time. Prioriza o índice de batalha em state.party;
// se não alinhar, casa pelo moveset atual (state.moves). Se o time ainda não
// foi sincronizado nesta sessão, cai pros dados ao vivo do próprio Pokémon
// ativo vindos do payload de batalha (state.youMon) — assim o dano aparece
// mesmo sem a sincronização do personagem ter rolado.
function resolveActivePokemon() {
    const byIndex = state.party[state.active.you];
    if (byIndex) return byIndex;
    const wanted = state.moves.map((move) => slugifyMoveName(move.name)).filter(Boolean);
    if (wanted.length) {
        const byMoves = state.party.find((pokemon) => {
            const names = new Set((pokemon?.moves || []).map((move) => slugifyMoveName(move.name)));
            return wanted.every((slug) => names.has(slug));
        });
        if (byMoves) return byMoves;
    }
    return state.youMon || null;
}

// multiplicador de atributo alterado (mesma tabela dos jogos): +1 = ×1.5,
// +2 = ×2 … +6 = ×4; -1 = ×2/3 … -6 = ×1/4. Aplica-se a atk/def/spa/spd/spe.
function stageMultiplier(stage) {
    const s = Math.max(-6, Math.min(6, Number(stage) || 0));
    return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

// stat efetivo de um Pokémon: usa o valor ao vivo (payload) quando existe; se
// faltar (o jogo nem sempre manda os stats completos do oponente), calcula do
// base da Pokédex + IV + nível (natureza neutra) em vez de usar 1 — senão a
// defesa vira 1 e o dano estimado explota. Devolve null se não dá pra saber.
function effectiveStat(mon, key) {
    const live = Number(mon && mon.stats ? mon.stats[key] : NaN);
    if (Number.isFinite(live) && live > 0) return live;
    const entry = pokedexBySlug.get(normalizeSpecies(mon && (mon.species || mon.name)));
    const base = Number(entry && entry.base ? entry.base[key] : NaN);
    if (!Number.isFinite(base) || base <= 0) return null;
    const ivRaw = Number(mon && mon.ivs ? mon.ivs[key] : NaN);
    const iv = Number.isFinite(ivRaw) ? Math.max(0, Math.min(31, ivRaw)) : 15;
    const level = Number(mon && mon.level) || 1;
    return Math.floor((2 * base + iv) * level / 100 + 5);
}

// ---- tabela de efetividade REAL do jogo (G.dex.types) --------------------
// O interceptor publica G.dex.types cru; aqui guardamos e consultamos com os
// MESMOS tokens crus que o jogo usa em mon.types / move.type (índices). O jogo
// pode ter matchups custom — usar a matriz dele deixa o dano estimado fiel.
// Se qualquer lookup falhar, quem chama cai na tabela estática (CHART).
let LIVE_TYPES = null;
function setLiveTypeChart(raw) {
    try { const v = JSON.parse(raw); if (v && typeof v === 'object') { LIVE_TYPES = v; if (typeof render === 'function') render(); } } catch (_) {}
}
// ---- bônus de dano do ITEM segurado ---------------------------------------
// itens que aumentam o dano do golpe (usados no dano estimado). Bônus de tipo
// = ×1.2 (Gen 4+); Life Orb ×1.3; Choice Band/Specs ×1.5; Muscle Band/Wise
// Glasses ×1.1; Expert Belt ×1.2 se super-efetivo.
const TYPE_BOOST_ITEM = {
    silk_scarf: 'normal', charcoal: 'fire', mystic_water: 'water', sea_incense: 'water', wave_incense: 'water',
    magnet: 'electric', miracle_seed: 'grass', rose_incense: 'grass', never_melt_ice: 'ice', black_belt: 'fighting',
    poison_barb: 'poison', soft_sand: 'ground', sharp_beak: 'flying', twisted_spoon: 'psychic', odd_incense: 'psychic',
    silver_powder: 'bug', hard_stone: 'rock', rock_incense: 'rock', spell_tag: 'ghost', dragon_fang: 'dragon',
    black_glasses: 'dark', metal_coat: 'steel',
    // Placas do Arceus (mesmo bônus de tipo ×1.2, só nomes diferentes)
    flame_plate: 'fire', splash_plate: 'water', zap_plate: 'electric', meadow_plate: 'grass',
    icicle_plate: 'ice', fist_plate: 'fighting', toxic_plate: 'poison', earth_plate: 'ground',
    sky_plate: 'flying', mind_plate: 'psychic', insect_plate: 'bug', stone_plate: 'rock',
    spooky_plate: 'ghost', draco_plate: 'dragon', dread_plate: 'dark', iron_plate: 'steel',
    pixie_plate: 'fairy'
};
// berries de resistência: metade do dano de um golpe super eficaz do tipo
// (Chilan reduz qualquer golpe Normal). Chave = prefixo do slug (…_berry).
const RESIST_BERRY = {
    occa: 'fire', passho: 'water', wacan: 'electric', rindo: 'grass', yache: 'ice',
    chople: 'fighting', kebia: 'poison', shuca: 'ground', coba: 'flying', payapa: 'psychic',
    tanga: 'bug', charti: 'rock', kasib: 'ghost', haban: 'dragon', colbur: 'dark',
    babiri: 'steel', chilan: 'normal', roseli: 'fairy'
};
const itemSlugify = (raw) => String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
// chave estável de um Pokémon (espécie+nível+HP máx) pra guardar/recuperar o item
const monItemKey = (m) => `${normalizeSpecies(m && (m.species || m.name))}|${(m && m.level) || ''}|${(m && m.maxHp) || ''}`;
// guarda os itens vistos no time (o payload de BATALHA às vezes reenvia o time
// sem `heldItem`, sobrescrevendo o do personagem — este cache evita perder o item)
function recordHeldItems(party) {
    (party || []).forEach((m) => { if (m && m.heldItem) state.heldItems[monItemKey(m)] = m.heldItem; });
}
// item segurado: usa o do próprio Pokémon; se faltar (payload de batalha sem
// item, ou dados ao vivo do ativo), cai pro cache por espécie/nível/HP.
const heldItemOf = (mon) => {
    const raw = (mon && mon.heldItem) || (mon && state.heldItems[monItemKey(mon)]) || '';
    return raw ? itemSlugify(raw) : '';
};
// item OFENSIVO do atacante que afeta o dano (pra mostrar no tooltip), ou null.
// Recebe o Pokémon (não só o slug) pra tratar dobradores por espécie.
function itemDamageInfo(mon, moveTypeName, isSpecial, effMult) {
    const slug = heldItemOf(mon);
    if (!slug) return null;
    const species = normalizeSpecies(mon && (mon.species || mon.name));
    // dobradores por espécie
    if (slug === 'thick_club' && !isSpecial && (species === 'cubone' || species === 'marowak')) return { mult: 2, why: 'Thick Club (dobra Atq)' };
    if (slug === 'light_ball' && species === 'pikachu') return { mult: 2, why: 'Light Ball (dobra)' };
    // Gem do tipo (×1.3, uma vez)
    const gem = slug.match(/^([a-z]+)_gem$/);
    if (gem && gem[1] === moveTypeName) return { mult: 1.3, why: 'Gem' };
    if (TYPE_BOOST_ITEM[slug] && TYPE_BOOST_ITEM[slug] === moveTypeName) return { mult: 1.2, why: 'item de tipo' };
    if (slug === 'life_orb') return { mult: 1.3, why: 'Life Orb' };
    if (slug === 'choice_band' && !isSpecial) return { mult: 1.5, why: 'Choice Band' };
    if (slug === 'choice_specs' && isSpecial) return { mult: 1.5, why: 'Choice Specs' };
    if (slug === 'muscle_band' && !isSpecial) return { mult: 1.1, why: 'Muscle Band' };
    if (slug === 'wise_glasses' && isSpecial) return { mult: 1.1, why: 'Wise Glasses' };
    if (slug === 'expert_belt' && effMult > 1) return { mult: 1.2, why: 'Expert Belt' };
    return null;
}
// multiplicador de dano do item ofensivo (1 se não afeta)
function itemDamageMult(mon, moveTypeName, isSpecial, effMult) {
    const info = itemDamageInfo(mon, moveTypeName, isSpecial, effMult);
    return info ? info.mult : 1;
}

// item DEFENSIVO do Pokémon que RECEBE o golpe (só dá pra usar quando sabemos o
// item — ou seja, quando o defensor é o SEU Pokémon). Devolve { immune, mult, why }.
function defenseItemFactor(mon, moveTypeName, isSpecial, effMult) {
    const slug = heldItemOf(mon);
    if (!slug) return { immune: false, mult: 1, why: [] };
    // Air Balloon: imune a Terra (até ser atingido)
    if (slug === 'air_balloon' && moveTypeName === 'ground') return { immune: true, mult: 0, why: ['Air Balloon'] };
    let mult = 1; const why = [];
    // Berry de resistência: ½ num golpe do tipo (super eficaz; Chilan = qualquer Normal)
    const berryType = RESIST_BERRY[slug.replace(/_berry$/, '')];
    if (berryType && berryType === moveTypeName && (berryType === 'normal' || effMult > 1)) { mult *= 0.5; why.push('Berry de resistência ½'); }
    if (slug === 'eviolite') { mult *= 2 / 3; why.push('Eviolite'); }
    if (slug === 'assault_vest' && isSpecial) { mult *= 2 / 3; why.push('Assault Vest'); }
    return { immune: false, mult, why };
}

// multiplicador via matriz do jogo: mt = token cru do tipo do golpe,
// defTypes = tokens crus dos tipos do defensor. Devolve null se não resolver.
function liveMultiplier(mt, defTypes) {
    if (!LIVE_TYPES || mt == null || !Array.isArray(defTypes) || !defTypes.length) return null;
    const uniq = [...new Set(defTypes)];
    // a matriz pode ser o próprio objeto ou estar numa sub-propriedade dele
    const roots = [LIVE_TYPES];
    for (const v of Object.values(LIVE_TYPES)) if (v && typeof v === 'object') roots.push(v);
    for (const root of roots) {
        const row = root[mt];
        if (!row || typeof row !== 'object') continue;
        let prod = 1, ok = true;
        for (const dt of uniq) {
            const val = row[dt];
            if (typeof val !== 'number' || !isFinite(val)) { ok = false; break; }
            prod *= val;
        }
        if (ok) return prod;
    }
    return null;
}

// estimativa de dano (fórmula padrão de jogos Pokémon). Inclui os atributos
// alterados: `atkStage` é o estágio ofensivo de quem ataca e `defStage` o
// defensivo de quem defende (quem chama escolhe atk/spa vs def/spd). `itemMult`
// é o bônus do item segurado (ver itemDamageMult). Continua sem crítico/clima/
// habilidade. Devolve { min, max } (variação 85–100%), ou null se não resolver.
function estimateDamage(pokemon, move, foe, multiplier, stab = 1, atkStage = 0, defStage = 0, itemMult = 1) {
    const level = Number(pokemon.level) || 1;
    const power = Number(move.power) || 0;
    const isSpecial = move.category === 'special';
    const rawAtk = effectiveStat(pokemon, isSpecial ? 'spa' : 'atk');
    const rawDef = effectiveStat(foe, isSpecial ? 'spd' : 'def');
    if (rawAtk == null || rawDef == null) return null;
    // estatística efetiva depois do estágio (o jogo trunca o resultado)
    const atk = Math.max(1, Math.floor(rawAtk * stageMultiplier(atkStage)));
    const def = Math.max(1, Math.floor(rawDef * stageMultiplier(defStage)));
    // fórmula EXATA do jogo (calcDamage em battle54.js): a base tem UM único
    // floor na conta inteira, com o +2 fora do floor; e STAB × efetividade ×
    // aleatório (85–100%) entram todos juntos num único floor no final — NÃO
    // um floor por passo (era isso que dava a imprecisão de ±1–2).
    const base = Math.floor((Math.floor(2 * level / 5) + 2) * power * atk / def / 50) + 2;
    const roll = (randPct) => {
        const d = Math.floor(base * stab * multiplier * (itemMult || 1) * randPct / 100);
        return multiplier > 0 ? Math.max(1, d) : 0;
    };
    return { min: roll(85), max: roll(100) };
}

// ---- ajustes contextuais do dano (alto impacto) --------------------------

// golpes que batem várias vezes → nº de acertos considerado (2–5 ≈ 3)
const MULTI_HIT = {
    double_kick: 2, double_hit: 2, bonemerang: 2, dual_chop: 2, twineedle: 2, gear_grind: 2, dragon_darts: 2, tachyon_cutter: 2,
    triple_kick: 3, triple_axel: 3, surging_strikes: 3,
    bullet_seed: 3, rock_blast: 3, pin_missile: 3, icicle_spear: 3, fury_attack: 3, fury_swipes: 3, tail_slap: 3,
    bone_rush: 3, comet_punch: 3, arm_thrust: 3, water_shuriken: 3, scale_shot: 3, spike_cannon: 3, barrage: 3
};
const moveHitCount = (slug) => MULTI_HIT[slug] || 1;

// golpes de dano fixo / OHKO (a fórmula normal não se aplica).
// Retorna { fixed:n } | { ohko:true } | null.
const OHKO_MOVES = new Set(['fissure', 'horn_drill', 'guillotine', 'sheer_cold']);
function fixedDamage(slug, attacker, defender) {
    if (OHKO_MOVES.has(slug)) return { ohko: true };
    if (slug === 'seismic_toss' || slug === 'night_shade') { const l = Number(attacker?.level) || 0; return l ? { fixed: l } : null; }
    if (slug === 'dragon_rage') return { fixed: 40 };
    if (slug === 'sonic_boom') return { fixed: 20 };
    if (slug === 'super_fang') { const hp = monCurrentHp(defender); return hp != null ? { fixed: Math.max(1, Math.floor(hp / 2)) } : null; }
    if (slug === 'endeavor') { const dh = monCurrentHp(defender), ah = monCurrentHp(attacker); return (dh != null && ah != null) ? { fixed: Math.max(0, dh - ah) } : null; }
    return null;
}

// clima atual → fator por tipo de golpe.
// DESATIVADO por ora: o formato do campo de clima no payload não foi confirmado
// e havia risco de confundir ciclo dia/noite ("sol"/"dia") com clima real,
// multiplicando o dano errado. Reativar só após verificar o campo numa batalha.
function weatherFactor(moveType) {
    return 1;
}

// queimadura: atacante queimado causa ½ com golpes físicos
function burnFactor(attacker, isSpecial) {
    if (isSpecial) return 1;
    return /burn|brn|queima/.test(String(attacker?.status || '').toLowerCase()) ? 0.5 : 1;
}

// telas na defesa: Reflect (½ físico), Light Screen (½ especial), Aurora Veil (½ ambos)
// DESATIVADO por ora (mesmo motivo do clima): a detecção de telas lê o payload de
// forma não confirmada e podia reduzir o dano por engano. Reativar após verificar.
function screenFactor(defenderSideKey, isSpecial) {
    return 1;
}

// fator contextual combinado (clima × queimadura × telas) pro atacante→defensor
function contextFactor(attacker, moveType, isSpecial, defenderSideKey) {
    return weatherFactor(moveType) * burnFactor(attacker, isSpecial) * screenFactor(defenderSideKey, isSpecial);
}

// leitura defensiva de clima/telas do payload de batalha (o formato não é
// documentado, então tentamos vários campos; se nada bater, ficam sem efeito).
const normWeather = (w) => typeof w === 'string' ? w.toLowerCase().replace(/[^a-z]/g, '') : null;
function readWeather(bs, data) {
    let w = bs.weather ?? (bs.field && bs.field.weather) ?? (bs.env && bs.env.weather) ?? (data && data.weather);
    if (w && typeof w === 'object' && typeof w.type === 'string') w = w.type;
    if (typeof w === 'string') state.weather = normWeather(w) || null;
    else if (w === null) state.weather = null;
}
function screenSetFrom(sideObj) {
    const out = {};
    if (!sideObj || typeof sideObj !== 'object') return out;
    const flags = sideObj.screens || sideObj.sideConditions || sideObj.side || sideObj;
    const mark = (name) => {
        const n = String(name).toLowerCase().replace(/[^a-z]/g, '');
        if (n.includes('auroraveil')) out.auroraveil = true;
        else if (n.includes('reflect')) out.reflect = true;
        else if (n.includes('lightscreen')) out.lightscreen = true;
    };
    if (Array.isArray(flags)) flags.forEach(mark);
    else if (flags && typeof flags === 'object') for (const k in flags) { if (flags[k]) mark(k); }
    return out;
}
function readScreens(bs) {
    state.screens = { you: screenSetFrom(bs.you), foe: screenSetFrom(bs.foe) };
}

// escolhe a melhor combinação Pokémon+golpe do time contra o oponente atual
// (potência × precisão × eficácia × STAB × ataque) e monta a caixa de destaque
function bestPlay(foe) {
    const defenders = typeNames(foe.types), candidates = [];
    // varre com o índice REAL do time (sem filter(Boolean), que reindexaria) pra
    // poder pular quem já desmaiou nesta luta.
    state.party.forEach((pokemon, index) => {
        if (!pokemon || isYouFainted(index)) return;
        (pokemon.moves || []).forEach((move, moveIndex) => {
            const ms = moveStats(resolveMoveSlug(move.name), move);   // poder real do jogo
            if (Number(move.pp) <= 0 || ms.power <= 0) return;
            const moveType = TYPE_MAPPER[move.type];
            const multiplier = liveMultiplier(move.type, foe.types) ?? defMultiplier(moveType, defenders);
            const stab = typeNames(pokemon.types).includes(moveType) ? 1.5 : 1;
            const attack = ms.category === 'special' ? Number(pokemon.stats?.spa || 1) : Number(pokemon.stats?.atk || 1);
            const itemMult = itemDamageMult(pokemon, moveType, ms.category === 'special', multiplier);
            const ab = abilityFactor(pokemon, foe, moveType, ms.category === 'special', ms.power, multiplier, stab > 1, hpFractionOf(pokemon), hpFractionOf(foe, foe.hp));
            if (ab.immune) return;   // o adversário anula esse golpe (ex.: Levitate) — não recomenda
            const ctxMult = moveHitCount(resolveMoveSlug(move.name)) * contextFactor(pokemon, moveType, ms.category === 'special', 'foe');
            const nmove = { ...move, power: ms.power, accuracy: ms.accuracy, category: ms.category };
            candidates.push({ pokemon, index, move: nmove, moveIndex, moveType, multiplier, abMult: ab.mult, ctxMult, score: ms.power * ((ms.accuracy ?? 100) || 100) / 100 * multiplier * stab * attack * itemMult * ab.mult * ctxMult });
        });
    });

    // fallback: se os dados de time sincronizados não trazem golpe com poder
    // pro Pokémon que está de fato em campo agora (acontece em algumas lutas),
    // usa o moveset real desta luta (state.moves — mesma fonte de SEUS GOLPES,
    // que sempre reflete o Pokémon ativo corretamente) pra a caixa não sumir.
    const activePokemon = resolveActivePokemon();
    const activeIndex = state.party.indexOf(activePokemon);
    if (activePokemon && !isYouFainted(activeIndex) && !candidates.some((c) => c.pokemon === activePokemon)) {
        state.moves.forEach((move, moveIndex) => {
            const slug = resolveMoveSlug(move.name);
            const moveType = MOVE_TYPES[slug];
            const ms = moveStats(slug, move);
            if (!moveType || Number(move.pp) <= 0 || ms.power <= 0) return;
            const multiplier = liveMultiplier(move.type, foe.types) ?? defMultiplier(moveType, defenders);
            const stab = typeNames(activePokemon.types).includes(moveType) ? 1.5 : 1;
            const attack = ms.category === 'special' ? Number(activePokemon.stats?.spa || 1) : Number(activePokemon.stats?.atk || 1);
            const itemMult = itemDamageMult(activePokemon, moveType, ms.category === 'special', multiplier);
            const ab = abilityFactor(activePokemon, foe, moveType, ms.category === 'special', ms.power, multiplier, stab > 1, hpFractionOf(activePokemon, monCurrentHp(state.youMon)), hpFractionOf(foe, foe.hp));
            if (ab.immune) return;
            const ctxMult = moveHitCount(slug) * contextFactor(activePokemon, moveType, ms.category === 'special', 'foe');
            candidates.push({
                pokemon: activePokemon, index: activeIndex,
                move: { name: move.name, power: ms.power, accuracy: ms.accuracy, category: ms.category },
                moveIndex, moveType, multiplier, abMult: ab.mult, ctxMult,
                score: ms.power * ((ms.accuracy ?? 100) || 100) / 100 * multiplier * stab * attack * itemMult * ab.mult * ctxMult
            });
        });
    }

    candidates.sort((left, right) => right.score - left.score);
    const best = candidates[0];
    if (!best) return '';
    const moveType = best.moveType;
    const hasStab = typeNames(best.pokemon.types).includes(moveType);
    const typeBg = PokemonPixelIcons.typeColor(moveType);
    const fg = PokemonPixelIcons.onColor(typeBg);
    const multBadge = best.multiplier !== 1
        ? `<span class="best-badge ${multClass(best.multiplier)}" data-tip="${best.multiplier > 1 ? 'Super eficaz' : 'Pouco eficaz'} contra o oponente.">${multLabel(best.multiplier)}</span>`
        : '';

    // atributos alterados no dano exibido: o estágio defensivo dele vale sempre
    // (ele continua em campo); o seu estágio ofensivo só se a jogada for com o
    // Pokémon que já está ativo (trocar zera os stages do que entra).
    const isSpecial = best.move.category === 'special';
    const defStage = Number(state.stages.foe[isSpecial ? 'spd' : 'def'] || 0);
    const bestIsActive = best.pokemon === resolveActivePokemon();
    const atkStage = bestIsActive ? Number(state.stages.you[isSpecial ? 'spa' : 'atk'] || 0) : 0;
    const bestItemMult = itemDamageMult(best.pokemon, best.moveType, isSpecial, best.multiplier);
    const dmg = estimateDamage(best.pokemon, best.move, foe, best.multiplier, hasStab ? 1.5 : 1, atkStage, defStage, bestItemMult * (best.abMult || 1) * (best.ctxMult || 1));
    const foeHp = Number(foe.hp) || 0;
    let koBadge = '';
    if (dmg && foeHp > 0) {
        if (dmg.min >= foeHp) {
            koBadge = `<span class="best-badge badge-ko" data-tip="Dano estimado: ${dmg.min}–${dmg.max} (HP dele: ${foeHp}). Mesmo no pior caso da variação aleatória, esse golpe nocauteia.">💀 OHKO</span>`;
        } else if (dmg.max >= foeHp) {
            koBadge = `<span class="best-badge badge-ko-maybe" data-tip="Dano estimado: ${dmg.min}–${dmg.max} (HP dele: ${foeHp}). Pode nocautear dependendo da variação aleatória do jogo, mas não é garantido.">⚡ OHKO?</span>`;
        }
    }

    return `<div class="section"><div class="section-head"><span class="px-label">MELHOR JOGADA</span>${PokemonHelperTooltip.iconHTML('Melhor combinação de Pokémon e golpe do seu time contra este oponente (potência × precisão × eficácia × STAB × ataque).')}</div>
        <div class="best-two">
            <div class="best-r1"><span class="best-star" data-tip="Pokémon do seu time recomendado.">★</span> ${escapeHtml(best.pokemon.name || best.pokemon.species)}</div>
            <div class="best-r2">
                <span class="type-tag" style="background:${typeBg};color:${fg}" data-tip="${escapeHtml(best.move.name)}">
                    <span class="abbr">${escapeHtml(best.move.name)}</span>
                </span>
                ${koBadge}${multBadge}
            </div>
        </div>
    </div>`;
}

// destaca, dentre os golpes disponíveis do Pokémon ativo agora, qual causa
// mais dano estimado neste oponente (mesmo cálculo de score do bestPlay, mas
// restrito ao Pokémon que já está em campo — não ao time inteiro)
function renderMyMoves(foe) {
    const activePokemon = resolveActivePokemon();
    const defenders = typeNames(foe.types);
    const foeHp = Number(foe.hp) || 0;
    let bestSlug = null, bestScore = 0;
    const scored = state.moves.map((move) => {
        const slug = resolveMoveSlug(move.name);
        const moveType = MOVE_TYPES[slug];
        const ms = moveStats(slug, move);   // poder/categoria reais do jogo
        let score = -1;
        let dmgChip = '';
        if (moveType && Number(move.pp) > 0 && ms.power > 0) {
            const multiplier = liveMultiplier(move.type, foe.types) ?? defMultiplier(moveType, defenders);
            const isSpecial = ms.category === 'special';
            const stab = activePokemon ? (typeNames(activePokemon.types).includes(moveType) ? 1.5 : 1) : 1;
            // atributos alterados: você ataca → seu estágio ofensivo (atk/spa) e
            // o estágio defensivo dele (def/spd). Stages só valem pro Pokémon
            // ativo (eles zeram ao trocar); state.stages guarda os dois lados.
            const atkStage = activePokemon ? Number(state.stages.you[isSpecial ? 'spa' : 'atk'] || 0) : 0;
            const defStage = Number(state.stages.foe[isSpecial ? 'spd' : 'def'] || 0);

            // dano estimado por golpe: só dá pra calcular com o Pokémon ativo
            // resolvido e com os stats de defesa dele (ao vivo ou da Pokédex).
            // itemMult inclui o bônus do item que o seu Pokémon está segurando.
            const itemMult = activePokemon ? itemDamageMult(activePokemon, moveType, isSpecial, multiplier) : 1;
            // habilidades: atacante = seu ativo, defensor = adversário
            const ab = activePokemon
                ? abilityFactor(activePokemon, foe, moveType, isSpecial, ms.power, multiplier, stab > 1, hpFractionOf(activePokemon, monCurrentHp(state.youMon)), hpFractionOf(foe, foe.hp))
                : { immune: false, mult: 1, why: [] };
            if (ab.immune) {
                // o adversário anula esse golpe (ex.: Levitate vs Terra) → 0 e não é "melhor"
                dmgChip = `<span class="move-dmg dmg-normal" data-tip="${escapeHtml(ab.why.join(' '))}: golpe anulado → 0 de dano.">🛡️ 0</span>`;
                return { move, slug, dmgChip };
            }
            // golpes de dano fixo / OHKO (não usam a fórmula normal)
            const fx = activePokemon ? fixedDamage(slug, activePokemon, foe) : null;
            if (fx) {
                if (fx.ohko) {
                    score = (foeHp || 1e9); if (score > bestScore) { bestScore = score; bestSlug = slug; }
                    dmgChip = `<span class="move-dmg dmg-ko" data-tip="Nocaute direto: se acertar, derruba (falha se o alvo tiver nível maior).">💀 OHKO</span>`;
                } else if (fx.fixed != null) {
                    const d = fx.fixed; score = d; if (score > bestScore) { bestScore = score; bestSlug = slug; }
                    const koIt = foeHp > 0 && d >= foeHp;
                    dmgChip = `<span class="move-dmg ${koIt ? 'dmg-ko' : 'dmg-normal'}" data-tip="Dano fixo: ${d}${foeHp > 0 ? ` · HP dele: ${foeHp}` : ''}.">${koIt ? '💀 ' : ''}${d}</span>`;
                }
                return { move, slug, dmgChip };
            }
            const hits = moveHitCount(slug);
            const ctx = activePokemon ? contextFactor(activePokemon, moveType, isSpecial, 'foe') : 1;
            let dmg = activePokemon
                ? estimateDamage(activePokemon, { power: ms.power, category: ms.category }, foe, multiplier, stab, atkStage, defStage, itemMult * ab.mult * ctx)
                : null;
            if (dmg && hits > 1) dmg = { min: dmg.min * hits, max: dmg.max * hits };
            if (dmg) {
                // ordena pela estimativa de dano de verdade (já com stages)
                score = dmg.max;
                if (score > bestScore) { bestScore = score; bestSlug = slug; }
                const pct = foeHp > 0 ? Math.round(dmg.max / foeHp * 100) : null;
                let cls = 'dmg-normal', prefix = '';
                if (foeHp > 0 && dmg.min >= foeHp) { cls = 'dmg-ko'; prefix = '💀 '; }
                else if (foeHp > 0 && dmg.max >= foeHp) { cls = 'dmg-maybe'; prefix = '⚡ '; }
                const tipParts = [`Dano estimado: ${dmg.min}–${dmg.max}`];
                if (hits > 1) tipParts.push(`×${hits} golpes`);
                if (foeHp > 0) tipParts.push(`HP dele: ${foeHp}${pct != null ? ` (até ${pct}%)` : ''}`);
                if (atkStage || defStage) tipParts.push('inclui atributos alterados');
                if (ctx !== 1) tipParts.push('inclui clima/queimadura/telas');
                const itemFx = activePokemon ? itemDamageInfo(activePokemon, moveType, isSpecial, multiplier) : null;
                if (itemFx) tipParts.push(`inclui item (${itemFx.why}, ×${itemFx.mult})`);
                if (ab.why.length) tipParts.push(`inclui habilidade (${ab.why.join(', ')})`);
                if (cls === 'dmg-ko') tipParts.push('Mesmo no pior caso, deve nocautear.');
                else if (cls === 'dmg-maybe') tipParts.push('Pode nocautear, mas não é garantido.');
                dmgChip = `<span class="move-dmg ${cls}" data-tip="${tipParts.join(' · ')}">${prefix}${dmg.min}–${dmg.max}</span>`;
            } else {
                // sem dano estimável (sem Pokémon ativo ou sem defesa dele):
                // ordena por potência × eficácia e não mostra número
                score = ms.power * multiplier * stab;
                if (score > bestScore) { bestScore = score; bestSlug = slug; }
            }
        }
        return { move, slug, dmgChip };
    });
    const rows = scored.map(({ move, slug, dmgChip }) => {
        const isBest = bestSlug !== null && slug === bestSlug;
        return `<div class="row${isBest ? ' row-best' : ''}" data-tip-html="${tipAttr(moveBanner(slug))}">
            <span class="label">${isBest ? '<span class="best-star" data-tip="Melhor golpe disponível agora contra esse oponente.">★</span> ' : ''}${escapeHtml(move.name)}</span>
            <span class="value">${dmgChip}<span class="move-pp-mine">${move.pp} PP</span></span>
        </div>`;
    }).join('');
    return `<div class="section"><div class="section-head"><span class="px-label">SEUS GOLPES</span></div><div class="rows">${rows}</div></div>`;
}

const KNOWN_EVENT_TYPES = ['stat_change', 'capture_result', 'battle_end'];
const slugifyMoveName = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// alguns golpes vêm do jogo como palavra única (THUNDERPUNCH, DYNAMICPUNCH,
// SELFDESTRUCT) mas a base (PokeAPI) usa a forma com separador (thunder_punch,
// self_destruct). Este índice mapeia a forma "colada" (sem _) pra chave real,
// e resolveMoveSlug tenta o slug direto e, se falhar, a forma colada — assim
// esses golpes voltam a ter tipo/detalhes (e entram no dano/ranking).
const MOVE_SLUG_BY_JOINED = new Map(Object.keys(MOVE_TYPES).map((key) => [key.replace(/_/g, ''), key]));
function resolveMoveSlug(name) {
    const slug = slugifyMoveName(name);
    if (MOVE_TYPES[slug]) return slug;
    return MOVE_SLUG_BY_JOINED.get(slug.replace(/_/g, '')) || slug;
}

// não sabemos o nome exato do campo que carrega o golpe usado num evento de
// batalha (o jogo não documenta isso), então procuramos em qualquer campo de
// texto do evento por algo que bata com um golpe conhecido (data/move-types.js)
function findRevealedMoveSlug(event) {
    for (const key of ['move', 'moveSlug', 'slug', 'name', 'moveName']) {
        const slug = resolveMoveSlug(event[key]);
        if (MOVE_TYPES[slug]) return slug;
    }
    for (const value of Object.values(event)) {
        if (typeof value !== 'string') continue;
        const slug = resolveMoveSlug(value);
        if (MOVE_TYPES[slug]) return slug;
    }
    return null;
}

function applyEvents(events) {
    (events || []).forEach((event) => {
        if (event.t === 'stat_change' && state.stages[event.side]) {
            const current = Number(state.stages[event.side][event.stat] || 0);
            state.stages[event.side][event.stat] = Math.max(-6, Math.min(6, current + Number(event.delta || 0)));
        }
        if (event.t === 'capture_result' && event.caught === true) state.caught = true;
        if (event.t === 'battle_end' && event.outcome === 'caught') state.caught = true;

        // segue a mesma convenção já usada em stat_change (side: 'you'|'foe')
        // pra achar golpes que o oponente revelou usando em combate
        if (event.side === 'foe') {
            const slug = findRevealedMoveSlug(event);
            if (slug) {
                // conta toda vez que o golpe é usado (não só a primeira) pra
                // estimar o PP restante — diferente de recordDiscoveredMove,
                // que só grava a primeira vez (é uma lista, não um contador)
                state.foeMoveUses[slug] = (state.foeMoveUses[slug] || 0) + 1;
                recordDiscoveredMove(slug);
            }
        } else if (event.t && !KNOWN_EVENT_TYPES.includes(event.t)) {
            console.debug('[Infinity Dex Helper] evento de batalha não mapeado (ajuda a calibrar a detecção de golpes):', event);
        }
    });
}

function decrementUsedBall(request) {
    const action = request?.action;
    if (action?.type !== 'item' || !PokemonCatchRate.isBall(action.slug)) return;
    const slug = PokemonCatchRate.normalizeSlug(action.slug);
    const matchingKey = Object.keys(state.bag).find((key) => PokemonCatchRate.normalizeSlug(key) === slug) || slug;
    state.bag[matchingKey] = Math.max(0, Number(state.bag[matchingKey] || 0) - 1);
}

function updateBattle(data) {
    if (Array.isArray(data?.party)) { recordHeldItems(data.party); state.party = data.party; }
    if (data?.bag && typeof data.bag === 'object') state.bag = { ...data.bag };
    if (!data?.foe && !data?.state?.foe?.mon && !data?.battleId && !data?.__pokemonHelperRequest) return;

    const requestBattleId = data.__pokemonHelperRequest?.battleId;
    const incomingBattleId = data.battleId || requestBattleId;
    if (data.foe && (!state.foe || (incomingBattleId && incomingBattleId !== state.battleId))) resetBattle(incomingBattleId);
    if (incomingBattleId) state.battleId = incomingBattleId;
    if (data.kind) state.kind = data.kind;
    // id do treinador (pra lembrar golpes por treinador+espécie+nível sem vazar)
    if (data.trainer != null && state.trainerId == null) state.trainerId = trainerKeyOf(data.trainer);
    if (Array.isArray(data.foeParty)) state.foeParty = data.foeParty.map((pokemon) => ({ ...pokemon }));
    if (data.foe) state.foe = { ...data.foe };

    const battleState = data.state;
    if (battleState) {
        const foeActive = Number(battleState.foe?.active ?? state.active.foe ?? 0);
        const youActive = Number(battleState.you?.active ?? state.active.you ?? 0);
        if (state.active.foe !== null && foeActive !== state.active.foe) { state.stages.foe = {}; state.foeMoveUses = {}; }
        if (state.active.you !== null && youActive !== state.active.you) state.stages.you = {};
        state.active = { foe:foeActive, you:youActive };
        const activeMon = battleState.foe?.mon;
        if (activeMon) {
            const detailed = state.foeParty[foeActive] || {};
            const sameSpecies = normalizeSpecies(state.foe?.species) === normalizeSpecies(activeMon.species);
            state.foe = { ...(sameSpecies ? state.foe : {}), ...detailed, ...activeMon };
            state.foeParty[foeActive] = { ...detailed, ...state.foe };
        }
        // dados ao vivo do SEU Pokémon ativo (simétrico ao foe.mon). Serve de
        // fonte pro dano estimado quando o time (state.party) ainda não foi
        // sincronizado nesta sessão — sem isso o dano não aparece.
        const youMon = battleState.you?.mon;
        if (youMon && (youMon.stats || youMon.species || youMon.name)) state.youMon = { ...youMon };
        // marca o Pokémon em campo como desmaiado quando o HP ao vivo zera, pra
        // que a "Melhor jogada" pare de recomendá-lo (o snapshot do time não
        // reflete os desmaios ocorridos durante a própria luta).
        const youCur = monCurrentHp(youMon);
        if (youCur != null && youCur <= 0 && Number.isInteger(youActive)) state.faintedYou.add(youActive);
        state.turn = Number(battleState.turn || state.turn);
        state.over = battleState.over === true;
        if (battleState.outcome === 'caught') state.caught = true;

        // clima e telas (formato do payload é incerto — lemos de forma defensiva
        // em vários nomes de campo prováveis; se nada bater, ficam sem efeito).
        readWeather(battleState, data);
        readScreens(battleState);
    }

    const allowed = data.next?.allowed;
    if (allowed && !Array.isArray(allowed)) {
        if (Array.isArray(allowed.moves)) state.moves = allowed.moves;
        if (typeof allowed.canCatch === 'boolean') state.canCatch = allowed.canCatch;
    } else if (data.next && data.next.phase !== 'choose') {
        state.moves = [];
    }
    applyEvents(data.events);
    decrementUsedBall(data.__pokemonHelperRequest);
    // aprende com o encontro: se este selvagem está segurando um item, registra
    // espécie → item (só em batalha selvagem, não de treinador). Nunca pode
    // quebrar o fluxo de batalha, então vai protegido.
    try {
        if (state.kind !== 'trainer' && state.foe && state.foe.heldItem) {
            recordWildItem(state.foe.species || state.foe.name, state.foe.heldItem);
        }
    } catch (_) {}
}

// registra um item visto num Pokémon selvagem (persiste; a aba "Neste mapa" usa)
let wildItemsBySpecies = new Map();
function recordWildItem(species, item) {
    const sp = normalizeSpecies(species);
    const slug = String(item).trim().toLowerCase().replace(/[\s'’.]+/g, '_');
    if (!sp || !slug) return;
    const set = wildItemsBySpecies.get(sp) || new Set();
    if (set.has(slug)) return;   // já conhecido
    set.add(slug);
    wildItemsBySpecies.set(sp, set);
    saveWildItems();
}
async function saveWildItems() {
    try {
        const items = [...wildItemsBySpecies.entries()].map(([species, set]) => ({ species, items: [...set] }));
        await PokemonHelperStorage.setWildItems({ items });
    } catch (_) {}
}

const STAGE_LABELS = { hp:'HP',atk:'ATK',def:'DEF',spa:'SPA',spd:'SPD',spe:'SPE',accuracy:'Precisão',evasion:'Evasão' };
function renderStages() {
    const sections = [['you','SEUS ATRIBUTOS ALTERADOS'], ['foe','ATRIBUTOS ALTERADOS DO OPONENTE']];
    return sections.map(([side,title]) => {
        const values = Object.entries(state.stages[side]).filter(([,value]) => Number(value) !== 0);
        if (!values.length) return '';
        return `<div class="section"><div class="section-head"><span class="px-label">${title}</span></div><div class="rows">` +
            values.map(([key,value]) => row(STAGE_LABELS[key] || escapeHtml(key), `<span class="stage ${value > 0 ? 'up' : 'down'}">${value > 0 ? '+' : ''}${value}</span>`)).join('') +
            '</div></div>';
    }).join('');
}

function groupByValue(entries) {
    const groups = new Map();
    entries.forEach(({ combo, value }) => {
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(combo);
    });
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
}

const moveLabel = (slug) => slug.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

// o jogo não revela o moveset do oponente na batalha, então inferimos os golpes
// prováveis a partir do learnset por nível da Pokédex (data/move-types.js dá o
// tipo de cada golpe) — pegamos os golpes de nível <= nível atual e ficamos com
// os 4 aprendidos mais recentemente, como faria um Pokémon selvagem/treinador real.
function probableMoves(foe) {
    const entry = pokedexBySlug.get(normalizeSpecies(foe.species || foe.name));
    const level = Number(foe.level) || 0;
    const learned = (entry?.levelMoves || [])
        .filter((move) => move.lv <= level && MOVE_TYPES[move.slug])
        .sort((a, b) => a.lv - b.lv);
    const uniqueBySlug = new Map(learned.map((move) => [move.slug, move]));
    return [...uniqueBySlug.values()].slice(-4).map((move) => ({ slug: move.slug, type: MOVE_TYPES[move.slug] }));
}

function movesWithTypes(slugs) {
    return slugs.map((slug) => ({ slug, type: MOVE_TYPES[slug] })).filter((move) => move.type);
}

// moveset REAL do adversário a partir do payload — DESATIVADO por ora.
// O campo lido (foe.moves/moveset/…) NÃO foi confirmado como o moveset de
// batalha: pode ser a learnset/level-up da espécie, o que injetava golpes
// ERRADOS com selo "REAL". Só reativar depois de inspecionar um payload real
// de batalha de treinador e confirmar o nome/conteúdo do campo.
function foeActualMoves(foe) {
    return [];
}

// moveset real de um treinador da wiki (data/trainer-moves.js), casando por
// espécie+nível — bem mais confiável que a heurística de nível quando existe.
function trainerMovesFor(foe) {
    const key = `${normalizeSpecies(foe.species || foe.name)}|${Number(foe.level)}`;
    return trainerMovesByKey.get(key) || null;
}

// identifica um "oponente recorrente" por espécie+nível (o jogo não expõe
// id/nome de treinador nem um identificador de mapa confiável, então essa é a
// melhor aproximação disponível — pode confundir dois treinadores diferentes
// com o mesmo Pokémon no mesmo nível, mas é o que dá pra fazer sem esse dado).
// chave de memória: CONTEXTO + espécie + nível, e é auto-contida (não depende de
// nada externo pra ser reconstruída — dá pra salvar/carregar verbatim).
//   • treinador com id distintivo (state.trainerId = "t:<id>") → cada NPC fica
//     isolado, então o golpe de um treinador nunca aparece no de outro;
//   • qualquer outro encontro (selvagem/boss/estático) → namespace "w" por
//     espécie+nível. Boss é encontro fixo (moveset estável), então lembrar é
//     seguro; e como "w" e "t:<id>" são namespaces separados, nada vaza entre eles.
function discoveryKey(species, level) {
    const sp = normalizeSpecies(species);
    const lv = Number(level);
    if (!sp || !Number.isFinite(lv)) return null;
    const ctx = state.trainerId || 'w';
    return `${ctx}|${sp}|${lv}`;
}

function discoveredMovesFor(foe) {
    const key = discoveryKey(foe.species || foe.name, foe.level);
    return key ? (discoveredMovesByKey.get(key) || null) : null;
}

// golpe visto num turno: guarda vinculado a ESTE contexto+espécie+nível, então
// no próximo encontro igual (mesmo treinador, ou o mesmo boss/selvagem daquela
// espécie+nível) já mostra VISTO — sem contaminar o Pokémon de outros treinadores.
function recordDiscoveredMove(slug) {
    if (!state.foe || !MOVE_TYPES[slug]) return;
    const key = discoveryKey(state.foe.species || state.foe.name, state.foe.level);
    if (!key) { render(); return; }   // espécie/nível inválidos → não persiste
    const existing = discoveredMovesByKey.get(key) || [];
    if (existing.includes(slug)) return;
    discoveredMovesByKey.set(key, [...existing, slug]);
    saveDiscoveredMoves();
    render();
}

// resolve os golpes do oponente — SEM depender de NPC e SEM vazar entre lutas.
// O jogo NÃO envia o moveset do adversário no payload (confirmado), então:
// 1) golpes CONFIRMADOS nesta própria batalha (os que o Pokémon usou até agora) —
//    100% do Pokémon que está na sua frente, zerados a cada troca/luta;
// 2) heurística por nível da espécie (chute pros golpes ainda não vistos).
// Foram removidas as fontes que casavam por espécie+nível GLOBAL (histórico
// persistido e moveset de treinador da wiki) — eram elas que colocavam golpes de
// um NPC no Pokémon de outro. Dedupe por slug, máx. 4.
function resolveFoeMoves(foe) {
    const persisted = discoveredMovesFor(foe) || [];          // vistos deste treinador em lutas anteriores (só se houver id)
    const confirmed = Object.keys(state.foeMoveUses || {});   // vistos NESTA luta
    const merged = [];
    const seen = new Set();
    const push = (moves, source) => moves.forEach((move) => {
        if (merged.length >= 4 || seen.has(move.slug)) return;
        seen.add(move.slug);
        merged.push({ ...move, source });
    });
    push(movesWithTypes(persisted), 'discovered');
    push(movesWithTypes(confirmed), 'discovered');
    push(probableMoves(foe), 'heuristic');
    return { moves: merged, seenCount: merged.filter((move) => move.source === 'discovered').length };
}

const MOVE_SOURCE_LABELS = {
    discovered: 'Confirmado: usado por ESTE Pokémon nesta batalha.',
    heuristic: 'Estimado pelo nível da espécie — o jogo não revela o moveset até ser usado.'
};

// texto do ⓘ do cabeçalho GOLPES DELE: fonte única usa o rótulo existente;
// lista mista enumera só as fontes realmente presentes
function foeMovesHint(resolved) {
    const sources = new Set(resolved.moves.map((move) => move.source));
    if (sources.size <= 1) return MOVE_SOURCE_LABELS[resolved.moves[0]?.source] || '';
    const parts = [];
    if (sources.has('discovered')) parts.push(`${resolved.seenCount} confirmado(s) nesta batalha (selo VISTO)`);
    if (sources.has('heuristic')) parts.push('resto estimado pelo nível');
    return `${parts.join(' + ')}.`;
}

// avisa quando os golpes conhecidos do oponente estão perto de acabar o PP
// (ele seria forçado a usar Impasse/Struggle). Só entra na conta golpe com
// PP máximo conhecido (data/move-details.js) — golpes nunca usados sempre
// estão com PP cheio, então isso só dispara quando o uso real foi detectado.
function foeStrugglingSoon(resolved) {
    const known = resolved.moves.filter((move) => MOVE_DETAILS[move.slug]?.pp != null);
    if (!known.length) return null;
    const totalRemaining = known.reduce((sum, move) => {
        const details = MOVE_DETAILS[move.slug];
        const used = state.foeMoveUses[move.slug] || 0;
        return sum + Math.max(0, details.pp - used);
    }, 0);
    if (totalRemaining === 0) return 'out';
    if (totalRemaining <= 3) return 'low';
    return null;
}

const MOVE_CATEGORY_LABELS = { physical: 'Físico', special: 'Especial', status: 'Status' };

// tooltip nativo (title) com poder/precisão/PP/categoria/efeito — dados vêm
// de data/move-details.js (PokeAPI); texto de efeito fica em inglês porque
// não há tradução oficial disponível.
function moveTooltip(slug) {
    const details = MOVE_DETAILS[slug];
    if (!details) return moveLabel(slug);
    const category = MOVE_CATEGORY_LABELS[details.category] || details.category || '?';
    const power = details.power ?? '—';
    const accuracy = details.accuracy != null ? `${details.accuracy}%` : '—';
    const pp = details.pp ?? '—';
    const lines = [moveLabel(slug), `Categoria: ${category}`, `Poder: ${power} · Precisão: ${accuracy} · PP: ${pp}`];
    if (details.effect) lines.push(details.effect);
    return lines.join('\n');
}

// banner rico (data-tip-html) no estilo da wiki do jogo: nome + selo de tipo +
// categoria + poder/precisão/PP + efeito. Prioriza os dados EM PORTUGUÊS do
// jogo (wiki-meta) e cai pro MOVE_DETAILS (inglês da PokeAPI) se faltar.
function moveBanner(slug) {
    const w = MOVE_WIKI && MOVE_WIKI[slug];
    const details = MOVE_DETAILS[slug] || {};
    // tipo: wiki manda "Grass" (capitalizado) → minúsculo pra cor/label
    const typeName = (w && w.type ? String(w.type).toLowerCase() : MOVE_TYPES[slug]) || null;
    const bg = typeName ? PokemonPixelIcons.typeColor(typeName) : '#777';
    const fg = PokemonPixelIcons.onColor(bg);
    const typeLabel = (typeName && typeof LABELS !== 'undefined' && LABELS[typeName]) || typeName || '—';
    const catKey = (w && w.cat) || details.category;
    const category = MOVE_CATEGORY_LABELS[catKey] || catKey || '—';
    const name = (w && w.name) || moveLabel(slug);
    const powRaw = w ? w.pow : details.power;
    const power = (powRaw == null || powRaw === 0) ? '—' : powRaw;
    const accRaw = w ? w.acc : details.accuracy;
    const accuracy = (accRaw == null || accRaw === 0) ? '—' : `${accRaw}%`;
    const pp = (w ? w.pp : details.pp) ?? '—';
    const effTxt = (w && w.desc) || details.effect || '';
    const badge = typeName ? `<span class="mv-badge" style="background:${bg};color:${fg}">${escapeHtml(typeLabel)}</span>` : '';
    const eff = effTxt ? `<div class="mv-tip-eff">${escapeHtml(effTxt)}</div>` : '';
    return `<div class="mv-tip-head"><span class="mv-tip-name">${escapeHtml(name)}</span>${badge}<span class="mv-cat">${escapeHtml(category)}</span></div>` +
        `<div class="mv-tip-stats">Pot <b>${power}</b> · Prec <b>${accuracy}</b> · PP <b>${pp}</b></div>` + eff;
}
// escapa HTML pra caber num atributo entre aspas duplas (só & e " precisam)
const tipAttr = (html) => String(html).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// tipos que causam dano extra no oponente (resistências/imunidades ficam de fora)
function renderWeaknesses(foe) {
    const foeTypes = typeNames(foe.types);
    if (!foeTypes.length) return '';
    const weak = TYPES
        .map((type) => ({ type, value: defMultiplier(type, foeTypes) }))
        .filter((entry) => entry.value > 1)
        .sort((a, b) => b.value - a.value);
    if (!weak.length) return '';
    const chips = weak.map(({ type, value }) =>
        typeTagHTML(type, { title: `${LABELS[type]} causa ${multLabel(value)} de dano nele.` })).join('');
    return `<div class="section">
        <div class="section-head"><span class="px-label">FRAQUEZAS DELE</span>${PokemonHelperTooltip.iconHTML('Tipos que causam dano extra nele. Resistências e imunidades ficam de fora.')}</div>
        <div class="chip-row">${chips}</div>
    </div>`;
}

// pior caso contra o meu time: maior multiplicador desse golpe contra
// qualquer Pokémon do meu time
function moveWorstCase(moveType) {
    const values = state.party.filter(Boolean).map((pokemon) => defMultiplier(moveType, typeNames(pokemon.types)));
    return values.length ? Math.max(...values) : null;
}

function renderFoeMoves(foe) {
    const resolved = resolveFoeMoves(foe);
    if (!resolved.moves.length) return '';
    const sourceHint = foeMovesHint(resolved);
    const myActive = resolveActivePokemon();      // quem leva o dano (seu Pokémon em campo)
    const myLiveHp = monCurrentHp(state.youMon);  // HP ao vivo do seu ativo, se houver
    const items = resolved.moves.map((move) => {
        const isStatus = STATUS_MOVES.has(move.slug);
        const worst = isStatus ? null : moveWorstCase(move.type);
        const multChip = worst === null
            ? '<span class="move-mult mult-1">—</span>'
            : `<span class="move-mult ${multClass(worst)}" data-tip="Pior caso contra o seu time.">${multLabel(worst)}</span>`;

        // dano estimado que ESTE golpe dele causa no SEU Pokémon ativo (o inverso
        // do "SEUS GOLPES"): o adversário ataca, você defende. Vermelho = nocauteia
        // no melhor caso; amarelo = pode nocautear dependendo da variação.
        let dmgChip = '';
        if (!isStatus && myActive) {
            const ms = moveStats(move.slug, move);
            if (ms.power > 0) {
                const isSpecial = ms.category === 'special';
                const multiplier = defMultiplier(move.type, typeNames(myActive.types));
                const isStabFoe = typeNames(foe.types).includes(move.type);
                // habilidades: atacante = adversário, defensor = seu Pokémon ativo
                const ab = abilityFactor(foe, myActive, move.type, isSpecial, ms.power, multiplier, isStabFoe, hpFractionOf(foe, foe.hp), hpFractionOf(myActive, myLiveHp));
                // item DEFENSIVO do seu Pokémon (Eviolite/Assault Vest/berry/Air Balloon)
                const itemDef = defenseItemFactor(myActive, move.type, isSpecial, multiplier);
                const whyAll = [...ab.why, ...itemDef.why];
                const refHp0 = (typeof myLiveHp === 'number' && myLiveHp > 0) ? myLiveHp : (Number(myActive.stats?.hp) || 0);
                const fx = fixedDamage(move.slug, foe, myActive);
                if (ab.immune || itemDef.immune) {
                    dmgChip = `<span class="move-dmg dmg-normal" data-tip="${escapeHtml(whyAll.join(' '))}: golpe anulado → 0 de dano.">🛡️ 0</span>`;
                } else if (fx && fx.ohko) {
                    dmgChip = `<span class="move-dmg dmg-ko" data-tip="Nocaute direto: se acertar, seu Pokémon cai (falha se você tiver nível maior).">💀 OHKO</span>`;
                } else if (fx && fx.fixed != null) {
                    const d = fx.fixed, koYou = refHp0 > 0 && d >= refHp0;
                    dmgChip = `<span class="move-dmg ${koYou ? 'dmg-ko' : 'dmg-normal'}" data-tip="Dano fixo: ${d}${refHp0 > 0 ? ` · seu HP: ${refHp0}` : ''}.">${koYou ? '💀 ' : ''}${d}</span>`;
                } else {
                    const stab = isStabFoe ? 1.5 : 1;
                    const atkStage = Number(state.stages.foe[isSpecial ? 'spa' : 'atk'] || 0);
                    const defStage = Number(state.stages.you[isSpecial ? 'spd' : 'def'] || 0);
                    const hits = moveHitCount(move.slug);
                    const ctx = contextFactor(foe, move.type, isSpecial, 'you');   // clima/queimadura/telas (você defende)
                    // atacante = adversário (foe): item ofensivo dele é desconhecido, então
                    // entram só ab.mult (habilidades), itemDef.mult (seu item) e ctx.
                    let dmg = estimateDamage(foe, { power: ms.power, category: ms.category }, myActive, multiplier, stab, atkStage, defStage, ab.mult * itemDef.mult * ctx);
                    if (dmg && hits > 1) dmg = { min: dmg.min * hits, max: dmg.max * hits };
                    if (dmg) {
                        const refHp = refHp0;
                        let cls = 'dmg-normal', prefix = '';
                        if (refHp > 0 && dmg.min >= refHp) { cls = 'dmg-ko'; prefix = '💀 '; }
                        else if (refHp > 0 && dmg.max >= refHp) { cls = 'dmg-maybe'; prefix = '⚠️ '; }
                        const pct = refHp > 0 ? Math.round(dmg.max / refHp * 100) : null;
                        const tip = [`Dano que VOCÊ recebe: ${dmg.min}–${dmg.max}`];
                        if (hits > 1) tip.push(`×${hits} golpes`);
                        if (refHp > 0) tip.push(`seu HP: ${refHp}${pct != null ? ` (até ${pct}%)` : ''}`);
                        if (atkStage || defStage) tip.push('inclui atributos alterados');
                        if (whyAll.length) tip.push(`inclui ${whyAll.join(', ')}`);
                        if (ctx !== 1) tip.push('inclui clima/queimadura/telas');
                        if (cls === 'dmg-ko') tip.push('Te nocauteia mesmo no melhor caso.');
                        else if (cls === 'dmg-maybe') tip.push('Pode te nocautear dependendo da variação aleatória.');
                        dmgChip = `<span class="move-dmg ${cls}" data-tip="${escapeHtml(tip.join(' · '))}">${prefix}${dmg.min}–${dmg.max}</span>`;
                    }
                }
            }
        }
        const details = MOVE_DETAILS[move.slug];
        // PP restante é uma estimativa: só contamos usos vistos NESTA troca do
        // oponente (foeMoveUses zera ao trocar de Pokémon) a partir do PP máximo
        // da wiki — se o golpe nunca foi visto sendo usado, mostra o PP cheio.
        const used = state.foeMoveUses[move.slug] || 0;
        const ppLabel = details?.pp == null
            ? '—'
            : used > 0
                ? `${Math.max(0, details.pp - used)}/${details.pp} PP`
                : `${details.pp} PP`;
        const ppEmpty = details?.pp != null && used >= details.pp;
        return `<div class="row foe-row" data-tip-html="${tipAttr(moveBanner(move.slug))}">
                <span class="label">${escapeHtml(moveLabel(move.slug))}${move.source === 'discovered' ? '<span class="move-seen" data-tip="Confirmado: este Pokémon usou este golpe nesta batalha.">VISTO</span>' : ''}</span>
                <span class="value">${dmgChip}${multChip}<span class="move-pp-mine${ppEmpty ? ' pp-empty' : ''}">${ppLabel}</span></span>
            </div>`;
    }).join('');
    const struggleStatus = foeStrugglingSoon(resolved);
    const ppWarning = struggleStatus === 'out'
        ? `<div class="pp-warning pp-warning-out" data-tip="Todos os golpes conhecidos dele estão sem PP — ele deve usar Impasse (Struggle) e se ferir a cada turno.">🚨 SEM PP — VAI USAR IMPASSE</div>`
        : struggleStatus === 'low'
            ? `<div class="pp-warning pp-warning-low" data-tip="Restam poucos PP entre os golpes conhecidos dele — pode ficar sem PP em breve.">⚠️ QUASE SEM PP</div>`
            : '';
    return `<div class="section">
        <div class="section-head"><span class="px-label">GOLPES DELE</span>${PokemonHelperTooltip.iconHTML(sourceHint)}</div>
        ${ppWarning}
        <div class="rows">${items}</div>
    </div>`;
}

// ---- MELHOR ESCOLHA (counter) --------------------------------------------
// Cruza os golpes do adversário (os JÁ VISTOS nesta/anteriores lutas + a
// heurística por nível) com TODO o seu roster (time + caixas do PC) e indica
// quem melhor encara este Pokémon: quanto VOCÊ causa nele × quanto ELE causa em
// você × quem é mais rápido. Quanto mais golpes dele forem confirmados, mais
// confiável fica a parte defensiva.

// HP máximo do defensor (stat ao vivo do payload; fallback pela fórmula de HP)
function maxHpOf(mon) {
    const live = Number(mon && mon.stats ? mon.stats.hp : NaN);
    if (Number.isFinite(live) && live > 0) return live;
    const entry = pokedexBySlug.get(normalizeSpecies(mon && (mon.species || mon.name)));
    const base = Number(entry && entry.base ? entry.base.hp : NaN);
    if (!Number.isFinite(base) || base <= 0) return null;
    const ivRaw = Number(mon && mon.ivs ? mon.ivs.hp : NaN);
    const iv = Number.isFinite(ivRaw) ? Math.max(0, Math.min(31, ivRaw)) : 15;
    const level = Number(mon && mon.level) || 1;
    return Math.floor((2 * base + iv) * level / 100) + level + 10;
}

// melhor golpe de `attacker` contra `foe`: maior dano (e % do HP do foe)
function bestOffenseOn(attacker, foe) {
    const defenders = typeNames(foe.types);
    const foeHp = maxHpOf(foe) || Number(foe.maxHp) || Number(foe.hp) || 0;
    let best = null;
    (attacker.moves || []).forEach((move) => {
        const slug = resolveMoveSlug(move.name);
        const ms = moveStats(slug, move);
        if (ms.power <= 0) return;
        const moveType = TYPE_MAPPER[move.type] || MOVE_TYPES[slug];
        if (!moveType) return;
        const isSpecial = ms.category === 'special';
        const mult = liveMultiplier(move.type, foe.types) ?? defMultiplier(moveType, defenders);
        const isStab = typeNames(attacker.types).includes(moveType);
        const ab = abilityFactor(attacker, foe, moveType, isSpecial, ms.power, mult, isStab, hpFractionOf(attacker), hpFractionOf(foe, foe.hp));
        if (ab.immune) return;
        const itemMult = itemDamageMult(attacker, moveType, isSpecial, mult);
        const ctx = moveHitCount(slug) * contextFactor(attacker, moveType, isSpecial, 'foe');
        const dmg = estimateDamage(attacker, { power: ms.power, category: ms.category }, foe, mult, isStab ? 1.5 : 1, 0, 0, itemMult * (ab.mult || 1) * ctx);
        if (!dmg) return;
        if (!best || dmg.max > best.dmg.max) {
            best = { slug, moveName: move.name, moveType, mult, dmg, pct: foeHp > 0 ? Math.min(100, Math.round(dmg.max / foeHp * 100)) : null, ko: foeHp > 0 && dmg.min >= foeHp };
        }
    });
    return best;
}

// pior ameaça: maior dano que os golpes CONHECIDOS do foe causam em `defender`
function worstThreatOn(defender, foe, resolved) {
    const defHp = maxHpOf(defender) || 0;
    let worst = null;
    resolved.moves.forEach((move) => {
        if (STATUS_MOVES.has(move.slug)) return;
        const ms = moveStats(move.slug, move);
        if (ms.power <= 0) return;
        const isSpecial = ms.category === 'special';
        const mult = defMultiplier(move.type, typeNames(defender.types));
        const isStabFoe = typeNames(foe.types).includes(move.type);
        const ab = abilityFactor(foe, defender, move.type, isSpecial, ms.power, mult, isStabFoe, hpFractionOf(foe, foe.hp), hpFractionOf(defender));
        const itemDef = defenseItemFactor(defender, move.type, isSpecial, mult);
        if (ab.immune || itemDef.immune) return;
        const fx = fixedDamage(move.slug, foe, defender);
        let dmg;
        if (fx && fx.ohko) dmg = { min: defHp, max: defHp };
        else if (fx && fx.fixed != null) dmg = { min: fx.fixed, max: fx.fixed };
        else {
            const hits = moveHitCount(move.slug);
            const ctx = contextFactor(foe, move.type, isSpecial, 'you');
            dmg = estimateDamage(foe, { power: ms.power, category: ms.category }, defender, mult, isStabFoe ? 1.5 : 1, 0, 0, ab.mult * itemDef.mult * ctx);
            if (dmg && hits > 1) dmg = { min: dmg.min * hits, max: dmg.max * hits };
        }
        if (!dmg) return;
        if (!worst || dmg.max > worst.dmg.max) {
            worst = { slug: move.slug, moveType: move.type, dmg, pct: defHp > 0 ? Math.min(100, Math.round(dmg.max / defHp * 100)) : null, ko: defHp > 0 && dmg.min >= defHp, seen: move.source === 'discovered' };
        }
    });
    return worst;
}

function rankCounters(foe) {
    const resolved = resolveFoeMoves(foe);
    const foeSpe = effectiveStat(foe, 'spe');
    const seen = new Set();
    const scored = [];
    rosterMons.forEach((entry) => {
        const mon = entry.mon;
        // time desmaiado não pode entrar; pula quem está com HP 0 no snapshot
        const cur = Number(mon.hp);
        if (entry.inParty && Number.isFinite(cur) && cur <= 0) return;
        // dedupe (o mesmo Pokémon pode aparecer em time e caixa em snapshots antigos)
        const id = `${normalizeSpecies(mon.species || mon.name)}|${mon.level}|${mon.ivs ? Object.values(mon.ivs).join('') : ''}|${entry.inParty ? 'p' : 'b'}`;
        if (seen.has(id)) return;
        seen.add(id);
        const off = bestOffenseOn(mon, foe);
        const threat = worstThreatOn(mon, foe, resolved);
        const mySpe = effectiveStat(mon, 'spe');
        const faster = mySpe != null && foeSpe != null ? mySpe > foeSpe : null;
        let score = (off?.pct ?? 0) - (threat?.pct ?? 0);
        if (faster === true) score += 20; else if (faster === false) score -= 10;
        if (off?.ko && faster === true) score += 40;
        if (threat?.ko) score -= 40;
        scored.push({ entry, off, threat, faster, score });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
}

function counterRowHTML(pick, tag) {
    const { entry, off, threat, faster } = pick;
    const name = escapeHtml(entry.mon.name || entry.mon.species);
    const place = entry.inParty ? '' : ` <span class="ctr-box" data-tip="Está numa caixa do PC — traga-o antes de usar.">🗄 ${escapeHtml(entry.label)}</span>`;
    const offType = off ? PokemonPixelIcons.typeColor(off.moveType) : null;
    const offHTML = off
        ? `<span class="ctr-off ${off.ko ? 'ko' : ''}" data-tip="Seu melhor golpe: ${escapeHtml(off.moveName)} — dano ${off.dmg.min}–${off.dmg.max}${off.pct != null ? ` (${off.pct}% do HP dele)` : ''}${off.ko ? ' · nocauteia' : ''}."><span class="type-tag" style="background:${offType};color:${PokemonPixelIcons.onColor(offType)}">${escapeHtml(off.moveName)}</span>${off.pct != null ? ` ${off.pct}%` : ''}${off.ko ? ' 💀' : ''}</span>`
        : '<span class="ctr-off" data-tip="Sem golpe de dano conhecido contra ele.">—</span>';
    const threatHTML = threat
        ? `<span class="ctr-threat ${threat.ko ? 'ko' : ''}" data-tip="Maior ameaça dele: ${moveLabel(threat.slug)} — ${threat.dmg.min}–${threat.dmg.max}${threat.pct != null ? ` (${threat.pct}% do seu HP)` : ''}${threat.seen ? ' · CONFIRMADO (VISTO)' : ' · estimado'}${threat.ko ? ' · te nocauteia' : ''}.">${threat.pct != null ? `${threat.pct}%` : moveLabel(threat.slug)}${threat.ko ? ' 💀' : ''}${threat.seen ? ' <span class="move-seen">VISTO</span>' : ''}</span>`
        : '<span class="ctr-threat" data-tip="Nenhum golpe de dano conhecido dele.">seguro</span>';
    const spd = faster === true
        ? '<span class="ctr-spd fast" data-tip="Você é mais rápido — age primeiro.">⚡ + rápido</span>'
        : faster === false
            ? '<span class="ctr-spd slow" data-tip="Ele é mais rápido — age primeiro.">🐢 + lento</span>'
            : '';
    return `<div class="ctr-pick">
        <div class="ctr-line1">${tag ? `<span class="ctr-tag">${tag}</span> ` : ''}<span class="ctr-name">${name}</span>${place} ${spd}</div>
        <div class="ctr-line2"><span class="ctr-lbl" data-tip="Quanto você causa nele.">ATK</span> ${offHTML} <span class="ctr-lbl" data-tip="Quanto ele causa em você (usando os golpes conhecidos).">DEF</span> ${threatHTML}</div>
    </div>`;
}

function renderCounter(foe) {
    if (state.caught) return '';
    const head = `<div class="section-head"><span class="px-label">MELHOR ESCOLHA</span>${PokemonHelperTooltip.iconHTML('Melhor Pokémon SEU contra este oponente, cruzando o dano que você causa com os golpes conhecidos DELE (quanto mais golpes vistos, mais precisa a defesa). Mostra o melhor do time e, se houver um melhor no PC, também.')}</div>`;
    if (!rosterMons.length) {
        return `<div class="section">${head}<p class="ctr-empty" data-tip="Abra seu time/caixas no jogo uma vez pra a extensão registrar seus Pokémon.">Abra seus Pokémon no jogo pra habilitar a recomendação.</p></div>`;
    }
    const ranked = rankCounters(foe);
    if (!ranked.length) return '';
    const bestParty = ranked.find((r) => r.entry.inParty) || null;
    const bestOverall = ranked[0];
    const rows = [];
    if (bestParty) rows.push(counterRowHTML(bestParty, '★ TIME'));
    // só mostra o "geral" quando é do PC e diferente do melhor do time
    if (bestOverall && !bestOverall.entry.inParty && bestOverall !== bestParty) {
        rows.push(counterRowHTML(bestOverall, '🏆 GERAL'));
    }
    if (!rows.length && bestOverall) rows.push(counterRowHTML(bestOverall, ''));
    return `<div class="section">${head}<div class="ctr-list">${rows.join('')}</div></div>`;
}

function renderEffRows(moveType) {
    const entries = TYPES.map((type) => ({ combo: [type], value: defMultiplier(moveType, [type]) }));
    const groups = groupByValue(entries).filter(([value]) => value !== 1);
    if (!groups.length) return '<div class="status-note">Sem interação especial.</div>';
    return groups.map(([value, combos]) =>
        `<div class="eff-row"><span class="eff-mult ${multClass(value)}">${multLabel(value)}</span>` +
        `<span class="eff-types">${combos.map((combo) => typeTagHTML(combo, { stack: true })).join('')}</span></div>`
    ).join('');
}

function renderBalls(foe) {
    if (!state.canCatch || state.kind === 'trainer') return '';
    const pokedex = pokedexBySlug.get(normalizeSpecies(foe.species || foe.name));
    const catchRate = Number(pokedex?.catchRate);
    const context = { types:typeNames(foe.types), level:foe.level, turn:state.turn };
    const balls = Object.entries(state.bag).map(([slug,quantity]) => ({ slug:PokemonCatchRate.normalizeSlug(slug), quantity:Number(quantity || 0) })).filter((item) => PokemonCatchRate.isBall(item.slug) && item.quantity > 0);
    if (!balls.length) return '';
    return `<div class="section"><div class="section-head"><span class="px-label">POKÉBOLAS</span>${PokemonHelperTooltip.iconHTML('Chance de captura pela fórmula clássica de Gen III/IV — a MESMA que o InfinityMMO usa (confirmado pelo desenvolvedor). Só a Master Ball é 100% garantido; mesmo com HP baixo sobra uma pequena chance de escapar. Pode variar um pouco se o catchRate da espécie no servidor diferir da wiki.')}</span></div><div class="rows">` +
        balls.map((ball) => {
            const definition = PokemonCatchRate.BALLS[ball.slug];
            const chance = PokemonCatchRate.chance({ hp:foe.hp, maxHp:foe.maxHp, catchRate, status:foe.status, ballMultiplier:PokemonCatchRate.multiplier(ball.slug, context) });
            return row(`${definition.name} ×${ball.quantity}`, `<span class="ball-rate">${chance === null ? '—' : `${chance.toFixed(1)}%`}</span>`);
        }).join('') +
        '</div></div>';
}

// sprite do oponente: mesma arte (PokeAPI dream-world) usada em Meus Pokémon;
// POKEMON_NAME_TO_ID casa por nome de exibição, então tentamos name e species
// (inclusive com _/- viram espaço) antes de cair no placeholder
const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/dream-world/';
function foeSpriteId(foe) {
    if (typeof POKEMON_NAME_TO_ID === 'undefined') return null;
    for (const value of [foe.name, foe.species]) {
        if (!value) continue;
        const key = String(value).trim().toLowerCase();
        const id = POKEMON_NAME_TO_ID[key] || POKEMON_NAME_TO_ID[key.replace(/[_-]+/g, ' ')];
        if (id) return id;
    }
    return null;
}

function render() {
    const content = document.getElementById('content'), foe = state.foe;
    if (!foe) { content.innerHTML = '<p class="empty">Nenhum encontro capturado ainda. Entre em uma batalha selvagem.</p>'; return; }
    const stats = foe.stats || {}, ivs = foe.ivs || {}, evaluation = PokemonIvEvaluation.evaluate(foe);
    const foeTypes = typeNames(foe.types);
    const hpPct = foe.maxHp > 0 ? Math.max(0, Math.min(100, foe.hp / foe.maxHp * 100)) : 0;
    const hpLevel = hpPct <= 20 ? 'low' : hpPct <= 50 ? 'mid' : 'high';
    const genderValue = String(foe.gender || '').toLowerCase();
    const gender = ['female', 'f', '♀'].includes(genderValue)
        ? '<span class="enc-gender-f">♀</span>'
        : ['male', 'm', '♂'].includes(genderValue)
            ? '<span class="enc-gender-m">♂</span>'
            : '';

    const spriteId = foeSpriteId(foe);
    const sprite = spriteId
        ? `<img class="enc-sprite" src="${SPRITE_URL}${spriteId}.svg" alt="${escapeHtml(foe.name || foe.species)}">`
        : '<div class="enc-sprite">?</div>';
    const head = `<div class="enc-head">
        ${sprite}
        <div class="enc-id">
            <div class="enc-name-row">
                <span class="enc-name">${escapeHtml(foe.name || foe.species)}</span>
                <span class="enc-level">Lv${foe.level ?? '-'}</span>${gender}
                ${foe.shiny ? '<span class="best-badge badge-stab" data-tip="Shiny!">★</span>' : ''}
            </div>
            <div class="enc-types">${foeTypes.map((type) => typeTagHTML(type)).join('')}</div>
            <div class="enc-hp">
                <div class="enc-hp-track"><div class="enc-hp-fill" data-level="${hpLevel}" style="width:${hpPct}%"></div></div>
                <span class="enc-hp-label">${Number(foe.hp || 0)}/${Number(foe.maxHp || 0)}</span>
            </div>
        </div>
    </div>`;

    const metaCell = (key, value, tip, color) =>
        `<div class="meta-cell" data-tip="${escapeHtml(tip)}"><span class="meta-key">${key}</span><span class="meta-val"${color ? ` style="color:${color}"` : ''}>${value}</span></div>`;
    const meta = `<div class="meta-grid">
        ${metaCell('HABILIDADE', `<span data-ability="${escapeHtml(foe.ability)}">${escapeHtml(PokemonAbilityInfo.label(foe.ability))}</span>`, 'Habilidade do oponente.')}
        ${metaCell('NATUREZA', natureEffectHTML(foe.nature), 'Natureza e atributos afetados.')}
        ${(() => {
            try {
                const it = itemInfo(foe.heldItem);
                const val = it
                    ? `<img class="meta-item-img" src="${itemSprite(it.slug)}" onerror="this.replaceWith(document.createTextNode('🎁'))"> ${escapeHtml(it.name)}`
                    : '—';
                const tip = it ? (it.desc ? `Item que este selvagem está segurando: ${it.name}. ${it.desc}` : `Item que este selvagem está segurando: ${it.name}.`) : 'Este selvagem não está segurando item.';
                return metaCell('ITEM', val, tip, it ? 'var(--px-good, #2e8b2e)' : 'var(--px-text-dim)');
            } catch (_) { return metaCell('ITEM', '—', 'Item.', 'var(--px-text-dim)'); }
        })()}
        ${metaCell('ATQ PRINCIPAL', evaluation.role, 'Estimado pelo maior stat ofensivo.')}
        ${metaCell('AVALIAÇÃO', PokemonIvEvaluation.html(foe), 'Avaliação combinando IVs, natureza e stats base.')}
        ${metaCell('IVS TOTAL', `${evaluation.percent}%`, 'Percentual dos IVs em relação ao máximo.', ivColor(evaluation.percent * 31 / 100))}
    </div>`;

    const ivsSection = `<div class="section">
        <div class="section-head"><span class="px-label">IVS / STATS</span><span class="head-extra" style="color:${ivColor(evaluation.percent * 31 / 100)}">${evaluation.percent}%</span></div>
        <div class="ivs-grid6">${STAT_KEYS.filter((key) => ivs[key] !== undefined).map((key) => `
            <div class="iv-cell" data-tip="${key.toUpperCase()} — IV ${ivs[key]}/31${stats[key] !== undefined ? ` · stat atual ${stats[key]}` : ''}">
                <span class="iv-key">${key.toUpperCase()}</span>
                <span class="px-bar"><span class="px-bar-fill" style="width:${Math.round(ivs[key] / 31 * 100)}%;background:${ivColor(ivs[key])}"></span></span>
                <span class="iv-num" style="color:${ivColor(ivs[key])}">${ivs[key]}</span>
                ${stats[key] !== undefined ? `<span class="iv-stat">${stats[key]}</span>` : ''}
            </div>`).join('')}</div>
    </div>`;

    // cada seção reordenável mapeia sua chave pra função que devolve o HTML
    // (respeitando os toggles de visibilidade). A ordem vem de SCREEN_PREFS.order,
    // editável em Configurações → BATALHA; cabeçalho + meta ficam sempre no topo.
    const sectionHtml = {
        ivs:        () => (SCREEN_PREFS.showIvs ? ivsSection : ''),
        best:       () => (!state.caught ? bestPlay(foe) : ''),
        counter:    () => (SCREEN_PREFS.showCounter !== false && !state.caught ? renderCounter(foe) : ''),
        weaknesses: () => (SCREEN_PREFS.showWeaknesses ? renderWeaknesses(foe) : ''),
        foeMoves:   () => (SCREEN_PREFS.showFoeMoves ? renderFoeMoves(foe) : ''),
        pokeballs:  () => (SCREEN_PREFS.showPokeballs ? renderBalls(foe) : ''),
        stages:     () => (SCREEN_PREFS.showStatChanges ? renderStages() : ''),
        myMoves:    () => (!state.caught && SCREEN_PREFS.showMyMoves && state.moves.length ? renderMyMoves(foe) : '')
    };
    const order = PokemonHelperStorage.sanitizeBattleOrder(SCREEN_PREFS.order);
    let html = `<div class="enc-screen">` + head + meta;
    order.forEach((key) => { html += sectionHtml[key] ? sectionHtml[key]() : ''; });
    if (state.caught) html += '<div class="gotcha"><span class="gotcha-badge">GOTCHA</span><p>Pokémon capturado</p></div>';
    html += `</div>`;
    content.innerHTML = html;
    // sprite pode não existir no repositório (formas regionais etc.) — volta
    // pro placeholder em vez de mostrar o ícone de imagem quebrada
    content.querySelectorAll('img.enc-sprite').forEach((img) => img.addEventListener('error', () => {
        const fallback = document.createElement('div');
        fallback.className = 'enc-sprite';
        fallback.textContent = '?';
        img.replaceWith(fallback);
    }));
    PokemonAbilityInfo.hydrate(content);
}

async function loadPokedex() {
    try {
        const cached = await PokemonHelperStorage.getPokedex();
        pokedexBySlug = new Map((cached.items || []).map((pokemon) => [normalizeSpecies(pokemon.slug || pokemon.name), pokemon]));
        render();
        chrome.runtime.sendMessage({ type:'pkmn-helper-refresh-pokedex' });
    } catch (error) {
        console.warn('[Infinity Dex Helper] Não foi possível carregar a Pokédex:', error);
    }
}

async function loadTrainerMoves() {
    try {
        const cached = await PokemonHelperStorage.getTrainerMoves();
        trainerMovesByKey = new Map((cached.items || []).map((item) => [`${normalizeSpecies(item.species)}|${item.level}`, item.moves]));
        render();
        chrome.runtime.sendMessage({ type:'pkmn-helper-refresh-trainer-moves' });
    } catch (error) {
        console.warn('[Infinity Dex Helper] Não foi possível carregar golpes de treinadores:', error);
    }
}

async function loadDiscoveredMoves() {
    try {
        const cached = await PokemonHelperStorage.getDiscoveredMoves();
        // a chave é salva verbatim (auto-contida) — não reconstruímos com
        // discoveryKey() aqui, senão dependeríamos do state.trainerId (que no
        // load ainda é null) e todas as entradas colidiriam na mesma chave.
        discoveredMovesByKey = new Map(
            (cached.items || [])
                .filter((item) => item && item.key && Array.isArray(item.moves))
                .map((item) => [item.key, item.moves])
        );
        render();
    } catch (error) {
        console.warn('[Infinity Dex Helper] Não foi possível carregar golpes descobertos:', error);
    }
}

async function loadWildItems() {
    try {
        const cached = await PokemonHelperStorage.getWildItems();
        wildItemsBySpecies = new Map((cached.items || []).map((it) => [normalizeSpecies(it.species), new Set(it.items || [])]));
    } catch (_) {}
}

async function saveDiscoveredMoves() {
    try {
        // salva a chave inteira (auto-contida); assim o load reconstrói o Map
        // sem depender de contexto de batalha algum.
        const items = [...discoveredMovesByKey.entries()].map(([key, moves]) => ({ key, moves }));
        await PokemonHelperStorage.setDiscoveredMoves({ items });
    } catch (error) {
        console.warn('[Infinity Dex Helper] Não foi possível salvar golpes descobertos:', error);
    }
}

window.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'type-chart') { setLiveTypeChart(event.data.raw); return; }
    if (event.data.type !== 'battle-data') return;
    // updateBattle nunca pode impedir o render (senão o painel congela e seções
    // como POKÉBOLAS somem) — se algo falhar, o render roda mesmo assim.
    try { updateBattle(event.data.payload); } catch (e) { console.debug('[Infinity Dex Helper] updateBattle falhou:', e); }
    render();
});

document.getElementById('content').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="toggle-move"]');
    if (!btn) return;
    const slug = btn.dataset.slug;
    if (openMoves.has(slug)) openMoves.delete(slug); else openMoves.add(slug);
    render();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[PokemonHelperStorage.KEYS.pokedex]) {
        const items = changes[PokemonHelperStorage.KEYS.pokedex].newValue?.items || [];
        pokedexBySlug = new Map(items.map((pokemon) => [normalizeSpecies(pokemon.slug || pokemon.name), pokemon]));
        render();
    }
    if (changes[PokemonHelperStorage.KEYS.trainerMoves]) {
        const items = changes[PokemonHelperStorage.KEYS.trainerMoves].newValue?.items || [];
        trainerMovesByKey = new Map(items.map((item) => [`${normalizeSpecies(item.species)}|${item.level}`, item.moves]));
        render();
    }
    if (changes[PokemonHelperStorage.KEYS.discoveredMoves]) {
        const items = changes[PokemonHelperStorage.KEYS.discoveredMoves].newValue?.items || [];
        discoveredMovesByKey = new Map(
            items
                .filter((item) => item && item.key && Array.isArray(item.moves))
                .map((item) => [item.key, item.moves])
        );
        render();
    }
    if (changes[PokemonHelperStorage.KEYS.roster]) {
        setRoster(changes[PokemonHelperStorage.KEYS.roster].newValue || { party: [], pc: [] });
        render();
    }
});

loadPokedex();
loadTrainerMoves();
loadDiscoveredMoves();
loadWildItems();
loadRoster();
