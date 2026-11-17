(()=> {
"use strict";
const socket=window.__BSO_SOCKET;
const params=new URLSearchParams(location.search);
const side=Number(params.get("side")||1);
if(!socket){console.error("[BSO] Socket.IO client was not initialized.");return;}
let latest=null,lastSend=0;
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
 if(typeof o.isGrounded==="boolean")item.grounded=o.isGrounded;
 if(typeof o.isHuman==="boolean")item.human=o.isHuman;
 if(typeof o.isWaiting==="boolean")item.waiting=o.isWaiting;
 if(typeof o.SIDE==="number")item.side=o.SIDE;
 return item;
}
function makeSnapshot(core){
 const counts=Object.create(null);
 const objects=(core.objects||[]).slice(0,250).map((o,i)=>{
  const type=Number.isFinite(o&&o.objType)?o.objType:-1;
  const typeIndex=counts[type]||0;counts[type]=typeIndex+1;
  return readObject(o,i,typeIndex);
 });
 const inv=window.__BSO_Inventory,md=inv&&inv.instance&&inv.instance.matchData;
 return {
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
function applyObject(o,item){
 if(!o||!item)return;
 const b=o.body,g=o.graphic,p=item.body;
 if(b&&p){
  setVec(b.position,p.x,p.y);
  setVec(b.velocity,p.vx,p.vy);
  try{b.rotation=p.rotation;b.angularVel=p.angularVel;}catch(_){}
 }
 if(g){
  if(Number.isFinite(item.x))g.x=item.x;
  if(Number.isFinite(item.y))g.y=item.y;
  if(Number.isFinite(item.r))g.rotation=item.r;
  if(typeof item.visible==="boolean")g.visible=item.visible;
  if(Number.isFinite(item.alpha))g.alpha=item.alpha;
 }
 if(typeof item.state==="string"&&o.state!==item.state){
  if(typeof o.setState==="function"){try{o.setState(item.state,item.side===undefined?2:item.side,0,true)}catch(_){o.state=item.state;}}
  else o.state=item.state;
 }
 if(typeof item.grounded==="boolean")o.isGrounded=item.grounded;
 if(typeof item.waiting==="boolean")o.isWaiting=item.waiting;
}
function applySnapshot(core,s){
 if(!s||!Array.isArray(s.objects))return;
 const byType=Object.create(null);
 for(const o of core.objects||[]){
  const type=Number.isFinite(o&&o.objType)?o.objType:-1;
  (byType[type]||(byType[type]=[])).push(o);
 }
 for(const item of s.objects){
  const typed=item.type!==null&&byType[item.type]&&byType[item.type][item.typeIndex];
  const fallback=core.objects&&core.objects[item.i];
  applyObject(typed||fallback,item);
 }
 // The ball has its own stable reference on MainGameCore; use it even if object
 // creation order differs between the two browser simulations.
 if(core.ball&&s.ball)applyObject(core.ball,s.ball);
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
 if(core.physics&&typeof core.physics.updateGraphics==="function"){try{core.physics.updateGraphics()}catch(_){}}
 if(core.ball&&typeof core.ball.updateGraphic==="function"){try{core.ball.updateGraphic()}catch(_){}}
}
function install(){
 const C=window.__BSO_MainGameCore;
 if(!C||!C.prototype||C.prototype.__bsoOnlinePatched)return false;
 const original=C.prototype.update;
 C.prototype.update=function(dt){
  original.call(this,dt);
  if(!this.objects||!this.objects.length)return;
  if(side===1){
   const now=Date.now();
   if(now-lastSend>=33){lastSend=now;socket.emit("engineState",makeSnapshot(this));}
  }else if(latest)applySnapshot(this,latest);
 };
 C.prototype.__bsoOnlinePatched=true;
 console.info("[BSO] Typed original-game state synchronization installed. Player "+side+(side===1?" is host.":" is following host state."));
 const status=document.getElementById("bso-status");
 if(status)status.textContent=side===1?"Online match active · You are host":"Online match active · Synced to host";
 return true;
}
socket.on("engineState",state=>{if(side===2&&state)latest=state;});
const start=Date.now();
const timer=setInterval(()=>{
 if(install()){clearInterval(timer);return;}
 if(Date.now()-start>20000){clearInterval(timer);console.error("[BSO] Could not find the original match core; online state sync did not install.");const el=document.getElementById("bso-status");if(el)el.textContent="Online sync failed to initialize. Refresh both devices.";}
},100);
})();