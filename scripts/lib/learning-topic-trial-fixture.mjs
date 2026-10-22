import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export const listenLocal = async (server, port = 0) => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}`;
};
export const closeLocal = async server => { if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };

export async function topicOctosFixture({ binary, root, gateway, plan }) {
  const spare = createServer(); const base = await listenLocal(spare); await closeLocal(spare);
  const config = join(root, 'fixture-config.json'), data = join(root, 'octos');
  const log = await open(join(root, 'fixture-octos.log'), 'a', 0o600);
  const embedding = createServer((request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ index: 0, embedding: Array(1536).fill(0.01) }] })); });
  const embeddingBase = await listenLocal(embedding); let child;
  const stop = async () => {
    if (child?.exitCode === null && child.signalCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  };
  const start = async () => {
    child = spawn(binary, ['serve', '--host', '127.0.0.1', '--port', new URL(base).port, '--data-dir', data, '--config', config, '--solo'], {
      cwd: root, env: { PATH: process.env.PATH, TMPDIR: '/private/tmp', TOPIC_FIXTURE_KEY: 'synthetic-not-real', OCTOS_MEMORY_REFRESH_ENABLED: '0', OCTOS_NO_MODEL_DOWNLOAD: '1' }, stdio: ['ignore', log.fd, log.fd] });
    for (let i = 0; i < 200; i++) {
      assert.equal(child.exitCode, null, 'Fixture Octos exited');
      try { if ((await fetch(`${base}/api/auth/status`)).ok) return; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Fixture Octos startup timed out');
  };
  try {
    await writeFile(config, JSON.stringify({ provider: 'gemini', model: plan.model, base_url: `${gateway}/v1beta`, api_key_env: 'TOPIC_FIXTURE_KEY',
      env_vars: { TOPIC_FIXTURE_KEY: 'synthetic-not-real' }, memory: { refresh: { enabled: false } },
      embedding: { provider: 'openai', base_url: `${embeddingBase}/v1`, api_key_env: 'TOPIC_FIXTURE_KEY', auto_download: false } }), { mode: 0o600 });
    await start();
    const created = await fetch(`${base}/api/auth/solo/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: plan.owner, name: 'Topic fixture', email: 'topic@solo.local' }) });
    assert.equal(created.status, 200);
    const path = join(data, 'profiles', `${plan.owner}.json`), profile = JSON.parse(await readFile(path, 'utf8'));
    profile.config.llm = { primary: { family_id: 'google', model_id: plan.model, route: { api_type: 'gemini', base_url: `${gateway}/v1beta`, api_key_env: 'TOPIC_FIXTURE_KEY' } }, fallbacks: [] };
    profile.config.env_vars = { TOPIC_FIXTURE_KEY: 'synthetic-not-real' };
    await writeFile(path, JSON.stringify(profile), { mode: 0o600 }); await stop(); await start();
    return { base, close: async () => { await stop(); await closeLocal(embedding); await log.close(); } };
  } catch (error) { await stop(); await closeLocal(embedding); await log.close(); throw error; }
}
