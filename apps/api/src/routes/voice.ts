// Voice endpoints — ElevenLabs behind the control plane. Key never in client.
import { Router } from "express";
import { z } from "zod";
import { voiceStatus, saveVoiceSettings, clearVoiceSettings, listVoices, verifyVoice, tts, stt } from "../lib/voice.js";

export const voiceRouter = Router();

voiceRouter.get("/status", async (_req, res) => {
  try {
    res.json(await voiceStatus());
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});

voiceRouter.put("/settings", async (req, res) => {
  const parsed = z.object({ api_key: z.string().optional(), voice_id: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  try {
    res.json(await saveVoiceSettings({ apiKey: parsed.data.api_key, voiceId: parsed.data.voice_id }));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});

voiceRouter.delete("/settings", async (_req, res) => {
  try {
    res.json(await clearVoiceSettings());
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});

voiceRouter.get("/voices", async (_req, res) => {
  const r = await listVoices();
  if (!r.ok) return res.status(400).json({ error: r.error ?? "Could not load voices" });
  res.json({ voices: r.voices ?? [] });
});

voiceRouter.get("/verify", async (_req, res) => {
  const r = await verifyVoice();
  if (!r.ok) return res.status(400).json({ error: r.error ?? "Key check failed" });
  res.json({ ok: true });
});

voiceRouter.post("/tts", async (req, res) => {
  const parsed = z.object({ text: z.string().min(1).max(2500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const r = await tts(parsed.data.text);
  if (!r.ok || !r.audio) return res.status(501).json({ error: r.error ?? "voice unavailable" });
  res.setHeader("content-type", r.contentType ?? "audio/mpeg");
  res.send(r.audio);
});

voiceRouter.post("/stt", async (req, res) => {
  const parsed = z.object({ audio_base64: z.string().min(1), mime: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const r = await stt(parsed.data.audio_base64, parsed.data.mime);
  if (!r.ok) return res.status(501).json({ error: r.error ?? "voice unavailable" });
  res.json({ text: r.text ?? "" });
});
