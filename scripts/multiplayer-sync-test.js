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
assert.ok(sync.includes("if(b&&p){"),
  'Player 2 must apply authoritative host body transforms for both players and the ball.');
assert.ok(sync.includes("function installP2PresentationOnly(core)") &&
  sync.includes('physics.update=function(){}') &&
  sync.includes("this.currentMove=0;this.currentDash=0;this.currentJump=false;"),
  'Player 2 must not run a duplicate physics or controller simulation.');
assert.ok(!sync.includes("if(isLocallyControlledP2(player))continue;") &&
  sync.includes("applyObject(player,item,alpha,null);"),
  'The authoritative host snapshot must update Player 2’s own avatar too.');
assert.ok(sync.includes('if(typeof item.blockShape==="boolean"'),
  'Player 2 must mirror host block state.');
assert.ok(
  sync.includes("function interpolateSnapshot(previous,current,t)") &&
  sync.includes("const renderAt=performance.now()-15;") &&
  sync.includes("previousSnapshot=latest;previousSnapshotAt=latestSnapshotAt;"),
  'Player 2 must interpolate between buffered host snapshots instead of chasing discrete updates.');
assert.ok(sync.includes("applySnapshot(this,renderSnapshot,dt,isNew);"),
  'Player 2 must apply the interpolated snapshot on each native game update.');
assert.ok(sync.includes("original.call(this,dt);"),
  'Both clients must keep the original game-core update.');
assert.ok(sync.includes("player.controller instanceof Controller"),
  'Player 2 local avatar detection must identify its native PlayerController2 instance.');

assert.match(network, /window\.__BSO_ONLINE_MATCH\s*\?\s*remote\s*:/,
  'Online controls must pass through the shared network InputManager state.');
assert.match(patch, /this\.game\.time\.desiredFps = 40/,
  'Keep the original 40 Hz timing.');
assert.match(patch, /renderer: Phaser\.AUTO,/,
  'Keep the original automatic renderer selection.');
assert.match(patch, /window\.__BSO_PlayerObject = b\.PlayerObject/,
  'Expose the original player class so Player 2 can disable duplicate local simulation.');
assert.match(network, /setInterval\(\(\)=>sendLocal\(\),100\)/,
  'Reliable input-state heartbeats must repair missed key-up events.');

console.log('Original host-physics and native Player 2 controller checks passed.');
