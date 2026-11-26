# 0.0.x Hardening Defect Register

## Scope and evidence rules

This register tracks the current Windows/Electron/BYOK hardening branch. There is no hosted product backend. Android is out of scope. Preserve the NSIS identity, unpacked standalone payload and existing updater feed. A source patch is not a passing regression result. Unless a row links an actual run on its revision, execution is NOT RUN. A build alone is not release readiness.

The user authorized release 0.0.14 only after the work and validation gates are complete. Do not tag or publish while a release-blocking security, data-loss, installation or updater issue remains open. Do not use live credentials or billable provider operations for routine tests.

| ID | Priority | Defect and evidence | Owner | Implementation status | Regression / remaining gate |
|---|---|---|---|---|---|
| GEN-01 | P2 | Tracked root server/ payload enters automatic TypeScript discovery; source and generated output are confused. | Architect / Reviewer | a0b5ee0 excludes root payload, documents assembly; no tracked payload deleted. | Remote typecheck, file-list and build/prepare assertions pending. |
| STORE-01 | P1 | Custom key previously bound by non-unique display label. | Security / Architect | 1d78289 binds the exact returned ID. | Duplicate-label and concurrent endpoint/key regression pending. |
| STORE-02 | P1 | Last custom removal leaves inconsistent enabled/active provider; failed persistence leaves changed memory. | Security / Architect | 1d78289 fixes fallback and in-memory delete rollback only. | Atomic disk persistence and serialized commands still OPEN; see STORE-03. |
| STORE-03 | BLOCKER | Direct fsp.writeFile truncates settings; save mutates before successful persistence. Concurrent mutations can race. | Security / Reviewer / Architect | One shared command queue, independent drafts and temp-flush-rename settings replacement implemented in this change; memory publishes after rename. | Fault injection for wx/write/sync/close/rename/restart, no lost updates and no unowned temp deletion required. |
| KEY-01 | BLOCKER | ID-cached clients can pair an old endpoint with freshly read credentials after configuration edits. | Security / Image / Architect | Client endpoint identity is checked before each key lookup; one queued custom endpoint+key command captures its destination. Partial key failure returns a saved-ID 409; UI consumer pending. | Warm-cache/held-client A-to-B race, stale metadata, Kie upload/poll and per-Store isolation mocks required. |
| IMAGE-01 | P1 | Edit route supplies images where non-OpenAI clients need imageBuffers; imageSize omitted by generic generation dispatch. | Image / Architect | 7fc555f forwards both input shapes, imageSize and n. | Route/client regression pending; source review requested. |
| IMAGE-02 | P1 | Separate masks silently ignored; Stability silently switches Core/Ultra edit model. | Image / Frontend | 7fc555f rejects separate non-OpenAI masks and unsupported Stability edits before dispatch. | Zero-network mask/model tests added to QA proposal; actual CI pending. |
| IMAGE-03 | P1 | One failed repeated output/task discards completed results or task IDs. | Image / Architect | 7fc555f adds persistence callbacks, partial responses and task IDs; no new paid retry. | Sequential persistence, partial Kie tasks and route/UI consumption regression pending. |
| TEST-01 | P1 | Migration test callbacks were not awaited and could falsely pass. | Bug Hunter / Architect | Awaited runner and exit-code self-tests in this change. | First remote run pending; no local execution permitted. |
| DIAG-01 | P1 | Stability testKey generated an image; diagnostic route could report misleading success or raw errors. | Image / Security | 7fc555f makes Stability testKey zero-fetch and respects client ok:false through redaction. | Mock zero-fetch and false-verdict tests; actual CI pending. |
| ERR-01 | P1 | Provider/storage errors can disclose credentials; unreadable plaintext file was swallowed. | Security | 1d78289 adds redaction; 7fc555f fails on non-ENOENT plaintext reads and validates fallback status. | Remaining route preparation catches and unreadable-storage/redaction mocks pending. |
| LOCAL-01 | BLOCKER | Loopback alone does not authenticate web-origin API callers or IPC senders. | Security / Windows | Session token, central proxy guard, HMAC health proof and lifecycle/IPC handoff NOT APPLIED. | Exact Host/Origin/token/port, restart/readiness/foreign IPC and header-strip mocks required. |
| VAULT-01 | BLOCKER | Current backend still writes plaintext secrets.env; metadata now honestly reports it. | Security / Windows | Encrypted shared vault and recoverable first-init journal handoff NOT APPLIED. Legacy must remain untouched. | Journal interruption, authenticated restart, no deleted-key revival, helper tracing and actual Windows DPAPI/ACL pending. |
| MIGRATE-01 | BLOCKER | Existing settings file can prematurely mark legacy migration complete. | Windows | Marker-last recovery migration handoff NOT APPLIED. | Resume/fault/conflict tests and legacy byte preservation required. |
| OUT-01 | BLOCKER | Provider-result downloads lack destination, DNS/redirect and size bounds; API redirects may expose auth. | Security | DNS-pinned bounded download/providerFetch handoff NOT APPLIED. | Fully mocked DNS/transport/redirect/size/deadline tests; Google/Stability integration scope also pending. |
| UI-01 | P1 | Bootstrap/gallery errors, draft loss, options and partial results are not handled consistently. | Frontend | Full UI handoff NOT APPLIED. | Retry/empty-provider/gallery-delete/partial IDs/hidden-shortcut/theme/mask-alpha regression required. |
| UI-02 | P2 | Image-reader race, preview scaling and full modal focus management remain open. | Frontend / UX | NOT APPLIED; triage remains open. | Explicit fixes or user-approved disposition required before claiming 0.0.x completion. |
| RELEASE-01 | BLOCKER | Packaging reproducibility and installed update/migration are not verified. | Windows / Bug Hunter | No version bump, tag, merge or release in this branch yet. | NSIS exe + latest.yml + blockmap, upgrade/data preservation and actual run/readback required for 0.0.14. |

## Current validation coverage

The non-release QA workflow has contents:read, no secrets, no tag/dispatch release trigger, no publishing step and no real provider calls. It installs locked dependencies without lifecycle scripts, exercises synthetic provider/migration/updater tests, typechecks maintained source, confirms root server/ exclusion, and builds/prepares the standalone payload. It is an initial gate, not the complete matrix above. New security/runtime changes must land with their matching tests. Actual run links and failures must replace pending wording as evidence becomes available.

## Local effects and recovery limits

No repository checkout, source file, dependency installation, build or test was created locally by the integration agent. HTTP responses and tool-managed output logs may exist in the harness storage. All repository edits use GitHub API fast-forward writes without force. Legacy user data, generated tracked payload copies and release history are not deleted. Atomic replacement proposals target process interruption, not an unverified guarantee of complete machine power-loss durability. Settings and credentials are separate files and must not be described as a crash-atomic multi-file transaction.

## Initial execution evidence

[QA run on 59e1dc9](https://github.com/rexteamiran/Sun-Studio/actions/runs/45726696144) completed successfully: runner exit tests, existing migration/provider/updater mocks, new image contracts, TypeScript, source-file exclusion and build/prepare. This evidence applies only to that SHA. Atomic Store/client changes and their new tests in the current change need a new run; remaining security/UI/Windows gates are not waived.
