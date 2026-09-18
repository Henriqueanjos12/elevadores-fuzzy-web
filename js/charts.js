// Gráficos de pertinência (distancia, lotacao, prioridade), com edição ao
// vivo (arrastar vértices). Porta simplificada de interface/painel_graficos.py.

import { trapmf } from "./fuzzy.js";

const CORES_TERMO = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"];
const LIMIAR_PIXELS = 12;
const MARGEM = 0.08;

export function construirGrafico(canvas, nome, universoMax) {
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
  const min = -grafico.universoMax * MARGEM;
  const max = grafico.universoMax * (1 + MARGEM);
  return ((x - min) / (max - min)) * grafico.largura;
}

function pixelParaX(grafico, px) {
  const min = -grafico.universoMax * MARGEM;
  const max = grafico.universoMax * (1 + MARGEM);
  return min + (px / grafico.largura) * (max - min);
}

function yParaPixel(grafico, y) {
  const margemY = 14;
  return grafico.altura - margemY - y * (grafico.altura - 2 * margemY);
}

// ---- desenho ---------------------------------------------------------

function redesenhar(grafico) {
  const { ctx, largura, altura } = grafico;
  ctx.clearRect(0, 0, largura, altura);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yParaPixel(grafico, 0));
  ctx.lineTo(largura, yParaPixel(grafico, 0));
  ctx.stroke();

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

    const b = pontos[1];
    const c = pontos[2];
    const rotulo = termo.replace("_", " ");
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    const meiaLargura = ctx.measureText(rotulo).width / 2;
    const px = Math.max(meiaLargura + 2, Math.min(xParaPixel(grafico, (b + c) / 2), largura - meiaLargura - 2));
    ctx.fillText(rotulo, px, yParaPixel(grafico, 0.5) - 6);
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

function encontrarVerticeProximo(grafico, offsetX, offsetY) {
  const ys = [0, 1, 1, 0];
  let melhor = null;
  let menorDistancia = Infinity;
  for (const [termo, pontos] of Object.entries(grafico.pontos)) {
    pontos.forEach((x, indice) => {
      const px = xParaPixel(grafico, x);
      const py = yParaPixel(grafico, ys[indice]);
      const distancia = Math.hypot(px - offsetX, py - offsetY);
      if (distancia < LIMIAR_PIXELS && distancia < menorDistancia) {
        menorDistancia = distancia;
        melhor = { termo, indice };
      }
    });
  }
  return melhor;
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
