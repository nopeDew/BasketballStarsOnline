# Basketball Stars Online

A Render-ready Node.js + Socket.IO service scaffold for private 1v1 lobbies.

## Deploy on Render

Create a **Web Service** connected to this repository:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`

The service serves the lobby page at `/` and health check at `/health`. No environment variables are required; Render supplies `PORT`.

## Current status

- [x] Render-compatible Node server
- [x] Create/join private lobbies with six-character codes
- [x] Two-player room limit and disconnect handling
- [x] Socket.IO input-relay foundation
- [ ] Copy the original Basketball Stars game files and binary assets into this repository
- [ ] Connect the game's local two-player simulation to the Socket.IO input relay
- [ ] Remove non-1v1 modes from the original game UI

**Important:** This commit is the lobby/server foundation, not yet the copied playable Basketball Stars game. The uploaded archive includes binary assets and a large game bundle that cannot be bulk-transferred through the available GitHub editing connection. The original game must still be added and its local two-player controls wired into the relay before this is a playable online game.

Keep the supplied original-project MIT copyright and license notice with the game files when adding them.
