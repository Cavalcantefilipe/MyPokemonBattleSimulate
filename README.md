# MyPokemonBattleSimulate

Microserviço Node.js que simula batalhas Pokémon usando [`@pkmn/sim`](https://www.npmjs.com/package/@pkmn/sim) (o mesmo motor do Pokémon Showdown).

Usado pelo backend Laravel (`myFranksteinBackEnd`) via chamada HTTP interna na rede privada do Railway.

## Endpoints

### `GET /health`

Healthcheck simples.

```json
{ "status": "ok" }
```

### `POST /simulate`

Simula uma batalha entre dois times. Cada lado tem 1–6 Pokémon.

Header obrigatório (se `INTERNAL_TOKEN` estiver definido):

```
Authorization: Bearer <INTERNAL_TOKEN>
```

Body:

```json
{
  "format": "gen9customgame",
  "blueTeam": [
    {
      "species": "pikachu",
      "moves": ["thunderbolt", "quickattack", "irontail", "thunder"],
      "ability": "static",
      "item": "lightball",
      "level": 50
    }
  ],
  "redTeam": [
    {
      "species": "charizard",
      "moves": ["flamethrower", "airslash", "dragonpulse", "solarbeam"],
      "ability": "blaze",
      "item": "charcoal",
      "level": 50
    }
  ]
}
```

Resposta:

```json
{
  "winner": "blue",
  "turns": 13,
  "log": ["|t:|...", "|gametype|singles", "...", "|win|Blue"]
}
```

- `winner`: `"blue"`, `"red"` ou `"tie"`.
- `log`: array de linhas no formato de protocolo do Showdown.

Campos opcionais de um Pokémon: `nickname`, `gender`, `nature`, `evs`, `ivs`, `shiny`. Se `moves` não vier, `tackle` é usado como fallback.

## Dev local

```bash
npm install
cp .env.example .env
npm run dev
```

## Deploy no Railway

Deploy automático via Nixpacks (detecta Node a partir de `package.json`).

Variáveis de ambiente a definir:

- `PORT` — Railway injeta automaticamente.
- `INTERNAL_TOKEN` — token compartilhado com o Laravel.
