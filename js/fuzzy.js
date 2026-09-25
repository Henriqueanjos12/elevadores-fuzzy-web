// Controlador fuzzy (Mamdani): distancia x lotacao -> prioridade.
// Porta direta de fuzzy/controlador_fuzzy.py do projeto Python original
// (mesmas pertinências padrão, mesmas 9 regras, mesmo filtro determinístico).

export const DISTANCIA_MAXIMA_PADRAO = 11;

// Pontos [a, b, c, d] de cada trapézio: sobe de 0 (em a) a 1 (em b), platô
// até c, desce a 0 em d. Um triângulo é só o caso b === c.
//
// Pontos igualmente espaçados (passo = universo / 4: 0%, 25%, 50%, 75%,
// 100%) -- termos extremos são rampas puras (sem platô) de largura meio
// universo; o termo central é esticado até as DUAS pontas do universo
// (largura = universo inteiro, o dobro dos extremos), não só entre os
// pontos vizinhos. Essa largura assimétrica evita uma armadilha da
// defuzzificação por centroide: quando só o termo extremo está ativo (o
// central ainda em zero) e a regra correspondente aponta pra um termo de
// saída SIMÉTRICO, o centroide de qualquer recorte de uma forma simétrica
// cai sempre no mesmo ponto -- não importa a força de ativação. Isso fazia
// elevadores a distâncias bem diferentes (ex.: 1 e 5 andares, mesma
// lotação) saírem com prioridade IDÊNTICA sempre que a distância maior
// ainda caísse nessa faixa "só o extremo ativo" (achado testando a
// calculadora de aptidão com um prédio grande, onde essa faixa fica larga
// o bastante pra ficar óbvio). Esticar o termo central resolve: ele sempre
// contribui um pouco, então pelo menos duas regras disputam a saída em
// quase todo o universo, e a mistura entre elas volta a responder à
// distância exata (ver teste equivalente em test_controlador_fuzzy.py).
//
// Em "distancia" (universo 0-11, não divisível por 4) os pontos "puros"
// são fracionários (5.5 no meio); o estado inicial usa esses valores
// exatos, mesmo não sendo um ponto que a edição por arraste produziria --
// o arraste (em charts.js) sempre encaixa no inteiro mais próximo, mas
// isso é só uma conveniência da edição interativa, não uma restrição do
// padrão.
export const PARAMETROS_PADRAO = {
  distancia: {
    proxima: [0, 0, 0, 5.5],
    media: [0, 5.5, 5.5, 11],
    distante: [5.5, 11, 11, 11],
  },
  lotacao: {
    baixa: [0, 0, 0, 50],
    media: [0, 50, 50, 100],
    alta: [50, 100, 100, 100],
  },
  prioridade: {
    muito_baixa: [0, 0, 0, 25],
    baixa: [0, 25, 25, 50],
    media: [25, 50, 50, 75],
    alta: [50, 75, 75, 100],
    muito_alta: [75, 100, 100, 100],
  },
};

// Base de regras: cobertura completa da grade distancia (3) x lotacao (3).
const REGRAS = [
  ["proxima", "baixa", "muito_alta"],
  ["proxima", "media", "alta"],
  ["proxima", "alta", "media"],
  ["media", "baixa", "alta"],
  ["media", "media", "media"],
  ["media", "alta", "baixa"],
  ["distante", "baixa", "media"],
  ["distante", "media", "baixa"],
  ["distante", "alta", "muito_baixa"],
];

export function clonarParametros(parametros) {
  const copia = {};
  for (const [variavel, termos] of Object.entries(parametros)) {
    copia[variavel] = {};
    for (const [termo, pontos] of Object.entries(termos)) {
      copia[variavel][termo] = [...pontos];
    }
  }
  return copia;
}

/** Grau de pertinência trapezoidal de x nos pontos [a, b, c, d]. */
export function trapmf(x, [a, b, c, d]) {
  if (x < a) return 0;
  if (x <= b) return b > a ? (x - a) / (b - a) : 1;
  if (x <= c) return 1;
  if (x <= d) return d > c ? (d - x) / (d - c) : 0;
  return 0;
}

export function criarControladorFuzzy(parametros = null, distanciaMaxima = DISTANCIA_MAXIMA_PADRAO) {
  const parametrosEfetivos = clonarParametros(parametros ?? PARAMETROS_PADRAO);
  if (distanciaMaxima !== DISTANCIA_MAXIMA_PADRAO) {
    const fator = distanciaMaxima / DISTANCIA_MAXIMA_PADRAO;
    const distancia = {};
    for (const [termo, pontos] of Object.entries(parametrosEfetivos.distancia)) {
      distancia[termo] = pontos.map((p) => Math.round(p * fator * 1000) / 1000);
    }
    parametrosEfetivos.distancia = distancia;
  }
  return { parametros: parametrosEfetivos, distanciaMaxima };
}

