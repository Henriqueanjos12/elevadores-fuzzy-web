# Elevadores Fuzzy — versão web didática

Versão web (HTML + CSS + JavaScript puro, sem dependências nem build step)
do [simulador de elevadores com lógica fuzzy](https://github.com/Henriqueanjos12/elevadores-fuzzy)
originalmente escrito em Python. Pensada para abrir direto no navegador —
inclusive pelo celular — e ser usada ao vivo numa aula de Lógica Fuzzy, sem
precisar instalar nada.

**[Abrir a demo ao vivo](https://henriqueanjos12.github.io/elevadores-fuzzy-web/)**
(depois de publicado no GitHub Pages).

## O que tem aqui

Um controlador fuzzy Mamdani (**distância × lotação → prioridade**) decide
qual dos 3 elevadores atende cada chamada externa do prédio de 12
pavimentos — o mesmo motor de inferência (mesmas pertinências, mesmas 9
regras) do projeto Python original, reimplementado em JavaScript.

* **Prédio animado**: 12 pavimentos, 3 elevadores, botões ▲/▼ de chamada.
* **Fluxo em duas fases**, igual um elevador de verdade: apertar o botão
  externo só registra andar e direção; o "painel interno" (quantas pessoas
  embarcam e pra quais andares) só aparece quando o elevador chega de
  portas abertas.
* **Gráficos de pertinência editáveis**: arraste os vértices dos trapézios
  (distância, lotação, prioridade) e veja o motor de inferência mudar de
  comportamento em tempo real — sem precisar reiniciar a simulação.
* **Tabela de decisão fuzzy**: para a última chamada despachada, mostra
  distância/lotação/carga/prioridade dos 3 elevadores lado a lado, com o
  escolhido destacado e os descartados (pelo filtro determinístico)
  acinzentados.
* **Log de eventos** e **dois algoritmos de despacho** (fuzzy vs. mais
  próximo) para comparar.

Esta versão web prioriza o essencial para explicar lógica fuzzy em aula —
por isso não inclui a aba de teste manual nem o painel de métricas
detalhadas do app desktop (esses continuam só na versão Python).

## Rodando localmente

Não tem build nem dependências — só HTML/CSS/JS servidos como arquivos
estáticos. Como o `main.js` usa ES modules (`import`/`export`), o
navegador exige que os arquivos venham de um servidor HTTP (abrir
`index.html` direto com `file://` não funciona). Qualquer servidor
estático simples resolve, por exemplo:

```bash
python -m http.server 8000
# depois abra http://localhost:8000/
```

## Estrutura

```text
index.html          # layout da página
style.css           # tema escuro, responsivo
js/
├── fuzzy.js         # controlador fuzzy: pertinências, regras, inferência (Mamdani + centroide)
├── models.js        # elevador/chamada/passageiro (objetos simples + funções)
├── gerador.js        # geração de chamadas manual/aleatória (com semente reprodutível)
├── despachante.js    # escolhe o elevador (fuzzy ou mais próximo)
├── simulador.js       # laço de ciclos discretos, embarque/desembarque, eventos
├── building.js        # <canvas> do prédio: poços, portas, botões de chamada
├── charts.js           # gráficos de pertinência com edição ao vivo (arrastar vértices)
└── main.js            # orquestração: liga tudo, laço de simulação, modal de embarque
```

A correspondência com os módulos do projeto Python é direta
(`fuzzy/controlador_fuzzy.py` → `js/fuzzy.js`, `models/*.py` → `js/models.js`,
`simulation/simulador.py` → `js/simulador.js`, e assim por diante) — quem já
leu o código Python reconhece a mesma organização aqui.

## Publicando no GitHub Pages

1. Configurações do repositório → **Pages** → *Source*: `Deploy from a
   branch` → branch `main`, pasta `/ (root)`.
2. Salvar. Em alguns minutos o site fica em
   `https://<usuário>.github.io/<repositório>/`.

O arquivo `.nojekyll` na raiz evita que o GitHub Pages tente processar o
site com Jekyll (não é necessário aqui, e Jekyll ignora por padrão pastas
começadas com `_`, o que não usamos, mas é uma prática segura padrão).

## Licença

Uso didático, sem fins comerciais — projeto de estudo de caso para uma
aula de Lógica Fuzzy.
