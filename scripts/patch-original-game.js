'use strict';

const fs = require("fs");
const path = require("path");

const engineDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "engine-source"));
const gameFile = path.join(engineDir, "basketball_legends_2019.f.js");
const marker = "/* BSO_ONLINE_SOURCE_PATCH */";

if (!fs.existsSync(gameFile)) {
  throw new Error(`Original game source not found: ${gameFile}`);
}

let source = fs.readFileSync(gameFile, "utf8");
if (source.includes(marker)) {
  console.log("[BSO] Original game source is already patched.");
  process.exit(0);
}

// Attach network inputs inside the original game's InputManager module.
const inputAnchor = "    e.default = r\\n}";
const inputAt = source.lastIndexOf(inputAnchor);
if (inputAt < 0) {
  throw new Error("Could not locate the original game input-manager export.");
}
source = source.slice(0, inputAt) + source.slice(inputAt).replace(inputAnchor, `    e.default = r;
    ${marker}
    if (typeof window !== "undefined" && typeof window.__BSO_INSTALL_INPUT_MANAGER === "function") {
        window.__BSO_INSTALL_INPUT_MANAGER(r);
    }
}`);

// Expose the original core and the exact native menu/input classes used by this build.
const exportAnchor = "    e.PlayerController2 = T.PlayerController2;";
if (source.split(exportAnchor).length - 1 !== 1) {
  throw new Error("Could not uniquely locate the original game's public-class export block.");
}
source = source.replace(exportAnchor, `${exportAnchor}
    if (typeof window !== "undefined") {
        window.__BSO_MainGameCore = n.MainGameCore;
        window.__BSO_Inventory = g.Inventory;
        window.__BSO_PlayerController = P.PlayerController;
        window.__BSO_PlayerController2 = T.PlayerController2;
        window.__BSO_InputManagerClass = i(14).default;
        window.__BSO_MenuClass = i(32).default;
        window.__BSO_RandomStateClass = i(26).default;
    }`);

if (!source.includes("renderer: Phaser.WEBGL,")) {
  throw new Error("Could not locate the original renderer setting.");
}
source = source.replace("renderer: Phaser.WEBGL,", "renderer: Phaser.AUTO,");

if (!source.includes("this.playBtn2.visible = !1,")) {
  throw new Error("Could not locate the original 2-player menu visibility setting.");
}
source = source.replace("this.playBtn2.visible = !1,", "");

fs.writeFileSync(gameFile, source, "utf8");
console.log(`[BSO] Patched the original Basketball Legends game source: ${gameFile}`);
