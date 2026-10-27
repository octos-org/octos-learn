# OctosLearn — Product Requirements Document

| Document control | Value |
| --- | --- |
| Document ID | OL-PRD |
| Date | October 27, 2026 · America/Los_Angeles |
| Status | Final document; release readiness is established through acceptance evidence |
| Responsibility | Product management, engineering, quality assurance and release operations |
| Language | English · [简体中文](PRD.zh-CN.md) |

## 1. Product purpose and requirements conventions

OctosLearn is an AI tutor on an infinite whiteboard. Learners ask questions through handwriting, voice, photos or text and receive interactive micro-lessons beside their own work. Lessons combine deterministic mathematical visuals, handwritten board notes and spoken or written narration.

The Star Atlas Academy makes recorded learning activity visible through personalized teachers, a knowledge map, achievements and reports. The immediate objective is to release a dependable academy experience while preserving the speed, correctness and recoverability of the learning core.

The product supports three outcomes: help learners understand the question in front of them; preserve an accurate record of their activity; and encourage further practice without presenting activity as proof of mastery.

**Requirement language and priority.** “Shall” identifies a required behavior. Each OL identifier has one independently assessable obligation. Supporting field lists describe a single output or behavior. All core requirements are Phase 1 / P0; OL-069 and OL-070 are conditional Phase 1 / P1, included only when D03 selects teacher voices for prebuilt lessons. Product and release owners record the final inclusion of optional scope in the release manifest.

**Verification.** T = executable test; D = observed demonstration; I = inspection; A = measured analysis. V-001 verifies OL-001, and so on. Each result is recorded separately, including when several checks share a test run. A required unresolved parameter blocks the affected acceptance check. Writing a requirement does not establish that it has been implemented, tested or released.

**Release-specific decisions.** D01–D12 identify product policies, environment choices and measurement values that must be recorded by the milestones in section 9. They remain open until the accountable role supplies an approved decision record. Their presence does not waive a requirement or authorize publication.

**Language consistency.** The English and Chinese editions share requirement IDs, priorities, dependencies and numerical criteria. Any difference in meaning must be resolved in both editions before acceptance of the affected requirement.

## 2. Users, needs and release scope

The product serves primary through high school math learners, expands progressively into additional subjects, and supports teachers presenting on classroom screens. Phase 1 organizes records around one learner per Octos profile and distinguishes classroom presentation from individual pupil assessment. D01 confirms the specific age/grade, language, curriculum and account boundaries.

| Need | User outcome / rationale | Journey |
| --- | --- | --- |
| N01 | Start or continue learning with the capabilities actually configured. | U01 |
| N02 | Receive a relevant, mathematically checked explanation tied to the original question. | U02 |
| N03 | Recover work and obtain accurate records across interruptions and devices. | U03 |
| N04 | Understand recorded progress and receive encouragement without mastery claims. | U04 |
| N05 | Control personal data and prevent its exposure on shared devices. | U05 |
| N06 | Use personal credentials with understandable, bounded optional spending. | U01, U06 |
| N07 | Use a responsive, accessible product on a declared supported environment. | All journeys |

| Journey | Preconditions → action → success boundary |
| --- | --- |
| U01: First use | Signed-in profile, possibly no keys → open whiteboard/configure chosen capability → perform an available learning action without losing the question. |
| U02: Ask and learn | Usable model, permitted input → submit text/photo/ink/voice → interact with the correct lesson, or receive clarification/explicit partial failure. |
| U03: Resume and sync | Previously persisted board/run → restart, reconnect or resume → recover known work without duplicate credit or false completion. |
| U04: Review progress | Recorded events, possibly unmapped or empty → open atlas/awards/reports → see their supported factual meaning and completeness. |
| U05: Manage privacy | Authenticated learner or shared TV → inspect/correct/forget memory or change account → enforce the selected scope and isolation. |
| U06: Manage spending | Optional background use configured → reach caps, disable use or encounter provider failure → preserve learning access without unauthorized fallback spending. |

**Phase 1 includes:** academy hall, teacher selection, learning history and memory controls, atlas, achievements, weekly/monthly reports and regression of text/ink/photo/voice lessons, persistence, BYOK and supported TV use. Teacher voices for prebuilt packs are conditional under D03.

**Phase 1 excludes:** quests, boss HP, collectibles, exams, new subjects, family subprofiles, class rosters and course-authoring studio. Those are discovery scope in section 10, not Phase 1 acceptance cases. Existing saved/prebuilt playback does not imply that every feature works offline.

**Support boundary:** desktop browser and touch-screen Android TV are target environments. Android 8.0/API 26 is a minimum target, not verified coverage. D02 lists exact browser/WebView/device/input/assistive-technology combinations and the status of mobile browsers. Only tested combinations enter the supported matrix. Full high-school mapping is not an existing promise: the six unmapped packs include three trigonometry and three multivariable-calculus packs (REF-04).

