(()=> {
"use strict";
const socket=window.__BSO_SOCKET;
const params=new URLSearchParams(location.search);
const side=Number(params.get("side")||1);
window.__BSO_HOST_PRESENTATION=side===2;
if(!socket){console.error("[BSO] Socket.IO client was not initialized.");return;}
let latest=null,snapshotSequence=0,lastReceivedSequence=0,lastAppliedSequence=0,lastScoreEventId=0;
let ownerTrackingInstalled=false;
const snapshotBuffer=[];
const INTERPOLATION_DELAY_MS=25;
const diag={fps:0,phaserFps:0,desiredFps:0,framePacing:"40 FPS · host-matched",gameUps:0,coreMs:0,syncMs:0,packetHz:0,sentHz:0,renderHz:0,packetAgeMs:null,sequenceGaps:0,lastSequence:0,renderer:"unknown",renderHook:"waiting",interpolationDelayMs:INTERPOLATION_DELAY_MS,localPlayerFound:false,localPlayerY:null,localPlayerGrounded:null,localPlayerVy:null,hostBallState:null,hostHolder:null,localHolders:null};
window.__BSO_SYNC_DIAG=diag;
let rafFrames=0,renderFrames=0,gameUpdates=0,coreMsTotal=0,syncMsTotal=0,packetCount=0,snapshotSentCount=0,diagWindowStart=performance.now(),lastPacketAt=0;
const clamp=n=>Number.isFinite(n)?n:0;
function startDiagnostics(){
 setInterval(()=>{
  const now=performance.now(),elapsed=Math.max(1,now-diagWindowStart);
  diag.fps=Math.round(rafFrames*1000/elapsed);
  diag.renderHz=Math.round(renderFrames*1000/elapsed);
  diag.gameUps=Math.round(gameUpdates*1000/elapsed);
  diag.coreMs=+(coreMsTotal/Math.max(1,gameUpdates)).toFixed(2);
  diag.syncMs=+(syncMsTotal/Math.max(1,gameUpdates)).toFixed(2);
  diag.packetHz=+(packetCount*1000/elapsed).toFixed(1);
  diag.sentHz=+(snapshotSentCount*1000/elapsed).toFixed(1);
  diag.packetAgeMs=lastPacketAt?Math.round(now-lastPacketAt):null;
  // Both clients use the original game's 40 Hz fixed-step pace.
  rafFrames=renderFrames=gameUpdates=packetCount=snapshotSentCount=0;coreMsTotal=syncMsTotal=0;diagWindowStart=now;
 },1000);
 const installHud=()=>{
  if(!document.body){setTimeout(installHud,100);return;}
  const hud=document.createElement("div");
  hud.id="bso-sync-diagnostics";
  hud.style.cssText="display:none;position:fixed;right:10px;bottom:10px;z-index:2147483647;max-width:310px;padding:10px 12px;border:1px solid #d6a94e;border-radius:9px;background:#07111eee;color:#fff;font:12px/1.55 ui-monospace,monospace;white-space:pre;pointer-events:none";
  document.body.appendChild(hud);
  let visible=false;
  window.addEventListener("keydown",event=>{
   if(event.code==="F8"&&!event.repeat){visible=!visible;hud.style.display=visible?"block":"none";event.preventDefault();}
  },true);
  setInterval(()=>{
   if(!visible)return;
   const controller=window.__BSO_P2_CONTROLLER_DEBUG;
   const remote=window.__BSO_REMOTE_INPUT_PACKETS||0;
   hud.textContent=[
    "BSO SYNC DIAGNOSTICS · P"+side,
    "Phaser state updates/sec: "+diag.fps,
    "Phaser pre-render/sec: "+diag.renderHz,
    "Phaser measured FPS: "+diag.phaserFps,
    "Phaser target FPS: "+diag.desiredFps,
    "Frame pacing: "+diag.framePacing,
    "P2 frame pacing: "+diag.framePacing,
    "Renderer: "+diag.renderer,
    "Render interpolation: "+diag.renderHook+" · "+diag.interpolationDelayMs+" ms buffer",
    "Game updates/sec: "+diag.gameUps,
    "Core update: "+diag.coreMs+" ms",
    "Network sync: "+diag.syncMs+" ms",
    "Movement updates sent/sec: "+diag.sentHz,
    "Server physics snapshots/sec: "+diag.packetHz,
    "Socket: "+(socket.connected?"connected":"disconnected")+" · "+((socket.io&&socket.io.engine&&socket.io.engine.transport&&socket.io.engine.transport.name)||"connecting"),
    "Physics authority: server Nape",
    "Transport writable: "+!!(socket.io&&socket.io.engine&&socket.io.engine.transport&&socket.io.engine.transport.writable),
    "Last snapshot age: "+(diag.packetAgeMs===null?"none":diag.packetAgeMs+" ms"),
    "Sequence gaps: "+diag.sequenceGaps,
    "Last sequence: "+diag.lastSequence,
    "Remote input packets: "+remote,
    "P2 controls: "+(side===2?"local prediction + host correction":(controller?"active":"not reporting")),
    "P2 simulation: "+(side===2?"local sim · host corrects opponent/ball":"authoritative host sim"),
    "Host ball state: "+(diag.hostBallState||"unknown"),
    "Host ball holder: "+(diag.hostHolder||"none"),
    "Local ball holders: "+(diag.localHolders||"none"),
    "Local P2 avatar: "+(diag.localPlayerFound?"detected":"not found"),
    "Local avatar Y: "+(diag.localPlayerY===null?"n/a":diag.localPlayerY),
    "Grounded: "+(diag.localPlayerGrounded===null?"n/a":diag.localPlayerGrounded),
    "Vertical velocity: "+(diag.localPlayerVy===null?"n/a":diag.localPlayerVy),
    "Press F8 to hide"
   ].join("\n");
  },200);
 };
 installHud();
}
startDiagnostics();
function readBody(body){
 if(!body||!body.position||!body.velocity)return null;
 return {x:clamp(body.position.x),y:clamp(body.position.y),vx:clamp(body.velocity.x),vy:clamp(body.velocity.y),rotation:clamp(body.rotation),angularVel:clamp(body.angularVel)};
}
function readObject(o,index,typeIndex,core){
 const g=o&&o.graphic,b=o&&o.body;
 const item={i:index,type:Number.isFinite(o&&o.objType)?o.objType:null,typeIndex};
 if(Number.isFinite(o&&o.SIDE))item.side=o.SIDE;
 if(Number.isFinite(o&&o.playerNo))item.playerNo=o.playerNo;
 if(g){item.x=clamp(g.x);item.y=clamp(g.y);item.r=clamp(g.rotation);item.visible=g.visible!==false;item.alpha=clamp(g.alpha);if(g.scale&&Number.isFinite(g.scale.x))item.scaleX=g.scale.x;if(g.scale&&Number.isFinite(g.scale.y))item.scaleY=g.scale.y;}
 const body=readBody(b);if(body)item.body=body;
 if(b)item.physicsActive=b.space!==null;
 if(typeof o.state==="string")item.state=o.state;
 if(typeof o.withBall==="boolean")item.withBall=o.withBall;
 if(typeof o.isGrounded==="boolean")item.grounded=o.isGrounded;
 if(typeof o.isHuman==="boolean")item.human=o.isHuman;
 if(typeof o.isWaiting==="boolean")item.waiting=o.isWaiting;
 if(typeof o.SIDE==="number")item.side=o.SIDE;
 for(const flag of ["canAct","canTakeInHands","canDoAction","isBlockedOrPump","isSuperShot","needBlock","isUnderEmotion","readyForDash","readyForSuper","attackJump","canThrow","isRestart"]){if(typeof o[flag]==="boolean")item[flag]=o[flag];}
 if(o&&o.body&&o.blockBody&&o.body.shapes&&typeof o.body.shapes.has==="function")item.blockShape=!!o.body.shapes.has(o.blockBody);
 if(o===core.ball&&b)item.physicsSpace=b.space===null?0:b.space===o.space2?2:b.space===o.space1?1:3;
 return item;
}
function installBallOwnerTracking(core){
 const ball=core&&core.ball;
 if(!ball)return;
 const proto=Object.getPrototypeOf(ball);
 if(proto&&!proto.__bsoOwnerTrackingInstalled&&typeof proto.setState==="function"){
  const nativeSetState=proto.setState;
  proto.setState=function(state,team,playerNo,force){
   if(state==="inHands"){
    this.__bsoHolderSide=Number.isFinite(team)?team:this.SIDE;
    this.__bsoHolderNo=Number.isFinite(playerNo)?playerNo:0;
   }else{
    this.__bsoHolderSide=null;
    this.__bsoHolderNo=null;
   }
   return nativeSetState.apply(this,arguments);
  };
  proto.__bsoOwnerTrackingInstalled=true;
 }
 if(!ownerTrackingInstalled){
  ownerTrackingInstalled=true;
  if(ball.state==="inHands"&&!Number.isFinite(ball.__bsoHolderNo)){
   const holder=[...(core.playersLeft||[]),...(core.playersRight||[])].find(p=>p&&p.withBall);
   if(holder){ball.__bsoHolderSide=holder.SIDE;ball.__bsoHolderNo=holder.playerNo;}
  }
 }
}
function makeSnapshot(core){
 // The 1v1 match only needs authoritative player bodies plus the dedicated ball.
 const players=[...(core.playersLeft||[]),...(core.playersRight||[])];
 const objects=players.map((o,i)=>readObject(o,i,0,core)).filter(Boolean);
 const inv=window.__BSO_Inventory,md=inv&&inv.instance&&inv.instance.matchData;
 let holder=null;
 if(core.ball&&core.ball.state==="inHands"&&Number.isFinite(core.ball.__bsoHolderSide)&&Number.isFinite(core.ball.__bsoHolderNo)){
  holder=players.find(p=>p&&p.SIDE===core.ball.__bsoHolderSide&&p.playerNo===core.ball.__bsoHolderNo)||null;
 }
 if(!holder)holder=players.find(p=>p&&p.withBall)||null;
 const ball=core.ball?readObject(core.ball,-1,0,core):null;
 if(ball){
  ball.holder=holder?{side:holder.SIDE,playerNo:holder.playerNo}:null;
  if(holder){ball.side=holder.SIDE;ball.playerNo=holder.playerNo;}
 }
 return {
  sequence:++snapshotSequence,
  objects,
  ball,
  playing:!!core.isPlaying,paused:!!core.isPaused,scored:!!core.isScored,waiting:!!core.isWaiting,
  ended:!!core.isEnd,overtime:!!core.isOvertime,superShot:!!core.isSuperShot,alleyOop:!!core.isAlleyOop,matchTime:clamp(core.matchTime),endTime:clamp(core.endTime),
  scores:md&&Array.isArray(md.matchScore)?md.matchScore.slice(0,2):null
 };
}
function setVec(vec,x,y){
 if(!vec)return;
 if(typeof vec.setxy==="function")vec.setxy(x,y);
 else {if(Number.isFinite(x))vec.x=x;if(Number.isFinite(y))vec.y=y;}
}
function applyObject(o,item,alpha,coreLocalPlayer){
 if(!o||!item)return;
 const b=o.body,g=o.graphic,p=item.body;
 // P2 is a presentation client: apply the host's transforms directly.
 // Player bodies are removed from local physics to prevent competing simulations.
 if(b&&p){
  // Player 2 is a presentation client: its player bodies must never re-enter
  // local Nape simulation. The host controls their transforms and physics state.
  if(side!==2&&typeof item.physicsActive==="boolean"&&o!==coreLocalPlayer&&o.theSpace){
   if(!item.physicsActive&&b.space!==null)b.space=null;
   else if(item.physicsActive&&b.space===null)b.space=o.theSpace;
  }
  const pos=b.position,vel=b.velocity;
  const x=pos&&Number.isFinite(pos.x)?pos.x:p.x;
  const y=pos&&Number.isFinite(pos.y)?pos.y:p.y;
  const vx=vel&&Number.isFinite(vel.x)?vel.x:p.vx;
  const vy=vel&&Number.isFinite(vel.y)?vel.y:p.vy;
  setVec(b.position,x+(p.x-x)*alpha,item.grounded===true?p.y:y+(p.y-y)*alpha);
  setVec(b.velocity,vx+(p.vx-vx)*alpha,item.grounded===true?p.vy:vy+(p.vy-vy)*alpha);
  try{
   b.rotation=Number.isFinite(b.rotation)?b.rotation+(p.rotation-b.rotation)*alpha:p.rotation;
   b.angularVel=Number.isFinite(b.angularVel)?b.angularVel+(p.angularVel-b.angularVel)*alpha:p.angularVel;
  }catch(_){}
 }
 if(g){
  if(Number.isFinite(item.x))g.x=Number.isFinite(g.x)?g.x+(item.x-g.x)*alpha:item.x;
  if(Number.isFinite(item.y))g.y=item.grounded===true?item.y:(Number.isFinite(g.y)?g.y+(item.y-g.y)*alpha:item.y);
  if(Number.isFinite(item.r))g.rotation=Number.isFinite(g.rotation)?g.rotation+(item.r-g.rotation)*alpha:item.r;
  if(g.scale&&Number.isFinite(item.scaleX))g.scale.x=item.scaleX;
  if(g.scale&&Number.isFinite(item.scaleY))g.scale.y=item.scaleY;
  if(typeof item.visible==="boolean")g.visible=item.visible;
  if(Number.isFinite(item.alpha))g.alpha=item.alpha;
 }
 if(typeof item.state==="string"&&o.state!==item.state){
  // playState accepts the already-expanded keys (e.g. idle_wb) without adding another suffix.
  try{
   if(typeof o.playState==="function")o.playState(item.state);
   else{
    o.prevState=o.state;o.state=item.state;
    if(o.armature&&o.armature.animation&&typeof o.armature.animation.gotoAndPlay==="function")o.armature.animation.gotoAndPlay(item.state);
   }
  }catch(_){o.state=item.state;}
 }
 if(typeof item.grounded==="boolean")o.isGrounded=item.grounded;
 for(const flag of ["canAct","canTakeInHands","canDoAction","isBlockedOrPump","isSuperShot","needBlock","isUnderEmotion","readyForDash","readyForSuper","attackJump","canThrow","isRestart"]){if(typeof item[flag]==="boolean")o[flag]=item[flag];}
 if(typeof item.blockShape==="boolean"&&o.body&&o.blockBody&&o.body.shapes){const has=typeof o.body.shapes.has==="function"&&o.body.shapes.has(o.blockBody);if(item.blockShape&&!has&&typeof o.body.shapes.add==="function")o.body.shapes.add(o.blockBody);if(!item.blockShape&&has&&typeof o.body.shapes.remove==="function")o.body.shapes.remove(o.blockBody);if(item.blockShape&&Number.isFinite(o.blockMass))o.body.gravMass=o.blockMass;else if(!item.blockShape&&Number.isFinite(o.baseMass))o.body.gravMass=o.baseMass;}
 if(typeof item.waiting==="boolean")o.isWaiting=item.waiting;
 // Preserve the original game's actual possession flag, not just the ball's visual position.
}
function applyBall(core,item,alpha,players){
 const ball=core.ball,b=ball&&ball.body;
 if(!ball||!b||!item)return;
 const holder=item.holder&&Number.isFinite(item.holder.side)&&Number.isFinite(item.holder.playerNo)?item.holder:null;
 const holderNo=holder?holder.playerNo:-1;
 const holderSide=holder?holder.side:null;
 const appliedHolderNo=holder?holder.playerNo:0;
 const hasHolder=item.state==="inHands"&&!!holder;
 diag.hostBallState=item.state||"unknown";
 diag.hostHolder=hasHolder?"side "+holderSide+" / player "+holderNo:"none";
 const possessionMismatch=(players||[]).some(player=>{
  const expected=!!(hasHolder&&player.SIDE===holderSide&&player.playerNo===holderNo);
  return !!player.withBall!==expected;
 });
 const stateMismatch=ball.state!==item.state||(holderSide!==null&&ball.SIDE!==holderSide)||ball.__bsoHolderSide!==holderSide||ball.__bsoHolderNo!==holderNo;
 // Re-run the original game callbacks if either the ball state or player flags drift.
 if((stateMismatch||possessionMismatch)&&typeof ball.setState==="function"&&typeof item.state==="string")
  ball.setState(item.state,holderSide===null?2:holderSide,appliedHolderNo,true);
 ball.__bsoHolderSide=holderSide;ball.__bsoHolderNo=holderNo;
 // ballInHands marks the new holder but does not clear a stale previous holder.
 for(const player of players||[]){
  const expected=!!(hasHolder&&player.SIDE===holderSide&&player.playerNo===holderNo);
  if(expected&&!player.withBall&&typeof player.takeBallInHands==="function")player.takeBallInHands();
  else if(!expected&&player.withBall&&typeof player.freeBall==="function")player.freeBall();
 }
 diag.localHolders=(players||[]).filter(player=>player.withBall).map(player=>"side "+player.SIDE+" / player "+player.playerNo).join(", ")||"none";
 // Player 2 never simulates the ball locally. Keep its body out of both Nape spaces
 // while continuing to render the authoritative host position and velocity.
 // Server owns the ball's Nape body; the browser only mirrors its transform.
 if(b.space!==null)b.space=null;
 applyObject(ball,item,1,null);
}
function isLocalPlayer(player){
 if(!player)return false;
 const Controller=side===1?window.__BSO_PlayerController:window.__BSO_PlayerController2;
 if(Controller&&player.controller&&(player.controller instanceof Controller||player.controller.constructor===Controller))return true;
 const expectedSide=side===1?1:-1;
 return player.SIDE===expectedSide&&Number(player.playerNo)===0;
}
function installServerBallAuthority(core){
 const ball=core&&core.ball;
 if(!ball||!ball.body)return;
 const proto=Object.getPrototypeOf(ball);
 if(!proto||proto.__bsoServerBallAuthorityInstalled)return;
 const send=action=>{if(socket.connected)socket.emit("engineBallAction",action)};
 const localPlayer=()=>[...(core.playersLeft||[]),...(core.playersRight||[])].find(isLocalPlayer)||null;
 const isLocalSide=gameSide=>{
  const player=localPlayer();
  return !!player&&Number(gameSide)===Number(player.SIDE);
 };
 // Pickup, rim/net/player contacts and score sensors are resolved only by server Nape.
 proto.takeInHands=function(){return false};
 // These are action requests. The server checks the current ball holder and uses
 // the authoritative player proxy's in-game SIDE, position and velocity.
 proto.shoot=function(gameSide,x,y,velocityX,accuracy){
  const p=localPlayer();
  if(!p||!isLocalSide(gameSide))return;
  send({type:"shoot",playerNo:p.playerNo,x,y,playerVelocityX:velocityX,accuracy,pointOfThrow:p.pointOfThrow});
 };
 proto.dunk=function(gameSide,chance){
  const p=localPlayer();
  if(!p||!isLocalSide(gameSide))return false;
  send({type:"dunk",playerNo:p.playerNo,chance});
  // The local animation continues; the server decides whether this dunk scores.
  return true;
 };
 proto.alleyOop=function(gameSide,x,y,player){
  const p=player&&Number.isFinite(player.playerNo)?player:localPlayer();
  if(!p||!isLocalSide(gameSide))return;
  send({type:"alleyOop",playerNo:p.playerNo,x,y});
 };
 proto.fromHands=function(position,direction){
  const p=localPlayer();
  if(!p||!isLocalSide(this.SIDE))return;
  send({type:"fromHands",playerNo:p.playerNo,x:position&&position.x,y:position&&position.y,direction});
 };
 // A steal request is validated against authoritative server-side defender position,
 // grounded state, facing and possession. The client never applies ball physics.
 proto.applySteal=function(){};
 proto.returnToPhysics=function(){if(this.body&&this.body.space!==null)this.body.space=null};
 proto.toPhysics2=function(){if(this.body&&this.body.space!==null)this.body.space=null};
 proto.removeFromPhysics=function(){if(this.body&&this.body.space!==null)this.body.space=null};
 proto.isInGame=function(){return !["inHands","score"].includes(window.__BSO_SERVER_BALL_STATE||this.state)};
 proto.__bsoServerBallAuthorityInstalled=true;
 const C=window.__BSO_MainGameCore;
 if(C&&C.prototype&&typeof C.prototype.steal==="function"&&!C.prototype.__bsoServerStealRelayInstalled){
  C.prototype.steal=function(gameSide,attackX,direction,fromInput){
   const p=localPlayer();
   if(p&&isLocalSide(gameSide))send({type:"steal",playerNo:p.playerNo,attackX,direction});
   // Do not run client-side steal range/possession checks. The server Nape
   // player/ball proxies alone decide whether the steal actually connects.
   return false;
  };
  C.prototype.__bsoServerStealRelayInstalled=true;
 }
 console.info("[BSO] Ball pickup, flight, blocks and scoring are server-authoritative.");
}
function visualValues(item){
 if(!item)return null;
 const b=item.body||{};
 // Use the host sprite transform plus its physics velocity to bridge brief
 // snapshot gaps without freezing Player 2's display. The normal presentation
 // delay is only one 40 Hz step when the stream is arriving without gaps.
 return {
  x:Number.isFinite(item.x)?item.x:b.x,
  y:Number.isFinite(item.y)?item.y:b.y,
  r:Number.isFinite(item.r)?item.r:b.rotation,
  vx:Number.isFinite(b.vx)?b.vx:0,
  vy:Number.isFinite(b.vy)?b.vy:0,
  angularVel:Number.isFinite(b.angularVel)?b.angularVel:0,
  scaleX:Number.isFinite(item.scaleX)?item.scaleX:1,
  scaleY:Number.isFinite(item.scaleY)?item.scaleY:1,
  state:typeof item.state==="string"?item.state:null,
  visible:typeof item.visible==="boolean"?item.visible:true,
  alpha:Number.isFinite(item.alpha)?item.alpha:1,
  grounded:typeof item.grounded==="boolean"?item.grounded:null
 };
}
function cacheSnapshotVisuals(state){
 const players=new Map();
 for(const item of state.objects||[]){
  if(item&&Number.isFinite(item.side)&&Number.isFinite(item.playerNo))
   players.set(item.side+":"+item.playerNo,visualValues(item));
 }
 return {players,ball:visualValues(state.ball)};
}
function lerp(a,b,t){return a+(b-a)*t}
function renderInterpolatedSnapshot(core,now){
 if(!core||!snapshotBuffer.length)return;
 const targetTime=now-INTERPOLATION_DELAY_MS;
 let left=snapshotBuffer[0],right=left;
 let extrapolationMs=0;
 const newest=snapshotBuffer[snapshotBuffer.length-1];
 if(targetTime>=newest.at){
  left=right=newest;
  extrapolationMs=Math.min(50,targetTime-newest.at);
 }else if(targetTime>snapshotBuffer[0].at){
  for(let i=0;i<snapshotBuffer.length-1;i++){
   const a=snapshotBuffer[i],b=snapshotBuffer[i+1];
   if(targetTime>=a.at&&targetTime<=b.at){left=a;right=b;break;}
  }
 }
 const span=right.at-left.at;
 const t=span>0?Math.max(0,Math.min(1,(targetTime-left.at)/span)):1;
 const extrapolate=extrapolationMs/1000;
 const predict=(a,b)=>{
  const first=a||b,second=b||a;
  if(!first||!second)return null;
  return {
   x:Number.isFinite(first.x)&&Number.isFinite(second.x)?lerp(first.x,second.x,t)+second.vx*extrapolate:null,
   y:Number.isFinite(first.y)&&Number.isFinite(second.y)?lerp(first.y,second.y,t)+second.vy*extrapolate:null,
   r:Number.isFinite(first.r)&&Number.isFinite(second.r)?lerp(first.r,second.r,t)+second.angularVel*extrapolate:null,
   scaleX:lerp(first.scaleX,second.scaleX,t),
   scaleY:lerp(first.scaleY,second.scaleY,t),
   state:second.state,visible:second.visible,alpha:second.alpha,grounded:second.grounded
  };
 };
 const players=[...(core.playersLeft||[]),...(core.playersRight||[])];
 const localPlayer=players.find(isLocalPlayer)||null;
 for(const player of players){
  if(localPlayer&&player===localPlayer)continue;
  const graphic=player&&player.graphic;
  if(!graphic)continue;
  const key=player.SIDE+":"+player.playerNo;
  const a=left.visuals.players.get(key),b=right.visuals.players.get(key);
  if(!a&&!b)continue;
  const value=predict(a,b);
  if(!value)continue;
  if(Number.isFinite(value.x))graphic.x=value.x;
  if(Number.isFinite(value.y))graphic.y=value.y;
  if(Number.isFinite(value.r))graphic.rotation=value.r;
  if(graphic.scale){
   if(Number.isFinite(value.scaleX))graphic.scale.x=value.scaleX;
   if(Number.isFinite(value.scaleY))graphic.scale.y=value.scaleY;
  }
  if(typeof value.visible==="boolean")graphic.visible=value.visible;
  if(Number.isFinite(value.alpha))graphic.alpha=value.alpha;
  if(typeof value.state==="string"&&player.state!==value.state&&typeof player.playState==="function"){
   try{player.playState(value.state)}catch(_){}
  }
  if(typeof value.grounded==="boolean")player.isGrounded=value.grounded;
 }
 const ballGraphic=core.ball&&core.ball.graphic;
 if(ballGraphic){
  const a=left.visuals.ball,b=right.visuals.ball;
  if(a||b){
   const value=predict(a,b);
   if(value){
    if(Number.isFinite(value.x))ballGraphic.x=value.x;
    if(Number.isFinite(value.y))ballGraphic.y=value.y;
    if(Number.isFinite(value.r))ballGraphic.rotation=value.r;
    ballGraphic.visible=value.visible;
    ballGraphic.alpha=value.alpha;
   }
  }
 }
}
function installGameplayRenderer(){
 const G=window.__BSO_GameplayState;
 if(!G||!G.prototype||typeof G.prototype.update!=="function"||typeof G.prototype.preRender!=="function")return false;
 if(G.prototype.__bsoPresentationRenderInstalled)return true;
 // Phaser's update callback is throttled by the game's 40 Hz simulation step,
 // but preRender runs immediately before every actual canvas/WebGL draw.
 const originalUpdate=G.prototype.update;
 G.prototype.update=function(){
  rafFrames++;
  return originalUpdate.apply(this,arguments);
 };
 const originalPreRender=G.prototype.preRender;
 G.prototype.preRender=function(){
  renderFrames++;
  const C=window.__BSO_MainGameCore;
  const core=C&&C.instance;
  if(core)renderInterpolatedSnapshot(core,performance.now());
  const renderer=this.game&&this.game.renderer;
  diag.renderer=renderer&&renderer.constructor?renderer.constructor.name:"unknown";
  diag.phaserFps=this.game&&this.game.time?this.game.time.fps:0;
  diag.desiredFps=this.game&&this.game.time?this.game.time.desiredFps:0;
  return originalPreRender.apply(this,arguments);
 };
 G.prototype.__bsoPresentationRenderInstalled=true;
 diag.renderHook="active · server preRender";
 console.info("[BSO] Player 2 predicts its own avatar locally; host corrects opponent and ball.");
 return true;
}
function applyServerWorldState(core,s){
 if(!s||!Array.isArray(s.objects))return;
 const players=[...(core.playersLeft||[]),...(core.playersRight||[])];
 const localPlayer=players.find(isLocalPlayer)||null;
 diag.localPlayerFound=!!localPlayer;
 diag.localPlayerY=localPlayer&&localPlayer.body?Math.round(localPlayer.body.position.y):null;
 diag.localPlayerGrounded=localPlayer?!!localPlayer.isGrounded:null;
 diag.localPlayerVy=localPlayer&&localPlayer.body?Math.round(localPlayer.body.velocity.y):null;
 window.__BSO_SERVER_BALL_STATE=s.ballState||(s.ball&&s.ball.state)||"unknown";
 if(core.ball&&s.ball)applyBall(core,s.ball,1,players);
 // Synchronize server-decided contact outcomes (for example a defender being
 // stunned by a steal or a block sensor removing their block shape) without
 // overwriting either player's locally simulated position.
 for(const item of s.objects){
  if(!item||!Number.isFinite(item.side)||!Number.isFinite(item.playerNo))continue;
  const player=players.find(p=>p&&p.SIDE===item.side&&p.playerNo===item.playerNo);
  if(!player)continue;
  if(typeof item.state==="string"&&player.state!==item.state&&typeof player.playState==="function"){
   try{player.playState(item.state)}catch(_){player.state=item.state}
  }
  for(const flag of ["canTakeInHands","canAct","canDoAction","isBlockedOrPump","needBlock","isGrounded"]){
   const key=flag==="isGrounded"?"grounded":flag;
   if(typeof item[key]==="boolean")player[flag]=item[key];
  }
  if(typeof item.blockShape==="boolean"&&player.body&&player.block&&player.body.shapes){
   const has=typeof player.body.shapes.has==="function"&&player.body.shapes.has(player.block);
   if(item.blockShape&&!has&&typeof player.body.shapes.add==="function")player.body.shapes.add(player.block);
   if(!item.blockShape&&has&&typeof player.body.shapes.remove==="function")player.body.shapes.remove(player.block);
   if(item.blockShape&&Number.isFinite(player.blockMass))player.body.gravMass=player.blockMass;
   else if(!item.blockShape&&Number.isFinite(player.baseMass))player.body.gravMass=player.baseMass;
  }
  if(typeof item.blockBody==="boolean"&&player.body&&player.blockBody&&player.body.shapes){
   const has=typeof player.body.shapes.has==="function"&&player.body.shapes.has(player.blockBody);
   if(item.blockBody&&!has&&typeof player.body.shapes.add==="function")player.body.shapes.add(player.blockBody);
   if(!item.blockBody&&has&&typeof player.body.shapes.remove==="function")player.body.shapes.remove(player.blockBody);
   if(item.blockBody&&Number.isFinite(player.blockMass))player.body.gravMass=player.blockMass;
   else if(!item.blockBody&&Number.isFinite(player.baseMass))player.body.gravMass=player.baseMass;
  }
 }
 if(s.scoreEvent&&Number.isFinite(s.scoreEvent.id)&&s.scoreEvent.id>lastScoreEventId){
  lastScoreEventId=s.scoreEvent.id;
  if(typeof core.processMatchProcessor==="function"){
   core.processMatchProcessor(s.scoreEvent.basketSide,s.scoreEvent.points,s.scoreEvent.isHuman,s.scoreEvent.throwType);
  }
 }
 core.isAlleyOop=s.ballState==="alleyOop";
 const inv=window.__BSO_Inventory,md=inv&&inv.instance&&inv.instance.matchData;
 if(md&&Array.isArray(s.scores)&&s.scores.length===2){
  md.matchScore[0]=s.scores[0];md.matchScore[1]=s.scores[1];
  if(core.infoPanel&&typeof core.infoPanel.updateScore==="function")core.infoPanel.updateScore(s.scores[0],s.scores[1]);
  if(core.timer&&typeof core.timer.updateScore==="function"){
   core.timer.updateScore(1,s.scores[0]);core.timer.updateScore(-1,s.scores[1]);
  }
 }
}
function install(){
 const C=window.__BSO_MainGameCore;
 if(!C||!C.prototype||C.prototype.__bsoServerWorldPatched)return false;
 const original=C.prototype.update;
 C.prototype.update=function(dt){
  window.__BSO_GAMEPLAY_ACTIVE=true;
  installBallOwnerTracking(this);
  installServerBallAuthority(this);
  if(this.ball&&this.ball.body&&this.ball.body.space!==null)this.ball.body.space=null;
  const coreStart=performance.now();
  const result=original.call(this,dt);
  const coreEnd=performance.now();
  if(this.ball&&this.ball.body&&this.ball.body.space!==null)this.ball.body.space=null;
  const allPlayers=[...(this.playersLeft||[]),...(this.playersRight||[])];
  const local=allPlayers.find(isLocalPlayer);
  if(local&&local.body&&socket.connected){
   const body=local.body,position=body.position,velocity=body.velocity;
   const blockShape=!!(local.block&&body.shapes&&typeof body.shapes.has==="function"&&body.shapes.has(local.block));
   const blockBody=!!(local.blockBody&&body.shapes&&typeof body.shapes.has==="function"&&body.shapes.has(local.blockBody));
   socket.volatile.emit("engineMovement",{
    playerNo:local.playerNo,gameSide:Number(local.SIDE),
    x:position.x,y:position.y,vx:velocity.x,vy:velocity.y,
    rotation:body.rotation,grounded:!!local.isGrounded,
    canTakeInHands:!!local.canTakeInHands,canAct:!!local.canAct,
    canDoAction:!!local.canDoAction,isBlockedOrPump:!!local.isBlockedOrPump,
    needBlock:!!local.needBlock,blockShape,blockBody,
    shieldActive:!!(local.shield&&local.shield.body&&local.shield.body.space!==null),
    facing:local.graphic&&local.graphic.scale&&local.graphic.scale.x>0?1:-1,
    state:typeof local.state==="string"?local.state:"idle",isHuman:local.isHuman!==false
   });
   snapshotSentCount++;
  }
  if(latest)applyServerWorldState(this,latest);
  const syncEnd=performance.now();
  gameUpdates++;
  coreMsTotal+=coreEnd-coreStart;
  syncMsTotal+=syncEnd-coreEnd;
  return result;
 };
 C.prototype.__bsoServerWorldPatched=true;
 console.info("[BSO] Clients send player movement; server Nape resolves ball collisions and baskets.");
 const status=document.getElementById("bso-status");
 if(status)status.textContent="Online match active · Server-authoritative ball physics";
 return true;
}
socket.on("engineWorldState",state=>{
 if(!state||!Number.isSafeInteger(state.sequence))return;
 if(state.sequence<=lastReceivedSequence){
  if(state.sequence===1&&lastReceivedSequence>100){
   lastReceivedSequence=0;lastAppliedSequence=0;lastScoreEventId=0;snapshotBuffer.length=0;
  }else return;
 }
 if(lastReceivedSequence&&state.sequence>lastReceivedSequence+1)diag.sequenceGaps+=state.sequence-lastReceivedSequence-1;
 lastReceivedSequence=state.sequence;
 diag.lastSequence=state.sequence;
 latest=state;
 lastPacketAt=performance.now();
 snapshotBuffer.push({at:lastPacketAt,state,visuals:cacheSnapshotVisuals(state)});
 while(snapshotBuffer.length>12)snapshotBuffer.shift();
 while(snapshotBuffer.length>2&&snapshotBuffer[1].at<lastPacketAt-300)snapshotBuffer.shift();
 packetCount++;
});
const start=Date.now();
const timer=setInterval(()=>{
 const coreInstalled=install();
 const C=window.__BSO_MainGameCore;
 const corePatched=!!(C&&C.prototype&&C.prototype.__bsoOnlinePatched);
 const renderInstalled=installGameplayRenderer();
 if(corePatched&&renderInstalled){clearInterval(timer);return;}
 if(Date.now()-start>20000){clearInterval(timer);console.error("[BSO] Could not install the original game sync/render hooks.");const el=document.getElementById("bso-status");if(el)el.textContent="Online sync failed to initialize. Refresh both devices.";}
},100);
})();