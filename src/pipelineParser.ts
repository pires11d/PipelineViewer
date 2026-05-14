import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// -- Data Model --

export interface PipelineModel {
  fileName: string;
  filePath: string;
  name: string;
  trigger: string;
  pr: string;
  pool: string;
  parameters: ParamDef[];
  resources: ResourceRef[];
  variables: VarDef[];
  stages: StageNode[];
  callerParams: Record<string, any>;
  templateType: 'pipeline' | 'stages' | 'jobs' | 'steps';
}

export interface ParamDef {
  name: string;
  type: string;
  default: string;
  displayName: string;
}

export interface ResourceRef {
  alias: string;
  type: string;
  name: string;
  ref: string;
}

export interface VarDef {
  name: string;
  value: string;
}

export interface StageNode {
  id: string;
  name: string;
  displayName: string;
  dependsOn: string[];
  condition: string;
  isConditional: boolean;
  conditionalExpr: string;
  templateRef: string;
  templateResolved: boolean;
  resolvedPath: string;
  jobs: JobNode[];
  type: 'test' | 'nuget' | 'database' | 'build' | 'deploy' | 'validate' | 'detect' | 'sync' | 'template' | 'generic';
  skipped: boolean;
  parameters: Record<string, string>;
}

export interface JobNode {
  id: string;
  name: string;
  displayName: string;
  templateRef: string;
  templateResolved: boolean;
  resolvedPath: string;
  isDeployment: boolean;
  environment: string;
  steps: StepNode[];
  parameters: Record<string, string>;
}

export interface StepNode {
  id: string;
  name: string;
  displayName: string;
  type: 'task' | 'script' | 'powershell' | 'bash' | 'cmd' | 'checkout' | 'template' | 'sonarqube';
  templateRef: string;
  templateResolved: boolean;
  resolvedPath: string;
  childSteps: StepNode[];
  condition: string;
  continueOnError: boolean;
  inputs: Record<string, string>;
}

// -- Parser --

export class PipelineParser {
  private workspaceFolders: string[];
  private manualMappings: Record<string, string>;
  private maxDepth: number;
  private repoMappings: Map<string, string> = new Map();
  private visited: Set<string> = new Set();
  private fileCache: Map<string, any> = new Map();
  private originalDeps: Map<string, string> = new Map();
  private idCounter = 0;

  constructor(workspaceFolders: string[], manualMappings: Record<string, string>, maxDepth: number) {
    this.workspaceFolders = workspaceFolders;
    this.manualMappings = manualMappings;
    this.maxDepth = maxDepth;
  }

  private nextId(prefix: string): string {
    return `${prefix}_${this.idCounter++}`;
  }

  parse(filePath: string): PipelineModel {
    this.originalDeps.clear();
    const raw = fs.readFileSync(filePath, 'utf-8');
    const content = this.deduplicateConditionalKeys(raw);
    const doc = yaml.load(content) as any;
    if (!doc || typeof doc !== 'object') {
      throw new Error('Invalid YAML document');
    }

    // Extract repo mappings from resources
    this.extractRepoMappings(doc, path.dirname(filePath));

    // Apply manual overrides
    for (const [alias, folder] of Object.entries(this.manualMappings)) {
      this.repoMappings.set(alias, folder);
    }

    const model: PipelineModel = {
      fileName: path.basename(filePath),
      filePath,
      name: this.str(doc.name) || 'Unnamed Pipeline',
      trigger: this.describeTrigger(doc.trigger),
      pr: this.describeTrigger(doc.pr),
      pool: this.describePool(doc.pool),
      parameters: this.parseParams(doc.parameters),
      resources: this.parseResources(doc.resources),
      variables: this.parseVariables(doc.variables),
      stages: [],
      callerParams: {},
      templateType: 'pipeline',
    };

    const dir = path.dirname(filePath);

    if (doc.extends) {
      // Template-based pipeline -- extract caller-supplied parameters
      if (doc.extends.parameters && typeof doc.extends.parameters === 'object') {
        model.callerParams = { ...doc.extends.parameters };
      }
      const tplRef = this.str(doc.extends.template);
      const resolved = this.resolveTemplatePath(tplRef, dir);
      if (resolved && fs.existsSync(resolved)) {
        // Load the template's own parameter definitions (with defaults)
        const tplDoc = this.loadYamlFile(resolved);
        if (tplDoc && Array.isArray(tplDoc.parameters)) {
          model.parameters = this.parseParams(tplDoc.parameters);
        }
        this.visited.add(resolved.toLowerCase());
        model.stages = this.parseFileForStages(resolved, 1);
        this.visited.delete(resolved.toLowerCase());
      } else {
        model.stages = [this.unresolvedStage(tplRef)];
      }
    } else if (doc.stages) {
      model.templateType = 'stages';
      model.stages = this.parseStages(doc.stages, dir, 0);
    } else if (doc.jobs) {
      model.templateType = 'jobs';
      model.stages = [{
        ...this.emptyStage('DefaultStage'),
        displayName: 'Default Stage',
        jobs: this.parseJobs(doc.jobs, dir, 0),
      }];
    } else if (doc.steps) {
      model.templateType = 'steps';
      model.stages = [{
        ...this.emptyStage('DefaultStage'),
        displayName: 'Default Stage',
        jobs: [{
          ...this.emptyJob('DefaultJob'),
          displayName: 'Default Job',
          steps: this.parseSteps(doc.steps, dir, 0),
        }],
      }];
    }

    // Build effective parameter values (template defaults + caller overrides)
    const effective = this.buildEffectiveParams(model);

    // Resolve ${{ parameters.X }} refs in stage names and dependsOn
    this.resolveParameterRefs(model.stages, effective);

    // Fix implicit sequential dependencies (after param resolution)
    this.fixDependencies(model.stages);

    // Evaluate conditional expressions against effective parameter values
    this.evaluateConditions(model, effective);

    return model;
  }