**Product constraints:** no mastery certification from activity; personal-key inference without a platform-funded fallback; spatial placement beside learner ink; no streak-loss punishment. Deterministic OLL execution does not establish that model interpretation or narration is correct; OL-053–OL-055 address teaching quality separately.

## 3. Related specifications, assumptions and system boundaries

| Reference | Technical specification / purpose |
| --- | --- |
| REF-01 | [Learning-history plan](PERSONALIZED_TEACHERS_PHASE2_PLAN.md): §3 account ownership; §4 events/source identity; §11 acceptance and recovery. |
| REF-02 | [BYOK revision](BYOK_WITH_EXISTING_OCTOS_PLAN.md): current credential boundaries, capability fallback, Android storage and cancellation. |
| REF-03 | [Academy and achievement plan](ACADEMY_HALL_AND_ACHIEVEMENTS_PLAN.md): hall availability, award rules, withdrawal, title and ceremony behavior. |
| REF-04 | [CoursePack mappings](COURSE_PACK_TOPIC_MAPPINGS.md): evidence states, immutable content identity and unmapped coverage. |
| REF-05 | [Release E2E checklist](RELEASE_E2E_CHECKLIST.md): input, whiteboard, teacher/persistence and clarification regression. |
| REF-06 | [Deployment runbook](PUBLIC_DEPLOYMENT_RUNBOOK.md): deployment and recovery procedure reference. |

The learning core, academy experience and content resources are accepted separately. The release manifest records deployment status and acceptance results for each feature; merged code or existing assets do not substitute for release evidence.

Assumptions requiring confirmation: one profile represents one learner (D01); supported languages/curricula (D01); supported platform capabilities (D02); availability of reviewed mappings (D08); provider and teacher-voice capabilities (D03/D06). Repository compatibility is a release dependency, not an assumption of success.

| Boundary | Required contract / responsibility | Main requirements |
| --- | --- | --- |
| Client ↔ Octos | Authenticated identity, profile routing, teacher memory scope; no cross-account data. Octos owns generic auth/session/memory. | OL-023–OL-026, OL-045–OL-047 |
| Client ↔ history service | Stable event/run identity, original time, acknowledgement and deletion behavior. Product service owns factual aggregates. | OL-010–OL-019, OL-034, OL-068 |
| Coach ↔ OLL runtime | Pinned validation/content versions; valid segments, partial delivery and interaction evidence. | OL-005–OL-009, OL-013, OL-029 |
| Product ↔ providers | Account-owned credentials, visible failure, bounded optional use; web relay and Android-local key entry follow REF-02. | OL-038–OL-044 |
| Product ↔ CoursePacks/lore | Immutable content/mapping identity; reviewed teacher identity/art; source availability. | OL-019, OL-021, OL-029, OL-069–OL-072 |

The release manifest pins `octos-learn`, `octos`, `learning-coach`, OLL, course-library content, taxonomy/mappings and consumed lore assets. Interface schemas/error codes remain in their owning technical specs; missing version/compatibility contracts are D10 blockers.

## 4. Terms and state meanings

| Term | Meaning used for acceptance |
| --- | --- |
| Learning run | One explicit learning attempt; refresh/resume keeps the run identity. Deliberate relearning creates another run under REF-01. |
| Event identity | Stable identity of an observed action, scoped to its account/run/log; network retransmission is not a new action. |
| Delivered / played / solved | Content received / actual playback evidence / a program-checked task success. None alone proves mastery. |
| First playable segment | Time from explicit submit to the first valid rendered segment with its required interaction enabled. Narration readiness is measured separately. |
| Quota day | Account-wide accounting interval; timezone, reset and failed-attempt treatment remain D06. |
| Saved / synced | Acknowledged by the respective durable local / server store. Pending upload is not synced. |
| Forget memory | Remove a selected stored memory from later memory retrieval; does not promise erasure of source conversations or backups. |
| Supported environment | A specific combination in the approved and tested support matrix, not an entire OS family by implication. |
| LAT95_MAX / RTO_MAX / RPO_MAX | Unassigned bounds for p95 latency / recovery duration / lost-data interval. D09/D10 must set units, conditions and values. |

## 5. Product requirements and individual verification

The accountable function above each group coordinates contributing teams and assigns one named owner per requirement. The Need column provides traceability to user outcomes. Dependency `—` means no identified open product decision for that row, not that implementation is complete. The acceptance report records the actual result of each check; unresolved dependencies are marked Blocked. OL-069/070 may be Not applicable only through explicit D03 exclusion.

### 5.1 Learning entry and delivery

Accountable function: Client engineering lead.

