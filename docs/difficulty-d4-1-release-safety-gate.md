# Difficulty D4.1 — Pages release safety gate

## A. Baseline

HEAD `7009f3d092ef2913fb6ea35d8b2da1325b91e858` (D4), `main`, working tree limpio, HEAD = origin/main. Único workflow: `.github/workflows/deploy-pages.yml`. Un único job real, `deploy`, hacía install → Pages build → Pages validation → configure/upload → deploy; no tenía `needs` ni tests.

Se preservan push a main / workflow_dispatch, ubuntu-latest, checkout@v4, setup-node@v4 (Node 22, cache npm), npm ci, configure-pages@v5, upload-pages-artifact@v3, deploy-pages@v5, artifact dist-pages, environment github-pages y su page_url. Permisos existentes contents:read / pages:write / id-token:write; concurrency group pages, cancel-in-progress:false. Sin cambios de versiones, install, lockfile, permisos o concurrencia. Node local: v24.19.0; versión CI existente: 22.

## B. Risk found

Un error químico o de sesión que no impidiera compilar/validar archivos podía publicarse: el workflow no ejecutaba tests. workflow_dispatch tampoco tenía un guard explícito de branch. D4.1 añade checks bloqueantes y exige refs/heads/main para el job de publicación.

## C. Safety-gate design

Todos los gates están dentro del job existente **deploy**, en este orden:

```text
deploy [github.ref == 'refs/heads/main']
  checkout → setup-node 22 → npm ci
    → npm run test:critical
    → npm test
    → npm run build:pages
    → npm run validate:pages
    → actions/configure-pages@v5
    → actions/upload-pages-artifact@v3 [dist-pages]
    → actions/deploy-pages@v5 [id: deployment]
```

