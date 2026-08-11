# Meus Pokémon — importar/exportar e ajustes de leitura

**Data:** 2026-08-11
**Status:** proposta para validação
**Base:** `AGENTS.md`, `docs/DEVELOPMENT.md`, `myPokemons.html`/`myPokemons.js`,
`components/pokemon-card.js`, `components/settings-panel.js`,
`data/extension-storage.js`

## Objetivo

Permitir que o jogador **exporte a lista completa dos seus Pokémon como JSON** e
que outra pessoa **importe esse arquivo** na mesma tela de Meus Pokémon, com
todos os filtros, ordenações e detalhes já existentes.

Junto disso, três ajustes de leitura na mesma tela:

1. recolher/expandir a lista de **golpes** de todos os cartões;
2. **barra colorida por IV** individual, como na tela de Encontro;
3. **link para o Smogon** por Pokémon, discreto e desligável nas configurações.

Nada disso conversa com o servidor do jogo: o recurso é local, sobre dados que a
extensão já recebe pela interceptação do `/character/`.

## Escopo

| Item | Entra | Não entra |
|---|---|---|
| Exportar party + todas as caixas em JSON | ✔ | Exportar apenas o resultado filtrado |
| Importar JSON e navegar a lista de outra pessoa | ✔ | Editar, mesclar ou salvar a lista importada |
| Toggle global de golpes | ✔ | Toggle por cartão |
| Barra colorida por IV | ✔ | Mudar as faixas de cor já usadas no projeto |
| Link do Smogon com chave em Configurações | ✔ | Buscar dados do Smogon, ou qualquer request para lá |

## 1. Exportar e importar

### Formato do arquivo

O arquivo é um JSON único, no mesmo modelo em ambas as direções:

```json
{
  "format": "infinity-mmo-extension/my-pokemons",
  "version": 1,
  "exportedAt": "2026-08-11T02:40:00.000Z",
  "party": [ { "name": "Pikachu", "level": 42, "…": "…" } ],
  "pc": [ { "name": "Caixa 1", "pokemon": [ { "…": "…" } ] } ]
}
```

`party` e `pc` reproduzem exatamente a estrutura que a tela já consome hoje
(`LOCAL_PAYLOAD`), então a importação alimenta o mesmo caminho de render que os
dados vindos do jogo — sem uma segunda modelagem paralela.

Cada Pokémon é serializado por uma **whitelist de campos**, não por cópia crua do
payload do jogo:

| Campo | Tipo | Observação |
|---|---|---|
| `name`, `species` | string | `name` cai para `species` na leitura |
| `level` | number | |
| `gender` | string | `M`/`F`/vazio |
| `shiny` | boolean | |
| `nature`, `ability`, `heldItem` | string \| null | |
| `types` | string[] | nomes de tipo como o jogo entrega |
| `ivs` | objeto `hp/atk/def/spa/spd/spe` | inteiros 0–31, com clamp |
| `stats` | objeto `hp/atk/def/spa/spd/spe` | usado por `PokemonIvEvaluation` |
| `moves` | array de `{ name, type, category, pp }` | |

A whitelist serve a três propósitos: o arquivo não carrega identificadores de
conta nem campos internos do jogo; a importação não injeta chaves desconhecidas
no view model; e exportação e importação ficam simétricas por construção — o que
sai é exatamente o que entra.

O nome do arquivo é `meus-pokemons-AAAA-MM-DD.json`.

### Leitura tolerante

A importação aceita:

- o envelope acima (`format`/`version`/`party`/`pc`);
- um objeto cru `{ "party": [...], "pc": [...] }`, sem envelope;
- ausência de uma das duas listas (só party, ou só caixas).

Rejeita, com mensagem específica: JSON inválido, raiz que não é objeto, e
`party`/`pc` presentes mas que não são arrays. `version` maior que a suportada
não bloqueia a leitura: os campos conhecidos são lidos e o restante é ignorado.

Cada caixa é lida como `{ name, pokemon[] }`; caixa sem nome recebe o rótulo
padrão `Caixa N` que a tela já gera. Entradas nulas dentro das listas são
descartadas, como já acontece com os dados do jogo.

### Comportamento da tela

Dois botões novos na fita de ações da barra de ferramentas, ao lado de "GRUPOS
ABERTOS" e "DETALHES DE TODOS": **EXPORTAR** e **IMPORTAR**.

