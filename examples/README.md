# PipelineViewer example

A **synthetic** multi-repo pipeline used to demo PipelineViewer. It is not tied
to any real system, product, or client — it exists only to exercise the viewer's
template resolution, parameter picker, and skipped-stage panel.

## What to open

Open **`Pires.CheckoutService/azure-pipelines.yml`** and run *Visualize ADO
Pipeline*. It's a thin wrapper that `extends` a shared template library and fans
out across environments.

## Structure

```
Pires.CheckoutService/
  azure-pipelines.yml                     <- open this one
Pires.PipelineTemplates/
  templates/
    pipelines/service-deploy-pipeline.yml <- orchestrator (extended by the wrapper)
    stages/
      environments/
        dev.yml  stg.yml  prd.yml      <- each calls the shared deploy stage
      build-and-test-stage.yml
      integration-tests-stage.yml
      deploy-environment-stage.yml        <- shared by every environment
    steps/
      restore-and-build-steps.yml
      run-unit-tests-steps.yml
      run-integration-tests-steps.yml
      publish-artifact-steps.yml
      deploy-service-steps.yml
      smoke-test-steps.yml
```

Resolution nests four levels deep:
`azure-pipelines` → `service-deploy-pipeline` → `environments/*` →
`deploy-environment-stage` → step templates.

## Things to try

- **Parameter picker** — click *Parameters*. With the defaults
  (Staging on, Dev/Prod off, integration tests on) the diagram shows
  *Build & Test*, *Integration Tests* and *Deploy to Staging*.
- **Skipped panel** — *Deploy to Dev*, *Deploy to Prod* and *Publish Release
  Notes* are listed as skipped, each with the parameter value that gated it.
- Tick **Deploy to Production** and it moves into the diagram.
- Switch **Release channel** to `beta` and *Publish Release Notes* appears.
