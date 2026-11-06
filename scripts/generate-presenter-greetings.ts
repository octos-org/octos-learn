/**
 * Makes the presenter greeting clips (src/learning/teach/presenter-greetings.ts)
 * in each character's own voice, and writes public/teach-avatars/greetings/manifest.json.
 *
 * Uses your own speech key, read from the environment of this one run; it is
 * never written anywhere. Only lines whose clip is missing or out of date are
 * synthesized, and clips no longer listed are removed.
 *
 *   VOLCANO_TTS_API_KEY=…                 Volcano (seed-tts-2.0 voices)
 *   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=…   Azure AI Speech (US English voices)
 *
 *   pnpm exec vite-node scripts/generate-presenter-greetings.ts -- [--zh volcano] [--en azure|volcano] [--dry-run]
 *
 * Defaults: Chinese lines with Volcano; English lines with Azure when an
 * Azure key is given, otherwise with Volcano.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { GREETINGS_ROOT, GREETINGS_SCHEMA, PRESENTER_GREETINGS, type GreetingClip, type GreetingLocale, type GreetingsManifest } from "../src/learning/teach/presenter-greetings";
import { PRESENTER_AVATARS } from "../src/learning/teach/presenters";

type Provider = GreetingClip["provider"];
const VOLCANO_RESOURCE = "seed-tts-2.0";
const root = join("public", GREETINGS_ROOT);
const manifestPath = join(root, "manifest.json");

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const dryRun = args.includes("--dry-run");
const volcanoKey = process.env.VOLCANO_TTS_API_KEY?.trim();
const azureKey = process.env.AZURE_SPEECH_KEY?.trim(), azureRegion = process.env.AZURE_SPEECH_REGION?.trim();
const providers: Record<GreetingLocale, Provider> = {
  zh: (option("zh") as Provider | undefined) ?? "volcano",
  en: (option("en") as Provider | undefined) ?? (azureKey ? "azure" : "volcano"),
};
for (const [locale, provider] of Object.entries(providers)) {
  if (provider !== "volcano" && provider !== "azure") throw new Error(`Unknown provider for ${locale}: ${provider}`);
  if (provider === "azure" && locale === "zh") throw new Error("The characters have no Chinese Azure voices; use --zh volcano.");
}

function voiceOf(avatarId: string, provider: Provider): string {
  const avatar = PRESENTER_AVATARS.find((entry) => entry.id === avatarId)!;
  return provider === "azure" ? avatar.voices.azure : avatar.voices[VOLCANO_RESOURCE];
}

async function volcano(text: string, voice: string, locale: GreetingLocale): Promise<Buffer> {
  if (!volcanoKey) throw new Error("Set VOLCANO_TTS_API_KEY.");
  const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/unidirectional", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Api-Key": volcanoKey, "X-Api-Resource-Id": VOLCANO_RESOURCE, "X-Api-Request-Id": randomUUID() },
    body: JSON.stringify({ user: { uid: "octos-learn-greetings" }, req_params: { text, speaker: voice, audio_params: { format: "mp3", sample_rate: 24000 },
      additions: JSON.stringify({ explicit_language: locale === "zh" ? "zh-cn" : "en" }) } }),
  });
  if (!response.ok) throw new Error(`Volcano ${response.status} ${response.headers.get("X-Api-Status-Code") ?? ""} for "${text}"`);
  const chunks: Buffer[] = [];
  for (const line of (await response.text()).split(/\r?\n/).filter((entry) => entry.trim())) {
    const chunk = JSON.parse(line) as { code: number; message?: string; data?: string };
    if (chunk.code !== 0 && chunk.code !== 20000000) throw new Error(`Volcano code ${chunk.code} ${chunk.message ?? ""} for "${text}"`);
    if (chunk.data) chunks.push(Buffer.from(chunk.data, "base64"));
  }
  if (!chunks.length) throw new Error(`Volcano returned no audio for "${text}"`);
  return Buffer.concat(chunks);
}

async function azure(text: string, voice: string): Promise<Buffer> {
  if (!azureKey || !azureRegion) throw new Error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.");
  const xml = (value: string) => value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
  const lang = voice.split("-").slice(0, 2).join("-");
  const response = await fetch(`https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": azureKey, "content-type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "octos-learn" },
    body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xml(lang)}"><voice name="${xml(voice)}">${xml(text)}</voice></speak>`,
  });
  if (!response.ok) throw new Error(`Azure ${response.status} for "${text}"`);
  return Buffer.from(await response.arrayBuffer());
}

const previous: GreetingsManifest = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8")) as GreetingsManifest
  : { schema: GREETINGS_SCHEMA, clips: [] };
const clips: GreetingClip[] = [];
const todo: GreetingClip[] = [];
for (const [avatar, byLocale] of Object.entries(PRESENTER_GREETINGS) as Array<[GreetingClip["avatar"], Record<GreetingLocale, readonly string[]>]>) {
  for (const locale of ["zh", "en"] as const) {
    const provider = providers[locale], voice = voiceOf(avatar, provider);
    for (const text of byLocale[locale]) {
      const id = createHash("sha256").update(`${provider}\n${voice}\n${locale}\n${text}`).digest("hex").slice(0, 12);
      const clip: GreetingClip = { avatar, locale, text, file: `${avatar}/${locale}-${id}.mp3`, provider, voice };
      clips.push(clip);
      const kept = previous.clips.some((entry) => entry.file === clip.file) && existsSync(join(root, clip.file));
      if (!kept) todo.push(clip);
    }
  }
}

const characters = todo.reduce((sum, clip) => sum + clip.text.length, 0);
console.log(`${clips.length} lines; ${todo.length} to synthesize (${characters} characters): zh with ${providers.zh}, en with ${providers.en}.`);
if (dryRun) { for (const clip of todo) console.log(`  ${clip.file}  ${clip.voice}  ${clip.text}`); process.exit(0); }

for (const clip of todo) {
  const audio = clip.provider === "azure" ? await azure(clip.text, clip.voice) : await volcano(clip.text, clip.voice, clip.locale);
  await mkdir(join(root, clip.avatar), { recursive: true });
  await writeFile(join(root, clip.file), audio);
  console.log(`  made ${clip.file} (${Math.round(audio.length / 1024)} KB)  ${clip.text}`);
}

// Clips no longer listed go away, so the folder holds only what the manifest names.
const listed = new Set(clips.map((clip) => clip.file));
for (const avatar of existsSync(root) ? await readdir(root, { withFileTypes: true }) : []) {
  if (!avatar.isDirectory()) continue;
  for (const file of await readdir(join(root, avatar.name))) {
    if (!listed.has(`${avatar.name}/${file}`)) { await rm(join(root, avatar.name, file)); console.log(`  removed ${avatar.name}/${file}`); }
  }
}
await mkdir(root, { recursive: true });
await writeFile(manifestPath, `${JSON.stringify({ schema: GREETINGS_SCHEMA, clips }, null, 2)}\n`);
console.log(`Wrote ${manifestPath}.`);