- **EXPORTAR** serializa `LOCAL_PAYLOAD` inteiro — party e todas as caixas,
  ignorando filtro, busca e ordenação ativos — e dispara o download via `Blob` +
  âncora `download`. Se o navegador recusar o download dentro do iframe, o
  conteúdo vai para a área de transferência e a mensagem informa isso.
  Sem dados do personagem ainda, o botão fica desabilitado.
- **IMPORTAR** abre um `<input type="file">` oculto (`accept=".json"`).

Ao importar com sucesso, a tela entra em **modo importado**:

- uma faixa acima da lista mostra `LISTA IMPORTADA · <arquivo>` e um botão
  **VOLTAR AOS MEUS**;
- os dados do jogo continuam chegando por `postMessage` e atualizando
  `LOCAL_PAYLOAD` em segundo plano, mas não re-renderizam a tela;
- "VOLTAR AOS MEUS" descarta a lista importada e volta a renderizar
  `LOCAL_PAYLOAD`.

A lista importada vive só na memória do iframe: fechar o overlay, recarregar a
página ou trocar de aba do jogo a descarta. Ela nunca é gravada em
`chrome.storage` nem se mistura aos dados reais do jogador — é uma visualização,
não um segundo save.

Estado de filtros e expansão é recalculado na troca, porque as chaves de card
(`party:0`, `pc:2:13`) mudam de significado entre as duas listas.

### Mensagens

Uma linha de status abaixo da barra de ferramentas, sem `alert()`:

| Situação | Mensagem |
|---|---|
| Exportado | `Exportado: <arquivo>` |
| Exportado via clipboard | `Download bloqueado — JSON copiado para a área de transferência.` |
| Sem dados | `Nada para exportar — aguardando os dados do personagem.` |
| Importado | `Importado: <arquivo> — <N> Pokémon.` |
| JSON inválido | `Arquivo inválido: não é um JSON válido.` |
| Estrutura inválida | `Arquivo inválido: não contém uma lista de Pokémon.` |
| Vazio | `Arquivo sem Pokémon.` |

A mensagem some ao próximo import/export ou ao sair do modo importado.

## 2. Toggle de golpes

Terceiro botão na fita de ações: **GOLPES**, com o mesmo padrão visual e de
`aria-pressed` dos dois já existentes. Ligado por padrão. Desligado, a seção de
golpes deixa de ser renderizada em **todos** os cartões, o que encurta bastante o
cartão expandido quando o interesse é comparar IVs e naturezas.

O estado é da sessão do iframe, como os outros dois toggles globais — não entra
em Configurações, e volta ao padrão quando o overlay recarrega.

## 3. Barra colorida por IV

`PokemonCard.ivGrid` passa a renderizar, por atributo, a mesma composição da
grade de IVs da tela de Encontro (`battle.js`): rótulo, `px-bar` com preenchimento
proporcional a `iv/31`, e o número colorido.

As faixas de cor já existentes não mudam: `>= 26` verde, `>= 15` amarelo, abaixo
disso vermelho — as mesmas usadas hoje no número.

`ivGrid` é compartilhado com a tela de Leilão, que passa a mostrar a mesma barra.
Isso é desejado: é a mesma informação, com a leitura unificada entre as três
telas.

## 4. Link do Smogon

Cada cartão ganha um ícone discreto no cabeçalho, ao lado do nome (junto do
gênero e do indicador de shiny): um selo monoespaçado **S** que abre
`https://www.smogon.com/dex/sm/pokemon/<slug>/` em nova aba, com tooltip
"Abrir no Smogon — build, stats e estratégias".

O slug normaliza o nome: minúsculas, acentos removidos, `♀`→`-f`, `♂`→`-m`,
apóstrofo e ponto removidos, espaço/`_` viram `-`, hifens repetidos colapsados.
Assim `Farfetch'd` vira `farfetchd`, `Mr. Mime` vira `mr-mime` e `Nidoran♀` vira
`nidoran-f`.

O cabeçalho do cartão é um `<button>`, então o link **não** é uma âncora aninhada
(HTML inválido): é um `<span data-smogon="…">` tratado no mesmo delegador de
clique que já cuida do card, com `stopPropagation` para não expandir/recolher o
cartão junto, abrindo por `window.open(url, '_blank', 'noopener')`.

`PokemonCard.render` recebe o selo por um slot novo (`options.nameBadgesHtml`),
mantendo o componente ignorante sobre Smogon; quem monta o link é a tela de Meus
Pokémon. O Leilão não passa o slot e fica inalterado.

### Configuração

