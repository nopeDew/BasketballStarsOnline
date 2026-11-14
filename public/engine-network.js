(()=> {
const params=new URLSearchParams(location.search);
const code=(params.get("room")||"").toUpperCase();
const sessionId=sessionStorage.getItem("bso-session");
const querySeed=Number(params.get("seed")||0);
if(querySeed){let state=querySeed>>>0;Math.random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
const socket=io();window.__BSO_SOCKET=socket;
const actions=["left","right","jump","down","shoot","super"];
const defaults={left:"KeyA",right:"KeyD",jump:"KeyW",down:"KeyS",shoot:"KeyJ",super:"KeyK"};
let bindings={...defaults};try{bindings={...bindings,...JSON.parse(localStorage.getItem("bso-legends-keys")||"{}")}}catch(e){}
let side=Number(params.get("side")||1),remoteSide=side===1?2:1,localState={},remoteState={},capture=null,ready=false;
const native={1:{left:"KeyA",right:"KeyD",jump:"KeyW",down:"KeyS",shoot:"KeyB",super:"KeyV"},2:{left:"ArrowLeft",right:"ArrowRight",jump:"ArrowUp",down:"ArrowDown",shoot:"KeyL",super:"KeyK"}};
function codeParts(code){const map={Space:[" ","Space",32],"ArrowLeft":["ArrowLeft","ArrowLeft",37],"ArrowRight":["ArrowRight","ArrowRight",39],"ArrowUp":["ArrowUp","ArrowUp",38],"ArrowDown":["ArrowDown","ArrowDown",40],ShiftLeft:["Shift","ShiftLeft",16]};if(map[code])return map[code];if(code.startsWith("Key")){const k=code.slice(3).toLowerCase();return[k,code,k.toUpperCase().charCodeAt(0)]}if(code.startsWith("Digit")){const k=code.slice(5);return[k,code,k.charCodeAt(0)]}return[code,code,0]}
function dispatch(code,down){const [key,eventCode,keyCode]=codeParts(code);const event=new KeyboardEvent(down?"keydown":"keyup",{key,code:eventCode,keyCode,which:keyCode,bubbles:true,cancelable:true,repeat:false});window.dispatchEvent(event)}
function keyLabel(code){return code==="Space"?"SPACE":code.startsWith("Key")?code.slice(3):code.replace("Arrow","").replace("Left","").toUpperCase()}
function setNative(state,who,next){const table=native[who];for(const action of actions){const before=!!state[action],after=!!next[action];if(before!==after)dispatch(table[action],after);state[action]=after}}
function releaseAll(){setNative(localState,side,{});setNative(remoteState,remoteSide,{})}
function sendLocal(){socket.emit("engineInput",{actions:localState})}
function setAction(action,down){if(!!localState[action]===down)return;localState[action]=down;dispatch(native[side][action],down);sendLocal()}
function save(){localStorage.setItem("bso-legends-keys",JSON.stringify(bindings));drawBindings()}
function drawBindings(){const root=document.getElementById("bso-bindings");if(!root)return;root.innerHTML="";for(const action of actions){const row=document.createElement("div");row.className="bso-bind";const label=document.createElement("span");label.textContent=({left:"MOVE LEFT",right:"MOVE RIGHT",jump:"JUMP",down:"BLOCK / DOWN",shoot:"SHOOT",super:"SPECIAL"})[action];const button=document.createElement("button");button.type="button";button.textContent=capture===action?"PRESS A KEY":keyLabel(bindings[action]);if(capture===action)button.className="listening";button.onclick=()=>{capture=action;drawBindings()};row.append(label,button);root.append(row)}}
function addPanel(){const style=document.createElement("style");style.textContent="#bso-network{position:fixed;z-index:999999;top:12px;left:12px;width:min(340px,calc(100vw - 24px));padding:12px 14px;background:#091321ed;border:1px solid #d6a94e;border-radius:12px;color:#f7f2e8;font:12px system-ui;box-shadow:0 8px 30px #0008}#bso-network b{color:#f6c45b}#bso-network .muted{color:#b5c3d5;line-height:1.45}#bso-network button{border:0;border-radius:7px;background:#263d5a;color:white;padding:7px 9px;font-weight:800;cursor:pointer}#bso-network details{margin-top:8px}#bso-network summary{cursor:pointer;color:#f6c45b;font-weight:900}.bso-bind{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0}.bso-bind span{font-size:10px}.bso-bind button.listening{background:#f6c45b!important;color:#20180a!important}";document.head.append(style);
const box=document.createElement("div");box.id="bso-network";box.innerHTML='<div><b>BASKETBALL STARS ONLINE</b> · PLAYER '+side+'</div><div id="bso-status" class="muted">Connecting to your opponent…</div><div class="muted">In the original title menu, select <b>2 PLAYERS</b> on both devices. Use the same game start timing.</div><details><summary>CUSTOMIZE YOUR CONTROLS</summary><div id="bso-bindings"></div><button id="bso-reset" type="button">RESET DEFAULTS</button></details><button id="bso-leave" type="button" style="margin-top:8px">LEAVE MATCH</button>';document.body.append(box);drawBindings();document.getElementById("bso-reset").onclick=()=>{bindings={...defaults};save()};document.getElementById("bso-leave").onclick=()=>{socket.emit("engineLeave");location.href="/"}}
function status(message){const el=document.getElementById("bso-status");if(el)el.textContent=message}
addPanel();
socket.on("connect",()=>{if(!code||!sessionId){status("Missing room session. Return to the lobby.");return}socket.emit("engineResume",{code,sessionId})});
socket.on("engineRoomJoined",r=>{side=r.side;remoteSide=side===1?2:1;ready=true;status("Connected · Room "+r.code+" · You control Player "+side)});
socket.on("engineGameStart",()=>status("Opponent connected. Select 2 PLAYERS in the game title menu."));
socket.on("engineRemoteInput",packet=>{if(packet.side!==remoteSide)return;setNative(remoteState,remoteSide,packet.actions||{})});
socket.on("engineOpponentDisconnected",()=>{releaseAll();status("Opponent disconnected. Waiting for reconnection…")});
socket.on("engineOpponentReconnected",()=>status("Opponent reconnected."));
socket.on("engineError",message=>status(message));
socket.on("disconnect",()=>{releaseAll();status("Connection lost. Reconnecting…")});
window.addEventListener("keydown",event=>{if(!event.isTrusted)return;if(capture){event.preventDefault();event.stopImmediatePropagation();const conflict=actions.find(a=>a!==capture&&bindings[a]===event.code);if(conflict){status("That key is already assigned.");return}bindings[capture]=event.code;capture=null;save();return}const action=actions.find(a=>bindings[a]===event.code);if(action){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)setAction(action,true)}},true);
window.addEventListener("keyup",event=>{if(!event.isTrusted)return;const action=actions.find(a=>bindings[a]===event.code);if(action){event.preventDefault();event.stopImmediatePropagation();setAction(action,false)}},true);
window.addEventListener("blur",()=>{for(const action of actions)setAction(action,false)});
setInterval(()=>{if(socket.connected&&ready)sendLocal()},50);
window.addEventListener("beforeunload",releaseAll);
})();
