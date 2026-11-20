(()=> {
"use strict";
const socket=window.__BSO_SOCKET;
const params=new URLSearchParams(location.search);
const side=Number(params.get("side")||1);
if(!socket){console.error("[BSO] Socket.IO client was not initialized.");return;}
let latest=null,lastSend=0,snapshotSequence=0,lastReceivedSequence=0,lastAppliedSequence=0;
const diag={fps:0,gameUps:0,coreMs:0,syncMs:0,packetHz:0,packetAgeMs:null,sequenceGaps:0,lastSequence:0,localPlayerFound:false,localPlayerY:null,localPlayerGrounded:null,localPlayerVy:null};
window.__BSO_SYNC_DIAG=diag;
let rafFrames=0,gameUpdates=0,coreMsTotal=0,syncMsTotal=0,packetCount=0,diagWindowStart=performance.now(),lastPacketAt=0;
const clamp=n=>Number.isFinite(n)?n:0;
function startDiagnostics(){
 const tick=()=>{rafFrames++;requestAnimationFrame(tick);};
 requestAnimationFrame(tick);
 setInterval(()=>{
  const now=performance.now(),elapsed=Math.max(1,now-diagWindowStart);
  diag.fps=Math.round(rafFrames*1000/elapsed);
  diag.gameUps=Math.round(gameUpdates*1000/elapsed);
  diag.coreMs=+(coreMsTotal/Math.max(1,gameUpdates)).toFixed(2);
  diag.syncMs=+(syncMsTotal/Math.max(1,gameUpdates)).toFixed(2);
  diag.packetHz=+(packetCount*1000/elapsed).toFixed(1);
  diag.packetAgeMs=lastPacketAt?Math.round(now-lastPacketAt):null;
  rafFrames=gameUpdates=packetCount=0;coreMsTotal=syncMsTotal=0;diagWindowStart=now;
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
    "Render FPS: "+diag.fps,
    "Game updates/sec: "+diag.gameUps,
    "Core update: "+diag.coreMs+" ms",
    "Network sync: "+diag.syncMs+" ms",
    "Host snapshots/sec: "+diag.packetHz,
    "Last snapshot age: "+(diag.packetAgeMs===null?"none":diag.packetAgeMs+" ms"),
    "Sequence gaps: "+diag.sequenceGaps,
    "Last sequence: "+diag.lastSequence,
    "Remote input packets: "+remote,
    "P2 controller: "+(controller?"active":"not reporting"),
    "Local P2 avatar: "+(diag.localPlayerFound?"prediction active":"not found"),
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
 if(g){item.x=clamp(g.x);item.y=clamp(g.y);item.r=clamp(g.rotation);item.visible=g.visible!==false;item.alpha=clamp(g.alpha);}
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
function makeSnapshot(core){
 // The 1v1 match only needs authoritative player bodies plus the dedicated ball.
 // Avoid replicating every court/effect body every frame; it adds work without helping control.
 const players=[...(core.playersLeft||[]),...(core.playersRight||[])];
 const objects=players.map((o,i)=>readObject(o,i,0,core)).filter(Boolean);
 const inv=window.__BSO_Inventory,md=inv&&inv.instance&&inv.instance.matchData;
 const holder=[...(core.playersLeft||[]),...(core.playersRight||[])].find(p=>p&&p.withBall);
 const ball=core.ball?readObject(core.ball,-1,0,core):null;
 if(ball&&holder){ball.side=holder.SIDE;ball.playerNo=holder.playerNo;}
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
 // Blend authoritative corrections into Player 2's local prediction instead of
 // teleporting every body to a new 30 Hz snapshot.
 // Player 2 runs its own native Nape step. Never pull live physics bodies
 // toward a second simulation; reconcile the remote presentation below instead.
 if(b&&p&&side!==2){
  if(typeof item.physicsActive==="boolean"&&o!==coreLocalPlayer&&o.theSpace){
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
  if(typeof item.visible==="boolean")g.visible=item.visible;
  if(Number.isFinite(item.alpha))g.alpha=item.alpha;
 }
 if(typeof item.state==="string"&&o.state!==item.state){
  // The transmitted state is already the exact DragonBones animation key (e.g. idle_wb).
  try{
   o.prevState=o.state;o.state=item.state;
   if(o.armature&&o.armature.animation&&typeof o.armature.animation.gotoAndPlay==="function")o.armature.animation.gotoAndPlay(item.state);
  }catch(_){o.state=item.state;}
 }
 if(typeof item.grounded==="boolean")o.isGrounded=item.grounded;
 for(const flag of ["canAct","canTakeInHands","canDoAction","isBlockedOrPump","isSuperShot","needBlock","isUnderEmotion","readyForDash","readyForSuper","attackJump","canThrow","isRestart"]){if(typeof item[flag]==="boolean")o[flag]=item[flag];}
 if(side!==2&&typeof item.blockShape==="boolean"&&o.body&&o.blockBody&&o.body.shapes){const has=typeof o.body.shapes.has==="function"&&o.body.shapes.has(o.blockBody);if(item.blockShape&&!has&&typeof o.body.shapes.add==="function")o.body.shapes.add(o.blockBody);if(!item.blockShape&&has&&typeof o.body.shapes.remove==="function")o.body.shapes.remove(o.blockBody);if(item.blockShape&&Number.isFinite(o.blockMass))o.body.gravMass=o.blockMass;else if(!item.blockShape&&Number.isFinite(o.baseMass))o.body.gravMass=o.baseMass;}
 if(typeof item.waiting==="boolean")o.isWaiting=item.waiting;
 // Preserve the original game's actual possession flag, not just the ball's visual position.
}
function applyBall(core,item,alpha,players){
 const ball=core.ball,b=ball&&ball.body;
 if(!ball||!b||!item)return;
 const holderNo=Number.isFinite(item.playerNo)?item.playerNo:0;
 const holderSide=Number.isFinite(item.side)?item.side:null;
 const hasHolder=item.state==="inHands"&&holderSide!==null;
 const possessionMismatch=(players||[]).some(player=>{
  const expected=!!(hasHolder&&player.SIDE===holderSide&&player.playerNo===holderNo);
  return !!player.withBall!==expected;
 });
 const stateMismatch=ball.state!==item.state||ball.SIDE!==holderSide||ball.__bsoHolderSide!==holderSide||ball.__bsoHolderNo!==holderNo;
 // Re-run the original game callbacks if either the ball state or player flags drift.
 if((stateMismatch||possessionMismatch)&&typeof ball.setState==="function"&&typeof item.state==="string")
  ball.setState(item.state,holderSide===null?2:holderSide,holderNo,true);
 ball.__bsoHolderSide=holderSide;ball.__bsoHolderNo=holderNo;
 // ballInHands marks the new holder but does not clear a stale previous holder.
 for(const player of players||[]){
  const expected=!!(hasHolder&&player.SIDE===holderSide&&player.playerNo===holderNo);
  if(expected&&!player.withBall&&typeof player.takeBallInHands==="function")player.takeBallInHands();
  else if(!expected&&player.withBall&&typeof player.freeBall==="function")player.freeBall();
 }
 let transitioned=false;
 // P2 keeps its native ball body in its own physics world. The host snapshot
 // controls the rendered ball and possession state, not a second body simulation.
 if(side!==2){
  if(item.physicsSpace===0&&b.space!==null&&typeof ball.removeFromPhysics==="function"){
   ball.removeFromPhysics();transitioned=true;
  }else if(item.physicsSpace===1&&ball.space1&&b.space!==ball.space1){
   b.space=ball.space1;ball.updateGraphic();ball.setVisibleOnframe=true;transitioned=true;
  }else if(item.physicsSpace===2&&ball.space2&&b.space!==ball.space2){
   b.space=ball.space2;ball.updateGraphic();ball.graphic.visible=true;transitioned=true;
  }
 }
 applyObject(ball,item,transitioned?1:alpha,null);
}
function isLocallyControlledP2(player){
 const Controller=window.__BSO_PlayerController2;
 if(side!==2||!player||!player.controller||!Controller)return false;
 return player.controller instanceof Controller||player.controller.constructor===Controller;
}
function applySnapshot(core,s,dt,applyUi){
 if(!s||!Array.isArray(s.objects))return;
 const alpha=1-Math.exp(-Math.max(1,Math.min(50,Number(dt)||16.67))/65);
 const localPlayers=[...(core.playersLeft||[]),...(core.playersRight||[])];
 const localP2=localPlayers.find(isLocallyControlledP2)||null;
 diag.localPlayerFound=!!localP2;
 diag.localPlayerY=localP2&&localP2.body?Math.round(localP2.body.position.y):null;
 diag.localPlayerGrounded=localP2?!!localP2.isGrounded:null;
 diag.localPlayerVy=localP2&&localP2.body?Math.round(localP2.body.velocity.y):null;
 // Correct ball state and possession first; ball.setState() updates native controllers.
 if(core.ball&&s.ball)applyBall(core,s.ball,alpha,localPlayers);
 for(const item of s.objects){
  const player=Number.isFinite(item.playerNo)&&Number.isFinite(item.side)?localPlayers.find(p=>p&&p.playerNo===item.playerNo&&p.SIDE===item.side):null;
  if(!player)continue;
  // P2 predicts their own transform locally; possession is reconciled above.
  if(isLocallyControlledP2(player))continue;
  applyObject(player,item,alpha,localP2);
 }
 if(applyUi){
  core.isPlaying=!!s.playing;core.isPaused=!!s.paused;core.isScored=!!s.scored;core.isWaiting=!!s.waiting;
  core.isEnd=!!s.ended;core.isOvertime=!!s.overtime;core.isSuperShot=!!s.superShot;core.isAlleyOop=!!s.alleyOop;
  if(Number.isFinite(s.matchTime))core.matchTime=s.matchTime;
  if(Number.isFinite(s.endTime))core.endTime=s.endTime;
  const inv=window.__BSO_Inventory,md=inv&&inv.instance&&inv.instance.matchData;
  if(md&&Array.isArray(s.scores)&&s.scores.length===2){
   md.matchScore[0]=s.scores[0];md.matchScore[1]=s.scores[1];
   if(core.infoPanel&&typeof core.infoPanel.updateScore==="function")core.infoPanel.updateScore(s.scores[0],s.scores[1]);
   if(core.timer&&typeof core.timer.updateScore==="function"){core.timer.updateScore(1,s.scores[0]);core.timer.updateScore(-1,s.scores[1]);}
  }
 }
}
function install(){
 const C=window.__BSO_MainGameCore;
 if(!C||!C.prototype||C.prototype.__bsoOnlinePatched)return false;
 const original=C.prototype.update;
 C.prototype.update=function(dt){
  window.__BSO_GAMEPLAY_ACTIVE=true;
  const coreStart=performance.now();
  original.call(this,dt);
  const coreEnd=performance.now();
  if(!this.objects||!this.objects.length)return;
  if(side===1){
   const now=Date.now();
   // Volatile snapshots keep real-time state fresh instead of queueing stale frames under load.
   // The original Basketball Legends gameplay loop advances in 25 ms fixed steps (40 Hz).
   // Publish at the same cadence so Player 2 isn't interpolating against a slower 30 Hz stream.
   if(now-lastSend>=25){lastSend=now;socket.volatile.emit("engineState",makeSnapshot(this));}
  }else if(latest){
   const isNew=latest.sequence>lastAppliedSequence;
   if(isNew)lastAppliedSequence=latest.sequence;
   // Reconcile smoothly every simulation tick; update score/match flags only on new packets.
   applySnapshot(this,latest,dt,isNew);
  }
  const syncEnd=performance.now();
  gameUpdates++;
  coreMsTotal+=coreEnd-coreStart;
  syncMsTotal+=syncEnd-coreEnd;
 };
 C.prototype.__bsoOnlinePatched=true;
 console.info("[BSO] Typed original-game state synchronization installed. Player "+side+(side===1?" is host.":" is following host state."));
 const status=document.getElementById("bso-status");
 if(status)status.textContent=side===1?"Online match active · You are host":"Online match active · Synced to host";
 return true;
}
socket.on("engineState",state=>{
 if(side!==2||!state||!Number.isSafeInteger(state.sequence))return;
 if(state.sequence<=lastReceivedSequence)return;
 if(lastReceivedSequence&&state.sequence>lastReceivedSequence+1)diag.sequenceGaps+=state.sequence-lastReceivedSequence-1;
 lastReceivedSequence=state.sequence;
 diag.lastSequence=state.sequence;
 latest=state;
 lastPacketAt=performance.now();
 packetCount++;
});
const start=Date.now();
const timer=setInterval(()=>{
 if(install()){clearInterval(timer);return;}
 if(Date.now()-start>20000){clearInterval(timer);console.error("[BSO] Could not find the original match core; online state sync did not install.");const el=document.getElementById("bso-status");if(el)el.textContent="Online sync failed to initialize. Refresh both devices.";}
},100);
})();