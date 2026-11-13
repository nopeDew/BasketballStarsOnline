# Basketball Stars Online

A browser-based **online 1v1 basketball game** using the Hoop Duel gameplay and private-room flow. There is no 2v2 mode or mode-selection screen.

## Deploy on Render

Create a **Web Service** connected to this repository:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Optional health check path: `/health`

Render supplies the `PORT` environment variable automatically.

## How to play

1. Open the deployed site.
2. Enter a player name and select **CREATE COURT**.
3. Share the six-character room code.
4. The other player enters the code and selects **JOIN COURT**.
5. Both players select **I'M READY** to start the 1v1 game.

Controls are shown below the court in-game. Player 1 uses A/D/W; Player 2 uses the arrow keys. Both use Space to shoot and Shift to steal.

## Tech

- Node.js + Express
- Socket.IO rooms and real-time input/state synchronization
- Server-side game physics and scoring
