/* dsh-novel-arkterminal / CRT stylesheet (injected once by apply). */

const CSS = String.raw`
.nt-root {
  --nt-bg: #040907;
  --nt-bg-2: #07110d;
  --nt-panel: rgba(8, 22, 16, 0.82);
  --nt-panel-solid: #0a1712;
  --nt-line: rgba(87, 255, 176, 0.22);
  --nt-line-strong: rgba(87, 255, 176, 0.5);
  --nt-ink: #b9f5d8;
  --nt-ink-dim: #6fa88e;
  --nt-ink-faint: #416b58;
  --nt-accent: #57ffb0;
  --nt-amber: #ffb454;
  --nt-red: #ff6b6b;
  --nt-glow: 0 0 6px rgba(87, 255, 176, 0.35);
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--nt-ink);
  background:
    radial-gradient(ellipse at 50% 0%, rgba(87, 255, 176, 0.08), transparent 60%),
    linear-gradient(180deg, var(--nt-bg-2), var(--nt-bg));
  font-family: "Cascadia Mono", "JetBrains Mono", "Sarasa Mono SC", "Noto Sans Mono CJK SC", ui-monospace, "Microsoft YaHei", monospace;
  font-size: 15px;
  line-height: 1.75;
  overflow: hidden;
}
.nt-root.nt-no-glow { --nt-glow: none; }
.nt-root.nt-no-scan .nt-scan { display: none; }
.nt-root * { box-sizing: border-box; }
.nt-root button {
  font-family: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--nt-line);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.nt-root button:hover { border-color: var(--nt-line-strong); background: rgba(87, 255, 176, 0.08); }
.nt-root button:focus-visible { outline: 1px solid var(--nt-accent); outline-offset: 2px; }
.nt-root button[disabled] { opacity: 0.45; cursor: not-allowed; }
.nt-root input, .nt-root textarea, .nt-root select {
  font-family: inherit;
  color: var(--nt-ink);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--nt-line);
  border-radius: 4px;
  padding: 5px 8px;
}
.nt-root textarea { resize: vertical; }
.nt-scan {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0px,
    rgba(0, 0, 0, 0) 2px,
    rgba(0, 0, 0, 0.22) 3px,
    rgba(0, 0, 0, 0) 4px
  );
  mix-blend-mode: multiply;
  opacity: 0.55;
}
.nt-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 29;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
}
.nt-flicker { animation: nt-flicker 6s infinite steps(1, end); }
@keyframes nt-flicker {
  0%, 97%, 100% { opacity: 1; }
  98% { opacity: 0.94; }
  99% { opacity: 0.98; }
}
@media (prefers-reduced-motion: reduce) {
  .nt-flicker { animation: none; }
}
.nt-header {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--nt-line);
  background: linear-gradient(180deg, rgba(87, 255, 176, 0.06), transparent);
  flex: 0 0 auto;
}
.nt-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.nt-title-main { font-size: 17px; letter-spacing: 2px; color: var(--nt-accent); text-shadow: var(--nt-glow); white-space: nowrap; }
.nt-title-sub { color: var(--nt-ink-dim); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nt-header-spacer { flex: 1 1 auto; }
.nt-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--nt-ink-dim);
  border: 1px solid var(--nt-line);
  border-radius: 999px;
  padding: 2px 10px;
  white-space: nowrap;
}
.nt-chip.is-live { color: var(--nt-accent); border-color: var(--nt-line-strong); }
.nt-chip.is-warn { color: var(--nt-amber); border-color: rgba(255, 180, 84, 0.4); }
.nt-chip.is-error { color: var(--nt-red); border-color: rgba(255, 107, 107, 0.4); }
.nt-body { position: relative; z-index: 4; display: flex; flex: 1 1 auto; min-height: 0; }
.nt-main { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.nt-reader {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 22px 28px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--nt-line-strong) transparent;
}
.nt-chapter { color: var(--nt-amber); font-size: 13px; letter-spacing: 2px; margin-bottom: 6px; }
.nt-node-title { color: var(--nt-accent); font-size: 20px; letter-spacing: 1px; margin: 0 0 14px; }
.nt-block { margin: 0 0 12px; white-space: pre-wrap; word-break: break-word; }
.nt-block-dialogue { color: #d6ffe9; }
.nt-speaker { color: var(--nt-accent); }
.nt-block-system { color: var(--nt-amber); font-size: 13px; border-left: 2px solid rgba(255, 180, 84, 0.5); padding-left: 10px; }
.nt-block-heading { color: var(--nt-accent); font-size: 16px; letter-spacing: 2px; border-bottom: 1px dashed var(--nt-line); padding-bottom: 6px; margin-top: 18px; }
.nt-dialog-row { display: flex; gap: 8px; align-items: flex-start; margin: 12px 0; }
.nt-dialog-row.is-self { flex-direction: row-reverse; }
.nt-dialog-avatar {
  flex: 0 0 auto;
  width: 2em;
  height: 2em;
  border-radius: 50%;
  border: 1px solid var(--nt-line-strong);
  background: rgba(87, 255, 176, 0.06);
  color: var(--nt-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
  text-transform: uppercase;
}
.nt-dialog-row.is-self .nt-dialog-avatar { color: var(--nt-amber); border-color: rgba(255, 180, 84, 0.5); background: rgba(255, 180, 84, 0.08); }
.nt-dialog-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; max-width: 84%; }
.nt-dialog-row.is-self .nt-dialog-main { align-items: flex-end; }
.nt-dialog-name { color: var(--nt-ink-dim); font-size: 0.72em; letter-spacing: 0.08em; }
.nt-dialog-row.is-self .nt-dialog-name { color: var(--nt-amber); }
.nt-dialog-bubble {
  font-size: calc(1em * var(--nt-bubble-scale, 1));
  border: 1px solid var(--nt-line);
  border-radius: 4px 12px 12px 12px;
  background: rgba(10, 30, 22, 0.55);
  color: #d6ffe9;
  padding: 0.55em 0.8em;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.nt-dialog-row.is-self .nt-dialog-bubble {
  border-color: rgba(255, 180, 84, 0.45);
  background: rgba(50, 35, 15, 0.45);
  border-radius: 12px 4px 12px 12px;
}
.nt-dialog-bubble .nt-cursor { margin-left: 3px; }
.nt-history { max-height: 62vh; overflow: auto; padding-right: 4px; }
.nt-history-stream { display: flex; flex-direction: column; gap: 6px; }
.nt-history-chapter {
  color: var(--nt-amber);
  font-size: 0.82em;
  letter-spacing: 0.14em;
  border-bottom: 1px dashed var(--nt-line);
  padding: 8px 0 6px;
  margin-top: 10px;
}
.nt-history-group { margin-bottom: 16px; border-left: 1px solid var(--nt-line); padding-left: 10px; }
.nt-history-title { color: var(--nt-accent); font-size: 0.82em; letter-spacing: 0.1em; margin-bottom: 6px; }
.nt-history-choice { color: var(--nt-amber); font-size: 0.78em; margin: 6px 0 0 2.6em; }
.nt-history-dialogue { margin: 8px 0; }
.nt-history .nt-dialog-main { max-width: 90%; }
.nt-history .nt-dialog-bubble { font-size: calc(1em * var(--nt-bubble-scale, 1)); }
.nt-we-link {
  border: none;
  padding: 0 2px;
  color: var(--nt-accent);
  border-bottom: 1px dotted var(--nt-accent);
  border-radius: 0;
  background: transparent;
  text-shadow: var(--nt-glow);
}
.nt-we-link:hover { background: rgba(87, 255, 176, 0.12); }
.nt-dlg-user { color: #ff7a5c; }
.nt-dlg-partner { color: #ff9ecb; }
.nt-dlg-npc { color: #5aa8ff; }
.nt-cursor { display: inline-block; width: 9px; height: 1.1em; margin-left: 2px; vertical-align: text-bottom; background: var(--nt-accent); animation: nt-blink 1s steps(1, end) infinite; }
@keyframes nt-blink { 50% { opacity: 0; } }
.nt-typing-hint { color: var(--nt-ink-faint); font-size: 12px; margin-top: 10px; }
.nt-choices { padding: 12px 28px 6px; display: flex; flex-direction: column; gap: 8px; flex: 0 0 auto; }
.nt-choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  padding: 9px 12px;
  border-radius: 4px;
  border: 1px solid var(--nt-line);
  background: rgba(87, 255, 176, 0.03);
  color: var(--nt-ink);
}
.nt-choice:hover { background: rgba(87, 255, 176, 0.1); }
.nt-choice.is-ai { border-left: 2px solid var(--nt-amber); }
.nt-choice-index { color: var(--nt-accent); flex: 0 0 auto; }
.nt-choice-hint { color: var(--nt-ink-dim); font-size: 12px; margin-left: 6px; }
.nt-input-row { display: flex; gap: 8px; padding: 8px 28px 10px; flex: 0 0 auto; }
.nt-input-row input { flex: 1 1 auto; }
.nt-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 28px 12px;
  border-top: 1px solid var(--nt-line);
  flex: 0 0 auto;
}
.nt-action-row .nt-grow { flex: 1 1 auto; }
.nt-side {
  flex: 0 0 320px;
  min-width: 0;
  border-left: 1px solid var(--nt-line);
  background: var(--nt-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.nt-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 10px 12px 0; }
.nt-tab { border: 1px solid transparent; border-bottom: none; border-radius: 4px 4px 0 0; padding: 4px 9px; color: var(--nt-ink-dim); font-size: 12px; }
.nt-tab.is-active { color: var(--nt-accent); border-color: var(--nt-line); background: rgba(87, 255, 176, 0.06); }
.nt-side-body { flex: 1 1 auto; overflow-y: auto; padding: 12px 14px 20px; min-height: 0; }
.nt-side h4 { margin: 14px 0 6px; color: var(--nt-accent); font-size: 13px; letter-spacing: 1px; font-weight: 600; }
.nt-side h4:first-child { margin-top: 0; }
.nt-muted { color: var(--nt-ink-dim); font-size: 12px; }
.nt-faint { color: var(--nt-ink-faint); font-size: 12px; }
.nt-list { display: flex; flex-direction: column; gap: 6px; }
.nt-list-item { border: 1px solid var(--nt-line); border-radius: 4px; padding: 6px 9px; background: rgba(0,0,0,0.18); font-size: 13px; }
.nt-list-item button { padding: 0; border: none; text-align: left; width: 100%; }
.nt-list-item:hover { border-color: var(--nt-line-strong); }
.nt-tag { display: inline-block; font-size: 11px; color: var(--nt-amber); border: 1px solid rgba(255,180,84,0.35); border-radius: 3px; padding: 0 5px; margin-left: 6px; }
.nt-tag.is-done { color: var(--nt-ink-faint); border-color: var(--nt-line); text-decoration: line-through; }
.nt-memory { white-space: pre-wrap; font-size: 13px; color: var(--nt-ink-dim); background: rgba(0,0,0,0.22); border: 1px solid var(--nt-line); border-radius: 4px; padding: 10px; max-height: 100%; overflow: auto; }
.nt-wb-item { border: 1px solid var(--nt-line); border-radius: 4px; padding: 8px 10px; margin-bottom: 6px; cursor: pointer; }
.nt-wb-item:hover { border-color: var(--nt-line-strong); background: rgba(87,255,176,0.05); }
.nt-wb-title { color: var(--nt-ink); font-size: 13px; }
.nt-wb-type { font-size: 11px; color: var(--nt-amber); margin-left: 6px; }
.nt-wb-summary { color: var(--nt-ink-dim); font-size: 12px; margin-top: 3px; }
.nt-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 4, 2, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.nt-modal {
  width: min(980px, 96vw);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--nt-panel-solid);
  border: 1px solid var(--nt-line-strong);
  border-radius: 6px;
  box-shadow: 0 0 40px rgba(87, 255, 176, 0.12);
}
.nt-modal-head { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--nt-line); }
.nt-modal-title { color: var(--nt-accent); letter-spacing: 2px; flex: 1 1 auto; }
.nt-modal-body { padding: 14px 16px; overflow: auto; min-height: 0; }
.nt-settings-grid { display: grid; grid-template-columns: 160px 1fr; gap: 10px 14px; align-items: center; }
.nt-settings-grid label { color: var(--nt-ink-dim); font-size: 13px; }
.nt-settings-grid .nt-row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.nt-editor { display: flex; gap: 14px; min-height: 0; flex: 1 1 auto; }
.nt-editor-nav { flex: 0 0 220px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
.nt-editor-nav button { text-align: left; padding: 4px 8px; font-size: 12px; }
.nt-editor-nav button.is-active { border-color: var(--nt-line-strong); color: var(--nt-accent); background: rgba(87,255,176,0.08); }
.nt-editor-main { flex: 1 1 auto; min-width: 0; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.nt-editor-main textarea { width: 100%; min-height: 120px; font-size: 12px; line-height: 1.5; }
.nt-editor-main textarea.nt-code { min-height: 260px; }
.nt-editor-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.nt-toast {
  position: absolute;
  left: 50%;
  bottom: 90px;
  transform: translateX(-50%);
  z-index: 50;
  background: rgba(4, 12, 8, 0.95);
  border: 1px solid var(--nt-line-strong);
  color: var(--nt-ink);
  border-radius: 4px;
  padding: 8px 16px;
  max-width: 70%;
  font-size: 13px;
  box-shadow: var(--nt-glow);
}
.nt-toast.is-error { border-color: rgba(255,107,107,0.6); color: #ffd0d0; }
.nt-empty { color: var(--nt-ink-faint); font-size: 13px; padding: 24px; text-align: center; }
.nt-boot { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
.nt-boot-title { color: var(--nt-accent); letter-spacing: 6px; font-size: 20px; text-shadow: var(--nt-glow); }
.nt-boot-line { color: var(--nt-ink-dim); font-size: 13px; }
.nt-boot-err { color: var(--nt-red); font-size: 13px; max-width: 640px; text-align: center; white-space: pre-wrap; }
.nt-sidebar-icon { display: block; }
.nt-hidden { display: none !important; }
.nt-immersive .nt-side { display: none; }
.nt-immersive .nt-reader { padding: 40px max(40px, 8vw) 20px; }
@media (max-width: 980px) {
  .nt-side { display: none; }
  .nt-reader { padding: 16px; }
  .nt-choices { padding: 10px 16px; }
  .nt-input-row { padding: 8px 16px; }
  .nt-action-row { padding: 8px 16px; }
}
`
