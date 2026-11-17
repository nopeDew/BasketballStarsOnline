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

// Export the actual original match core and native controllers for the state-stream hook.
source = replaceUnique(
  source,
  '    e.PlayerController2 = T.PlayerController2;',
  '    e.PlayerController2 = T.PlayerController2;\n' +
  '    if (typeof window !== "undefined") {\n' +
  '        window.__BSO_MainGameCore = n.MainGameCore;\n' +
  '        window.__BSO_Inventory = g.Inventory;\n' +
  '        window.__BSO_PlayerController = P.PlayerController;\n' +
  '        window.__BSO_PlayerController2 = T.PlayerController2;\n' +
  '    }',
  'original game core export block'
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
  '            if (window.__BSO_ONLINE_MATCH && !this.__bsoOnlineMenuScheduled) {\n' +
  '                this.__bsoOnlineMenuScheduled = !0;\n' +
  '                var state = this;\n' +
  '                setTimeout(function() {\n' +
  '                    var current = state.game && state.game.state && state.game.state.current;\n' +
  '                    if ((!current || current === state.name) && typeof state.start2Player === "function") state.start2Player();\n' +
  '                }, 900);\n' +
  '            }\n' +
  '            return result;\n' +
  '        };\n' +
  '    }\n' +
  '    e.default = _';
source = replaceUnique(source, menuAnchor, menuReplacement, 'original two-player title menu');

// The original 2-player selection screen's PLAY action transitions straight to gameplay.
const randomAnchor = '    e.Name = "randomstate",\n        e\n    }(Phaser.State);\n    e.default = _';
const randomReplacement =
  '    e.Name = "randomstate",\n' +
  '        e\n' +
  '    }(Phaser.State);\n' +
  '    /* BSO_ONLINE_AUTOSTART_RANDOMSTATE */\n' +
  '    if (typeof window !== "undefined") {\n' +
  '        var bsoOriginalRandomCreate = _.prototype.create;\n' +
  '        _.prototype.create = function() {\n' +
  '            var result = bsoOriginalRandomCreate.apply(this, arguments);\n' +
  '            if (window.__BSO_ONLINE_MATCH && !this.__bsoOnlinePlayScheduled) {\n' +
  '                this.__bsoOnlinePlayScheduled = !0;\n' +
  '                var state = this;\n' +
  '                setTimeout(function() {\n' +
  '                    var current = state.game && state.game.state && state.game.state.current;\n' +
  '                    if ((!current || current === state.name) && typeof state.onPlay === "function") state.onPlay();\n' +
  '                }, 1100);\n' +
  '            }\n' +
  '            return result;\n' +
  '        };\n' +
  '    }\n' +
  '    e.default = _';
source = replaceUnique(source, randomAnchor, randomReplacement, 'original 2-player selection state');

if (!source.includes('renderer: Phaser.WEBGL,')) throw new Error('Could not locate the original renderer setting.');
source = source.replace('renderer: Phaser.WEBGL,', 'renderer: Phaser.AUTO,');

if (!source.includes('this.playBtn2.visible = !1,')) throw new Error('Could not locate the original 2-player menu visibility setting.');
source = source.replace('this.playBtn2.visible = !1,', '');

fs.writeFileSync(gameFile, source, 'utf8');
console.log('[BSO] Patched the original Basketball Legends game source: ' + gameFile);
