function parseIdent(ident) {
  const match = /^(p[12])([ab]?): (.+)$/.exec(ident || '');
  if (!match) return { side: null, name: ident || '' };
  return { side: match[1], name: match[3] };
}

function parseCondition(condition) {
  if (!condition) return null;
  if (condition.endsWith(' fnt')) {
    return { hp: 0, maxHp: 1, status: 'fnt' };
  }
  const [hpPart, status] = condition.split(' ');
  const [cur, max] = hpPart.split('/').map((v) => parseInt(v, 10));
  return {
    hp: Number.isFinite(cur) ? cur : 0,
    maxHp: Number.isFinite(max) ? max : 100,
    status: status || null,
  };
}

export function parseLog(lines, startingTurn = 0) {
  const events = [];
  let currentTurn = startingTurn;

  for (const raw of lines) {
    if (!raw || !raw.startsWith('|')) continue;
    const parts = raw.slice(1).split('|');
    const kind = parts[0];

    switch (kind) {
      case 'turn': {
        currentTurn = parseInt(parts[1], 10) || currentTurn;
        events.push({ turn: currentTurn, type: 'turn', number: currentTurn });
        break;
      }
      case 'switch':
      case 'drag': {
        const { side } = parseIdent(parts[1]);
        const details = parts[2] || '';
        const speciesFromDetails = details.split(',')[0].trim();
        const cond = parseCondition(parts[3]);
        events.push({
          turn: currentTurn,
          type: 'switch',
          side,
          name: speciesFromDetails,
          details,
          hp: cond?.hp ?? null,
          maxHp: cond?.maxHp ?? null,
        });
        break;
      }
      case 'move': {
        const source = parseIdent(parts[1]);
        const target = parseIdent(parts[3]);
        events.push({
          turn: currentTurn,
          type: 'move',
          actorSide: source.side,
          actorName: source.name,
          move: parts[2],
          targetSide: target.side,
          targetName: target.name,
        });
        break;
      }
      case '-damage':
      case '-heal': {
        const { side, name } = parseIdent(parts[1]);
        const cond = parseCondition(parts[2]);
        events.push({
          turn: currentTurn,
          type: kind === '-damage' ? 'damage' : 'heal',
          side,
          name,
          hp: cond?.hp ?? 0,
          maxHp: cond?.maxHp ?? 1,
          status: cond?.status ?? null,
        });
        break;
      }
      case '-crit': {
        const { side, name } = parseIdent(parts[1]);
        events.push({ turn: currentTurn, type: 'crit', side, name });
        break;
      }
      case '-supereffective': {
        const { side, name } = parseIdent(parts[1]);
        events.push({ turn: currentTurn, type: 'supereffective', side, name });
        break;
      }
      case '-resisted': {
        const { side, name } = parseIdent(parts[1]);
        events.push({ turn: currentTurn, type: 'resisted', side, name });
        break;
      }
      case '-immune': {
        const { side, name } = parseIdent(parts[1]);
        events.push({ turn: currentTurn, type: 'immune', side, name });
        break;
      }
      case '-miss': {
        const { side, name } = parseIdent(parts[1]);
        events.push({ turn: currentTurn, type: 'miss', side, name });
        break;
      }
      case '-status': {
        const { side, name } = parseIdent(parts[1]);
        events.push({
          turn: currentTurn,
          type: 'status',
          side,
          name,
          status: parts[2],
        });
        break;
      }
      case 'faint': {
        const { side, name } = parseIdent(parts[1]);
        events.push({ turn: currentTurn, type: 'faint', side, name });
        break;
      }
      case 'win': {
        const name = parts[1].trim();
        const winner = name === 'Blue' ? 'blue' : name === 'Red' ? 'red' : null;
        events.push({ turn: currentTurn, type: 'win', winner });
        break;
      }
      case 'tie': {
        events.push({ turn: currentTurn, type: 'win', winner: 'tie' });
        break;
      }
      default:
        break;
    }
  }

  return { events, lastTurn: currentTurn };
}
