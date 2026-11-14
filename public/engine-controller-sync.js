(()=> {
"use strict";
const started=Date.now();
const getters={
  // Original Player 1 controls
  isbtnA:()=>pressed(1,"left"),
  isbtnD:()=>pressed(1,"right"),
  isbtnW:()=>pressed(1,"jump"),
  isbtnS:()=>pressed(1,"down"),
  isbtnB:()=>pressed(1,"shoot"),
  isbtnV:()=>pressed(1,"super"),
  isbtnADouble:()=>dash(1,"left"),
  isbtnDDouble:()=>dash(1,"right"),
  // Original Player 2 controls
  isbtnLeft:()=>pressed(2,"left"),
  isbtnRight:()=>pressed(2,"right"),
  isbtnUp:()=>pressed(2,"jump"),
  isbtnDown:()=>pressed(2,"down"),
  isbtnL:()=>pressed(2,"shoot"),
  isbtnK:()=>pressed(2,"super"),
  isbtnLeftDouble:()=>dash(2,"left"),
  isbtnRightDouble:()=>dash(2,"right")
};
function pressed(side,key){
 const all=window.__BSO_NET_INPUTS;
 return !!(all&&all[side]&&all[side][key]);
}
function dash(side,direction){
 return !!(window.__BSO_CONSUME_NET_DASH&&window.__BSO_CONSUME_NET_DASH(side,direction));
}
function install(){
 const Input=window.__BSO_InputManagerClass;
 if(!Input||!Input.prototype)return false;
 const proto=Input.prototype;
 for(const [name,get] of Object.entries(getters)){
  Object.defineProperty(proto,name,{configurable:true,enumerable:true,get});
 }
 window.__BSO_INPUT_PATCHED=true;
 console.info("[BSO] Network input is now connected to the original game's Player 1 and Player 2 input manager.");
 const el=document.getElementById("bso-status");
 if(el)el.textContent="Original game controls connected · waiting for opponent input";
 return true;
}
if(!install()){
 const timer=setInterval(()=>{
  if(install()){clearInterval(timer);return;}
  if(Date.now()-started>15000){
   clearInterval(timer);
   console.error("[BSO] Original input manager export was not found.");
   const el=document.getElementById("bso-status");
   if(el)el.textContent="Network controls failed to initialize. Return to the lobby and refresh.";
  }
 },100);
}
})();