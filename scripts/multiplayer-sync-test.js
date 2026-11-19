'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sync = read('public/engine-sync.js');
const network = read('public/engine-network.js');
const server = read('server.js');
const patch = read('scripts/patch-original-game.js');

assert.match(server, /socket\.on\("engineState"/,
  'The server must relay host snapshots.');
assert.match(server, /player\.side !== 1/,
  'Only Player 1 may publish the authoritative original-game snapshot.');
assert.match(server, /volatile\.emit\("engineState", state\)/,
  'Stale snapshots must be dropped under network pressure.');
assert.doesNotMatch(server, /AuthoritativeMatch|authoritativeMatch|engineWorldState|engineBallAction/,
  'The server must not run a second physics simulation.');

assert.match(sync, /socket\.volatile\.emit\("engineState",makeSnapshot\(this\)\)/,
  'Player 1 must publish snapshots from its native game simulation.');
assert.match(sync, /socket\.on\("engineState"/,
  'Player 2 must consume the host snapshots.');
assert.ok(
  !sync.includes("function detachP2NonLocalPhysics") &&
  !sync.includes("function disableP2RemoteController") &&
  !sync.includes("controller.update=function(){}"),
  'Player 2 must retain the original native player and ball physics/controllers.');
assert.ok(
  sync.includes("else if(latest){") &&
  sync.includes("applySnapshot(this,latest,dt,isNew);"),
  'Player 2 must smoothly reconcile the latest host snapshot on each native game update.');
assert.ok(sync.includes("original.call(this,dt);"),
  'Both clients must keep the original game-core update.');
assert.ok(sync.includes("expectedSide=Number(window.__BSO_NET_GAME_SIDE);"),
  'Player 2 local avatar detection needs a stable side fallback.');

assert.match(network, /window\.__BSO_ONLINE_MATCH\s*\?\s*remote\s*:/,
  'Online controls must pass through the shared network InputManager state.');
assert.match(patch, /this\.game\.time\.desiredFps = 40/,
  'Keep the original 40 Hz timing.');
assert.match(patch, /renderer: Phaser\.AUTO,/,
  'Keep the original automatic renderer selection.');
assert.doesNotMatch(patch, /T\.PlayerController2\.prototype\.update\s*=/,
  'Preserve the original Player 2 controller update method.');

console.log('Original host-physics and Player 2 load-reduction checks passed.');
