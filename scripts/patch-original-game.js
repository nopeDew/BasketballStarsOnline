'use strict';

const fs = require('fs');
const path = require('path');

const engineDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'engine-source'));
const gameFile = path.join(engineDir, 'basketball_legends_2019.f.js');
const marker = '/* BSO_ONLINE_SOURCE_PATCH */';

if (!fs.existsSync(gameFile)) {
  throw new Error('Original game source not found: ' + gameFile);
}

let source = fs.readFileSync(gameFile, 'utf8');
if (source.includes(marker)) {
  console.log('[BSO] Original game source is already patched.');
  process.exit(0);
}

function replaceUnique(input, anchor, replacement, label) {
  const count = input.split(anchor).length - 1;
  if (count !== 1) throw new Error('Could not uniquely locate ' + label + ' (found ' + count + ').');
  return input.replace(anchor, replacement);
}

// Attach network inputs inside the original game's InputManager module.
const inputAnchor = '    e.default = r\n}';
const inputAt = source.lastIndexOf(inputAnchor);
if (inputAt < 0) throw new Error('Could not locate the original game input-manager export.');
source = source.slice(0, inputAt) + source.slice(inputAt).replace(inputAnchor,
  '    e.default = r;\n' +
  '    ' + marker + '\n' +
  '    if (typeof window !== "undefined" && typeof window.__BSO_INSTALL_INPUT_MANAGER === "function") {\n' +
  '        window.__BSO_INSTALL_INPUT_MANAGER(r);\n' +
  '    }\n' +
  '}'
);

// Export the original match core and controller classes. Keep Player 2's native update method intact; the InputManager getters below supply networked controls.
source = replaceUnique(
  source,
  '    e.PlayerController2 = T.PlayerController2;',
  '    e.PlayerController2 = T.PlayerController2;\n' +
  '    if (typeof window !== "undefined") {\n' +
  '        window.__BSO_MainGameCore = n.MainGameCore;\n' +
  '        window.__BSO_Inventory = g.Inventory;\n' +
  '        window.__BSO_PlayerController = P.PlayerController;\n' +
  '        window.__BSO_PlayerController2 = T.PlayerController2;\n' +
  '        window.__BSO_PlayerObject = b.PlayerObject;\n' +
  '        /* BSO_ONLINE_P2_CONTROLLER_NATIVE: keep the original controller update; network input is injected through InputManager. */\n' +
  '    }',
  'original game core export block'
);

// Keep the original game's 40 Hz cap on both devices. Player 2 receives 40 Hz
// authoritative snapshots, so forcing its Phaser loop to 60 Hz adds rendering
// work without adding new simulation states to display.

const fpsAnchor = 'this.game.time.desiredFps = 40';
const fpsCount = source.split(fpsAnchor).length - 1;
if (fpsCount !== 1) throw new Error('Could not uniquely locate the original Phaser frame cap (found ' + fpsCount + ').');
source = source.replace(fpsAnchor, 'this.game.time.desiredFps = 40');

// Expose and hook the original game's native character selector for live online synchronization.
source = replaceUnique(
  source,
  '    e.SelectPlayer = c',
  '    e.SelectPlayer = c;\n' +
  '    /* BSO_ONLINE_SELECT_PLAYER_SYNC */\n' +
  '    if (typeof window !== "undefined" && typeof window.__BSO_INSTALL_SELECT_PLAYER === "function") window.__BSO_INSTALL_SELECT_PLAYER(c)',
  'original character selector export'
);

// Automatically enter the native 2-player flow from the game's real title menu.
const menuAnchor = '    e.Name = "menu",\n        e\n    }(Phaser.State);\n    e.default = _';
const menuReplacement =
  '    e.Name = "menu",\n' +
  '        e\n' +
  '    }(Phaser.State);\n' +
  '    /* BSO_ONLINE_AUTOSTART_MENU */\n' +
  '    if (typeof window !== "undefined") {\n' +
  '        var bsoOriginalMenuCreate = _.prototype.create;\n' +
  '        _.prototype.create = function() {\n' +
  '            var result = bsoOriginalMenuCreate.apply(this, arguments);\n' +
  '            if (window.__BSO_ONLINE_MATCH) {\n' +
  '                var state = this;\n' +
  '                var createToken = state.__bsoOnlineMenuCreateToken = (state.__bsoOnlineMenuCreateToken || 0) + 1;\n' +
  '                setTimeout(function() {\n' +
  '                    if (state.__bsoOnlineMenuCreateToken !== createToken) return;\n' +
  '                    var current = state.game && state.game.state && state.game.state.current;\n' +
  '                    if ((!current || current === state.name) && typeof state.start2Player === "function") state.start2Player();\n' +
  '                }, 900);\n' +
  '            }\n' +
  '            return result;\n' +
  '        };\n' +
  '    }\n' +
  '    e.default = _';
source = replaceUnique(source, menuAnchor, menuReplacement, 'original two-player title menu');

