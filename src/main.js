import "./styles.css";
// 紅海過乾地(出14)main.js —— UI 接線+字幕播報+預烤人聲(絕不 Web Speech)+鍵盤/觸控
// 操作:A/D 或 ←/→ 左右導引隊伍;提示出現時 Enter/點按=摩西伸杖;V 視角。
import { RedSeaGame, DIFFICULTY_PRESETS } from "./game.js";
import { AudioManager } from "./audio.js";
import { loadSettings, saveSettings } from "./storage.js";
import { speakLine, setVoiceEnabled } from "./voice.js";

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $("gameCanvas"),
  phaseLabel: $("phaseLabel"),
  stormPanel: $("stormPanel"), stormFill: $("stormFill"),
  floodPanel: $("floodPanel"), floodFill: $("floodFill"), floodLabel: $("floodLabel"),
  statusMessage: $("statusMessage"), commentaryBar: $("commentaryBar"),
  actionPrompt: $("actionPrompt"),
  controlsPanel: $("controlsPanel"), controlsHint: $("controlsHint"),
  touchLeft: $("touchLeft"), touchRight: $("touchRight"),
  menuButton: $("menuButton"), audioButton: $("audioButton"), cameraButton: $("cameraButton"),
  fullscreenButton: $("fullscreenButton"),
  matchOverlay: $("matchOverlay"), overlayEyebrow: $("overlayEyebrow"),
  overlayTitle: $("overlayTitle"), overlayText: $("overlayText"),
  overlayMenuButton: $("overlayMenuButton"), overlayReplayButton: $("overlayReplayButton"),
  homeScreen: $("homeScreen"),
  difficultySelect: $("difficultySelect"), audioSelect: $("audioSelect"),
  startButton: $("startButton"),
};

const settings = loadSettings();
let selectedDifficulty = DIFFICULTY_PRESETS[settings.difficulty] ? settings.difficulty : "easy";
let audioEnabled = settings.audioEnabled !== false;

const audio = new AudioManager();
audio.setEnabled(audioEnabled);
setVoiceEnabled(audioEnabled);

const game = new RedSeaGame({ canvas: ui.canvas });
window.__redsea3d = game; // dev hook:Playwright 驗證用(3d-game-kit 慣例)

const PHASE_LABELS = {
  menu: "選單", staff: "伸杖", part: "海水分開", cross: "走乾地", close: "水牆合攏", done: "得拯救",
};

function pushCommentary(text, tone = "info") {
  const bar = ui.commentaryBar;
  if (!bar || !text) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = text;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
}

game.onEvent = (event) => {
  switch (event.type) {
    case "staff":
      audio.startWind();
      speakLine("法老的軍兵追上來了!");
      pushCommentary("後有追兵、前有大海——摩西,向海伸杖!", "cool");
      break;
    case "part":
      audio.thunder(0.7);
      speakLine("摩西向海伸杖,耶和華便用大東風,使海水一夜退去,水便分開,海就成了乾地。");
      pushCommentary("耶和華便用大東風,使海水一夜退去,水便分開!(出14:21)", "hot");
      break;
    case "cross":
      audio.stopWind();
      speakLine("以色列人下海中走乾地,水在他們的左右作了牆垣。");
      pushCommentary("以色列人下海中走乾地,水在左右作了牆垣。(出14:22)");
      break;
    case "close":
      audio.splash(1);
      speakLine("全都平安上岸了!");
      pushCommentary("全都上岸了——水牆合攏!", "hot");
      break;
    case "splash-close":
      audio.thunder(0.9);
      audio.splash(1);
      break;
    case "finish":
      try { if (!['localhost','127.0.0.1'].includes(location.hostname)) {   // -done:玩完一局(t=本局秒數,/stats 使用次數與平均停留吃這個)
        var __dt = Math.round((Date.now() - (window.__matchT0 || Date.now())) / 1000);
        navigator.sendBeacon?.('https://hfpc-play-stats.summer09201017.workers.dev/api/ping?g=redsea3d-done&t=' + __dt);
      } } catch (_) {}
      speakLine("以色列人看見耶和華向埃及人所行的大事,就敬畏耶和華,又信服他和他的僕人摩西。");
      ui.matchOverlay.classList.add("visible");
      ui.overlayEyebrow.textContent = "出埃及記 14:31";
      ui.overlayTitle.textContent = event.title || "耶和華拯救以色列人";
      ui.overlayText.textContent = event.text || "";
      break;
    default:
      break;
  }
};

