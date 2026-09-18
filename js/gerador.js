// Geração de chamadas -- manual (clique nos botões) e automática (aleatória
// com semente reprodutível). Porta de simulation/gerador_chamadas.py.

import { PAVIMENTO_TERREO, PAVIMENTO_ULTIMO_ANDAR, criarChamada, criarPassageiro, direcoesValidas } from "./models.js";

/** PRNG determinístico (mulberry32) -- mesma semente sempre produz a mesma
 * sequência, igual ao random.Random(seed) do Python (embora a sequência em
 * si seja diferente entre as duas linguagens, cada uma é reprodutível). */
function criarRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function criarEstadoGerador(seed = null) {
  const semente = seed ?? Math.floor(Math.random() * 2 ** 31);
  return { seed: semente, rng: criarRng(semente) };
}

export function reiniciarGerador(estado, seed = null) {
  estado.seed = seed ?? estado.seed;
  estado.rng = criarRng(estado.seed);
}

function rngInt(rng, min, max) {
  // inteiro uniforme em [min, max], inclusive
  return min + Math.floor(rng() * (max - min + 1));
}

function rngEscolha(rng, lista) {
  return lista[Math.floor(rng() * lista.length)];
}

export function erroValidacaoDirecao(pavimento, direcao, andarMaximo = PAVIMENTO_ULTIMO_ANDAR) {
  if (!direcoesValidas(pavimento, andarMaximo).includes(direcao)) return `Pavimento ${pavimento} não possui botão de ${direcao}.`;
  return null;
}

export function erroValidacaoChamada(pavimento, direcao, destinos, andarMaximo = PAVIMENTO_ULTIMO_ANDAR) {
  if (destinos.length === 0) return "A quantidade de passageiros deve ser maior que zero.";
  const erroDirecao = erroValidacaoDirecao(pavimento, direcao, andarMaximo);
  if (erroDirecao) return erroDirecao;
  for (const destino of destinos) {
    if (destino === pavimento) return "O pavimento de destino não pode ser igual à origem.";
    if (destino < 0 || destino > andarMaximo) return "Pavimento de destino inexistente.";
  }
  return null;
}

export function gerarNovosPassageiros(origem, direcao, cicloAtual, destinos) {
  return destinos.map((destino) => criarPassageiro(origem, destino, direcao, cicloAtual));
}

export function criarChamadaSimples(pavimento, direcao, cicloAtual, andarMaximo = PAVIMENTO_ULTIMO_ANDAR) {
  const erro = erroValidacaoDirecao(pavimento, direcao, andarMaximo);
  if (erro) throw new Error(erro);
  return criarChamada(pavimento, direcao, cicloAtual, [], false);
}

export function criarChamadaValidada(pavimento, direcao, destinos, cicloAtual, andarMaximo = PAVIMENTO_ULTIMO_ANDAR) {
  const erro = erroValidacaoChamada(pavimento, direcao, destinos, andarMaximo);
  if (erro) throw new Error(erro);
  const passageiros = gerarNovosPassageiros(pavimento, direcao, cicloAtual, destinos);
  return criarChamada(pavimento, direcao, cicloAtual, passageiros, true);
}

export function gerarChamadaAleatoria(estado, cicloAtual, andarMaximo = PAVIMENTO_ULTIMO_ANDAR, quantidadeMaxPassageiros = 4) {
  const { rng } = estado;
  const pavimento = rngInt(rng, PAVIMENTO_TERREO, andarMaximo);
  const direcao = rngEscolha(rng, direcoesValidas(pavimento, andarMaximo));
  const quantidade = rngInt(rng, 1, quantidadeMaxPassageiros);

  const destinos = [];
  for (let i = 0; i < quantidade; i += 1) {
    destinos.push(direcao === "SUBINDO" ? rngInt(rng, pavimento + 1, andarMaximo) : rngInt(rng, 0, pavimento - 1));
  }
  return criarChamadaValidada(pavimento, direcao, destinos, cicloAtual, andarMaximo);
}
