# Agent Note: Plugin portfolio and ecosystem proposal

Status: proposed

English | [中文](2026-08-14-plugin-portfolio-and-ecosystem.zh.md)

## Problem

DeepSeek Harness is a developer-preview agent runtime with strong local capabilities: durable sessions, tool execution, skills, subagents, workflows, approvals, credentials, telemetry, and a Web client. Its product gap is not another generic chat or connector. Teams cannot yet discover a trusted plugin, connect an agent run to a delivery outcome, set reusable organizational controls, or measure whether a plugin produces enough value to retain or monetize.

The evidence has an important limit. The repository offers GitHub Discussions and a `/feedback` command, but its feedback packages intentionally provide no aggregate retrieval, categorization, or analytics surface. No verified public complaint-volume dataset is available for this proposal. The ranked needs below are therefore codebase-backed product hypotheses, not a claim about counted complaints. The first release must instrument and validate them before pricing or roadmap expansion.

## Research findings

### Product and user evidence

| Observation | Evidence in the current product | Product implication |
| --- | --- | --- |
| Plugin discovery is inspection only. | The Web Plugin list is a read-only Loader snapshot with no provenance, grouping, or mutation controls. | Trust, search, install, rollback, and compatibility must be a product layer, not a README convention. |
| Skills are local files and connectors are deployment work. | The shipped filesystem skill provider scans local roots; provider discovery is sequential and has no diagnostics or last-good remote catalog. | A managed knowledge connector is valuable only if it preserves local-first ownership, source attribution, and failure visibility. |
| Feedback and telemetry do not close the product loop. | `/feedback` records free text; feedback has no retrieval, aggregation, category, or linked event. Telemetry ships no built-in redaction rules and is best effort. | Paid value is governance and outcome measurement, not exporting raw transcripts by default. |
| Workflows are powerful but transient. | Workflows fan out subagents, but have no saved workflow, resume, background collection, or token-budget vocabulary. | Delivery automation needs durable run records, checkpoints, budget limits, and human release gates. |
| The security baseline is local and fail-closed. | Approvals grant one action only; local credentials defer an OS-keychain provider; network Web binding has no TLS/auth/origin policy. | Any team or cloud plugin must add identity, scoped authorization, secret references, redaction, and an audit trail before data leaves the host. |

Target users are: (1) individual developers and open-source maintainers who value fast local automation and free reusable packs; (2) engineering leads and platform teams who pay for repeatable delivery, cost predictability, and controls; and (3) regulated enterprises that require private knowledge access, audit evidence, and administrator policy. The first group supplies adoption and templates; the latter two fund the roadmap.

### Competitive ecosystem and paid-demand evidence

| Market signal | Advantage to adopt | Failure to avoid |
| --- | --- | --- |
| Claude Code packages skills, agents, hooks, MCP and LSP into one plugin, and its marketplace supports central discovery, source pinning, updates, and private repositories. | One signed manifest, compatibility test, scoped installation, and versioned rollback give users a coherent extension experience. | Do not let an installed plugin silently gain tool, network, or credential access. |
| Cursor's marketplace combines skills and MCP services, while its Team and Enterprise offers include centralized billing, SSO, usage controls, and usage statistics. | Treat team governance and observable value as paid outcomes, not as an afterthought to connector installation. | Do not make every plugin an independently billed mini-product with separate identity and settings. |
| GitHub Copilot sells individual, Business, and Enterprise tiers and meters agent features with credits; public plans show price points from US$10 individual to US$19 and US$39 per managed seat. | Use a free adoption tier, a team subscription for controls and shared packs, and transparent usage pass-through for expensive agent runs. | Do not charge for a plugin before proving a measurable delivery or risk outcome. |
| Developer research reports high demand for AI assistance in coding, testing, documentation, and operations, while accuracy and oversight remain adoption constraints. | Prioritize evidence-backed delivery, review, and knowledge workflows over autonomous changes. | Do not promise unattended release automation as a default. |

