export function getScript(): string {
  return /*js*/`
(function() {
  try {
  var vscode = acquireVsCodeApi();
  var canvas = document.getElementById('canvas');
  var zoom = 1;
  var expandedStages = {};

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

  // -- Header --
  var header = document.getElementById('header');
  var hasName = MODEL.name && MODEL.name !== 'Unnamed Pipeline';
  var metaItems = '';
  if (MODEL.templateType === 'pipeline') {
    metaItems = '<span><span class="label">Trigger:</span> ' + esc(MODEL.trigger) + '</span>'
      + '<span><span class="label">PR:</span> ' + esc(MODEL.pr) + '</span>'
      + '<span><span class="label">Pool:</span> ' + esc(MODEL.pool) + '</span>'
      + '<span><span class="label">Stages:</span> ' + MODEL.stages.length + '</span>';
  } else if (MODEL.templateType === 'pipelineTemplate' || MODEL.templateType === 'stages') {
    var totalJobs = 0, totalSteps = 0;
    MODEL.stages.forEach(function(s) {
      if (!s.jobs) return;
      totalJobs += s.jobs.length;
      s.jobs.forEach(function(j) { totalSteps += (j.steps ? j.steps.length : 0); });
    });
    metaItems = '<span><span class="label">Stages:</span> ' + MODEL.stages.length + '</span>'
      + '<span><span class="label">Jobs:</span> ' + totalJobs + '</span>'
      + '<span><span class="label">Steps:</span> ' + totalSteps + '</span>';
  } else if (MODEL.templateType === 'jobs') {
    var totalJobs = 0, totalSteps = 0;
    MODEL.stages.forEach(function(s) {
      if (!s.jobs) return;
      totalJobs += s.jobs.length;
      s.jobs.forEach(function(j) { totalSteps += (j.steps ? j.steps.length : 0); });
    });
    metaItems = '<span><span class="label">Jobs:</span> ' + totalJobs + '</span>'
      + '<span><span class="label">Steps:</span> ' + totalSteps + '</span>';
  } else {
    var totalSteps = 0;
    MODEL.stages.forEach(function(s) {
      if (!s.jobs) return;
      s.jobs.forEach(function(j) { totalSteps += (j.steps ? j.steps.length : 0); });
    });
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

  // Show caller params if present
  if (MODEL.callerParams && Object.keys(MODEL.callerParams).length > 0) {
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

  // -- Layout --
  // Remove skipped stages entirely from display to avoid duplicate-name collisions
  var stages = MODEL.stages.filter(function(s) { return !s.skipped; });
  // Deduplicate stages with identical names (e.g. from opposing conditional branches)
  var seenNames = {};
  stages = stages.filter(function(s) {
    if (seenNames[s.name]) return false;
    seenNames[s.name] = true;
    return true;
  });
  var stageMap = {};
  stages.forEach(function(s) { stageMap[s.name] = s; });

  function computeLayers() {
    var layers = {}, vis = {};
    function getLayer(name) {
      if (vis[name]) return layers[name] || 0;
      vis[name] = true;
      var s = stageMap[name];
      if (!s) { layers[name] = 0; return 0; }
      // Filter to only resolved dependencies (skip unresolved parameter refs and missing stages)
      // Also skip dependencies on skipped stages -- use the skipped stage's own deps instead
      var resolvedDeps = getEffectiveDeps(s);
      if (resolvedDeps.length === 0) { layers[name] = 0; return 0; }
      var mx = 0;
      resolvedDeps.forEach(function(dep) {
        mx = Math.max(mx, getLayer(dep) + 1);
      });
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
          // Collapse through skipped stage: use its deps instead
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

    // Second pass: stages with ALL unresolved deps that got layer 0
    // should be placed after the nearest preceding stage in document order
    stages.forEach(function(s, idx) {
      if (idx === 0) return;
      var hasDeps = s.dependsOn && s.dependsOn.length > 0;
      var resolvedDeps = hasDeps ? getEffectiveDeps(s) : [];
      // If stage has deps but none resolved, place it after the highest-layer predecessor
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
    // Sort each column: enabled stages first, skipped stages at bottom
    for (var k in groups) {
      groups[k].sort(function(a, b) {
        if (a.skipped && !b.skipped) return 1;
        if (!a.skipped && b.skipped) return -1;
        return 0;
      });
    }
    return { layers: layers, groups: groups, maxLayer: maxLayer };
  }

  var lo = computeLayers();
  var NODE_W = 280, NODE_W_EXP = 460, H_GAP = 80, V_GAP = 50, PAD = 40;
  var nodePositions = {};

  // -- Build stage nodes --
  // Humanize unresolved parameter expressions for display
  function humanize(text) {
    if (!text) return '(unnamed)';
    return text.replace(/\\$\\{\\{\\s*parameters\\.(\\w+)\\s*\\}\\}/g, function(_, k) {
      return '(' + k + ')';
    });
  }

  // Derive a readable name from the filename when stage name/displayName are unresolved params.
  // e.g. "backend-backfill-deploy-stage.yml" -> "Backend Backfill Deploy"
  function filenameFallback() {
    var base = MODEL.fileName
      .replace(/\\.(yml|yaml)$/i, '')
      .replace(/-stage$/, '');
    return base.split('-').map(function(w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function buildStageHtml(s) {
    var title = s.displayName || s.name || '(unnamed)';
    title = humanize(title);
    // When entirely unresolved (all params, no defaults), fall back to filename
    if (/^\\([^)]+\\)$/.test(title) || title === '(unnamed)') {
      title = filenameFallback();
    }
    var h = '<div class="sn-header">';
    h += '<span class="sn-badge badge-stage">STAGE</span> ';
    h += '<span class="sn-tag badge-' + s.type + '">' + s.type.toUpperCase() + '</span>';
    h += '<span class="sn-title">' + esc(title) + '</span>';
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
    // Stage parameters (displayed as inputs for consistency with step design)
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

    // Inner content (visible when expanded)
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

    // Job parameters (displayed as inputs for consistency with step design)
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

    // Job footer (visible when collapsed)
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
      // Consistent type label
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
      // Task badge with version (e.g. VSBuild@1)
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
      // Condition
      if (step.condition) {
        html += '<div class="sf-condition">' + esc(step.condition) + '</div>';
      }
      // ContinueOnError
      if (step.continueOnError) {
        html += '<div class="sf-continue">continueOnError: true</div>';
      }
      // Inputs
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

      // Child steps rendered INSIDE the step card (collapsed by default)
      if (step.childSteps && step.childSteps.length > 0) {
        html += '<div class="sf-child-footer">' + step.childSteps.length + ' task(s)</div>';
        html += '<div class="child-flow">' + renderStepFlow(step.childSteps) + '</div>';
      }
      html += '</div></div>';
    });
    return html;
  }

  // -- Render based on template type --
  var directSteps = (MODEL.templateType === 'steps' && stages.length === 1
    && stages[0].jobs && stages[0].jobs.length === 1
    && stages[0].jobs[0].steps);
  var directJobs = (MODEL.templateType === 'jobs' && stages.length === 1
    && stages[0].jobs && stages[0].jobs.length > 0);

  if (directSteps) {
    // Step template: render steps directly without stage/job wrapper
    var stepContainer = document.createElement('div');
    stepContainer.className = 'direct-steps';
    stepContainer.innerHTML = renderStepFlow(stages[0].jobs[0].steps);
    canvas.appendChild(stepContainer);
    canvas.style.padding = '20px';
  } else if (directJobs) {
    // Job template: render jobs directly without stage wrapper
    var jobContainer = document.createElement('div');
    jobContainer.className = 'direct-jobs';
    stages[0].jobs.forEach(function(job, ji) {
      jobContainer.innerHTML += buildJobHtml(job, ji);
    });
    canvas.appendChild(jobContainer);
    canvas.style.padding = '20px';
  } else {
  // -- Render all stage nodes --
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
      if (s.skipped) div.classList.add('skipped');
      div.style.left = x + 'px';
      div.style.top = y + 'px';
      div.setAttribute('data-stage', s.name);
      div.innerHTML = buildStageHtml(s);
      canvas.appendChild(div);
    });
  }
  } // end else (stage rendering)

  // -- Wire click events (delegate on canvas) --
  canvas.addEventListener('click', function(e) {
    // Step card with children toggle (whole card is clickable)
    var stepCard = e.target.closest('.step-flow-card.has-children');
    if (stepCard) {
      // Don't toggle if clicking interactive sub-elements
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
    // Inputs toggle
    var toggle = e.target.closest('[data-toggle-inputs]');
    if (toggle) {
      e.stopPropagation();
      var list = toggle.parentElement.querySelector('.sf-inputs-list');
      if (list) list.classList.toggle('expanded');
      return;
    }
    // Script full-text expand
    var scriptToggle = e.target.closest('[data-toggle-script]');
    if (scriptToggle) {
      e.stopPropagation();
      var fullBlock = scriptToggle.parentElement.nextElementSibling;
      if (fullBlock && fullBlock.classList.contains('sf-script-full')) {
        fullBlock.classList.toggle('expanded');
      }
      return;
    }
    // Template step / stage / job navigation (highest priority - do not toggle stage)
    var navCard = e.target.closest('[data-nav-path]');
    if (navCard) {
      e.stopPropagation();
      var navParams = {};
      var rawParams = navCard.getAttribute('data-nav-params');
      if (rawParams) { try { navParams = JSON.parse(rawParams); } catch(ex) {} }
      vscode.postMessage({ command: 'visualizeTemplate', path: navCard.getAttribute('data-nav-path'), callerParams: navParams });
      return;
    }
    // Job toggle (click on job-card header or body when collapsed)
    var jobHeader = e.target.closest('.job-header');
    if (jobHeader) {
      // Do not toggle if clicking the nav link
      if (e.target.closest('.job-nav')) return;
      var jobCard = jobHeader.closest('.job-card');
      if (jobCard) {
        jobCard.classList.toggle('expanded');
        relayout();
        return;
      }
    }
    // Click on collapsed job-card body area (footer, meta) also toggles
    var jobCard = e.target.closest('.job-card');
    if (jobCard && !jobCard.classList.contains('expanded')) {
      if (e.target.closest('.job-nav')) return;
      jobCard.classList.toggle('expanded');
      relayout();
      return;
    }
    // Stage toggle (only if clicking the stage header area, not inner content)
    var stageEl = e.target.closest('.stage-node');
    if (stageEl) {
      // If click is inside stage-inner, do nothing (let inner events handle)
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
    // Expand all param/input toggles too
    canvas.querySelectorAll('.sf-inputs-list').forEach(function(list) {
      list.classList.add('expanded');
    });
    // Expand all job cards
    canvas.querySelectorAll('.job-card').forEach(function(jc) {
      jc.classList.add('expanded');
    });
    // Expand all child step flows
    canvas.querySelectorAll('.step-flow-card.has-children').forEach(function(cf) {
      cf.classList.add('expanded');
    });
    // Expand header params grid
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
    // Collapse all param/input toggles too
    canvas.querySelectorAll('.sf-inputs-list').forEach(function(list) {
      list.classList.remove('expanded');
    });
    // Collapse all job cards
    canvas.querySelectorAll('.job-card').forEach(function(jc) {
      jc.classList.remove('expanded');
    });
    // Collapse all child step flows
    canvas.querySelectorAll('.step-flow-card.has-children').forEach(function(cf) {
      cf.classList.remove('expanded');
    });
    // Collapse header params grid
    var hpGrid = document.querySelector('.header-params-grid');
    if (hpGrid) hpGrid.classList.add('collapsed');
    relayout();
  }

  // -- Relayout: measure heights, reposition, redraw connectors --
  function relayout() {
    // Update widths based on expanded state
    document.querySelectorAll('.stage-node').forEach(function(el) {
      var nm = el.getAttribute('data-stage');
      if (nm && nodePositions[nm]) {
        var isExp = expandedStages[nm];
        nodePositions[nm].w = isExp ? NODE_W_EXP : NODE_W;
        el.style.width = nodePositions[nm].w + 'px';
      }
    });
    // Let the DOM reflow before measuring heights
    requestAnimationFrame(function() {
      document.querySelectorAll('.stage-node').forEach(function(el) {
        var nm = el.getAttribute('data-stage');
        if (nm && nodePositions[nm]) {
          nodePositions[nm].h = el.getBoundingClientRect().height / zoom;
        }
      });
      // Compute column X positions dynamically based on widest node per column
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
      // Apply horizontal and vertical positions
      for (var c = 0; c <= lo.maxLayer; c++) {
        var cStages = lo.groups[c] || [];
        var yOff = PAD;
        cStages.forEach(function(s) {
          nodePositions[s.name].x = colX[c];
          nodePositions[s.name].y = yOff;
          yOff += nodePositions[s.name].h + V_GAP;
          var el = canvas.querySelector('[data-stage="' + attrEsc(s.name) + '"]');
          if (el) {
            el.style.left = colX[c] + 'px';
            el.style.top = nodePositions[s.name].y + 'px';
          }
        });
      }
      renderConnectors();
    });
  }

  // Initial layout
  relayout();

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

  // -- Toolbar (always visible for all template types) --
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

  // -- Theme switcher --
  var themeSelect = document.getElementById('themeSelect');
  var globalTheme = document.body.getAttribute('data-theme') || 'system';
  themeSelect.value = globalTheme;
  // Reconcile with per-panel state if needed
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
