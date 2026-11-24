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

assert.match(sync, /socket\.emit\("engineState",makeSnapshot\(this\)\)/,
  'Player 1 must send snapshots without a second client-side volatile drop gate.');
assert.doesNotMatch(sync, /socket\.volatile\.emit\("engineState",makeSnapshot\(this\)\)/,
  'Player 1 must not discard snapshots before they reach the server.');
assert.match(sync, /socket\.on\("engineState"/,
  'Player 2 must consume the host snapshots.');
assert.ok(sync.includes("if(b&&p){"),
  'Player 2 must apply authoritative host body transforms for both players and the ball.');
assert.doesNotMatch(sync, /physics\.update=function\(\)\{\}/,
  'Player 2 must keep the original physics simulation running locally.');
assert.match(sync, /controllerProto\.update=function\(\)/,
  'Player 2 native controller instrumentation must wrap rather than disable the update.');
assert.match(sync, /return controllerUpdate\.apply\(this,arguments\)/,
  'Player 2 native controller wrapper must still invoke the original update.');
assert.match(sync, /const localP2InputActive=!!\(localP2Input\.left\|\|localP2Input\.right\|\|localP2Input\.jump/,
  'Player 2 local input must be predicted without waiting for host snapshots.');
assert.match(sync, /if\(side===2&&player===localP2\)\{/,
  'Host snapshots must not rewind Player 2 while it is actively controlling its local avatar.');
assert.match(sync, /applyObject\(player,item,0\.12,null\)/,
  'Idle Player 2 state should reconcile smoothly instead of snapping.');
assert.match(sync, /let protectLocalP2BallUntil=0;/,
  'Player 2 ball possession and shot prediction should be protected from stale host snapshots.');

assert.ok(sync.includes("const INTERPOLATION_MIN_MS=25,INTERPOLATION_MAX_MS=70;") &&
  sync.includes("function extrapolateSnapshot(state,elapsedMs)") &&
  sync.includes("return extrapolateSnapshot(last.state,target-last.receivedAt);"),
  'Player 2 should use buffer snapshots and briefly extrapolate when packet arrival is late.');
assert.ok(!sync.includes("if(isLocallyControlledP2(player))continue;") &&
  sync.includes("applyObject(player,item,alpha,null);"),
  'The authoritative host snapshot must update Player 2’s own avatar too.');
assert.ok(sync.includes('if(typeof item.blockShape==="boolean"'),
  'Player 2 must mirror host block state.');
assert.ok(
  sync.includes("function interpolateSnapshot(previous,current,t)") &&
  sync.includes("const INTERPOLATION_MIN_MS=25,INTERPOLATION_MAX_MS=70;") &&
  sync.includes("function extrapolateSnapshot(state,elapsedMs)") &&
  sync.includes("function sampleSnapshotBuffer(now)") &&
  sync.includes("snapshotBuffer.push({state,receivedAt});"),
  'Player 2 must buffer and interpolate host snapshots to smooth network jitter.');
assert.match(sync, /function getInterpolationDelayMs\(\)\{return Math\.min\(INTERPOLATION_MAX_MS,INTERPOLATION_MIN_MS\+snapshotJitterMs\*2\);\}/,
  'Interpolation delay must adapt to measured arrival jitter instead of adding a fixed delay.');
assert.match(sync, /const dy=Number\.isFinite\(body\.vy\)\?body\.vy\*seconds:0/,
  'Snapshot extrapolation must keep vertical motion moving between late packets.');
assert.match(sync, /const dr=Number\.isFinite\(body\.angularVel\)\?body\.angularVel\*seconds:0/,
  'Snapshot extrapolation must preserve rotation between late packets.');
assert.ok(sync.includes("function installP2RenderLoop()") &&
  sync.includes("State.prototype.update=function(){") &&
  sync.includes("applySnapshot(core,renderSnapshot,16.6667,isNew);"),
  'Player 2 must apply interpolated host snapshots after the original per-render update.');
assert.ok(!sync.includes("applySnapshot(this,renderSnapshot,dt,isNew);"),
  'Player 2 must not apply interpolated snapshots only inside the fixed-step simulation loop.');
assert.ok(sync.includes("original.call(this,dt);"),
  'Both clients must keep the original game-core update.');
assert.ok(sync.includes("player.controller instanceof Controller"),
  'Player 2 local avatar detection must identify its native PlayerController2 instance.');

assert.match(network, /io\(\{transports:\["websocket"\],upgrade:false/,
  'Gameplay must use a persistent WebSocket instead of falling back to long-polling.');
assert.match(network, /window\.__BSO_ONLINE_MATCH\s*\?\s*remote\s*:/,
  'Online controls must pass through the shared network InputManager state.');
assert.match(patch, /this\.game\.time\.desiredFps = 60/,
  'Both clients must render at 60 FPS.');
assert.match(patch, /e\.DESIRED_FRAME_TIME = 1 \/ 60/,
  'Both clients must advance original gameplay logic and physics at 60 Hz.');
assert.match(sync, /snapshotNow-lastSend>=1000\/60/,
  'The host must publish authoritative snapshots at the same 60 Hz cadence.');
assert.match(sync, /controllerProto\.update=function\(\)/,
  'Player 2 controller activity must be visible in the diagnostics HUD.');
assert.match(sync, /socket\.io&&socket\.io\.engine&&socket\.io\.engine\.transport/,
  'The diagnostics HUD must expose the active socket transport.');
assert.match(patch, /renderer: Phaser\.AUTO,/,
  'Keep the original automatic renderer selection.');
assert.match(patch, /window\.__BSO_PlayerObject = b\.PlayerObject/,
  'Expose the original player class so Player 2 can disable duplicate local simulation.');
assert.match(network, /setInterval\(\(\)=>sendLocal\(\),100\)/,
  'Reliable input-state heartbeats must repair missed key-up events.');

console.log('60 Hz native simulation and Player 2 prediction/reconciliation checks passed.');
