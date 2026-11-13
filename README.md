# Basketball Stars Online

A real-time, server-authoritative 1v1 basketball game with private rooms. The lobby supports room codes, character selection, ready-up, live player movement, ball possession, shooting, steals, blocks, scoring, and overtime.

**Gameplay note:** The supplied Basketball Stars web build redirects to an externally hosted game and its bundled playable build is Basketball Legends 2019. The current repository still runs its own synchronized 2D basketball gameplay client/server; it does not yet embed the Basketball Legends 2019 engine or its original animations/assets.

## Deploy on Render

Create a **Web Service** connected to this repository:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Optional health check path: `/health`

Render supplies the `PORT` environment variable automatically.

## Play

1. Open the deployed site in two browser windows/devices.
2. On the first device, enter a player name and select **CREATE COURT**.
3. Share the six-character room code.
4. On the second device, enter the code and select **JOIN COURT**.
5. Each player chooses a different legend and selects **I'M READY**.
6. Play using A/D or arrow keys to move, W/up to jump, hold Space to shoot, Shift to steal, double-tap a direction to dash, and E to use the character ability. Mobile touch controls are also included.

The server owns the physics and broadcasts authoritative game snapshots to both players, so movement, possession, shots, scores, and the game clock are shared. Each player can open **Customize Your Controls** and assign their own keys independently; bindings are saved on that device and do not affect the opponent. Both players can use the same keyboard layout.

## Tech

- Node.js + Express
- Socket.IO for room membership, player input, and live state
- Server-side 60 FPS simulation with 30 FPS snapshots
- Canvas-based responsive 2D client
