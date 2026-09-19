// Orquestração da página: monta os painéis e comanda o laço de simulação
// via setTimeout/requestAnimationFrame -- porta de interface/janela_principal.py.

import { PARAMETROS_PADRAO, calcularPrioridade, clonarParametros, criarControladorFuzzy } from "./fuzzy.js";
import { PESO_MEDIO_KG, calcularLotacaoPercentual, calcularVagasDisponiveis, criarElevador } from "./models.js";
import {
  avancarUmCiclo,
  chamadaAguardandoEmbarque,
  confirmarPassageirosChamada,
  criarSimulacao,
  executarCiclo,
  limparEventos,
  reiniciarSimulacao,
  simboloDirecao,
  solicitarChamadaExternaSimples,
} from "./simulador.js";
import { animarEdificio, atualizarEstadoEdificio, construirPainelEdificio } from "./building.js";
import { construirGrafico, definirMarcadores, definirModoEdicao, definirParametrosGrafico, definirUniversoMaximo } from "./charts.js";

const INTERVALO_ANIMACAO_MS = 40;
const intervaloPorVelocidade = (v) => 2200 - (v - 1) * 220;

const sim = criarSimulacao("fuzzy");
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

function aoClicarChamada(pavimento, direcao) {
  solicitarChamadaExternaSimples(sim, pavimento, direcao);
  atualizarPosCiclo();
}

let painelPredio = construirPainelEdificio(containerBotoes, canvasPredio, sim.elevadores, aoClicarChamada, sim.andarMaximo);

const tituloPredio = document.getElementById("titulo-predio");
const tituloGraficoDistancia = document.getElementById("titulo-grafico-distancia");
function atualizarTituloPredio() {
  tituloPredio.textContent = `Prédio (${sim.andarMaximo + 1} pavimentos, ${sim.elevadores.length} elevadores, capacidade ${sim.capacidadePassageiros} pessoa(s)/elevador)`;
  tituloGraficoDistancia.textContent = `distância (0–${sim.andarMaximo} pavimentos)`;
}
atualizarTituloPredio();

function loopAnimacao() {
  animarEdificio(painelPredio, sim);
  requestAnimationFrame(loopAnimacao);
}
requestAnimationFrame(loopAnimacao);

// ---- gráficos fuzzy ---------------------------------------------------------

