var PokemonShinyAlert = globalThis.PokemonShinyAlert || (() => {
    const announced = new Set();
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[ _]+/g, '-');
    function visualState(foe, battleId, activeIndex) {
        if (foe?.shiny !== true) return { visible:false, key:null, entering:false };
        const key = `${battleId || 'battle'}:${activeIndex ?? 0}:${normalize(foe.species || foe.name)}`;
        const entering = !announced.has(key); announced.add(key);
        return { visible:true, key, entering };
    }
    const reset = () => announced.clear();
    return Object.freeze({ visualState, reset });
})();
globalThis.PokemonShinyAlert = PokemonShinyAlert;
