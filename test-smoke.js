// Standalone smoke test -- exercises the parser without VS Code runtime.
// Points at the real KMDevOps canonical pipelines in this workspace.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

// Workspace root is the parent of PipelineViewer (c:\Git\KMN).
const WORKSPACE = path.resolve(__dirname, '..');
const PIPELINES = path.join(WORKSPACE, 'KMDevOps/Pipelines');
const REV = path.join(PIPELINES, 'Gas/DartDBObjects/Dart.DB.REV');

function assert(cond, msg) {
  if (!cond) { console.error('  FAIL: ' + msg); process.exitCode = 1; }
  else { console.log('  ok: ' + msg); }
}

async function main() {
  await esbuild.build({
    entryPoints: ['src/pipelineParser.ts'],
    bundle: true,
    outfile: 'out/parser-test.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
  });
  const { PipelineParser } = require('./out/parser-test');

  const newParser = () => new PipelineParser([WORKSPACE], {}, 10);

  // Test 1: db-refresh-recovery -- self-referential pass-through params must
  // resolve to their defaults: one stage per recover* toggle, only the
  // default-true ones visible (LTQA+STQA run, SQL2 is skipped).
  console.log('\n=== TEST 1: db-refresh-recovery.yml (param default fallback) ===');
  const f1 = path.join(REV, 'db-refresh-recovery.yml');
  if (!fs.existsSync(f1)) { console.error('  missing: ' + f1); process.exit(1); }
  const toggles = (require('js-yaml').load(fs.readFileSync(f1, 'utf-8')).parameters || [])
    .filter(p => /^recover/.test(p.name));
  const onByDefault = toggles.filter(p => p.default === true).length;
  const m1 = newParser().parse(f1);
  const visible1 = m1.stages.filter(s => !s.skipped);
  assert(m1.stages.length === toggles.length,
    'one stage per toggle: ' + toggles.length + ' (got ' + m1.stages.length + ')');
  assert(visible1.length === onByDefault,
    onByDefault + ' stages visible with default params (got ' + visible1.length + ')');
  assert(m1.controls.length === toggles.length,
    toggles.length + ' interactive controls exposed (got ' + m1.controls.length + ')');
  assert(m1.paramValues.recoverLTQA === true && m1.paramValues.recoverSQL2 === false,
    'effective values resolved (LTQA=true, SQL2=false)');

  // Test 2: template opened directly -- no caller params, show all stages.
  console.log('\n=== TEST 2: backend-refresh-recovery-pipeline.yml (template direct) ===');
  const f2 = path.join(PIPELINES,
    '_Shared/PipelineTemplates/templates/pipelines/backend/backend-refresh-recovery-pipeline.yml');
  if (!fs.existsSync(f2)) { console.error('  missing: ' + f2); process.exit(1); }
  const m2 = newParser().parse(f2);
  const visible2 = m2.stages.filter(s => !s.skipped);
  assert(visible2.length === m2.stages.length, 'all stages visible when opened as a template');

  // Test 3: a few more pipelines parse without throwing.
  console.log('\n=== TEST 3: other REV pipelines parse ===');
  ['prod-deploy.yml', 'nonprod-deploy.yml', 'feature-pr.yml'].forEach(name => {
    const f = path.join(REV, name);
    if (!fs.existsSync(f)) { console.log('  skip: ' + name); return; }
    try {
      const m = newParser().parse(f);
      assert(m.stages.length > 0, name + ' -> ' + m.stages.length + ' stages');
    } catch (e) {
      assert(false, name + ' threw: ' + e.message);
    }
  });

  // Test 4: the template repo name differs from the local folder name
  // ('DartTemplates/Dart.PipelineTemplates' lives in _Shared/PipelineTemplates),
  // so the alias must be found by content, not by name.
  console.log('\n=== TEST 4: template repo named unlike its local folder ===');
  const f4 = path.join(PIPELINES, 'Gas/DartCoreApps/Dart.NetOdep/preprod-deploy.yml');
  if (!fs.existsSync(f4)) { console.error('  missing: ' + f4); process.exit(1); }
  const m4 = newParser().parse(f4);
  const jobs4 = m4.stages.reduce((n, s) => n + (s.jobs ? s.jobs.length : 0), 0);
  assert(m4.stages.length > 1 && jobs4 > 0,
    '@templates resolved (' + m4.stages.length + ' stages, ' + jobs4 + ' jobs)');

  console.log('\n=== SMOKE TEST ' + (process.exitCode ? 'FAILED' : 'PASSED') + ' ===\n');
}

main().catch(err => { console.error(err); process.exit(1); });
