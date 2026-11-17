(()=> {
"use strict";
const params=new URLSearchParams(location.search);
const roomCode=(params.get("room")||"").toUpperCase();
window.__BSO_ONLINE_MATCH=!!roomCode;
const sessionId=sessionStorage.getItem("bso-session");
const querySeed=Number(params.get("seed")||0);
if(querySeed){let state=querySeed>>>0;Math.random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
const socket=io();window.__BSO_SOCKET=socket;
const actions=["left","right","jump","down","shoot","super"];
let side=Number(params.get("side")||1),remoteSide=side===1?2:1;
// Keep the original game keyboard layout for both native controller slots.
const defaults={left:"KeyA",right:"KeyD",jump:"KeyW",down:"KeyS",shoot:"KeyJ",super:"KeyK"};
let bindings={...defaults};try{bindings={...bindings,...JSON.parse(localStorage.getItem("bso-legends-keys")||"{}")}}catch(e){}
let localState={},remoteState={},capture=null,ready=false;
window.__BSO_NET_LOCAL_SIDE=side;
const inputs={1:{},2:{}},lastTap={1:{left:0,right:0},2:{left:0,right:0}},dashPulse={1:{left:false,right:false},2:{left:false,right:false}};
window.__BSO_NET_INPUTS=inputs;
window.__BSO_NET_DASH=dashPulse;
window.__BSO_UPDATE_NET_INPUTS=(who,next)=>{
 const previous=inputs[who]||{};
 const now=performance.now();
 for(const direction of ["left","right"]){
  if(!previous[direction]&&!!next[direction]){
   if(lastTap[who][direction]>0&&now-lastTap[who][direction]<460)dashPulse[who][direction]=true;
   lastTap[who][direction]=now;
  }
 }
 inputs[who]={...next};
 if(who===2){window.__BSO_P2_INPUT_DEBUG={...inputs[2],at:Date.now()};}
};
window.__BSO_CONSUME_NET_DASH=(who,direction)=>{
 const d=dashPulse[who]||{};
 if(direction){const value=!!d[direction];d[direction]=false;return value;}
 const value=d.left?-1:d.right?1:0;
 d.left=false;d.right=false;
 return value;
};
/* Native Basketball Legends input integration. The original game bundle calls this
   while defining its real InputManager class, before constructing its controllers. */
window.__BSO_INSTALL_INPUT_MANAGER=InputManager=>{
 const proto=InputManager&&InputManager.prototype;
 if(!proto||proto.__bsoNetworkInputsInstalled)return;
 const bindings={
  isbtnA:[1,"left"],isbtnD:[1,"right"],isbtnW:[1,"jump"],isbtnS:[1,"down"],isbtnB:[1,"shoot"],isbtnV:[1,"super"],
  isbtnLeft:[2,"left"],isbtnRight:[2,"right"],isbtnUp:[2,"jump"],isbtnDown:[2,"down"],isbtnL:[2,"shoot"],isbtnK:[2,"super"],
  isbtnADouble:[1,"left","dash"],isbtnDDouble:[1,"right","dash"],
  isbtnLeftDouble:[2,"left","dash"],isbtnRightDouble:[2,"right","dash"]
 };
 for(const [property,[player,action,kind]] of Object.entries(bindings)){
  const descriptor=Object.getOwnPropertyDescriptor(proto,property);
  if(!descriptor||typeof descriptor.get!=="function")throw new Error("Original input getter missing: "+property);
  const nativeGetter=descriptor.get;
  Object.defineProperty(proto,property,{
   configurable:true,enumerable:descriptor.enumerable,
   get:function(){
    const remote=kind==="dash"
      ? !!window.__BSO_CONSUME_NET_DASH(player,action)
      : !!(window.__BSO_NET_INPUTS&&window.__BSO_NET_INPUTS[player]&&window.__BSO_NET_INPUTS[player][action]);
    return remote||!!nativeGetter.call(this);
   }
  });
 }
 proto.__bsoNetworkInputsInstalled=true;
 window.__BSO_INPUT_PATCHED=true;
 console.info("[BSO] Original Basketball Legends InputManager now reads both players' network inputs.");
 const status=document.getElementById("bso-status");
 if(status)status.textContent="Original game input manager connected · both player slots network-enabled";
};
function keyLabel(code){return ({ArrowLeft:"←",ArrowRight:"→",ArrowUp:"↑",ArrowDown:"↓",Space:"SPACE"})[code]||(code.startsWith("Key")?code.slice(3):String(code||"").toUpperCase())}
function sendLocal(){if(socket.connected&&ready)socket.emit("engineInput",{actions:localState})}
function setAction(action,down){
 if(!!localState[action]===down)return;
 localState[action]=down;
 window.__BSO_UPDATE_NET_INPUTS(side,localState);
 const indicator=document.getElementById("bso-input-status");
 if(indicator&&down)indicator.textContent="Input detected: "+action.toUpperCase()+" · local P"+side+" · "+(socket.connected?"socket connected":"socket offline");
 sendLocal();
}
function releaseAll(){
 for(const action of actions)localState[action]=false;
 for(const action of actions)remoteState[action]=false;
 window.__BSO_UPDATE_NET_INPUTS(side,localState);
 window.__BSO_UPDATE_NET_INPUTS(remoteSide,remoteState);
 sendLocal();
}
function save(){localStorage.setItem("bso-legends-keys",JSON.stringify(bindings));drawBindings()}
function drawBindings(){
 const root=document.getElementById("bso-bindings");if(!root)return;root.innerHTML="";
 for(const action of actions){
  const row=document.createElement("div");row.className="bso-bind";
  const label=document.createElement("span");label.textContent=({left:"MOVE LEFT",right:"MOVE RIGHT",jump:"JUMP",down:"BLOCK / DOWN",shoot:"SHOOT",super:"SPECIAL"})[action];
  const button=document.createElement("button");button.type="button";button.textContent=capture===action?"PRESS A KEY":keyLabel(bindings[action]);
  if(capture===action)button.className="listening";
  button.onclick=()=>{capture=action;drawBindings()};
  row.append(label,button);root.append(row);
 }
}
function addPanel(){
 const style=document.createElement("style");
 style.textContent="#bso-network{position:fixed;z-index:999999;top:12px;left:12px;width:min(340px,calc(100vw - 24px));padding:12px 14px;background:#091321ed;border:1px solid #d6a94e;border-radius:12px;color:#f7f2e8;font:12px system-ui;box-shadow:0 8px 30px #0008}#bso-network b{color:#f6c45b}#bso-network .muted{color:#b5c3d5;line-height:1.45}#bso-network button{border:0;border-radius:7px;background:#263d5a;color:white;padding:7px 9px;font-weight:800;cursor:pointer}#bso-network details{margin-top:8px}#bso-network summary{cursor:pointer;color:#f6c45b;font-weight:900}.bso-bind{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0}.bso-bind span{font-size:10px}.bso-bind button.listening{background:#f6c45b!important;color:#20180a!important}";
 document.head.append(style);
 const box=document.createElement("div");box.id="bso-network";
 const controlText="Controls: A / D move · W jump · S block · J shoot · K special";
 box.innerHTML='<div><b>BASKETBALL STARS ONLINE</b> · PLAYER '+side+'</div><div id="bso-status" class="muted">Connecting to your opponent…</div><div id="bso-controls" class="muted">'+controlText+'</div><div id="bso-input-status" class="muted">Waiting for your first input…</div><details><summary>CUSTOMIZE YOUR CONTROLS</summary><div id="bso-bindings"></div><button id="bso-reset" type="button">RESET DEFAULTS</button></details><button id="bso-leave" type="button" style="margin-top:8px">LEAVE MATCH</button>';
 document.body.append(box);drawBindings();
 document.getElementById("bso-reset").onclick=()=>{bindings={...defaults};save()};
 document.getElementById("bso-leave").onclick=()=>{socket.emit("engineLeave");location.href="/"};
}
function status(message){const el=document.getElementById("bso-status");if(el)el.textContent=message}
window.__BSO_SELECTION_WAITING=()=>status("Your player is selected · waiting for Player "+remoteSide+" to press PLAY");
addPanel();
socket.on("connect",()=>{
 if(!roomCode||!sessionId){status("Missing room session. Return to the lobby.");return}
 status("Connected to server · rejoining room "+roomCode+"…");
 socket.emit("engineResume",{code:roomCode,sessionId});
});
socket.on("connect_error",error=>status("Server connection failed · "+(error&&error.message||"retrying")));

socket.on("engineRoomJoined",r=>{
 side=r.side;remoteSide=side===1?2:1;window.__BSO_NET_LOCAL_SIDE=side;ready=true;
 window.__BSO_UPDATE_NET_INPUTS(side,localState);
 status("Room "+r.code+" connected · You control Player "+side+" · syncing opponent");
});
socket.on("engineGameStart",()=>status("Both players are in · choose your characters, then press PLAY"));
socket.on("engineSelectionProgress",info=>{
 if(info&&info.ready<2)status("Selection ready · waiting for the other player ("+info.ready+"/2)");
});
socket.on("engineSelectionStart",()=>{
 status("Both players are ready · starting the original match");
 if(typeof window.__BSO_SELECTION_START==="function")window.__BSO_SELECTION_START();
 else window.__BSO_SELECTION_START_PENDING=true;
});
let remotePackets=0;
window.__BSO_REMOTE_INPUT_PACKETS=0;
socket.on("engineRemoteInput",packet=>{
 if(packet.side!==remoteSide)return;
 remoteState={...(packet.actions||{})};
 window.__BSO_UPDATE_NET_INPUTS(remoteSide,remoteState);
 remotePackets++;window.__BSO_REMOTE_INPUT_PACKETS=remotePackets;
 if(remotePackets===1)status("Opponent connection confirmed · Player "+remoteSide+" controls relayed");

});
socket.on("engineOpponentDisconnected",()=>{releaseAll();status("Opponent disconnected. Waiting for reconnection…")});
socket.on("engineOpponentReconnected",()=>status("Opponent reconnected."));
socket.on("engineError",message=>status(message));
socket.on("disconnect",()=>{releaseAll();status("Connection lost. Reconnecting…")});
window.addEventListener("keydown",event=>{
 if(!event.isTrusted)return;
 if(capture){
  event.preventDefault();event.stopImmediatePropagation();
  const conflict=actions.find(a=>a!==capture&&bindings[a]===event.code);
  if(conflict){status("That key is already assigned.");return}
  bindings[capture]=event.code;capture=null;save();return;
 }
 // Let the original game receive keyboard input on its character-selection screen.
 if(!window.__BSO_GAMEPLAY_ACTIVE)return;
 const action=actions.find(a=>bindings[a]===event.code);
 if(action){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)setAction(action,true)}
},true);
window.addEventListener("keyup",event=>{
 if(!event.isTrusted||!window.__BSO_GAMEPLAY_ACTIVE)return;
 const action=actions.find(a=>bindings[a]===event.code);
 if(action){event.preventDefault();event.stopImmediatePropagation();setAction(action,false)}
},true);
socket.on("engineOpponentLeft",()=>{releaseAll();status("Opponent left the room.");});
window.addEventListener("blur",releaseAll);
window.addEventListener("beforeunload",releaseAll);
setInterval(sendLocal,50);
})();