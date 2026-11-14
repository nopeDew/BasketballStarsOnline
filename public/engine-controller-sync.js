(()=> {
"use strict";
const started=Date.now();
function install(){
 const P1=window.__BSO_PlayerController;
 const P2=window.__BSO_PlayerController2;
 if(!P1||!P2||!P1.prototype||!P2.prototype)return false;
 if(P1.prototype.__bsoControllerPatched&&P2.prototype.__bsoControllerPatched)return true;
 const state=side=>window.__BSO_NET_INPUTS&&window.__BSO_NET_INPUTS[side]||{};
 const dash=side=>window.__BSO_CONSUME_NET_DASH?window.__BSO_CONSUME_NET_DASH(side):0;
 P1.prototype.update=function(){
  const a=state(1);
  this.currentMove=(a.left?-1:0)+(a.right?1:0);
  this.currentDash=dash(1);
  this.currentJump=!!a.jump;
  this.currentAction=!!a.shoot;
  this.currentSuper=!!a.super;
  this.currentBlockOrPump=!!a.down;
 };
 P1.prototype.readyForAction=function(){return !state(1).super};
 P1.prototype.releaseBlockOrPump=function(){return !state(1).down};
 P1.prototype.getJump=function(){return !!state(1).jump};
 P1.prototype.readyToJump=function(){return !state(1).jump};
 P1.prototype.getShoot=function(){return !!state(1).shoot};
 P1.prototype.getTackle=function(){return !!state(1).down};
 P1.prototype.getSuperShot=function(){return !!state(1).super};
 P2.prototype.update=function(){
  const a=state(2);
  this.currentMove=(a.left?-1:0)+(a.right?1:0);
  this.currentDash=dash(2);
  this.currentJump=!!a.jump;
  this.currentAction=!!a.shoot;
  this.currentSuper=!!a.super;
  this.currentBlockOrPump=!!a.down;
 };
 P2.prototype.readyForAction=function(){return !state(2).shoot};
 P2.prototype.releaseBlockOrPump=function(){return !state(2).down};
 P2.prototype.getJump=function(){return !!state(2).jump};
 P2.prototype.readyToJump=function(){return !state(2).jump};
 P2.prototype.getShoot=function(){return !!state(2).shoot};
 P2.prototype.getTackle=function(){return !!state(2).down};
 P2.prototype.getSuperShot=function(){return !!state(2).super};
 P1.prototype.__bsoControllerPatched=true;
 P2.prototype.__bsoControllerPatched=true;
 console.info("[BSO] Original Player 1 and Player 2 controllers patched for online input.");
 const el=document.getElementById("bso-status");
 if(el)el.textContent="Online controllers installed · waiting for opponent";
 return true;
}
if(!install()){
 const timer=setInterval(()=>{
  if(install()){clearInterval(timer);return}
  if(Date.now()-started>15000){clearInterval(timer);console.error("[BSO] Original player controllers were not exported.");const el=document.getElementById("bso-status");if(el)el.textContent="Online controller patch failed. Refresh both devices."}
 },100);
}
})();