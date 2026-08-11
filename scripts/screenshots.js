// ---------------------------------------------------------------------------
// Gera os prints do README dirigindo, via CDP, um Chrome já logado no jogo.
// O script não faz login e não lê credencial: só clica no overlay e fotografa.
//
// Pré-requisitos (nada disso vira dependência do projeto — é utilitário de dev):
//
//   mkdir -p ~/tools/playwright && cd ~/tools/playwright && npm install playwright
//   google-chrome \
//     --user-data-dir=/tmp/perfil-debug-prints \
//     --remote-debugging-port=9222 \
//     --load-extension=<raiz do repositório> \
//     https://infinitymmo.net
//
// Com o jogo logado e o personagem sincronizado ("CONECTADO" no rodapé do
// overlay), a partir da raiz do repositório:
//
//   NODE_PATH=~/tools/playwright/node_modules node scripts/screenshots.js docs/images
//
// Gera sete das oito imagens do README. A oitava, `aba-encontro.png`, sai com
//
//   NODE_PATH=... node scripts/screenshots.js docs/images --encontro
//
// e exige uma batalha já na tela: o script nunca provoca batalha na conta do
// jogador. A imagem do leilão é pulada (com aviso) se a aba não tiver anúncios
// carregados.
//
// Dados de terceiros nunca entram nas imagens: a capa recorta o painel de chat
// do jogo, e o print do leilão aplica tarja sobre o nome dos vendedores.
// ---------------------------------------------------------------------------
let chromium;
try {
    ({ chromium } = require('playwright'));
} catch (erro) {
    console.error(`Playwright não encontrado a partir de ${__dirname}.

O repositório não tem package.json de propósito. Instale o Playwright fora
dele e aponte o NODE_PATH:

    mkdir -p ~/tools/playwright && cd ~/tools/playwright && npm install playwright
    cd <raiz do repositório>
    NODE_PATH=~/tools/playwright/node_modules node scripts/screenshots.js docs/images
`);
    process.exit(1);
}
const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');
const ARGS = process.argv.slice(2);
// --encontro: captura só aba-encontro.png, e exige uma batalha na tela. É a
// única imagem que o fluxo normal não gera, porque o script não deve provocar
// batalha na conta do jogador.
const SO_ENCONTRO = ARGS.includes('--encontro');
const OUT = ARGS.find((a) => !a.startsWith('--')) || path.join(process.cwd(), 'docs/images');
const OVERLAY = '#pokemon-type-matchup-overlay';
const wait = (p, ms) => p.waitForTimeout(ms);

// Prova de que o Chrome está renderizando ESTE checkout. É o erro mais caro do
// processo: o Chrome guarda a cópia que leu quando a extensão foi carregada,
// então trocar de branch, editar um arquivo ou apontar --load-extension para
// outro diretório faz os prints saírem de outro código — sem nenhum aviso.
//
// A comparação é contra o DOM vivo, não contra o arquivo em disco: o que vale
// para um print é o que o navegador de fato renderizou. Comparar arquivo com
// arquivo passaria mesmo com um iframe exibindo HTML antigo.
const TELAS_DE_PROVA = ['myPokemons.html', 'index.html', 'battle.html', 'chart.html', 'auction.html'];

