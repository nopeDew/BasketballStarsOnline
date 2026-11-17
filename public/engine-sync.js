(()=> {
"use strict";
const socket=window.__BSO_SOCKET;
const params=new URLSearchParams(location.search);
const side=Number(params.get("side")||1);
if(!socket){console.error("[BSO] Socket.IO client was not initialized.");return;}
let latest=null,lastSend=0,snapshotSequence=0,lastReceivedSequence=0,lastAppliedSequence=0;
const clamp=n=>Number.isFinite(n)?n:0;
function readBody(body){
 if(!body||!body.position||!body.velocity)return null;
 return {x:clamp(body.position.x),y:clamp(body.position.y),vx:clamp(body.velocity.x),vy:clamp(body.velocity.y),rotation:clamp(body.rotation),angularVel:clamp(body.angularVel)};
}
function readObject(o,index,typeIndex){
 const g=o&&o.graphic,b=o&&o.body;
 const item={i:index,type:Number.isFinite(o&&o.objType)?o.objType:null,typeIndex};
 if(g){item.x=clamp(g.x);item.y=clamp(g.y);item.r=clamp(g.rotation);item.visible=g.visible!==false;item.alpha=clamp(g.alpha);}
 const body=readBody(b);if(body)item.body=body;
 if(typeof o.state==="string")item.state=o.state;
 if(typeof o.withBall==="boolean")item.withBall=o.withBall;
 if(typeof o.isGrounded==="boolean")item.grounded=o.isGrounded;
 if(typeof o.isHuman==="boolean")item.human=o.isHuman;
 if(typeof o.isWaiting==="boolean")item.waiting=o.isWaiting;
 if(typeof o.SIDE==="number")item.side=o.SIDE;
 return item;
}
function makeSnapshot(core){
 const counts=Object.create(null);
 // The ball has a dedicated stable reference below. Do not serialize it a second time via core.objects.
 const objects=(core.objects||[]).filter(o=>o!==core.ball).map((o,i)=>{
  const type=Number.isFinite(o&&o.objType)?o.objType:-1;
  const typeIndex=counts[type]||0;counts[type]=typeIndex+1;
  // Static decoration does not need network replication. Keep physics objects and players.
  return o&&(o.body||o.isHuman===true||typeof o.withBall==="boolean")?readObject(o,i,typeIndex):null;
 }).filter(Boolean).slice(0,120);
 const inv=window.__BSO_Inventory,md=inv&&inv.instance&&inv.instance.matchData;
 return {
  sequence:++snapshotSequence,
  objects,
  ball:core.ball?readObject(core.ball,-1,0):null,
  playing:!!core.isPlaying,paused:!!core.isPaused,scored:!!core.isScored,waiting:!!core.isWaiting,
  ended:!!core.isEnd,overtime:!!core.isOvertime,matchTime:clamp(core.matchTime),endTime:clamp(core.endTime),
  scores:md&&Array.isArray(md.matchScore)?md.matchScore.slice(0,2):null
 };
}
function setVec(vec,x,y){
 if(!vec)return;
 if(typeof vec.setxy==="function")vec.setxy(x,y);
 else {if(Number.isFinite(x))vec.x=x;if(Number.isFinite(y))vec.y=y;}
}
function applyObject(o,item,alpha){
 if(!o||!item)return;
 const b=o.body,g=o.graphic,p=item.body;
 // Blend authoritative corrections into Player 2's local prediction instead of
 // teleporting every body to a new 30 Hz snapshot.
 if(b&&p){
  const pos=b.position,vel=b.velocity;
  const x=pos&&Number.isFinite(pos.x)?pos.x:p.x;
  const y=pos&&Number.isFinite(pos.y)?pos.y:p.y;
  const vx=vel&&Number.isFinite(vel.x)?vel.x:p.vx;
  const vy=vel&&Number.isFinite(vel.y)?vel.y:p.vy;
  setVec(b.position,x+(p.x-x)*alpha,y+(p.y-y)*alpha);
  setVec(b.velocity,vx+(p.vx-vx)*alpha,vy+(p.vy-vy)*alpha);
  try{
   b.rotation=Number.isFinite(b.rotation)?b.rotation+(p.rotation-b.rotation)*alpha:p.rotation;
   b.angularVel=Number.isFinite(b.angularVel)?b.angularVel+(p.angularVel-b.angularVel)*alpha:p.angularVel;
  }catch(_){}
 }
 if(g){
  if(Number.isFinite(item.x))g.x=Number.isFinite(g.x)?g.x+(item.x-g.x)*alpha:item.x;
  if(Number.isFinite(item.y))g.y=Number.isFinite(g.y)?g.y+(item.y-g.y)*alpha:item.y;
  if(Number.isFinite(item.r))g.rotation=Number.isFinite(g.rotation)?g.rotation+(item.r-g.rotation)*alpha:item.r;
  if(typeof item.visible==="boolean")g.visible=item.visible;
  if(Number.isFinite(item.alpha))g.alpha=item.alpha;
 }
 if(typeof item.state==="string"&&(o.state!==item.state||(Number.isFinite(item.side)&&o.SIDE!==item.side))){
  // Possession can switch teams while the ball remains in the same "inHands" state.
  if(typeof o.setState==="function"){try{o.setState(item.state,item.side===undefined?2:item.side,0,true)}catch(_){o.state=item.state;}}
  else o.state=item.state;
 }
 if(typeof item.grounded==="boolean")o.isGrounded=item.grounded;
 if(typeof item.waiting==="boolean")o.isWaiting=item.waiting;
 // Preserve the original game's actual possession flag, not just the ball's visual position.
 if(typeof item.withBall==="boolean"&&typeof o.takeBallInHands==="function"&&typeof o.freeBall==="function"&&o.withBall!==item.withBall){
  if(item.withBall)o.takeBallInHands();
  else o.freeBall();
 }
}
function applySnapshot(core,s,dt,applyUi){
 if(!s||!Array.isArray(s.objects))return;
 const alpha=1-Math.exp(-Math.max(1,Math.min(50,Number(dt)||16.67))/65);
 const byType=Object.create(null);
 for(const o of core.objects||[]){
  const type=Number.isFinite(o&&o.objType)?o.objType:-1;
  (byType[type]||(byType[type]=[])).push(o);
 }
 for(const item of s.objects){
  const typed=item.type!==null&&byType[item.type]&&byType[item.type][item.typeIndex];
  const fallback=core.objects&&core.objects[item.i];
  applyObject(typed||fallback,item,alpha);
 }
 // The ball has its own stable reference on MainGameCore; use it even if object
 // creation order differs between the two browser simulations.
 if(core.ball&&s.ball)applyObject(core.ball,s.ball,alpha);
 if(applyUi){
  core.isPlaying=!!s.playing;core.isPaused=!!s.paused;core.isScored=!!s.scored;core.isWaiting=!!s.waiting;
  core.isEnd=!!s.ended;core.isOvertime=!!s.overtime;
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
  original.call(this,dt);
  if(!this.objects||!this.objects.length)return;
  if(side===1){
   const now=Date.now();
   // Volatile snapshots keep real-time state fresh instead of queueing stale frames under load.
   if(now-lastSend>=33){lastSend=now;socket.volatile.emit("engineState",makeSnapshot(this));}
  }else if(latest){
   const isNew=latest.sequence>lastAppliedSequence;
   if(isNew)lastAppliedSequence=latest.sequence;
   // Reconcile smoothly every render frame; update score/match flags only on new packets.
   applySnapshot(this,latest,dt,isNew);
  }
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
 lastReceivedSequence=state.sequence;
 latest=state;
});
const start=Date.now();
const timer=setInterval(()=>{
 if(install()){clearInterval(timer);return;}
 if(Date.now()-start>20000){clearInterval(timer);console.error("[BSO] Could not find the original match core; online state sync did not install.");const el=document.getElementById("bso-status");if(el)el.textContent="Online sync failed to initialize. Refresh both devices.";}
},100);
})();