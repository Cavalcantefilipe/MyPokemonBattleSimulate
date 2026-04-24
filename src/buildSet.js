import { Dex } from '@pkmn/sim';

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
    moves:
      Array.isArray(entry.moves) && entry.moves.length > 0
        ? entry.moves
        : ['tackle'],
    nature: entry.nature || 'Hardy',
    level: entry.level ?? 50,
    evs: entry.evs || { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 },
    ivs: entry.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    shiny: entry.shiny || false,
  };
}