async function confereBuild(game, F) {
    const problemas = [];

    for (const tela of TELAS_DE_PROVA) {
        const frame = F[tela];
        if (!frame) { problemas.push(`${tela}: iframe não encontrado`); continue; }

        const html = fs.readFileSync(path.join(RAIZ, tela), 'utf8');
        const idsEsperados = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
        const scriptsEsperados = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
            .map((m) => m[1].split('/').pop());

        const vivo = await frame.evaluate(({ ids, scripts }) => ({
            idsFaltando: ids.filter((id) => !document.getElementById(id)),
            scriptsFaltando: scripts.filter((nome) =>
                ![...document.scripts].some((s) => s.src.split('/').pop() === nome))
        }), { ids: idsEsperados, scripts: scriptsEsperados });

        if (vivo.idsFaltando.length) problemas.push(`${tela}: elementos ausentes no DOM → ${vivo.idsFaltando.join(', ')}`);
        if (vivo.scriptsFaltando.length) problemas.push(`${tela}: scripts não carregados → ${vivo.scriptsFaltando.join(', ')}`);
    }

    if (problemas.length) {
        throw new Error(`o Chrome não está renderizando este checkout:

${problemas.map((p) => `  ${p}`).join('\n')}

Os prints sairiam de outro código. Recarregue a extensão (chrome://extensions →
botão ↻) e recarregue a página do jogo. Confira também que o --load-extension
aponta para ${RAIZ} — um perfil de debug pode já ter a extensão instalada de
outro diretório, e aí o --load-extension da linha de comando é ignorado.`);
    }
    return true;
}

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
    if (!game) throw new Error('nenhuma aba em infinitymmo.net — abra o jogo no Chrome de debug');

    // pré-voo: build certo e personagem sincronizado. Sem isso o script
    // fotografa telas erradas ou vazias e ainda assim reporta sucesso.
    const status = await game.evaluate((sel) =>
        document.querySelector(`${sel} .ph-status`)?.textContent?.trim() || '', OVERLAY);
    if (!status) throw new Error('overlay não encontrado na página do jogo');
    if (status.startsWith('AGUARDANDO')) {
        throw new Error(`o overlay está em "AGUARDANDO DADOS": o personagem ainda não sincronizou.
Recarregue a página do jogo e espere o rodapé marcar "CONECTADO".`);
    }

    const F = await frames(game);
    if (!F['index.html'] || !F['myPokemons.html']) {
        throw new Error('iframes do overlay não carregaram — reabra o overlay na página do jogo');
    }
    await confereBuild(game, F);
    const overlay = game.locator(OVERLAY);
    const feitos = [];
    const log = [];

    const semTooltipEPrint = async (arquivo) => {
        await semTooltip(game);
        await overlay.screenshot({ path: path.join(OUT, arquivo) });
        feitos.push(arquivo);
    };

    // clique programático: o clique real deixaria o cursor sobre o botão e o
    // tooltip apareceria no print
    const view = async (name) => {
        await game.evaluate(([sel, v]) => {
            document.querySelector(`${sel} .ph-view-btn[data-view="${v}"]`)?.click();
        }, [OVERLAY, name]);
        await wait(game, 800);
    };
    // comTabela: o shell só coloca a tabela de tipos ao lado nas views calc e
    // battle (syncFullSide em content.js); myPokemons ocupa o full sozinho
    const maximizado = async (comTabela = false) => {
        // o jogo manda payloads o tempo todo e o shell reavalia o modo full;
        // confirma o estado em vez de confiar num clique só
        for (let i = 0; i < 6; i++) {
            const ok = await game.evaluate(([sel, exigeTabela]) => {
                const o = document.querySelector(sel);
                if (o.dataset.maximized !== 'true') { o.querySelector('.ph-maximize-btn')?.click(); return false; }
                if (!exigeTabela) return true;
                return getComputedStyle(o.querySelector('#pokemon-chart-frame')).display !== 'none';
            }, [OVERLAY, comTabela]);
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

    // ---- Encontro (só com --encontro): exige batalha na tela ------------
    if (SO_ENCONTRO) {
        await view('battle');
        const cena = await F['battle.html'].evaluate(() => ({
            encontro: !!document.querySelector('.enc-screen'),
            melhorJogada: !!document.querySelector('.best-box')
        }));
        if (!cena.encontro) {
            throw new Error(`a aba Encontro está vazia: entre numa batalha antes de rodar com --encontro.`);
        }
        if (!cena.melhorJogada) {
            throw new Error(`a caixa MELHOR JOGADA não está na tela — ela só aparece contra um
oponente ainda NÃO capturado, e é o que a legenda do README promete.
Entre numa batalha selvagem com um oponente novo.`);
        }
        await semTooltipEPrint('aba-encontro.png');
        console.log(JSON.stringify({ feitos, avisos: log }, null, 1));
        await browser.close();
        return;
    }

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

    // ---- Meus Pokémon: barra de ações + filtros abertos + cards ---------
    // em modo full: encaixado, o painel de filtros sozinho ocupa a altura
    // toda e empurra para fora do quadro justamente a fita de botões
    // (GOLPES / EXPORTAR / IMPORTAR) que a seção do README documenta
    await view('myPokemons');
    const mp = F['myPokemons.html'];
    await maximizado();
    await mp.evaluate(() => {
        const adv = document.getElementById('toggle-advanced-filters');
        if (adv?.getAttribute('aria-pressed') !== 'true') adv.click();
        window.scrollTo(0, 0);
    });
    await wait(game, 500);
    await mp.evaluate(() => {
        [...document.querySelectorAll('.pokemon-card-toggle')].slice(0, 2)
            .forEach((b) => { if (b.getAttribute('aria-expanded') !== 'true') b.click(); });
    });
    await wait(game, 700);
    await semTooltip(game);
    await overlay.screenshot({ path: path.join(OUT, 'aba-meus-pokemon.png') });
    feitos.push('aba-meus-pokemon.png');

    // ---- Leilão: anúncios expandidos, em modo full ---------------------
    // a aba é passiva — só tem dados se o jogador tiver aberto o leilão dentro
    // do jogo nesta sessão. Sem anúncios, pular é melhor que gravar uma tela
    // de espera por cima de uma imagem boa.
    const leilao = F['auction.html'];
    const anuncios = await leilao.evaluate(() => document.querySelectorAll('.pokemon-card').length);
    if (!anuncios) {
        log.push('aba-leilao.png pulada: nenhum anúncio carregado (abra o leilão dentro do jogo)');
    } else {
        await view('auction');
        await maximizado();
        await leilao.evaluate(() => {
            // sem filtro preso: um print filtrado documenta a busca, não a tela
            document.getElementById('clear')?.click();
        });
        await wait(game, 3500);
        await leilao.evaluate(() => {
            const b = document.getElementById('expand-all-pokemon');
            if (b?.getAttribute('aria-pressed') !== 'true') b?.click();
        });
        await wait(game, 900);
        // tarja no vendedor: são jogadores reais, e a imagem vai para um
        // repositório público. Aplicada aqui para a redação sobreviver a
        // qualquer regeneração futura.
        const redigidos = await leilao.evaluate(() => {
            let n = 0;
            document.querySelectorAll('.detail-row').forEach((row) => {
                if (!/vendedor/i.test(row.querySelector('.detail-key')?.textContent || '')) return;
                const val = row.querySelector('.detail-val');
                if (!val) return;
                val.style.filter = 'blur(4px)';
                val.dataset.redigido = '1';
                n += 1;
            });
            return n;
        });
        if (!redigidos) {
            throw new Error(`não encontrei a linha "Vendedor" para aplicar a tarja no print do leilão.
Sem ela, a imagem publicaria nomes de outros jogadores. Confira se o card do
leilão ainda tem essa linha antes de seguir.`);
        }
        await wait(game, 400);
        await semTooltip(game);
        await overlay.screenshot({ path: path.join(OUT, 'aba-leilao.png') });
        feitos.push('aba-leilao.png');
        await leilao.evaluate(() => document.querySelectorAll('[data-redigido]').forEach((el) => {
            el.style.filter = '';
            delete el.dataset.redigido;
        }));
        await view('myPokemons');
    }

    // ---- Capa: overlay por cima do jogo --------------------------------
    // encaixado e sem filtros: a capa mostra o painel flutuante sobre o jogo
    await encaixado();
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
        return chat
            ? { x: 0, y: 0, width: Math.round(chat.getBoundingClientRect().left), height: innerHeight }
            : null;
    });
    // sem recorte confiável, é melhor falhar do que publicar o chat: a
    // heurística depende do layout do jogo e não pode degradar em silêncio
    if (!clip) {
        throw new Error(`não localizei o painel de chat para recortar da capa.
Publicar a tela inteira exporia nomes e mensagens de outros jogadores.
Ajuste a heurística de recorte ou capture a capa à mão com o chat fechado.`);
    }
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
    await maximizado(true);
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

    console.log(JSON.stringify({ feitos, avisos: log }, null, 1));
    await browser.close();
})();
