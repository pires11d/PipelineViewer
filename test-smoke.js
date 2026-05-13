// Standalone smoke test -- exercises the parser without VS Code runtime
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Pull the parser class out by requiring the source directly via esbuild trick:
// We re-bundle just the parser for testing
const esbuild = require('esbuild');

async function main() {
  // Build parser standalone
  await esbuild.build({
    entryPoints: ['src/pipelineParser.ts'],
    bundle: true,
    outfile: 'out/parser-test.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
  });

  const { PipelineParser } = require('./out/parser-test');

  const testFile = path.resolve(__dirname,
    '../Tools/Pipelines/DartDBObjects/Dart.DB.VSA/nonprod-deploy.yml');

  if (!fs.existsSync(testFile)) {
    console.error('Test file not found:', testFile);
    process.exit(1);
  }

  const parser = new PipelineParser(
    [path.resolve(__dirname, '..')],  // workspace root
    {},  // no manual mappings
    10   // max depth
  );

  const model = parser.parse(testFile);

  console.log('\n=== PIPELINE: ' + model.name + ' ===');
  console.log('File:', model.fileName);
  console.log('Trigger:', model.trigger);
  console.log('Pool:', model.pool);
  console.log('Resources:', model.resources.length);
  console.log('Stages:', model.stages.length);

  model.stages.forEach((stage, i) => {
    const resolved = stage.templateResolved ? ' [RESOLVED]' : (stage.templateRef ? ' [UNRESOLVED]' : '');
    const cond = stage.isConditional ? (' [IF: ' + stage.conditionalExpr + ']') : '';
    console.log(`\n  Stage ${i + 1}: ${stage.displayName} (${stage.type})${resolved}${cond}`);
    if (stage.templateRef) console.log('    Template: ' + stage.templateRef);
    if (stage.dependsOn.length) console.log('    DependsOn: ' + stage.dependsOn.join(', '));

    stage.jobs.forEach((job, j) => {
      const jResolved = job.templateResolved ? ' [RESOLVED]' : (job.templateRef ? ' [UNRESOLVED]' : '');
      console.log(`    Job ${j + 1}: ${job.displayName}${job.isDeployment ? ' (deployment)' : ''}${jResolved}`);
      if (job.environment) console.log('      Env: ' + job.environment);

      job.steps.forEach((step, k) => {
        const sResolved = step.templateResolved ? ' [RESOLVED]' : (step.templateRef ? ' [UNRESOLVED]' : '');
        console.log(`      Step ${k + 1}: [${step.type}] ${step.displayName}${sResolved}`);
        if (step.childSteps.length > 0) {
          step.childSteps.forEach((cs, ci) => {
            console.log(`        -> ${ci + 1}: [${cs.type}] ${cs.displayName}`);
          });
        }
      });
    });
  });

  console.log('\n=== PARSER TEST PASSED ===\n');

  // Test 2: create-preprod-deploy-pipeline (has duplicate conditional keys)
  const testFile2 = path.resolve(__dirname,
    '../Tools/Pipelines/DartTemplates/Dart.PipelineTemplates/templates/pipelines/create-preprod-deploy-pipeline.yml');
  if (fs.existsSync(testFile2)) {
    console.log('=== TEST 2: create-preprod-deploy-pipeline ===');
    const parser2 = new PipelineParser(
      [path.resolve(__dirname, '..')],
      {},
      10
    );
    const model2 = parser2.parse(testFile2);
    console.log('Stages:', model2.stages.length);
    model2.stages.forEach((stage, i) => {
      const deps = stage.dependsOn.length ? ' deps=[' + stage.dependsOn.join(',') + ']' : '';
      const cond = stage.condition ? ' condition=' + stage.condition.substring(0, 60) + '...' : '';
      console.log('  Stage ' + (i+1) + ': ' + stage.displayName + deps + cond + ' jobs=' + stage.jobs.length);
    });
    console.log('=== TEST 2 PASSED ===\n');
  } else {
    console.log('Skipping test 2: file not found');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
