// ---------------------------------------------------------------------------
// Gera os prints do README dirigindo, via CDP, um Chrome já logado no jogo.
// O script não faz login e não lê credencial: só clica no overlay e fotografa.
//
// Pré-requisitos (nada disso vira dependência do projeto — é utilitário de dev):
//
//   npm install playwright        # numa pasta qualquer, fora do repo
//   google-chrome \
//     --user-data-dir=/tmp/perfil-debug-prints \
//     --remote-debugging-port=9222 \
//     --load-extension=<raiz do repositório> \
//     https://infinitymmo.net
//
// Com o jogo logado e o personagem sincronizado ("CONECTADO" no rodapé do
// overlay):
//
//   node scripts/screenshots.js docs/images
//
// Gera seis das sete imagens do README. `aba-encontro.png` fica de fora: ela
// exige uma batalha em andamento, que o script não deve provocar.
//
// A capa recorta o painel de chat do jogo — são nomes e mensagens de outros
// jogadores, que não têm por que ir para um README público.
// ---------------------------------------------------------------------------
const { chromium } = require('playwright');
const path = require('path');

const OUT = process.argv[2] || path.join(process.cwd(), 'docs/images');
const OVERLAY = '#pokemon-type-matchup-overlay';
const wait = (p, ms) => p.waitForTimeout(ms);

// o tooltip global (#px-tooltip) segue o mouse e aparece no print se o
// cursor parar em cima do botão que acabou de ser clicado
// cada documento (jogo + cada iframe) injeta o seu próprio #px-tooltip,
// então não basta esconder o do jogo
async function semTooltip(game) {
    await game.mouse.move(1850, 940);
    // regra !important em vez de estilo inline: o tooltip.js reposiciona e
    // reexibe o elemento, e sobrescreveria um display inline
    const esconde = () => {
        if (document.getElementById('px-sem-tooltip')) return;
        const st = document.createElement('style');
        st.id = 'px-sem-tooltip';
        st.textContent = '#px-tooltip { display: none !important; }';
        document.head.appendChild(st);
    };
    for (const f of game.frames()) await f.evaluate(esconde).catch(() => {});
    await wait(game, 400);
}

async function frames(game) {
    const map = {};
    for (const f of game.frames()) {
        const name = await f.evaluate(() => location.href.split('/').pop()).catch(() => null);
        if (name) map[name] = f;
    }
    return map;
}