let lastActionPrompt = null;
let lastCohesionLow = false;
game.onHud = (s) => {
  ui.phaseLabel.textContent = PHASE_LABELS[s.phase] || "";
  ui.statusMessage.textContent = s.message || "";

  // 過海進度(頂部)
  const showProgress = ["cross", "close", "done"].includes(s.phase);
  ui.stormPanel.hidden = !showProgress;
  if (showProgress) ui.stormFill.style.transform = `scaleX(${Math.min(1, s.progress)})`;

  // 隊伍聚攏度(中下方大條)
  ui.floodPanel.hidden = !s.meterActive;
  if (s.meterActive) {
    ui.floodFill.style.transform = `scaleX(${Math.min(1, s.cohesion)})`;
    ui.floodFill.dataset.high = s.cohesion < 0.6 ? "1" : "0";
    // 掉隊提醒(一次)
    if (s.cohesion < 0.55 && !lastCohesionLow) {
      lastCohesionLow = true;
      speakLine("跟緊摩西,別掉隊!");
      pushCommentary("有人掉隊了——放慢腳步等等他們,他們會趕上!", "cool");
    }
    if (s.cohesion > 0.8) lastCohesionLow = false;
  }

  if (s.actionPrompt !== lastActionPrompt) {
    lastActionPrompt = s.actionPrompt;
    if (s.actionPrompt) {
      ui.actionPrompt.hidden = false;
      ui.actionPrompt.textContent = `▶ ${s.actionPrompt}`;
    } else {
      ui.actionPrompt.hidden = true;
    }
  }
};

// ── 鍵盤 ──
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (["Space", "ArrowLeft", "ArrowRight", "Enter"].includes(e.code)) e.preventDefault();
  if (game.phase === "menu") return;
  audio.unlock();
  if (game.actionPrompt && (e.code === "Enter" || e.code === "Space") && !e.repeat) {
    game.triggerAction();
    return;
  }
  if (e.code === "KeyA" || e.code === "ArrowLeft") game.controls.left = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") game.controls.right = true;
  if (e.code === "KeyV" && !e.repeat) game.cycleCameraView();
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyA" || e.code === "ArrowLeft") game.controls.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") game.controls.right = false;
});
window.addEventListener("blur", () => {
  game.controls.left = game.controls.right = false;
});

// ── 觸控(按住式) ──
const holdBtn = (el, key) => {
  if (!el) return;
  const on = (e) => { e.preventDefault(); audio.unlock(); game.controls[key] = true; };
  const off = (e) => { e.preventDefault(); game.controls[key] = false; };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointerleave", off);
  el.addEventListener("pointercancel", off);
};
holdBtn(ui.touchLeft, "left");
holdBtn(ui.touchRight, "right");
ui.actionPrompt.addEventListener("click", () => { audio.unlock(); game.triggerAction(); });

// ── HUD 鈕 ──
ui.cameraButton.addEventListener("click", () => { audio.uiTap(); game.cycleCameraView(); });
ui.fullscreenButton.addEventListener("click", () => {
  audio.uiTap();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});
ui.menuButton.addEventListener("click", () => {
  audio.uiTap(); audio.stopWind();
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
  ui.matchOverlay.classList.remove("visible");
  ui.actionPrompt.hidden = true;
});
const applyAudio = () => {
  audio.setEnabled(audioEnabled);
  setVoiceEnabled(audioEnabled);
  ui.audioButton.textContent = audioEnabled ? "音效開啟" : "音效靜音";
  if (!audioEnabled) audio.stopWind();
  persist();
};
ui.audioButton.addEventListener("click", () => { audioEnabled = !audioEnabled; applyAudio(); });
ui.audioSelect.addEventListener("change", (e) => { audioEnabled = e.target.value === "on"; applyAudio(); });

// ── 主選單 ──
function persist() {
  saveSettings({ difficulty: selectedDifficulty, audioEnabled });
}
function syncMenu() {
  ui.difficultySelect.value = selectedDifficulty;
  ui.audioSelect.value = audioEnabled ? "on" : "off";
  ui.audioButton.textContent = audioEnabled ? "音效開啟" : "音效靜音";
}
ui.difficultySelect.addEventListener("change", (e) => { selectedDifficulty = e.target.value; persist(); });

function beginRun() {
  audio.unlock(); audio.uiTap();
  persist();
  game.applyPresentation({ difficulty: selectedDifficulty });
  ui.homeScreen.classList.remove("visible");
  ui.matchOverlay.classList.remove("visible");
  ui.controlsPanel.hidden = false;
  game.start();
}
ui.startButton.addEventListener("click", () => { window.__matchT0 = Date.now(); beginRun(); });   // -done beacon 用:本局開始時間
ui.overlayReplayButton.addEventListener("click", () => { audio.uiTap(); ui.matchOverlay.classList.remove("visible"); beginRun(); });
ui.overlayMenuButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
});

syncMenu();

// dev(localhost)不註冊 SW(3d-game-kit SW 地雷)
if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}


// ── 真實停留 -dwell(07-25 廣佈:開頁到離開單發回報,手機安全;/stats 真實平均+最近一次)──
(function () {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return;
  var _dwT0 = Date.now(), _dwSent = false;
  function _dwLeave() {
    if (_dwSent) return; _dwSent = true;
    var s = Math.round((Date.now() - _dwT0) / 1000);
    if (s >= 3 && s <= 1800 && navigator.sendBeacon)
      navigator.sendBeacon("https://hfpc-play-stats.summer09201017.workers.dev/api/ping?g=redsea3d-dwell&t=" + s);
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") _dwLeave(); });
  window.addEventListener("pagehide", _dwLeave);
})();
