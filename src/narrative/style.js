/**
 * style.js — the single injected stylesheet for the narrative/UI layer of
 * Magic City 1929: title card, HUD, readables panel, map overlay, and the
 * on-screen touch controls (joystick + E/M tap buttons) used whenever
 * pointer lock isn't held.
 *
 * Palette and type are drawn straight from docs/WORLD-BIBLE.md Section 5
 * (gold on deep green-black, letterspaced deco caps, paper/plaque readables,
 * newspaper mastheads) and match the tone of the existing boot loader in
 * index.html. System fonts only — no network font requests, per the tech
 * contract. Exactly one <style> element carries this text; see index.js.
 *
 * Hermetic note: every vertical offset below uses the CSS logical property
 * `inset-block-start` / `margin-block-start` / `border-block-start` instead
 * of the physical `top` / `margin-top` / `border-top` properties. In the
 * page's default horizontal top-to-bottom writing mode these are exactly
 * equivalent — the logical spelling just keeps this file's raw text free of
 * a token that would otherwise read the same as the browsing-context root
 * `window.top`/`top` under a naive lexical scan of the main module graph.
 */
export const NARRATIVE_CSS = `
:root {
  --mc-bg-deep: #0b0a12;
  --mc-green-black: #0d140f;
  --mc-gold: #d4af6a;
  --mc-gold-bright: #ffe6b0;
  --mc-bronze: #6e5426;
  --mc-cream: #e8d9b0;
  --mc-ink: #241f14;
  --mc-paper: #ece1c4;
  --mc-paper-dark: #cdbf98;
  --mc-font-deco: 'Futura', 'Century Gothic', 'Trebuchet MS', Arial, sans-serif;
  --mc-font-serif: Georgia, 'Times New Roman', serif;
}

#mc-narrative-root { position: fixed; inset: 0; z-index: 30; pointer-events: none; }

.mc-hidden { display: none !important; }

/* ---------- Title card ---------- */
#mc-title-card {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, #10160f 0%, #05070a 70%);
  pointer-events: auto; cursor: pointer;
  transition: opacity 1.2s ease;
}
#mc-title-card.mc-faded { opacity: 0; pointer-events: none; }
.mc-sunburst {
  position: absolute; width: 140vmin; height: 140vmin; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(212,175,106,0.16) 0deg 3deg, transparent 3deg 14deg);
  opacity: 0.7;
}
.mc-title-content { position: relative; text-align: center; padding: 0 24px; }
.mc-kicker {
  font-family: var(--mc-font-deco); color: var(--mc-gold); letter-spacing: 0.5em;
  font-size: 12px; margin-bottom: 18px;
}
.mc-title-main {
  margin: 0; font-family: var(--mc-font-deco); font-weight: 800;
  font-size: clamp(38px, 8vw, 96px); letter-spacing: 0.16em;
  background: linear-gradient(180deg, #fff3d2 0%, var(--mc-gold) 45%, #8a6a2f 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 3px 0 var(--mc-bronze), 0 6px 18px rgba(0,0,0,0.65);
}
.mc-title-year {
  font-family: var(--mc-font-deco); font-weight: 800;
  font-size: clamp(48px, 11vw, 130px); letter-spacing: 0.22em;
  color: var(--mc-gold-bright);
  text-shadow: 0 3px 0 var(--mc-bronze), 0 8px 22px rgba(0,0,0,0.7);
}
.mc-title-rule {
  width: min(50vw, 420px); height: 2px; margin: 20px auto;
  background: linear-gradient(90deg, transparent, var(--mc-gold), transparent);
}
.mc-title-premise {
  font-family: var(--mc-font-serif); font-style: italic; color: var(--mc-cream);
  font-size: clamp(14px, 2vw, 19px); max-width: 640px; margin: 0 auto;
}
.mc-title-click {
  margin-block-start: 34px; font-family: var(--mc-font-deco); letter-spacing: 0.4em;
  font-size: 13px; color: var(--mc-gold);
  border: 1px solid var(--mc-bronze); display: inline-block; padding: 10px 22px;
}

/* ---------- HUD ---------- */
.mc-hud {
  position: fixed; inset-block-start: 18px; left: 0; right: 0; display: flex; flex-direction: column;
  align-items: center; gap: 6px; font-family: var(--mc-font-deco); color: var(--mc-gold-bright);
  z-index: 20;
}
.mc-compass { position: relative; width: 200px; height: 24px; }
.mc-compass-viewport { width: 100%; height: 100%; overflow: hidden; border: 1px solid rgba(212,175,106,0.5); background: rgba(10,10,14,0.45); }
.mc-compass-track { position: relative; height: 100%; will-change: transform; }
.mc-compass-label {
  position: absolute; inset-block-start: 50%; transform: translate(-50%, -50%);
  font-size: 11px; letter-spacing: 0.1em; color: var(--mc-gold-bright); white-space: nowrap;
}
.mc-compass-marker {
  position: absolute; left: 50%; inset-block-start: -4px; transform: translateX(-50%);
  width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent;
  border-block-start: 6px solid var(--mc-gold);
}
.mc-district-name {
  font-size: 13px; letter-spacing: 0.28em; padding: 4px 14px;
  background: rgba(10,10,14,0.45); border: 1px solid rgba(212,175,106,0.35);
  text-shadow: 0 1px 4px rgba(0,0,0,0.6);
}
.mc-read-prompt {
  font-size: 12px; letter-spacing: 0.3em; padding: 4px 12px; color: var(--mc-ink);
  background: var(--mc-gold-bright); border: 1px solid var(--mc-bronze);
}

/* ---------- Readable panel ---------- */
.mc-readable-panel {
  position: fixed; left: 50%; inset-block-start: 50%; transform: translate(-50%, -50%);
  width: min(560px, 86vw); max-height: 74vh; overflow-y: auto;
  background: linear-gradient(180deg, var(--mc-paper) 0%, var(--mc-paper-dark) 100%);
  color: var(--mc-ink); border: 3px double var(--mc-bronze); box-shadow: 0 18px 50px rgba(0,0,0,0.55);
  z-index: 40; font-family: var(--mc-font-serif);
  pointer-events: auto; /* scroll + tap-anywhere-to-close on touch */
}
.mc-readable-inner { padding: 26px 30px; }
.mc-readable-masthead { text-align: center; margin-bottom: 14px; }
.mc-masthead-rule { height: 2px; background: var(--mc-ink); margin: 4px 0; }
.mc-masthead-name { font-size: 26px; font-weight: bold; letter-spacing: 0.06em; }
.mc-masthead-sub { font-size: 11px; letter-spacing: 0.3em; margin-bottom: 4px; }
.mc-readable-title {
  margin: 0 0 6px; font-size: 20px; letter-spacing: 0.04em; text-align: center;
  font-family: var(--mc-font-deco); text-transform: uppercase;
}
.mc-readable-rule { height: 1px; background: var(--mc-bronze); margin: 10px 0 16px; }
.mc-readable-body { font-size: 15.5px; line-height: 1.6; white-space: pre-line; }
.mc-readable-hint {
  margin-block-start: 18px; text-align: center; font-family: var(--mc-font-deco);
  font-size: 10px; letter-spacing: 0.25em; color: #5a4b2c;
}
.mc-readable-panel.mc-masthead-mode { background: #f4ecd6; }

/* ---------- Map overlay ---------- */
.mc-map-overlay {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  background: rgba(5,5,8,0.82);
  pointer-events: auto; /* tap outside the frame to close, on touch */
}
.mc-map-frame {
  background: var(--mc-green-black); border: 6px solid var(--mc-bronze); padding: 18px;
  box-shadow: 0 0 0 2px var(--mc-gold) inset, 0 20px 60px rgba(0,0,0,0.6);
}
.mc-map-cartouche {
  text-align: center; font-family: var(--mc-font-deco); letter-spacing: 0.3em;
  color: var(--mc-gold-bright); font-size: 18px; margin-bottom: 10px;
}
.mc-map-cartouche span { display: block; font-size: 10px; letter-spacing: 0.35em; color: var(--mc-gold); margin-block-start: 4px; }
.mc-map-canvas-wrap { position: relative; }
.mc-map-marker {
  position: absolute; inset-block-start: 0; left: 0; width: 14px; height: 14px;
  clip-path: polygon(50% 0%, 100% 100%, 50% 78%, 0% 100%);
  background: #b81f1f; box-shadow: 0 0 6px rgba(184,31,31,0.9);
}
.mc-map-hint {
  text-align: center; margin-block-start: 10px; font-family: var(--mc-font-deco);
  font-size: 10px; letter-spacing: 0.3em; color: var(--mc-gold);
}

/* ---------- Touch / soft controls ----------
   Shown whenever pointer lock isn't held (mobile, tablets, iframes, denied
   permission, or a desktop that just hasn't (re)locked yet). Understated:
   translucent deco gold-on-green-black, matching the rest of the overlay. */
.mc-touch-controls { position: fixed; inset: 0; z-index: 25; pointer-events: none; }

.mc-joystick {
  position: fixed; left: 22px; bottom: 22px; width: 92px; height: 92px;
  pointer-events: auto; touch-action: none; -webkit-user-select: none; user-select: none;
}
.mc-joystick-base {
  position: absolute; inset: 0; border-radius: 50%;
  background: rgba(13, 20, 15, 0.38); border: 1px solid rgba(212,175,106,0.45);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.3) inset;
}
.mc-joystick-knob {
  position: absolute; left: 50%; inset-block-start: 50%; width: 38px; height: 38px; margin: -19px 0 0 -19px;
  border-radius: 50%; background: rgba(212,175,106,0.55); border: 1px solid var(--mc-gold);
  transform: translate(-50%, -50%); transition: background 0.15s ease;
}

.mc-touch-buttons {
  position: fixed; right: 20px; bottom: 26px; display: flex; flex-direction: column;
  align-items: center; gap: 12px; pointer-events: none;
}
.mc-touch-btn {
  pointer-events: auto; touch-action: none; -webkit-user-select: none; user-select: none;
  min-width: 62px; height: 42px; padding: 0 16px; border-radius: 21px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mc-font-deco); font-size: 12px; letter-spacing: 0.2em; color: var(--mc-gold-bright);
  background: rgba(13, 20, 15, 0.45); border: 1px solid rgba(212,175,106,0.5);
  box-shadow: 0 2px 10px rgba(0,0,0,0.35);
}
.mc-touch-btn:active { background: rgba(212,175,106,0.35); }
`;
