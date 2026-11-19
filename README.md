# Basketball Stars Online

An online 1v1 wrapper around the original **Basketball Legends 2019** browser game. The original game engine, physics, court, player controllers, and animations remain intact.

## Multiplayer model

- Player 1 runs the original game's native physics simulation. This keeps collisions, ball possession, steals, shots, blocks, rims, backboards, nets, and scoring inside the real game engine instead of approximating them in a second physics implementation.
- The server accepts match snapshots only from Player 1, validates their size and sequence, and relays them to Player 2.
- Player 2 runs their own character movement locally and reconciles the opponent, ball, possession, animation state, and score against Player 1's snapshots.
- Both players' input states are relayed through Socket.IO so Player 1's original two-player simulation receives Player 2's controls.
- This is **host-authoritative original-engine simulation**, not server-side physics. A true dedicated-server simulation would require porting the complete original game physics and gameplay rules; the previous partial Nape recreation was removed because it did not preserve the game's native movement and ball lifecycle.

## Online features

- Private six-character rooms, ready-up, reconnect handling, and leave-match flow.
- Live team/character selection synchronization.
- A shared seed to reduce random gameplay differences.
- Separate per-player WASD or arrow-key layouts, with custom key bindings.
- Original player controllers and animations retained.

## How to play

1. Open the deployed site on two separate devices.
2. Player 1 creates a court and shares the six-character code.
3. Player 2 joins using that code.
4. Both players ready up, select their characters, and press the original PLAY button.
5. Use the controls shown in the in-game panel.

## Deploy on Render

Use a Node web service with `npm install` as the build command and `npm start` as the start command. The install step extracts the original game assets and applies the online input/selection hooks. The optional health-check path is `/health`.

## Verification status

The original game simulation and snapshot relay are restored in the repository. Automated checks for the former duplicate server physics have been removed. A live two-device match still needs to be tested after Render deploys this recovery commit.
