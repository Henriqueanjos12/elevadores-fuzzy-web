// Orquestração da página: monta os painéis e comanda o laço de simulação
// via setTimeout/requestAnimationFrame -- porta de interface/janela_principal.py.

import { PARAMETROS_PADRAO, clonarParametros, criarControladorFuzzy } from "./fuzzy.js";
import { calcularVagasDisponiveis, PAVIMENTO_ULTIMO_ANDAR } from "./models.js";
import {
  ativarGeracaoAutomatica,
  avancarUmCiclo,
  chamadaAguardandoEmbarque,
  confirmarPassageirosChamada,
  criarSimulacao,
  desativarGeracaoAutomatica,
  executarCiclo,
  limparEventos,
  reiniciarSimulacao,
  simboloDirecao,
  solicitarChamadaExternaSimples,
} from "./simulador.js";
import { gerarChamadaAleatoria } from "./gerador.js";
import { animarEdificio, atualizarEstadoEdificio, construirPainelEdificio } from "./building.js";
import { construirGrafico, definirMarcadores, definirModoEdicao, definirParametrosGrafico } from "./charts.js";

const INTERVALO_ANIMACAO_MS = 40;
const intervaloPorVelocidade = (v) => 2200 - (v - 1) * 220;

const sim = criarSimulacao(null, "fuzzy");
let intervaloCicloMs = intervaloPorVelocidade(5);
let idAfterCiclo = null;

// ---- prédio ---------------------------------------------------------

const containerBotoes = document.getElementById("botoes-pavimentos");
const canvasPredio = document.getElementById("canvas-predio");
const indicadoresTopo = new Map();

const indicadoresContainer = document.getElementById("indicadores-topo");
for (const elevador of sim.elevadores) {
  const span = document.createElement("span");
  span.textContent = "-- --";
  span.style.color = { 1: "#3b82f6", 2: "#22c55e", 3: "#f59e0b" }[elevador.id];
  indicadoresContainer.appendChild(span);
  indicadoresTopo.set(elevador.id, span);
}

const painelPredio = construirPainelEdificio(containerBotoes, canvasPredio, sim.elevadores, (pavimento, direcao) => {
  solicitarChamadaExternaSimples(sim, pavimento, direcao);
  atualizarPosCiclo();
});

function loopAnimacao() {
  animarEdificio(painelPredio, sim);
  requestAnimationFrame(loopAnimacao);
}
requestAnimationFrame(loopAnimacao);

// ---- gráficos fuzzy ---------------------------------------------------------

const graficos = {
  distancia: construirGrafico(document.getElementById("grafico-distancia"), "distancia", 11),
  lotacao: construirGrafico(document.getElementById("grafico-lotacao"), "lotacao", 100),
  prioridade: construirGrafico(document.getElementById("grafico-prioridade"), "prioridade", 100),
};

function definirControladorNosGraficos(controlador) {
  for (const [nome, grafico] of Object.entries(graficos)) definirParametrosGrafico(grafico, controlador.parametros[nome]);
}
definirControladorNosGraficos(sim.controladorFuzzy);

let modoEdicao = false;
const botaoEditar = document.getElementById("btn-editar-pertinencias");
botaoEditar.addEventListener("click", () => {
  modoEdicao = !modoEdicao;
  for (const grafico of Object.values(graficos)) definirModoEdicao(grafico, modoEdicao);
  botaoEditar.textContent = modoEdicao ? "🖊 Editando (clique p/ parar)" : "🖊 Editar pertinências";
  botaoEditar.classList.toggle("editando", modoEdicao);
});

document.getElementById("btn-restaurar-padrao").addEventListener("click", () => {
  sim.controladorFuzzy = criarControladorFuzzy(clonarParametros(PARAMETROS_PADRAO));
  definirControladorNosGraficos(sim.controladorFuzzy);
});

function aoEditarParametros(nomeVariavel, pontosEditados) {
  const novosParametros = clonarParametros(sim.controladorFuzzy.parametros);
  novosParametros[nomeVariavel] = pontosEditados;
  sim.controladorFuzzy = criarControladorFuzzy(novosParametros);
  definirControladorNosGraficos(sim.controladorFuzzy);
}
for (const grafico of Object.values(graficos)) grafico.onEdicaoConfirmada = aoEditarParametros;

// ---- tabela de decisão ---------------------------------------------------------

const textoChamadaAtual = document.getElementById("texto-chamada-atual");
const corpoTabela = document.querySelector("#tabela-decisao tbody");
const regrasAtivadasEl = document.getElementById("regras-ativadas");

