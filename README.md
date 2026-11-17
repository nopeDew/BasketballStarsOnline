# Basketball Stars Online

An online 1v1 integration for the original **Basketball Legends 2019** game. The lobby is separate, but the gameplay is the original game engine and its own InputManager, PlayerController, physics, court, players, and animations.

## What the online patch changes

The Render install step extracts the original source archive and patches the actual `basketball_legends_2019.f.js` bundle before serving it. The patch:
- Hooks both native player input slots into the live Socket.IO input states.
- Exposes the original MainGameCore and the actual native menu states used by this exact source build.
- Starts the native two-player setup automatically after both people ready up.
- Leaves the original character-selection screen open; each player presses **PLAY**, and the server starts the match only after both are ready.
- Routes Player 2 inputs directly into the original `PlayerController2` update loop.
- Leaves keyboard events available to the original selection UI until gameplay begins, then captures and relays the correct player controls.
- Keeps the original two-player menu path available and allows Phaser to fall back to Canvas where WebGL is unavailable.

Player 1 runs the authoritative original-game simulation and sends match snapshots to Player 2 at approximately 30 updates per second. Both clients receive the same Player 1 and Player 2 control states, while Player 2 applies the host's state snapshots to correct simulation drift.

## How to play

1. Open the deployed site on two separate devices.
2. Player 1 enters a name and selects **CREATE COURT**.
3. Share the six-character room code.
4. Player 2 enters the code and selects **JOIN**.
5. Both players select **I'M READY**.
6. The original game opens its native character-selection screen. Take your time choosing your player.
7. Each player presses the original **PLAY** button. The match starts on both devices only after both players have pressed it.
8. Both devices use the same defaults: A/D to move, W to jump, S to block/down, J to shoot, and K for the special action. Controls can be changed in the online overlay.

## Deploy on Render

Create a **Web Service** connected to this repository:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Optional health check path: `/health`

The `postinstall` command extracts `BasketballStarsUnblocked.github.io-main.zip` into `engine-source/` and then runs `scripts/patch-original-game.js` against the extracted original JavaScript bundle. The server refuses to serve the gameplay bundle if the source patch markers are missing. Render supplies `PORT` automatically.

## Testing status and limitation

The source-patch script was run against a fresh extraction of the uploaded original game archive, and the patched game bundle and server/client JavaScript passed syntax checks. The project still needs a real two-device browser test after Render rebuilds it. The original title was designed for local play, so the browser-based state replication can still have timing or physics drift and is not yet independently verified as production-grade multiplayer.
