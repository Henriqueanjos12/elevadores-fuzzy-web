// Modelos de domínio (elevador, chamada, passageiro), como objetos simples
// + funções soltas -- porta direta de models/*.py do projeto Python original.

// Valores padrão -- usados quando nada mais específico é passado (ex.:
// preenchimento inicial dos formulários de configuração na UI). O prédio de
// verdade e a calculadora de aptidão podem sobrescrever tudo isso em tempo
// de execução (ver "Configurar prédio" em main.js).
export const CAPACIDADE_MAX_PASSAGEIROS = 12;
export const PESO_MEDIO_KG = 70;
export const CAPACIDADE_MAX_KG = CAPACIDADE_MAX_PASSAGEIROS * PESO_MEDIO_KG;
export const PAVIMENTO_TERREO = 0;
export const PAVIMENTO_ULTIMO_ANDAR = 11;

// ---- elevador ---------------------------------------------------------

/** A capacidade fica gravada no PRÓPRIO elevador (não numa constante global)
 * pra permitir reconfigurar o prédio (andares/capacidade) em tempo de
 * execução sem estado mutável compartilhado. */
export function criarElevador(id, pavimentoAtual = 0, capacidadeMaxPassageiros = CAPACIDADE_MAX_PASSAGEIROS) {
  return {
    id,
    pavimentoAtual,
    direcao: "PARADO",
    estado: "PARADO",
    passageiros: [],
    filaParadas: new Set(),
    paradasExtras: new Set(),
    chamadasAtribuidas: new Set(),
    capacidadeMaxPassageiros,
    capacidadeMaxKg: capacidadeMaxPassageiros * PESO_MEDIO_KG,
  };
}

export function calcularCargaKg(elevador) {
  return elevador.passageiros.reduce((soma, p) => soma + p.pesoKg, 0);
}

export function calcularLotacaoPercentual(elevador) {
  return (calcularCargaKg(elevador) / elevador.capacidadeMaxKg) * 100;
}

export function calcularVagasDisponiveis(elevador) {
  const porQuantidade = elevador.capacidadeMaxPassageiros - elevador.passageiros.length;
  const pesoLivre = elevador.capacidadeMaxKg - calcularCargaKg(elevador);
  const porPeso = Math.floor(pesoLivre / PESO_MEDIO_KG);
  return Math.max(0, Math.min(porQuantidade, porPeso));
}

export function elevadorEmServico(elevador) {
  return elevador.estado !== "FORA_DE_SERVICO";
}

export function portaAberta(elevador) {
  return elevador.estado === "PORTA_ABERTA";
}

export function elevadorEmMovimento(estado) {
  return estado === "SUBINDO" || estado === "DESCENDO";
}

export function adicionarParada(elevador, pavimento) {
  elevador.filaParadas.add(pavimento);
}

export function adicionarParadaExtra(elevador, pavimento) {
  adicionarParada(elevador, pavimento);
  elevador.paradasExtras.add(pavimento);
}

export function removerParada(elevador, pavimento) {
  elevador.filaParadas.delete(pavimento);
  elevador.paradasExtras.delete(pavimento);
}

export function cancelarParadasExtrasSeVazio(elevador) {
  if (elevador.passageiros.length > 0) return;
  for (const pavimento of [...elevador.paradasExtras]) removerParada(elevador, pavimento);
}

function proximaParada(elevador) {
  const paradas = [...elevador.filaParadas];
  if (paradas.length === 0) return null;

  const atual = elevador.pavimentoAtual;
  const acima = paradas.filter((p) => p > atual).sort((a, b) => a - b);
  const abaixo = paradas.filter((p) => p < atual).sort((a, b) => b - a);

  if (elevador.direcao === "SUBINDO") return acima[0] ?? abaixo[0];
  if (elevador.direcao === "DESCENDO") return abaixo[0] ?? acima[0];

  const candidatos = [...acima.slice(0, 1), ...abaixo.slice(0, 1)];
  return candidatos.reduce((melhor, p) => (Math.abs(p - atual) < Math.abs(melhor - atual) ? p : melhor), candidatos[0]);
}

export function embarcarNoElevador(elevador, candidatos, cicloAtual) {
  const vagas = calcularVagasDisponiveis(elevador);
  const embarcados = candidatos.slice(0, vagas);
  candidatos.splice(0, vagas);

  for (const passageiro of embarcados) {
    const destino = passageiro.destino ?? elevador.pavimentoAtual;
    passageiro.estado = "NO_ELEVADOR";
    passageiro.cicloEmbarque = cicloAtual;
    passageiro.destino = destino;
    elevador.passageiros.push(passageiro);
    if (destino !== elevador.pavimentoAtual) adicionarParada(elevador, destino);
  }
  return embarcados;
}

