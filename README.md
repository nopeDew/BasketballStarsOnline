# Basketball Stars Online

An online 1v1 integration for the original **Basketball Legends 2019** game. The lobby is separate, but gameplay uses the original game engine and its native InputManager, PlayerController, physics, court, players, and animations.

## Multiplayer model

- **Both clients run the original native game simulation.** Each local player controller and physics world remains active, so movement, jumps, blocks, shots, and other actions respond immediately on the device where the key is pressed.
- The Node server is a low-latency room/input/state relay. It does not run a second Nape world or recreate the game's physics.
- Both players' controls are relayed into the original InputManager as soon as keys change. A short heartbeat repairs missed key-up events.
- Gameplay sockets use a persistent WebSocket rather than a long-polling fallback. Player 1 sends each current snapshot once to the server; the server only drops stale frames at the final delivery hop.
- Both clients run the original gameplay/physics loop at 60 Hz. Player 1 publishes compact authoritative match snapshots at the same 60 Hz cadence; volatile delivery drops stale frames rather than queuing them.
- Player 2 predicts its own local movement in the native game loop. It does not overwrite its own moving avatar with an older host snapshot; when local input is idle, small host corrections are blended in smoothly.
- Player 2 adaptively buffers host snapshots (25–70 ms based on measured arrival jitter) and interpolates the remote player and shared game state. Short gaps are extrapolated in both axes and rotation, while local simulation is preserved for its own player and locally predicted ball possession/shots.

This is **client-predicted, host-reconciled original-engine simulation**. Player 1 remains the authority for final shared state and snapshots, while both clients simulate locally for responsive controls.

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

The GitHub Actions workflow installs and patches the original game, checks JavaScript syntax, and runs multiplayer regression checks for 60 Hz simulation, matching snapshot cadence, native controllers on both clients, and Player 2 local prediction/reconciliation. A real two-device match is still needed to verify control feel and latency after deployment.
