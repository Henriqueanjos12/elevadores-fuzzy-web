// Despachante: decide qual elevador atende cada chamada -- porta direta de
// simulation/despachante.py. Suporta as duas estratégias do projeto original:
// "fuzzy" (motor de inferência) e "mais_proximo" (linha de base simples).

import { calcularPrioridade } from "./fuzzy.js";
import { calcularCargaKg, calcularLotacaoPercentual, calcularVagasDisponiveis, elevadorEmServico } from "./models.js";

export function avaliarElevador(controlador, elevador, pavimentoChamada) {
  const resultado = calcularPrioridade(controlador, elevador, pavimentoChamada, calcularLotacaoPercentual, calcularVagasDisponiveis);
  return {
    elevadorId: elevador.id,
    pavimentoAtual: elevador.pavimentoAtual,
    direcao: elevador.direcao,
    estado: elevador.estado,
    distancia: resultado.entrada.distancia,
    lotacao: resultado.entrada.lotacao,
    cargaKg: calcularCargaKg(elevador),
    prioridade: resultado.prioridade,
    termosAtivos: resultado.termosAtivos,
    foraDeServico: resultado.foraDeServico,
    descartado: resultado.descartado,
    escolhido: false,
  };
}

function desempatar(candidatos, chavePrincipal) {
  return candidatos.reduce((melhor, atual) => {
    const chaveA = [chavePrincipal(atual), atual.distancia, atual.lotacao, atual.cargaKg, atual.elevadorId];
    const chaveB = [chavePrincipal(melhor), melhor.distancia, melhor.lotacao, melhor.cargaKg, melhor.elevadorId];
    for (let i = 0; i < chaveA.length; i += 1) {
      if (chaveA[i] !== chaveB[i]) return chaveA[i] < chaveB[i] ? atual : melhor;
    }
    return melhor;
  });
}

export function escolherElevador(controlador, elevadores, pavimentoChamada, algoritmo) {
  const avaliacoes = elevadores.map((e) => avaliarElevador(controlador, e, pavimentoChamada));

  const idsEmServico = new Set(elevadores.filter(elevadorEmServico).map((e) => e.id));
  const candidatos = avaliacoes.filter((a) => idsEmServico.has(a.elevadorId));
  if (candidatos.length === 0) return { elevador: null, avaliacoes };

  const escolhido =
    algoritmo === "mais_proximo"
      ? desempatar(candidatos, (a) => a.distancia)
      : desempatar(candidatos, (a) => -a.prioridade);

  for (const a of avaliacoes) a.escolhido = a.elevadorId === escolhido.elevadorId;
  const elevadorEscolhido = elevadores.find((e) => e.id === escolhido.elevadorId);
  return { elevador: elevadorEscolhido, avaliacoes };
}
