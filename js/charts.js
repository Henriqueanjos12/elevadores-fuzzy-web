// Gráficos de pertinência (distancia, lotacao, prioridade), com edição ao
// vivo (arrastar vértices). Porta simplificada de interface/painel_graficos.py.

import { trapmf } from "./fuzzy.js";

// Paleta categórica validada (CVD-safe) da skill de dataviz -- passos de
// modo escuro dos slots 1-5 (azul, laranja, água-marinha, amarelo, magenta),
// na mesma ordem em que foram validados (a ordem É o mecanismo de segurança
// pra daltonismo, não é só estética -- não reordenar). Usada tal e qual só
// em "lotacao" (3 termos, cabe sem repetir).
const CORES_TERMO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

// "distancia" (7 termos) e "prioridade" (6 termos) têm mais termos do que a
// paleta categórica suporta sem repetir cor (achado real: cor repetida nos
// dois gráficos confundia -- "proximo_desce" e "distante_sobe" tinham a
// MESMA cor, e em "prioridade" até "pior" e "ideal", os dois extremos,
// acabavam iguais). A skill de dataviz é explícita: mais série do que a
// paleta aguenta sem colidir não é "escolher mais cores" -- é trocar de
// canal. Os dois casos aqui já são, por natureza, ORDENADOS (não apenas
// "identidade"), então cada um usa a codificação certa pro seu formato:
//
// * "distancia" é DIVERGENTE (Seção "vetor posição"): 3 termos "desce" + 1
//   "exato" + 3 termos "sobe", um sinal com dois lados. Usa o par
//   diverge divergente da skill (azul <-> laranja, slot 1 e 2, os dois já
//   validados CVD-safe entre si) pro LADO, e o traçado da linha (sólido /
//   tracejado / pontilhado) pra DISTÂNCIA dentro de cada lado -- um canal
//   secundário de verdade (não é só estética), exatamente o que a skill
//   pede quando uma paleta categórica não aguenta o número de séries.
//   "exato" fica num cinza neutro (o mesmo tom de tinta secundária do
//   tema), o meio da divergência.
// * "prioridade" é ORDINAL (pior -> ideal é uma ordem de qualidade, não
//   uma lista de nomes que poderiam estar em qualquer ordem) -- a skill
//   pede UMA cor só com passos de luminosidade (não várias cores
//   categóricas), usando o ramp azul documentado da skill (passos
//   100-700), filtrado aos degraus que ainda têm contraste >= 3:1 (ou,
//   abaixo disso, com a legenda de texto como contrapartida obrigatória).
const COR_DESCE = "#3987e5"; // slot 1 (azul)
const COR_SOBE = "#d95926"; // slot 2 (laranja)
const COR_EXATO = "#c3c2b7"; // tinta secundária do tema (neutro)
const TRACADO_PROXIMO = [];
const TRACADO_DISTANTE = [6, 3];
const TRACADO_MUITO_DISTANTE = [2, 3];
const RAMP_PRIORIDADE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#2a78d6", "#1c5cab", "#104281"]; // passos 100/200/300/450/550/650

function estiloDoTermo(nome, indice, total) {
  if (nome === "distancia") {
    const meio = (total - 1) / 2; // indice do termo "exato"
    if (indice === meio) return { cor: COR_EXATO, tracado: TRACADO_PROXIMO };
    const distanciaDoMeio = Math.abs(indice - meio);
    const cor = indice < meio ? COR_DESCE : COR_SOBE;
    const tracado = distanciaDoMeio <= 1 ? TRACADO_PROXIMO : distanciaDoMeio <= 2 ? TRACADO_DISTANTE : TRACADO_MUITO_DISTANTE;
    return { cor, tracado };
  }
  if (nome === "prioridade") {
    return { cor: RAMP_PRIORIDADE[indice % RAMP_PRIORIDADE.length], tracado: TRACADO_PROXIMO };
  }
  return { cor: CORES_TERMO[indice % CORES_TERMO.length], tracado: TRACADO_PROXIMO };
}

const LIMIAR_PIXELS = 12;
const MARGEM = 0.08;

// "distancia" tem sinal (Seção "vetor posição" em fuzzy.js): universo vai
// de -universoMax a +universoMax. As outras duas (lotacao, prioridade)
// continuam de 0 a universoMax, como sempre.
function calcularUniversoMin(nome, universoMax) {
  return nome === "distancia" ? -universoMax : 0;
}

