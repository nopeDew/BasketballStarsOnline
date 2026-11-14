# Basketball Stars Online

An online 1v1 lobby for the original **Basketball Legends 2019** game. The original game engine, characters, court, animations, and physics are preserved; the online layer supplies room pairing, two-player input relay, and host-to-client match-state synchronization.

## How an online match works

1. Open the deployed site on two separate devices.
2. Player 1 enters a name and selects **CREATE COURT**.
3. Share the six-character room code with Player 2.
4. Player 2 enters the code and selects **JOIN**.
5. Both players select **I'M READY**.
6. Both devices automatically enter the original game's 1-v-1 mode. No extra menu selections are required.
7. Each device controls its assigned side. Default controls are A/D to move, W to jump, S to block/down, J to shoot, and K for the special action. Controls can be remapped in the in-game online panel.

The online controller connects to the original game's own input manager rather than replacing its player controllers. Both clients receive the opponent's input state through Socket.IO. Player 1's game state is also sent to Player 2 to reduce physics and timing drift.

## Deploy on Render

Create a **Web Service** connected to this repository:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Optional health check path: `/health`

The install script extracts the user-supplied source archive, `BasketballStarsUnblocked.github.io-main.zip`, into `engine-source/`. The server removes the source mirror's redirect and serves the original game locally at `/play`. Render supplies the `PORT` environment variable automatically.

## Important limitation

The original game was designed for local play, not network play. This project uses client-side game simulations with relayed inputs and a host snapshot stream; it is not a dedicated server-authoritative game engine. Different browser performance or missed frames can still cause visual/physics drift. A real two-device match must be tested after deployment before the multiplayer build can be described as fully verified.

## Health check

`/health` returns whether the server is running and whether the original game engine bundle was extracted successfully.
