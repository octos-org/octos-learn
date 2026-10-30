# Chinese and English internationalization

## Scope and branches

This task changes application language and language propagation only. All affected repositories started on `codex/complete-i18n` from freshly fetched `origin/main`:

| Repository | Starting main | Implementation |
| --- | --- | --- |
| octos-learn | `f1f82daf88f61ea5bdad153da6036c7c9e456e34` | Persistent preference, header switches, presentation catalogs, service adapters, language-aware generation and speech |
| learning-coach | `93a583b` | `b8c700e`, `cf00485`: generation/compiler language and selection assistance |
| octos-lesson-language | `c4e891f` | `8e11d8d43a16a45328664df8b40f55aab0ee1092`: in-place board/ink UI language |

The OLL branch was pushed to its original repository after explicit user approval. The frontend pins that complete Git commit; no local archive or dependency link remains. The frontend and Learning Coach commits remain local. Nothing has been merged or deployed publicly.

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
| Frontend full unit suite | 159 files, 1405 tests passed |
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

A free timing check compared 50 interleaved pairs against the main-branch Learning Coach bundle, after five warm-up pairs, using identical deterministic unit-circle model responses. Both versions made 3 model calls per course. Time to first compiled playable prefix had p50 **0.688 ms baseline / 0.759 ms candidate** (about **+0.071 ms**). See [raw timing evidence](i18n/deterministic-performance.json). This is a local compilation measurement, not end-to-end supplier performance. It does not establish the live p50 speed gate or voice quality. No real paid course generation, TTS synthesis, Android device test, public deployment, or public upgrade was performed.

Provider semantics were checked against the official [unidirectional HTTP speech documentation](https://docs.volcengine.com/docs/DoubaoVoice/HTTPChunkedSSEUnidirectionalStreaming-V3?lang=zh) and [speech-synthesis parameter documentation](https://docs.volcengine.com/docs/lake-ai-service/speech-synthesis?lang=en). Specific voice/resource language quality still requires listening to real provider output.