export function desembarcarDoElevador(elevador, cicloAtual) {
  const ficam = [];
  const saem = [];
  for (const passageiro of elevador.passageiros) {
    if (passageiro.destino === elevador.pavimentoAtual) {
      passageiro.estado = "ATENDIDO";
      passageiro.cicloDesembarque = cicloAtual;
      saem.push(passageiro);
    } else {
      ficam.push(passageiro);
    }
  }
  elevador.passageiros = ficam;
  return saem;
}

export function avancarEstadoElevador(elevador) {
  const estado = elevador.estado;
  if (estado === "FORA_DE_SERVICO") return;

  if (estado === "PORTA_ABRINDO") {
    elevador.estado = "PORTA_ABERTA";
    return;
  }
  if (estado === "PORTA_ABERTA") {
    elevador.estado = "PORTA_FECHANDO";
    return;
  }
  if (estado === "PORTA_FECHANDO") {
    removerParada(elevador, elevador.pavimentoAtual);
    elevador.estado = "PARADO";
    return;
  }
  if (estado === "PARADO") {
    decidirAPartirDeParado(elevador);
    return;
  }
  if (elevadorEmMovimento(estado)) {
    moverElevador(elevador);
  }
}

function decidirAPartirDeParado(elevador) {
  if (elevador.filaParadas.has(elevador.pavimentoAtual)) {
    elevador.estado = "PORTA_ABRINDO";
    return;
  }
  const proxima = proximaParada(elevador);
  if (proxima === null || proxima === undefined) {
    elevador.direcao = "PARADO";
    return;
  }
  const novaDirecao = proxima > elevador.pavimentoAtual ? "SUBINDO" : "DESCENDO";
  elevador.direcao = novaDirecao;
  elevador.estado = novaDirecao;
}

function moverElevador(elevador) {
  const delta = elevador.estado === "SUBINDO" ? 1 : -1;
  elevador.pavimentoAtual += delta;
  if (elevador.filaParadas.has(elevador.pavimentoAtual)) {
    elevador.estado = "PORTA_ABRINDO";
  }
}

export function colocarForaDeServico(elevador) {
  elevador.estado = "FORA_DE_SERVICO";
  elevador.direcao = "PARADO";
}

export function reativarElevador(elevador) {
  elevador.estado = "PARADO";
  elevador.direcao = "PARADO";
}

// ---- passageiro ---------------------------------------------------------

let proximoIdPassageiroGlobal = 1;

export function criarPassageiro(origem, destino, direcao, cicloChegada, pesoKg = PESO_MEDIO_KG) {
  return {
    id: proximoIdPassageiroGlobal++,
    origem,
    destino,
    direcao,
    cicloChegada,
    pesoKg,
    estado: "AGUARDANDO",
    cicloEmbarque: null,
    cicloDesembarque: null,
  };
}

// ---- chamada ---------------------------------------------------------

let proximoIdChamadaGlobal = 1;

export function criarChamada(pavimento, direcao, cicloCriacao, passageiros = [], passageirosConfirmados = true) {
  return {
    id: proximoIdChamadaGlobal++,
    pavimento,
    direcao,
    cicloCriacao,
    passageiros,
    passageirosConfirmados,
    status: "AGUARDANDO",
    elevadorAtribuido: null,
  };
}

export function quantidadeAguardandoChamada(chamada) {
  return chamada.passageiros.filter((p) => p.estado === "AGUARDANDO").length;
}

export function atribuirChamada(chamada, elevadorId) {
  chamada.elevadorAtribuido = elevadorId;
  chamada.status = "ATRIBUIDA";
}

export function chamadaEstaAtiva(chamada) {
  return chamada.status === "AGUARDANDO" || chamada.status === "ATRIBUIDA" || chamada.status === "ATENDIDA_PARCIAL";
}

export function atualizarStatusChamada(chamada) {
  if (chamada.status === "ATENDIDA") return false;
  if (!chamada.passageirosConfirmados) return false;

  const total = chamada.passageiros.length;
  const aguardando = quantidadeAguardandoChamada(chamada);
  if (aguardando === 0) {
    chamada.status = "ATENDIDA";
    return true;
  }
  if (aguardando < total) {
    chamada.status = "ATENDIDA_PARCIAL";
  }
  return false;
}

export function direcoesValidas(pavimento, andarMaximo = PAVIMENTO_ULTIMO_ANDAR) {
  if (pavimento === PAVIMENTO_TERREO) return ["SUBINDO"];
  if (pavimento === andarMaximo) return ["DESCENDO"];
  return ["SUBINDO", "DESCENDO"];
}
