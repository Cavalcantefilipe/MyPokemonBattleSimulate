import { Dex } from '@pkmn/sim';

const MAX_MOVES = 4;

function resolveMoves(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return ['tackle'];
  const seen = new Set();
  const valid = [];
  for (const m of raw) {
    const move = Dex.moves.get(m);
    if (!move?.exists) continue;
    if (seen.has(move.id)) continue;
    seen.add(move.id);
    valid.push(move.id);
    if (valid.length >= MAX_MOVES) break;
  }
  return valid.length > 0 ? valid : ['tackle'];
}

export function buildSet(entry) {
  const rawSpecies = String(entry.species || entry.name || '').trim();
  if (!rawSpecies) throw new Error('pokemon entry missing species');

  const resolved = Dex.species.get(rawSpecies);
  const species = resolved?.exists ? resolved.name : rawSpecies;

  return {
    name: entry.nickname || species,
    species,
    gender: entry.gender || '',
    item: entry.item || '',
    ability: entry.ability || '',
    moves: resolveMoves(entry.moves),
    nature: entry.nature || 'Hardy',
    level: entry.level ?? 50,
    evs: entry.evs || { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 },
    ivs: entry.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    shiny: entry.shiny || false,
  };
}
