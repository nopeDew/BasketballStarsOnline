(()=> {
"use strict";
const socket=window.__BSO_SOCKET;
const params=new URLSearchParams(location.search);
const side=Number(params.get("side")||1);
if(!socket){console.error("[BSO] Socket.IO client was not initialized.");return;}
let latest=null,lastSend=0,snapshotSequence=0,lastReceivedSequence=0,lastAppliedSequence=0;
const snapshotBuffer=[];
const INTERPOLATION_DELAY_MS=50;
const MAX_EXTRAPOLATION_MS=60;
const MAX_SNAPSHOT_AGE_MS=300;
const diag={fps:0,gameUps:0,coreMs:0,syncMs:0,packetHz:0,packetAgeMs:null,sequenceGaps:0,lastSequence:0,localPlayerFound:false,localPlayerY:null,localPlayerGrounded:null,localPlayerVy:null,renderHook:"waiting",renderHz:0,visualMs:0};
window.__BSO_SYNC_DIAG=diag;
let rafFrames=0,gameUpdates=0,coreMsTotal=0,syncMsTotal=0,packetCount=0,renderHookFrames=0,visualMsTotal=0,diagWindowStart=performance.now(),lastPacketAt=0,activeCore=null;
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
  diag.renderHz=Math.round(renderHookFrames*1000/elapsed);
  diag.visualMs=+(visualMsTotal/Math.max(1,renderHookFrames)).toFixed(2);
  diag.packetAgeMs=lastPacketAt?Math.round(now-lastPacketAt):null;
  rafFrames=gameUpdates=packetCount=renderHookFrames=0;coreMsTotal=syncMsTotal=visualMsTotal=0;diagWindowStart=now;
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
   const controller=window.__BSO_P2_INPUT_DEBUG;
   const remote=window.__BSO_REMOTE_INPUT_PACKETS||0;
   hud.textContent=[
    "BSO SYNC DIAGNOSTICS · P"+side,
    "Render FPS: "+diag.fps,
    "Game updates/sec: "+diag.gameUps,
    "Core update: "+diag.coreMs+" ms",
    "Network sync: "+diag.syncMs+" ms",
    "Pre-render interpolation: "+diag.renderHook+" · "+diag.renderHz+" Hz",
    "Visual sync cost: "+diag.visualMs+" ms",
    "Host snapshots/sec: "+diag.packetHz,
    "Last snapshot age: "+(diag.packetAgeMs===null?"none":diag.packetAgeMs+" ms"),
    "Interpolation buffer: "+snapshotBuffer.length+" · "+INTERPOLATION_DELAY_MS+" ms delay",
    "Sequence gaps: "+diag.sequenceGaps,
    "Last sequence: "+diag.lastSequence,
    "Remote input packets: "+remote,
    "P2 network input: "+(controller?("move "+controller.move+", jump "+!!controller.jump+", shoot "+!!controller.shoot):"not reporting"),
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
 if(b&&p){
  if(side===2&&o!==coreLocalPlayer){
   // P2 displays the host-controlled opponent; simulating this body locally
   // duplicates Nape work and makes the host correction fight local collisions.
   if(b.space!==null)b.space=null;
  }else if(typeof item.physicsActive==="boolean"&&o!==coreLocalPlayer&&o.theSpace){
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
 if(typeof item.blockShape==="boolean"&&o.body&&o.blockBody&&o.body.shapes){const has=typeof o.body.shapes.has==="function"&&o.body.shapes.has(o.blockBody);if(item.blockShape&&!has&&typeof o.body.shapes.add==="function")o.body.shapes.add(o.blockBody);if(!item.blockShape&&has&&typeof o.body.shapes.remove==="function")o.body.shapes.remove(o.blockBody);if(item.blockShape&&Number.isFinite(o.blockMass))o.body.gravMass=o.blockMass;else if(!item.blockShape&&Number.isFinite(o.baseMass))o.body.gravMass=o.baseMass;}
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
 if(side===2){
  // P2 never runs local ball collisions. Its ball body is positioned from
  // host snapshots and kept out of the local Nape world at all times.
  if(b.space!==null)b.space=null;
 }else if(item.physicsSpace===0&&b.space!==null&&typeof ball.removeFromPhysics==="function"){
  ball.removeFromPhysics();transitioned=true;
 }else if(item.physicsSpace===1&&ball.space1&&b.space!==ball.space1){
  b.space=ball.space1;ball.updateGraphic();ball.setVisibleOnframe=true;transitioned=true;
 }else if(item.physicsSpace===2&&ball.space2&&b.space!==ball.space2){
  b.space=ball.space2;ball.updateGraphic();ball.graphic.visible=true;transitioned=true;
 }
 applyObject(ball,item,transitioned?1:alpha,null);
}
function isLocallyControlledP2(player){
 if(side!==2||!player)return false;
 const Controller=window.__BSO_PlayerController2;
 if(Controller&&player.controller&&
    (player.controller instanceof Controller||player.controller.constructor===Controller))return true;
 // Controller wrappers can differ between game builds. The online room side is
 // stable: P2 owns the native SIDE=+1, playerNo=0 avatar.
 const expectedSide=Number(window.__BSO_NET_GAME_SIDE);
 return Number.isFinite(expectedSide)&&player.SIDE===expectedSide&&Number(player.playerNo)===0;
}
function lerp(a,b,t){return a+(b-a)*t;}
function findMatchingObject(list,item){
 if(!Array.isArray(list)||!item)return null;
 if(Number.isFinite(item.side)&&Number.isFinite(item.playerNo))
  return list.find(candidate=>candidate&&candidate.side===item.side&&candidate.playerNo===item.playerNo)||null;
 return list.find(candidate=>candidate&&candidate.i===item.i)||null;
}
function interpolateItem(a,b,t,extraSeconds){
 if(!b)return a;
 if(!a)a=b;
 const out={...b};
 for(const key of ["x","y","r","alpha","scaleX","scaleY"]){
  if(Number.isFinite(a[key])&&Number.isFinite(b[key]))out[key]=lerp(a[key],b[key],t);
 }
 if(a.body&&b.body){
  out.body={...b.body};
  for(const key of ["x","y","vx","vy","rotation","angularVel"]){
   if(Number.isFinite(a.body[key])&&Number.isFinite(b.body[key]))
    out.body[key]=lerp(a.body[key],b.body[key],t);
  }
 }
 if(extraSeconds>0){
  const body=out.body;
  const vx=body&&Number.isFinite(body.vx)?body.vx:0;
  const vy=body&&Number.isFinite(body.vy)?body.vy:0;
  const angular=body&&Number.isFinite(body.angularVel)?body.angularVel:0;
  if(Number.isFinite(out.x))out.x+=vx*extraSeconds;
  if(Number.isFinite(out.y))out.y+=vy*extraSeconds;
  if(Number.isFinite(out.r))out.r+=angular*extraSeconds;
  if(body){
   if(Number.isFinite(body.x))body.x+=vx*extraSeconds;
   if(Number.isFinite(body.y))body.y+=vy*extraSeconds;
   if(Number.isFinite(body.rotation))body.rotation+=angular*extraSeconds;
  }
 }
 return out;
}
function sampleSnapshot(now){
 if(!snapshotBuffer.length)return null;
 const newest=snapshotBuffer[snapshotBuffer.length-1];
 if(now-newest.at>MAX_SNAPSHOT_AGE_MS)return null;
 const target=now-INTERPOLATION_DELAY_MS;
 let left=snapshotBuffer[0],right=left,extraSeconds=0;
 if(target>=newest.at){
  left=right=newest;
  extraSeconds=Math.min(MAX_EXTRAPOLATION_MS,Math.max(0,target-newest.at))/1000;
 }else if(target>snapshotBuffer[0].at){
  for(let i=0;i<snapshotBuffer.length-1;i++){
   const a=snapshotBuffer[i],b=snapshotBuffer[i+1];
   if(target>=a.at&&target<=b.at){left=a;right=b;break;}
  }
 }
 const span=right.at-left.at;
 const amount=span>0?Math.max(0,Math.min(1,(target-left.at)/span)):1;
 const before=left.state,after=right.state;
 return {
  ...after,
  objects:(after.objects||[]).map(item=>interpolateItem(
   findMatchingObject(before.objects,item),item,amount,extraSeconds
  )),
  ball:interpolateItem(before.ball,after.ball,amount,extraSeconds)
 };
}
function applyVisualSnapshot(core,s){
 if(!core||!s)return;
 const localPlayers=[...(core.playersLeft||[]),...(core.playersRight||[])];
 const localP2=localPlayers.find(isLocallyControlledP2)||null;
 for(const item of s.objects||[]){
  const player=Number.isFinite(item.playerNo)&&Number.isFinite(item.side)
   ?localPlayers.find(p=>p&&p.playerNo===item.playerNo&&p.SIDE===item.side):null;
  if(!player||isLocallyControlledP2(player))continue;
  applyObject(player,item,1,localP2);
 }
 if(core.ball&&s.ball){
  if(core.ball.body&&core.ball.body.space!==null)core.ball.body.space=null;
  applyObject(core.ball,s.ball,1,null);
 }
}
function installRenderInterpolation(){
 const State=window.__BSO_GameplayState;
 const proto=State&&State.prototype;
 if(!proto)return false;
 if(proto.__bsoRenderInterpolationInstalled)return true;
 const original=typeof proto.preRender==="function"?proto.preRender:null;
 proto.preRender=function(){
  const result=original?original.apply(this,arguments):undefined;
  if(side===2&&activeCore&&snapshotBuffer.length){
   const started=performance.now();
   const sampled=sampleSnapshot(started);
   if(sampled)applyVisualSnapshot(activeCore,sampled);
   renderHookFrames++;
   visualMsTotal+=performance.now()-started;
  }
  return result;
 };
 proto.__bsoRenderInterpolationInstalled=true;
 diag.renderHook="preRender";
 return true;
}
function applySnapshot(core,s,dt,applyUi){
 if(!s||!Array.isArray(s.objects))return;
 const alpha=1; // sampleSnapshot() already interpolates positions at render time.
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
  core.isPlaying=!!s.playing;core.isScored=!!s.scored;core.isWaiting=!!s.waiting;
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
  activeCore=this;
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
  }else if(snapshotBuffer.length){
   const sampled=sampleSnapshot(performance.now());
   if(sampled){
    const newest=latest;
    const isNew=!!(newest&&newest.sequence>lastAppliedSequence);
    if(isNew)lastAppliedSequence=newest.sequence;
    // P2 renders a short delayed sample, extrapolating only across brief packet gaps.
    applySnapshot(this,sampled,dt,isNew);
   }
  }
  const syncEnd=performance.now();
  gameUpdates++;
  coreMsTotal+=coreEnd-coreStart;
  syncMsTotal+=syncEnd-coreEnd;
 };
 C.prototype.__bsoOnlinePatched=true;
 installRenderInterpolation();
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
 const receivedAt=performance.now();
 snapshotBuffer.push({state,at:receivedAt});
 while(snapshotBuffer.length>12)snapshotBuffer.shift();
 lastPacketAt=receivedAt;
 packetCount++;
});
const start=Date.now();
const timer=setInterval(()=>{
 if(install()){clearInterval(timer);return;}
 if(Date.now()-start>20000){clearInterval(timer);console.error("[BSO] Could not find the original match core; online state sync did not install.");const el=document.getElementById("bso-status");if(el)el.textContent="Online sync failed to initialize. Refresh both devices.";}
},100);
})();