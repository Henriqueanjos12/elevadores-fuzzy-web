// Painel do prédio: lista de pavimentos com botões de chamada + poços dos
// elevadores animados num <canvas>. Porta de interface/painel_edificio.py.

import { chamadaEstaAtiva, direcoesValidas } from "./models.js";
import { simboloDirecao } from "./simulador.js";

const ALTURA_LINHA = 34;
export const LARGURA_POCO = 64;
export const LARGURA_ROTULO = 22;
const FATOR_SUAVIZACAO = 0.35;
const FATOR_SUAVIZACAO_PORTA = 0.5;
const FRACAO_ABERTURA = 0.8;
const COR_ELEVADOR = { 1: "#3b82f6", 2: "#22c55e", 3: "#f59e0b" };
const COR_CHAMADA_ATIVA = "#dc2626";
const ESTADOS_PORTA_ABERTA = new Set(["PORTA_ABRINDO", "PORTA_ABERTA"]);

function nomePavimento(codigo) {
  return codigo === 0 ? "Térreo" : `${codigo}º andar`;
}

function abreviacao(codigo) {
  return codigo === 0 ? "T" : String(codigo);
}

export function construirPainelEdificio(containerBotoes, containerCanvas, elevadores, onChamada, andarMaximo) {
  containerBotoes.innerHTML = "";
  const codigos = Array.from({ length: andarMaximo + 1 }, (_, i) => andarMaximo - i);

  const botoes = new Map(); // "pavimento:direcao" -> elemento
  for (const codigo of codigos) {
    const linha = document.createElement("div");
    linha.className = "linha-pavimento";
    linha.style.height = `${ALTURA_LINHA}px`;

    const rotulo = document.createElement("span");
    rotulo.className = "rotulo-pavimento";
    rotulo.textContent = abreviacao(codigo);
    linha.appendChild(rotulo);

    const nome = document.createElement("span");
    nome.className = "nome-pavimento";
    nome.textContent = nomePavimento(codigo);
    linha.appendChild(nome);

    for (const direcao of ["SUBINDO", "DESCENDO"]) {
      if (!direcoesValidas(codigo, andarMaximo).includes(direcao)) {
        const espaco = document.createElement("span");
        espaco.className = "botao-chamada botao-vazio";
        linha.appendChild(espaco);
        continue;
      }
      const botao = document.createElement("button");
      botao.className = "botao-chamada";
      botao.textContent = direcao === "SUBINDO" ? "▲" : "▼";
      botao.title = direcao === "SUBINDO" ? "Chamar (subir)" : "Chamar (descer)";
      botao.addEventListener("click", () => onChamada(codigo, direcao));
      botoes.set(`${codigo}:${direcao}`, botao);
      linha.appendChild(botao);
    }
    containerBotoes.appendChild(linha);
  }

  const largura = LARGURA_ROTULO + LARGURA_POCO * elevadores.length;
  const altura = ALTURA_LINHA * codigos.length;
  containerCanvas.width = largura;
  containerCanvas.height = altura;
  const ctx = containerCanvas.getContext("2d");

  const painel = {
    ctx,
    codigos,
    botoes,
    elevadores,
    posicoesVisuais: new Map(elevadores.map((e) => [e.id, e.pavimentoAtual])),
    aberturasVisuais: new Map(elevadores.map((e) => [e.id, 0])),
    largura,
    altura,
  };
  desenharEstrutura(painel);
  return painel;
}

function indiceLinha(pavimento, maximo) {
  return maximo - pavimento;
}

function retanguloElevador(elevadorId, posicao, maximo) {
  const coluna = elevadorId - 1;
  const x0 = LARGURA_ROTULO + coluna * LARGURA_POCO + 4;
  const x1 = x0 + LARGURA_POCO - 8;
  const linha = indiceLinha(posicao, maximo);
  const y0 = linha * ALTURA_LINHA + 3;
  const y1 = y0 + ALTURA_LINHA - 6;
  return [x0, y0, x1, y1];
}

