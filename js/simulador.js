// Motor de simulação por ciclos discretos -- porta de simulation/simulador.py.
// Todo o estado vive num único objeto (criarSimulacao); a UI só chama
// executarCiclo(sim) e lê o objeto resultante (nunca mexe em elevadores/
// chamadas diretamente).

import { criarControladorFuzzy } from "./fuzzy.js";
import {
  atribuirChamada,
  atualizarStatusChamada,
  avancarEstadoElevador,
  cancelarParadasExtrasSeVazio,
  colocarForaDeServico,
  criarElevador,
  adicionarParada,
  adicionarParadaExtra,
  desembarcarDoElevador,
  embarcarNoElevador,
  reativarElevador,
} from "./models.js";
import { escolherElevador } from "./despachante.js";
import {
  criarChamadaSimples,
  criarChamadaValidada,
  criarEstadoGerador,
  erroValidacaoChamada,
  gerarChamadaAleatoria,
  gerarNovosPassageiros,
  reiniciarGerador,
} from "./gerador.js";

export const QUANTIDADE_ELEVADORES = 3;
const CAPACIDADE_MAX_PASSAGEIROS = 12;

export function criarSimulacao(seed = null, algoritmo = "fuzzy") {
  return {
    controladorFuzzy: criarControladorFuzzy(),
    algoritmo,
    gerador: criarEstadoGerador(seed),
    elevadores: Array.from({ length: QUANTIDADE_ELEVADORES }, (_, i) => criarElevador(i + 1)),
    chamadas: new Map(),
    eventos: [],
    cicloAtual: 0,
    pausado: true,
    automaticoAtivo: false,
    intervaloAutomatico: 5,
    ultimoCicloGeracaoAutomatica: 0,
    ultimaAvaliacao: [],
    chamadasRecusadas: 0,
  };
}

export function reiniciarSimulacao(sim, seed = null) {
  const semente = seed ?? sim.gerador.seed;
  reiniciarGerador(sim.gerador, semente);
  sim.elevadores = Array.from({ length: QUANTIDADE_ELEVADORES }, (_, i) => criarElevador(i + 1));
  sim.chamadas = new Map();
  sim.eventos = [];
  sim.cicloAtual = 0;
  sim.pausado = true;
  sim.automaticoAtivo = false;
  sim.ultimoCicloGeracaoAutomatica = 0;
  sim.ultimaAvaliacao = [];
  sim.chamadasRecusadas = 0;
}

function elevadorPorId(sim, id) {
  return sim.elevadores.find((e) => e.id === id);
}

export function colocarElevadorForaDeServico(sim, id) {
  colocarForaDeServico(elevadorPorId(sim, id));
  registrarEvento(sim, "FORA_DE_SERVICO", `Elevador ${id} colocado fora de serviço.`);
}

export function reativarElevadorSim(sim, id) {
  reativarElevador(elevadorPorId(sim, id));
  registrarEvento(sim, "REATIVADO", `Elevador ${id} reativado.`);
}

// ---- chamadas externas ---------------------------------------------------

function chamadaAtivaEquivalente(sim, pavimento, direcao) {
  for (const chamada of sim.chamadas.values()) {
    if (chamada.pavimento === pavimento && chamada.direcao === direcao && ["AGUARDANDO", "ATRIBUIDA", "ATENDIDA_PARCIAL"].includes(chamada.status)) {
      return chamada;
    }
  }
  return null;
}

export function solicitarChamadaExternaSimples(sim, pavimento, direcao) {
  const existente = chamadaAtivaEquivalente(sim, pavimento, direcao);
  if (existente) return existente;

  let chamada;
  try {
    chamada = criarChamadaSimples(pavimento, direcao, sim.cicloAtual);
  } catch (erro) {
    sim.chamadasRecusadas += 1;
    registrarEvento(sim, "CHAMADA_RECUSADA", erro.message);
    return null;
  }
  sim.chamadas.set(chamada.id, chamada);
  registrarEvento(sim, "CHAMADA_CRIADA", `Chamada #${chamada.id}: pavimento ${pavimento} ${simboloDirecao(direcao)}.`);
  return chamada;
}