| ID | Need | Requirement | Verification ID / method and pass criterion | Decision dependency |
| --- | --- | --- | --- | --- |
| OL-001 | N01 | The product shall allow a signed-in learner with no provider keys to create and edit a blank whiteboard. | V-001 / T: With all keys absent, create a board, draw a stroke and erase it without opening provider setup. | — |
| OL-002 | N01 | The product shall retain the submitted question while missing model credentials are configured. | V-002 / T: Submit a question without a model key; complete setup; the original text and attachment references remain available for explicit resubmission. | — |
| OL-003 | N01 | The product shall accept typed questions when ASR is unavailable. | V-003 / T: With a valid model and absent or failed ASR, a typed question reaches lesson generation. | — |
| OL-004 | N01 | The product shall display lesson narration as text when TTS is unavailable. | V-004 / T: With TTS missing or failing, all delivered narration text remains accessible in playback order. | — |
| OL-005 | N02 | The product shall associate each delivered lesson with the question and source snapshot that initiated it. | V-005 / T: Exercise text, photo, ink and voice inputs; complete two concurrent requests in reverse order; neither result changes source association. | — |
| OL-006 | N02 | The product shall request clarification for inputs classified as ambiguous by the approved evaluation fixtures. | V-006 / T: For every ambiguous fixture, receive a clarification request instead of an unrelated math lesson. | D09 |
| OL-007 | N02 | The runtime shall reject a segment that fails the pinned OLL validator. | V-007 / T: Feed invalid and unsupported-component fixtures; no rejected segment executes or contributes a completion event. | — |
| OL-008 | N02 | The product shall preserve valid delivered segments when later lesson generation fails. | V-008 / T: Fail generation after two valid segments; both remain replayable with their original content. | — |
| OL-009 | N02 | The product shall label a lesson with failed remaining generation as partially delivered. | V-009 / T: After the failure in OL-008, the lesson status is partial rather than fully generated or fully completed. | — |

### 5.2 History and persistence

Accountable function: Learning-history engineering lead.

| ID | Need | Requirement | Verification ID / method and pass criterion | Decision dependency |
| --- | --- | --- | --- | --- |
| OL-010 | N03 | The product shall restore a successfully saved whiteboard after application restart. | V-010 / T: Save a board containing student ink, AI ink and a lesson; restart; compare content and saved placement with the snapshot. | — |
| OL-011 | N03 | The product shall preserve the learning-run identifier when a learner resumes an existing run. | V-011 / T: Refresh and resume the same run three times; the run identifier and total run count remain unchanged. | — |
| OL-012 | N03 | The history service shall count a repeated submission of the same event identity once. | V-012 / T: Resubmit a persisted event after lost acknowledgement, restart and reconnection; aggregate counts equal a single accepted submission. | — |
| OL-013 | N03 | The product shall classify learning events separately as generation, delivery, playback, skip, attempt or task success. | V-013 / T: Trigger each event type; skip-to-end produces no playback or task-success evidence for skipped material. | — |
| OL-014 | N03 | The product shall submit an offline event only under its originally confirmed account identity. | V-014 / T: Queue an event as account A, then sign in as B; A’s event never appears in B’s upload or history; unowned events remain unassigned. | — |
| OL-015 | N03 | The history service shall retain the original occurrence timestamp of an offline event. | V-015 / T: Upload an event the next day; its stored occurrence timestamp equals the original rather than the receipt timestamp. | — |
| OL-016 | N03 | The history service shall reject events that would recreate a deleted learning record. | V-016 / T: Delete a run, reconnect an old device and upload old or newly numbered child events; the run remains absent from history and statistics. | — |
| OL-017 | N03 | The product shall display a saved or synced status only after acknowledgement from the corresponding durable store. | V-017 / T: Delay or reject local/server writes; each unacknowledged destination remains pending or failed, never saved/synced. | — |
| OL-018 | N03 | The product shall display a save-failure state when local storage rejects a write. | V-018 / T: Exhaust storage during a save; observe a failure indication identifying the unsaved work before another save is attempted. | — |
| OL-019 | N03 | The product shall identify unavailable historical lesson material without generating replacement content. | V-019 / T: Remove a historical source with no retained copy; opening it displays unavailable and makes no generation request. | — |

### 5.3 Academy, memory and factual feedback

Accountable function: Academy experience lead.

