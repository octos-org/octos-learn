# Chinese and English internationalization

## Scope and branches

This task changes application language and language propagation only. All affected repositories started on `codex/complete-i18n` from freshly fetched `origin/main`:

| Repository | Starting main | Implementation |
| --- | --- | --- |
| octos-learn | `f1f82daf88f61ea5bdad153da6036c7c9e456e34` | Persistent preference, header switches, presentation catalogs, service adapters, language-aware generation and speech |
| learning-coach | `93a583b` | `b8c700e`, `cf00485`: generation/compiler language and selection assistance |
| octos-lesson-language | `c4e891f` | `8e11d8d43a16a45328664df8b40f55aab0ee1092`: in-place board/ink UI language |

The OLL branch was pushed to its original repository after explicit user approval. The frontend pins that complete Git commit; no local archive or dependency link remains. After the user subsequently authorized pushing the remaining repositories, all three `codex/complete-i18n` branches were pushed to their original remotes with their individual commits preserved. Nothing has been merged or deployed publicly.

The normal local frontend is HTTPS 5173 and Octos is on loopback 50080. The existing `yy` profile was used. Its Learning Coach installation was backed up to `~/.octos/backups/learning-coach-before-i18n-20261030T042539Z`, updated with the official installer, and its locked dependencies restored. Installed `manifest.json`, `main`, and `lesson-plan.js` match the repository by SHA-256. No account, credential, primary model, voice choice, or analysis setting was changed.

## Behavior

- Supported interface locales: `zh-CN`, `en-US`. First use follows browser language; other browser languages use English. An explicit choice is stored in `octos-locale`, survives refresh, and synchronizes between tabs. The document language follows it.
- Header switches are available on the academy pages, settings, setup, login, and whiteboard. Components and the whiteboard keep their identity; switching does not restart the lesson, rebuild the ink editor, discard input, or reset the camera.
- A new course keeps the language selected when its request was submitted, including while admission checks, image uploads, or skill execution are pending. Switching later affects subsequent requests. Learner text and attachments remain unchanged.
- New lesson titles, narration, board text, hints, feedback, and explanations receive the selected output-language instruction on the existing generation calls. Compiler-owned fallback teaching text uses the lesson language. No translation model call is added.
- Each narration uses its course's stored language. Current audio continues through an interface switch; upcoming and prewarmed clips carry their own course language. Cache identity includes language and voice. Existing packaged recordings are reused, and historical courses retain their original content and language.
- The existing BYOK speech path, voice selection, failure handling, and text fallback remain in place. English/Chinese speech hints are sent through `req_params.additions` on that same synthesis request. Mixed Chinese quotations in English text keep automatic language detection. No extra synthesis request is added by switching the interface.
- Program-owned course-directory names/descriptions, teacher descriptions and fixed lines, achievements/titles, map labels, reports, settings, errors, tooltips, accessibility labels, and the boot-failure message are localized. Known saved title names are translated at display time; stored IDs and earning rules remain unchanged.
- All 567 atlas topics have three English starter questions, 1701 questions total, alongside the original Chinese bank. Banks load lazily by locale. A late download cannot replace the current language, and an already requested draft keeps its submission language. Mathematical examples, units and yuan/jiao/fen remain; explicit Chinese numeral/tally lessons retain their quoted characters. English translations have not had an independent content review.
- Weekly-comment jobs include the selected language in their facts, but their existing job identity and daily quota stay unchanged. Switching language does not create a second comment job. If a stored comment belongs to the other language, the report uses localized fixed teacher lines instead.
- User-authored questions, memories, historical lesson content, arbitrary names, provider/model IDs, formulas, and protocol identifiers are preserved. Internal model-classification instructions and old teacher aliases are intentionally retained where translating them would change behavior.

## Scan and maintenance

The initial inventory covered 220 frontend source files. The final catalog has 2252 matching Chinese/English message pairs, plus the separate topic-name/question banks and OLL's own control-label table.

`npm run check:i18n` scans the 65 production JSX files for untranslated visible literals, including literal branches inside JSX expressions, and checks message-key parity and untranslated Han characters in English resources. Brand names, technical identifiers/units and email/URL examples have a small explicit allowlist. This guard supplements review; it does not claim to classify arbitrary API data or dynamically assembled text. Resource tests also check interpolation parity. Adding new labels requires updating both message files.

`localizedCatalog` supplies lazy translated presentation fields while preserving catalog IDs and plain-object/structured-clone compatibility. Runtime control translation binds explicit UI nodes rather than scanning or replacing authored board text. Async product status messages retain a bounded in-memory translation recipe so existing errors can follow a switch.

