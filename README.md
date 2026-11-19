# Basketball Stars Online

An online 1v1 wrapper around the original **Basketball Legends 2019** browser game.

## Physics and synchronization model

- Each match creates its own **server-side Nape physics world**. The Node server advances it at a fixed 40 Hz step.
- The server simulates the ball, ball flight, pickup/contact sensors, player/ball collisions, blocks, rim and backboard contacts, dynamic net segments, steals, and basket scoring. Both clients receive the server's world snapshots; neither browser simulates the ball.
- Each player's original character controller and movement remain native and locally responsive. Clients send their own player transform to the server, where it is used as a contact proxy for the authoritative ball simulation. Player locomotion itself is not yet server-authoritative.
- The client removes the remote avatar before the native physics update and removes the ball from its local Nape world. It keeps local physics only for the locally controlled character, and interpolates the opponent and server-owned ball before each render using a 50 ms snapshot buffer. Phaser presentation is configured for 60 FPS while the original game simulation remains at a 40 Hz fixed step.
- World snapshots are replaceable state and use volatile delivery. Under network pressure, stale frames are dropped instead of building a queue. Discrete actions such as shooting, dunking, stealing, and passing remain reliable requests that the server validates.

This deliberately keeps the original player controller intact while moving ball/game-contact physics to the server. Making player locomotion itself server-authoritative would require porting the original movement controller and its full collision/action rules; this implementation does not claim that part is finished.

## Online features

- Private six-character rooms, ready-up, reconnect handling, and leave-match flow.
- Live team/character selection synchronization.
- A shared seed to reduce random gameplay differences.
- Separate per-player WASD or arrow-key layouts, with custom key bindings.
- Original character movement, animations, and controller behavior.

## How to play

1. Open the deployed site on two separate devices.
2. Player 1 creates a court and shares the six-character code.
3. Player 2 joins using that code.
4. Both players ready up, select their characters, and press the original PLAY button.
5. Use the controls shown in the in-game panel.

## Deploy on Render

Use a Node web service with `npm install` as the build command and `npm start` as the start command. The install step extracts the original game assets and applies the online input/selection hooks. The optional health-check path is `/health`.

## Verification

The GitHub Actions workflow installs the original Nape assets, runs syntax and architecture regression checks, and executes server physics smoke tests for world creation, player contact proxies, basket scoring, and steal resolution. Client performance safeguards detach remote physics bodies before the native step and avoid repeated score-UI updates. A live two-device match is still required to verify latency, control feel, and real-world rendering performance.
