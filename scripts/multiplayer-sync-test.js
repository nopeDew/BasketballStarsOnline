'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sync = read('public/engine-sync.js');
const network = read('public/engine-network.js');
const server = read('server.js');
const physics = read('authoritative-match.js');
const patch = read('scripts/patch-original-game.js');

assert.match(patch, /BSO_ONLINE_P2_CONTROLLER_NATIVE/);
assert.doesNotMatch(patch, /T\.PlayerController2\.prototype\.update\s*=/,
  'The original Player 2 controller update must not be replaced.');
assert.match(network, /window\.__BSO_ONLINE_MATCH\s*\?\s*remote\s*:/,
  'Online input getters must use the unified network input state.');

assert.match(sync, /installServerBallAuthority\(this\)/,
  'Both clients must disable native ball physics and relay ball actions to the server.');
assert.match(sync, /socket\.volatile\.emit\("engineMovement"/,
  'Each player must publish their local avatar transform to the server contact proxy.');
assert.match(sync, /socket\.on\("engineWorldState"/,
  'Clients must consume server-owned physics snapshots.');
assert.match(sync, /installGameplayRenderer\(\)/,
  'Remote visuals must interpolate during pre-render, not only fixed-step updates.');
assert.match(sync, /INTERPOLATION_DELAY_MS=50/,
  'Server world state should use a short render buffer.');
assert.match(sync, /player\.body\.space!==null\)player\.body\.space=null/,
  'The remote player body must not run a second local physics simulation.');
assert.match(sync, /const local=detachRemotePlayerBodies\(this\);[\s\S]*?original\.call\(this,dt\)/,
  'Remote bodies must be detached before the native physics step.');
assert.match(sync, /latest&&latest\.sequence>lastAppliedSequence/,
  'Discrete server state should only be applied once per new snapshot.');
assert.match(sync, /const changed=md\.matchScore\[0\]!==s\.scores\[0\]/,
  'Score UI must not redraw when the server score is unchanged.');
assert.doesNotMatch(sync, /if\(player&&player\.body&&player\.body\.space!==null\)player\.body\.space=null/,
  'Nape body changes must not happen during the pre-render callback.');
assert.match(patch, /this\.game\.time\.desiredFps = 60/,
  'Phaser should render at 60 FPS.');
assert.match(patch, /DESIRED_FRAME_TIME = \.025/,
  'The original 40 Hz fixed physics step must be preserved.');
assert.match(server, /this\.game\.time\.desiredFps = 60/,
  'The server must only serve the 60 FPS patched bundle.');
assert.match(sync, /player===localPlayer\)continue/,
  'Server contact-state updates must not overwrite the local controller state.');

assert.match(server, /new AuthoritativeMatch\(napePath, room\.seed\)/,
  'Each match must own its own server-side Nape world.');
assert.match(server, /socket\.on\("engineMovement"/);
assert.match(server, /socket\.on\("engineBallAction"/);
assert.match(server, /room\.authoritativeMatch\.tick\(AUTHORITATIVE_STEP\)/,
  'The server must advance the physics world at a fixed step.');
assert.match(server, /volatile\.emit\("engineWorldState", state\)/,
  'Old physics snapshots must be dropped instead of queued.');
assert.doesNotMatch(server, /socket\.on\("engineState"/,
  'P1 browser snapshots must not be treated as the physics authority.');

assert.match(physics, /this\.space\.step\(dt\)/);
assert.match(physics, /this\.onHands\(e\)/,
  'Server Nape must resolve player/ball pickup contacts.');
assert.match(physics, /this\.onDown\(e\)/,
  'Server Nape must resolve basket scoring sensors.');
assert.match(physics, /createNet\(/,
  'Server physics must include dynamic net bodies.');

console.log('Server ball-physics and Player 2 presentation regression checks passed.');
