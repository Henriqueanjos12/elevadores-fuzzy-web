// Controlador fuzzy (Mamdani): distancia x lotacao -> prioridade.
// Porta direta de fuzzy/controlador_fuzzy.py do projeto Python original
// (mesmas pertinências padrão, mesmas 21 regras, mesmo filtro determinístico).

export const DISTANCIA_MAXIMA_PADRAO = 11; // magnitude maxima (-11 a +11 com sinal)

// Pontos [a, b, c, d] de cada trapézio: sobe de 0 (em a) a 1 (em b), platô
// até c, desce a 0 em d. Um triângulo é só o caso b === c.
//
// `distancia` tem SINAL (ideia do Pedro, mestrado, "vetor posição"):
// positivo = andar da chamada está ACIMA do elevador (ele subiria, sufixo
// "sobe"); negativo = está ABAIXO (ele desceria, sufixo "desce"); zero =
// exatamente no andar ("exato"). É só a posição relativa -- não o
// movimento real do elevador (isso continua sendo `motivoDescarte`,
// totalmente independente). 7 termos em cadeia triangular clássica,
// igualmente espaçados (passo = universo / 6) cobrindo -11..+11.
//
// `lotacao` continua com a receita antiga (3 termos: termos extremos são
// rampas puras de largura meio universo; o termo central `media` é
// esticado até as DUAS pontas, o dobro dos extremos) -- isso é o que evita
// a armadilha do centroide-travado: quando só um termo de entrada está
// ativo e a regra correspondente aponta pra um termo de saída SIMÉTRICO, o
// centroide de qualquer recorte de uma forma simétrica cai sempre no mesmo
// ponto, não importa a força de ativação (ver docstring de
// fuzzy/controlador_fuzzy.py pra a análise completa, incluindo o mesmo
// cuidado na tabela de regras abaixo pra nenhum par de termos ADJACENTES
// de `distancia` apontar pro mesmo termo de saída na mesma linha).
//
// Saída `prioridade`: 6 termos (pior/ruim/aceitavel/ok/bom/ideal, os
// rótulos do Pedro), receita clássica de 5 pontos igualmente espaçados
// (0%, 20%, 40%, 60%, 80%, 100%), sem alargamento (o alargamento é sobre
// entradas que disparam uma regra sozinhas, não sobre a saída).
export const PARAMETROS_PADRAO = {
  distancia: {
    muito_distante_desce: [-11, -11, -11, -7.333],
    distante_desce: [-11, -7.333, -7.333, -3.667],
    proximo_desce: [-7.333, -3.667, -3.667, 0],
    exato: [-3.667, 0, 0, 3.667],
    proximo_sobe: [0, 3.667, 3.667, 7.333],
    distante_sobe: [3.667, 7.333, 7.333, 11],
    muito_distante_sobe: [7.333, 11, 11, 11],
  },
  lotacao: {
    baixa: [0, 0, 0, 50],
    media: [0, 50, 50, 100],
    alta: [50, 100, 100, 100],
  },
  prioridade: {
    pior: [0, 0, 0, 20],
    ruim: [0, 20, 20, 40],
    aceitavel: [20, 40, 40, 60],
    ok: [40, 60, 60, 80],
    bom: [60, 80, 80, 100],
    ideal: [80, 100, 100, 100],
  },
};

