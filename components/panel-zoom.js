// ---------------------------------------------------------------------------
// Zoom do conteúdo do painel. Dono único do fator e da escada de degraus,
// compartilhado entre as telas de iframe e o content script.
//
// Nas páginas da extensão ele mesmo aplica `body { zoom: X }` por um <style>
// injetado — regra em vez de style inline em `document.body` porque assim o
// mesmo `subscribe()` que já existe pra notificar outros consumidores também
// repinta o `<style>` inteiro a cada mudança de fator, sem guardar referência
// ao body à parte (as cinco páginas carregam este script no fim do <body>,
// então ele já existe quando o subscribe roda pela primeira vez).
//
// No content script (página do jogo) ele NÃO aplica nada sozinho: quem
// assina (content.js, tooltip.js) decide o que fazer com o fator. É isso
// que mantém a página do jogo intocada.
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
        // typeof, não só Number.isFinite: Number(null) é 0 (finito!), então um
        // config importado com "panelZoom": null cairia no degrau 0.67 (o mais
        // próximo de 0) em vez do default — só um number de verdade é aceito,
        // qualquer outra coisa (null, string, undefined, objeto) cai no default.
        if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT;
        return LEVELS.reduce(
            (best, level) => (Math.abs(level - value) < Math.abs(best - value) ? level : best),
            LEVELS[0]
        );
    }

    const supported = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('zoom', '2');
    const isExtensionPage = location.protocol === 'chrome-extension:' || location.protocol === 'moz-extension:';

    let current = DEFAULT;
    const listeners = new Set();
    // Fila de promises que serializa todas as mudanças de zoom, evitando
    // race conditions (hidratação + perdas em cliques rápidos).
    let queue = Promise.resolve();

    // `supported` é o portão único da feature inteira (mesmo espírito do
    // guard em volta da injeção do <style> logo abaixo e da linha de
    // Configurações em settings-panel.js): sem suporte real à propriedade
    // `zoom` do CSS, publicar um fator ≠ 1 faria consumidores (tooltip.js,
    // content.js) escalar cálculos/CSS vars em cima de um zoom que o
    // navegador nunca aplica de verdade — no Gecko 109–125, por exemplo,
    // `box.style.zoom` é descartado silenciosamente, mas a divisão por esse
    // fator no tooltip continuaria acontecendo, deslocando a caixa. Por isso
    // o valor exposto (`factor()`, e o argumento passado pro `subscribe`) cai
    // sempre pro default aqui. `current` continua guardando o valor real
    // (persistido/snapado), pronto pra valer assim que o navegador ganhar
    // suporte — só a fachada pública é que é gated.
    function publicFactor() {
        return supported ? current : DEFAULT;
    }

    function set(value) {
        const next = snap(value);
        if (next === current) return;
        current = next;
        const factor = publicFactor();
        listeners.forEach((fn) => {
            try { fn(factor); } catch (error) { console.warn('[Pokemon Helper] Listener de zoom falhou:', error); }
        });
    }

    function subscribe(fn) {
        listeners.add(fn);
        fn(publicFactor());
        return () => listeners.delete(fn);
    }

    function step(delta) {
        // Usa fila de promises para evitar dois tipos de race:
        //
        // 1. Race de hidratação: se `step()` rodasse antes de
        //    `getUiPreferences()` (inicial) resolver, calcularia `next` a partir
        //    de DEFAULT (1) em vez do valor real do usuário, silenciosamente
        //    sobrescrevendo a preferência no storage.
        //
        // 2. Race de atualização perdida em cliques rápidos: se cada `step()`
        //    fizesse sua própria leitura fresca do storage, dois cliques antes
        //    de ambas as escritas resolverem leriam o mesmo valor antiquado,
        //    calculariam o mesmo `next`, e apenas uma mudança seria persistida.
        //
        // A fila serializa: a hidratação inicial é o primeiro elo, cada `step()`
        // é encadeado depois. Quando um elo roda, `current` é sempre correto —
        // ou hidratado, ou atualizado pelo `step()` anterior — logo derivar
        // `next` dele é seguro. `set()` já atualiza `current` sincronicamente,
        // mantendo-o fresco. O listener de `chrome.storage.onChanged` também o
        // atualiza se outro contexto mudar o zoom.
        queue = queue
            .then(() => {
                const index = LEVELS.indexOf(current);
                const next = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index + delta))];
                if (next === current) return current;
                set(next); // pinta já; o storage confirma logo em seguida
                return PokemonHelperStorage.setUiPreferences({ panelZoom: next }).then(() => next);
            })
            .catch((error) => {
                console.warn('[Pokemon Helper] Falha ao persistir zoom:', error);
                return current;
            });
        return queue;
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

    // Primeiro elo da fila: hidratação do valor persistido.
    queue = PokemonHelperStorage.getUiPreferences()
        .then((preferences) => set(preferences.panelZoom))
        .catch(() => {});

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes[PokemonHelperStorage.KEYS.uiPreferences]) return;
            const newValue = changes[PokemonHelperStorage.KEYS.uiPreferences].newValue;
            // Hoje todo escritor passa por updateUiPreferences, que sempre grava o
            // objeto uiPreferences mesclado inteiro — mas um `chrome.storage.local.set`
            // direto nessa chave no futuro, sem incluir panelZoom, não deve resetar
            // o zoom de todo mundo pra 100%: campo ausente mantém o fator atual em
            // vez de cair no default do snap() (que trataria "sem campo" como null).
            set(newValue && 'panelZoom' in newValue ? newValue.panelZoom : current);
        });
    }

    return Object.freeze({ LEVELS, supported, snap, step, subscribe, factor: publicFactor });
})();
globalThis.PokemonHelperZoom = PokemonHelperZoom;