| ID | Need | Requirement | Verification ID / method and pass criterion | Decision dependency |
| --- | --- | --- | --- | --- |
| OL-020 | N04 | The academy hall shall retain its new-board and resume-board actions when summary retrieval fails. | V-020 / T: Reject atlas/history summary requests; both navigation actions still open the intended board. | — |
| OL-021 | N04 | The product shall restore the learner’s selected teacher after refresh. | V-021 / T: Select each available teacher, refresh and inspect the selected identity. | — |
| OL-022 | N04 | An active lesson shall retain the teacher identity captured when its generation began. | V-022 / T: Switch the selected teacher mid-generation; the current lesson retains the original teacher and the next generated lesson uses the new selection. | D07 |
| OL-023 | N05 | The product shall let the learner view the teacher memories stored for their authorized scope. | V-023 / T: Seed known memories in approved teacher scopes; the memory view lists those records for the authorized learner. | D04 |
| OL-024 | N05 | The product shall let the learner correct a stored teacher memory. | V-024 / T: Edit a memory and await success; a fresh memory read returns the corrected value. | — |
| OL-025 | N05 | The product shall let the learner remove a selected stored teacher memory from subsequent memory retrieval. | V-025 / T: Remove a selected memory and await success; a new memory retrieval excludes it; removal makes no claim about source conversations or backups. | — |
| OL-026 | N05 | The product shall report memory deletion as successful only after the memory service confirms removal. | V-026 / T: Delay and fail the deletion response; the UI stays pending or failed rather than displaying forgotten. | — |
| OL-027 | N04 | The atlas shall derive explored, practicing and solved-before states from their respective mapped playback, attempt and successful-task evidence. | V-027 / T: Use fixtures containing only playback, only an attempt, and a successful attempt; each yields its corresponding evidence state. | — |
| OL-028 | N04 | The product shall distinguish unstudied, pending attribution, unmapped and failed attribution in its topic-status presentation. | V-028 / T: Prepare one fixture for each state, including a known unmapped pack; each displays the matching label rather than zero learning. | — |
| OL-029 | N04 | The history service shall retain the course-content version and mapping version supporting a topic attribution. | V-029 / T: Attribute two versions of a pack; inspect records and distinguish the exact supporting content/mapping versions. | — |
| OL-030 | N04 | The achievement service shall withdraw an award when its required supporting evidence has been deleted. | V-030 / T: Earn an award from its minimum fixture, delete the qualifying evidence, refresh awards; the award is absent. | — |
| OL-031 | N04 | The product shall restore the default title when the selected title’s prerequisite achievement is withdrawn. | V-031 / T: Select a title, withdraw its supporting award and refresh; the default title appears. | — |
| OL-032 | N04 | The product shall allow the learner to dismiss an award ceremony before its automatic end. | V-032 / T: For each rarity, activate Skip/Close and Esc on a supported keyboard; the overlay closes without waiting for its timer. | — |
| OL-033 | N04 | The product shall return interaction focus to the originating control when an award ceremony closes. | V-033 / T: Trigger a ceremony from a keyboard-controlled lesson, close it, and continue operating the previous control without re-navigation. | — |
| OL-034 | N04 | The product shall compute shared history, atlas and report counts from the same eligible event set for the same account and period. | V-034 / T: Fix account, period, mapping version and event fixtures; reconcile each shared count across views, including duplicate and excluded events. | D05,D08 |
| OL-035 | N04 | The product shall label a report with no eligible events as no recorded activity for that period. | V-035 / T: Open weekly and monthly reports for an empty period; no activity or learning judgment is invented. | — |
| OL-036 | N06 | The product shall generate monthly reports without a model request. | V-036 / T: Generate a monthly report with model access blocked; factual report succeeds and model request count is zero. | — |
| OL-037 | N04 | The product shall display factual weekly report data when teacher-comment generation fails. | V-037 / T: Fail the comment provider; the weekly counts remain visible with the comment marked unavailable. | — |

### 5.4 Credentials, spending and isolation

Accountable function: Identity and credential engineering lead.

| ID | Need | Requirement | Verification ID / method and pass criterion | Decision dependency |
| --- | --- | --- | --- | --- |
| OL-038 | N06 | The product shall authorize each paid provider request using credentials belonging to the initiating authenticated account. | V-038 / T: Inspect redacted provider-bound requests for accounts A/B and missing-key cases; no request uses another account’s or a platform key. | — |
| OL-039 | N06 | The server shall expose no client interface that returns a stored provider key in plaintext. | V-039 / I: Inspect web/APK configuration responses and exposed credential interfaces using synthetic keys; stored plaintext keys are absent. | — |
| OL-040 | N06 | The Android app shall encrypt locally entered provider keys using Android Keystore-backed encryption before persistence. | V-040 / T: Save a synthetic key, inspect persisted data and simulate Keystore failure; no plaintext key is persisted in either path. | — |
| OL-041 | N06 | The product shall admit at most 10 background topic-analysis attempts per account per quota day. | V-041 / T: Run concurrent requests from two devices; accepted attempts do not exceed 10 under the approved attempt/reset policy. | D06 |
| OL-042 | N06 | The product shall admit at most 3 teacher-comment attempts per account per quota day. | V-042 / T: Run concurrent requests from two devices; accepted attempts do not exceed 3 under the approved attempt/reset policy. | D06 |
| OL-043 | N06 | The product shall prevent new optional background provider requests after the learner disables background spending. | V-043 / T: Disable the control, then trigger topic/report eligibility on connected devices; no new optional paid background request is admitted. | D06 |
| OL-044 | N06 | The BYOK voice relay shall not automatically retry a failed paid provider request. | V-044 / T: Return timeout, rate-limit and provider-error responses; each user action produces at most one provider attempt until explicit retry. | — |
| OL-045 | N05 | The product shall reject access to learning data owned by another account. | V-045 / T: Using account B, request A’s history, report, memory and attachments by known identifiers; no protected content is returned. | — |
| OL-046 | N05 | The client shall cancel the current account’s active requests and queued uploads on logout or account switch. | V-046 / T: Log out with generation, voice and upload work active; the client starts no further work for that account and discards late UI results. | — |
| OL-047 | N05 | The Android app shall remove the previous account’s local provider-key copies on logout or account switch. | V-047 / T: Switch A to B, restart the app and inspect A’s local credential availability; A’s key cannot be used without re-entry. | — |
| OL-048 | N05 | The product shall stop microphone and camera capture when the account logs out or capture permission is revoked. | V-048 / T: Exercise both triggers while capturing; active capture tracks close and no further media is submitted by the client. | — |
| OL-049 | N05 | The product shall exclude provider keys from logs, telemetry, generated lessons and distributed build artifacts. | V-049 / I: Use identifiable synthetic keys through success and error paths; scan all listed outputs and find zero occurrences. | — |