(async () => {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const game = browser.contexts().flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('https://infinitymmo.net'));
    const F = await frames(game);
    const overlay = game.locator(OVERLAY);
    const feitos = [];

    // clique programático: o clique real deixaria o cursor sobre o botão e o
    // tooltip apareceria no print
    const view = async (name) => {
        await game.evaluate(([sel, v]) => {
            document.querySelector(`${sel} .ph-view-btn[data-view="${v}"]`)?.click();
        }, [OVERLAY, name]);
        await wait(game, 800);
    };
    const maximizado = async () => {
        // o jogo manda payloads o tempo todo e o shell reavalia o modo full;
        // confirma o estado em vez de confiar num clique só
        for (let i = 0; i < 6; i++) {
            const ok = await game.evaluate((sel) => {
                const o = document.querySelector(sel);
                if (o.dataset.maximized !== 'true') { o.querySelector('.ph-maximize-btn')?.click(); return false; }
                return getComputedStyle(o.querySelector('#pokemon-chart-frame')).display !== 'none';
            }, OVERLAY);
            await wait(game, 1200);
            if (ok) return true;
        }
        throw new Error('não consegui manter o modo full');
    };
    const encaixado = async () => {
        await game.evaluate((sel) => {
            const o = document.querySelector(sel);
            if (o?.dataset.maximized === 'true') o.querySelector('.ph-maximize-btn')?.click();
        }, OVERLAY);
        await wait(game, 800);
    };

    await encaixado();

    // ---- Calculadora: modo ataque com um tipo escolhido ---------------
    await view('calc');
    // idempotente: clicar sempre alternaria a seleção entre execuções
    await F['index.html'].evaluate(() => {
        const cell = document.querySelector('.type-cell[data-type="water"]');
        if (cell && !cell.classList.contains('selected')) cell.click();
    });
    await wait(game, 700);
    await semTooltip(game);
    await overlay.screenshot({ path: path.join(OUT, 'aba-calculadora.png') });
    feitos.push('aba-calculadora.png');

    // ---- Meus Pokémon: filtros abertos + cards expandidos --------------
    await view('myPokemons');
    const mp = F['myPokemons.html'];
    await mp.evaluate(() => {
        const adv = document.getElementById('toggle-advanced-filters');
        if (adv?.getAttribute('aria-pressed') !== 'true') adv.click();
    });
    await wait(game, 500);
    await mp.evaluate(() => {
        [...document.querySelectorAll('.pokemon-card-toggle')].slice(0, 2)
            .forEach((b) => { if (b.getAttribute('aria-expanded') !== 'true') b.click(); });
    });
    await wait(game, 600);
    // o painel de filtros sozinho ocupa a tela toda no modo encaixado: rola
    // até o fim dele para o print mostrar filtros E cards na mesma imagem
    await mp.evaluate(() => {
        const f = document.getElementById('pokemon-advanced-filters');
        window.scrollTo(0, window.scrollY + f.getBoundingClientRect().bottom - 200);
    });
    await wait(game, 500);
    await semTooltip(game);
    await overlay.screenshot({ path: path.join(OUT, 'aba-meus-pokemon.png') });
    feitos.push('aba-meus-pokemon.png');

    // ---- Capa: overlay por cima do jogo --------------------------------
    // volta ao topo e fecha os filtros: a capa mostra a lista, não o filtro
    await mp.evaluate(() => {
        const adv = document.getElementById('toggle-advanced-filters');
        if (adv?.getAttribute('aria-pressed') === 'true') adv.click();
        window.scrollTo(0, 0);
    });
    await wait(game, 700);
    await semTooltip(game);
    // recorta o painel de chat: são nomes e mensagens de outros jogadores,
    // que não têm por que ir para um README público
    const clip = await game.evaluate(() => {
        const chat = [...document.querySelectorAll('div')].find((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 200 && r.width < 500 && r.height > 500 && r.left > innerWidth * 0.7;
        });
        const limite = chat ? Math.round(chat.getBoundingClientRect().left) : innerWidth;
        return { x: 0, y: 0, width: limite, height: innerHeight };
    });
    await game.screenshot({ path: path.join(OUT, 'capa-overlay.png'), clip });
    feitos.push('capa-overlay.png');

    // ---- Configurações --------------------------------------------------
    await view('settings');
    await semTooltip(game);
    await overlay.screenshot({ path: path.join(OUT, 'tela-configuracoes.png') });
    feitos.push('tela-configuracoes.png');

    // ---- Modo full: calculadora com a tabela de tipos ao lado -----------
    await view('calc');
    // o modo full remonta a tela da calculadora: reaplica a seleção de tipo
    await F['index.html'].evaluate(() => {
        if (!document.querySelector('.type-cell.selected')) {
            document.querySelector('.type-cell[data-type="water"]')?.click();
        }
    });
    await maximizado();
    await F['index.html'].evaluate(() => {
        if (!document.querySelector('.type-cell.selected')) {
            document.querySelector('.type-cell[data-type="water"]')?.click();
        }
    });
    await wait(game, 1500);
    await semTooltip(game);
    await overlay.screenshot({ path: path.join(OUT, 'modo-full.png') });
    feitos.push('modo-full.png');

    // ---- Tabela de tipos: só o iframe da tabela, já em modo full --------
    await semTooltip(game);
    await game.locator(`${OVERLAY} #pokemon-chart-frame`)
        .screenshot({ path: path.join(OUT, 'tabela-tipos.png') });
    feitos.push('tabela-tipos.png');

    // restaura o painel como estava: encaixado, na aba Encontro
    await encaixado();
    await view('battle');

    console.log(JSON.stringify({ feitos }, null, 1));
    await browser.close();
})();
