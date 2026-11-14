(()=> {
"use strict";
const params=new URLSearchParams(location.search);
if(!params.get("room"))return;
function active(state){
 const current=state&&state.game&&state.game.state&&state.game.state.current;
 return !current||!state.name||current===state.name;
}
function patch(klass,method,delay,label){
 if(!klass||!klass.prototype||typeof klass.prototype.create!=="function")return false;
 const proto=klass.prototype;
 if(proto["__bsoAuto_"+method])return true;
 const original=proto.create;
 proto.create=function(){
  const result=original.apply(this,arguments);
  if(!this["__bsoScheduled_"+method]){
   this["__bsoScheduled_"+method]=true;
   const state=this;
   setTimeout(()=>{
    if(!active(state))return;
    if(typeof state[method]!=="function"){
     console.error("[BSO] Auto-start action missing:",label,method);
     return;
    }
    try{
     console.info("[BSO] Starting original game step:",label);
     state[method]();
    }catch(error){
     console.error("[BSO] Could not auto-start",label,error);
    }
   },delay);
  }
  return result;
 };
 proto["__bsoAuto_"+method]=true;
 return true;
}
function install(){
 const menu=window.__BSO_MenuClass;
 const random=window.__BSO_RandomStateClass;
 const a=patch(menu,"start2Player",900,"2-player mode");
 const b=patch(random,"onPlay",1100,"match launch");
 if(a&&b){
  window.__BSO_AUTO_START_READY=true;
  return true;
 }
 return false;
}
if(!install()){
 const start=Date.now();
 const timer=setInterval(()=>{
  if(install()){clearInterval(timer);return;}
  if(Date.now()-start>15000){
   clearInterval(timer);
   console.error("[BSO] Could not locate the original game's menu states for automatic match start.");
   const el=document.getElementById("bso-status");
   if(el)el.textContent="Could not start the original 1-v-1 match. Return to the lobby and refresh.";
  }
 },100);
}
})();