// Base de regras: cobertura completa da grade distancia (7) x lotacao (3).
// Assimétrica por design (contrapeso): lotação alta favorece "desce",
// lotação baixa favorece "subir"; em exatamente 50% o sentido não importa
// (linha simétrica). A coluna "exato" varia por lotação (decisão do
// usuário: "ideal" só pro elevador realmente vazio, não qualquer carga no
// andar certo) -- mas nunca repete o rótulo dos vizinhos imediatos
// (proximo_desce/proximo_sobe), senão recria a mesma armadilha de
// centroide-travado (duas regras atingindo o MESMO termo simétrico).
const REGRAS = [
  // lotação baixa (<50%, favorece subir)
  ["muito_distante_desce", "baixa", "pior"],
  ["distante_desce", "baixa", "ruim"],
  ["proximo_desce", "baixa", "aceitavel"],
  ["exato", "baixa", "ideal"],
  ["proximo_sobe", "baixa", "ok"],
  ["distante_sobe", "baixa", "aceitavel"],
  ["muito_distante_sobe", "baixa", "ruim"],
  // lotação em 50% (equilíbrio com o contrapeso, sentido não importa)
  ["muito_distante_desce", "media", "ruim"],
  ["distante_desce", "media", "aceitavel"],
  ["proximo_desce", "media", "ok"],
  ["exato", "media", "bom"],
  ["proximo_sobe", "media", "ok"],
  ["distante_sobe", "media", "aceitavel"],
  ["muito_distante_sobe", "media", "ruim"],
  // lotação alta (>50%, favorece descer)
  ["muito_distante_desce", "alta", "ruim"],
  ["distante_desce", "alta", "aceitavel"],
  ["proximo_desce", "alta", "ok"],
  ["exato", "alta", "bom"],
  ["proximo_sobe", "alta", "aceitavel"],
  ["distante_sobe", "alta", "ruim"],
  ["muito_distante_sobe", "alta", "pior"],
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

export const MOTIVO_CASO_IDEAL = "Elevador vazio parado no andar de chamada";

/** entrada/prioridade/foraDeServico/descartado/motivoDescarte/semRegraAtivada/
 * termosAtivos/casoIdeal/motivoIdeal -- mesmas chaves de calcular_prioridade
 * em fuzzy/controlador_fuzzy.py. */
export function calcularPrioridade(controlador, elevador, pavimentoChamada, calcularLotacaoPercentual, calcularVagasDisponiveis) {
  if (elevador.estado === "FORA_DE_SERVICO") {
    return { entrada: { distancia: 0, lotacao: 0 }, prioridade: 0, foraDeServico: true, descartado: false, motivoDescarte: null, semRegraAtivada: false, termosAtivos: [], casoIdeal: false, motivoIdeal: null };
  }

  const distanciaMaxima = controlador.distanciaMaxima;
  // Com sinal (Seção "vetor posição" pedida pelo Pedro): positivo = andar
  // da chamada está ACIMA do elevador (sentido "sobe"); negativo = está
  // ABAIXO (sentido "desce"). Posição relativa, não o movimento real
  // (isso é `motivoDescarte`).
  const distanciaSinalizada = pavimentoChamada - elevador.pavimentoAtual;
  const distancia = Math.max(-distanciaMaxima, Math.min(distanciaMaxima, distanciaSinalizada));
  const lotacao = calcularLotacaoPercentual(elevador);
  const entrada = { distancia, lotacao };

  const motivo = motivoDescarte(elevador, pavimentoChamada, calcularVagasDisponiveis);
  if (motivo !== null) {
    return { entrada, prioridade: 0, foraDeServico: false, descartado: true, motivoDescarte: motivo, semRegraAtivada: false, termosAtivos: [], casoIdeal: false, motivoIdeal: null };
  }

  // Caso ideal: distância 0 e lotação 0% -- elevador já parado exatamente
  // no andar da chamada e vazio. Nem chega a entrar na máquina fuzzy,
  // mesmo espírito do filtro de descarte acima (só que no sentido
  // oposto): a defuzzificação por centroide nunca fecha em 100 sozinha
  // aqui (só a regra "exato & baixa -> ideal" dispara, e o centroide de
  // qualquer recorte do termo de saída correspondente fica abaixo de
  // 100), então esse ponto é tratado à parte -- ver a mesma explicação,
  // com a conta feita, no docstring de calcular_prioridade em
  // fuzzy/controlador_fuzzy.py.
  if (distancia === 0 && lotacao === 0) {
    return { entrada, prioridade: 100, foraDeServico: false, descartado: false, motivoDescarte: null, semRegraAtivada: false, termosAtivos: [], casoIdeal: true, motivoIdeal: MOTIVO_CASO_IDEAL };
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
    casoIdeal: false,
    motivoIdeal: null,
  };
}
