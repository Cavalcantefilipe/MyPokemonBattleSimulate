import { Dex } from '@pkmn/sim';

function typesOfSpecies(speciesName) {
  try {
    const species = Dex.species.get(speciesName);
    return species?.types || [];
  } catch {
    return [];
  }
}

function effectivenessOf(moveName, defenderTypes) {
  try {
    const move = Dex.moves.get(moveName);
    if (!move || move.category === 'Status') return 0.5;
    let mult = 1;
    for (const t of defenderTypes) {
      const eff = Dex.types.get(move.type)?.damageTaken?.[t];
      if (eff === undefined) {
        const typeChart = Dex.types.get(t);
        const taken = typeChart?.damageTaken?.[move.type];
        if (taken === 1) mult *= 2;
        else if (taken === 2) mult *= 0.5;
        else if (taken === 3) mult *= 0;
      }
    }
    return mult;
  } catch {
    return 1;
  }
}

function scoreMove(move, defenderTypes) {
  if (move.disabled) return -Infinity;
  if (move.pp !== undefined && move.pp <= 0) return -Infinity;

  const moveData = Dex.moves.get(move.id || move.move);
  if (!moveData) return 0;

  if (moveData.category === 'Status') return 5;

  const power = moveData.basePower || 40;
  const effectiveness = effectivenessOf(moveData.id, defenderTypes);
  const accuracy = moveData.accuracy === true ? 100 : (moveData.accuracy || 100);

  return power * effectiveness * (accuracy / 100);
}

export function chooseAIAction(request, opponentActiveSpecies) {
  if (request.wait) return null;

  if (request.teamPreview) {
    const size = request.side.pokemon.length;
    const order = Array.from({ length: size }, (_, i) => i + 1).join('');
    return `team ${order}`;
  }

  if (request.forceSwitch) {
    const choices = request.forceSwitch.map((mustSwitch, i) => {
      if (!mustSwitch) return 'pass';
      const pokemon = request.side.pokemon;
      const switchable = pokemon
        .map((p, idx) => ({ idx: idx + 1, p }))
        .filter(({ p, idx }) => !p.active && !p.condition.endsWith(' fnt'));
      if (switchable.length === 0) return 'pass';
      return `switch ${switchable[0].idx}`;
    });
    return choices.join(', ');
  }

  if (request.active) {
    const defenderTypes = typesOfSpecies(opponentActiveSpecies);

    const choices = request.active.map((active, i) => {
      const pokemon = request.side.pokemon[i];
      if (!pokemon || pokemon.condition.endsWith(' fnt')) return 'pass';

      const validMoves = (active.moves || [])
        .map((m, idx) => ({ idx: idx + 1, move: m }))
        .filter(({ move }) => !move.disabled && (move.pp === undefined || move.pp > 0));

      if (validMoves.length === 0) {
        const switchable = request.side.pokemon
          .map((p, idx) => ({ idx: idx + 1, p }))
          .filter(({ p }) => !p.active && !p.condition.endsWith(' fnt'));
        if (switchable.length > 0) return `switch ${switchable[0].idx}`;
        return `move 1`;
      }

      let best = validMoves[0];
      let bestScore = -Infinity;
      for (const candidate of validMoves) {
        const score = scoreMove(candidate.move, defenderTypes);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      return `move ${best.idx}`;
    });

    return choices.join(', ');
  }

  return null;
}