export function construirGrafico(canvas, nome, universoMax, legendaEl = null) {
  const dpr = window.devicePixelRatio || 1;
  const cssLargura = canvas.clientWidth || 260;
  const cssAltura = canvas.clientHeight || 150;
  canvas.width = cssLargura * dpr;
  canvas.height = cssAltura * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const grafico = {
    canvas,
    ctx,
    nome,
    universoMax,
    universoMin: calcularUniversoMin(nome, universoMax),
    largura: cssLargura,
    altura: cssAltura,
    pontos: {},
    modoEdicao: false,
    arraste: null,
    marcadores: [],
    onEdicaoConfirmada: null,
    legendaEl,
  };

  canvas.addEventListener("mousedown", (ev) => aoPressionar(grafico, ev));
  canvas.addEventListener("mousemove", (ev) => aoMover(grafico, ev));
  window.addEventListener("mouseup", () => aoSoltar(grafico));
  canvas.addEventListener("touchstart", (ev) => aoPressionar(grafico, toMouseEvent(canvas, ev)), { passive: true });
  canvas.addEventListener("touchmove", (ev) => aoMover(grafico, toMouseEvent(canvas, ev)), { passive: true });
  canvas.addEventListener("touchend", () => aoSoltar(grafico));

  return grafico;
}

function toMouseEvent(canvas, touchEvent) {
  const t = touchEvent.touches[0] ?? touchEvent.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  return { offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top };
}

export function definirParametrosGrafico(grafico, pontosPorTermo) {
  grafico.pontos = {};
  for (const [termo, pontos] of Object.entries(pontosPorTermo)) grafico.pontos[termo] = [...pontos];
  atualizarLegenda(grafico);
  redesenhar(grafico);
}

/** Legenda HTML (fora do canvas) -- os nomes dos termos eram desenhados em
 * cima das curvas, mas colidiam entre si em gráficos estreitos/com muitos
 * termos (ex.: "prioridade", com 5). Uma legenda de verdade identifica cada
 * curva pela cor sem depender de caber texto dentro do gráfico. */
function cssDoTracado(tracado) {
  if (tracado === TRACADO_DISTANTE) return "dashed";
  if (tracado === TRACADO_MUITO_DISTANTE) return "dotted";
  return "solid";
}

function atualizarLegenda(grafico) {
  if (!grafico.legendaEl) return;
  grafico.legendaEl.innerHTML = "";
  const termos = Object.keys(grafico.pontos);
  termos.forEach((termo, indice) => {
    const { cor, tracado } = estiloDoTermo(grafico.nome, indice, termos.length);
    const item = document.createElement("span");
    item.className = "legenda-item";
    const marcador = document.createElement("span");
    marcador.className = "legenda-cor";
    // Traçado (sólido/tracejado/pontilhado) também aparece na legenda, não só
    // na curva -- é um canal de identidade de verdade em "distancia" (7
    // termos, mais do que a paleta categórica aguenta sem repetir cor),
    // então precisa dar pra reconhecer o termo pela legenda sozinha.
    marcador.style.borderBottom = `2px ${cssDoTracado(tracado)} ${cor}`;
    marcador.style.backgroundColor = "transparent";
    item.appendChild(marcador);
    item.appendChild(document.createTextNode(termo.replace("_", " ")));
    grafico.legendaEl.appendChild(item);
  });
}

/** Muda a escala do eixo x (usado só por "distancia", quando o número de
 * andares do prédio é reconfigurado -- ver "Configurar prédio" em main.js). */
export function definirUniversoMaximo(grafico, novoMaximo) {
  grafico.universoMax = novoMaximo;
  grafico.universoMin = calcularUniversoMin(grafico.nome, novoMaximo);
  redesenhar(grafico);
}

export function definirModoEdicao(grafico, ativo) {
  grafico.modoEdicao = ativo;
  grafico.canvas.classList.toggle("editavel", ativo);
}

export function definirMarcadores(grafico, marcadores) {
  grafico.marcadores = marcadores;
  redesenhar(grafico);
}

// ---- coordenadas ---------------------------------------------------------

function xParaPixel(grafico, x) {
  const amplitude = grafico.universoMax - grafico.universoMin;
  const min = grafico.universoMin - amplitude * MARGEM;
  const max = grafico.universoMax + amplitude * MARGEM;
  return ((x - min) / (max - min)) * grafico.largura;
}

