import crypto from 'crypto';
import { BattleStreams, Teams } from '@pkmn/sim';
import { buildSet } from './buildSet.js';
import { parseLog } from './parseEvents.js';
import { chooseAIAction } from './heuristicAI.js';

const TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

class BattleSession {
  constructor({ id, blueTeam, redTeam, format }) {
    this.id = id;
    this.blueTeam = blueTeam.map(buildSet);
    this.redTeam = redTeam.map(buildSet);
    this.format = format || 'gen9customgame';
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.finished = false;
    this.winner = null;

    this.streams = BattleStreams.getPlayerStreams(
      new BattleStreams.BattleStream()
    );
    this.rawLog = [];
    this.unreadLines = [];
    this.pendingRequest = null;
    this.p2Request = null;
    this.lastBlueActive = null;
    this.lastRedActive = null;
    this.currentTurn = 0;

    this._ownerLoop = this._consumeOmniscient();
    this._p1Loop = this._consumeP1();
    this._p2Loop = this._consumeP2();

    const startOpts = { formatid: this.format };
    this.streams.omniscient.write(
      `>start ${JSON.stringify(startOpts)}\n` +
      `>player p1 ${JSON.stringify({ name: 'Blue', team: Teams.pack(this.blueTeam) })}\n` +
      `>player p2 ${JSON.stringify({ name: 'Red', team: Teams.pack(this.redTeam) })}`
    );
  }

  touch() {
    this.lastActivity = Date.now();
  }

  isExpired() {
    return Date.now() - this.lastActivity > TTL_MS;
  }

  async _consumeOmniscient() {
    for await (const chunk of this.streams.omniscient) {
      for (const line of chunk.split('\n')) {
        if (!line) continue;
        this.rawLog.push(line);
        this.unreadLines.push(line);
        if (line.startsWith('|error|')) {
          this.bootError = line.slice('|error|'.length).trim();
          this.finished = true;
        }
        if (line.startsWith('|win|')) {
          const name = line.slice(5).trim();
          this.winner = name === 'Blue' ? 'blue' : name === 'Red' ? 'red' : null;
          this.finished = true;
        }
        if (line === '|tie' || line.startsWith('|tie|')) {
          this.winner = 'tie';
          this.finished = true;
        }
        if (line.startsWith('|switch|') || line.startsWith('|drag|')) {
          const parts = line.slice(1).split('|');
          const identMatch = /^(p[12])([ab]?): (.+)$/.exec(parts[1]);
          if (identMatch) {
            if (identMatch[1] === 'p1') this.lastBlueActive = identMatch[3];
            else this.lastRedActive = identMatch[3];
          }
        }
      }
    }
  }

  async _consumeP1() {
    for await (const chunk of this.streams.p1) {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('|request|')) continue;
        const json = line.slice('|request|'.length);
        if (!json) continue;
        try {
          this.pendingRequest = JSON.parse(json);
          if (this.pendingRequest.teamPreview) {
            const size = this.pendingRequest.side.pokemon.length;
            const order = Array.from({ length: size }, (_, i) => i + 1).join('');
            this.streams.p1.write(`team ${order}`);
            this.pendingRequest = null;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  async _consumeP2() {
    for await (const chunk of this.streams.p2) {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('|request|')) continue;
        const json = line.slice('|request|'.length);
        if (!json) continue;
        try {
          this.p2Request = JSON.parse(json);
          this._tryAIMove();
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  _tryAIMove() {
    if (!this.p2Request) return;
    const action = chooseAIAction(this.p2Request, this.lastBlueActive);
    if (action === null) return;
    this.streams.p2.write(action);
    this.p2Request = null;
  }

  async waitForRequestOrEnd(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.finished) return;
      if (this.pendingRequest && !this.pendingRequest.wait) return;
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  async choose(choice) {
    if (this.finished) {
      return { error: 'battle already finished' };
    }
    this.touch();

    if (!this.pendingRequest) {
      await this.waitForRequestOrEnd(5000);
      if (!this.pendingRequest && !this.finished) {
        return { error: 'battle is not ready for a choice' };
      }
    }

    const request = this.pendingRequest;
    if (request?.forceSwitch) {
      const idx = parseInt(choice.switch, 10);
      const total = request.side.pokemon.length;
      if (!Number.isFinite(idx) || idx < 1 || idx > total) {
        return { error: 'invalid switch index' };
      }
      this.pendingRequest = null;
      this.streams.p1.write(`switch ${idx}`);
    } else if (request?.active) {
      const moveIdx = parseInt(choice.move, 10);
      if (!Number.isFinite(moveIdx) || moveIdx < 1 || moveIdx > 4) {
        return { error: 'invalid move index' };
      }
      this.pendingRequest = null;
      this.streams.p1.write(`move ${moveIdx}`);
    } else {
      return { error: 'no action expected at this time' };
    }

    await this.waitForRequestOrEnd(15000);
    return this.snapshot();
  }

  takeUnread() {
    const lines = this.unreadLines;
    this.unreadLines = [];
    return lines;
  }

  snapshot() {
    const newLines = this.takeUnread();
    const { events: newEvents, lastTurn } = parseLog(newLines, this.currentTurn);
    this.currentTurn = lastTurn;
    if (this.bootError) {
      return {
        id: this.id,
        finished: true,
        winner: null,
        error: this.bootError,
        request: null,
        newEvents,
      };
    }
    return {
      id: this.id,
      finished: this.finished,
      winner: this.winner,
      request: this.pendingRequest && !this.pendingRequest.wait
        ? this._sanitizeRequest(this.pendingRequest)
        : null,
      newEvents,
    };
  }

  _sanitizeRequest(request) {
    if (!request) return null;
    return {
      teamPreview: !!request.teamPreview,
      forceSwitch: request.forceSwitch || null,
      active: (request.active || []).map((a) => ({
        moves: (a.moves || []).map((m) => ({
          id: m.id,
          move: m.move,
          pp: m.pp,
          maxpp: m.maxpp,
          disabled: !!m.disabled,
        })),
      })),
      side: request.side
        ? {
            pokemon: request.side.pokemon.map((p) => ({
              ident: p.ident,
              details: p.details,
              condition: p.condition,
              active: p.active,
              stats: p.stats,
              moves: p.moves,
              baseAbility: p.baseAbility,
              item: p.item,
              ability: p.ability,
            })),
          }
        : null,
    };
  }
}

class BattleManager {
  constructor() {
    this.battles = new Map();
    this._sweeper = setInterval(() => this._sweep(), SWEEP_INTERVAL_MS);
    this._sweeper.unref?.();
  }

  create({ blueTeam, redTeam, format }) {
    const id = crypto.randomBytes(8).toString('hex');
    const session = new BattleSession({ id, blueTeam, redTeam, format });
    this.battles.set(id, session);
    return session;
  }

  get(id) {
    return this.battles.get(id) || null;
  }

  async waitAndSnapshot(session, timeoutMs = 15000) {
    await session.waitForRequestOrEnd(timeoutMs);
    return session.snapshot();
  }

  _sweep() {
    for (const [id, session] of this.battles) {
      if (session.isExpired() || session.finished) {
        if (session.finished && Date.now() - session.lastActivity < TTL_MS) {
          continue;
        }
        this.battles.delete(id);
      }
    }
  }

  size() {
    return this.battles.size;
  }
}

export const battleManager = new BattleManager();
