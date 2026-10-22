// Benchmark-only existing-account login. Solo's default is the newest user,
// which need not be the account explicitly selected for this trial.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loginExistingTrialOwner({ request, owner, registryRoot }) {
  assert.match(owner, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
  const json = async (path, options) => {
    const response = await request(path, options);
    assert.equal(typeof response.status === 'function' ? response.status() : response.status, 200, 'Trial login request failed');
    return response.json();
  };
  const profileFor = async token => {
    const payload = await json('/api/my/profile', { headers: { Authorization: `Bearer ${token}` } });
    return payload.profile?.profile ?? payload.profile ?? payload;
  };
  let { token } = await json('/api/auth/solo', { method: 'POST' });
  let profile = await profileFor(token);
  const explicitExistingLogin = profile.id !== owner;
  if (explicitExistingLogin) {
    assert.ok(registryRoot, 'Solo default differs from selected owner');
    // Refuse missing users/profiles rather than silently onboarding an account.
    const user = JSON.parse(await readFile(join(registryRoot, 'users', `${owner}.json`), 'utf8'));
    const stored = JSON.parse(await readFile(join(registryRoot, 'profiles', `${owner}.json`), 'utf8'));
    assert.equal(user.id, owner); assert.equal(stored.id, owner); assert.equal(stored.username, owner);
    assert.equal(user.name, stored.name); assert.equal(user.email, stored.email);
    assert.ok(typeof user.name === 'string' && user.name && typeof user.email === 'string' && user.email);
    // The legacy explicit-username branch is Octos's idempotent create-or-get
    // login, not its fresh requested_id onboarding branch. Never set default.
    const result = await json('/api/auth/solo/create', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: user.name, username: owner, email: user.email }) });
    assert.equal(result.created, false, 'Existing-account login unexpectedly created a profile');
    assert.equal(result.profile_id, owner); assert.equal(result.user_id, owner);
    token = result.token; profile = await profileFor(token);
  }
  assert.ok(typeof token === 'string' && token);
  assert.equal(profile.id, owner, 'Authenticated owner differs from selected trial account');
  return { token, profile, explicitExistingLogin };
}