No se necesita needs entre jobs: no hay jobs paralelos ni dependencia externa. Cada step conserva la condición de éxito de los anteriores; sin continue-on-error, always(), condiciones para saltar tests ni `|| true`. Los comandos se ejecutan desde la raíz. Semántica de steps y errores: [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsif). [deploy-pages v5](https://github.com/actions/deploy-pages/tree/v5) admite un artifact subido previamente en el mismo job; se conserva la versión ya usada.

## D. Critical regression suite

`test:critical` usa `node --test --test-concurrency=1` y estos **12 archivos**, sin filtros, tests duplicados ni frameworks nuevos:

| Area | Test file | Protects |
|---|---|---|
| Chemistry/model | tests/exercise-model.test.mjs | Config canónica, IDs, versions, serialización y contrato compartido |
| Chemistry/domain | tests/exercise-domain.test.mjs | Oracles reales, conectividad/valencia, elementos/cargas/R/S y límites de funciones |
| Build | tests/practice-structural-answer.test.mjs | Igualdad canónica, remap/layout, cargas/órdenes/EZ y fallos técnicos |
| Difficulty D1/v1 | tests/difficulty-plumbing.test.mjs | IDs/default legacy, namespaces, fixtures v1, replay/corrections y Class/CSV |
| Difficulty D2/v2 | tests/difficulty-easy-session.test.mjs | Fixture Easy v2 ES/EN, validación de targets, sesiones finitas/Endless, MCQ/Build y Exam |
| Difficulty D3/v2/v3 | tests/difficulty-intermediate-session.test.mjs | Freeze v2 de tres niveles, Intermediate v3, self-accept, replay, finite/Endless y grading |
| Difficulty D4 | tests/difficulty-hard-foundation.test.mjs | Anchors/multiplicidad/prioridad, unsupported boundaries, Hard Build optativo y Reviewer |
| Freeze D4/v3 | tests/difficulty-hard-frozen.test.mjs | Planes v3 de tres niveles ES/EN, advanced legacy, Class fingerprints/seeds y CSV v1–v3 |
| Practice | tests/practice-session.test.mjs | Basic, seed, finite/Endless, bounded dedupe, locales y fallos del generador |
| PRACTICE-007B | tests/practice-007b-duplicate-integrity.test.mjs | Dos representaciones Naming no evaden dedupe; identidad estructural |
| PRACTICE-008 | tests/practice-008-reference-answer.test.mjs | Referencia mostrada autoaceptada, intentos/correction y Exam Submit atómico |
| Exam | tests/exam-session.test.mjs | Plan congelado, drafts/nav/locale, validación Build neutral, grading atómico y retry sin duplicados |

Los barridos químicos/distractores más grandes y las demás regresiones permanecen en npm test completo. El gate crítico no lo sustituye. No se modificaron assertions ni skips.

## E. Full npm test policy

**Obligatorio en cada ejecución que pueda publicar**, tanto push main como dispatch main. No hay condición que lo vuelva advisory. No existe evidencia de runtime inaceptable en Actions que justifique omitirlo. npm test conserva su build Worker verificado y runner completo; ese build no reemplaza el build estático de Pages posterior. CI decide por exit status, nunca por conteos hardcodeados.

## F. Pages build

`npm run build:pages`: **exit 0**, output **dist-pages**, 2,603 s de comando (Vite: 1,40 s). Warning de chunks >500 kB, sin errores; sin cambios de código/config de bundling ni optimización fuera de scope. El artifact a publicar sigue siendo el resultado de este build estático exitoso.

## G. Pages validation

`npm run validate:pages`: **exit 0**, 0,793 s. Resultado: **3 entries / 3 assets / base /Hydrocarbon-Lab/**. Verifica index, ES/EN, metadata de deployment static/local persistence y recursos bajo el base del repositorio. Se ejecuta después del build y antes de upload/deploy.

## H. Failure blocking

| Scenario | Result |
|---|---|
| Critical test failure | Se saltan full/build/validate/upload/deploy |
| Full npm test failure | Se saltan Pages build/validate/upload/deploy |
| build:pages failure | Se saltan validate/upload/deploy |
| validate:pages failure | Se saltan upload/deploy |
| Artifact upload failure | Se salta deploy-pages |
| Todo pasa en main | Deploy habilitado con el environment existente |

YAML parseado con js-yaml transitorio ya instalado; assertions de orden, job/ref, flags, rutas, environment, actions, permisos, concurrencia y archivos existentes pasan. Comparación semántica contra HEAD confirma que solo se añaden guard main + dos steps al workflow y test:critical a package.json. Evidence ignorada: workflow-audit.json/log. Los escenarios son auditoría estructural de las condiciones de éxito; no una ejecución o publicación real en GitHub.

## I. PR behavior

Se preservan triggers: no se añade pull_request. No PR deploy ni previews. La batería nombrada puede reutilizarse en una fase posterior de PR CI; D4.1 mantiene el workflow pequeño y su concurrencia existente.

## J. Main behavior

Push main / dispatch main → install → critical → full → Pages build → Pages validate → configure → upload → deploy. Dispatch de otro ref salta el job completo por el guard de main. La publicación conserva id deployment, environment y URL originales.

## K. Runtime

Critical local: **126,238 s**, aproximadamente **2 min 6 s**, 156 tests. Full runner: **837,588 s**, aproximadamente **13 min 58 s**, además del build Worker existente de npm test. Critical es aproximadamente **6,6×** más rápido que el runner completo. Pages build **2,603 s**; validation **0,793 s**. Los tiempos locales Windows/Node 24 no son medición de GitHub-hosted Ubuntu/Node 22; no se cambió la versión CI ni se introdujo un timeout restrictivo. Se mantiene full obligatorio.

## L. TypeScript

**No se añade tsc --noEmit bloqueante**: D4 documentó 32 diagnostics preexistentes / 0 nuevos. No cambios de TypeScript ni cleanup. Tampoco se añade lint: no estaba en este workflow; sus 11 warnings existentes quedan fuera de esta fase.

## M. Chemistry/version freeze

GeneratorVersion **3**. Ningún archivo de producción, perfil Difficulty, domain, namer, Practice/Exam, Build equality, Class/CSV o fixture fue editado. Freeze v1/v2/v3 protegido por los tests existentes de critical/full. advanced permanece legacy, sin generación Hard certificada ni selector.

## N. Local validation

Critical: **156 pass / 0 fail / 0 skip**, exit 0. Workflow audit: exit 0. **npm test: 2.314 tests / 2.309 pass / 0 fail / 0 cancelled / cinco skips históricos**, exit **0**, sin repetición ni incidencia EBUSY en D4.1. Skips ESTER-0007/0012/0014/0015/0016 intactos. Pages build y validate: exit **0**. `git diff --check`: exit **0**. Se usaron los comandos originales, sin modificar wrappers para Windows; npm test usa PATH temporal Git Bash fuera del sandbox, como D4. No cambios de expectativas ni instalación de dependencias.

## O. Files changed

- .github/workflows/deploy-pages.yml — guard main y dos steps bloqueantes antes de Pages build.
- package.json — script explícito test:critical.
- docs/difficulty-d4-1-release-safety-gate.md — este informe A–P.

Ignored probes/logs: outputs/difficulty-d4-1/{critical.log, full-suite.log, audit-workflow.mjs, workflow-audit.log, workflow-audit.json, pages-build.log, pages-validation.log}. Los tests originales también actualizan sus métricas ignoradas D3; build outputs/caches habituales siguen ignorados. Sin helper permanente, nuevos tests, paquetes ni lockfile churn.

## P. Out of scope / final state

Sin cambios de química, Difficulty, UI, D5 Hard generation, dependencies/actions upgrades, TypeScript cleanup, commit, push ni staging. HEAD/main conservados. El gate queda listo en el working tree; al no hacer commit/push, aún no se ha ejecutado ni activado remotamente el workflow editado.

DIFFICULTY D4.1 COMPLETE — PAGES DEPLOYMENT SAFETY GATE ACTIVE