function pixelParaX(grafico, px) {
  const amplitude = grafico.universoMax - grafico.universoMin;
  const min = grafico.universoMin - amplitude * MARGEM;
  const max = grafico.universoMax + amplitude * MARGEM;
  return min + (px / grafico.largura) * (max - min);
}

const MARGEM_SUPERIOR_Y = 10;
const MARGEM_INFERIOR_Y = 22; // espaço pros números do eixo x, abaixo da linha de base

function yParaPixel(grafico, y) {
  return grafico.altura - MARGEM_INFERIOR_Y - y * (grafico.altura - MARGEM_SUPERIOR_Y - MARGEM_INFERIOR_Y);
}

/** Valores "redondos" pro eixo x (0, passo, 2*passo, ..., até `max` -- e,
 * quando `min` é negativo, espelhado pro lado negativo também, sempre
 * incluindo o 0), adaptado ao tamanho do universo -- mesma lógica de
 * qualquer biblioteca de gráficos (escolhe o menor passo de {1,2,5,10}×10^n
 * que não passe de ~5 marcações pro lado positivo). */
function gerarTicks(max, min = 0, alvoTicks = 5) {
  if (max <= 0 && min >= 0) return [0];
  const bruto = Math.max(max, -min) / alvoTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normalizado = bruto / magnitude;
  const passo = (normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10) * magnitude;

  const ticksPositivos = [];
  for (let v = 0; v <= max + 1e-9; v += passo) ticksPositivos.push(Math.round(v * 100) / 100);
  if (ticksPositivos[ticksPositivos.length - 1] < max - 1e-9) ticksPositivos.push(Math.round(max * 100) / 100);

  if (min >= 0) return ticksPositivos;

  const ticksNegativos = [];
  for (let v = -passo; v >= min - 1e-9; v -= passo) ticksNegativos.push(Math.round(v * 100) / 100);
  if (ticksNegativos[ticksNegativos.length - 1] > min + 1e-9) ticksNegativos.push(Math.round(min * 100) / 100);
  return [...ticksNegativos.reverse(), ...ticksPositivos];
}

// ---- desenho ---------------------------------------------------------

/** Texto com um pequeno fundo atrás (cor do canvas) -- sem isso, os números
 * do eixo y ficam ilegíveis sempre que uma curva passa exatamente por cima
 * (ex.: "proxima" já nasce em pertinência 1 lá no canto, bem onde o rótulo
 * "1" fica). Evita precisar reservar uma margem só pra eles. */
function desenharRotuloComFundo(ctx, texto, x, y, alinhamento) {
  const largura = ctx.measureText(texto).width;
  const x0 = alinhamento === "left" ? x - 1 : x - largura - 1;
  ctx.fillStyle = "#1c1c1e";
  ctx.fillRect(x0, y - 8, largura + 2, 10);
  ctx.fillStyle = "#7d8590";
  ctx.textAlign = alinhamento;
  ctx.fillText(texto, x, y);
}