### 5.5 Presentation, quality and access

Accountable function: Product quality lead.

| ID | Need | Requirement | Verification ID / method and pass criterion | Decision dependency |
| --- | --- | --- | --- | --- |
| OL-050 | N05 | The product shall hide personal history, reports and teacher memories by default in classroom presentation mode. | V-050 / T: Enter classroom presentation mode from each personal view; none of the listed personal data appears until an explicit authorized exit from that mode. | D04 |
| OL-051 | N07 | The candidate shall have first-playable-segment p50 latency no greater than the matched baseline p50. | V-051 / A: Use the approved interleaved protocol; candidate p50 minus baseline p50 is at most zero; attach raw timings and failure counts. | D09 |
| OL-052 | N07 | The candidate shall add zero model round-trips to the lesson’s critical path relative to the baseline. | V-052 / A: Compare request dependency traces for the same inputs; no new model request is required before the first playable segment. | D09 |
| OL-053 | N02 | The candidate shall pass at least 95 percent of cases in the approved natural-input math evaluation corpus. | V-053 / A: Apply the versioned rubric to every corpus case; passes divided by all cases is at least 0.95, with failures and timeouts retained. | D09 |
| OL-054 | N02 | The absolute pass-rate difference between matched short-input and detailed-input math evaluations shall not exceed 5 percentage points. | V-054 / A: Evaluate paired inputs under the same configuration; absolute percentage-point difference is at most 5. | D09 |
| OL-055 | N02 | The release evaluation shall contain zero unresolved critical mathematical defects. | V-055 / I: Classify every discovered defect using the approved rubric; the unresolved critical count is zero regardless of aggregate pass rate. | D09 |
| OL-056 | N07 | The product shall support keyboard-only completion of the core journeys designated in the support matrix. | V-056 / D: Complete each designated journey using Tab, Shift+Tab, Enter, Space, arrows and Escape as applicable, without pointer input or focus traps. | D02 |
| OL-057 | N07 | The atlas shall provide a text or shape distinction for every state otherwise represented by color. | V-057 / I: Inspect all atlas states in monochrome; each state remains identifiable from its text or shape legend. | — |
| OL-058 | N07 | Each required practice interaction shall offer a completion method that does not require precise dragging. | V-058 / D: Complete each required practice fixture using its non-drag control and obtain the same task result as the drag path. | D02 |
| OL-059 | N07 | Award presentation shall use a static result when reduced-motion preference is active. | V-059 / T: Enable reduced motion and trigger every rarity; no particle, flash or shake effect runs and award information remains visible. | — |
| OL-060 | N07 | The client shall defer loading nonessential academy art and ceremony assets until their feature is requested. | V-060 / I: Open a direct lesson route with a cold cache; network and bundle inspection shows no requests for unrelated ceremony or teacher-gallery assets. | — |

### 5.6 Service quality and corrections

Accountable function: Release engineering lead.

