// Serialização da lista de Pokémon (exportar/importar) e link do Smogon.
// Sem DOM e sem chrome.*: entra e sai JSON puro, para a tela cuidar só de UI.
var PokemonTransfer = globalThis.PokemonTransfer || (() => {
    const FORMAT = 'infinity-mmo-extension/my-pokemons';
    const VERSION = 1;
    const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const SMOGON_BASE = 'https://www.smogon.com/dex/sm/pokemon/';

    const asText = (value) => (value === null || value === undefined || value === '')
        ? null
        : String(value);

    const asNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const clampIv = (value) => Math.min(31, Math.max(0, Math.round(Number(value) || 0)));

    function sanitizeIvs(source) {
        return Object.fromEntries(STAT_KEYS.map((stat) => [stat, clampIv(source?.[stat])]));
    }

    // stats é opcional no payload do jogo, mas PokemonIvEvaluation usa quando
    // existe — só vai para o arquivo se houver pelo menos um valor numérico
    function sanitizeStats(source) {
        if (!source || typeof source !== 'object') return null;
        const stats = {};
        let found = false;
        STAT_KEYS.forEach((stat) => {
            const value = asNumber(source[stat]);
            if (value === null) return;
            stats[stat] = value;
            found = true;
        });
        return found ? stats : null;
    }

    function sanitizeMoves(source) {
        if (!Array.isArray(source)) return [];
        return source.filter(Boolean).map((move) => ({
            name: asText(move?.name),
            type: asText(move?.type),
            category: asText(move?.category),
            pp: asNumber(move?.pp)
        }));
    }

    function sanitizeTypes(source) {
        if (!Array.isArray(source)) return [];
        return source.map(asText).filter(Boolean);
    }

    // whitelist: o arquivo não carrega id de conta nem campo interno do jogo,
    // e a importação não injeta chave desconhecida no view model da tela
    function sanitizePokemon(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const pokemon = {
            name: asText(entry.name),
            species: asText(entry.species),
            level: asNumber(entry.level),
            gender: asText(entry.gender),
            shiny: entry.shiny === true,
            nature: asText(entry.nature),
            ability: asText(entry.ability),
            heldItem: asText(entry.heldItem),
            types: sanitizeTypes(entry.types),
            ivs: sanitizeIvs(entry.ivs),
            moves: sanitizeMoves(entry.moves)
        };
        if (!pokemon.name && !pokemon.species) return null;
        const stats = sanitizeStats(entry.stats);
        if (stats) pokemon.stats = stats;
        return pokemon;
    }

    function sanitizeParty(source) {
        if (!Array.isArray(source)) return [];
        return source.map(sanitizePokemon).filter(Boolean);
    }

    function sanitizeBoxes(source) {
        if (!Array.isArray(source)) return [];
        return source.filter(Boolean).map((box) => ({
            name: asText(box?.name),
            pokemon: sanitizeParty(box?.pokemon)
        }));
    }

    function countPokemon(payload) {
        const boxes = payload.pc.reduce((sum, box) => sum + box.pokemon.length, 0);
        return payload.party.length + boxes;
    }

    function buildExport(payload, date) {
        const stamp = date instanceof Date ? date : new Date();
        return {
            format: FORMAT,
            version: VERSION,
            exportedAt: stamp.toISOString(),
            party: sanitizeParty(payload?.party),
            pc: sanitizeBoxes(payload?.pc)
        };
    }

    // aceita o envelope exportado por aqui e também um `{ party, pc }` cru —
    // versão desconhecida não bloqueia: lê os campos conhecidos e ignora o resto
    function parse(text) {
        let root;
        try {
            root = JSON.parse(text);
        } catch (error) {
            return { ok: false, error: 'json' };
        }
        if (!root || typeof root !== 'object' || Array.isArray(root)) {
            return { ok: false, error: 'shape' };
        }
        const hasParty = root.party !== undefined;
        const hasBoxes = root.pc !== undefined;
        if (!hasParty && !hasBoxes) return { ok: false, error: 'shape' };
        if (hasParty && !Array.isArray(root.party)) return { ok: false, error: 'shape' };
        if (hasBoxes && !Array.isArray(root.pc)) return { ok: false, error: 'shape' };

        const payload = { party: sanitizeParty(root.party), pc: sanitizeBoxes(root.pc) };
        const count = countPokemon(payload);
        if (count === 0) return { ok: false, error: 'empty' };
        return { ok: true, payload, count };
    }

    function filename(date) {
        const stamp = date instanceof Date ? date : new Date();
        const pad = (value) => String(value).padStart(2, '0');
        return `meus-pokemons-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}.json`;
    }

    // Farfetch'd → farfetchd, Mr. Mime → mr-mime, Nidoran♀ → nidoran-f
    function smogonSlug(name) {
        return String(name ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/♀/g, '-f')
            .replace(/♂/g, '-m')
            .replace(/['’.:]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function smogonUrl(name) {
        const slug = smogonSlug(name);
        return slug ? `${SMOGON_BASE}${slug}/` : null;
    }

    return Object.freeze({
        FORMAT,
        VERSION,
        buildExport,
        parse,
        filename,
        smogonSlug,
        smogonUrl,
        countPokemon
    });
})();

globalThis.PokemonTransfer = PokemonTransfer;