Nova preferência `screens.myPokemons.showSmogonLink`, **padrão ligado**, com uma
linha em Configurações → TELAS → MEUS POKÉMON: "Link do Smogon". Desligada, o
selo não é renderizado.

A tela já observa `chrome.storage.onChanged` para recarregar `SCREEN_PREFS`;
esse observador passa também a re-renderizar, para o toggle refletir na hora, sem
fechar e reabrir a aba.

## Arquitetura e arquivos

Serialização, validação e normalização ficam em um componente novo e isolado:

```text
components/pokemon-transfer.js   (novo)
  PokemonTransfer.export(payload) -> objeto do arquivo
  PokemonTransfer.parse(text)     -> { ok, payload, count } | { ok: false, error }
  PokemonTransfer.filename(date)  -> 'meus-pokemons-AAAA-MM-DD.json'
  PokemonTransfer.smogonUrl(name) -> URL do dex, ou null
```

Nenhuma dependência de DOM, `chrome.*` ou estado da tela: é uma unidade
testável de olho, com entrada e saída em JSON puro. `myPokemons.js` cuida do
resto — botões, `Blob`, `FileReader`, faixa de modo importado e mensagens.

Demais arquivos tocados:

| Arquivo | Mudança |
|---|---|
| `myPokemons.html` | botões, `input[type=file]`, linha de status, faixa de modo importado, `<script>` do componente novo, CSS local |
| `myPokemons.js` | modo importado, toggle de golpes, selo do Smogon, re-render no `onChanged` |
| `components/pokemon-card.js` | barra por IV em `ivGrid`, slot `nameBadgesHtml` em `render` |
| `components/pokemon-card.css` | estilo da barra por IV e do selo do Smogon |
| `data/extension-storage.js` | `showSmogonLink: true` |
| `components/settings-panel.js` | linha "Link do Smogon" |
| `README.md`, `docs/DEVELOPMENT.md` | documentação do recurso e do arquivo novo |

Os dois manifests já expõem `components/*.js` por curinga e os dois scripts de
build já copiam o diretório `components/` inteiro — o arquivo novo não exige
alteração em nenhum dos quatro. A versão dos manifests **não** é alterada.

## Privacidade e integridade

- O arquivo exportado contém apenas os campos da whitelist: sem token, sem id de
  conta, sem ouro, sem qualquer campo do payload que não esteja na tabela.
- Todo texto vindo de um arquivo importado é escapado na renderização pelos
  mesmos helpers já usados na tela; nada é inserido como HTML.
- A importação não dispara request alguma, nem para o jogo nem para terceiros.
- O link do Smogon é aberto por ação explícita do usuário e não envia nada além
  da navegação, disparada pelo próprio navegador.

## Critérios de aceite

1. Com o personagem sincronizado, EXPORTAR baixa um `.json` com party e todas as
   caixas, independentemente de filtros ativos.
2. Sem dados do personagem, EXPORTAR fica desabilitado e não gera arquivo.
3. Importar um arquivo gerado pela própria extensão reproduz a lista de origem:
   mesmos grupos, contadores, IVs, naturezas, avaliações e golpes.
4. Importar `{ "party": [...], "pc": [...] }` cru também funciona.
5. Arquivo corrompido, XML, ou JSON sem listas mostra a mensagem correspondente e
   **mantém** a lista atual na tela.
6. No modo importado, dados novos do jogo não trocam a tela; VOLTAR AOS MEUS
   restaura a lista do jogador com os dados mais recentes recebidos.
7. Recarregar a página descarta a lista importada.
8. GOLPES desligado remove a seção de golpes de todos os cartões; ligado, ela
   volta. Filtros e ordenação seguem funcionando nos dois estados.
9. A grade de IVs mostra barra proporcional e colorida em Meus Pokémon e Leilão,
   com as mesmas faixas de cor de hoje.
10. O selo do Smogon abre a página correta em nova aba e **não** expande nem
    recolhe o cartão ao ser clicado.
11. Desligar "Link do Smogon" nas configurações remove o selo sem recarregar a
    aba; ligar traz de volta.
12. Nada quebra nas telas de Encontro, Calculadora, Tabela e Leilão.

## Fora de escopo

- Persistir a lista importada, mesclá-la com a real ou editá-la.
- Comparar duas listas lado a lado.
- Exportar CSV, imagem, ou formato de simulador (Showdown).
- Importar direto de uma URL ou colar JSON num campo de texto.
- Qualquer chamada de rede ao Smogon.