function redesenhar(grafico) {
  const { ctx, largura, altura } = grafico;
  ctx.clearRect(0, 0, largura, altura);

  const yBase = yParaPixel(grafico, 0);
  const yTopo = yParaPixel(grafico, 1);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yBase);
  ctx.lineTo(largura, yBase);
  ctx.stroke();

  ctx.font = "9px system-ui, sans-serif";

  // eixo y: só as pontas (0 e 1, sempre grau de pertinência) -- com fundo,
  // não com margem reservada, pra nunca ficar cortado nem por baixo de nada.
  desenharRotuloComFundo(ctx, "1", 2, yTopo + 3, "left");
  desenharRotuloComFundo(ctx, "0", 2, yBase + 3, "left");

  // eixo x: marcações + valores (a unidade -- pavimentos, %, pontos -- já
  // está no título acima do gráfico, então aqui só o número, exceto em
  // "lotacao" onde o "%" ajuda a não confundir com as outras duas escalas).
  const sufixo = grafico.nome === "lotacao" ? "%" : "";
  ctx.strokeStyle = "#475569";
  ctx.fillStyle = "#7d8590";
  ctx.textAlign = "center";
  for (const valor of gerarTicks(grafico.universoMax, grafico.universoMin)) {
    const px = xParaPixel(grafico, valor);
    ctx.beginPath();
    ctx.moveTo(px, yBase);
    ctx.lineTo(px, yBase + 4);
    ctx.stroke();
    ctx.fillText(`${valor}${sufixo}`, px, yBase + 14);
  }

  const nomes = Object.keys(grafico.pontos);
  nomes.forEach((termo, indice) => {
    const pontos = grafico.pontos[termo];
    const { cor, tracado } = estiloDoTermo(grafico.nome, indice, nomes.length);
    const ys = [0, 1, 1, 0];

    ctx.strokeStyle = cor;
    ctx.fillStyle = cor;
    ctx.lineWidth = 2;
    ctx.setLineDash(tracado);
    ctx.beginPath();
    pontos.forEach((x, i) => {
      const px = xParaPixel(grafico, x);
      const py = yParaPixel(grafico, ys[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    pontos.forEach((x, i) => {
      const px = xParaPixel(grafico, x);
      const py = yParaPixel(grafico, ys[i]);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  for (const marcador of grafico.marcadores) {
    const px = xParaPixel(grafico, marcador.valor);
    ctx.strokeStyle = marcador.cor ?? "crimson";
    ctx.setLineDash(marcador.tracado ?? [4, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, altura);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, largura - 1, altura - 1);
}

// ---- edição (arrastar vértices) ---------------------------------------

/** Quanto de espaço o ponto `indice` do termo tem pra se mover (distância
 * até os vizinhos imediatos, incluindo os limites do universo nas pontas). */
function liberdadeDoVertice(grafico, termo, indice) {
  const pontos = grafico.pontos[termo];
  const limiteInferior = indice > 0 ? pontos[indice - 1] : grafico.universoMin;
  const limiteSuperior = indice < 3 ? pontos[indice + 1] : grafico.universoMax;
  return limiteSuperior - limiteInferior;
}

function encontrarVerticeProximo(grafico, offsetX, offsetY) {
  const ys = [0, 1, 1, 0];
  const candidatos = [];
  for (const [termo, pontos] of Object.entries(grafico.pontos)) {
    pontos.forEach((x, indice) => {
      const px = xParaPixel(grafico, x);
      const py = yParaPixel(grafico, ys[indice]);
      const distancia = Math.hypot(px - offsetX, py - offsetY);
      if (distancia < LIMIAR_PIXELS) candidatos.push({ termo, indice, distancia });
    });
  }
  if (candidatos.length === 0) return null;

  // Termos "de canto" nascem com 2 ou 3 pontos empilhados no mesmo x (ex.:
  // [0,0,0,5.5] -- a, b e c todos em x=0). Quando o clique empata em
  // distância entre pontos sobrepostos, pegar sempre o primeiro (ex.: "b")
  // prende o arraste: o teto dele é "c", que está no MESMO lugar, então ele
  // nunca anda. Preferir o ponto empatado com mais espaço pra se mover
  // evita esse travamento.
  const menorDistancia = Math.min(...candidatos.map((c) => c.distancia));
  const empatados = candidatos.filter((c) => c.distancia <= menorDistancia + 1e-6);
  empatados.sort((a, b) => liberdadeDoVertice(grafico, b.termo, b.indice) - liberdadeDoVertice(grafico, a.termo, a.indice));
  const { termo, indice } = empatados[0];
  return { termo, indice };
}

function aoPressionar(grafico, ev) {
  if (!grafico.modoEdicao) return;
  grafico.arraste = encontrarVerticeProximo(grafico, ev.offsetX, ev.offsetY);
}

function aoMover(grafico, ev) {
  if (!grafico.arraste) return;
  const { termo, indice } = grafico.arraste;
  const pontos = grafico.pontos[termo];
  let valor = pixelParaX(grafico, ev.offsetX);
  valor = Math.max(grafico.universoMin, Math.min(grafico.universoMax, valor));
  valor = Math.round(valor); // edição discreta -- encaixa no inteiro mais próximo, não contínuo
  const limiteInferior = indice > 0 ? pontos[indice - 1] : grafico.universoMin;
  const limiteSuperior = indice < 3 ? pontos[indice + 1] : grafico.universoMax;
  valor = Math.max(limiteInferior, Math.min(valor, limiteSuperior));
  pontos[indice] = valor;
  redesenhar(grafico);
}

function aoSoltar(grafico) {
  if (!grafico.arraste) return;
  grafico.arraste = null;
  if (grafico.onEdicaoConfirmada) grafico.onEdicaoConfirmada(grafico.nome, grafico.pontos);
}
