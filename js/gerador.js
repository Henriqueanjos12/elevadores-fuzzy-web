// Geração de chamadas manuais (clique nos botões). Porta de
// simulation/gerador_chamadas.py.

import { PAVIMENTO_ULTIMO_ANDAR, criarChamada, criarPassageiro, direcoesValidas } from "./models.js";

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
