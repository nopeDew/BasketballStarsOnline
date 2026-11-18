'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { AuthoritativeMatch, STEP } = require('../authoritative-match');

const engineDir = path.resolve(__dirname, '..', 'engine-source');
const napePath = path.join(engineDir, 'assets', 'box2dweb', 'nape.min.js');
assert.ok(fs.existsSync(napePath), 'Original Nape library must exist after install.');

const match = new AuthoritativeMatch(napePath, 0xB50);
assert.equal(match.space.gravity.y, 450, 'Server physics uses original gravity.');
assert.equal(match.ballBody.position.x, 400, 'Ball starts at the center of the original 800-unit court.');

assert.equal(match.setPlayerMovement(1, {
  playerNo: 0, x: 340, y: 385, vx: 0, vy: 0, grounded: true,
  canTakeInHands: true, blockShape: false, blockBody: false, facing: -1
}), true);
assert.equal(match.setPlayerMovement(2, {
  playerNo: 0, x: 460, y: 385, vx: 0, vy: 0, grounded: true,
  canTakeInHands: true, blockShape: false, blockBody: false, facing: 1
}), true);
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

console.log('[BSO] Nape physics smoke test passed: world creation, player proxies, basket sensors, scoring.');
