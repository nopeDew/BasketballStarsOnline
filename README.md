# Basketball Stars Online

An online 1v1 integration for the original **Basketball Legends 2019** game. The lobby is separate, but gameplay uses the original game engine and its native InputManager, PlayerController, physics, court, players, and animations.

## Multiplayer model

- **Player 1 runs the original game's full native simulation.** Its physics, ball possession, steals, shots, blocks, rims, backboards, nets, and scoring remain in the original browser game engine.
- The Node server is only a room/input/state relay. It does not run a second Nape world or recreate the game's physics.
- Player 1 sends compact match snapshots to Player 2 at the original 40 Hz game cadence. Snapshot messages use volatile delivery, so stale frames are dropped instead of queued.
- Player 2 is a presentation client, not a second simulation. It sends its controls to Player 1, disables its duplicate physics step and player-controller actions, and renders both players and the ball from the host's authoritative snapshots.
- Player 2 interpolates a rolling buffer of host snapshots and renders at 60 Hz while Player 1 keeps the original 40 Hz simulation. Both players see the same authoritative body positions, velocities, animation states, facing direction, possession, and block state.
- Both players' controls are relayed into the original InputManager. Input changes are sent immediately, with a low-rate heartbeat to repair missed key-up events.

This is **host-authoritative original-engine simulation**, not dedicated-server physics. The server relays Player 1's original simulation; it does not calculate player movement or ball physics itself.

## Online features

- Private six-character rooms, ready-up, reconnect handling, and leave-match flow.
- Live team/character selection synchronization.
- Separate per-player WASD or arrow-key layouts, with custom key bindings.
- Original player controllers, animations, and physics.

## How to play

1. Open the deployed site on two separate devices.
2. Player 1 enters a name and selects **CREATE COURT**.
3. Share the six-character room code.
4. Player 2 enters the code and selects **JOIN**.
5. Both players select **I'M READY**.
6. Each player chooses a character in the original selection screen.
7. Both players press the original **PLAY** button to start the match.

## Deploy on Render

Use a Node web service with `npm install` as the build command and `npm start` as the start command. The install step extracts the original game archive and runs `scripts/patch-original-game.js`. The health-check path is `/health`.

## Verification

The GitHub Actions workflow installs and patches the original game, checks JavaScript syntax, and runs multiplayer architecture regression checks, including Player 2's presentation-only architecture and authoritative body updates. A real two-device match is still needed to verify control feel and latency after deployment.