function retanguloPorta(x0, y0, x1, y1, abertura) {
  const largura = (x1 - x0) * FRACAO_ABERTURA * abertura;
  const centroX = (x0 + x1) / 2;
  return [centroX - largura / 2, y0 + 3, centroX + largura / 2, y1 - 3];
}

function desenharEstrutura(painel) {
  const { ctx, codigos, largura, altura, elevadores } = painel;
  ctx.clearRect(0, 0, largura, altura);
  ctx.strokeStyle = "#475569";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "9px Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= codigos.length; i += 1) {
    const y = i * ALTURA_LINHA;
    ctx.beginPath();
    ctx.moveTo(LARGURA_ROTULO, y);
    ctx.lineTo(largura, y);
    ctx.stroke();
  }
  for (let i = 0; i <= elevadores.length; i += 1) {
    const x = LARGURA_ROTULO + i * LARGURA_POCO;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, altura);
    ctx.stroke();
  }
  codigos.forEach((codigo, linha) => {
    ctx.fillText(abreviacao(codigo), LARGURA_ROTULO / 2, (linha + 0.5) * ALTURA_LINHA);
  });
}

export function animarEdificio(painel, sim) {
  const { ctx, codigos, largura, altura } = painel;
  const maximo = Math.max(...codigos);
  desenharEstrutura(painel);

  for (const elevador of sim.elevadores) {
    const alvo = elevador.pavimentoAtual;
    const atual = painel.posicoesVisuais.get(elevador.id) ?? alvo;
    let nova = atual + (alvo - atual) * FATOR_SUAVIZACAO;
    if (Math.abs(nova - alvo) < 0.02) nova = alvo;
    painel.posicoesVisuais.set(elevador.id, nova);

    const chegouVisualmente = nova === alvo;
    const alvoAbertura = ESTADOS_PORTA_ABERTA.has(elevador.estado) && chegouVisualmente ? 1 : 0;
    const aberturaAtual = painel.aberturasVisuais.get(elevador.id) ?? alvoAbertura;
    let novaAbertura = aberturaAtual + (alvoAbertura - aberturaAtual) * FATOR_SUAVIZACAO_PORTA;
    if (Math.abs(novaAbertura - alvoAbertura) < 0.02) novaAbertura = alvoAbertura;
    painel.aberturasVisuais.set(elevador.id, novaAbertura);

    const [x0, y0, x1, y1] = retanguloElevador(elevador.id, nova, maximo);
    ctx.fillStyle = elevador.estado === "FORA_DE_SERVICO" ? "#4b5563" : COR_ELEVADOR[elevador.id];
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    const [px0, py0, px1, py1] = retanguloPorta(x0, y0, x1, y1, novaAbertura);
    ctx.fillStyle = "#111827";
    ctx.fillRect(px0, py0, px1 - px0, py1 - py0);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`E${elevador.id}`, (x0 + x1) / 2, y1 - 8);
  }
}

export function atualizarEstadoEdificio(painel, sim, indicadores) {
  for (const elevador of sim.elevadores) {
    const el = indicadores.get(elevador.id);
    if (!el) continue;
    if (elevador.estado === "FORA_DE_SERVICO") {
      el.textContent = "X  --";
      el.style.color = "#6b7280";
      continue;
    }
    el.textContent = `${abreviacao(elevador.pavimentoAtual).padStart(2)}  ${simboloDirecao(elevador.direcao)}`;
    el.style.color = COR_ELEVADOR[elevador.id];
  }

  const chamadasAtivas = new Set();
  for (const chamada of sim.chamadas.values()) {
    if (chamadaEstaAtiva(chamada)) chamadasAtivas.add(`${chamada.pavimento}:${chamada.direcao}`);
  }
  for (const [chave, botao] of painel.botoes.entries()) {
    botao.classList.toggle("ativa", chamadasAtivas.has(chave));
  }
}