function atualizarPainelDecisao() {
  const avaliacoes = sim.ultimaAvaliacao;
  if (!avaliacoes || avaliacoes.length === 0) return;

  const ultima = sim.ultimaChamadaAvaliada;
  if (ultima) textoChamadaAtual.textContent = `Chamada: pavimento ${ultima.pavimento} ${simboloDirecao(ultima.direcao)}`;

  corpoTabela.innerHTML = "";
  for (const a of avaliacoes) {
    const tr = document.createElement("tr");
    if (a.escolhido) tr.className = "escolhido";
    else if (a.descartado) tr.className = "descartado";
    tr.innerHTML = `<td>E${a.elevadorId}</td><td>${a.pavimentoAtual}</td><td>${simboloDirecao(a.direcao)}</td>` +
      `<td>${a.distancia.toFixed(0)}</td><td>${a.lotacao.toFixed(0)}%</td><td>${a.cargaKg.toFixed(0)} kg</td><td>${a.prioridade.toFixed(1)}</td>`;
    corpoTabela.appendChild(tr);
  }

  const escolhido = avaliacoes.find((a) => a.escolhido);
  if (escolhido) {
    regrasAtivadasEl.textContent = escolhido.termosAtivos.length
      ? `Termos ativados (elevador escolhido): ${escolhido.termosAtivos.join(", ")}`
      : "Nenhum termo relevante ativado.";
    definirMarcadores(graficos.distancia, [{ valor: escolhido.distancia, cor: "crimson" }]);
    definirMarcadores(graficos.lotacao, [{ valor: escolhido.lotacao, cor: "crimson" }]);
    definirMarcadores(graficos.prioridade, [{ valor: escolhido.prioridade, cor: "crimson" }]);
  }
}

// ---- eventos ---------------------------------------------------------

const listaEventos = document.getElementById("lista-eventos");
let ultimaQuantidadeEventos = 0;
function atualizarEventos() {
  const novos = sim.eventos.slice(ultimaQuantidadeEventos);
  if (novos.length === 0) return;
  for (const evento of novos) {
    const div = document.createElement("div");
    div.textContent = `[${String(evento.ciclo).padStart(4, "0")}] ${evento.tipo}: ${evento.descricao}`;
    listaEventos.appendChild(div);
  }
  listaEventos.scrollTop = listaEventos.scrollHeight;
  ultimaQuantidadeEventos = sim.eventos.length;
}
document.getElementById("btn-limpar-eventos").addEventListener("click", () => {
  limparEventos(sim);
  listaEventos.innerHTML = "";
  ultimaQuantidadeEventos = 0;
});

// ---- laço de simulação ---------------------------------------------------------

function atualizarPosCiclo() {
  atualizarEstadoEdificio(painelPredio, sim, indicadoresTopo);
  atualizarEventos();
  atualizarPainelDecisao();
  resolverEmbarquesPendentes();
}

function agendarCiclo() {
  if (sim.pausado) {
    idAfterCiclo = null;
    return;
  }
  executarCiclo(sim);
  atualizarPosCiclo();
  idAfterCiclo = setTimeout(agendarCiclo, intervaloCicloMs);
}

function iniciar() {
  sim.pausado = false;
  if (idAfterCiclo === null) agendarCiclo();
}

document.getElementById("btn-iniciar").addEventListener("click", iniciar);
document.getElementById("btn-pausar").addEventListener("click", () => {
  sim.pausado = true;
});
document.getElementById("btn-passo").addEventListener("click", () => {
  avancarUmCiclo(sim);
  atualizarPosCiclo();
});
document.getElementById("btn-reiniciar").addEventListener("click", () => {
  const texto = document.getElementById("input-semente").value.trim();
  const semente = /^-?\d+$/.test(texto) ? parseInt(texto, 10) : null;
  reiniciarSimulacao(sim, semente);
  listaEventos.innerHTML = "";
  ultimaQuantidadeEventos = 0;
  atualizarPosCiclo();
});
document.getElementById("select-algoritmo").addEventListener("change", (ev) => {
  sim.algoritmo = ev.target.value;
});
document.getElementById("input-velocidade").addEventListener("input", (ev) => {
  intervaloCicloMs = intervaloPorVelocidade(Number(ev.target.value));
});
document.getElementById("btn-chamada-aleatoria").addEventListener("click", () => {
  const chamada = gerarChamadaAleatoria(sim.gerador, sim.cicloAtual);
  sim.chamadas.set(chamada.id, chamada);
  atualizarPosCiclo();
});
document.getElementById("check-automatico").addEventListener("change", (ev) => {
  if (ev.target.checked) ativarGeracaoAutomatica(sim, sim.intervaloAutomatico);
  else desativarGeracaoAutomatica(sim);
});
document.getElementById("input-intervalo").addEventListener("input", (ev) => {
  sim.intervaloAutomatico = Math.max(1, Number(ev.target.value));
});

