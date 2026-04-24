import { BattleStreams, Teams, PRNG } from '@pkmn/sim';
import { buildSet } from './buildSet.js';

class RandomPlayer extends BattleStreams.BattlePlayer {
  constructor(playerStream, prng) {
    super(playerStream);
    this.prng = prng;
  }

  receiveRequest(request) {
    if (request.wait) return;

    if (request.teamPreview) {
      const size = request.side.pokemon.length;
      const order = Array.from({ length: size }, (_, i) => i + 1).join('');
      return this.choose(`team ${order}`);
    }

    if (request.forceSwitch) {
      const choices = request.forceSwitch.map((mustSwitch) => {
        if (!mustSwitch) return 'pass';
        const pokemon = request.side.pokemon;
        const switchable = pokemon
          .map((p, i) => ({ idx: i + 1, p }))
          .filter(({ p, idx }) => !p.active && !p.condition.endsWith(' fnt') && idx !== 1);
        if (switchable.length === 0) return 'pass';
        const pick = this.prng.sample(switchable);
        return `switch ${pick.idx}`;
      });
      return this.choose(choices.join(', '));
    }

    if (request.active) {
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
          if (switchable.length > 0) {
            const pick = this.prng.sample(switchable);
            return `switch ${pick.idx}`;
          }
          return `move 1`;
        }

        const pick = this.prng.sample(validMoves);
        return `move ${pick.idx}`;
      });
      return this.choose(choices.join(', '));
    }
  }
}

export async function simulateBattle({ blueTeam, redTeam, format, seed }) {
  const p1set = blueTeam.map(buildSet);
  const p2set = redTeam.map(buildSet);

  const p1spec = { name: 'Blue', team: Teams.pack(p1set) };
  const p2spec = { name: 'Red', team: Teams.pack(p2set) };

  const battleSeed = seed || undefined;
  const streams = BattleStreams.getPlayerStreams(
    new BattleStreams.BattleStream()
  );

  const p1 = new RandomPlayer(streams.p1, new PRNG());
  const p2 = new RandomPlayer(streams.p2, new PRNG());

  void p1.start();
  void p2.start();

  const startOpts = { formatid: format };
  if (battleSeed) startOpts.seed = battleSeed;

  void streams.omniscient.write(
    `>start ${JSON.stringify(startOpts)}\n` +
    `>player p1 ${JSON.stringify(p1spec)}\n` +
    `>player p2 ${JSON.stringify(p2spec)}`
  );

  const log = [];
  let winner = null;
  let turns = 0;

  for await (const chunk of streams.omniscient) {
    for (const line of chunk.split('\n')) {
      if (!line) continue;
      log.push(line);
      if (line.startsWith('|turn|')) {
        turns = parseInt(line.split('|')[2], 10) || turns;
      }
      if (line.startsWith('|win|')) {
        const name = line.slice(5).trim();
        winner = name === 'Blue' ? 'blue' : name === 'Red' ? 'red' : null;
      }
      if (line.startsWith('|tie')) {
        winner = 'tie';
      }
    }
  }

  return { winner, turns, log };
}
