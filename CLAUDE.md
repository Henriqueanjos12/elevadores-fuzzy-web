# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A JavaScript port (no build step, no dependencies) of the didactic elevator-dispatch fuzzy-logic simulator whose Python/CustomTkinter original lives in a sibling directory (`../Fuzzy`, separate repo — see that project's own CLAUDE.md). Same Mamdani controller (`distancia` × `lotacao` → `prioridade`), same 9 rules, same two-phase call flow. Deployed as a static site to GitHub Pages at https://henriqueanjos12.github.io/elevadores-fuzzy-web/. Scope is deliberately narrower than the Python original: no metrics panel, no event-driven test suite — see README.md for what's in/out.

Keep this in sync with `../Fuzzy` when changing shared logic (fuzzy controller shape, dispatch rules, two-phase call flow) unless a change is browser/DOM-specific — port fixes both ways when a bug or behavior change applies to both.

## Commands

There's no build step and no package.json — it's plain ES modules loaded by the browser. Because `main.js` uses `import`/`export`, opening `index.html` via `file://` fails; it must be served over http:

```bash
python -m http.server 8000     # then open http://localhost:8000/
```

No test framework is wired in (no Jest/Vitest, no package.json). Verification is done manually with Playwright against a local server — install once with `pip install playwright && python -m playwright install chromium`, then drive it with a throwaway script (`sync_playwright()`, `page.goto("http://localhost:PORT/")`, assert on `page.on("pageerror", ...)` / `page.on("console", ...)` for errors, screenshot to check the result). There is no committed test suite to run — write and discard scratch scripts per change, covering at minimum: page loads with zero console errors, a manual call dispatches and the two-phase embarkment modal completes, and (after editing `fuzzy.js` or `charts.js`) a vertex drag on each of the 3 graphs actually moves.

## Architecture

Mirrors the Python original's module boundaries directly, so someone who knows one can find their way in the other:

| Web (`js/`) | Python equivalent | Role |
|---|---|---|
| `fuzzy.js` | `fuzzy/controlador_fuzzy.py` | trapezoidal membership (`trapmf`), 9 rules, Mamdani min/max + centroid over a discretized 0–100 (or 0–`distanciaMaxima`) universe, deterministic pre-fuzzy discard filter |
| `models.js` | `models/*.py` | elevador/chamada/passageiro as plain objects + loose functions, floor-direction rules, state machine |
| `gerador.js` | `simulation/gerador_chamadas.py` | manual call creation + validation (floor-direction rules). The Python original also does seeded-random call generation; this port had that too (mulberry32 PRNG) until the "chamada aleatória"/"geração automática" UI controls were removed as an intentional simplification — no RNG left here now |
| `despachante.js` | `simulation/despachante.py` | picks an elevator (fuzzy or mais-próximo, same 4-level tie-break cascade) |
| `simulador.js` | `simulation/simulador.py` | the single `sim` state object + `executarCiclo(sim)` |
| `building.js` | `interface/painel_edificio.py` | `<canvas>` elevator shafts + DOM floor/call-button list |
| `charts.js` | `interface/painel_graficos.py` | the 3 pertinence graphs, shared between the decision panel and the aptitude calculator, with live drag-to-edit vertices |
| `main.js` | `interface/janela_principal.py` | wires everything: `setTimeout`-based simulation loop (speed-dependent) + a separate `requestAnimationFrame` loop for smooth car/door animation (decoupled, same reasoning as the Python `after()` split), plus the two-phase embarkment modal and the aptitude calculator |

### Capacity is per-elevator, not a module constant

Unlike the Python original (where `CAPACIDADE_MAX_PASSAGEIROS` is a fixed module constant, monkey-patched temporarily only inside the test-tab calculator), this port stores `capacidadeMaxPassageiros`/`capacidadeMaxKg` **on each elevator object** (`criarElevador(id, pavimento, capacidade)`), and floor count lives on `sim.andarMaximo` rather than a `PAVIMENTO_ULTIMO_ANDAR` constant. This is what lets "🏗 Configurar prédio" (in `main.js`) rebuild the *real* running building (not just a hypothetical test scenario) at runtime: it calls `reiniciarSimulacao(sim, seed, {andarMaximo, capacidadePassageiros, parametros})`, which rebuilds the elevators and re-scales the fuzzy controller's `distancia` universe (`criarControladorFuzzy` already supported a configurable `distanciaMaxima` before this feature existed), then `main.js` rebuilds the building DOM/canvas, the distancia chart's x-axis, and the aptitude calculator's floor/capacity `<select>` options to match. When editing anything that assumes a fixed floor count or capacity, check whether it needs to read `sim.andarMaximo` / `sim.capacidadePassageiros` / `elevador.capacidadeMax*` instead of a constant.

### Vertex-drag tie-breaking (`charts.js`)

Corner pertinence terms are defined with 2–3 of their 4 points stacked at the same pixel (e.g. `proxima = [0,0,0,5.5]` has `a=b=c=0`). `encontrarVerticeProximo` must not just grab the first point tied for closest — the classic bug is grabbing `b` when its ceiling is `c` at the exact same spot, so the drag can never move. Ties are broken by picking the candidate with the most `liberdadeDoVertice` (room to move before its neighbors) — same tie-break the Python editor uses in `painel_graficos.py`.

### Two-phase call flow and state machine

Same as the Python original (see that project's CLAUDE.md) — external button only registers floor+direction; the "painel interno" modal (`abrirModalEmbarque` in `main.js`) only appears once the assigned elevator has doors open (`chamadaAguardandoEmbarque`), and floors marked with nobody boarding become `paradasExtras`, committed to only while the elevator isn't empty.