export function chamadaAguardandoEmbarque(sim) {
  for (const elevador of sim.elevadores) {
    if (elevador.estado !== "PORTA_ABERTA") continue;
    for (const chamadaId of elevador.chamadasAtribuidas) {
      const chamada = sim.chamadas.get(chamadaId);
      if (!chamada || chamada.pavimento !== elevador.pavimentoAtual) continue;
      if (!chamada.passageirosConfirmados) return { elevador, chamada };
    }
  }
  return null;
}

function dividirEmLotes(itens, tamanhoMaximo) {
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanhoMaximo) lotes.push(itens.slice(i, i + tamanhoMaximo));
  return lotes;
}

export function confirmarPassageirosChamada(sim, chamada, destinos, andaresExtras = []) {
  chamada.passageirosConfirmados = true;
  if (destinos.length === 0) return [chamada];

  const erro = erroValidacaoChamada(chamada.pavimento, chamada.direcao, destinos);
  if (erro) {
    sim.chamadasRecusadas += 1;
    registrarEvento(sim, "CHAMADA_RECUSADA", erro);
    return [chamada];
  }

  const lotes = dividirEmLotes(destinos, CAPACIDADE_MAX_PASSAGEIROS);
  const [primeiroLote, ...lotesExtras] = lotes;

  const novos = gerarNovosPassageiros(chamada.pavimento, chamada.direcao, sim.cicloAtual, primeiroLote);
  chamada.passageiros.push(...novos);
  registrarEvento(sim, "EMBARQUE_INFORMADO", `${primeiroLote.length} passageiro(s) confirmados na chamada #${chamada.id}.`);

  if (andaresExtras.length > 0 && chamada.elevadorAtribuido !== null) {
    const elevador = elevadorPorId(sim, chamada.elevadorAtribuido);
    for (const andar of andaresExtras) if (!primeiroLote.includes(andar)) adicionarParadaExtra(elevador, andar);
  }

  const chamadas = [chamada];
  for (const lote of lotesExtras) {
    const novaChamada = criarChamadaValidada(chamada.pavimento, chamada.direcao, lote, sim.cicloAtual);
    sim.chamadas.set(novaChamada.id, novaChamada);
    registrarEvento(sim, "CHAMADA_CRIADA", `Chamada #${novaChamada.id}: excedente (${lote.length} passageiro(s)).`);
    chamadas.push(novaChamada);
  }
  if (chamadas.length > 1) {
    registrarEvento(sim, "CHAMADA_DIVIDIDA", `${destinos.length} passageiro(s) excederam a capacidade -- divididos em ${chamadas.length} chamada(s).`);
  }
  return chamadas;
}

// ---- ciclo principal ---------------------------------------------------

export function executarCiclo(sim) {
  sim.cicloAtual += 1;

  if (sim.automaticoAtivo) gerarChamadaAutomaticaSeNecessario(sim);

  despacharChamadasPendentes(sim);

  for (const elevador of sim.elevadores) {
    if (elevador.estado === "PORTA_ABERTA") processarEmbarqueDesembarque(sim, elevador);
    avancarEstadoElevador(elevador);
  }

  atualizarStatusChamadas(sim);
}

export function avancarUmCiclo(sim) {
  executarCiclo(sim);
}

export function ativarGeracaoAutomatica(sim, intervaloCiclos = 5) {
  sim.automaticoAtivo = true;
  sim.intervaloAutomatico = Math.max(1, intervaloCiclos);
}

export function desativarGeracaoAutomatica(sim) {
  sim.automaticoAtivo = false;
}

function gerarChamadaAutomaticaSeNecessario(sim) {
  if (sim.cicloAtual - sim.ultimoCicloGeracaoAutomatica < sim.intervaloAutomatico) return;
  sim.ultimoCicloGeracaoAutomatica = sim.cicloAtual;
  const chamada = gerarChamadaAleatoria(sim.gerador, sim.cicloAtual);
  sim.chamadas.set(chamada.id, chamada);
  registrarEvento(sim, "CHAMADA_AUTOMATICA", `Chamada #${chamada.id}: pavimento ${chamada.pavimento} ${simboloDirecao(chamada.direcao)} (${chamada.passageiros.length} passageiro(s)).`);
}