## Verification

| Check | Result |
| --- | --- |
| Frontend full unit suite | 159 files, 1407 tests passed |
| Final academy/course-directory checks | 35 tests passed, including saved-title translation without re-fetching |
| Frontend TypeScript and production build | Passed |
| Frontend lint | 0 errors; 38 existing warnings remain |
| Learning Coach full suite | 227 tests passed |
| OLL full suite | 358 tests passed |
| Learning-history/product service suite | 96 tests passed |
| Visible-label/resource guard | Passed, 65 UI files / 2252 message pairs |
| Normal local browser | Desktop and 390px mobile width; no page errors |

The browser verified language persistence, bilingual settings search, unchanged search input value and DOM identity, and switch visibility on mobile. See [browser result](i18n/browser-check.json). Screenshots remain in the ignored `.local-dev/i18n/` directory; they include the existing account's learning data and are not committed.

Targeted regressions cover original question text, request-language pinning before asynchronous admission, one skill submission, stable board/ink instances, unchanged current audio, language-specific prefetch reuse, and ASR capacity decisions independent of translated messages. English compilation is compared with Chinese compilation across course fixtures for unchanged numerical operations and authored content. Model-capture tests confirm the language instruction arrives on the first existing call.

A free timing check compared 50 interleaved pairs against the main-branch Learning Coach bundle, after five warm-up pairs, using identical deterministic unit-circle model responses. Both versions made 3 model calls per course. Time to first compiled playable prefix had p50 **0.688 ms baseline / 0.759 ms candidate** (about **+0.071 ms**). See [raw timing evidence](i18n/deterministic-performance.json). This is a local compilation measurement, not end-to-end supplier performance. It does not establish the live p50 speed gate or voice quality. The initial authorized attempt stopped before any supplier send. Subsequent authorized resumption completed two real courses and two first-narration clips, described below. No Android device test, public deployment, or public upgrade was performed.

