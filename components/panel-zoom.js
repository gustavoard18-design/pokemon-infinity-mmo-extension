// ---------------------------------------------------------------------------
// Zoom do conteúdo do painel. Dono único do fator e da escada de degraus,
// compartilhado entre as telas de iframe e o content script.
//
// Nas páginas da extensão ele mesmo aplica `body { zoom: X }` por um <style>
// injetado — regra em vez de style inline porque o script pode rodar antes de
// o <body> existir. No content script (página do jogo) ele NÃO aplica nada
// sozinho: quem assina (content.js, tooltip.js) decide o que fazer com o fator.
// É isso que mantém a página do jogo intocada.
//
// O zoom vai no <body>, não no <html>, de propósito: a caixa do tooltip global
// mora em documentElement (components/tooltip.js), e dentro de uma árvore
// escalada o getBoundingClientRect() do alvo (coordenada visual) deixaria de
// bater com o style.left/top da caixa (unidades já escaladas).
// ---------------------------------------------------------------------------
var PokemonHelperZoom = globalThis.PokemonHelperZoom || (() => {
    const LEVELS = Object.freeze([0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);
    const DEFAULT = 1;

    // degrau válido mais próximo: protege contra config importada com valor
    // arbitrário e contra ruído de ponto flutuante vindo do storage
    function snap(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return DEFAULT;
        return LEVELS.reduce(
            (best, level) => (Math.abs(level - num) < Math.abs(best - num) ? level : best),
            LEVELS[0]
        );
    }

    const supported = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('zoom', '2');
    const isExtensionPage = location.protocol === 'chrome-extension:' || location.protocol === 'moz-extension:';

    let current = DEFAULT;
    const listeners = new Set();

    function set(value) {
        const next = snap(value);
        if (next === current) return;
        current = next;
        listeners.forEach((fn) => {
            try { fn(current); } catch (error) { console.warn('[Pokemon Helper] Listener de zoom falhou:', error); }
        });
    }

    function subscribe(fn) {
        listeners.add(fn);
        fn(current);
        return () => listeners.delete(fn);
    }

    function step(delta) {
        const index = LEVELS.indexOf(current);
        const next = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index + delta))];
        if (next === current) return Promise.resolve(current);
        set(next); // pinta já; o storage confirma logo em seguida
        return PokemonHelperStorage.setUiPreferences({ panelZoom: next }).then(() => next);
    }

    if (isExtensionPage && supported) {
        subscribe((factor) => {
            let style = document.getElementById('ph-zoom-style');
            if (!style) {
                style = document.createElement('style');
                style.id = 'ph-zoom-style';
                (document.head || document.documentElement).appendChild(style);
            }
            style.textContent = `body { zoom: ${factor}; }`;
        });
    }

    PokemonHelperStorage.getUiPreferences()
        .then((preferences) => set(preferences.panelZoom))
        .catch(() => {});

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes[PokemonHelperStorage.KEYS.uiPreferences]) return;
            set(changes[PokemonHelperStorage.KEYS.uiPreferences].newValue?.panelZoom);
        });
    }

    return Object.freeze({ LEVELS, supported, snap, step, subscribe, factor: () => current });
})();
globalThis.PokemonHelperZoom = PokemonHelperZoom;
