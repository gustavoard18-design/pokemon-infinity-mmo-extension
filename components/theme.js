var PokemonHelperTheme = globalThis.PokemonHelperTheme || (() => {
    const listeners = new Set();
    const normalize = (value) => value === 'light' ? 'light' : 'dark';
    function apply(value, root = document.documentElement) {
        const theme = normalize(value);
        if (root?.dataset) root.dataset.theme = theme;
        listeners.forEach((listener) => listener(theme));
        return theme;
    }
    const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
    return Object.freeze({ normalize, apply, subscribe });
})();
globalThis.PokemonHelperTheme = PokemonHelperTheme;
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('message', (event) => {
        if (event.source === window.parent && event.data?.type === 'pokemon-helper-theme') PokemonHelperTheme.apply(event.data.theme);
    });
    const isExtensionDocument = typeof location !== 'undefined' && /^(chrome|moz)-extension:$/.test(location.protocol);
    if (isExtensionDocument && typeof PokemonHelperStorage !== 'undefined') PokemonHelperStorage.getUiPreferences().then((prefs) => PokemonHelperTheme.apply(prefs.theme)).catch(() => PokemonHelperTheme.apply('dark'));
}
