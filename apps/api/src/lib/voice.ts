


import { query } from "./db.js";
import { decryptSecret, encryptSecret, maskKey } from "./secrets.js";

const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

async function settingsMap(): Promise<Record<string, string>> {
  try {
    const rows = await query<any>(`select key, value from app_settings where key in ('elevenlabs_api_key','elevenlabs_voice_id')`);
    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.value;
    return m;
  } catch {
    return {};
  }
}

async function cfg(): Promise<{ key: string; voice: string }> {
  const m = await settingsMap();
  let key = process.env.ELEVENLABS_API_KEY ?? "";
  let voice = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE;
  if (m.elevenlabs_api_key) {
    try {
      key = decryptSecret(m.elevenlabs_api_key);
    } catch {}
  }
  if (m.elevenlabs_voice_id) voice = m.elevenlabs_voice_id;
  return { key, voice };
}

export async function voiceStatus() {
  const { key, voice } = await cfg();
  return {
    provider: "elevenlabs",
    configured: !!key,
    tts: !!key,
    stt: !!key,
    voice_id: voice,
    key_masked: key ? maskKey(key) : "",
  };
}

export type VoiceOption = { id: string; name: string; category?: string };

let voicesCache: { key: string; at: number; voices: VoiceOption[] } | null = null;


export async function listVoices(): Promise<{ ok: boolean; voices?: VoiceOption[]; error?: string }> {
  const { key } = await cfg();
  if (!key) return { ok: false, error: "Add your ElevenLabs key first" };
  if (voicesCache && voicesCache.key === key && Date.now() - voicesCache.at < 5 * 60_000) {
    return { ok: true, voices: voicesCache.voices };
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      if (res.status === 401 || /permission|scope/i.test(body)) {
        return {
          ok: false,
          error: "This key can speak but can't list your voice library. Keep the current voice or paste a voice ID.",
        };
      }
      return { ok: false, error: `elevenlabs ${res.status}: ${body}` };
    }
    const j: any = await res.json();
    const voices: VoiceOption[] = (j?.voices ?? [])
      .map((v: any) => ({ id: String(v.voice_id ?? ""), name: String(v.name ?? "Voice"), category: v.category }))
      .filter((v: VoiceOption) => v.id);
    voicesCache = { key, at: Date.now(), voices };
    return { ok: true, voices };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

export async function verifyVoice(): Promise<{ ok: boolean; error?: string }> {
  const { key } = await cfg();
  if (!key) return { ok: false, error: "Add your ElevenLabs key first" };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
    if (!res.ok) {
      return { ok: false, error: res.status === 401 ? "That key was rejected by ElevenLabs" : `elevenlabs ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

export async function clearVoiceSettings() {
  await query(`delete from app_settings where key in ('elevenlabs_api_key','elevenlabs_voice_id')`);
  voicesCache = null;
  return { configured: false };
}

export async function saveVoiceSettings(input: { apiKey?: string; voiceId?: string }) {
  const upsert = (k: string, v: string) =>
    query(`insert into app_settings (key, value, updated_at) values ($1,$2,now()) on conflict (key) do update set value=$2, updated_at=now()`, [k, v]);
  if (input.apiKey && input.apiKey.trim()) await upsert("elevenlabs_api_key", encryptSecret(input.apiKey.trim()));
  if (input.voiceId !== undefined) await upsert("elevenlabs_voice_id", input.voiceId.trim() || DEFAULT_VOICE);
  const { key, voice } = await cfg();
  return { configured: !!key, key_masked: key ? maskKey(key) : "", voice_id: voice };
}

export async function tts(text: string): Promise<{ ok: boolean; audio?: Buffer; contentType?: string; error?: string }> {
  const { key, voice } = await cfg();
  if (!key) return { ok: false, error: "ElevenLabs key not configured" };
  const clean = String(text ?? "").trim().slice(0, 2500);
  if (!clean) return { ok: false, error: "text required" };
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: clean, model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2" }),
    });
    if (!res.ok) return { ok: false, error: `elevenlabs ${res.status}: ${(await res.text()).slice(0, 160)}` };
    return { ok: true, audio: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "audio/mpeg" };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

export async function stt(base64: string, mime = "audio/webm"): Promise<{ ok: boolean; text?: string; error?: string }> {
  const { key } = await cfg();
  if (!key) return { ok: false, error: "ElevenLabs key not configured" };
  let buf: Buffer;
  try {
    buf = Buffer.from(String(base64 ?? ""), "base64");
  } catch {
    return { ok: false, error: "invalid audio" };
  }
  if (!buf.length || buf.length > 15 * 1024 * 1024) return { ok: false, error: "audio must be 1 byte – 15 MB" };
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: mime || "audio/webm" }), "audio.webm");
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!res.ok) return { ok: false, error: `elevenlabs ${res.status}: ${(await res.text()).slice(0, 160)}` };
    const j: any = await res.json();
    return { ok: true, text: String(j?.text ?? "") };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}
