export function getStyles(): string {
  return /*css*/`
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
  background: var(--vscode-editor-background, #1e1e1e);
  color: var(--vscode-editor-foreground, #cccccc);
  overflow: hidden; height: 100vh;
}
#app { display: flex; flex-direction: column; height: 100vh; }

header {
  padding: 12px 20px;
  background: var(--vscode-titleBar-activeBackground, #2d2d2d);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  flex-shrink: 0;
}
header h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; display: inline; }
header .pipeline-name { font-size: 12px; font-weight: 600; opacity: 0.6; margin-bottom: 4px; }
header .meta { font-size: 12px; opacity: 0.7; display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px; }
header .meta span { display: inline-flex; align-items: center; gap: 4px; }
.label { color: var(--vscode-descriptionForeground, #888); }
.template-type-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-left: 10px; vertical-align: middle; letter-spacing: 0.5px; border: 1px solid; }
.template-type-badge.ttb-pipeline { background: #ef535020; color: #ef5350; border-color: #ef535040; }
.template-type-badge.ttb-pipelineTemplate { background: #f0629220; color: #f06292; border-color: #f0629240; }
.template-type-badge.ttb-stages { background: #ba68c820; color: #ba68c8; border-color: #ba68c840; }
.template-type-badge.ttb-jobs { background: #9575cd20; color: #9575cd; border-color: #9575cd40; }
.template-type-badge.ttb-steps { background: #7986cb20; color: #7986cb; border-color: #7986cb40; }

.header-params { margin-top: 6px; }
.header-params-toggle { font-size: 11px; cursor: pointer; user-select: none; color: #90a4ae; display: inline-flex; align-items: center; gap: 4px; }
.header-params-toggle:hover { color: #b0bec5; }
.param-count { opacity: 0.7; }
.header-params-grid { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; max-width: 500px; }
.header-params-grid.collapsed { display: none; }
.header-param-item { display: flex; gap: 6px; align-items: baseline; font-size: 11px; padding: 2px 0; border-bottom: 1px solid #ffffff08; }
.header-param-key { color: #81d4fa; font-family: monospace; white-space: nowrap; font-weight: 500; }
.header-param-key::after { content: ":"; }
.header-param-val { font-family: monospace; word-break: break-all; }
.header-param-val.param-true { color: #81c784; }
.header-param-val.param-false { color: #f48771; }
.header-param-val.param-str { color: #c5e1a5; }

#toolbar {
  padding: 6px 20px;
  background: var(--vscode-sideBar-background, #252526);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  display: flex; gap: 8px; flex-shrink: 0;
}
#toolbar button {
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, #ccc);
  border: 1px solid var(--vscode-panel-border, #555);
  padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;
}
#toolbar button:hover {
  background: var(--vscode-button-secondaryHoverBackground, #505050);
}
.toolbar-sep { width: 1px; background: var(--vscode-panel-border, #444); align-self: stretch; margin: 2px 4px; }
.toolbar-label { font-size: 11px; color: var(--vscode-descriptionForeground, #888); align-self: center; }
#themeSelect {
  background: var(--vscode-dropdown-background, #3c3c3c);
  color: var(--vscode-dropdown-foreground, #ccc);
  border: 1px solid var(--vscode-dropdown-border, #555);
  border-radius: 4px; padding: 3px 6px; font-size: 12px; cursor: pointer;
}

/* ===== Inspector bar (Parameters / Variables / Skipped) ===== */
#inspector-bar {
  padding: 6px 20px;
  background: var(--vscode-sideBar-background, #252526);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.inspector-label {
  font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--vscode-descriptionForeground, #888); opacity: 0.6;
}
.inspector-btn {
  background: transparent;
  color: var(--vscode-descriptionForeground, #888);
  border: 1px solid var(--vscode-panel-border, #555);
  padding: 4px 14px; border-radius: 4px; font-size: 12px; cursor: pointer;
  transition: box-shadow 0.2s ease, color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}
/* Empty -- nothing to show: erased gray, not clickable */
.inspector-btn:disabled { opacity: 0.28; cursor: default; }
/* Has content -- neon outline hinting there's something inside */
.inspector-btn.has-content { cursor: pointer; }
.inspector-btn.ins-params.has-content { color: #69f0ae; border-color: #69f0ae66; box-shadow: 0 0 6px #00e67640; }
.inspector-btn.ins-vars.has-content   { color: #40c4ff; border-color: #40c4ff66; box-shadow: 0 0 6px #00b0ff40; }
.inspector-btn.ins-skip.has-content   { color: #ffd740; border-color: #ffd74066; box-shadow: 0 0 6px #ffca2840; }
.inspector-btn.ins-params.has-content:hover { box-shadow: 0 0 11px #00e67699; }
.inspector-btn.ins-vars.has-content:hover   { box-shadow: 0 0 11px #00b0ff99; }
.inspector-btn.ins-skip.has-content:hover    { box-shadow: 0 0 11px #ffca2899; }
/* Open -- panel is showing: intensified glow + faint fill */
.inspector-btn.ins-params.is-open { background: #00e6761f; border-color: #69f0ae; box-shadow: 0 0 15px #00e676aa, inset 0 0 10px #00e67633; }
.inspector-btn.ins-vars.is-open   { background: #00b0ff1f; border-color: #40c4ff; box-shadow: 0 0 15px #00b0ffaa, inset 0 0 10px #00b0ff33; }
.inspector-btn.ins-skip.is-open   { background: #ffca281f; border-color: #ffd740; box-shadow: 0 0 15px #ffca28aa, inset 0 0 10px #ffca2833; }

/* ===== Theme Overrides ===== */
body[data-theme="dark"] {
  --vscode-editor-background: #1e1e1e;
  --vscode-editor-foreground: #cccccc;
  --vscode-titleBar-activeBackground: #2d2d2d;
  --vscode-sideBar-background: #252526;
  --vscode-panel-border: #444;
  --vscode-editorWidget-background: #2d2d2d;
  --vscode-button-secondaryBackground: #3a3d41;
  --vscode-button-secondaryForeground: #ccc;
  --vscode-button-secondaryHoverBackground: #505050;
  --vscode-descriptionForeground: #888;
  --vscode-focusBorder: #007acc;
  --vscode-dropdown-background: #3c3c3c;
  --vscode-dropdown-foreground: #ccc;
  --vscode-dropdown-border: #555;
}
body[data-theme="light"] {
  --vscode-editor-background: #ffffff;
  --vscode-editor-foreground: #1e1e1e;
  --vscode-titleBar-activeBackground: #f3f3f3;
  --vscode-sideBar-background: #f0f0f0;
  --vscode-panel-border: #d4d4d4;
  --vscode-editorWidget-background: #f8f8f8;
  --vscode-button-secondaryBackground: #e0e0e0;
  --vscode-button-secondaryForeground: #333;
  --vscode-button-secondaryHoverBackground: #d0d0d0;
  --vscode-descriptionForeground: #666;
  --vscode-focusBorder: #0078d4;
  --vscode-dropdown-background: #ffffff;
  --vscode-dropdown-foreground: #333;
  --vscode-dropdown-border: #ccc;
}
/* Light theme badge and color overrides */
body[data-theme="light"] .badge-build    { background: #4fc3f740; color: #0277bd; }
body[data-theme="light"] .badge-deploy   { background: #81c78440; color: #2e7d32; }
body[data-theme="light"] .badge-validate { background: #ffb74d40; color: #e65100; }
body[data-theme="light"] .badge-detect   { background: #ff704340; color: #bf360c; }
body[data-theme="light"] .badge-sync     { background: #b388ff40; color: #4a148c; }
body[data-theme="light"] .badge-template { background: #9e9e9e40; color: #424242; }
body[data-theme="light"] .badge-generic  { background: #d8af9340; color: #5d4037; }
body[data-theme="light"] .badge-test     { background: #f0629240; color: #880e4f; }
body[data-theme="light"] .badge-nuget    { background: #ffca2840; color: #f57f17; }
body[data-theme="light"] .badge-database { background: #388e3c40; color: #1b5e20; }
body[data-theme="light"] .badge-stage    { background: #ba68c840; color: #6a1b9a; }
body[data-theme="light"] .template-type-badge.ttb-pipeline { background: #ef535030; color: #c62828; }
body[data-theme="light"] .template-type-badge.ttb-pipelineTemplate { background: #f0629230; color: #880e4f; }
body[data-theme="light"] .template-type-badge.ttb-stages { background: #ba68c830; color: #6a1b9a; }
body[data-theme="light"] .template-type-badge.ttb-jobs { background: #9575cd30; color: #4527a0; }
body[data-theme="light"] .template-type-badge.ttb-steps { background: #7986cb30; color: #283593; }
body[data-theme="light"] .job-badge-job { background: #9575cd40; color: #4527a0; }
body[data-theme="light"] .job-badge-deploy { background: #9575cd40; color: #4527a0; }
body[data-theme="light"] .job-header:hover { background: #e0e0e0; }
body[data-theme="light"] .header-param-key { color: #0277bd; }
body[data-theme="light"] .header-param-val.param-true { color: #2e7d32; }
body[data-theme="light"] .header-param-val.param-false { color: #c62828; }
body[data-theme="light"] .header-param-val.param-str { color: #1b5e20; }
body[data-theme="light"] .sf-input-key { color: #0277bd; }
body[data-theme="light"] .sf-input-val { color: #1b5e20; }
body[data-theme="light"] .cond-label { color: #e65100; background: #ffb74d20; }
body[data-theme="light"] .sf-condition { color: #e65100; }
body[data-theme="light"] .sf-tpl { color: #283593; }
body[data-theme="light"] .job-header .job-nav { color: #283593; }
body[data-theme="light"] .sn-open { color: #283593; }
/* Light theme: darken the muted secondary text so it isn't washed out on white */
body[data-theme="light"] .sf-inputs-toggle,
body[data-theme="light"] .header-params-toggle { color: #4e6470; }
body[data-theme="light"] .meta { opacity: 0.9; }
body[data-theme="light"] .project-label { opacity: 0.7; }
body[data-theme="light"] .sn-tag { opacity: 1; }
body[data-theme="light"] .sn-footer,
body[data-theme="light"] .job-footer,
body[data-theme="light"] .job-meta,
body[data-theme="light"] .sf-child-footer { opacity: 0.8; }
body[data-theme="light"] .sf-type { opacity: 0.75; }
body[data-theme="light"] .pp-title,
body[data-theme="light"] .vp-title,
body[data-theme="light"] .skipped-title { opacity: 1; }
body[data-theme="light"] .pp-hint,
body[data-theme="light"] .vp-hint,
body[data-theme="light"] .skipped-hint,
body[data-theme="light"] .inspector-label { opacity: 0.85; color: #55606a; }

#canvas-wrapper { flex: 1; overflow: auto; position: relative; min-height: 0; }
#canvas {
  position: relative; padding: 40px;
  transform-origin: 0 0; min-width: max-content; min-height: max-content;
}

/* ===== Stage Nodes ===== */
.stage-node {
  position: absolute; width: 280px;
  background: var(--vscode-editorWidget-background, #2d2d2d);
  border: 1px solid var(--vscode-panel-border, #555);
  border-radius: 10px; border-left: 5px solid #ce93d8;
  cursor: pointer;
  transition: box-shadow 0.2s, width 0.3s ease, height 0.1s ease;
  overflow: hidden;
}
.stage-node:hover { box-shadow: 0 0 12px rgba(255,255,255,0.08); }
.stage-node.selected { box-shadow: 0 0 0 2px var(--vscode-focusBorder, #007acc); }
.stage-node.expanded { width: 460px; cursor: default; }

.sn-header {
  padding: 10px 12px 4px; font-size: 13px; font-weight: 600;
  display: flex; align-items: center; flex-wrap: wrap;
  overflow: hidden;
}
.sn-header .sn-title {
  flex-basis: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 2px; font-size: 13px;
}
.sn-sub {
  padding: 0 12px 6px; font-size: 11px; opacity: 0.6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sn-badge {
  display: inline-block; padding: 1px 6px; border-radius: 3px;
  font-size: 10px; font-weight: 600; margin-right: 4px;
}
.sn-tag {
  display: inline-block; padding: 1px 5px; border-radius: 3px;
  font-size: 9px; font-weight: 600; margin-right: 4px; opacity: 0.85;
}
.badge-stage { background: #ba68c820; color: #ba68c8; }
.sn-open {
  font-size: 10px; color: #7986cb; opacity: 0.7; cursor: pointer;
  margin-left: 8px; flex-shrink: 0;
}
.sn-open:hover { opacity: 1; text-decoration: underline; }
.sn-footer {
  padding: 4px 12px 8px; font-size: 10px; opacity: 0.5;
  border-top: 1px solid var(--vscode-panel-border, #444);
}
.stage-node.expanded .sn-footer { display: none; }

.stage-node.conditional { border-style: dashed; }
.stage-node.unresolved { opacity: 0.6; border-style: dotted; }
.stage-node.skipped { opacity: 0.35; }
.stage-node.skipped .sn-header::after {
  content: 'SKIPPED';
  font-size: 8px; font-weight: 700; color: #888;
  background: #88888820; padding: 1px 5px; border-radius: 3px;
  margin-left: 6px; vertical-align: middle;
}

.type-build    { border-left-color: #4fc3f7; }
.type-deploy   { border-left-color: #81c784; }
.type-validate { border-left-color: #ffb74d; }
.type-detect   { border-left-color: #ff7043; }
.type-sync     { border-left-color: #a177e9; }
.type-template { border-left-color: #9e9e9e; }
.type-generic  { border-left-color: #c0866c; }
.type-test     { border-left-color: #f06292; }
.type-nuget    { border-left-color: #ffca28; }
.type-database { border-left-color: #388e3c; }

.badge-build    { background: #4fc3f720; color: #4fc3f7; }
.badge-deploy   { background: #81c78420; color: #81c784; }
.badge-validate { background: #ffb74d20; color: #ffb74d; }
.badge-detect   { background: #ff704320; color: #ff7043; }
.badge-sync     { background: #b388ff20; color: #a177e9; }
.badge-template { background: #9e9e9e20; color: #9e9e9e; }
.badge-generic  { background: #d8af9320; color: #c0866c; }
.badge-test     { background: #f0629220; color: #f06292; }
.badge-nuget    { background: #ffca2820; color: #ffca28; }
.badge-database { background: #388e3c20; color: #388e3c; }

.cond-label {
  font-size: 10px; color: #ffb74d;
  padding: 2px 8px; background: #ffb74d15;
  border-radius: 3px; margin: 0 12px 6px; display: block;
  word-break: break-all;
}
.tpl-label {
  font-size: 10px; color: #9e9e9e;
  padding: 2px 8px; display: block; margin: 0 12px 4px;
  word-break: break-all;
}
.sf-tpl.navigable { cursor: pointer; }
.sf-tpl.navigable:hover { text-decoration: underline; opacity: 1; }

/* ===== Expanded Inner Content ===== */
.stage-inner {
  display: none; padding: 6px 10px 10px;
  border-top: 1px solid var(--vscode-panel-border, #444);
}
.stage-node.expanded .stage-inner { display: block; }

/* Job cards inside a stage */
.job-card {
  margin: 6px 0; border-radius: 8px;
  border: 1px solid var(--vscode-panel-border, #444);
  background: var(--vscode-editor-background, #1e1e1e);
  overflow: hidden; cursor: pointer;
}
.job-card.expanded { cursor: default; }
.job-header {
  padding: 7px 10px; font-size: 12px; font-weight: 600;
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  background: var(--vscode-titleBar-activeBackground, #2d2d2d);
}
.job-header:hover { background: #3a3d41; }
.job-badge {
  font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 700;
  flex-shrink: 0;
}
.job-badge-job { background: #9575cd20; color: #9575cd; }
.job-badge-deploy { background: #9575cd20; color: #9575cd; }
.job-header .job-name {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.job-header .job-nav {
  font-size: 10px; color: #7986cb; opacity: 0.7; cursor: pointer; flex-shrink: 0;
}
.job-header .job-nav:hover { opacity: 1; text-decoration: underline; }
.job-meta {
  font-size: 10px; opacity: 0.5; padding: 2px 10px 4px;
}

/* Steps container inside a job (collapsed by default, visible when job is expanded) */
.job-steps {
  padding: 4px 6px 6px;
  display: none;
}
.job-card.expanded .job-steps { display: block; }
.job-card.expanded .job-footer { display: none; }
.job-footer {
  padding: 4px 10px 6px; font-size: 10px; opacity: 0.5;
}

/* ===== Step Flow (inside job) ===== */
.step-flow-item {
  display: flex; align-items: stretch; margin-bottom: 0; position: relative;
}
.step-flow-connector {
  width: 20px; display: flex; flex-direction: column; align-items: center; flex-shrink: 0;
}
.step-flow-dot {
  width: 8px; height: 8px; border-radius: 50%;
  border: 2px solid #555; background: var(--vscode-editor-background, #1e1e1e);
  flex-shrink: 0; z-index: 1;
}
.step-flow-line { width: 2px; flex: 1; background: #444; }
.step-flow-card {
  flex: 1; padding: 5px 8px; margin-left: 6px;
  border-radius: 5px; font-size: 11px;
  border-left: 3px solid #555;
  background: var(--vscode-editorWidget-background, #2d2d2d);
  display: flex; flex-direction: column; gap: 1px;
  margin-top: 2px; margin-bottom: 2px;
}
.step-flow-card .sf-name { font-weight: 600; font-size: 11px; }
.step-flow-card .sf-type { font-size: 9px; opacity: 0.5; }
.step-flow-card .sf-tpl { font-size: 9px; color: #7986cb; word-break: break-all; }
.stage-node .sf-tpl, .job-card .sf-tpl { font-size: 10px; color: #7986cb; word-break: break-all; padding: 2px 12px 4px; display: block; }
.stage-node .sf-inputs, .job-card .sf-inputs { padding: 2px 12px 4px; }
.sf-tpl-label { color: #90a4ae; }
body[data-theme="light"] .sf-tpl-label { color: #666; }
.sf-type-label { font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 2px; margin-bottom: 2px; display: inline-block; }
.sf-label-step { background: #7986cb20; color: #7986cb; }
.sf-label-task { background: #42a5f520; color: #42a5f5; }
.sf-label-powershell { background: #b39ddb20; color: #b39ddb; }

.step-flow-card.sf-template { border-left-color: #7986cb; cursor: pointer; }
.step-flow-card.sf-template:hover { background: #7986cb15; }
.step-flow-card.sf-task { border-left-color: #42a5f5; }
.step-flow-card.sf-script, .step-flow-card.sf-powershell, .step-flow-card.sf-bash { border-left-color: #b39ddb; }
.step-flow-card.sf-cmd { border-left-color: #b39ddb; }
.step-flow-card.sf-sonarqube { border-left-color: #4caf93; }
.step-flow-card.sf-checkout { border-left-color: #81c784; }

.step-flow-dot.dot-template { border-color: #7986cb; background: #7986cb; }
.step-flow-dot.dot-task { border-color: #42a5f5; }
.step-flow-dot.dot-script, .step-flow-dot.dot-powershell, .step-flow-dot.dot-bash { border-color: #b39ddb; }
.step-flow-dot.dot-cmd { border-color: #b39ddb; }
.step-flow-dot.dot-sonarqube { border-color: #4caf93; }
.step-flow-dot.dot-checkout { border-color: #81c784; }

.sf-task-badge { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: #42a5f520; color: #42a5f5; display: inline-block; margin-top: 1px; font-family: monospace; }
.sf-task-badge.tb-vsbuild { background: #2196f320; color: #64b5f6; }
.sf-task-badge.tb-nuget { background: #ffb74d20; color: #ffb74d; }
.sf-task-badge.tb-dotnet { background: #7c4dff20; color: #b388ff; }
.sf-task-badge.tb-powershell { background: #b39ddb20; color: #b39ddb; }
.sf-task-badge.tb-publish { background: #66bb6a20; color: #81c784; }
.sf-task-badge.tb-download { background: #26a69a20; color: #80cbc4; }
.sf-task-badge.tb-copy { background: #78909c20; color: #b0bec5; }
.sf-task-badge.tb-sonarqube { background: #4caf9320; color: #4caf93; }
.sf-task-badge.tb-cmd { background: #b39ddb20; color: #b39ddb; }
.sf-condition { font-size: 9px; color: #ffa726; margin-top: 2px; word-break: break-all; }
.sf-condition::before { content: "IF "; font-weight: 700; }
.sf-continue { font-size: 9px; color: #ef5350; margin-top: 1px; }
.sf-inputs { margin-top: 3px; font-size: 9px; }
.sf-inputs-toggle { cursor: pointer; color: #90a4ae; user-select: none; }
.sf-inputs-toggle:hover { color: #b0bec5; }
.sf-inputs-list { margin-top: 2px; padding-left: 6px; border-left: 1px solid #444; display: none; }
.sf-inputs-list.expanded { display: block; }
.sf-input-row { display: flex; gap: 4px; padding: 1px 0; line-height: 1.3; }
.sf-input-key { color: #81d4fa; font-family: monospace; white-space: nowrap; }
.sf-input-val { color: #c5e1a5; font-family: monospace; word-break: break-all; }
.sf-input-val.truncated { cursor: pointer; }
.sf-input-val.truncated:hover { text-decoration: underline; text-decoration-style: dotted; }
.sf-script-full { display: none; white-space: pre-wrap; font-family: monospace; font-size: 9px; color: #c5e1a5; background: #1a1a1a; border: 1px solid #333; border-radius: 3px; padding: 4px 6px; margin-top: 2px; max-height: 200px; overflow-y: auto; }
.sf-script-full.expanded { display: block; }

.child-flow { margin-top: 6px; padding: 6px 6px 4px 10px; border-top: 1px solid #7986cb25; border-radius: 4px; background: #7986cb06; display: none; }
.step-flow-card.has-children.expanded .child-flow { display: block; }
.child-flow .step-flow-connector { display: none; }
.child-flow .step-flow-card { margin-left: 0; border-left-width: 2px; }
.child-flow .step-flow-item { margin-bottom: 4px; }
.sf-child-footer { font-size: 10px; opacity: 0.5; margin-top: 4px; }
.step-flow-card.has-children.expanded .sf-child-footer { display: none; }
.step-flow-card.has-children { cursor: pointer; }
.step-flow-card.has-children:hover { box-shadow: 0 0 6px rgba(255,255,255,0.04); }

.direct-steps { max-width: 500px; }
.direct-jobs { max-width: 500px; }
.direct-jobs .job-card { margin-bottom: 12px; }

/* ===== SVG Connectors ===== */
svg.connectors {
  position: absolute; top: 0; left: 0;
  pointer-events: none; overflow: visible;
}
svg.connectors path {
  fill: none; stroke: var(--vscode-panel-border, #555); stroke-width: 2;
}
svg.connectors polygon { fill: var(--vscode-panel-border, #555); }

/* ===== Callers Panel ===== */
.callers-panel {
  padding: 8px 20px;
  background: var(--vscode-sideBar-background, #252526);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  font-size: 12px; max-height: 200px; overflow-y: auto;
}
.callers-panel.hidden { display: none; }
.callers-panel .callers-title { font-weight: 600; margin-bottom: 6px; opacity: 0.8; }
.callers-panel .caller-item {
  padding: 3px 6px; cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; gap: 8px;
}
.callers-panel .caller-item:hover { background: var(--vscode-button-secondaryBackground, #3a3d41); }
.callers-panel .caller-name { font-weight: 500; }
.callers-panel .caller-path { font-size: 10px; opacity: 0.6; font-family: monospace; }
.callers-panel .callers-empty { opacity: 0.5; font-style: italic; }
.callers-panel .callers-loading { opacity: 0.6; }

/* ===== Project Label ===== */
.project-label { font-size: 11px; opacity: 0.5; margin-bottom: 2px; }

/* ===== Parameter Picker Panel ===== */
.param-panel {
  padding: 10px 20px;
  background: var(--vscode-sideBar-background, #252526);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  font-size: 12px; max-height: 260px; overflow-y: auto; flex-shrink: 0;
}
.param-panel.hidden { display: none; }
.pp-title { font-weight: 600; margin-bottom: 8px; opacity: 0.85; }
.pp-hint { font-weight: 400; opacity: 0.55; margin-left: 8px; font-size: 11px; }
.pp-grid { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.pp-item { display: flex; align-items: center; gap: 8px; min-width: 220px; }
.pp-label { color: var(--vscode-editor-foreground, #ccc); cursor: pointer; }
.pp-item input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; accent-color: #81c784; order: -1; }
.pp-item select, .pp-item input[type="text"] {
  background: var(--vscode-dropdown-background, #3c3c3c);
  color: var(--vscode-dropdown-foreground, #ccc);
  border: 1px solid var(--vscode-dropdown-border, #555);
  border-radius: 4px; padding: 2px 6px; font-size: 12px; margin-left: auto;
}
.pp-actions { margin-top: 10px; }
.pp-reset {
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, #ccc);
  border: 1px solid var(--vscode-panel-border, #555);
  padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;
}
.pp-reset:hover { background: var(--vscode-button-secondaryHoverBackground, #505050); }

/* ===== Skipped Stages Panel ===== */
.skipped-panel {
  padding: 8px 20px;
  background: var(--vscode-sideBar-background, #252526);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  font-size: 12px; max-height: 200px; overflow-y: auto; flex-shrink: 0;
}
.skipped-panel.hidden { display: none; }
.skipped-title { font-weight: 600; margin-bottom: 6px; opacity: 0.8; }
.skipped-hint { font-weight: 400; opacity: 0.55; margin-left: 8px; font-size: 11px; }
.skipped-list { display: flex; flex-direction: column; gap: 4px; }
.skipped-item {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  padding: 3px 8px; border-left: 3px solid #888; border-radius: 3px;
  background: #8888880f; opacity: 0.85;
}
.skipped-name { font-weight: 600; }
.skipped-expr { font-family: monospace; font-size: 10px; color: #ffb74d; word-break: break-all; }
.skipped-reason { font-family: monospace; font-size: 10px; color: #f48771; }
.skipped-reason::before { content: "because "; opacity: 0.6; }
body[data-theme="light"] .skipped-expr { color: #e65100; }
body[data-theme="light"] .skipped-reason { color: #c62828; }

/* ===== Variables Panel ===== */
.vars-panel {
  padding: 8px 20px;
  background: var(--vscode-sideBar-background, #252526);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  font-size: 12px; max-height: 220px; overflow-y: auto; flex-shrink: 0;
}
.vars-panel.hidden { display: none; }
.vp-section { margin-bottom: 10px; }
.vp-section:last-child { margin-bottom: 0; }
.vp-title { font-weight: 600; margin-bottom: 6px; opacity: 0.85; }
.vp-hint { font-weight: 400; opacity: 0.55; margin-left: 8px; font-size: 11px; }
.vp-groups { display: flex; flex-wrap: wrap; gap: 6px; }
.vp-group {
  font-family: monospace; font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: #4fc3f720; color: #4fc3f7; border: 1px solid #4fc3f740;
}
.vp-vars { display: flex; flex-direction: column; gap: 3px; }
.vp-var { display: flex; gap: 8px; align-items: baseline; padding: 1px 0; border-bottom: 1px solid #ffffff08; }
.vp-key { color: #81d4fa; font-family: monospace; font-weight: 500; white-space: nowrap; }
.vp-key::after { content: ":"; }
.vp-val { color: #c5e1a5; font-family: monospace; word-break: break-all; }
body[data-theme="light"] .vp-group { background: #4fc3f730; color: #0277bd; }
body[data-theme="light"] .vp-key { color: #0277bd; }
body[data-theme="light"] .vp-val { color: #1b5e20; }
`;
}