const graficos = {
  distancia: construirGrafico(document.getElementById("grafico-distancia"), "distancia", 11, document.getElementById("legenda-distancia")),
  lotacao: construirGrafico(document.getElementById("grafico-lotacao"), "lotacao", 100, document.getElementById("legenda-lotacao")),
  prioridade: construirGrafico(document.getElementById("grafico-prioridade"), "prioridade", 100, document.getElementById("legenda-prioridade")),
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
  reiniciarSimulacao(sim);
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
// ---- configurar prédio (andares / capacidade) ---------------------------

document.getElementById("btn-configurar-predio").addEventListener("click", reconfigurarPredio);

function reconfigurarPredio() {
  const status = document.getElementById("status-config-predio");
  const andares = parseInt(document.getElementById("input-andares").value, 10);
  const capacidade = parseInt(document.getElementById("input-capacidade").value, 10);

  if (!Number.isInteger(andares) || !Number.isInteger(capacidade)) {
    status.textContent = "Use números inteiros.";
    status.style.color = "var(--vermelho)";
    return;
  }
  if (andares < 2) {
    status.textContent = "Mínimo 2 andares (térreo + 1).";
    status.style.color = "var(--vermelho)";
    return;
  }
  if (capacidade < 1) {
    status.textContent = "Capacidade mínima é 1 pessoa.";
    status.style.color = "var(--vermelho)";
    return;
  }

  sim.pausado = true;
  if (idAfterCiclo !== null) {
    clearTimeout(idAfterCiclo);
    idAfterCiclo = null;
  }

  // Preserva edições feitas em "lotacao"/"prioridade" (não dependem do
  // número de andares), mas reseta "distancia" ao padrão -- os pontos
  // dela foram desenhados/editados numa escala (0 a andarMaximo ANTIGO)
  // que não faz mais sentido depois de mudar a quantidade de andares.
  const parametrosPreservados = clonarParametros(sim.controladorFuzzy.parametros);
  parametrosPreservados.distancia = clonarParametros(PARAMETROS_PADRAO).distancia;

  const novoAndarMaximo = andares - 1;
  reiniciarSimulacao(sim, {
    andarMaximo: novoAndarMaximo,
    capacidadePassageiros: capacidade,
    parametros: parametrosPreservados,
  });

  painelPredio = construirPainelEdificio(containerBotoes, canvasPredio, sim.elevadores, aoClicarChamada, sim.andarMaximo);
  atualizarTituloPredio();

  definirUniversoMaximo(graficos.distancia, sim.andarMaximo);
  definirControladorNosGraficos(sim.controladorFuzzy);
  reconstruirCalculadoraTeste();

  listaEventos.innerHTML = "";
  ultimaQuantidadeEventos = 0;
  corpoTabela.innerHTML = "";
  textoChamadaAtual.textContent = "Nenhuma chamada avaliada ainda.";
  regrasAtivadasEl.textContent = "";
  corpoResultadoTeste.innerHTML = "";
  definirMarcadores(graficos.distancia, []);
  definirMarcadores(graficos.lotacao, []);
  definirMarcadores(graficos.prioridade, []);

  status.textContent = `Aplicado: ${andares} andares (0 a ${novoAndarMaximo}), capacidade ${capacidade} pessoa(s)/elevador.`;
  status.style.color = "var(--texto-fraco)";

  atualizarPosCiclo();
}

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
  for (let codigo = 0; codigo <= sim.andarMaximo; codigo += 1) {
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

// ---- calculadora de aptidão (aba "Teste" do app original) -------------------

const CORES_ELEVADOR_TESTE = { 1: "#3b82f6", 2: "#22c55e", 3: "#f59e0b" };
const CONDICOES_TESTE = ["Parado", "Subindo", "Descendo"];

function nomeAndarTeste(codigo) {
  return codigo === 0 ? "Térreo" : `${codigo}º andar`;
}

function preencherSelectAndares(select, andarMaximo, valorPreferido) {
  const anterior = valorPreferido ?? (Number(select.value) || 0);
  select.innerHTML = "";
  for (let codigo = 0; codigo <= andarMaximo; codigo += 1) {
    const opt = document.createElement("option");
    opt.value = String(codigo);
    opt.textContent = nomeAndarTeste(codigo);
    select.appendChild(opt);
  }
  select.value = String(Math.min(anterior, andarMaximo));
}

function preencherSelectCarga(select, capacidadeMaxima) {
  const anterior = Number(select.value) || 0;
  select.innerHTML = "";
  for (let v = 0; v <= capacidadeMaxima; v += 1) {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = String(v);
    select.appendChild(opt);
  }
  select.value = String(Math.min(anterior, capacidadeMaxima));
}

const selectAndarChamadaTeste = document.getElementById("select-andar-chamada-teste");
const corpoConfigTeste = document.getElementById("corpo-config-teste");
const linhasConfigTeste = [];

function criarLinhasConfigTeste() {
  corpoConfigTeste.innerHTML = "";
  linhasConfigTeste.length = 0;
  for (let id = 1; id <= 3; id += 1) {
    const tr = document.createElement("tr");

    const tdNome = document.createElement("td");
    tdNome.textContent = `E${id}`;
    tdNome.style.color = CORES_ELEVADOR_TESTE[id];
    tdNome.style.fontWeight = "bold";
    tr.appendChild(tdNome);

    const tdPosicao = document.createElement("td");
    const selPosicao = document.createElement("select");
    tdPosicao.appendChild(selPosicao);
    tr.appendChild(tdPosicao);

    const tdCarga = document.createElement("td");
    const selCarga = document.createElement("select");
    tdCarga.appendChild(selCarga);
    tr.appendChild(tdCarga);

    const tdCondicao = document.createElement("td");
    const selCondicao = document.createElement("select");
    for (const condicao of CONDICOES_TESTE) {
      const opt = document.createElement("option");
      opt.value = condicao;
      opt.textContent = condicao;
      selCondicao.appendChild(opt);
    }
    tdCondicao.appendChild(selCondicao);
    tr.appendChild(tdCondicao);

    const tdServico = document.createElement("td");
    const checkServico = document.createElement("input");
    checkServico.type = "checkbox";
    checkServico.checked = true;
    tdServico.appendChild(checkServico);
    tr.appendChild(tdServico);

    corpoConfigTeste.appendChild(tr);
    linhasConfigTeste.push({ id, selPosicao, selCarga, selCondicao, checkServico });
  }
}

/** (Re)popula as opções de andar/carga da calculadora com o `andarMaximo` e
 * `capacidadePassageiros` ATUAIS do prédio -- chamada na inicialização e
 * de novo sempre que "🏗 Configurar prédio" muda essa configuração. */
function reconstruirCalculadoraTeste() {
  preencherSelectAndares(selectAndarChamadaTeste, sim.andarMaximo, sim.andarMaximo);
  for (const linha of linhasConfigTeste) {
    preencherSelectAndares(linha.selPosicao, sim.andarMaximo);
    preencherSelectCarga(linha.selCarga, sim.capacidadePassageiros);
  }
}

criarLinhasConfigTeste();
reconstruirCalculadoraTeste();

const DIRECAO_POR_CONDICAO_TESTE = { Parado: "PARADO", Subindo: "SUBINDO", Descendo: "DESCENDO" };

function montarElevadorTeste(id, pavimento, pessoas, condicao, emServico) {
  const elevador = criarElevador(id, pavimento, sim.capacidadePassageiros);
  for (let i = 0; i < pessoas; i += 1) {
    elevador.passageiros.push({ pesoKg: PESO_MEDIO_KG });
  }
  if (emServico) {
    elevador.direcao = DIRECAO_POR_CONDICAO_TESTE[condicao];
    elevador.estado = DIRECAO_POR_CONDICAO_TESTE[condicao];
  } else {
    elevador.direcao = "PARADO";
    elevador.estado = "FORA_DE_SERVICO";
  }
  return elevador;
}

const corpoResultadoTeste = document.querySelector("#tabela-resultado-teste tbody");

document.getElementById("btn-calcular-aptidao").addEventListener("click", () => {
  const pavimentoChamada = Number(selectAndarChamadaTeste.value);

  const resultados = linhasConfigTeste.map(({ id, selPosicao, selCarga, selCondicao, checkServico }) => {
    const pavimento = Number(selPosicao.value);
    const elevador = montarElevadorTeste(id, pavimento, Number(selCarga.value), selCondicao.value, checkServico.checked);
    const resultado = calcularPrioridade(sim.controladorFuzzy, elevador, pavimentoChamada, calcularLotacaoPercentual, calcularVagasDisponiveis);
    return { id, emServico: checkServico.checked, pavimento, ...resultado };
  });

  corpoResultadoTeste.innerHTML = "";
  const marcadoresDistancia = [];
  const marcadoresLotacao = [];
  const marcadoresPrioridade = [];

  for (const r of resultados) {
    let situacao = "OK";
    if (r.foraDeServico) situacao = "Fora de serviço";
    else if (r.descartado) situacao = "Descartado (filtro)";

    const tr = document.createElement("tr");
    if (r.descartado || r.foraDeServico) tr.className = "descartado";
    tr.innerHTML =
      `<td>E${r.id}</td><td>${r.emServico ? "Sim" : "Não"}</td><td>${nomeAndarTeste(r.pavimento)}</td><td>${r.entrada.distancia.toFixed(0)}</td>` +
      `<td>${r.entrada.lotacao.toFixed(0)}%</td><td>${r.prioridade.toFixed(1)}</td><td>${situacao}</td>`;
    corpoResultadoTeste.appendChild(tr);

    if (!r.foraDeServico) {
      const tracado = r.descartado ? [2, 2] : [4, 3];
      const cor = CORES_ELEVADOR_TESTE[r.id];
      marcadoresDistancia.push({ valor: r.entrada.distancia, cor, tracado });
      marcadoresLotacao.push({ valor: r.entrada.lotacao, cor, tracado });
      marcadoresPrioridade.push({ valor: r.prioridade, cor, tracado });
    }
  }

  definirMarcadores(graficos.distancia, marcadoresDistancia);
  definirMarcadores(graficos.lotacao, marcadoresLotacao);
  definirMarcadores(graficos.prioridade, marcadoresPrioridade);
});

// ---- estado inicial ---------------------------------------------------------

atualizarPosCiclo();