| ID | Need | Requirement | Verification ID / method and pass criterion | Decision dependency |
| --- | --- | --- | --- | --- |
| OL-061 | N07 | The candidate’s first-playable-segment p95 shall be no greater than LAT95_MAX under the approved measurement profile. | V-061 / A: Compare measured p95 with LAT95_MAX; verification is BLOCKED until D09 assigns the budget and profile. | D09 |
| OL-062 | N07 | The product shall reject an unsupported client/server/content combination before it performs an incompatible data write. | V-062 / T: Use incompatible-version fixtures from the support matrix; receive an upgrade/unsupported state and observe zero incompatible writes. | D10 |
| OL-063 | N03 | A restored backup shall preserve the learning records, deletion markers and event identities captured at the backup point. | V-063 / T: Restore a snapshot into an isolated test instance; compare these fields with the backup manifest and replay duplicate/deleted events. | — |
| OL-064 | N07 | The release recovery procedure shall restore service within RTO_MAX. | V-064 / D: Time a recovery drill; verification is BLOCKED until D10 assigns the recovery-time bound. | D10 |
| OL-065 | N07 | The product shall emit a redacted failure record for each failed generation, voice, sync or background-analysis operation. | V-065 / T: Inject each failure type; its record contains operation ID, category, outcome and component version, but no keys or raw learner content. | D04 |
| OL-066 | N07 | The product shall keep whiteboard opening and editing available when optional academy features are disabled for incident recovery. | V-066 / T: Disable optional academy features using the incident-recovery control; create and edit a board without their services. | D10 |
| OL-067 | N04 | Each weekly or monthly report shall display its date interval, reporting timezone and data-completeness state. | V-067 / T: Inspect reports spanning midnight, week/month boundaries, timezone changes and late uploads; displayed metadata matches the approved time policy. | D05 |
| OL-068 | N04 | The product shall recompute derived topic and report results after an accepted attribution correction. | V-068 / T: Correct one mapped event and query affected views after recomputation; results match the corrected evidence and preserve source-event identity. | D08 |

### 5.7 Conditional voices and teaching principles

Accountable function: Learning-content lead.

| ID | Need | Requirement | Verification ID / method and pass criterion | Decision dependency |
| --- | --- | --- | --- | --- |
| OL-069 | N04 | If teacher-voice CoursePacks are included, playback shall use the selected supported teacher voice for uncached narration. | V-069 / T: Select each supported voice and play uncached pack narration; provider request voice identity matches the selection. | D03,D06,D07 |
| OL-070 | N01 | If teacher-voice CoursePacks are included, synthesis failure shall offer the pack’s recorded narration or text without blocking playback. | V-070 / T: Fail selected-voice synthesis; the learner can continue using a labeled recorded/text option without generating another paid attempt. | D03 |
| OL-071 | N04 | Every included teacher shall be correctly identified in the approved blinded distinctiveness evaluation. | V-071 / D: Run the frozen prompt/reviewer protocol; each teacher meets its predeclared recognition rule; record sample size and errors. | D09 |
| OL-072 | N04 | The product shall describe stars, achievements and reports as recorded activity rather than certification of mastery. | V-072 / I: Inspect static copy and generated-report fixtures against the approved prohibited-claim rubric; no unsupported mastery claim passes. | D09 |
| OL-073 | N04 | The product shall preserve earned rewards when the learner misses a study day. | V-073 / T: Advance the reporting clock across missed days without deleting evidence; previously earned rewards remain. | — |

### 5.8 Recovery data-loss bound

Accountable function: Release engineering lead.

| ID | Need | Requirement | Verification ID / method and pass criterion | Decision dependency |
| --- | --- | --- | --- | --- |
| OL-074 | N03 | The release recovery procedure shall limit the interval of lost durable learning data to RPO_MAX. | V-074 / D: Measure the gap between the latest recovered durable event and the incident cut-off; verification is BLOCKED until D10 sets RPO_MAX. | D10 |

## 6. Reverse traceability from needs to requirements

Each OL row points to its user need in section 5; this table provides the reverse lookup. Matching V IDs use the same numeric suffix. Related technical specifications appear in section 3; open decisions and release deliverables appear in section 9.

| Need | Requirements (matching V checks) |
| --- | --- |
| N01 | OL-001–OL-004, OL-070 |
| N02 | OL-005–OL-009, OL-053–OL-055 |
| N03 | OL-010–OL-019, OL-063, OL-074 |
| N04 | OL-020–OL-022, OL-027–OL-035, OL-037, OL-067–OL-069, OL-071–OL-073 |
| N05 | OL-023–OL-026, OL-045–OL-050 |
| N06 | OL-036, OL-038–OL-044 |
| N07 | OL-051–OL-052, OL-056–OL-062, OL-064–OL-066 |

## 7. Verification execution and release acceptance

The V checks in section 5 provide requirement-level coverage. The following integration scenarios supplement those checks; they are not substitutes for individual results. The existing REF-05 lesson/whiteboard regression checklist remains in scope. Execution results for all scenarios are recorded in the release acceptance report.

