import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loginExistingTrialOwner } from './lib/learning-performance-auth.mjs';

test('matching solo owner uses its existing login directly', async () => {
  const calls = [];
  const request = async path => { calls.push(path); return Response.json(path.endsWith('/solo') ? { token: 'synthetic' } : { id: 'selected' }); };
  const result = await loginExistingTrialOwner({ request, owner: 'selected' });
  assert.equal(result.explicitExistingLogin, false); assert.equal(calls.length, 2);
});

test('different default cannot create an account when existing files are missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'trial-auth-')); const calls = [];
  const request = async path => { calls.push(path); return Response.json(path.endsWith('/solo') ? { token: 'synthetic' } : { id: 'other' }); };
  try {
    await assert.rejects(loginExistingTrialOwner({ request, owner: 'selected', registryRoot: root }), /ENOENT/);
    assert.deepEqual(calls, ['/api/auth/solo', '/api/my/profile']);
  } finally { await rm(root, { recursive: true }); }
});

test('existing-account login pins identity, omits onboarding/default changes and verifies the new token', async () => {
  const root = await mkdtemp(join(tmpdir(), 'trial-auth-'));
  const record = { id: 'selected', username: 'selected', name: 'Selected', email: 'selected@solo.local' };
  for (const dir of ['users', 'profiles']) { await mkdir(join(root, dir)); await writeFile(join(root, dir, 'selected.json'), JSON.stringify(record)); }
  const calls = [];
  const request = async (path, options) => {
    calls.push(path);
    if (path.endsWith('/solo')) return Response.json({ token: 'synthetic-other' });
    if (path.endsWith('/create')) {
      assert.deepEqual(JSON.parse(options.body), { name: 'Selected', username: 'selected', email: 'selected@solo.local' });
      return Response.json({ token: 'synthetic-selected', created: false, profile_id: 'selected', user_id: 'selected' });
    }
    return Response.json({ id: options.headers.Authorization === 'Bearer synthetic-selected' ? 'selected' : 'other' });
  };
  try {
    const result = await loginExistingTrialOwner({ request, owner: 'selected', registryRoot: root });
    assert.equal(result.explicitExistingLogin, true); assert.equal(result.profile.id, 'selected'); assert.equal(calls.length, 4);
  } finally { await rm(root, { recursive: true }); }
});
