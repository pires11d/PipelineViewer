export function getScript(): string {
  return /*js*/`
(function() {
  try {
  var vscode = acquireVsCodeApi();
  var canvas = document.getElementById('canvas');
  var zoom = 1;
  var expandedStages = {};

  // Inspector buttons (Parameters / Variables / Skipped) light up when they
  // have content and go dim+disabled when empty. The button's 'is-open' class
  // is the source of truth for whether its panel is showing, preserved across
  // re-renders.
  function setInspector(btnId, hasContent) {
    var b = document.getElementById(btnId);
    if (!b) return;
    b.disabled = !hasContent;
    b.classList.toggle('has-content', hasContent);
    if (!hasContent) { b.classList.remove('is-open'); }
  }
  function inspectorOpen(btnId) {
    var b = document.getElementById(btnId);
    return !!(b && b.classList.contains('is-open'));
  }

  // -- Interactive parameter state --
  // CONTROLS: the pipeline's own declared parameters (user-adjustable).
  // PARAM_VALUES: current effective values keyed by the names used in conditions.
  var CONTROLS = MODEL.controls || [];
  var PARAM_VALUES = Object.assign({}, MODEL.paramValues || {});
  var INTERACTIVE = MODEL.templateType === 'pipeline' && CONTROLS.length > 0;
  // Restore saved picker values ONLY for the same file. The panel is reused
  // across pipelines (createOrShow -> update), so unscoped state would leak one
  // pipeline's parameter values into another and mis-evaluate its conditions.
  var _st = vscode.getState() || {};
  if (_st.paramValues && _st.paramValuesFile === MODEL.filePath) {
    PARAM_VALUES = Object.assign(PARAM_VALUES, _st.paramValues);
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  // Escape a string for use as a quoted CSS attribute value selector: [attr="..."]
  // CSS.escape() is for identifiers only — using it inside quotes produces wrong escapes.
  function attrEsc(s) {
    return s.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
  }

  function persistParams() {
    vscode.setState(Object.assign({}, vscode.getState() || {}, {
      paramValues: PARAM_VALUES,
      paramValuesFile: MODEL.filePath
    }));
  }

  // -- Header --
  var header = document.getElementById('header');
  var hasName = MODEL.name && MODEL.name !== 'Unnamed Pipeline';
  var metaItems = '';
  var totalJobs = 0, totalSteps = 0;
  MODEL.stages.forEach(function(s) {
    if (!s.jobs) return;
    totalJobs += s.jobs.length;
    s.jobs.forEach(function(j) { totalSteps += (j.steps ? j.steps.length : 0); });
  });
  if (MODEL.templateType === 'pipeline') {
    metaItems = '<span><span class="label">Trigger:</span> ' + esc(MODEL.trigger) + '</span>'
      + '<span><span class="label">PR:</span> ' + esc(MODEL.pr) + '</span>'
      + '<span><span class="label">Pool:</span> ' + esc(MODEL.pool) + '</span>'
      + '<span><span class="label">Stages:</span> ' + MODEL.stages.length + '</span>';
  } else if (MODEL.templateType === 'pipelineTemplate' || MODEL.templateType === 'stages') {
    metaItems = '<span><span class="label">Stages:</span> ' + MODEL.stages.length + '</span>'
      + '<span><span class="label">Jobs:</span> ' + totalJobs + '</span>'
      + '<span><span class="label">Steps:</span> ' + totalSteps + '</span>';
  } else if (MODEL.templateType === 'jobs') {
    metaItems = '<span><span class="label">Jobs:</span> ' + totalJobs + '</span>'
      + '<span><span class="label">Steps:</span> ' + totalSteps + '</span>';
  } else {
    metaItems = '<span><span class="label">Steps:</span> ' + totalSteps + '</span>';
  }
  var typeLabels = { pipeline: 'PIPELINE', pipelineTemplate: 'PIPELINE TEMPLATE', stages: 'STAGE TEMPLATE', jobs: 'JOB TEMPLATE', steps: 'STEP TEMPLATE' };
  var typeBadge = '<span class="template-type-badge ttb-' + MODEL.templateType + '">' + typeLabels[MODEL.templateType] + '</span>';
  // Show last 2 directory segments above the filename
  var projectLabel = '';
  if (RELATIVE_PATH) {
    var relParts = RELATIVE_PATH.replace(/\\\\\\\\/g, '/').split('/');
    relParts.pop(); // remove filename
    if (relParts.length > 2) relParts = relParts.slice(-2);
    if (relParts.length > 0) projectLabel = relParts.join('/');
  }
  header.innerHTML = (projectLabel ? '<div class="project-label">' + esc(projectLabel) + '</div>' : '')
    + '<h1>' + esc(MODEL.fileName) + typeBadge + '</h1>'
    + (hasName ? '<div class="pipeline-name">' + esc(MODEL.name) + '</div>' : '')
    + '<div class="meta">' + metaItems + '</div>';

  // Show caller params if present -- but not for pipelines that have the
  // interactive Parameters inspector (would be redundant). Kept for navigated
  // templates, where it shows what the caller passed in.
  if (!INTERACTIVE && MODEL.callerParams && Object.keys(MODEL.callerParams).length > 0) {
    var paramKeys = Object.keys(MODEL.callerParams);
    var paramsHtml = '<div class="header-params">';
    paramsHtml += '<div class="header-params-toggle" data-toggle-header-params="1">';
    paramsHtml += '<span class="label">Params</span> <span class="param-count">(' + paramKeys.length + ')</span> &#9662;</div>';
    paramsHtml += '<div class="header-params-grid collapsed">';
    paramKeys.forEach(function(k) {
      var v = MODEL.callerParams[k];
      var display = (typeof v === 'object') ? JSON.stringify(v) : String(v);
      if (display.length > 60) display = display.substring(0, 57) + '...';
      var cls = (v === true) ? 'param-true' : (v === false) ? 'param-false' : 'param-str';
      paramsHtml += '<div class="header-param-item">';
      paramsHtml += '<span class="header-param-key">' + esc(k) + '</span>';
      paramsHtml += '<span class="header-param-val ' + cls + '">' + esc(display) + '</span>';
      paramsHtml += '</div>';
    });
    paramsHtml += '</div></div>';
    header.innerHTML += paramsHtml;
  }

  // -- Condition evaluator (client mirror of the parser's tryEvalCondition) --
  // Lets the parameter picker recompute which stages run without a round-trip.
  function splitTopLevelArgs(text) {
    var parts = [], depth = 0, start = 0;
    for (var i = 0; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      else if (text[i] === ',' && depth === 0) { parts.push(text.substring(start, i)); start = i + 1; }
    }
    parts.push(text.substring(start));
    return parts;
  }

  // Returns true / false / null (null = cannot evaluate; treat as "shown").
  function evalCondition(expr, values) {
    if (!expr) return null;
    var andMatch = expr.match(/^if\\s+and\\((.+)\\)$/);
    if (andMatch) {
      var ar = splitTopLevelArgs(andMatch[1]).map(function(p) { return evalCondition('if ' + p.trim(), values); });
      if (ar.some(function(r) { return r === false; })) return false;
      if (ar.some(function(r) { return r === null; })) return null;
      return true;
    }
    var orMatch = expr.match(/^if\\s+or\\((.+)\\)$/);
    if (orMatch) {
      var or = splitTopLevelArgs(orMatch[1]).map(function(p) { return evalCondition('if ' + p.trim(), values); });
      if (or.some(function(r) { return r === true; })) return true;
      if (or.some(function(r) { return r === null; })) return null;
      return false;
    }
    var m = expr.match(/^if\\s+(eq|ne)\\s*\\(\\s*parameters\\.(\\w+)\\s*,\\s*(.+?)\\s*\\)$/);
    if (!m) return null;
    var op = m[1], name = m[2], rawVal = m[3];
    if (!(name in values)) return null;
    var expected = rawVal;
    if (expected === 'true') expected = true;
    else if (expected === 'false') expected = false;
    else if (/^'.*'$/.test(expected)) expected = expected.slice(1, -1);
    else if (/^".*"$/.test(expected)) expected = expected.slice(1, -1);
    var isEqual = String(values[name]) === String(expected);
    return op === 'eq' ? isEqual : !isEqual;
  }

  // Parameter names referenced by an expression (for the "why skipped" reason).
  function paramsInExpr(expr) {
    var names = [], seen = {}, re = /parameters\\.(\\w+)/g, m;
    while ((m = re.exec(expr || '')) !== null) {
      if (!seen[m[1]]) { seen[m[1]] = true; names.push(m[1]); }
    }
    return names;
  }

  // Decide whether a stage is skipped under the current parameter values.
  function computeSkip(s) {
    if (INTERACTIVE && s.conditionalExpr) {
      var r = evalCondition(s.conditionalExpr, PARAM_VALUES);
      if (r === false) return true;
      if (r === true) return false;
    }
    return !!s.skipped;
  }

  // Human-readable reason a stage was skipped (the deciding param values).
  function explainSkip(s) {
    var parts = [];
    paramsInExpr(s.conditionalExpr).forEach(function(n) {
      if (n in PARAM_VALUES) parts.push(n + ' = ' + String(PARAM_VALUES[n]));
    });
    return parts.join(', ');
  }

  // -- Layout state (rebuilt on every render) --
  var stages = [], stageMap = {}, lo = null, nodePositions = {};
  var NODE_W = 280, NODE_W_EXP = 460, H_GAP = 80, V_GAP = 50, PAD = 40;

  function computeLayers() {
    var layers = {}, vis = {};
    function getLayer(name) {
      if (vis[name]) return layers[name] || 0;
      vis[name] = true;
      var s = stageMap[name];
      if (!s) { layers[name] = 0; return 0; }
      var resolvedDeps = getEffectiveDeps(s);
      if (resolvedDeps.length === 0) { layers[name] = 0; return 0; }
      var mx = 0;
      resolvedDeps.forEach(function(dep) { mx = Math.max(mx, getLayer(dep) + 1); });
      layers[name] = mx; return mx;
    }

    // Get effective dependencies, collapsing through skipped stages
    function getEffectiveDeps(s) {
      var direct = (s.dependsOn || []).filter(function(d) {
        return stageMap[d] && !/\\$\\{\\{/.test(d);
      });
      var result = [];
      for (var i = 0; i < direct.length; i++) {
        var dep = stageMap[direct[i]];
        if (dep && dep.skipped) {
          var collapsed = getEffectiveDeps(dep);
          for (var j = 0; j < collapsed.length; j++) {
            if (result.indexOf(collapsed[j]) === -1) result.push(collapsed[j]);
          }
        } else {
          if (result.indexOf(direct[i]) === -1) result.push(direct[i]);
        }
      }
      return result;
    }

    stages.forEach(function(s) { getLayer(s.name); });

    stages.forEach(function(s, idx) {
      if (idx === 0) return;
      var hasDeps = s.dependsOn && s.dependsOn.length > 0;
      var resolvedDeps = hasDeps ? getEffectiveDeps(s) : [];
      if (hasDeps && resolvedDeps.length === 0 && (layers[s.name] || 0) === 0) {
        var bestLayer = 0;
        for (var j = idx - 1; j >= 0; j--) {
          bestLayer = Math.max(bestLayer, (layers[stages[j].name] || 0));
        }
        layers[s.name] = bestLayer + 1;
      }
    });
    var groups = {}, maxLayer = 0;
    stages.forEach(function(s) {
      var layer = layers[s.name] || 0;
      if (!groups[layer]) groups[layer] = [];
      groups[layer].push(s);
      maxLayer = Math.max(maxLayer, layer);
    });
    return { layers: layers, groups: groups, maxLayer: maxLayer };
  }

  // -- Humanize unresolved parameter expressions for display --
  function humanize(text) {
    if (!text) return '(unnamed)';
    return text.replace(/\\$\\{\\{\\s*parameters\\.(\\w+)\\s*\\}\\}/g, function(_, k) {
      return '(' + k + ')';
    });
  }

  // Derive a readable name from the filename when name/displayName are unresolved.
  function filenameFallback() {
    var base = MODEL.fileName
      .replace(/\\.(yml|yaml)$/i, '')
      .replace(/-stage$/, '');
    return base.split('-').map(function(w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function stageTitle(s) {
    var title = humanize(s.displayName || s.name || '(unnamed)');
    if (/^\\([^)]+\\)$/.test(title) || title === '(unnamed)') title = filenameFallback();
    return title;
  }

  function buildStageHtml(s) {
    var h = '<div class="sn-header">';
    h += '<span class="sn-badge badge-stage">STAGE</span> ';
    h += '<span class="sn-tag badge-' + s.type + '">' + s.type.toUpperCase() + '</span>';
    h += '<span class="sn-title">' + esc(stageTitle(s)) + '</span>';
    h += '</div>';
    if (s.isConditional && s.conditionalExpr)
      h += '<div class="cond-label">if: ' + esc(s.conditionalExpr) + '</div>';
    if (s.templateRef) {
      var tplNavCls = s.resolvedPath ? ' navigable' : '';
      var tplNavData = s.resolvedPath ? ' data-nav-path="' + esc(s.resolvedPath) + '"' : '';
      if (s.resolvedPath && s.parameters && Object.keys(s.parameters).length > 0) {
        tplNavData += " data-nav-params='" + esc(JSON.stringify(s.parameters)) + "'";
      }
      h += '<div class="sf-tpl' + tplNavCls + '"' + tplNavData + '><span class="sf-tpl-label">template:</span> ' + esc(s.templateRef) + '</div>';
    }
    var stageParamKeys = s.parameters ? Object.keys(s.parameters) : [];
    if (stageParamKeys.length > 0) {
      h += '<div class="sf-inputs stage-params">';
      h += '<span class="sf-inputs-toggle" data-toggle-inputs="1">';
      h += 'inputs (' + stageParamKeys.length + ') &#9662;</span>';
      h += '<div class="sf-inputs-list">';
      stageParamKeys.forEach(function(k) {
        var val = s.parameters[k] || '';
        if (val.length > 80) val = val.substring(0, 77) + '...';
        h += '<div class="sf-input-row"><span class="sf-input-key">' + esc(k) + ':</span>';
        h += '<span class="sf-input-val">' + esc(val) + '</span></div>';
      });
      h += '</div></div>';
    }
    var stageJobs = s.jobs || [];
    h += '<div class="sn-footer">' + stageJobs.length + ' job(s), '
      + stageJobs.reduce(function(sum, j) { return sum + (j.steps ? j.steps.length : 0); }, 0)
      + ' step(s)</div>';

    h += '<div class="stage-inner">';
    if (!s.jobs || s.jobs.length === 0) {
      h += '<div style="opacity:0.4;padding:10px;text-align:center;font-size:11px">No jobs resolved</div>';
    }
    (s.jobs || []).forEach(function(job, ji) {
      h += buildJobHtml(job, ji);
    });
    h += '</div>';
    return h;
  }

  function buildJobHtml(job, ji) {
    var badgeCls = job.isDeployment ? 'job-badge-deploy' : 'job-badge-job';
    var badgeText = 'JOB';

    var h = '<div class="job-card">';
    h += '<div class="job-header">';
    h += '<span class="job-badge ' + badgeCls + '">' + badgeText + '</span>';
    h += '<span class="job-name">' + esc(job.displayName) + '</span>';
    h += '</div>';

    if (job.environment) {
      h += '<div class="job-meta">Env: ' + esc(job.environment) + '</div>';
    }
    if (job.templateRef) {
      var jobTplNavCls = job.resolvedPath ? ' navigable' : '';
      var jobTplNavData = job.resolvedPath ? ' data-nav-path="' + esc(job.resolvedPath) + '"' : '';
      if (job.resolvedPath && job.parameters && Object.keys(job.parameters).length > 0) {
        jobTplNavData += " data-nav-params='" + esc(JSON.stringify(job.parameters)) + "'";
      }
      h += '<div class="sf-tpl' + jobTplNavCls + '"' + jobTplNavData + '><span class="sf-tpl-label">template:</span> ' + esc(job.templateRef) + '</div>';
    }

    var jobParamKeys = job.parameters ? Object.keys(job.parameters) : [];
    if (jobParamKeys.length > 0) {
      h += '<div class="sf-inputs job-params">';
      h += '<span class="sf-inputs-toggle" data-toggle-inputs="1">';
      h += 'inputs (' + jobParamKeys.length + ') &#9662;</span>';
      h += '<div class="sf-inputs-list">';
      jobParamKeys.forEach(function(k) {
        var val = job.parameters[k] || '';
        if (val.length > 80) val = val.substring(0, 77) + '...';
        h += '<div class="sf-input-row"><span class="sf-input-key">' + esc(k) + ':</span>';
        h += '<span class="sf-input-val">' + esc(val) + '</span></div>';
      });
      h += '</div></div>';
    }

    var stepCount = job.steps ? job.steps.length : 0;
    h += '<div class="job-footer">' + stepCount + ' step(s)</div>';

    h += '<div class="job-steps">';
    h += renderStepFlow(job.steps);
    h += '</div></div>';
    return h;
  }

  function getTaskBadgeClass(name) {
    var lower = (name || '').toLowerCase();
    if (lower.indexOf('vsbuild') >= 0) return 'tb-vsbuild';
    if (lower.indexOf('nuget') >= 0) return 'tb-nuget';
    if (lower.indexOf('dotnetcore') >= 0 || lower.indexOf('usedotnet') >= 0) return 'tb-dotnet';
    if (lower.indexOf('powershell') >= 0) return 'tb-powershell';
    if (lower.indexOf('publish') >= 0) return 'tb-publish';
    if (lower.indexOf('download') >= 0) return 'tb-download';
    if (lower.indexOf('copy') >= 0) return 'tb-copy';
    if (lower.indexOf('sonar') >= 0) return 'tb-sonarqube';
    if (lower.indexOf('cmdline') >= 0 || lower.indexOf('cmd') >= 0) return 'tb-cmd';
    return '';
  }

  function renderStepFlow(steps) {
    if (!steps || steps.length === 0)
      return '<div style="opacity:0.4;padding:6px;font-size:10px">No steps</div>';
    var html = '';
    steps.forEach(function(step, i) {
      var isLast = (i === steps.length - 1);
      html += '<div class="step-flow-item">';
      html += '<div class="step-flow-connector"><div class="step-flow-dot dot-' + step.type + '"></div>';
      if (!isLast) html += '<div class="step-flow-line"></div>';
      html += '</div>';
      html += '<div class="step-flow-card sf-' + step.type + (step.childSteps && step.childSteps.length > 0 ? ' has-children' : '') + '">';
      var stepLabel;
      var stepLabelCls;
      if (step.type === 'template' || step.type === 'checkout') {
        stepLabel = 'STEP';
        stepLabelCls = 'sf-label-step';
      } else if (step.type === 'task' || step.type === 'cmd' || step.type === 'sonarqube') {
        stepLabel = 'TASK';
        stepLabelCls = 'sf-label-task';
      } else if (step.type === 'powershell' || step.type === 'script' || step.type === 'bash') {
        stepLabel = step.type === 'powershell' ? 'POWERSHELL' : step.type === 'bash' ? 'BASH' : 'SCRIPT';
        stepLabelCls = 'sf-label-powershell';
      } else {
        stepLabel = step.type.toUpperCase();
        stepLabelCls = 'sf-label-step';
      }
      html += '<span class="sf-type-label ' + stepLabelCls + '">' + stepLabel + '</span>';
      html += '<div class="sf-name">' + esc(step.displayName) + '</div>';
      if (step.type === 'task' || step.type === 'cmd' || step.type === 'sonarqube') {
        var bc = getTaskBadgeClass(step.name);
        html += '<span class="sf-task-badge ' + bc + '">' + esc(step.name) + '</span>';
      } else if (step.type === 'powershell' || step.type === 'script' || step.type === 'bash') {
        var pbc = getTaskBadgeClass(step.name);
        html += '<span class="sf-task-badge ' + (pbc || 'tb-powershell') + '">' + esc(step.name) + '</span>';
      }
      if (step.templateRef) {
        var stepTplNavCls = step.resolvedPath ? ' navigable' : '';
        var stepTplNavData = step.resolvedPath ? ' data-nav-path="' + esc(step.resolvedPath) + '"' : '';
        if (step.resolvedPath && step.inputs && Object.keys(step.inputs).length > 0) {
          stepTplNavData += " data-nav-params='" + esc(JSON.stringify(step.inputs)) + "'";
        }
        html += '<div class="sf-tpl' + stepTplNavCls + '"' + stepTplNavData + '><span class="sf-tpl-label">template:</span> ' + esc(step.templateRef) + '</div>';
      }
      if (step.condition) {
        html += '<div class="sf-condition">' + esc(step.condition) + '</div>';
      }
      if (step.continueOnError) {
        html += '<div class="sf-continue">continueOnError: true</div>';
      }
      var inputKeys = step.inputs ? Object.keys(step.inputs) : [];
      if (inputKeys.length > 0) {
        html += '<div class="sf-inputs">';
        html += '<span class="sf-inputs-toggle" data-toggle-inputs="1">';
        html += 'inputs (' + inputKeys.length + ') &#9662;</span>';
        html += '<div class="sf-inputs-list">';
        inputKeys.forEach(function(k) {
          var val = step.inputs[k] || '';
          var isLong = val.length > 80;
          var display = isLong ? val.substring(0, 77) + '...' : val;
          html += '<div class="sf-input-row"><span class="sf-input-key">' + esc(k) + ':</span>';
          if (isLong) {
            html += '<span class="sf-input-val truncated" data-toggle-script="1">' + esc(display) + '</span></div>';
            html += '<div class="sf-script-full">' + esc(val) + '</div>';
          } else {
            html += '<span class="sf-input-val">' + esc(display) + '</span></div>';
          }
        });
        html += '</div></div>';
      }
      if (step.childSteps && step.childSteps.length > 0) {
        html += '<div class="sf-child-footer">' + step.childSteps.length + ' task(s)</div>';
        html += '<div class="child-flow">' + renderStepFlow(step.childSteps) + '</div>';
      }
      html += '</div></div>';
    });
    return html;
  }

  // -- Classify stages under current params, then (re)build the diagram --
  function classifyAndBuild() {
    var skipped = [], seen = {};
    stages = [];
    MODEL.stages.forEach(function(s) {
      // Reflect the current skip decision so getEffectiveDeps can collapse it
      s.skipped = computeSkip(s);
      if (s.skipped) { skipped.push(s); return; }
      if (seen[s.name]) return; // dedup identically-named active stages
      seen[s.name] = true;
      stages.push(s);
    });
    stageMap = {};
    stages.forEach(function(s) { stageMap[s.name] = s; });
    lo = computeLayers();
    nodePositions = {};
    canvas.innerHTML = '';

    var directSteps = (MODEL.templateType === 'steps' && stages.length === 1
      && stages[0].jobs && stages[0].jobs.length === 1
      && stages[0].jobs[0].steps);
    var directJobs = (MODEL.templateType === 'jobs' && stages.length === 1
      && stages[0].jobs && stages[0].jobs.length > 0);

    if (directSteps) {
      var stepContainer = document.createElement('div');
      stepContainer.className = 'direct-steps';
      stepContainer.innerHTML = renderStepFlow(stages[0].jobs[0].steps);
      canvas.appendChild(stepContainer);
      canvas.style.padding = '20px';
    } else if (directJobs) {
      var jobContainer = document.createElement('div');
      jobContainer.className = 'direct-jobs';
      stages[0].jobs.forEach(function(job, ji) {
        jobContainer.innerHTML += buildJobHtml(job, ji);
      });
      canvas.appendChild(jobContainer);
      canvas.style.padding = '20px';
    } else {
      canvas.style.padding = '';
      for (var col = 0; col <= lo.maxLayer; col++) {
        var cs = lo.groups[col] || [];
        var x = PAD + col * (NODE_W + H_GAP);
        cs.forEach(function(s, ri) {
          var y = PAD + ri * 120;
          nodePositions[s.name] = { x: x, y: y, w: NODE_W, h: 70 };
          var div = document.createElement('div');
          div.className = 'stage-node type-' + s.type;
          if (s.isConditional) div.classList.add('conditional');
          if (!s.templateResolved && s.templateRef) div.classList.add('unresolved');
          if (expandedStages[s.name]) div.classList.add('expanded');
          div.style.left = x + 'px';
          div.style.top = y + 'px';
          div.setAttribute('data-stage', s.name);
          div.innerHTML = buildStageHtml(s);
          canvas.appendChild(div);
        });
      }
    }

    renderExcluded(skipped);
    relayout();
  }

  // -- Skipped stages panel (feature: "why is this stage not running?") --
  function renderExcluded(skipped) {
    var panel = document.getElementById('skipped-panel');
    if (!panel) return;
    var hasContent = skipped && skipped.length > 0;
    setInspector('btnExcluded', hasContent);
    if (!hasContent) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    var h = '<div class="skipped-title">Skipped stages (' + skipped.length + ')'
      + '<span class="skipped-hint">not run under the current parameters</span></div>';
    h += '<div class="skipped-list">';
    skipped.forEach(function(s) {
      var reason = explainSkip(s);
      h += '<div class="skipped-item">';
      h += '<span class="skipped-name">' + esc(stageTitle(s)) + '</span>';
      if (s.conditionalExpr) h += '<span class="skipped-expr">if: ' + esc(s.conditionalExpr) + '</span>';
      if (reason) h += '<span class="skipped-reason">' + esc(reason) + '</span>';
      h += '</div>';
    });
    h += '</div>';
    panel.innerHTML = h;
    // Preserve whatever open/closed state the button reflects (closed initially).
    panel.classList.toggle('hidden', !inspectorOpen('btnExcluded'));
  }

  // -- Parameter picker panel (feature: toggle params, preview live) --
  function renderParamPanel() {
    var panel = document.getElementById('param-panel');
    if (!panel) return;
    if (!INTERACTIVE) {
      panel.classList.add('hidden');
      setInspector('btnParams', false);
      return;
    }
    setInspector('btnParams', true);

    var h = '<div class="pp-title">Run parameters <span class="pp-hint">adjust to preview which stages run</span></div>';
    h += '<div class="pp-grid">';
    CONTROLS.forEach(function(c, i) {
      var cur = (c.name in PARAM_VALUES) ? PARAM_VALUES[c.name] : c.value;
      var id = 'pp_' + i;
      h += '<div class="pp-item">';
      h += '<label class="pp-label" for="' + id + '">' + esc(c.displayName || c.name) + '</label>';
      if (c.type === 'boolean') {
        h += '<input type="checkbox" class="pp-input" id="' + id + '" data-pname="' + esc(c.name) + '" data-ptype="boolean"' + (cur === true ? ' checked' : '') + '>';
      } else if (c.values && c.values.length > 0) {
        h += '<select class="pp-input" id="' + id + '" data-pname="' + esc(c.name) + '" data-ptype="' + esc(c.type) + '">';
        c.values.forEach(function(v) {
          h += '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(v) + '</option>';
        });
        h += '</select>';
      } else {
        h += '<input type="text" class="pp-input" id="' + id + '" data-pname="' + esc(c.name) + '" data-ptype="' + esc(c.type) + '" value="' + esc(String(cur)) + '">';
      }
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="pp-actions"><button id="btnParamReset" class="pp-reset">Reset to defaults</button></div>';
    panel.innerHTML = h;
    // Preserve open/closed state across rebuilds (starts closed).
    panel.classList.toggle('hidden', !inspectorOpen('btnParams'));

    panel.querySelectorAll('.pp-input').forEach(function(el) {
      el.addEventListener('change', function() {
        var name = el.getAttribute('data-pname');
        var ptype = el.getAttribute('data-ptype');
        var val;
        if (ptype === 'boolean') { val = el.checked; }
        else if (ptype === 'number') { var n = Number(el.value); val = isNaN(n) ? el.value : n; }
        else { val = el.value; }
        PARAM_VALUES[name] = val;
        persistParams();
        classifyAndBuild();
      });
    });
    var resetBtn = document.getElementById('btnParamReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        CONTROLS.forEach(function(c) { PARAM_VALUES[c.name] = c.value; });
        persistParams();
        renderParamPanel();
        classifyAndBuild();
      });
    }
  }

  // -- Variables panel (variable groups + inline variables) --
  function renderVarsPanel() {
    var panel = document.getElementById('vars-panel');
    if (!panel) return;
    var groups = MODEL.variableGroups || [];
    var vars = MODEL.variables || [];
    if (groups.length === 0 && vars.length === 0) {
      setInspector('btnVariables', false);
      return;
    }
    setInspector('btnVariables', true);
    var h = '';
    if (groups.length > 0) {
      h += '<div class="vp-section">';
      h += '<div class="vp-title">Variable groups (' + groups.length + ')';
      h += '<span class="vp-hint">must exist in the target ADO project (Pipelines &#8250; Library)</span></div>';
      h += '<div class="vp-groups">';
      groups.forEach(function(g) { h += '<span class="vp-group">' + esc(g) + '</span>'; });
      h += '</div></div>';
    }
    if (vars.length > 0) {
      h += '<div class="vp-section">';
      h += '<div class="vp-title">Inline variables (' + vars.length + ')</div>';
      h += '<div class="vp-vars">';
      vars.forEach(function(v) {
        h += '<div class="vp-var"><span class="vp-key">' + esc(v.name) + '</span>';
        h += '<span class="vp-val">' + esc(v.value) + '</span></div>';
      });
      h += '</div></div>';
    }
    panel.innerHTML = h;
  }

  // -- PNG export: draw the stage-level layout onto a 2D canvas --
  // Pure canvas drawing (no external image) so toDataURL stays untainted.
  function colorForType(t) {
    var map = {
      build: '#4fc3f7', deploy: '#81c784', validate: '#ff7043', detect: '#3d5afe',
      sync: '#a177e9', template: '#f5f5f5', generic: '#9e9e9e', test: '#f06292',
      nuget: '#ffca28'
    };
    return map[t] || '#9e9e9e';
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '...').width > maxW) t = t.slice(0, -1);
    return t + '...';
  }

  function drawEdgeCtx(ctx, from, to) {
    var x1 = from.x + from.w, y1 = from.y + from.h / 2;
    var x2 = to.x, y2 = to.y + to.h / 2, midX = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    var a = 6;
    ctx.beginPath();
    ctx.moveTo(x2 - a, y2 - a / 2);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - a, y2 + a / 2);
    ctx.closePath();
    ctx.fill();
  }

  function renderPng() {
    if (!lo) return null;
    var W = 280, HH = 92, HG = 80, VG = 42, PADp = 40, scale = 2;
    var pos = {}, maxX = 0, maxY = 0;
    for (var c = 0; c <= lo.maxLayer; c++) {
      var colStages = lo.groups[c] || [];
      for (var ri = 0; ri < colStages.length; ri++) {
        var s = colStages[ri];
        var x = PADp + c * (W + HG), y = PADp + ri * (HH + VG);
        pos[s.name] = { x: x, y: y, w: W, h: HH };
        maxX = Math.max(maxX, x + W); maxY = Math.max(maxY, y + HH);
      }
    }
    var cw = Math.max(maxX + PADp, 400), ch = Math.max(maxY + PADp, 160);
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(cw * scale); cv.height = Math.ceil(ch * scale);
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    var bs = getComputedStyle(document.body);
    ctx.fillStyle = bs.backgroundColor || '#1e1e1e';
    ctx.fillRect(0, 0, cw, ch);
    var textColor = bs.color || '#cccccc';
    var sample = document.querySelector('.stage-node');
    var nodeBg = sample ? getComputedStyle(sample).backgroundColor : '#2d2d2d';
    var borderCol = sample ? getComputedStyle(sample).borderTopColor : '#555555';

    ctx.strokeStyle = borderCol; ctx.fillStyle = borderCol; ctx.lineWidth = 2;
    stages.forEach(function(s) {
      var to = pos[s.name];
      if (!to) return;
      (s.dependsOn || []).forEach(function(dn) {
        var from = pos[dn];
        if (from) drawEdgeCtx(ctx, from, to);
      });
    });

    stages.forEach(function(s) {
      var p = pos[s.name];
      if (!p) return;
      roundRectPath(ctx, p.x, p.y, p.w, p.h, 10);
      ctx.fillStyle = nodeBg; ctx.fill();
      ctx.strokeStyle = borderCol; ctx.lineWidth = 1; ctx.stroke();
      var col = colorForType(s.type);
      ctx.save();
      roundRectPath(ctx, p.x, p.y, p.w, p.h, 10);
      ctx.clip();
      ctx.fillStyle = col; ctx.fillRect(p.x, p.y, 5, p.h);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = textColor; ctx.font = '600 13px "Segoe UI",sans-serif';
      ctx.fillText(fitText(ctx, stageTitle(s), p.w - 26), p.x + 16, p.y + 26);
      ctx.fillStyle = col; ctx.font = '700 9px "Segoe UI",sans-serif';
      ctx.fillText(s.type.toUpperCase(), p.x + 16, p.y + 44);
      if (s.isConditional && s.conditionalExpr) {
        ctx.fillStyle = '#ffb74d'; ctx.font = '9px monospace';
        ctx.fillText(fitText(ctx, 'if: ' + s.conditionalExpr, p.w - 26), p.x + 16, p.y + 60);
      }
      var jobs = s.jobs || [];
      var steps = jobs.reduce(function(a, j) { return a + (j.steps ? j.steps.length : 0); }, 0);
      ctx.fillStyle = textColor; ctx.globalAlpha = 0.55; ctx.font = '10px "Segoe UI",sans-serif';
      ctx.fillText(jobs.length + ' job(s), ' + steps + ' step(s)', p.x + 16, p.y + p.h - 14);
      ctx.globalAlpha = 1;
    });
    return cv.toDataURL('image/png');
  }

  // -- Wire click events (delegate on canvas) --
  canvas.addEventListener('click', function(e) {
    var stepCard = e.target.closest('.step-flow-card.has-children');
    if (stepCard) {
      if (e.target.closest('[data-toggle-inputs]') || e.target.closest('.sf-inputs-list')
        || e.target.closest('[data-nav-path]') || e.target.closest('[data-toggle-script]')) {
        // fall through to other handlers
      } else {
        e.stopPropagation();
        stepCard.classList.toggle('expanded');
        relayout();
        return;
      }
    }
    var toggle = e.target.closest('[data-toggle-inputs]');
    if (toggle) {
      e.stopPropagation();
      var list = toggle.parentElement.querySelector('.sf-inputs-list');
      if (list) list.classList.toggle('expanded');
      return;
    }
    var scriptToggle = e.target.closest('[data-toggle-script]');
    if (scriptToggle) {
      e.stopPropagation();
      var fullBlock = scriptToggle.parentElement.nextElementSibling;
      if (fullBlock && fullBlock.classList.contains('sf-script-full')) {
        fullBlock.classList.toggle('expanded');
      }
      return;
    }
    var navCard = e.target.closest('[data-nav-path]');
    if (navCard) {
      e.stopPropagation();
      var navParams = {};
      var rawParams = navCard.getAttribute('data-nav-params');
      if (rawParams) { try { navParams = JSON.parse(rawParams); } catch(ex) {} }
      vscode.postMessage({ command: 'visualizeTemplate', path: navCard.getAttribute('data-nav-path'), callerParams: navParams });
      return;
    }
    var jobHeader = e.target.closest('.job-header');
    if (jobHeader) {
      if (e.target.closest('.job-nav')) return;
      var jobCard = jobHeader.closest('.job-card');
      if (jobCard) {
        jobCard.classList.toggle('expanded');
        relayout();
        return;
      }
    }
    var jobCard2 = e.target.closest('.job-card');
    if (jobCard2 && !jobCard2.classList.contains('expanded')) {
      if (e.target.closest('.job-nav')) return;
      jobCard2.classList.toggle('expanded');
      relayout();
      return;
    }
    var stageEl = e.target.closest('.stage-node');
    if (stageEl) {
      var inner = e.target.closest('.stage-inner');
      if (inner) return;
      var name = stageEl.getAttribute('data-stage');
      if (name) toggleStage(name);
    }
  });

  function toggleStage(name) {
    var el = canvas.querySelector('[data-stage="' + attrEsc(name) + '"]');
    if (!el) return;
    if (expandedStages[name]) {
      el.classList.remove('expanded');
      delete expandedStages[name];
    } else {
      el.classList.add('expanded');
      expandedStages[name] = true;
    }
    relayout();
  }

  function expandAll() {
    stages.forEach(function(s) {
      var el = canvas.querySelector('[data-stage="' + attrEsc(s.name) + '"]');
      if (el) { el.classList.add('expanded'); expandedStages[s.name] = true; }
    });
    canvas.querySelectorAll('.sf-inputs-list').forEach(function(list) { list.classList.add('expanded'); });
    canvas.querySelectorAll('.job-card').forEach(function(jc) { jc.classList.add('expanded'); });
    canvas.querySelectorAll('.step-flow-card.has-children').forEach(function(cf) { cf.classList.add('expanded'); });
    var hpGrid = document.querySelector('.header-params-grid');
    if (hpGrid) hpGrid.classList.remove('collapsed');
    relayout();
  }

  function collapseAll() {
    stages.forEach(function(s) {
      var el = canvas.querySelector('[data-stage="' + attrEsc(s.name) + '"]');
      if (el) el.classList.remove('expanded');
    });
    expandedStages = {};
    canvas.querySelectorAll('.sf-inputs-list').forEach(function(list) { list.classList.remove('expanded'); });
    canvas.querySelectorAll('.job-card').forEach(function(jc) { jc.classList.remove('expanded'); });
    canvas.querySelectorAll('.step-flow-card.has-children').forEach(function(cf) { cf.classList.remove('expanded'); });
    var hpGrid = document.querySelector('.header-params-grid');
    if (hpGrid) hpGrid.classList.add('collapsed');
    relayout();
  }

  // -- Relayout: measure heights, reposition, redraw connectors --
  function relayout() {
    document.querySelectorAll('.stage-node').forEach(function(el) {
      var nm = el.getAttribute('data-stage');
      if (nm && nodePositions[nm]) {
        var isExp = expandedStages[nm];
        nodePositions[nm].w = isExp ? NODE_W_EXP : NODE_W;
        el.style.width = nodePositions[nm].w + 'px';
      }
    });
    requestAnimationFrame(function() {
      document.querySelectorAll('.stage-node').forEach(function(el) {
        var nm = el.getAttribute('data-stage');
        if (nm && nodePositions[nm]) {
          nodePositions[nm].h = el.getBoundingClientRect().height / zoom;
        }
      });
      if (!lo) return;
      var colX = [];
      var xCursor = PAD;
      for (var c = 0; c <= lo.maxLayer; c++) {
        colX[c] = xCursor;
        var maxW = NODE_W;
        (lo.groups[c] || []).forEach(function(s) {
          if (nodePositions[s.name]) maxW = Math.max(maxW, nodePositions[s.name].w);
        });
        xCursor += maxW + H_GAP;
      }
      for (var c2 = 0; c2 <= lo.maxLayer; c2++) {
        var cStages = lo.groups[c2] || [];
        var yOff = PAD;
        cStages.forEach(function(s) {
          nodePositions[s.name].x = colX[c2];
          nodePositions[s.name].y = yOff;
          yOff += nodePositions[s.name].h + V_GAP;
          var el = canvas.querySelector('[data-stage="' + attrEsc(s.name) + '"]');
          if (el) {
            el.style.left = colX[c2] + 'px';
            el.style.top = nodePositions[s.name].y + 'px';
          }
        });
      }
      renderConnectors();
    });
  }

  // -- Orthogonal Connectors --
  function renderConnectors() {
    var old = canvas.querySelector('svg.connectors');
    if (old) old.remove();
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('connectors');
    var maxX = 0, maxY = 0;
    Object.values(nodePositions).forEach(function(p) {
      maxX = Math.max(maxX, p.x + p.w + PAD * 2);
      maxY = Math.max(maxY, p.y + p.h + PAD * 2);
    });
    svg.setAttribute('width', String(maxX));
    svg.setAttribute('height', String(maxY));
    svg.style.width = maxX + 'px';
    svg.style.height = maxY + 'px';

    stages.forEach(function(s) {
      var to = nodePositions[s.name];
      if (!to) return;
      var deps = (s.dependsOn || []).filter(function(d) {
        return nodePositions[d] && !/\\$\\{\\{/.test(d);
      });
      deps.forEach(function(dn) {
        var from = nodePositions[dn];
        if (from) drawEdge(svg, from, to);
      });
    });
    canvas.insertBefore(svg, canvas.firstChild);
  }

  function drawEdge(svg, from, to) {
    var x1 = from.x + from.w, y1 = from.y + from.h / 2;
    var x2 = to.x, y2 = to.y + to.h / 2;
    var midX = (x1 + x2) / 2, r = 8, d;
    if (Math.abs(y1 - y2) < 2) {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    } else if (y2 > y1) {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + (midX - r) + ' ' + y1
        + ' Q ' + midX + ' ' + y1 + ' ' + midX + ' ' + (y1 + r)
        + ' L ' + midX + ' ' + (y2 - r)
        + ' Q ' + midX + ' ' + y2 + ' ' + (midX + r) + ' ' + y2
        + ' L ' + x2 + ' ' + y2;
    } else {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + (midX - r) + ' ' + y1
        + ' Q ' + midX + ' ' + y1 + ' ' + midX + ' ' + (y1 - r)
        + ' L ' + midX + ' ' + (y2 + r)
        + ' Q ' + midX + ' ' + y2 + ' ' + (midX + r) + ' ' + y2
        + ' L ' + x2 + ' ' + y2;
    }
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    var a = 6;
    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points',
      (x2 - a) + ',' + (y2 - a/2) + ' ' + x2 + ',' + y2 + ' ' + (x2 - a) + ',' + (y2 + a/2));
    svg.appendChild(poly);
  }

  // -- Initial render --
  renderParamPanel();
  renderVarsPanel();
  classifyAndBuild();

  // -- Toolbar --
  document.getElementById('btnExpandAll').addEventListener('click', expandAll);
  document.getElementById('btnCollapseAll').addEventListener('click', collapseAll);
  document.getElementById('btnZoomIn').addEventListener('click', function() {
    zoom = Math.min(zoom + 0.1, 2);
    canvas.style.transform = 'scale(' + zoom + ')';
  });
  document.getElementById('btnZoomOut').addEventListener('click', function() {
    zoom = Math.max(zoom - 0.1, 0.3);
    canvas.style.transform = 'scale(' + zoom + ')';
  });
  document.getElementById('btnResetZoom').addEventListener('click', function() {
    zoom = 1; canvas.style.transform = 'scale(1)';
  });
  document.getElementById('btnOpenSource').addEventListener('click', function() {
    vscode.postMessage({ command: 'openFile', path: MODEL.filePath });
  });
  // Inspector toggles: clicking shows/hides the panel and syncs the button's
  // 'is-open' state (which drives the neon glow). Disabled buttons do nothing.
  function wireInspector(btnId, panelId) {
    var b = document.getElementById(btnId);
    if (!b) return;
    b.addEventListener('click', function() {
      if (b.disabled) return;
      var p = document.getElementById(panelId);
      if (!p) return;
      var nowHidden = p.classList.toggle('hidden');
      b.classList.toggle('is-open', !nowHidden);
    });
  }
  wireInspector('btnParams', 'param-panel');
  wireInspector('btnVariables', 'vars-panel');
  wireInspector('btnExcluded', 'skipped-panel');
  var btnExportPng = document.getElementById('btnExportPng');
  if (btnExportPng) {
    btnExportPng.addEventListener('click', function() {
      try {
        var dataUrl = renderPng();
        if (dataUrl) {
          vscode.postMessage({
            command: 'exportPng',
            dataUrl: dataUrl,
            fileName: MODEL.fileName.replace(/\\.(yml|yaml)$/i, '') + '.png'
          });
        }
      } catch (ex) {
        document.getElementById('canvas').innerHTML +=
          '<div style="color:#f44;padding:10px">Export failed: ' + esc(String(ex)) + '</div>';
      }
    });
  }

  // -- Theme switcher --
  var themeSelect = document.getElementById('themeSelect');
  var globalTheme = document.body.getAttribute('data-theme') || 'system';
  themeSelect.value = globalTheme;
  var savedState = vscode.getState() || {};
  if (!savedState.theme) {
    vscode.setState(Object.assign({}, savedState, { theme: globalTheme }));
  }
  themeSelect.addEventListener('change', function() {
    var val = themeSelect.value;
    if (val === 'system') {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', val);
    }
    vscode.setState(Object.assign({}, vscode.getState() || {}, { theme: val }));
    vscode.postMessage({ command: 'setTheme', theme: val });
  });

  // Header params toggle
  var hpToggle = document.querySelector('[data-toggle-header-params]');
  if (hpToggle) {
    hpToggle.addEventListener('click', function() {
      var grid = hpToggle.parentElement.querySelector('.header-params-grid');
      if (grid) grid.classList.toggle('collapsed');
    });
  }

  // -- Called By button --
  var callersPanel = document.getElementById('callers-panel');
  document.getElementById('btnCalledBy').addEventListener('click', function() {
    if (!callersPanel.classList.contains('hidden')) {
      callersPanel.classList.add('hidden');
      return;
    }
    callersPanel.innerHTML = '<div class="callers-loading">Searching workspace...</div>';
    callersPanel.classList.remove('hidden');
    vscode.postMessage({ command: 'findCallers', filePath: MODEL.filePath });
  });

  // Listen for messages from extension
  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (msg.command === 'applyTheme') {
      var val = msg.theme;
      if (val === 'system') {
        document.body.removeAttribute('data-theme');
      } else {
        document.body.setAttribute('data-theme', val);
      }
      themeSelect.value = val;
      vscode.setState(Object.assign({}, vscode.getState() || {}, { theme: val }));
    }
    if (msg.command === 'callersResult') {
      var callers = msg.callers || [];
      if (callers.length === 0) {
        callersPanel.innerHTML = '<div class="callers-title">Called By</div><div class="callers-empty">No references found in workspace</div>';
      } else {
        var html = '<div class="callers-title">Called By (' + callers.length + ')</div>';
        callers.forEach(function(c) {
          html += '<div class="caller-item" data-caller-path="' + esc(c.path) + '">';
          html += '<span class="caller-name">' + esc(c.name) + '</span>';
          html += '<span class="caller-path">' + esc(c.relPath || c.project) + '</span>';
          html += '</div>';
        });
        callersPanel.innerHTML = html;
      }
    }
  });

  // Click handler for caller items
  callersPanel.addEventListener('click', function(e) {
    var item = e.target.closest('.caller-item');
    if (item) {
      var callerPath = item.getAttribute('data-caller-path');
      if (callerPath) {
        vscode.postMessage({ command: 'visualizeTemplate', path: callerPath });
      }
    }
  });

  } catch(err) {
    document.getElementById('canvas').innerHTML =
      '<div style="color:#f44;padding:40px;font-size:14px;"><b>Render Error:</b><pre>'
      + String(err.stack || err) + '<\\/pre><\\/div>';
  }
})();`;
}
