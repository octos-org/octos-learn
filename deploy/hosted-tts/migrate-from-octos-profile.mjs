#!/usr/bin/env node
import { readFileSync, writeFileSync, chmodSync } from "node:fs";

const [, , profilePath, destination] = process.argv;
if (!profilePath || !destination) {
  console.error("usage: migrate-from-octos-profile.mjs <profile.json> <hosted-tts.env>");
  process.exit(2);
}

const profile = JSON.parse(readFileSync(profilePath, "utf8"));
const cloud = profile?.config?.tts_cloud || {};
const appid = required("tts_cloud.appid", cloud.appid);
const token = required("env_vars.VOLC_TTS_TOKEN", profile?.config?.env_vars?.VOLC_TTS_TOKEN);
const values = {
  HOST: "127.0.0.1",
  PORT: "50081",
  OCTOS_BASE_URL: "http://127.0.0.1:50080",
  DATABASE_PATH: "/var/lib/octos-learn/hosted-tts/usage.sqlite",
  VOLC_TTS_APPID: appid,
  VOLC_TTS_TOKEN: token,
  VOLC_TTS_CLUSTER: optional(cloud.cluster, "volcano_tts"),
  VOLC_TTS_VOICE: optional(cloud.voice, "BV001_streaming"),
  VOLC_TTS_ENCODING: optional(cloud.encoding, "mp3"),
  HOSTED_TTS_MAX_CONCURRENT: "2",
  HOSTED_TTS_QUEUE_WAIT_MS: "3000",
  HOSTED_TTS_REQUESTS_PER_MINUTE: "60",
};

const body = Object.entries(values).map(([key, value]) => `${key}=${safe(value)}`).join("\n") + "\n";
writeFileSync(destination, body, { mode: 0o600, flag: "w" });
chmodSync(destination, 0o600);

function required(name, value) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`source profile is missing ${name}`);
  return result;
}

function optional(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safe(value) {
  if (/[\r\n\0]/u.test(value)) throw new Error("TTS configuration contains an unsafe newline or NUL");
  // systemd EnvironmentFile accepts double-quoted values with backslash escapes.
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
