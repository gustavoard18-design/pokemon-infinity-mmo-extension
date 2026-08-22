var PokemonHelperPanelPosition = globalThis.PokemonHelperPanelPosition || (() => {
    const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    function clamp(rect = {}, viewport = {}, options = {}) {
        const width = Math.max(1, finite(rect.width, 300));
        const height = Math.max(1, finite(rect.height, 360));
        const vw = Math.max(1, finite(viewport.width, width));
        const vh = Math.max(1, finite(viewport.height, height));
        const hh = Math.max(1, finite(options.headerHeight, 30));
        return { top:Math.min(Math.max(0, finite(rect.top, 16)), Math.max(0, vh - hh)), right:Math.min(Math.max(0, finite(rect.right, 16)), Math.max(0, vw - 44)), width, height };
    }
    return Object.freeze({ clamp });
})();
globalThis.PokemonHelperPanelPosition = PokemonHelperPanelPosition;