Sources: [Claude Code plugin structure](https://code.claude.com/docs/en/plugins), [Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces), [Claude Code managed controls](https://code.claude.com/docs/en/configuration), [Cursor Marketplace](https://cursor.com/marketplace), [Cursor team controls](https://docs.cursor.com/account/pricing), [GitHub Copilot plans](https://github.com/features/copilot/plans), and [developer task-demand research](https://arxiv.org/abs/2510.00762). Competitor prices are market anchors, not DeepSeek Harness price commitments.

## Proposal

### Portfolio rules

Every proposed plugin is a separately versioned package with a declared service definition, provider, and consumer where the roles evolve independently. It must have a bounded data owner, a reversible install/disable path, explicit permissions, an audit event for external actions, and a free degraded mode where practical. Plugins never read plaintext secrets from a browser, bypass `ctx.approval`, or change the agent loop. A shared Team Control Plane owns identity, policies, entitlement, and metrics; feature plugins consume it through typed interfaces.

### Core portfolio: ship within three months

| Priority and plugin | Pain solved and core modules | Feasibility boundary | Commercial path | 90-day success metrics | Investment and timing |
| --- | --- | --- | --- | --- | --- |
| P0-1 Trusted Plugin Hub | Developers cannot safely find, install, update, or roll back reusable capabilities. Modules: signed manifest, publisher identity, compatibility matrix, package scanner, private registry, install/disable/rollback, provenance card, and rating/issue link. | Reuse bundles, Loader inventory, settings, credential references, and HMR. The first release permits declarative packages only; arbitrary post-install shell code, unmanaged remote URLs, and automatic privilege escalation are excluded. | Free public catalog and local registry. Team subscription adds private registry, publisher groups, allowlists, approval policy, and audit export. | 30% of active workspaces browse; 15% install a second plugin; 70% of installs remain enabled after 30 days; failed install rate below 2%; Team trial-to-paid above 12%. | 2 backend/plugin engineers, 1 Web engineer, 0.5 security, 1 QA; 8–10 weeks. Start in month 1 because all later packs depend on it. |
| P0-2 Delivery Orchestrator | Teams lose time moving from issue to branch, review, CI result, and human decision. Modules: GitHub/GitLab connector, work-item context, plan-to-workflow templates, branch/PR status, CI evidence, release checklist, approval handoff, and delivery report. | Reuse workflow, jobs, subagents, session log, attachments, approvals, and Web slots. V1 creates drafts and evidence links; merge, deployment, and secret rotation remain human-approved actions. One Git provider is selected for V1. | Free personal template with a capped run quota. Team add-on supplies shared templates, organization connector, CI policy, reviewer routing, and delivery dashboard. Enterprise adds self-hosted connector and audit retention. | 20% of active teams run one template weekly; median issue-to-PR preparation time falls 25%; 60% of runs reach a human review checkpoint; 30-day team retention improves 8 points; paid conversion above 10%. | 2 backend/plugin engineers, 1 integration engineer, 1 Web engineer, 1 QA; 10–12 weeks in parallel from month 1. |
| P0-3 Team Guardrails and Spend Control | Agent adoption stalls when leads cannot cap cost, control external actions, or explain what data left the host. Modules: workspace/team identity adapter, model and workflow budget, tool/MCP allowlist, approval routing, redaction rules, immutable audit export, and usage dashboard. | Reuse approvals, permission presets, telemetry, credentials, settings, session reporting, and model routing. It cannot make a loopback-only Web server multi-tenant; hosted administration requires a separate authenticated control-plane deployment. V1 supports local policy files and one remote policy endpoint. | Community edition supplies local budgets and policy templates. Team subscription supplies shared policies, member roles, dashboard, alerting, and monthly usage report. Enterprise supplies SSO/SCIM, retention, key-management integration, and customer-managed export. | 50% of Team workspaces set a budget or policy; 90% of external tool actions receive an audit record; budget-overrun incidents below 1% of governed runs; trial administrators return weekly above 45%; paid conversion above 15%. | 2 backend/plugin engineers, 1 Web engineer, 1 security engineer, 1 QA; 10–12 weeks in parallel from month 1. |

The three P0 plugins share Team Control Plane primitives but retain independent release switches. No P0 release waits for hosted billing: entitlement begins as a signed local license or feature flag, so the product validates value before operating a payment system.

### Medium-term portfolio: one to two years

| Priority and plugin | Pain solved and core modules | Feasibility boundary | Commercial path | Evaluation metrics | Investment and timing |
| --- | --- | --- | --- | --- | --- |
| P1-1 Governed Knowledge Connector | Agents lack current internal specifications, decisions, runbooks, and tickets. Modules: connector adapters, incremental sync, source ACL mapping, citation cards, freshness state, project/team scopes, and deletion propagation. | Implement as a skills/context provider with per-source policy and no browser-held tokens. V1 indexes metadata plus retrieved snippets; full-corpus embedding, cross-tenant retrieval, and hidden chain-of-thought storage are excluded. | Free local Git/docs source. Paid Team connectors for GitHub, GitLab, Jira, Notion, and Confluence; Enterprise adds private network deployment and ACL sync. | 35% of assisted tasks cite a managed source; stale-source rate below 3%; answer acceptance rises 15%; connector retention above 70% at 90 days. | 3 backend/integration engineers, 1 Web engineer, 1 security engineer, 1 QA; 12–16 weeks, begin after policy primitives are proven. |
| P1-2 Quality, Security, and Review Pack | Reviewers need repeatable evidence, not generic agent prose. Modules: repository policy packs, dependency/license/SAST adapters, test-plan generator, PR review rubric, diff evidence, and blocking approval recommendation. | Consume filesystem, LSP, tool events, workflow, and approval. Findings are advisory until a human or external CI policy acts; no local scanner result can silently block a merge. | Free baseline rules. Paid Team rulesets, scheduled scans, shared baselines, and PR analytics; Enterprise adds custom controls and SIEM export. | 40% of PR workflows use a rule pack; accepted high-severity findings per active repo; false-positive rate below 15%; mean review cycle time falls 20%. | 2 backend/plugin engineers, 1 security engineer, 1 integration engineer, 1 QA; 12 weeks, months 6–9. |
| P1-3 Durable Automation and Runbook Pack | Repeated work cannot survive restarts, run asynchronously, or report token spend. Modules: saved workflow registry, scheduler, checkpoint/outbox, budget ledger, retry policy, runbook UI, and incident handoff. | Extends jobs and workflow rather than modifying the loop. V1 saves typed templates and checkpoints external action boundaries; arbitrary workflow-script persistence and automatic production remediation stay excluded. | Free personal schedules with small limits. Team subscription adds shared runbooks, concurrency, alerts, and history; Enterprise adds HA workers and retention controls. | 25% of teams create a saved runbook; scheduled-run success above 95%; 30-day runbook retention above 60%; manual operational hours per team fall 15%. | 3 backend/workflow engineers, 1 Web engineer, 1 SRE/security engineer, 1 QA; 16–20 weeks, months 9–15. |
| P1-4 Evaluation and Skill Lifecycle Pack | Teams cannot compare prompts, skills, models, and plugins against a stable quality/cost baseline. Modules: test-set registry, replay harness, redacted traces, scorecards, A/B routing, regression alerts, and plugin health score. | Build on session telemetry and message feedback only after redaction, retention, and attribution are explicit. Scores assist decisions; automatic production model switching remains opt-in and approval-backed. | Free local evaluation files. Paid Team shared datasets, dashboards, regression alerts, and model-cost attribution; Enterprise adds private evaluators and audit retention. | 30% of Team plugins have an evaluation; regression detection before release above 70%; median cost per accepted delivery decreases 15%; expansion revenue from active teams above 20%. | 3 backend/data engineers, 1 Web engineer, 1 QA; 16–20 weeks, months 12–24. |

### Business model and validation

The business model is open-core and outcome-led. Local execution, personal skills, public packs, basic policy templates, and a small personal workflow allowance remain free to preserve developer adoption. Team value is sold per active managed user with included governed runs; costly model, search, and connector consumption is transparently passed through or prepaid as credits. Enterprise value is annual and deployment-specific: SSO/SCIM, private registry, private connectors, retention, audit export, and support.

Price research supports testing, not launch promises. Test US$15–20 per active Team user monthly, compare against the public US$10 individual and US$19 managed-seat anchors, and require a pilot to demonstrate either one avoided incident or at least two hours saved per user monthly. Run 15 design-partner interviews, 30 moderated task tests, and four-week instrumented pilots before fixing a price. Segment results by individual, startup, and regulated enterprise; do not average them into one willingness-to-pay number.

### Ecosystem operating model

| Operating area | Policy and flow |
| --- | --- |
| Submission and review | Publishers verify identity, declare data classes, permissions, network destinations, credential references, license, support owner, compatibility range, and rollback behavior. Automated checks validate manifest schema, dependency/SBOM, malware signatures, secret scan, package reproducibility, permission delta, and real-composition tests. Human review is required for external write actions, code execution, browser UI, telemetry export, or elevated permissions. |
| Release channels | Each plugin has `draft`, `verified`, `stable`, and `deprecated` channels. Stable releases require semantic versioning, signed artifact, compatibility test against supported profiles, changelog, privacy disclosure, and rollback artifact. Critical revocation disables the plugin through the Team Control Plane and preserves an audit record. |
| Permissions and data | Install asks for the smallest declared capability set. An administrator can allow, require approval, or deny a capability per workspace. Credentials remain references resolved on the Host. External transmission uses redaction before handoff, domain allowlists, retention metadata, and an outbound-event audit record. |
| Feedback and iteration | Every plugin has an in-product “useful / not useful” control, category, free-text reason, and optional run id. Aggregate only redacted, consented events. Product operations reviews weekly activation, error, permission-denial, and churn signals; the plugin owner publishes a monthly changelog and responds to P0 security defects within one business day. |
| Cross-plugin experience | The Team Control Plane provides one identity, entitlement, policy, budget, audit, settings namespace, notification center, and design tokens. Plugins publish typed outcome events and consume only declared service definitions. A Delivery Orchestrator run can invoke Quality checks and Knowledge retrieval, but each external action retains its own approval and budget reservation. No plugin silently installs, enables, changes models, or broadens another plugin's permissions. |
| Portfolio governance | Monthly portfolio review ranks plugins by activation, retained teams, delivery outcome, gross margin after model costs, support burden, and security incidents. A plugin below its activation and retention threshold for two quarters moves to remediation, free/community maintenance, or deprecation with export and migration support. |

## Acceptance criteria

- P0 scope remains three independently installable packages plus shared control-plane contracts; no business feature is embedded in the agent loop.
- Every P0 package publishes a threat model, data-flow inventory, permission manifest, rollback test, and keyless real-composition scenario before stable release.
- The marketplace records publisher, artifact digest, compatibility, permissions, install state, and rollback target for every package.
- Delivery, governance, and knowledge/plugin operations emit redacted, attributable outcome events; no raw session transcript becomes a commercial metric by default.
- Design-partner pilots produce baseline and post-adoption measurements for the metrics in this proposal before pricing leaves experiment status.

## Risks

- Building a marketplace before a clear install format creates a catalog of unsafe, incompatible packages. Mitigation: ship declarative signed manifests and compatibility checks first; delay arbitrary code packages.
- Team controls can slow individual adoption. Mitigation: retain a local-first free tier and apply policy only to managed workspaces.
- Connector breadth can dilute reliability and leak data. Mitigation: launch one provider per job-to-be-done, require source attribution and outbound audit events, and expand only after retention proves value.
- Consumption pricing can cause surprise bills. Mitigation: reserve budget before high-cost work, show a pre-run estimate, cap per-run and monthly spend, and retain a human approval path.
- No verified complaint corpus can mis-rank priorities. Mitigation: make P0 pilots and product telemetry a release requirement, and revise the portfolio with evidence rather than defending the initial ranking.

## Alternatives considered

**Build a broad connector marketplace first.** This maximizes catalog count but duplicates generic MCP distribution and leaves trust, outcome, and administration unsolved. The proposal starts with trusted distribution and three outcome-oriented packs.

**Monetize model access alone.** Model margins are volatile and do not distinguish the Harness. Shared workflows, governance, evidence, and private knowledge create durable team value while allowing model usage to remain transparent pass-through.

**Make the agent autonomous by default.** The current product intentionally uses one-shot approvals and fail-closed behavior. Delivery and security plugins preserve human checkpoints; unattended automation is a separately governed future posture.

**Build a hosted multi-tenant platform immediately.** The current Web server is loopback-focused and lacks the required identity and network controls. The first commercial layer remains deployable beside local Harness instances; hosted administration follows only after identity, authorization, and audit primitives are proven.
