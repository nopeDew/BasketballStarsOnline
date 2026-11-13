# Basketball Stars Online

A Hoop Duel-style private-room lobby for launching the original Basketball Stars game. The lobby supports two players per room and has no 2v2 mode-selection screen.

## Deploy on Render

Create a **Web Service** connected to this repository:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Optional health check path: `/health`

Render supplies the `PORT` environment variable automatically.

## How to use the lobby

1. Open the deployed site.
2. Enter a player name and select **CREATE COURT**.
3. Share the six-character room code.
4. The other player enters the code and selects **JOIN COURT**.
5. Both players select **I'M READY** to launch the original Basketball Stars game.

## Important multiplayer limitation

The room code and ready-up flow are multiplayer. The original Basketball Stars game is loaded from its existing hosted version in an iframe; its gameplay state is not synchronized between the two players by this lobby.

## Tech

- Node.js + Express
- Socket.IO for private rooms, player presence, and ready-up events
- Original Basketball Stars game loaded after both players are ready