function despacharChamadasPendentes(sim) {
  for (const chamada of sim.chamadas.values()) {
    if (chamada.status !== "AGUARDANDO") continue;
    const { elevador, avaliacoes } = escolherElevador(sim.controladorFuzzy, sim.elevadores, chamada.pavimento, sim.algoritmo);
    sim.ultimaAvaliacao = avaliacoes;
    sim.ultimaChamadaAvaliada = { pavimento: chamada.pavimento, direcao: chamada.direcao };
    if (!elevador) continue;

    atribuirChamada(chamada, elevador.id);
    elevador.chamadasAtribuidas.add(chamada.id);
    adicionarParada(elevador, chamada.pavimento);

    const prioridade = avaliacoes.find((a) => a.elevadorId === elevador.id)?.prioridade ?? 0;
    registrarEvento(sim, "CHAMADA_ATRIBUIDA", `Chamada #${chamada.id} (pavimento ${chamada.pavimento} ${simboloDirecao(chamada.direcao)}) atribuída ao Elevador ${elevador.id} (prioridade ${prioridade.toFixed(1)}).`);
  }
}

function processarEmbarqueDesembarque(sim, elevador) {
  const desembarcados = desembarcarDoElevador(elevador, sim.cicloAtual);
  if (desembarcados.length > 0) {
    registrarEvento(sim, "DESEMBARQUE", `${desembarcados.length} passageiro(s) desembarcaram do Elevador ${elevador.id} no pavimento ${elevador.pavimentoAtual}.`);
  }

  const candidatos = passageirosAguardandoCompativeis(sim, elevador);
  if (candidatos.length === 0) {
    cancelarParadasExtrasSeVazio(elevador);
    return;
  }

  const quantidadeAntes = candidatos.length;
  const embarcados = embarcarNoElevador(elevador, candidatos, sim.cicloAtual);
  if (embarcados.length > 0) {
    registrarEvento(sim, "EMBARQUE", `${embarcados.length} passageiro(s) embarcaram no Elevador ${elevador.id} no pavimento ${elevador.pavimentoAtual}.`);
  }
  if (candidatos.length > 0) {
    registrarEvento(sim, "ATENDIMENTO_PARCIAL", `${candidatos.length} de ${quantidadeAntes} passageiro(s) não couberam no Elevador ${elevador.id} e continuam aguardando.`);
  }
  cancelarParadasExtrasSeVazio(elevador);
}

function passageirosAguardandoCompativeis(sim, elevador) {
  const candidatos = [];
  const outrasParadas = new Set([...elevador.filaParadas].filter((p) => !elevador.paradasExtras.has(p) && p !== elevador.pavimentoAtual));
  const direcaoComprometida = outrasParadas.size > 0 ? elevador.direcao : "PARADO";
  for (const chamada of sim.chamadas.values()) {
    if (chamada.pavimento !== elevador.pavimentoAtual) continue;
    if (direcaoComprometida !== "PARADO" && chamada.direcao !== direcaoComprometida) continue;
    candidatos.push(...chamada.passageiros.filter((p) => p.estado === "AGUARDANDO"));
  }
  return candidatos;
}

function atualizarStatusChamadas(sim) {
  for (const chamada of sim.chamadas.values()) {
    const concluiuAgora = atualizarStatusChamada(chamada);
    if (concluiuAgora) {
      registrarEvento(sim, "CHAMADA_CONCLUIDA", `Chamada #${chamada.id} concluída (pavimento ${chamada.pavimento} ${simboloDirecao(chamada.direcao)}).`);
    }
  }
}

function registrarEvento(sim, tipo, descricao) {
  sim.eventos.push({ ciclo: sim.cicloAtual, tipo, descricao });
}

export function limparEventos(sim) {
  sim.eventos.length = 0;
}

export function simboloDirecao(direcao) {
  if (direcao === "SUBINDO") return "▲";
  if (direcao === "DESCENDO") return "▼";
  return "—";
}