Provider semantics were checked against the official [unidirectional HTTP speech documentation](https://docs.volcengine.com/docs/DoubaoVoice/HTTPChunkedSSEUnidirectionalStreaming-V3?lang=zh) and [speech-synthesis parameter documentation](https://docs.volcengine.com/docs/lake-ai-service/speech-synthesis?lang=en). Both real clips were later synthesized and played with the existing teacher voice; subjective pronunciation and voice quality still require human listening.

## Follow-up verification and commit history

The initial delivery summary listed only the newest commit in each repository. It did not describe the full history: at that point there were 12 frontend commits, 2 Learning Coach commits, and 1 OLL commit, with no squash. See the [complete implementation commit list](i18n/commit-history.json). OLL's single 194-line addition / 45-line removal commit introduced one shared explicit-control binding mechanism, applied it to plot/geometry/scene/ink controls, and tested its in-place language updates.

The implementation, automated checks, real course text inspection and first speech synthesis/browser playback checks are complete. Human listening quality and a statistically sufficient live timing comparison remain unverified.

A follow-up browser sweep visited 15 actual pages in both languages: hall, atlas, achievements, records, weekly/monthly records, all eight settings tabs, and setup. It found no page errors or horizontal overflow, and no remaining Chinese-owned control label in the English UI. Chinese historical question/session text was retained. See the [sanitized page audit](i18n/page-audit.json); private screenshots and raw labels remain local. No supplier call was made.


## Authorized language acceptance attempt and follow-up fixes

The user authorized at most 2 real courses, 6 total model HTTP attempts including retries, and 2 first-narration speech requests, with model USD 5 and speech CNY 2 caps, stopping on failure. Free supplier simulations exposed two real i18n audio regressions before live sends: clearing prewarm-language state restarted current audio (`279e0a6`), and translating a voice display name invalidated speaker caches (`4178778`). Both were fixed and tested separately. These changes add no model or synthesis request.

The full frontend suite now passes **1407 tests in 159 files**. The production build passes; lint remains at 0 errors / 38 existing warnings. The bounded acceptance controls now pass **14 free tests**, including persistence, simultaneous reservations, duplicate speech, lost responses, wrong language/voice, supplier failure, and session replacement.

On 2026-10-30 UTC, the real attempt stopped because the new-board startup replaced the session initially read from browser storage. The runner rejected the actual course invocation against that stale session, before forwarding it. There were **0 model supplier attempts, 0 speech supplier requests, and 0 supplier charges**. No course reached the backend; read-only checks found no generation jobs in either involved session. The failed attempt, reserved course slot and ledger remain intact; no automatic resubmission occurred.

Runner fix `8176582` verifies the language/question and opened session on the actual wire invocation, then atomically reserves that session before forwarding. The subsequent free browser fixture passed Chinese and English generation, first matching non-silent test audio, and switching without replacing board nodes or restarting audio. It uses a fixed test tone and establishes neither real speech language nor voice quality. See the [sanitized results](i18n/language-acceptance-results.json).

The original profile route and network setting were restored, model and speech credential revisions and the teacher choice were verified unchanged, the normal local backend was restarted, and the budget gateway was closed. At that point real text/voice acceptance was incomplete. The user subsequently authorized resumption, and later authorized continuing only English after the read-only monitor failure described below. All cumulative counts and failed records were retained.


## Real course and speech results after authorized resumption

The existing account submitted the identical original Chinese question in both interface languages. Both real generation jobs succeeded. Full final course files were inspected: Chinese titles, board labels, narration, practice, hints and summary use Chinese; the English course uses English throughout, with **zero Han-character strings in its complete generated artifact**. The original question remains Chinese on the board, and the example `y=2x+1`, intercept `(0,1)` and slope calculation `(3-1)/(1-0)=2` remain correct. The selected language was present on the first existing model call; no translation turn was added.

| Actual sample | Model HTTP attempts | First-narration requests | First visible course | First matching audible playback |
| --- | --- | --- | --- | --- |
| Chinese | 2 | 1 | 12.387 s | 16.820 s |
| English | 2 | 1 | 12.773 s | 15.794 s |

Both synthesis requests used the existing teacher's `zh_female_zhixingnv_uranus_bigtts` speaker and `seed-tts-2.0` resource. The same request carried `explicit_language: zh-cn` or `en`; both returned real MP3 audio. The actual bytes were hashed, decoded and detected as non-silent playback in the browser. The saved clips are 15.864 s Chinese and 9.216 s English. **The assistant cannot directly hear audio; subjective pronunciation, spoken-language recognition and voice-quality listening are pending human review.** No ASR or external transcription call was used to claim a listening result.

The independent monitor initially lacked `auxiliary.rest_to_ws.v1`, so its final file query failed after Chinese generation and playback had already succeeded. Paid calls paused. The query was fixed (`d5ca8d4`), and read-only inspection confirmed the terminal successful job and the two model trace attempts. The user explicitly authorized only the remaining English sample. The runner then completed the reviewed Chinese slot and ran English on the **same persistent ledger**, retaining every prior expense (`61a1584`). Chinese was never regenerated and the original stopped report remains unchanged.

Review also found that the first version of the audio probe stopped counting after initial readiness. Fix `713a35d` counts later matching starts; a deliberate replay control now detects the second start while preserving the original first-play timestamp. The English real sample used this corrected counter and retained the same two board nodes and one matching audio start through switching to Chinese. The real Chinese sample's old audio-replay counter is inconclusive; shared-hook regression tests and the corrected free Chinese fixture cover the behavior, without claiming that the earlier counter proved it.

Cumulative usage is **2 actual courses, 4 model HTTP attempts including retries, 2 first-narration supplier requests**, with no ordinary model turn, ASR, Jev, report-comment or topic-maintenance invocation. The gateway recorded 9366 input tokens and 3945 output/thinking tokens. At the checked [Google standard rates](https://ai.google.dev/gemini-api/docs/pricing), the model estimate is **USD 0.02181825**, not a provider invoice. Conservative retained reservations are **USD 2.80 for models and CNY 0.2528 for speech**, below the approved USD 5 / CNY 2 caps. Speech reservations use a deliberately conservative UTF-8 byte bound against the official [speech pricing](https://docs.volcengine.com/docs/doubao-voice/billing-instructions?lang=zh); they are not actual billed charges.

The normal local model route and network setting have been restored. Speech credential revisions, saved voice and teacher choice match the pre-trial metadata, both generation jobs are terminal, the normal backend is running on port 50080, and the budget gateway is closed. Raw courses, traces, screenshots, clips, authorization records and ledgers remain private under ignored `.local-dev/i18n-live/`; only sanitized results are committed. See [language acceptance results](i18n/language-acceptance-results.json).

These two samples establish actual language propagation, generation, synthesis and playback. They do not establish the repository's live p50 speed gate, broader provider/voice coverage or Android-device behavior. No merge or public deployment was performed.
