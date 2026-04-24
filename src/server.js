import express from 'express';
import { simulateBattle } from './battle.js';
import { battleManager } from './battleManager.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || '';

function requireInternalToken(req, res, next) {
  if (!INTERNAL_TOKEN) return next();
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== INTERNAL_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', activeBattles: battleManager.size() });
});

app.post('/simulate', requireInternalToken, async (req, res) => {
  try {
    const { blueTeam, redTeam, format, seed } = req.body || {};

    if (!Array.isArray(blueTeam) || !Array.isArray(redTeam)) {
      return res.status(400).json({ error: 'blueTeam and redTeam must be arrays' });
    }
    if (blueTeam.length === 0 || redTeam.length === 0) {
      return res.status(400).json({ error: 'teams must have at least 1 pokemon' });
    }
    if (blueTeam.length > 6 || redTeam.length > 6) {
      return res.status(400).json({ error: 'teams can have at most 6 pokemon' });
    }

    const result = await simulateBattle({
      blueTeam,
      redTeam,
      format: format || 'gen9customgame',
      seed,
    });

    res.json(result);
  } catch (err) {
    console.error('simulate error:', err);
    res.status(500).json({ error: 'simulation_failed', message: err.message });
  }
});

app.post('/battles', requireInternalToken, async (req, res) => {
  try {
    const { blueTeam, redTeam, format } = req.body || {};
    if (!Array.isArray(blueTeam) || !Array.isArray(redTeam)) {
      return res.status(400).json({ error: 'blueTeam and redTeam must be arrays' });
    }
    if (blueTeam.length === 0 || redTeam.length === 0) {
      return res.status(400).json({ error: 'teams must have at least 1 pokemon' });
    }
    if (blueTeam.length > 6 || redTeam.length > 6) {
      return res.status(400).json({ error: 'teams can have at most 6 pokemon' });
    }

    const session = battleManager.create({
      blueTeam,
      redTeam,
      format: format || 'gen9customgame',
    });
    const snapshot = await battleManager.waitAndSnapshot(session);
    res.json(snapshot);
  } catch (err) {
    console.error('create battle error:', err);
    res.status(500).json({ error: 'create_failed', message: err.message });
  }
});

app.post('/battles/:id/choose', requireInternalToken, async (req, res) => {
  const session = battleManager.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'battle_not_found' });
  }
  try {
    const result = await session.choose(req.body || {});
    if (result?.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('choose error:', err);
    res.status(500).json({ error: 'choose_failed', message: err.message });
  }
});

app.get('/battles/:id', requireInternalToken, (req, res) => {
  const session = battleManager.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'battle_not_found' });
  }
  session.touch();
  res.json(session.snapshot());
});

app.listen(PORT, () => {
  console.log(`pkmn-battle-sim listening on ${PORT}`);
});