/** Fuzzificação -> inferência (min/max) -> defuzzificação (centroide), tudo num universo discreto 0..100. */
function calcularSistemaFuzzy(distanciaValor, lotacaoValor, parametros) {
  const grauDistancia = {};
  for (const [termo, pontos] of Object.entries(parametros.distancia)) {
    grauDistancia[termo] = trapmf(distanciaValor, pontos);
  }
  const grauLotacao = {};
  for (const [termo, pontos] of Object.entries(parametros.lotacao)) {
    grauLotacao[termo] = trapmf(lotacaoValor, pontos);
  }

  const forcaPorSaida = {};
  for (const termo of Object.keys(parametros.prioridade)) forcaPorSaida[termo] = 0;
  const regrasAtivadas = [];
  for (const [nomeD, nomeL, saida] of REGRAS) {
    const forca = Math.min(grauDistancia[nomeD], grauLotacao[nomeL]);
    if (forca > forcaPorSaida[saida]) forcaPorSaida[saida] = forca;
    if (forca > 0.001) regrasAtivadas.push({ regra: `distancia=${nomeD} & lotacao=${nomeL} -> prioridade=${saida}`, forca });
  }

  let somaMu = 0;
  let somaPonderada = 0;
  for (let y = 0; y <= 100; y += 1) {
    let mu = 0;
    for (const [termo, pontos] of Object.entries(parametros.prioridade)) {
      const grau = Math.min(forcaPorSaida[termo], trapmf(y, pontos));
      if (grau > mu) mu = grau;
    }
    somaMu += mu;
    somaPonderada += mu * y;
  }

  const limiar = 0.05;
  const termosAtivos = [];
  for (const [nome, grau] of Object.entries(grauDistancia)) if (grau > limiar) termosAtivos.push(`distancia=${nome} (${grau.toFixed(2)})`);
  for (const [nome, grau] of Object.entries(grauLotacao)) if (grau > limiar) termosAtivos.push(`lotacao=${nome} (${grau.toFixed(2)})`);

  if (somaMu === 0) {
    return { prioridade: 0, semRegraAtivada: true, termosAtivos: [] };
  }
  return { prioridade: somaPonderada / somaMu, semRegraAtivada: false, termosAtivos };
}

/** Filtro determinístico ANTES do motor fuzzy (Seção pedida pelo professor):
 * elevadores que fisicamente não fazem sentido pra chamada nem chegam a ser
 * avaliados pela máquina fuzzy -- prioridade 0 direto. Retorna o motivo do
 * descarte (pra mostrar na UI) ou null se o elevador não deve ser descartado. */
export function motivoDescarte(elevador, pavimentoChamada, calcularVagasDisponiveis) {
  if (calcularVagasDisponiveis(elevador) === 0) return "Lotado (sem vagas)";
  if (elevador.estado !== "SUBINDO" && elevador.estado !== "DESCENDO") return null;

  const { direcao, pavimentoAtual } = elevador;
  if (pavimentoAtual === pavimentoChamada) return "Em movimento, já está no andar da chamada";
  if (direcao === "SUBINDO" && pavimentoAtual > pavimentoChamada) return "Subindo e já passou do andar da chamada";
  if (direcao === "DESCENDO" && pavimentoAtual < pavimentoChamada) return "Descendo e já passou do andar da chamada";
  return null;
}

export function calcularPrioridade(controlador, elevador, pavimentoChamada, calcularLotacaoPercentual, calcularVagasDisponiveis) {
  if (elevador.estado === "FORA_DE_SERVICO") {
    return { entrada: { distancia: 0, lotacao: 0 }, prioridade: 0, foraDeServico: true, descartado: false, motivoDescarte: null, semRegraAtivada: false, termosAtivos: [] };
  }

  const distanciaMaxima = controlador.distanciaMaxima;
  const distancia = Math.min(distanciaMaxima, Math.abs(elevador.pavimentoAtual - pavimentoChamada));
  const lotacao = calcularLotacaoPercentual(elevador);
  const entrada = { distancia, lotacao };

  const motivo = motivoDescarte(elevador, pavimentoChamada, calcularVagasDisponiveis);
  if (motivo !== null) {
    return { entrada, prioridade: 0, foraDeServico: false, descartado: true, motivoDescarte: motivo, semRegraAtivada: false, termosAtivos: [] };
  }

  const resultado = calcularSistemaFuzzy(distancia, lotacao, controlador.parametros);
  return {
    entrada,
    prioridade: resultado.prioridade,
    foraDeServico: false,
    descartado: false,
    motivoDescarte: null,
    semRegraAtivada: resultado.semRegraAtivada,
    termosAtivos: resultado.termosAtivos,
  };
}
