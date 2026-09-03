// ---------------------------------------------------------------------------
// Itens que Pokémon SELVAGENS podem segurar — tabela-semente baseada em
// Pokémon FireRed (o InfinityMMO é baseado nele). É uma REFERÊNCIA: o valor
// real do servidor pode diferir. O que a extensão aprende nos SEUS encontros
// (data/extension-storage → wildItems) tem prioridade sobre esta tabela.
// Chave: slug da espécie (minúsculo). Valor: [{ item: slug, chance: % }].
// ---------------------------------------------------------------------------
var WILD_HELD_SEED = globalThis.WILD_HELD_SEED || Object.freeze({
    chansey:   [{ item: 'lucky_egg', chance: 5 }],
    cubone:    [{ item: 'thick_club', chance: 5 }],
    marowak:   [{ item: 'thick_club', chance: 5 }],
    magneton:  [{ item: 'magnet', chance: 5 }],
    abra:      [{ item: 'twisted_spoon', chance: 5 }],
    kadabra:   [{ item: 'twisted_spoon', chance: 5 }],
    haunter:   [{ item: 'spell_tag', chance: 5 }],
    sandslash: [{ item: 'soft_sand', chance: 5 }],
    fearow:    [{ item: 'sharp_beak', chance: 5 }],
    dodrio:    [{ item: 'sharp_beak', chance: 5 }],
    arbok:     [{ item: 'poison_barb', chance: 5 }],
    butterfree:[{ item: 'silver_powder', chance: 5 }],
    venomoth:  [{ item: 'silver_powder', chance: 5 }],
    dewgong:   [{ item: 'never_melt_ice', chance: 5 }],
    clefairy:  [{ item: 'moon_stone', chance: 5 }],
    machoke:   [{ item: 'focus_band', chance: 5 }],
    dratini:   [{ item: 'dragon_scale', chance: 5 }],
    dragonair: [{ item: 'dragon_scale', chance: 5 }],
    meowth:    [{ item: 'nugget', chance: 5 }],
    paras:     [{ item: 'tiny_mushroom', chance: 50 }, { item: 'big_mushroom', chance: 5 }],
    parasect:  [{ item: 'tiny_mushroom', chance: 50 }, { item: 'big_mushroom', chance: 5 }],
    staryu:    [{ item: 'stardust', chance: 50 }, { item: 'star_piece', chance: 5 }],
    starmie:   [{ item: 'stardust', chance: 50 }, { item: 'star_piece', chance: 5 }]
});
globalThis.WILD_HELD_SEED = WILD_HELD_SEED;

// efeito (PT) de cada item — mescla o conteúdo da planilha "Held Itens" (o que
// o item faz) com o conhecimento de FireRed. Usado no tooltip do selo de item.
var WILD_ITEM_EFFECTS = globalThis.WILD_ITEM_EFFECTS || Object.freeze({
    lucky_egg:      'Aumenta o EXP que o portador ganha em batalha.',
    thick_club:     'Dobra o Ataque de Cubone e Marowak.',
    magnet:         'Aumenta o dano de golpes do tipo Elétrico.',
    twisted_spoon:  'Aumenta o dano de golpes do tipo Psíquico.',
    spell_tag:      'Aumenta o dano de golpes do tipo Fantasma.',
    soft_sand:      'Aumenta o dano de golpes do tipo Terra.',
    sharp_beak:     'Aumenta o dano de golpes do tipo Voador.',
    poison_barb:    'Aumenta o dano de golpes do tipo Veneno.',
    silver_powder:  'Aumenta o dano de golpes do tipo Inseto.',
    never_melt_ice: 'Aumenta o dano de golpes do tipo Gelo.',
    moon_stone:     'Pedra de evolução (Clefairy, Jigglypuff, Nidorina/Nidorino…).',
    focus_band:     'Chance de sobreviver a um golpe fatal com 1 HP.',
    dragon_scale:   'Evolui Seadra em Kingdra (via troca).',
    nugget:         'Vende por ¥5.000 em qualquer Poké Mart.',
    tiny_mushroom:  'Item de venda / usado no Relembrador de Golpes (Ilha 2).',
    big_mushroom:   'Item de venda / usado no Relembrador de Golpes (Ilha 2).',
    stardust:       'Item valioso para vender.',
    star_piece:     'Item valioso para vender (alto valor).'
});
globalThis.WILD_ITEM_EFFECTS = WILD_ITEM_EFFECTS;
