// Test-only adapters. No application import or supplier transport default.
import assert from 'node:assert/strict';
import { createFirstSpeechGate, createModelBudgetGateway } from './learning-performance-control.mjs';

export function createLanguageSpeechGate({ ledger, sampleId, text, language, speaker, send }) {
  assert.ok(['zh-CN', 'en-US'].includes(language));
  assert.ok(typeof speaker === 'string' && speaker);
  const additions = language === 'zh-CN' ? JSON.stringify({ explicit_language: 'zh-cn' })
    : /[\p{Script=Han}]/u.test(text) ? undefined : JSON.stringify({ explicit_language: 'en' });
  const gate = createFirstSpeechGate(ledger, sampleId, text, clean => send({
    ...clean, payload: { ...clean.payload, req_params: { ...clean.payload.req_params,
      speaker, ...(additions === undefined ? {} : { additions }) } },
  }));
  return async body => {
    assert.equal(body.payload?.req_params?.speaker, speaker, 'Unexpected course voice');
    assert.equal(body.payload.req_params.additions, additions, 'Unexpected course language hint');
    const { additions: _reviewed, ...params } = body.payload.req_params;
    // Preserve the original gate's saved-resource check; the teacher voice is
    // verified separately above and restored on the actual outgoing request.
    return gate({ ...body, payload: { ...body.payload, req_params: { ...params, speaker: ledger.plan.voice } } });
  };
}

export function createLanguageModelGateway({ ledger, activeSample, upstreamFetch, observe = () => undefined }) {
  const state = { halted: false, supplier_attempts: 0, requests: [] };
  const gateway = createModelBudgetGateway({ ledger, activeSample,
    reviewRequest(body, sampleId) {
      assert.equal(state.halted, false, 'Earlier supplier request failed');
      const sample = ledger.plan.samples.find(item => item.id === sampleId);
      assert.ok(sample && ['zh-CN', 'en-US'].includes(sample.language));
      const texts = body.contents.flatMap(item => item.parts.map(part => part.text));
      const context = texts.flatMap(text => { try { const value = JSON.parse(text); return value.course_context ? [value.course_context] : []; } catch { return []; } });
      // The initial request must contain the original question and locale.
      const first = !state.requests.some(item => item.sample_id === sampleId);
      if (first) {
        assert.ok(context.some(item => item.language === sample.language));
        assert.ok(texts.some(text => text.includes(sample.prompt)));
        if (sample.language === 'en-US') assert.ok(body.systemInstruction?.parts.some(part => /Output language: English/.test(part.text)));
      }
      const row = { sample_id: sampleId, first, language: sample.language, original_request_present: texts.some(text => text.includes(sample.prompt)), english_output_rule: body.systemInstruction?.parts.some(part => /Output language: English/.test(part.text)) ?? false };
      state.requests.push(row); observe(row);
    },
    upstreamFetch: async (...args) => {
      if (state.halted) throw Error('Trial stopped');
      state.supplier_attempts++;
      try {
        const response = await upstreamFetch(...args);
        if (!response.ok) state.halted = true;
        return response;
      } catch (error) { state.halted = true; throw error; }
    },
  });
  return { ...gateway, state };
}