| Scenario | Setup and action | Integration result / requirement coverage |
| --- | --- | --- |
| E01: First use | A real account with progressively missing model/ASR/TTS configuration; exercise each input path. | Available actions work, the original question survives configuration, and sources stay associated: OL-001–OL-009. |
| E02: Offline recovery | Save a board, disconnect, restart, lose an upload acknowledgement and reconnect twice. | Content and run identity persist; each event is counted once: OL-010–OL-019. |
| E03: Account boundary | Queue work as A, switch to B during capture/provider requests, then reconnect. | No cross-account upload, display, credential use or active capture: OL-014, OL-038–OL-049. |
| E04: Evidence correction | Study an unmapped pack; later correct a mapped event; delete evidence supporting a title. | No invented star; provenance persists; affected counts and title reconcile: OL-027–OL-031, OL-034, OL-068. |
| E05: Time and quota | Use two devices near cap and cross local day/week/month boundaries with late events. | Limits and report metadata follow the approved rules: OL-041–OL-043, OL-067. No Phase 2 quests are tested here. |
| E06: Failure isolation | Fail summary, teacher-comment, voice and optional academy services independently. | Board and factual report paths remain available: OL-003/004, OL-020, OL-037, OL-044, OL-066. |
| E07: Teaching presentation | Run a supported TV lesson with teacher changes and award interruption; repeat with keyboard/reduced motion. | Teacher policy and approved interruption rules hold: OL-021/022, OL-032/033, OL-050, OL-056–OL-059. |
| E08: Upgrade and rollback | Upgrade an existing data fixture, try an unsupported old client, restore a backup and replay pending events. | No incompatible writes or resurrected records; recovery bounds hold: OL-016/017, OL-062–OL-064, OL-074. |
| E09: Quality and performance | Run the approved paired/interleaved corpus on the release candidate and declared environments. | Record separate V results for OL-051–OL-055, OL-060/061, OL-071/072. |
| E10: Optional pack voices | Only if D03 includes the feature: switch supported voices and fail synthesis. | Voice selection and fallback pass OL-069/070; otherwise record a scoped exclusion. |

**Evidence record per V:** requirement revision, candidate revisions, environment, fixture/corpus version, method, inputs/actions, expected result, observed result, Pass/Fail/Blocked/Not run/Not applicable, artifact links, verifier and date. Record a separate result for every supported environment to which the requirement applies. Destructive/cross-account cases use test fixtures; normal flows require actual account/provider/TV evidence. Paid calls require an explicit bounded execution plan, separate from this PRD.

**Baseline-approval gate:** resolve Phase 1 blocking decisions and gap items; approve scope and normative wording; assign named owners; review both languages; pin linked interface/specification versions. Unresolved values cannot become a signed baseline by being labeled “TBD.”

**Release gate:** all included P0 requirements pass on the declared support matrix; conditional P1 disposition is recorded; real-provider and real-TV flows, quality/performance checks, restore drill and monitoring are complete. Publication requires the product owner's recorded decision and the release owner's manifest. Any scope change or accepted exception identifies affected IDs, rationale, risk, approver, follow-up owner and review date; it does not turn a failed test into Pass.

## 8. Product success measurement

Release verification determines whether the product meets requirements. Product metrics determine whether the experience helps users; they do not prove understanding or mastery.

| Metric | Definition | Target / data source |
| --- | --- | --- |
| First-session activation | New eligible accounts reaching a first lesson interaction divided by eligible accounts starting onboarding within the D11 window. | Target pending baseline; separately report generated and prebuilt lessons. |
| Meaningful weekly use | Distinct learner-local dates containing a recorded played segment or practice attempt. | Baseline and improvement target under D11; not page views. |
| Practice participation | Sessions with a recorded attempt divided by eligible learning sessions; separately count hints and task successes. | Session definition and target under D11. |
| Lesson interruption | Sessions abandoned after a ceremony or recoverable failure, under an agreed attribution window. | D11 fixes the window and guardrail; association is not assumed causation. |
| Reward balance | Rewards per learning session alongside practice participation and interruption. | Diagnostic only; more rewards is not automatically better. |
| Reliability and optional usage | Failed saves/syncs, duplicate-credit incidents and admitted background attempts by outcome. | Redacted service events; no claim of exact provider billing without billing evidence. |

D11 defines eligible populations, exclusions, event retention, baseline dates, targets, review owner and review date before the Phase 2 experiment. Instrumentation is ready before Phase 1 publication. Phase 1 performance and quality thresholds are already tracked in OL-051–OL-055/061/071, not replaced by engagement targets.

## 9. Release decisions, required deliverables and change control

The accountable functions below produce written decision records and assign a named owner and completion date. Closure must occur by the listed milestone; decisions with multiple outputs close only when every output is complete. This document does not presume that these decisions have been approved.

