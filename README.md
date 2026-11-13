# Basketball Stars Online

An online 1v1 lobby and keyboard-input relay for the original **Basketball Legends 2019** game build. The original game engine, characters, animations, court, physics, and native two-player mode are supplied through the engine Git submodule; this project does not replace the gameplay with a new basketball game.

## How it works

- The lobby creates private six-character room codes and supports two players, ready-up, reconnecting, and leaving.
- Once both players are ready, each browser opens the original game build.
- Each player selects **2 PLAYERS** in the original game's title menu.
- The browser translates that player's chosen keys into the original game's Player 1 or Player 2 controls.
- Socket.IO relays the action states to the opponent's browser, where the opposite native player's keys are synthesized.
- Both players can use the same physical keyboard layout. Key bindings are saved per device in local storage.
- The shared random seed is passed to both browsers to reduce simulation divergence.

**Important technical limitation:** The original game was built for local two-player play, not network play. This implementation relays inputs while each browser runs its own copy of the original game simulation. It is not a server-authoritative simulation or a streamed single shared game state, so timing or physics can drift between devices. It must be tested in a real two-device match before it can be called fully synchronized.

## Deploy on Render

Create a **Web Service** connected to this repository:
- Runtime: Node
- Build command: **npm install**
- Start command: **npm start**
- Optional health check path: **/health**

The postinstall script initializes the pinned game-engine submodule. Render supplies the PORT environment variable automatically.

## Play

1. Open the deployed site on two separate devices.
2. On the first device, enter a name and select **CREATE COURT**.
3. Share the six-character room code.
4. On the second device, enter the code and select **JOIN**.
5. Both players select **I'M READY**.
6. When the game opens, both players select **2 PLAYERS** in the original game's title menu.
7. Open **CUSTOMIZE YOUR CONTROLS** in the online overlay to remap movement, jump, down/block, shoot, and special-action keys.

The default physical layout is A/D to move, W to jump, S to down/block, J to shoot, and K for special. Those keys are translated to the correct native keys for whichever player side the room assigns.

## Tech

- Original Basketball Legends 2019 browser game build (pinned Git submodule)
- Node.js + Express
- Socket.IO private rooms and player input relay
