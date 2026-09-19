// Gráficos de pertinência (distancia, lotacao, prioridade), com edição ao
// vivo (arrastar vértices). Porta simplificada de interface/painel_graficos.py.

import { trapmf } from "./fuzzy.js";

// Paleta categórica validada (CVD-safe) da skill de dataviz -- passos de
// modo escuro dos slots 1-5 (azul, laranja, água-marinha, amarelo, magenta),
// na mesma ordem em que foram validados (a ordem É o mecanismo de segurança
// pra daltonismo, não é só estética -- não reordenar).
const CORES_TERMO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
const LIMIAR_PIXELS = 12;
const MARGEM = 0.08;

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
function atualizarLegenda(grafico) {
  if (!grafico.legendaEl) return;
  grafico.legendaEl.innerHTML = "";
  Object.keys(grafico.pontos).forEach((termo, indice) => {
    const item = document.createElement("span");
    item.className = "legenda-item";
    const marcador = document.createElement("span");
    marcador.className = "legenda-cor";
    marcador.style.backgroundColor = CORES_TERMO[indice % CORES_TERMO.length];
    item.appendChild(marcador);
    item.appendChild(document.createTextNode(termo.replace("_", " ")));
    grafico.legendaEl.appendChild(item);
  });
}

/** Muda a escala do eixo x (usado só por "distancia", quando o número de
 * andares do prédio é reconfigurado -- ver "Configurar prédio" em main.js). */
export function definirUniversoMaximo(grafico, novoMaximo) {
  grafico.universoMax = novoMaximo;
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

const MARGEM_ESQUERDA_X = 20; // espaço pros números "0"/"1" do eixo y, à esquerda das curvas

function xParaPixel(grafico, x) {
  const min = -grafico.universoMax * MARGEM;
  const max = grafico.universoMax * (1 + MARGEM);
  const areaUtil = grafico.largura - MARGEM_ESQUERDA_X;
  return MARGEM_ESQUERDA_X + ((x - min) / (max - min)) * areaUtil;
}

function pixelParaX(grafico, px) {
  const min = -grafico.universoMax * MARGEM;
  const max = grafico.universoMax * (1 + MARGEM);
  const areaUtil = grafico.largura - MARGEM_ESQUERDA_X;
  return min + ((px - MARGEM_ESQUERDA_X) / areaUtil) * (max - min);
}

const MARGEM_SUPERIOR_Y = 10;
const MARGEM_INFERIOR_Y = 22; // espaço pros números do eixo x, abaixo da linha de base

function yParaPixel(grafico, y) {
  return grafico.altura - MARGEM_INFERIOR_Y - y * (grafico.altura - MARGEM_SUPERIOR_Y - MARGEM_INFERIOR_Y);
}

/** Valores "redondos" pro eixo x (0, passo, 2*passo, ..., até `max`),
 * adaptado ao tamanho do universo -- mesma lógica de qualquer biblioteca de
 * gráficos (escolhe o menor passo de {1,2,5,10}×10^n que não passe de ~5
 * marcações). */
function gerarTicks(max, alvoTicks = 5) {
  if (max <= 0) return [0];
  const bruto = max / alvoTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normalizado = bruto / magnitude;
  const passo = (normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10) * magnitude;

  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += passo) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max - 1e-9) ticks.push(max);
  return ticks;
}

// ---- desenho ---------------------------------------------------------

function redesenhar(grafico) {
  const { ctx, largura, altura } = grafico;
  ctx.clearRect(0, 0, largura, altura);

  const yBase = yParaPixel(grafico, 0);
  const yTopo = yParaPixel(grafico, 1);

  // eixo y: linha vertical + as duas pontas (0 e 1, sempre grau de
  // pertinência) -- fica na margem reservada à esquerda, ANTES de onde as
  // curvas começam, pra nunca ficar por baixo delas.
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGEM_ESQUERDA_X, yTopo);
  ctx.lineTo(MARGEM_ESQUERDA_X, yBase);
  ctx.lineTo(largura, yBase);
  ctx.stroke();

  ctx.fillStyle = "#7d8590";
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("1", MARGEM_ESQUERDA_X - 5, yTopo + 3);
  ctx.fillText("0", MARGEM_ESQUERDA_X - 5, yBase + 3);

  // eixo x: marcações + valores (a unidade -- pavimentos, %, pontos -- já
  // está no título acima do gráfico, então aqui só o número, exceto em
  // "lotacao" onde o "%" ajuda a não confundir com as outras duas escalas).
  const sufixo = grafico.nome === "lotacao" ? "%" : "";
  ctx.strokeStyle = "#475569";
  ctx.textAlign = "center";
  for (const valor of gerarTicks(grafico.universoMax)) {
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
    const cor = CORES_TERMO[indice % CORES_TERMO.length];
    const ys = [0, 1, 1, 0];

    ctx.strokeStyle = cor;
    ctx.fillStyle = cor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pontos.forEach((x, i) => {
      const px = xParaPixel(grafico, x);
      const py = yParaPixel(grafico, ys[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

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
  const limiteInferior = indice > 0 ? pontos[indice - 1] : 0;
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
  valor = Math.max(0, Math.min(grafico.universoMax, valor));
  const limiteInferior = indice > 0 ? pontos[indice - 1] : 0;
  const limiteSuperior = indice < 3 ? pontos[indice + 1] : grafico.universoMax;
  valor = Math.max(limiteInferior, Math.min(valor, limiteSuperior));
  pontos[indice] = Math.round(valor * 100) / 100;
  redesenhar(grafico);
}

function aoSoltar(grafico) {
  if (!grafico.arraste) return;
  grafico.arraste = null;
  if (grafico.onEdicaoConfirmada) grafico.onEdicaoConfirmada(grafico.nome, grafico.pontos);
}
