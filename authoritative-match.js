'use strict';

const WIDTH = 800;
const STEP = 1 / 40;

function loadNape(file) {
  if (global.nape) return global.nape;
  const previousWindow = global.window;
  if (!global.window) global.window = global;
  try { require(file); }
  finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
  if (!global.nape) throw new Error('Nape failed to initialize on the server.');
  return global.nape;
}
const finite = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

class AuthoritativeMatch {
  constructor(napeFile, seed = 1) {
    this.N = loadNape(napeFile);
    this.randomState = (Number(seed) >>> 0) || 1;
    this.players = new Map();
    this.inputs = { 1: {}, 2: {} };
    this.previousInputs = { 1: {}, 2: {} };
    this.sequence = 0;
    this.scoreSequence = 0;
    this.scoreEvent = null;
    this.scores = [0, 0];
    this.ballState = 'up';
    this.ballSide = 0;
    this.ballHolder = null;
    this.canScore = false;
    this.upperSensorSeen = false;
    this.throwType = 6;
    this.blockSide = 0;
    this.blockIsHuman = true;
    this.restartTicks = 0;
    this.restartSide = 0;
    this.createWorld();
  }

  random() {
    let t = this.randomState = (this.randomState + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  createWorld() {
    const N = this.N, V = N.geom.Vec2;
    const B = N.phys.Body, BT = N.phys.BodyType, P = N.shape.Polygon, C = N.shape.Circle;
    const M = N.phys.Material, F = N.dynamics.InteractionFilter, CB = N.callbacks.CbType;

    this.material = {
      floor: new M(0.4, 1, 1, 0.9, 3),
      ball: new M(1, 0.6, 0.6, 0.7, 1),
      glass: new M(0.5, 1, 1, 1),
      basket: new M(0.35, 2, 2, 1),
      net: new M(0.1, 1, 1, 1),
      player: new M(0, 1, 1, 100, 0)
    };
    this.filter = {
      ball: new F(17, 4368), basket: new F(16, 4353),
      netCollide: new F(17, 4368), netNoCollide: new F(17, 4352),
      arena: new F(4369, 4369), border: new F(4369, 4352),
      player: new F(273, 4096, 4096), playerBlock: new F(273, 4369)
    };
    this.cb = {
      ball: new CB(), player: new CB(), ground: new CB(), border: new CB(), basket: new CB(),
      ring: new CB(), hands: new CB(), block: new CB(), upper: new CB(), down: new CB()
    };
    this.space = new N.space.Space(V.weak(0, 450));
    this.space.worldLinearDrag = 0;
    this.createArena(B, BT, P);
    this.createBasket(-1, B, BT, P, C);
    this.createBasket(1, B, BT, P, C);
    this.createBall(B, BT, C);
    this.registerCollisions();
  }

  createArena(B, BT, P) {
    const body = new B(BT.STATIC, this.N.geom.Vec2.weak(0, 0));
    const add = (r, mat, filter, cb) => {
      const shape = new P(P.rect(r[0], r[1], r[2], r[3]), mat, filter);
      shape.cbTypes.add(cb);
      body.shapes.add(shape);
    };
    add([-50, 420, 900, 60], this.material.floor, this.filter.arena, this.cb.ground);
    add([0, -800, 5, 1300], this.material.floor, this.filter.border, this.cb.border);
    add([795, -800, 5, 1300], this.material.floor, this.filter.border, this.cb.border);
    add([-80, -800, 40, 1300], this.material.floor, this.filter.arena, this.cb.border);
    add([840, -800, 5, 1300], this.material.floor, this.filter.arena, this.cb.border);
    body.space = this.space;
  }

  createBasket(side, B, BT, P, C) {
    const N = this.N, center = side === -1 ? 55 : WIDTH - 55;
    const body = new B(BT.STATIC, N.geom.Vec2.weak(center, 200));
    body.userData.side = side;
    const glassX = side === -1 ? -55 : 43;
    const glass = new P(P.rect(glassX, -100, 12, 120), this.material.glass, this.filter.basket);
    glass.cbTypes.add(this.cb.basket);
    body.shapes.add(glass);
    const upper = new P(P.rect(-25, -10, 50, 5), null, this.filter.basket);
    upper.sensorEnabled = true; upper.cbTypes.add(this.cb.upper); body.shapes.add(upper);
    const down = new P(P.rect(-25, 15, 50, 5), null, this.filter.basket);
    down.sensorEnabled = true; down.cbTypes.add(this.cb.down); body.shapes.add(down);
    body.space = this.space;
    const rimBodies = {};
    for (const x of [center - 30, center, center + 30]) {
      const rimBody = new B(BT.STATIC, N.geom.Vec2.weak(x, 200));
      const rim = new C(7, null, this.material.basket, this.filter.basket);
      rim.sensorEnabled = x === center;
      rim.cbTypes.add(this.cb.ring);
      rimBody.shapes.add(rim);
      rimBody.space = this.space;
      rimBodies[x < center ? "left" : x > center ? "right" : "center"] = rimBody;
    }
    // Recreate the original nine dynamic net segments and their pivot/distance
    // joints so ball-to-net contacts are resolved by the same server Nape world.
    this.createNet(center, rimBodies);
  }

  createNet(center, rimBodies) {
    const N = this.N, B = N.phys.Body, BT = N.phys.BodyType;
    const P = N.shape.Polygon, V = N.geom.Vec2;
    const left = center - 28, middle = center, right = center + 28;
    const top = 203;
    const s = { x: left, y: top }, a = { x: middle, y: top }, r = { x: right, y: top };
    const h = { x: left, y: top + 14 }, u = { x: middle, y: top + 12 }, d = { x: right, y: top + 14 };
    const p = { x: left, y: top + 32 }, f = { x: middle, y: top + 30 }, g = { x: right, y: top + 32 };
    const makeSegment = (point, filter) => {
      const segment = new B(BT.DYNAMIC, V.weak(point.x, point.y));
      segment.shapes.add(new P(P.box(2, 14), this.material.net, filter));
      segment.space = this.space;
      return segment;
    };
    const bodies = [
      makeSegment({ x: s.x, y: (s.y + h.y) / 2 }, this.filter.netCollide),
      makeSegment({ x: h.x, y: (h.y + p.y) / 2 }, this.filter.netCollide),
      makeSegment({ x: r.x, y: (r.y + d.y) / 2 }, this.filter.netCollide),
      makeSegment({ x: d.x, y: (d.y + g.y) / 2 }, this.filter.netCollide),
      makeSegment({ x: a.x, y: (a.y + u.y) / 2 }, this.filter.netNoCollide),
      makeSegment({ x: u.x, y: (u.y + f.y) / 2 }, this.filter.netNoCollide),
      makeSegment({ x: p.x, y: p.y + 4 }, this.filter.netNoCollide),
      makeSegment({ x: g.x, y: g.y + 4 }, this.filter.netNoCollide),
      makeSegment({ x: f.x, y: f.y + 4 }, this.filter.netNoCollide)
    ];
    const Pivot = N.constraint.PivotJoint, Distance = N.constraint.DistanceJoint;
    const local = (body, point) => body.worldPointToLocal(new V(point.x, point.y));
    const addPivot = (first, second, point) => {
      const joint = new Pivot(first, second, local(first, point), local(second, point));
      joint.ignore = true;
      joint.space = this.space;
      return joint;
    };
    addPivot(bodies[0], rimBodies.left, s);
    addPivot(bodies[0], bodies[1], h);
    addPivot(bodies[2], rimBodies.right, r);
    addPivot(bodies[2], bodies[3], d);
    addPivot(bodies[4], rimBodies.center, a);
    addPivot(bodies[4], bodies[5], u);
    addPivot(bodies[1], bodies[6], p);
    addPivot(bodies[3], bodies[7], g);
    addPivot(bodies[5], bodies[8], f);
    const addDistance = (first, second, pointA, pointB, length) => {
      const joint = new Distance(first, second, local(first, pointA), local(second, pointB), length, length);
      joint.stiff = false;
      joint.frequency = 4;
      joint.ignore = true;
      joint.space = this.space;
      return joint;
    };
    addDistance(bodies[0], bodies[4], h, u, 14);
    addDistance(bodies[2], bodies[4], d, u, 14);
    addDistance(bodies[1], bodies[5], p, f, 13);
    addDistance(bodies[5], bodies[3], f, g, 13);
  }

  createBall(B, BT, C) {
    const ball = new B(BT.DYNAMIC, this.N.geom.Vec2.weak(WIDTH / 2, 300));
    const circle = new C(18, null, this.material.ball, this.filter.ball);
    circle.cbTypes.add(this.cb.ball);
    ball.shapes.add(circle);
    ball.gravMass *= 2;
    ball.space = this.space;
    ball.velocity.setxy(0, -500);
    this.ballBody = ball;
  }

  listen(event, type, a, b, fn) {
    this.space.listeners.add(new this.N.callbacks.InteractionListener(event, type, a, b, fn));
  }

  registerCollisions() {
    const E = this.N.callbacks.CbEvent, T = this.N.callbacks.InteractionType;
    this.listen(E.BEGIN, T.COLLISION, this.cb.ball, this.cb.ground, () => this.onGround(true));
    this.listen(E.BEGIN, T.COLLISION, this.cb.ball, this.cb.border, () => this.onGround(false));
    this.listen(E.BEGIN, T.COLLISION, this.cb.ball, this.cb.basket, () => { if (this.ballState !== 'score') this.ballState = 'basket'; });
    this.listen(E.BEGIN, T.COLLISION, this.cb.ball, this.cb.ring, () => { if (this.ballState !== 'score') this.ballState = 'basket'; });
    this.listen(E.BEGIN, T.SENSOR, this.cb.ball, this.cb.hands, e => this.onHands(e));
    this.listen(E.BEGIN, T.COLLISION, this.cb.ball, this.cb.block, e => this.onBlock(e));
    this.listen(E.BEGIN, T.SENSOR, this.cb.ball, this.cb.upper, () => { if (this.canScore) this.upperSensorSeen = true; });
    this.listen(E.BEGIN, T.SENSOR, this.cb.ball, this.cb.down, e => this.onDown(e));
    this.listen(E.BEGIN, T.SENSOR, this.cb.block, this.cb.down, e => {
      const shape=e&&e.int1&&e.int1.castShape, body=shape&&shape.body;
      const player=body&&body.userData&&body.userData.player;
      if(player){
        if(body.shapes.has(player.block))body.shapes.remove(player.block);
        player.blockShape=false;player.serverBlockDisabled=true;
      }
    });
  }

  ensurePlayer(socketSide, playerNo = 0) {
    const key = socketSide + ':' + playerNo;
    if (this.players.has(key)) return this.players.get(key);
    const N = this.N, B = N.phys.Body, BT = N.phys.BodyType, P = N.shape.Polygon;
    // The first movement packet replaces this provisional side with the actual
    // SIDE read from the controlling PlayerObject on that browser.
    const gameSide = socketSide === 1 ? 1 : -1;
    const x = WIDTH / 2 + gameSide * 30;
    const body = new B(BT.DYNAMIC, N.geom.Vec2.weak(x, 385));
    body.userData.socketSide = socketSide;
    body.userData.gameSide = gameSide;
    body.userData.playerNo = playerNo;
    const legs = new P(P.box(20, 70), this.material.player.copy(), this.filter.player);
    legs.cbTypes.add(this.cb.player);
    body.shapes.add(legs);
    const hands = new P(P.box(30, 80));
    hands.sensorEnabled = true;
    hands.cbTypes.add(this.cb.hands);
    body.shapes.add(hands);
    const block = new P(P.rect(-5, 0, 10, -70), this.material.basket, this.filter.basket);
    block.cbTypes.add(this.cb.block);
    const blockBody = new P(P.box(20, 70), this.material.player, this.filter.playerBlock);
    // Match PlayerObject.createBody(): align the legs and hands before calculating
    // its normal mass; block/body shapes are added only when those actions activate.
    body.align();
    const p = {
      socketSide, gameSide, playerNo, body, hands, block, blockBody,
      x, y: 385, vx: 0, vy: 0, rotation: 0, grounded: true,
      baseMass: 3 * body.gravMass, blockMass: 2 * (3 * body.gravMass),
      canTakeInHands: true, blockShape: false, serverBlockDisabled: false,
      facing: -gameSide, isHuman: true, state: 'idle', updatedAt: 0,
      blockBodyActive: false
    };
    body.gravMass = p.baseMass;
    body.allowRotation = false;
    body.userData.player = p;
    body.space = this.space;
    this.players.set(key, p);
    return p;
  }

  setPlayerMovement(socketSide, packet) {
    if ((socketSide !== 1 && socketSide !== 2) || !packet || typeof packet !== 'object') return false;
    const no = clamp(Math.trunc(finite(packet.playerNo)), 0, 1);
    const p = this.ensurePlayer(socketSide, no);
    const suppliedSide = Number(packet.gameSide);
    if (suppliedSide === -1 || suppliedSide === 1) {
      p.gameSide = suppliedSide;
      p.body.userData.gameSide = suppliedSide;
    }
    const x = finite(packet.x, NaN), y = finite(packet.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -50 || x > WIDTH + 50 || y < -100 || y > 740) return false;
    p.x = x; p.y = y;
    p.vx = clamp(finite(packet.vx), -900, 900);
    p.vy = clamp(finite(packet.vy), -1200, 1200);
    p.rotation = clamp(finite(packet.rotation), -Math.PI, Math.PI);
    p.grounded = packet.grounded === true;
    p.canTakeInHands = packet.canTakeInHands !== false;
    p.blockShape = packet.blockShape === true;
    p.blockBodyActive = packet.blockBody === true;
    p.facing = packet.facing === 1 ? 1 : -1;
    p.isHuman = packet.isHuman !== false;
    p.state = typeof packet.state === 'string' ? packet.state.slice(0, 32) : 'idle';
    p.updatedAt = Date.now();
    p.body.position.setxy(p.x, p.y);
    p.body.velocity.setxy(p.vx, p.vy);
    p.body.rotation = p.rotation;
    if (!p.blockShape) p.serverBlockDisabled=false;
    const shouldCollide=p.blockShape&&!p.serverBlockDisabled;
    if (shouldCollide && !p.body.shapes.has(p.block)) p.body.shapes.add(p.block);
    if (!shouldCollide && p.body.shapes.has(p.block)) p.body.shapes.remove(p.block);
    if (p.blockBodyActive && !p.body.shapes.has(p.blockBody)) p.body.shapes.add(p.blockBody);
    if (!p.blockBodyActive && p.body.shapes.has(p.blockBody)) p.body.shapes.remove(p.blockBody);
    p.blockShape=shouldCollide;
    p.body.gravMass=p.blockBodyActive?p.blockMass:p.baseMass;
    return true;
  }

  setInput(socketSide, actions) {
    if ((socketSide !== 1 && socketSide !== 2) || !actions || typeof actions !== 'object') return;
    this.previousInputs[socketSide] = this.inputs[socketSide] || {};
    this.inputs[socketSide] = {
      left: !!actions.left, right: !!actions.right, jump: !!actions.jump,
      down: !!actions.down, shoot: !!actions.shoot, super: !!actions.super
    };
  }

  takeBall(p) {
    if (!p || !p.canTakeInHands || ['shooting', 'inHands', 'score'].includes(this.ballState)) return false;
    if (this.ballBody.space) this.ballBody.space = null;
    this.ballHolder = { socketSide: p.socketSide, gameSide: p.gameSide, playerNo: p.playerNo };
    this.ballSide = p.gameSide; this.ballState = 'inHands';
    this.canScore = false; this.upperSensorSeen = false; this.blockSide = 0;
    return true;
  }

  releaseBall(x, y, vx, vy, state) {
    if (!this.ballBody.space) this.ballBody.space = this.space;
    this.ballBody.position.setxy(x, y); this.ballBody.velocity.setxy(vx, vy);
    this.ballBody.rotation = 0; this.ballBody.angularVel = 0;
    this.ballState = state; this.ballHolder = null;
  }

  action(socketSide, action) {
    if (!action || typeof action.type !== 'string') return false;
    if (action.type === 'shoot') return this.shoot(socketSide, action);
    if (action.type === 'dunk') return this.dunk(socketSide, action);
    if (action.type === 'steal') return this.steal(socketSide, action);
    if (action.type === 'fromHands') return this.fromHands(socketSide, action);
    if (action.type === 'alleyOop') return this.alleyOop(socketSide, action);
    return false;
  }

  shoot(socketSide, a) {
    const no = clamp(Math.trunc(finite(a.playerNo)), 0, 1);
    if (!this.ballHolder || this.ballHolder.socketSide !== socketSide || this.ballHolder.playerNo !== no) return false;
    const p = this.ensurePlayer(socketSide, no), side = p.gameSide;
    const x = clamp(finite(a.x, p.x - side * 20), p.x - 85, p.x + 85);
    const y = clamp(finite(a.y, p.y - 50), p.y - 110, p.y + 30);
    const playerVX = clamp(finite(a.playerVelocityX, p.vx), -900, 900);
    const accuracy = clamp(finite(a.accuracy), 0, 0.5);
    const targetX = side === 1 ? 55 : WIDTH - 55;
    const relX = side === 1 ? x : WIDTH - x;
    let power = relX <= 150 ? 70 : relX <= 250 ? 100 : relX <= 350 ? 0.3 * relX + 40 : relX <= 540 ? 150 : 130;
    power = Math.min(185, power * (1 + 0.1 * (this.random() <= 0.5 ? -1 : 1) * this.random()));
    const g = 900;
    const calcVel = (sx, sy, tx, ty, v) => {
      const vy = -Math.sqrt(Math.max(0, 2 * g * (sy - (ty - v))));
      const time = (-vy / g) + Math.sqrt(2 * v / g);
      return { x: (tx - sx) / Math.max(0.001, time) * 1.035, y: vy };
    };
    const base = calcVel(x, y, targetX, 200, power);
    const vert = y < 235 ? 0 : y >= 295 ? 0.1 : (1 - (295 - y) / 60) * 0.1;
    const range = relX <= 100 ? 0 : relX <= 200 ? 0.01 : relX <= 300 ? 0.02 : relX <= 400 ? 0.03 : relX <= 490 ? 0.04 : relX <= 540 ? 0.01 : 0.07;
    const dispersion = (this.random() < 0.5 ? -1 : 1) * (0.01 + vert + range + Math.abs(playerVX) / 212.5 * 0.1 + accuracy) * this.random();
    const factor = Math.abs(dispersion) <= 0.02 ? 1 : dispersion < -0.08 ? 2 : dispersion > 0.08 ? 3 : 1 + dispersion;
    const velocity = factor < 2 ? { x: base.x * factor, y: base.y } :
      calcVel(x, y, targetX + (factor === 2 ? 30 * side : -30 * side), 200, power);
    const point = finite(a.pointOfThrow, p.x);
    const threeLine = side === 1 ? 500 : WIDTH - 500;
    this.throwType = (point - threeLine) * side >= 0 ? 0 : 6;
    this.ballSide = side; this.blockSide = 0; this.canScore = true; this.upperSensorSeen = false;
    this.releaseBall(x, y, velocity.x, velocity.y, 'shooting');
    this.ballBody.angularVel = side * (5 + 10 * this.random());
    return true;
  }

  dunk(socketSide, a) {
    const no = clamp(Math.trunc(finite(a.playerNo)), 0, 1);
    if (!this.ballHolder || this.ballHolder.socketSide !== socketSide || this.ballHolder.playerNo !== no) return false;
    const p = this.ensurePlayer(socketSide, no), side = p.gameSide;
    const success = this.random() <= clamp(finite(a.chance, 1), 0, 1);
    const x = side === 1 ? (success ? 72 : 55) : (success ? WIDTH - 72 : WIDTH - 55);
    this.throwType = success ? 1 : 9; this.ballSide = side;
    this.blockSide = 0; this.canScore = true; this.upperSensorSeen = false;
    this.releaseBall(x, 170, success ? -260 * side : -550 * side, 400, 'dunk');
    return success;
  }

  steal(socketSide, a) {
    const no = clamp(Math.trunc(finite(a.playerNo)), 0, 1);
    const thief = this.ensurePlayer(socketSide, no);
    if (!this.ballHolder || this.ballHolder.socketSide === socketSide) return false;
    const holder = this.players.get(this.ballHolder.socketSide + ':' + this.ballHolder.playerNo);
    if (!holder || !holder.grounded) return false;
    const low = thief.facing === 1 ? thief.x : thief.x - 55;
    const high = thief.facing === 1 ? thief.x + 55 : thief.x;
    if (holder.x < low || holder.x > high) return false;
    const ratio = clamp(Math.abs(holder.x - thief.x) / 55, 0, 1);
    const direction = holder.x > thief.x ? 1 : -1;
    this.ballSide = holder.gameSide;
    holder.canTakeInHands=false;holder.state='stun';
    if(holder.blockShape){holder.blockShape=false;holder.serverBlockDisabled=true;if(holder.body.shapes.has(holder.block))holder.body.shapes.remove(holder.block);}
    this.canScore = false; this.upperSensorSeen = false;
    this.releaseBall(holder.x, holder.y, direction * (400 + ratio * 200), -100, 'steal');
    return true;
  }

  fromHands(socketSide, a) {
    if (!this.ballHolder || this.ballHolder.socketSide !== socketSide) return false;
    const no = this.ballHolder.playerNo, p = this.ensurePlayer(socketSide, no);
    const x = finite(a.x, p.x), y = finite(a.y, p.y), direction = finite(a.direction, p.gameSide);
    this.canScore = false; this.upperSensorSeen = false;
    this.releaseBall(x, y, 150 * direction, -100, 'down');
    return true;
  }

  alleyOop(socketSide, a) {
    const no = clamp(Math.trunc(finite(a.playerNo)), 0, 1);
    if (!this.ballHolder || this.ballHolder.socketSide !== socketSide || this.ballHolder.playerNo !== no) return false;
    const p = this.ensurePlayer(socketSide, no), side = p.gameSide;
    const x = clamp(finite(a.x, p.x), p.x - 85, p.x + 85);
    const y = clamp(finite(a.y, p.y - 50), p.y - 110, p.y + 30);
    const targetX = side === 1 ? 160 : WIDTH - 160;
    const velocity = this.calcThrowVelocity(x, y, targetX, 150, 150);
    this.ballSide = side; this.blockSide = 0; this.canScore = true; this.upperSensorSeen = false;
    this.throwType = 1;
    this.releaseBall(x, y, velocity.x, velocity.y, 'alleyOop');
    return true;
  }

  calcThrowVelocity(x, y, targetX, targetY, power) {
    const gravity = 900;
    const vy = -Math.sqrt(Math.max(0, 2 * gravity * (y - (targetY - power))));
    const time = (-vy / gravity) + Math.sqrt(2 * power / gravity);
    return { x: (targetX - x) / Math.max(0.001, time) * 1.035, y: vy };
  }

  onGround(ground) {
    if (this.ballState === 'inHands' || this.ballState === 'score') return;
    this.ballState = 'bounce';
    if (ground && this.ballBody.space) this.ballBody.velocity.y = -400;
  }

  onHands(e) {
    const shape = e && e.int2 && e.int2.castShape;
    const body = shape && shape.body;
    const p = body && body.userData && body.userData.player;
    if (p) this.takeBall(p);
  }

  onBlock(e) {
    const ball = e && e.int1 && e.int1.castBody;
    const shape = e && e.int2 && e.int2.castShape;
    const body = shape && shape.body;
    const p = body && body.userData && body.userData.player;
    if (!ball || !p || (ball.position.x - shape.worldCOM.x) * this.ballSide <= 0) return;
    this.ballState = 'block';
    this.ballSide = p.gameSide;
    this.canScore = true; this.upperSensorSeen = false;
    this.blockSide = p.gameSide; this.blockIsHuman = p.isHuman !== false;
  }

  onDown(e) {
    if (!this.canScore || !this.upperSensorSeen) { this.canScore = false; return; }
    const shape = e && e.int2 && e.int2.castShape;
    const body = shape && shape.body;
    const hoopSide = body && body.userData && body.userData.side;
    if (hoopSide !== -1 && hoopSide !== 1) return;
    const blocked = this.blockSide === -hoopSide;
    const points = blocked ? 2 : (this.throwType === 0 ? 3 : 2);
    const isHuman = blocked ? this.blockIsHuman : true;
    const throwType = blocked ? 2 : this.throwType;
    const index = hoopSide === -1 ? 1 : 0;
    this.scores[index] += points;
    this.scoreSequence++;
    this.scoreEvent = { id: this.scoreSequence, basketSide: hoopSide, points, isHuman, throwType, scores: this.scores.slice() };
    this.restartSide = hoopSide;
    this.canScore = false; this.ballState = 'score'; this.ballHolder = null;
    if (this.ballBody.space) this.ballBody.space = null;
    this.restartTicks = 60;
  }

  tick(dt = STEP) {
    for (const p of this.players.values()) {
      if (Date.now() - p.updatedAt > 1000) p.body.velocity.setxy(0, 0);
      else {
        p.body.position.setxy(p.x, p.y);
        p.body.velocity.setxy(p.vx, p.vy);
      }
    }
    for (const side of [1, 2]) {
      this.previousInputs[side] = { ...(this.inputs[side] || {}) };
    }
    if (this.restartTicks > 0 && --this.restartTicks === 0) {
      const restartSide = this.restartSide;
      this.ballState = 'up'; this.ballSide = 0; this.ballHolder = null;
      this.canScore = false; this.upperSensorSeen = false; this.blockSide = 0; this.blockIsHuman = true;
      if (this.ballBody.space) this.ballBody.space = null;
      this.ballBody.position.setxy(WIDTH / 2, 300);
      this.ballBody.velocity.setxy(0, -500); this.ballBody.angularVel = 0;
      this.ballBody.space = this.space;
      // After a score, the original game gives the restart possession to the
      // side defending the basket that was just scored on.
      if (restartSide === -1 || restartSide === 1) {
        const restartPlayer = [...this.players.values()].find(p => p.playerNo === 0 && p.gameSide === restartSide);
        if (restartPlayer) this.takeBall(restartPlayer);
      }
      this.restartSide = 0;
    }
    if (this.ballState !== 'inHands' && this.ballState !== 'score' && this.ballBody.space) this.space.step(dt);
    this.sequence++;
    return this.snapshot();
  }

  snapshot() {
    const holder = this.ballHolder && this.players.get(this.ballHolder.socketSide + ':' + this.ballHolder.playerNo);
    const x = holder ? holder.x : this.ballBody.position.x;
    const y = holder ? holder.y - 35 : this.ballBody.position.y;
    const ball = {
      i: -1, type: 0, typeIndex: 0, x, y, r: this.ballBody.rotation,
      visible: this.ballState !== 'inHands', alpha: 1, state: this.ballState,
      side: this.ballSide, playerNo: this.ballHolder ? this.ballHolder.playerNo : 0,
      holder: this.ballHolder ? { side: this.ballHolder.gameSide, playerNo: this.ballHolder.playerNo } : null,
      body: { x, y, vx: this.ballBody.velocity.x, vy: this.ballBody.velocity.y, rotation: this.ballBody.rotation, angularVel: this.ballBody.angularVel }
    };
    const objects = [...this.players.values()].map(p => ({
      i: p.playerNo, type: 0, typeIndex: 0, side: p.gameSide, playerNo: p.playerNo,
      x: p.x, y: p.y, r: p.rotation, visible: true, alpha: 1, state: p.state,
      withBall: !!(this.ballHolder && this.ballHolder.socketSide === p.socketSide && this.ballHolder.playerNo === p.playerNo),
      grounded: p.grounded, canTakeInHands: p.canTakeInHands, blockShape: p.blockShape,
      body: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, rotation: p.rotation, angularVel: 0 }
    }));
    return { sequence: this.sequence, objects, ball, scores: this.scores.slice(), scoreEvent: this.scoreEvent, ballState: this.ballState };
  }
}

module.exports = { AuthoritativeMatch, STEP };
