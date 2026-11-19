'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { AuthoritativeMatch, STEP } = require('../authoritative-match');

const engineDir = path.resolve(__dirname, '..', 'engine-source');
const napePath = path.join(engineDir, 'assets', 'box2dweb', 'nape.min.js');
assert.ok(fs.existsSync(napePath), 'Original Nape library must exist after install.');

const match = new AuthoritativeMatch(napePath, 0xB50);
assert.equal(match.ensurePlayer(1, 0).gameSide, -1, "Network Player 1 owns the original left/WASD side.");
assert.equal(match.ensurePlayer(2, 0).gameSide, 1, "Network Player 2 owns the original right/arrow side.");
assert.equal(match.space.gravity.y, 450, 'Server physics uses original gravity.');
assert.equal(match.ballBody.position.x, 400, 'Ball starts at the center of the original 800-unit court.');

assert.equal(match.setPlayerMovement(1, {
  playerNo: 0, gameSide: 1, x: 340, y: 385, vx: 0, vy: 0, grounded: true,
  canTakeInHands: true, blockShape: false, blockBody: false, facing: -1
}), true);
assert.equal(match.setPlayerMovement(2, {
  playerNo: 0, gameSide: -1, x: 460, y: 385, vx: 0, vy: 0, grounded: true,
  canTakeInHands: true, blockShape: false, blockBody: false, facing: 1
}), true);
assert.equal(match.ensurePlayer(1, 0).gameSide, -1, "The server ignores an incorrect client-reported side for Player 1.");
assert.equal(match.ensurePlayer(2, 0).gameSide, 1, "The server ignores an incorrect client-reported side for Player 2.");
match.tick(STEP);

// Put a server-owned shot directly above the left hoop and send it downward.
// The upper and down sensors must trigger a score in the authoritative Nape world.
if (!match.ballBody.space) match.ballBody.space = match.space;
match.ballBody.position.setxy(55, 180);
match.ballBody.velocity.setxy(0, 600);
match.ballState = 'shooting';
match.ballSide = 1;
match.canScore = true;
match.upperSensorSeen = false;
match.throwType = 6;

for (let i = 0; i < 12 && !match.scoreEvent; i++) match.tick(STEP);

assert.ok(match.scoreEvent, 'A ball passing through the basket sensors produces a server score event.');
assert.equal(match.scoreEvent.basketSide, -1, 'The left basket reports its original SIDE=-1 value.');
assert.equal(match.scoreEvent.points, 2, 'A normal server-validated shot awards two points.');
assert.equal(match.scores[1], 2, 'The authoritative score array updates on the server.');

// A steal request uses the original directional 55px window and only requires
// the ball-holder to be grounded. The attacking player may be airborne because
// the original controller starts the steal animation before the server resolves it.
const stealMatch = new AuthoritativeMatch(napePath, 0xB51);
const holder = stealMatch.ensurePlayer(1, 0);
stealMatch.setPlayerMovement(1, {
  playerNo: 0, gameSide: 1, x: 370, y: 385, vx: 0, vy: 0, grounded: true,
  canTakeInHands: true, canDoAction: true, blockShape: false, blockBody: false, facing: -1
});
stealMatch.setPlayerMovement(2, {
  playerNo: 0, gameSide: -1, x: 400, y: 385, vx: 0, vy: 0, grounded: false,
  canTakeInHands: true, canDoAction: false, blockShape: false, blockBody: false, facing: -1
});
assert.equal(stealMatch.takeBall(holder), true, 'The server can assign initial possession.');
assert.equal(stealMatch.steal(2, { playerNo: 0, attackX: 400, direction: -1 }), true,
  'A valid directional steal succeeds even when the attacker is airborne.');
assert.equal(stealMatch.ballState, 'steal', 'A successful steal releases the server-owned ball.');
assert.equal(holder.state, 'stun', 'The server applies the stolen player stun state.');
assert.equal(holder.canTakeInHands, false, 'A stunned ball-holder cannot immediately pick the ball up again.');

console.log('[BSO] Nape physics smoke test passed: world creation, player proxies, basket scoring and server steal resolution.');
