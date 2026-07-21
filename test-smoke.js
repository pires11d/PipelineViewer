// Standalone smoke test -- exercises the parser without VS Code runtime.
// Points at the real KM.DevOps canonical pipelines in this workspace.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

// Workspace root is the parent of PipelineViewer (c:\Git\KMN).
const WORKSPACE = path.resolve(__dirname, '..');
const REV = path.join(WORKSPACE, 'KM.DevOps/Pipelines/DartDBObjects/Dart.DB.REV');

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
  // resolve to defaults (true/true/false), so LTQA+STQA run and SQL2 is skipped.
  console.log('\n=== TEST 1: db-refresh-recovery.yml (param default fallback) ===');
  const f1 = path.join(REV, 'db-refresh-recovery.yml');
  if (!fs.existsSync(f1)) { console.error('  missing: ' + f1); process.exit(1); }
  const m1 = newParser().parse(f1);
  const visible1 = m1.stages.filter(s => !s.skipped);
  assert(m1.stages.length === 3, 'parses 3 stages (got ' + m1.stages.length + ')');
  assert(visible1.length === 2, '2 stages visible with default params (got ' + visible1.length + ')');
  assert(m1.controls.length === 3, '3 interactive controls exposed (got ' + m1.controls.length + ')');
  assert(m1.paramValues.recoverLTQA === true && m1.paramValues.recoverSQL2 === false,
    'effective values resolved (LTQA=true, SQL2=false)');

  // Test 2: template opened directly -- no caller params, show all stages.
  console.log('\n=== TEST 2: backend-refresh-recovery-pipeline.yml (template direct) ===');
  const f2 = path.join(WORKSPACE,
    'KM.DevOps/Pipelines/DartTemplates/Dart.PipelineTemplates/templates/pipelines/backend/backend-refresh-recovery-pipeline.yml');
  if (fs.existsSync(f2)) {
    const m2 = newParser().parse(f2);
    const visible2 = m2.stages.filter(s => !s.skipped);
    assert(visible2.length === m2.stages.length, 'all stages visible when opened as a template');
  } else {
    console.log('  skip: template not found');
  }

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

  console.log('\n=== SMOKE TEST ' + (process.exitCode ? 'FAILED' : 'PASSED') + ' ===\n');
}

main().catch(err => { console.error(err); process.exit(1); });
