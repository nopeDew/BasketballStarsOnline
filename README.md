# Basketball Stars Online

An online 1v1 wrapper around the original **Basketball Legends 2019** browser game. The original game engine, physics, court, player controllers, and animations remain intact.

## Multiplayer model

- Player 1 runs the original game's native physics simulation. This keeps collisions, ball possession, steals, shots, blocks, rims, backboards, nets, and scoring inside the real game engine instead of approximating them in a second physics implementation.
- The server accepts match snapshots only from Player 1, validates their size and sequence, and relays them to Player 2.
- Player 2 keeps the original Player 2 controller update loop and local movement simulation. Its InputManager reads the network input state directly, while the opponent and ball are rendered from a short interpolation buffer of Player 1's snapshots.
- Both players' input states are relayed through Socket.IO so both copies of the original two-player simulation receive the same controls. Online input getters use one network input source rather than mixing network and separately-polled local keyboard state.
- Snapshot state is sent as replaceable, volatile data: when the connection falls behind, stale frames are dropped instead of building a queue. Player 2 interpolates with a 50 ms buffer and extrapolates only briefly across packet gaps.
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

The original Player 2 controller update loop is preserved, the network InputManager is the sole online input source, and Player 2 renders buffered host snapshots with short-gap extrapolation. Automated syntax and architecture checks run on pushes. A live two-device match is still required to verify real frame pacing and movement.
