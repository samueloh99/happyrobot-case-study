# HappyRobot Carrier Sales — Documentation

Reference material for the Inbound Carrier Sales Automation POC delivered for HappyRobot Logistics.

## For business reviewers

Start here if you want the "what and why" without the code.

- **[01-executive-summary.md](./01-executive-summary.md)** — One-page overview of the problem, the solution, and what it delivers
- **[09-northstar-kpis.md](./09-northstar-kpis.md)** — The KPIs this system moves, how to read them, and what's validated vs projected

## For IT / engineering reviewers

- **[02-architecture.md](./02-architecture.md)** — Systems in play, component roles, request flow
- **[03-design-decisions.md](./03-design-decisions.md)** — Why we made each key architectural choice
- **[04-api-reference.md](./04-api-reference.md)** — Backend endpoints: contracts, examples, error modes
- **[05-workflow.md](./05-workflow.md)** — HappyRobot workflow structure, tool wiring, native Northstars + Adversarial tests
- **[06-data-layer.md](./06-data-layer.md)** — Twin as source of truth: schema and access patterns
- **[07-tms-integration.md](./07-tms-integration.md)** — Legacy TMS TCP protocol, fault handling, retry policy
- **[08-qa-results.md](./08-qa-results.md)** — Test scenarios (standard, edge, adversarial) and results
- **[10-deployment.md](./10-deployment.md)** — Single-command deploy, environment, ops runbook

## Live artifacts

- **Code repository:** `github.com/samueloh99/happyrobot-case-study` (private, reviewers invited)
- **Backend:** `https://happyrobot-case-study-production.up.railway.app/api/v1`
- **HappyRobot workflow:** `platform.happyrobot.ai/deployments/bhvi6wonsptr`
