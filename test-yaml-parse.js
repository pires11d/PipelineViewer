const yaml = require('js-yaml');

// Test 1: Simple ${{ parameters.X }} in value
try {
  const text = 'test: ${{ parameters.foo }}';
  const d = yaml.load(text);
  console.log('Test 1 OK:', JSON.stringify(d));
} catch(e) {
  console.error('Test 1 FAIL:', e.message);
}

// Test 2: ${{ if eq(...) }} as a mapping key (conditional key)
try {
  const text = '${{ if eq(parameters.isDatabase, true) }}:\n  stages:\n    - stage: Foo';
  const d = yaml.load(text);
  console.log('Test 2 OK:', JSON.stringify(d));
} catch(e) {
  console.error('Test 2 FAIL:', e.message);
}

// Test 3: Full pipeline-like structure
try {
  const text = `stages:
  - stage: Test
    dependsOn: \${{ parameters.dependsOn }}
    jobs:
      - job: TestJob
        steps:
          - script: echo hello`;
  const d = yaml.load(text);
  console.log('Test 3 OK:', JSON.stringify(d));
} catch(e) {
  console.error('Test 3 FAIL:', e.message);
}

// Test 4: Load an actual pipeline file
const fs = require('fs');
const path = require('path');

// Try to load one of the failing templates
const templates = [
  path.resolve(__dirname, '../Tools/Pipelines/DartTemplates/Dart.PipelineTemplates/templates/environments/itconv.yml'),
  path.resolve(__dirname, '../Tools/Pipelines/DartDBObjects/Dart.DB.VSA/backfill-environments-pipeline.yml'),
];

templates.forEach(f => {
  if (!fs.existsSync(f)) { console.log('SKIP (not found):', f); return; }
  try {
    const raw = fs.readFileSync(f, 'utf-8');
    const d = yaml.load(raw);
    console.log('File OK:', path.basename(f), '- keys:', Object.keys(d || {}));
  } catch(e) {
    console.error('File FAIL:', path.basename(f), '-', e.message);
  }
});

// Test 5: Full parser test on those files
const esbuild = require('esbuild');
async function main() {
  await esbuild.build({
    entryPoints: ['src/pipelineParser.ts'],
    bundle: true, outfile: 'out/parser-test.js',
    external: ['vscode'], format: 'cjs', platform: 'node',
  });
  const { PipelineParser } = require('./out/parser-test');
  const workspaces = ['c:\\Git\\KMN'];
  
  const testFiles = [
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartDBObjects\\Dart.DB.VSA\\backfill-environments-pipeline.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartDBObjects\\Dart.DB.VSA\\nonprod-deploy.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartDBObjects\\Dart.DB.VSA\\prod-deploy.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartDBObjects\\Dart.DB.VSA\\create-preprod-deploy-pipeline.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartDBObjects\\Dart.DB.VSA\\feature-merge.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartDBObjects\\Dart.DB.VSA\\feature-pr.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartDBObjects\\Dart.DB.VSA\\preprod-deploy.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartDBObjects\\Dart.DB.VSA\\sync-pipelines.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartTemplates\\Dart.PipelineTemplates\\templates\\environments\\itconv.yml',
    'c:\\Git\\KMN\\Tools\\Pipelines\\DartTemplates\\Dart.PipelineTemplates\\templates\\environments\\dev.yml',
  ];
  
  for (const f of testFiles) {
    if (!fs.existsSync(f)) { console.log('PARSER SKIP:', path.basename(f)); continue; }
    try {
      const p = new PipelineParser(workspaces, {}, 10);
      const model = p.parse(f);
      console.log('PARSER OK:', path.basename(f), '- stages:', model.stages.length);
    } catch(e) {
      console.error('PARSER FAIL:', path.basename(f), '-', e.message);
      console.error('  Stack:', e.stack.split('\n').slice(0, 5).join('\n  '));
    }
  }
}

main().catch(e => console.error('MAIN ERROR:', e));
