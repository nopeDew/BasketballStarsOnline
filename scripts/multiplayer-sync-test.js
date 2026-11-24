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
assert.ok(sync.includes("function installP2ControllerHooks()") &&
  sync.includes("installP2ControllerHooks();") &&
  sync.includes("function installP2PresentationOnly(core)") &&
  sync.includes('physics.update=function(){}') &&
  sync.includes("this.currentMove=0;this.currentDash=0;this.currentJump=false;"),
  'Player 2 must not run a duplicate physics or controller simulation.');

assert.ok(sync.includes("const P2_INPUT_PREDICTION_MS=40;") &&
  sync.includes("const isLocalP2Controller=Controller===window.__BSO_PlayerController2;") &&
  sync.includes("if(isLocalP2Controller){") &&
  sync.includes("this.currentSuper=false;this.currentBlockOrPump=false;"),
  'Player 2 should predict local horizontal movement while keeping other actions host-authoritative.');

assert.ok(sync.includes("const INTERPOLATION_DELAY_MS=25;") &&
  sync.includes("function extrapolateSnapshot(state,elapsedMs)") &&
  sync.includes("return extrapolateSnapshot(last.state,target-last.receivedAt);"),
  'Player 2 should use lower-latency interpolation and short extrapolation through snapshot gaps.');
assert.ok(!sync.includes("if(isLocallyControlledP2(player))continue;") &&
  sync.includes("applyObject(player,item,alpha,null);"),
  'The authoritative host snapshot must update Player 2’s own avatar too.');
assert.ok(sync.includes('if(typeof item.blockShape==="boolean"'),
  'Player 2 must mirror host block state.');
assert.ok(
  sync.includes("function interpolateSnapshot(previous,current,t)") &&
  sync.includes("const INTERPOLATION_DELAY_MS=25;") &&
  sync.includes("function extrapolateSnapshot(state,elapsedMs)") &&
  sync.includes("function sampleSnapshotBuffer(now)") &&
  sync.includes("snapshotBuffer.push({state,receivedAt});"),
  'Player 2 must interpolate using a jitter-tolerant rolling snapshot buffer.');
assert.ok(sync.includes("function installP2RenderLoop()") &&
  sync.includes("State.prototype.update=function(){") &&
  sync.includes("applySnapshot(core,renderSnapshot,16.6667,isNew);"),
  'Player 2 must apply interpolated host snapshots after the original per-render update.');
assert.ok(!sync.includes("applySnapshot(this,renderSnapshot,dt,isNew);"),
  'Player 2 must not apply interpolated snapshots only inside the 40 Hz simulation loop.');
assert.ok(sync.includes("original.call(this,dt);"),
  'Both clients must keep the original game-core update.');
assert.ok(sync.includes("player.controller instanceof Controller"),
  'Player 2 local avatar detection must identify its native PlayerController2 instance.');

assert.match(network, /window\.__BSO_ONLINE_MATCH\s*\?\s*remote\s*:/,
  'Online controls must pass through the shared network InputManager state.');
assert.match(patch, /window\.__BSO_NET_LOCAL_SIDE\) === 2\) \? 60 : 40/,
  'Player 2 must render at 60 Hz while Player 1 keeps the 40 Hz simulation.');
assert.match(patch, /renderer: Phaser\.AUTO,/,
  'Keep the original automatic renderer selection.');
assert.match(patch, /window\.__BSO_PlayerObject = b\.PlayerObject/,
  'Expose the original player class so Player 2 can disable duplicate local simulation.');
assert.match(network, /setInterval\(\(\)=>sendLocal\(\),100\)/,
  'Reliable input-state heartbeats must repair missed key-up events.');

console.log('Original host-physics and native Player 2 controller checks passed.');