  private loadYamlFile(filePath: string): any {
    const key = filePath.toLowerCase();
    if (this.fileCache.has(key)) { return this.fileCache.get(key); }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const content = this.deduplicateConditionalKeys(raw);
      const doc = yaml.load(content) as any;
      this.fileCache.set(key, doc);
      return doc;
    } catch {
      this.fileCache.set(key, null);
      return null;
    }
  }

  private parseFileForStages(filePath: string, depth: number): StageNode[] {
    if (depth > this.maxDepth) { return []; }
    try {
      const doc = this.loadYamlFile(filePath);
      if (!doc || typeof doc !== 'object') { return []; }
      const dir = path.dirname(filePath);
      if (doc.stages) {
        return this.parseStages(doc.stages, dir, depth);
      }
      return [];
    } catch {
      return [];
    }
  }

  // -- Stage Parsing --

  private parseStages(items: any[], dir: string, depth: number): StageNode[] {
    if (!Array.isArray(items)) { return []; }
    const stages: StageNode[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') { continue; }

      // STRUCTURAL KEYS FIRST -- a stage with conditional properties
      // (e.g. ${{ if }}: dependsOn) must not be mistaken for a wrapper
      if (item.stage) {
        const stage = this.buildStage(item, dir, depth);
        stages.push(stage);
        continue;
      }

      if (item.template) {
        stages.push(...this.resolveStageTemplate(item, dir, depth));
        continue;
      }

      // CONDITIONAL WRAPPER -- only when no structural key exists
      const condKey = this.findConditionalKey(item);
      if (condKey) {
        const innerItems = item[condKey];
        if (Array.isArray(innerItems)) {
          const condStages = this.parseStages(innerItems, dir, depth);
          for (const s of condStages) {
            s.isConditional = true;
            s.conditionalExpr = this.extractCondition(condKey);
          }
          stages.push(...condStages);
        } else if (innerItems && typeof innerItems === 'object' && innerItems.template) {
          const tplStages = this.resolveStageTemplate(innerItems, dir, depth);
          for (const s of tplStages) {
            s.isConditional = true;
            s.conditionalExpr = this.extractCondition(condKey);
          }
          stages.push(...tplStages);
        } else if (innerItems && typeof innerItems === 'object' && innerItems.stage) {
          const condStages = this.parseStages([innerItems], dir, depth);
          for (const s of condStages) {
            s.isConditional = true;
            s.conditionalExpr = this.extractCondition(condKey);
          }
          stages.push(...condStages);
        }
        continue;
      }
    }
    return stages;
  }

  private resolveStageTemplate(item: any, dir: string, depth: number): StageNode[] {
    const ref = this.str(item.template);
    const resolved = this.resolveTemplatePath(ref, dir);

    if (resolved && fs.existsSync(resolved)) {
      const key = resolved.toLowerCase();
      if (this.visited.has(key)) {
        return [this.unresolvedStage(ref + ' (circular)')];
      }
      this.visited.add(key);
      const inner = this.parseFileForStages(resolved, depth + 1);
      this.visited.delete(key);

      // Build effective params: template defaults + caller overrides
      const callerParams = this.extractParams(item);
      const rawCallerParams = this.extractRawParams(item);
      const effectiveParams = this.buildTemplateEffectiveParams(resolved, callerParams);

      for (const s of inner) {
        if (!s.templateRef) { s.templateRef = ref; }
        s.templateResolved = true;
        if (!s.resolvedPath) { s.resolvedPath = resolved; }
        if (Object.keys(s.parameters).length === 0) { s.parameters = callerParams; }
        // Resolve parameter refs in stage name/displayName/dependsOn using effective params
        if (Object.keys(effectiveParams).length > 0) {
          const oldName = s.name;
          s.name = this.substituteParams(s.name, effectiveParams);
          s.displayName = this.substituteParams(s.displayName, effectiveParams);

          // Special handling for dependsOn: if a dep is a whole-expression
          // referencing an array-typed parameter, resolve it to proper deps
          s.dependsOn = this.resolveDependsOnParams(s.dependsOn, effectiveParams, rawCallerParams);

          // Update other stages' dependsOn if they referenced the old name
          if (s.name !== oldName) {
            for (const other of inner) {
              other.dependsOn = other.dependsOn.map(d => d === oldName ? s.name : d);
            }
          }
        }
      }
      return inner.length > 0 ? inner : [this.unresolvedStage(ref)];
    }
    return [this.unresolvedStage(ref)];
  }

  private buildStage(item: any, dir: string, depth: number): StageNode {
    // Merge properties injected via ${{ if }}: blocks into the item
    const merged = this.mergeConditionalProperties(item);
    const name = this.str(merged.stage);
    const stage: StageNode = {
      ...this.emptyStage(name),
      displayName: this.str(merged.displayName) || name,
      dependsOn: this.parseDependsOn(merged.dependsOn),
      condition: this.str(merged.condition),
      jobs: [],
      type: this.inferStageType(name, this.str(merged.displayName)),
    };

    if (merged.jobs) {
      stage.jobs = this.parseJobs(merged.jobs, dir, depth);
    }

    return stage;
  }

  // -- Job Parsing --

  private parseJobs(items: any[], dir: string, depth: number): JobNode[] {
    if (!Array.isArray(items)) { return []; }
    const jobs: JobNode[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') { continue; }

      // STRUCTURAL KEYS FIRST
      if (item.job) {
        jobs.push(this.buildJob(item, dir, depth, false));
        continue;
      }
      if (item.deployment) {
        jobs.push(this.buildJob(item, dir, depth, true));
        continue;
      }
      if (item.template) {
        jobs.push(...this.resolveJobTemplate(item, dir, depth));
        continue;
      }

      // CONDITIONAL WRAPPER
      const condKey = this.findConditionalKey(item);
      if (condKey) {
        const inner = item[condKey];
        if (Array.isArray(inner)) {
          jobs.push(...this.parseJobs(inner, dir, depth));
        } else if (inner && typeof inner === 'object') {
          if (inner.template) {
            jobs.push(...this.resolveJobTemplate(inner, dir, depth));
          } else {
            jobs.push(...this.parseJobs([inner], dir, depth));
          }
        }
        continue;
      }
    }
    return jobs;
  }

  private resolveJobTemplate(item: any, dir: string, depth: number): JobNode[] {
    const ref = this.str(item.template);
    const resolved = this.resolveTemplatePath(ref, dir);

    if (resolved && fs.existsSync(resolved) && depth < this.maxDepth) {
      const key = resolved.toLowerCase();
      if (this.visited.has(key)) {
        return [{ ...this.emptyJob(ref), templateRef: ref + ' (circular)' }];
      }
      this.visited.add(key);
      try {
        const doc = this.loadYamlFile(resolved);
        if (doc && doc.jobs) {
          const inner = this.parseJobs(doc.jobs, path.dirname(resolved), depth + 1);
          const callerParams = this.extractParams(item);
          for (const j of inner) {
            if (!j.templateRef) { j.templateRef = ref; }
            j.templateResolved = true;
            if (!j.resolvedPath) { j.resolvedPath = resolved; }
            if (Object.keys(j.parameters).length === 0) { j.parameters = callerParams; }
          }
          this.visited.delete(key);
          return inner;
        }
      } catch { /* fall through */ }
      this.visited.delete(key);
    }
    return [{ ...this.emptyJob(ref), templateRef: ref, templateResolved: false }];
  }

  private buildJob(item: any, dir: string, depth: number, isDeploy: boolean): JobNode {
    // Merge properties injected via ${{ if }}: blocks into the item
    const merged = this.mergeConditionalProperties(item);
    const nameKey = isDeploy ? 'deployment' : 'job';
    const name = this.str(merged[nameKey]);
    const job: JobNode = {
      ...this.emptyJob(name),
      displayName: this.str(merged.displayName) || name,
      isDeployment: isDeploy,
      environment: this.str(merged.environment),
      steps: [],
    };

    // Steps can be in merged.steps or merged.strategy.runOnce.deploy.steps
    let rawSteps = merged.steps;
    if (!rawSteps && merged.strategy?.runOnce?.deploy?.steps) {
      rawSteps = merged.strategy.runOnce.deploy.steps;
    }
    if (rawSteps) {
      job.steps = this.parseSteps(rawSteps, dir, depth);
    }

    // Also grab lifecycle hooks for deployment jobs
    if (isDeploy && merged.strategy?.runOnce) {
      const hooks = ['preDeploy', 'routeTraffic', 'postRouteTraffic', 'on'];
      for (const hook of hooks) {
        const hookData = merged.strategy.runOnce[hook];
        if (hookData) {
          // on.failure.steps, on.success.steps
          if (hook === 'on') {
            for (const sub of ['failure', 'success']) {
              if (hookData[sub]?.steps) {
                const hookSteps = this.parseSteps(hookData[sub].steps, dir, depth);
                for (const s of hookSteps) {
                  s.name = `[on:${sub}] ${s.name}`;
                }
                job.steps.push(...hookSteps);
              }
            }
          } else if (hookData.steps) {
            const hookSteps = this.parseSteps(hookData.steps, dir, depth);
            for (const s of hookSteps) { s.name = `[${hook}] ${s.name}`; }
            job.steps.push(...hookSteps);
          }
        }
      }
    }

    return job;
  }

  // -- Step Parsing --

  private parseSteps(items: any[], dir: string, depth: number): StepNode[] {
    if (!Array.isArray(items)) { return []; }
    const steps: StepNode[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') { continue; }

      // STRUCTURAL KEYS FIRST
      if (item.template) {
        steps.push(this.resolveStepTemplate(item, dir, depth));
        continue;
      }
      if (item.task || item.script !== undefined || item.powershell !== undefined ||
          item.bash !== undefined || item.checkout !== undefined) {
        steps.push(this.buildStep(item));
        continue;
      }

      // CONDITIONAL WRAPPER
      const condKey = this.findConditionalKey(item);
      if (condKey) {
        const inner = item[condKey];
        if (Array.isArray(inner)) {
          const condSteps = this.parseSteps(inner, dir, depth);
          for (const s of condSteps) {
            s.name = `[conditional] ${s.name}`;
          }
          steps.push(...condSteps);
        } else if (inner && typeof inner === 'object') {
          steps.push(...this.parseSteps([inner], dir, depth));
        }
        continue;
      }

      // Fallback for unrecognized items
      steps.push(this.buildStep(item));
    }
    return steps;
  }

  private resolveStepTemplate(item: any, dir: string, depth: number): StepNode {
    const ref = this.str(item.template);
    const step: StepNode = {
      id: this.nextId('step'),
      name: ref,
      displayName: path.basename(ref, '.yml'),
      type: 'template',
      templateRef: ref,
      templateResolved: false,
      resolvedPath: '',
      childSteps: [],
      condition: this.str(item.condition),
      continueOnError: item.continueOnError === true,
      inputs: this.extractParams(item),
    };

    const resolved = this.resolveTemplatePath(ref, dir);
    if (resolved && fs.existsSync(resolved) && depth < this.maxDepth) {
      const key = resolved.toLowerCase();
      if (!this.visited.has(key)) {
        this.visited.add(key);
        try {
          const doc = this.loadYamlFile(resolved);
          if (doc && doc.steps) {
            step.childSteps = this.parseSteps(doc.steps, path.dirname(resolved), depth + 1);
            step.templateResolved = true;
            step.resolvedPath = resolved;
            // Use the first child step's displayName as the template's displayName
            // (avoids showing the filename when a meaningful name exists inside)
            if (step.childSteps.length > 0 && step.childSteps[0].displayName) {
              const childName = step.childSteps[0].displayName;
              const fallback = path.basename(ref, '.yml');
              if (childName !== fallback && childName !== step.childSteps[0].name) {
                step.displayName = childName;
              }
            }
          }
        } catch { /* show as unresolved */ }
        this.visited.delete(key);
      }
    }

    return step;
  }

  private buildStep(item: any): StepNode {
    const condition = this.str(item.condition);
    const continueOnError = item.continueOnError === true;
    const inputs = this.extractInputs(item);

    if (item.task) {
      const taskStr = this.str(item.task);
      const taskLower = taskStr.toLowerCase();
      let stepType: StepNode['type'] = 'task';
      if (taskLower.startsWith('cmdline')) { stepType = 'cmd'; }
      else if (taskLower.startsWith('sonarqube')) { stepType = 'sonarqube'; }
      return {
        id: this.nextId('step'),
        name: taskStr,
        displayName: this.str(item.displayName) || taskStr,
        type: stepType,
        templateRef: '', templateResolved: false, resolvedPath: '', childSteps: [],
        condition, continueOnError, inputs,
      };
    }
    if (item.script !== undefined) {
      return {
        id: this.nextId('step'),
        name: 'script',
        displayName: this.str(item.displayName) || 'Script',
        type: 'script',
        templateRef: '', templateResolved: false, resolvedPath: '', childSteps: [],
        condition, continueOnError, inputs,
      };
    }
    if (item.powershell !== undefined) {
      return {
        id: this.nextId('step'),
        name: 'powershell',
        displayName: this.str(item.displayName) || 'PowerShell',
        type: 'powershell',
        templateRef: '', templateResolved: false, resolvedPath: '', childSteps: [],
        condition, continueOnError, inputs,
      };
    }
    if (item.bash !== undefined) {
      return {
        id: this.nextId('step'),
        name: 'bash',
        displayName: this.str(item.displayName) || 'Bash',
        type: 'bash',
        templateRef: '', templateResolved: false, resolvedPath: '', childSteps: [],
        condition, continueOnError, inputs,
      };
    }
    if (item.checkout !== undefined) {
      return {
        id: this.nextId('step'),
        name: 'checkout',
        displayName: this.str(item.checkout) === 'none' ? 'Checkout: none' : 'Checkout: self',
        type: 'checkout',
        templateRef: '', templateResolved: false, resolvedPath: '', childSteps: [],
        condition, continueOnError, inputs: {},
      };
    }
    // Inline powershell task
    if (item.task === 'PowerShell@2' || item.inputs?.targetType) {
      return {
        id: this.nextId('step'),
        name: 'PowerShell@2',
        displayName: this.str(item.displayName) || 'PowerShell Task',
        type: 'powershell',
        templateRef: '', templateResolved: false, resolvedPath: '', childSteps: [],
        condition, continueOnError, inputs,
      };
    }
    return {
      id: this.nextId('step'),
      name: 'unknown',
      displayName: this.str(item.displayName) || 'Step',
      type: 'script',
      templateRef: '', templateResolved: false, resolvedPath: '', childSteps: [],
      condition, continueOnError, inputs,
    };
  }

  private extractInputs(item: any): Record<string, string> {
    const result: Record<string, string> = {};
    if (item.inputs && typeof item.inputs === 'object') {
      for (const [k, v] of Object.entries(item.inputs)) {
        result[k] = this.str(v);
      }
    }
    return result;
  }

  private extractParams(item: any): Record<string, string> {
    const result: Record<string, string> = {};
    if (item.parameters && typeof item.parameters === 'object') {
      for (const [k, v] of Object.entries(item.parameters)) {
        result[k] = this.str(v);
      }
    }
    return result;
  }

  // Extract raw parameter values preserving arrays/objects (for dependsOn resolution)
  private extractRawParams(item: any): Record<string, any> {
    const result: Record<string, any> = {};
    if (item.parameters && typeof item.parameters === 'object') {
      for (const [k, v] of Object.entries(item.parameters)) {
        result[k] = v;
      }
    }
    return result;
  }

  // Merge template file's parameter defaults with caller-supplied overrides
  private buildTemplateEffectiveParams(resolvedPath: string, callerParams: Record<string, string>): Record<string, string> {
    const effective: Record<string, string> = {};
    try {
      const doc = this.loadYamlFile(resolvedPath);
      if (doc && Array.isArray(doc.parameters)) {
        for (const p of doc.parameters) {
          if (p && p.name) {
            const defaultVal = p.default !== undefined && p.default !== null ? this.str(p.default) : '';
            if (defaultVal) { effective[p.name] = defaultVal; }
          }
        }
      }
    } catch { /* ignore */ }
    // Caller overrides trump defaults
    for (const [k, v] of Object.entries(callerParams)) {
      effective[k] = v;
    }
    return effective;
  }

  // -- Template Path Resolution --

  resolveTemplatePath(ref: string, currentDir: string): string | null {
    if (!ref) { return null; }

    // Handle @alias syntax: templates/pipelines/foo.yml@templates
    const atIdx = ref.lastIndexOf('@');
    if (atIdx > 0) {
      const tplPath = ref.substring(0, atIdx);
      const alias = ref.substring(atIdx + 1);
      const mappedRoot = this.repoMappings.get(alias);
      if (mappedRoot) {
        const full = path.join(mappedRoot, tplPath);
        if (fs.existsSync(full)) { return full; }
      }
      return null;
    }

    // Relative path (starts with ../ or ./ or plain relative)
    const resolved = path.resolve(currentDir, ref);
    if (fs.existsSync(resolved)) { return resolved; }

    return null;
  }

  // -- Repository Mapping --

  private extractRepoMappings(doc: any, pipelineDir: string): void {
    const repos = doc?.resources?.repositories;
    if (!Array.isArray(repos)) { return; }

    for (const repo of repos) {
      if (!repo || !repo.repository || !repo.name) { continue; }
      const alias = this.str(repo.repository);
      const repoName = this.str(repo.name);

      // Extract last segment as folder name
      const segments = repoName.split('/');
      const folderName = segments[segments.length - 1];

      // Try to find this folder in the workspace
      const found = this.findFolderInWorkspace(folderName);
      if (found) {
        this.repoMappings.set(alias, found);
      }
    }
  }

  private findFolderInWorkspace(folderName: string): string | null {
    const skipDirs = new Set(['.git', 'node_modules', 'out', 'bin', 'obj', '.vs', 'packages']);

    for (const root of this.workspaceFolders) {
      const result = this.searchDir(root, folderName, 0, 5, skipDirs);
      if (result) { return result; }
    }
    return null;
  }

  private searchDir(dir: string, target: string, depth: number, maxSearchDepth: number, skip: Set<string>): string | null {
    if (depth > maxSearchDepth) { return null; }
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || skip.has(entry.name)) { continue; }
        if (entry.name === target) {
          return path.join(dir, entry.name);
        }
      }
      // Recurse
      for (const entry of entries) {
        if (!entry.isDirectory() || skip.has(entry.name)) { continue; }
        const result = this.searchDir(path.join(dir, entry.name), target, depth + 1, maxSearchDepth, skip);
        if (result) { return result; }
      }
    } catch { /* permission error, skip */ }
    return null;
  }

  // -- Helpers --

  private parseDependsOn(val: any): string[] {
    if (!val) { return []; }
    if (typeof val === 'string') { return [val]; }
    if (Array.isArray(val)) {
      // Handle conditional items inside dependsOn arrays
      const result: string[] = [];
      for (const item of val) {
        if (typeof item === 'string') {
          result.push(item);
        } else if (item && typeof item === 'object') {
          const condKey = this.findConditionalKey(item);
          if (condKey) {
            const inner = item[condKey];
            if (typeof inner === 'string') { result.push(inner); }
            else if (Array.isArray(inner)) {
              for (const s of inner) { if (typeof s === 'string') { result.push(s); } }
            }
          }
        }
      }
      return result;
    }
    return [];
  }

  // Resolve dependsOn entries that are whole-expression parameter refs
  // (e.g. "${{ parameters.dependsOn }}") where the raw caller value is an array.
  // This properly expands array-typed dependsOn params passed to stage templates.
  private resolveDependsOnParams(
    deps: string[],
    effectiveParams: Record<string, string>,
    rawCallerParams: Record<string, any>
  ): string[] {
    const result: string[] = [];
    for (const d of deps) {
      // Check if this dep is a single whole-expression param ref
      const wholeMatch = d.match(/^\$\{\{\s*parameters\.(\w+)\s*\}\}$/);
      if (wholeMatch) {
        const paramName = wholeMatch[1];
        const rawVal = rawCallerParams[paramName];
        if (Array.isArray(rawVal)) {
          // Parse the raw array the same way we parse dependsOn from YAML
          result.push(...this.parseDependsOn(rawVal));
        } else if (rawVal !== undefined && rawVal !== null) {
          // Scalar value -- just substitute
          result.push(this.str(rawVal));
        } else if (paramName in effectiveParams) {
          result.push(effectiveParams[paramName]);
        } else {
          result.push(d); // Keep unresolved
        }
      } else {
        // Normal string substitution for embedded refs
        result.push(this.substituteParams(d, effectiveParams));
      }
    }
    return result;
  }

  private fixDependencies(stages: StageNode[]): void {
    // ADO default: stages without explicit dependsOn run sequentially.
    // Stages whose dependsOn only contains unresolved ${{ }} refs are
    // grouped: consecutive stages sharing the same unresolved expression
    // all depend on the same predecessor (like ADO parallel branches).
    for (let i = 1; i < stages.length; i++) {
      const stage = stages[i];

      const hasRealDeps = stage.dependsOn.length > 0 &&
        stage.dependsOn.some(d => !/\$\{\{/.test(d));
      if (hasRealDeps) { continue; }

      // Unresolved or empty deps: find what this stage should depend on.
      // If the previous stage had the same unresolved dep expression,
      // use that stage's resolved dependency (parallel siblings).
      const unresolvedExpr = stage.dependsOn.length > 0 ? stage.dependsOn[0] : '';
      let resolved = false;
      if (unresolvedExpr) {
        // Look backward for a sibling with the same unresolved expression
        for (let j = i - 1; j >= 0; j--) {
          // Check if this earlier stage had the same unresolved dep
          const jHadSameExpr = this.originalDeps.get(stages[j].name) === unresolvedExpr;
          if (jHadSameExpr && stages[j].dependsOn.length > 0) {
            stage.dependsOn = [...stages[j].dependsOn];
            resolved = true;
            break;
          }
          break; // Only check the immediate previous non-conditional
        }
      }
      if (!resolved) {
        // Default: depend on the nearest previous stage
        for (let j = i - 1; j >= 0; j--) {
          stage.dependsOn = [stages[j].name];
          break;
        }
      }
      // Track original expression for sibling matching
      if (unresolvedExpr) {
        this.originalDeps.set(stage.name, unresolvedExpr);
      }
    }
  }

  // Build effective parameter values: template defaults + caller overrides
  private buildEffectiveParams(model: PipelineModel): Record<string, any> {
    const effective: Record<string, any> = {};
    for (const p of model.parameters) {
      if (p.default !== '' && p.default !== undefined) {
        effective[p.name] = this.parseParamValue(p.default, p.type);
      }
    }
    for (const [k, v] of Object.entries(model.callerParams)) {
      effective[k] = v;
    }
    return effective;
  }

  // Replace ${{ parameters.X }} in stage names and dependsOn with resolved values
  private resolveParameterRefs(stages: StageNode[], params: Record<string, any>): void {
    if (Object.keys(params).length === 0) { return; }
    const nameMap = new Map<string, string>(); // old name -> new name

    for (const stage of stages) {
      const oldName = stage.name;
      stage.name = this.substituteParams(stage.name, params);
      stage.displayName = this.substituteParams(stage.displayName, params);
      if (stage.name !== oldName) { nameMap.set(oldName, stage.name); }
      stage.dependsOn = stage.dependsOn.map(d => this.substituteParams(d, params));
    }
    // Update dependsOn refs that pointed to old names
    for (const stage of stages) {
      stage.dependsOn = stage.dependsOn.map(d => nameMap.get(d) || d);
    }
  }

  private substituteParams(text: string, params: Record<string, any>): string {
    return text.replace(/\$\{\{\s*parameters\.(\w+)\s*\}\}/g, (_match, key) => {
      if (key in params) { return String(params[key]); }
      return _match;
    });
  }

  // Evaluate ${{ if eq(parameters.X, Y) }} conditions against effective params
  private evaluateConditions(model: PipelineModel, effective: Record<string, any>): void {
    if (Object.keys(effective).length === 0) { return; }

    for (const stage of model.stages) {
      if (stage.isConditional && stage.conditionalExpr) {
        const result = this.tryEvalCondition(stage.conditionalExpr, effective);
        if (result === false) {
          stage.skipped = true;
        }
      }
    }
  }

  private parseParamValue(val: string, type: string): any {
    if (type === 'boolean') {
      return val === 'true' || val === true;
    }
    return val;
  }

  // Evaluate condition expressions against effective parameter values.
  // Handles: eq/ne(parameters.X, Y), and(...), or(...)
  private tryEvalCondition(expr: string, params: Record<string, any>): boolean | null {
    // Handle and(...) wrapper
    const andMatch = expr.match(/^if\s+and\((.+)\)$/s);
    if (andMatch) {
      const parts = this.splitTopLevelArgs(andMatch[1]);
      const results = parts.map(p => this.tryEvalCondition('if ' + p.trim(), params));
      if (results.some(r => r === null)) { return null; }
      return results.every(r => r === true);
    }

    // Handle or(...) wrapper
    const orMatch = expr.match(/^if\s+or\((.+)\)$/s);
    if (orMatch) {
      const parts = this.splitTopLevelArgs(orMatch[1]);
      const results = parts.map(p => this.tryEvalCondition('if ' + p.trim(), params));
      if (results.some(r => r === null)) { return null; }
      return results.some(r => r === true);
    }

    // Match: if eq(parameters.X, Y) or if ne(parameters.X, Y)
    const m = expr.match(/^if\s+(eq|ne)\s*\(\s*parameters\.(\w+)\s*,\s*(.+?)\s*\)$/);
    if (!m) { return null; }
    const [, op, paramName, rawVal] = m;
    if (!(paramName in params)) { return null; }

    const actual = params[paramName];
    let expected: any = rawVal;
    if (expected === 'true') { expected = true; }
    else if (expected === 'false') { expected = false; }
    else if (/^'.*'$/.test(expected)) { expected = expected.slice(1, -1); }
    else if (/^".*"$/.test(expected)) { expected = expected.slice(1, -1); }

    const isEqual = String(actual) === String(expected);
    return op === 'eq' ? isEqual : !isEqual;
  }

  // Split args at top-level commas (respecting nested parentheses)
  private splitTopLevelArgs(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '(') { depth++; }
      else if (text[i] === ')') { depth--; }
      else if (text[i] === ',' && depth === 0) {
        parts.push(text.substring(start, i));
        start = i + 1;
      }
    }
    parts.push(text.substring(start));
    return parts;
  }

  private emptyStage(name: string): StageNode {
    return {
      id: this.nextId('stage'),
      name, displayName: name,
      dependsOn: [], condition: '',
      isConditional: false, conditionalExpr: '',
      templateRef: '', templateResolved: false, resolvedPath: '',
      jobs: [], type: 'generic', skipped: false,
      parameters: {},
    };
  }

  private emptyJob(name: string): JobNode {
    return {
      id: this.nextId('job'),
      name, displayName: name,
      templateRef: '', templateResolved: false, resolvedPath: '',
      isDeployment: false, environment: '',
      steps: [],
      parameters: {},
    };
  }

  private unresolvedStage(ref: string): StageNode {
    return {
      ...this.emptyStage(ref),
      displayName: `[Unresolved] ${ref}`,
      templateRef: ref,
      templateResolved: false,
      type: 'template',
    };
  }

  private inferStageType(name: string, displayName: string): StageNode['type'] {
    const combined = `${name} ${displayName}`.toLowerCase();
    if (combined.includes('nuget')) { return 'nuget'; }
    if (combined.includes('database')) { return 'database'; }
    if (combined.includes('deploy') || combined.includes('sign')) { return 'deploy'; }
    if (combined.includes('build') || combined.includes('restore')) { return 'build'; }
    if (combined.includes('validat') || combined.includes('alert')) { return 'validate'; }
    if (combined.includes('test')) { return 'test'; }
    if (combined.includes('detect') || combined.includes('determine') || combined.includes('extract')) { return 'detect'; }
    if (combined.includes('synchroniz') || combined.includes('backfill') || combined.includes('drift') || combined.includes('sync')) { return 'sync'; }
    return 'generic';
  }

  private findConditionalKey(obj: any): string | null {
    for (const key of Object.keys(obj)) {
      // Strip __ado_dup_N suffix before testing
      const clean = key.replace(/__ado_dup_\d+$/, '');
      if (/^\$\{\{.*\}\}$/.test(clean.trim())) { return key; }
    }
    return null;
  }

  private extractCondition(key: string): string {
    // Strip dedup suffix before extracting expression
    const clean = key.replace(/__ado_dup_\d+$/, '');
    const match = clean.match(/\$\{\{\s*(.+?)\s*\}\}/);
    return match ? match[1] : clean;
  }

  // Pre-process raw YAML text to deduplicate ADO conditional keys.
  // ADO allows multiple ${{ if ... }}: and ${{ else }}: blocks in the
  // same mapping, but standard YAML parsers reject duplicate keys.
  // We suffix duplicates with __ado_dup_N to make them unique.
  private deduplicateConditionalKeys(text: string): string {
    const seen = new Map<string, number>();
    return text.replace(/^(\s*)\$\{\{(.+?)\}\}\s*:/gm, (match, indent, expr) => {
      // Build a position-aware key: indent level + expression
      // so that identical expressions at different nesting levels
      // are tracked independently.
      const trackKey = indent.length + ':' + expr.trim();
      const count = seen.get(trackKey) || 0;
      seen.set(trackKey, count + 1);
      if (count === 0) { return match; }
      return indent + '${{' + expr + '}}__ado_dup_' + count + ':';
    });
  }

  // Flatten ${{ if }}: and ${{ else }}: block values into the parent
  // object so that properties like dependsOn and condition set inside
  // conditional blocks are accessible directly on the item.
  private mergeConditionalProperties(obj: any): any {
    if (!obj || typeof obj !== 'object') { return obj; }
    const result: any = {};
    for (const key of Object.keys(obj)) {
      const clean = key.replace(/__ado_dup_\d+$/, '');
      if (/^\$\{\{.*\}\}$/.test(clean.trim())) {
        const val = obj[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          Object.assign(result, val);
        }
      } else {
        // Only set if not already set by a conditional block
        if (!(key in result)) { result[key] = obj[key]; }
      }
    }
    return result;
  }

  private describeTrigger(val: any): string {
    if (val === 'none' || val === null) { return 'none'; }
    if (val === undefined) { return 'default'; }
    if (typeof val === 'string') { return val; }
    if (typeof val === 'object' && val.branches?.include) {
      return val.branches.include.join(', ');
    }
    return 'configured';
  }

  private describePool(val: any): string {
    if (!val) { return 'default'; }
    if (typeof val === 'string') { return val; }
    if (val.name) { return val.name; }
    if (val.vmImage) { return val.vmImage; }
    return 'configured';
  }

  private parseParams(items: any[]): ParamDef[] {
    if (!Array.isArray(items)) { return []; }
    return items.filter(p => p && p.name).map(p => ({
      name: this.str(p.name),
      type: this.str(p.type) || 'string',
      default: this.str(p.default),
      displayName: this.str(p.displayName) || this.str(p.name),
    }));
  }

  private parseResources(res: any): ResourceRef[] {
    if (!res?.repositories) { return []; }
    return res.repositories.filter((r: any) => r).map((r: any) => ({
      alias: this.str(r.repository),
      type: this.str(r.type),
      name: this.str(r.name),
      ref: this.str(r.ref),
    }));
  }

  private parseVariables(vars: any): VarDef[] {
    if (!vars) { return []; }
    if (Array.isArray(vars)) {
      return vars.filter(v => v && v.name).map(v => ({
        name: this.str(v.name),
        value: this.str(v.value),
      }));
    }
    if (typeof vars === 'object') {
      return Object.entries(vars).map(([k, v]) => ({
        name: k,
        value: this.str(v),
      }));
    }
    return [];
  }

  private str(val: any): string {
    if (val === undefined || val === null) { return ''; }
    return String(val);
  }
}
