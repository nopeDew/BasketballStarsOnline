'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sync = read('public/engine-sync.js');
const network = read('public/engine-network.js');
const server = read('server.js');
const patch = read('scripts/patch-original-game.js');

assert.match(patch, /BSO_ONLINE_P2_CONTROLLER_NATIVE/);
assert.doesNotMatch(patch, /T\.PlayerController2\.prototype\.update\s*=/,
  'The original Player 2 controller update must not be replaced.');
assert.match(network, /window\.__BSO_ONLINE_MATCH\s*\?\s*remote\s*:/,
  'Online input getters must use the unified network input state.');
assert.match(sync, /function sampleSnapshot\(now\)/,
  'Player 2 must interpolate from a snapshot buffer.');
assert.match(sync, /expectedSide.*window\.__BSO_NET_GAME_SIDE/,
  'Player 2 must be identified by its stable online side if its controller is wrapped.');
assert.match(sync, /INTERPOLATION_DELAY_MS\s*=\s*50/);
assert.match(sync, /MAX_EXTRAPOLATION_MS\s*=\s*60/);
assert.match(sync, /socket\.volatile\.emit\("engineState"/,
  'Host snapshots must not build a reliable stale-frame queue.');
assert.match(server, /volatile\.emit\("engineState", state\)/,
  'The server must drop stale snapshot frames under congestion.');
assert.doesNotMatch(sync, /core\.isPaused\s*=\s*!\!s\.paused/,
  'A host tab pause must not pause Player 2 local gameplay.');
assert.doesNotMatch(server, /AuthoritativeMatch|engineWorldState|engineBallAction/,
  'The duplicate server physics implementation must stay removed.');

console.log('Player 2 native-controller and snapshot-sync architecture checks passed.');