// ---- modal "painel interno" (embarque em duas fases) ---------------------

const modal = document.getElementById("modal-embarque");
const modalTitulo = document.getElementById("modal-titulo");
const modalGrade = document.getElementById("modal-grade-andares");
const modalContagem = document.getElementById("modal-contagem");
const modalAviso = document.getElementById("modal-aviso");

function resolverEmbarquesPendentes() {
  const pendencia = chamadaAguardandoEmbarque(sim);
  if (!pendencia) return;
  const { elevador, chamada } = pendencia;
  const estavaRodando = !sim.pausado;
  sim.pausado = true;

  abrirModalEmbarque(elevador, chamada, (destinos, andaresExtras) => {
    confirmarPassageirosChamada(sim, chamada, destinos, andaresExtras);
    atualizarPosCiclo();
    if (estavaRodando) iniciar();
  });
}

function abrirModalEmbarque(elevador, chamada, aoConfirmar) {
  modalTitulo.textContent = `Elevador ${elevador.id} chegou — quem vai embarcar? (pavimento ${chamada.pavimento} ${simboloDirecao(chamada.direcao)})`;
  const vagas = calcularVagasDisponiveis(elevador);
  const opcoes = [];
  for (let codigo = 0; codigo <= PAVIMENTO_ULTIMO_ANDAR; codigo += 1) {
    if (chamada.direcao === "SUBINDO" ? codigo > chamada.pavimento : codigo < chamada.pavimento) opcoes.push(codigo);
  }

  const marcados = new Set();
  let totalPessoas = 0;

  modalGrade.innerHTML = "";
  const botoesPorAndar = new Map();
  for (const codigo of opcoes) {
    const botao = document.createElement("button");
    botao.textContent = codigo === 0 ? "Térreo" : `${codigo}º andar`;
    botao.addEventListener("click", () => {
      if (marcados.has(codigo)) marcados.delete(codigo);
      else marcados.add(codigo);
      botao.classList.toggle("marcado", marcados.has(codigo));
      modalAviso.textContent = "";
    });
    modalGrade.appendChild(botao);
    botoesPorAndar.set(codigo, botao);
  }

  function atualizarContagem() {
    const restantes = vagas - totalPessoas;
    modalContagem.textContent = restantes <= 0 ? `${totalPessoas} pessoa(s) embarcando — elevador lotado` : `${totalPessoas} pessoa(s) embarcando — ${restantes} vaga(s) livre(s)`;
  }
  atualizarContagem();
  modalAviso.textContent = "";

  document.getElementById("modal-btn-embarcar").onclick = () => {
    if (totalPessoas >= vagas) return;
    totalPessoas += 1;
    atualizarContagem();
  };
  document.getElementById("modal-btn-desembarcar").onclick = () => {
    totalPessoas = Math.max(0, totalPessoas - 1);
    atualizarContagem();
  };
  document.getElementById("modal-btn-limpar").onclick = () => {
    marcados.clear();
    for (const botao of botoesPorAndar.values()) botao.classList.remove("marcado");
    totalPessoas = 0;
    atualizarContagem();
    modalAviso.textContent = "";
  };
  document.getElementById("modal-btn-confirmar").onclick = () => {
    if (totalPessoas > 0 && marcados.size === 0) {
      modalAviso.textContent = "Marque pelo menos um andar antes de confirmar.";
      return;
    }
    const andaresMarcados = [...marcados].sort((a, b) => a - b);
    const destinos = andaresMarcados.length
      ? Array.from({ length: totalPessoas }, (_, i) => andaresMarcados[i % andaresMarcados.length])
      : [];
    const andaresExtras = andaresMarcados.filter((a) => !destinos.includes(a));
    modal.classList.add("oculto");
    aoConfirmar(destinos, andaresExtras);
  };

  modal.classList.remove("oculto");
}

// ---- estado inicial ---------------------------------------------------------

atualizarPosCiclo();