| ID | Required decision output | Accountable function / latest closure |
| --- | --- | --- |
| D01 | Approved primary persona, age/grade/language/curriculum coverage, one-profile assumption and classroom scope. | Product management / baseline approval |
| D02 | Exact platform/input/assistive-technology matrix; mobile and Android 8.0 disposition; TV resolution/viewing-distance/text-readability criterion. | Product + QA / baseline approval |
| D03 | Include or exclude OL-069/070; if included, list supported pack/voice combinations and narration-cache identity policy. | Product + content / baseline approval |
| D04 | Data inventory, destinations, visibility, retention periods, deletion/backups scope, teacher memory sharing, adult-assisted setup, presentation mode and sensitive-content response/reporting rules. | Product + privacy/security / baseline approval |
| D05 | Reporting timezone authority, week/month cut-offs, travel/clock-skew treatment and late-event inclusion; explicit calendar/year rules for seasonal awards. | Product + history / baseline approval |
| D06 | Background default/opt-out scope; quota-day reset; what counts as an attempt; failed/cancelled requests, in-flight work, retry limits and per-request spending bounds. | Product + BYOK / baseline approval |
| D07 | Apply the teacher-identity rule in OL-022; ceremony pause/queue behavior and deduplication across reloads/devices; selected-voice switch timing. | Product + client / baseline approval |
| D08 | Topic correction/recomputation triggers and completion bound; taxonomy migration and reward/report treatment. Advanced-enrichment scope is separately due before Phase 3. | Product + content/history / baseline approval for Phase 1 outputs |
| D09 | Versioned math/ambiguity/claim rubric, critical-error definition, paired input corpus, teacher blind-review protocol; baseline revision, sample size, network/cache/model profile, timeout accounting, LAT95_MAX and TV response budget. | Engineering + QA / baseline approval |
| D10 | Compatibility window, manifest, monitored outcomes/thresholds, incident owner, rollout observation period, rollback triggers, recovery timing origin, RTO_MAX and RPO_MAX. | Release + engineering / baseline approval |
| D11 | Metric definitions and collection policy before release; baseline window, engagement targets and experiment review before Phase 2. | Product + analytics / the respective milestone |
| D12 | Quest cadence, boss semantics/evidence, collectibles/purchase policy, exam inclusion and next subject. | Product / before approving the relevant later phase |

**Policy and configuration deliverables required before release:**

| ID | Content to be determined | Completion evidence |
| --- | --- | --- |
| G01 | Retention/deletion by data class, backup handling, adult setup and sensitive-content behavior have no approved policy values. | D04 decisions converted into new atomic OL requirements and V checks. |
| G02 | TV readability, supported assistive technology and interaction-response budgets are not yet specified. | D02/D09 matrix and measurable thresholds converted into OL/V entries. |
| G03 | Ceremony interruption, repeated celebration, calendar behavior and correction completion timing need final rules. | D05/D07/D08 state/rule tables converted into missing OL/V entries; no conflict with existing rules. |
| G04 | Monitoring thresholds, compatibility details and paid-request cost bounds remain undefined. | D06/D10 contracts plus additional OL/V entries where needed. |

These deliverables are required components of release configuration. Until the relevant policies and values are fixed, affected requirements cannot complete acceptance or be released solely because other checks pass. Any additional behavior requires its own requirement identifier and verification criterion.

**Change control:** retain OL IDs permanently; never reuse retired IDs. Split a requirement by adding new IDs and recording the superseded relationship. A change record includes rationale, source, impacted needs/requirements/tests/translations, scope/cost implications, decision owner and approval date. Review links against pinned revisions before baselining. Requirements may move through Defined → Approved → Implemented → Verified → Released, with evidence at each step; Rejected/Deferred are explicit dispositions.

**Release responsibility record:** the product owner confirms scope; the engineering owner confirms feasibility and compatibility; the quality owner confirms verification results; the privacy/security owner confirms data policy; the release owner confirms operational, monitoring and recovery readiness. Each confirmation records the document revision, evidence links and date.

## 10. Later-phase discovery and dependencies

**Phase 2 entry:** Phase 1 released and reviewed, baseline metrics available, D12 choices approved. Quests need eligibility, expiry, replacement, offline and timezone rules. Bosses are recommended to mean practice progress; if they imply demonstrated understanding, move answer-validation evidence forward before implementation. Collectibles need earning, duplicate and removal rules. Monthly exams remain deferred. Finalized novel chapters are the dependency for quoted teacher lines.

**Phase 2 exit:** new phase-specific requirements and checks pass; review engagement alongside quality, spending and interruption; product owner approves further expansion. Phase 2 features are not tested or implied by Phase 1 E scenarios.

**Phase 3 entry:** choose the next subject and reviewed coverage; fix OLL/content dependencies. Separate high-school taxonomy from multivariable-calculus enrichment. Refresh scope/status for stronger learning evidence, more teachers, math interaction improvements, whiteboard interaction and course-pack caching. A course studio and broader classroom ecosystem remain outside these phases unless explicitly added.

## 11. Principal risks and controls

| Risk | Control / remaining uncertainty |
| --- | --- |
| More rewards without more learning | N04, OL-072/073 and practice/interruption metrics; no learning-gain claim without an assessment design. |
| Personal-key background expense | OL-038–OL-044; D06 still blocks final quota and cost semantics. |
| Wrong attribution or missing curriculum coverage | OL-027–OL-029/068; D08 and unmapped-state tests. |
| Shared-screen data exposure | OL-045–OL-050; D04/G01 still require approved policies. |
| Latency and TV compatibility | OL-051/052/056/060–OL-062; D02/D09 and actual-device evidence. |
| Migration, deletion resurrection or failed rollback | OL-016/063/064/074; D10 and restore evidence. |