// Keep the original player-selection screen open until BOTH online players press PLAY.
const randomAnchor = '    e.Name = "randomstate",\n        e\n    }(Phaser.State);\n    e.default = _';
const randomReplacement =
  '    e.Name = "randomstate",\n' +
  '        e\n' +
  '    }(Phaser.State);\n' +
  '    /* BSO_ONLINE_SELECTION_READY */\n' +
  '    /* BSO_ONLINE_REMATCH_READY */\n' +
  '    if (typeof window !== "undefined") {\n' +
  '        var bsoOriginalRandomCreate = _.prototype.create;\n' +
  '        _.prototype.create = function() {\n' +
  '            var state = this;\n' +
  '            if (window.__BSO_ONLINE_MATCH) {\n' +
  '                state.__bsoSelectionReady = !1;\n' +
  '                state.__bsoOriginalPlayInvoked = !1;\n' +
  '                window.__BSO_SELECTION_START = null;\n' +
  '                window.__BSO_SELECTION_START_PENDING = !1;\n' +
  '                if (typeof window.__BSO_NOTIFY_SELECTION_OPENED === "function") window.__BSO_NOTIFY_SELECTION_OPENED();\n' +
  '                else window.__BSO_SELECTION_OPEN_PENDING = !0;\n' +
  '            }\n' +
  '            if (window.__BSO_ONLINE_MATCH && !state.__bsoOnlinePlayWrapped && typeof state.onPlay === "function") {\n' +
  '                state.__bsoOnlinePlayWrapped = !0;\n' +
  '                var originalPlay = state.onPlay;\n' +
  '                state.onPlay = function() {\n' +
  '                    if (state.__bsoSelectionReady) return;\n' +
  '                    state.__bsoSelectionReady = !0;\n' +
  '                    window.__BSO_SELECTION_START = function() {\n' +
  '                        if (state.__bsoOriginalPlayInvoked) return;\n' +
  '                        state.__bsoOriginalPlayInvoked = !0;\n' +
  '                        return originalPlay.apply(state, arguments);\n' +
  '                    };\n' +
  '                    var bsoInventory = window.__BSO_Inventory;\n' +
  '                    var bsoMatchData = bsoInventory && bsoInventory.instance && bsoInventory.instance.matchData;\n' +
  '                    var bsoSideIndex = (Number(window.__BSO_NET_LOCAL_SIDE) || 1) - 1;\n' +
  '                    var bsoSelection = bsoMatchData && bsoMatchData.teams && bsoMatchData.players && bsoMatchData.players[bsoSideIndex] ? {team:Number(bsoMatchData.teams[bsoSideIndex]),player:Number(bsoMatchData.players[bsoSideIndex][0])} : null;\n' +
  '                    if (window.__BSO_SOCKET) window.__BSO_SOCKET.emit("engineSelectionReady", {selection:bsoSelection});\n' +
  '                    if (typeof window.__BSO_SELECTION_WAITING === "function") window.__BSO_SELECTION_WAITING();\n' +
  '                    if (window.__BSO_SELECTION_START_PENDING && typeof window.__BSO_SELECTION_START === "function") {\n' +
  '                        window.__BSO_SELECTION_START_PENDING = !1;\n' +
  '                        window.__BSO_SELECTION_START();\n' +
  '                    }\n' +
  '                };\n' +
  '            }\n' +
  '            var bsoResult = bsoOriginalRandomCreate.apply(this, arguments);\n' +
  '            if (window.__BSO_ONLINE_MATCH) window.__BSO_CURRENT_SELECTION_STATE = this;\n' +
  '            return bsoResult;\n' +
  '        };\n' +
  '    }\n' +
  '    e.default = _';
source = replaceUnique(source, randomAnchor, randomReplacement, 'original 2-player selection state');

// Expose the actual gameplay state so the online client can interpolate remote
// sprites after the original 40 Hz physics update and before Phaser renders.
source = replaceUnique(
  source,
  '    e.Name = "gameplay",\n' +
  '        e.pause = !1,\n' +
  '        e.MAX_FRAME_TIME = .1,\n' +
  '        e.DESIRED_FRAME_TIME = .025,\n' +
  '        e.isAdsPause = !1,\n' +
  '        e.loadedLevel = !1,\n' +
  '        e\n' +
  '    }(Phaser.State);\n' +
  '    e.default = _',
  '    e.Name = "gameplay",\n' +
  '        e.pause = !1,\n' +
  '        e.MAX_FRAME_TIME = .1,\n' +
  '        e.DESIRED_FRAME_TIME = .025,\n' +
  '        e.isAdsPause = !1,\n' +
  '        e.loadedLevel = !1,\n' +
  '        e\n' +
  '    }(Phaser.State);\n' +
  '    e.default = _;\n' +
  '    /* BSO_ONLINE_GAMEPLAY_STATE */\n' +
  '    if (typeof window !== "undefined") window.__BSO_GameplayState = _;',
  'original gameplay state'
);

// Player 1 owns gameplay simulation. Player 2 renders authoritative host snapshots.

// Keep the original game's automatic renderer selection and frame pacing.
if (!source.includes('renderer: Phaser.WEBGL,')) throw new Error('Could not locate the original renderer setting.');
source = source.replace('renderer: Phaser.WEBGL,', 'renderer: Phaser.AUTO,');

if (!source.includes('this.playBtn2.visible = !1,')) throw new Error('Could not locate the original 2-player menu visibility setting.');
source = source.replace('this.playBtn2.visible = !1,', '');

fs.writeFileSync(gameFile, source, 'utf8');
console.log('[BSO] Patched the original Basketball Legends game source: ' + gameFile);
