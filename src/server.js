import express from 'express';
import { simulateBattle } from './battle.js';

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
  res.json({ status: 'ok' });
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

app.listen(PORT, () => {
  console.log(`pkmn-battle-sim listening on ${PORT}`);
});
