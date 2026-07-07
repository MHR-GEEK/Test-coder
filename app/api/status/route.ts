import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Provider = "ollama" | "openai" | "openrouter" | "groq" | "together" | "openai-compatible";

const PROVIDERS: Record<Provider, { key: string; baseUrl: string; model: string }> = {
  ollama: { key: "OLLAMA_API_KEY", baseUrl: "https://ollama.com", model: "gpt-oss:120b" },
  openai: { key: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  openrouter: { key: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  groq: { key: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  together: { key: "TOGETHER_API_KEY", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  "openai-compatible": { key: "AI_API_KEY", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" }
};
const FALLBACK_OLLAMA_API_KEY = "636e1d145daa4dd38a62b0be2659e3d4.iIF70AWxlFMDl3cFGFk1vyRH";

function providerFromEnv(): Provider {
  const raw = (process.env.AI_PROVIDER || "ollama").toLowerCase();
  if (raw === "openai" || raw === "openrouter" || raw === "groq" || raw === "together" || raw === "openai-compatible" || raw === "ollama") return raw;
  return "ollama";
}

function isLocalOllama(baseUrl: string) {
  return baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost") || baseUrl.includes("::1");
}

export async function GET() {
  const started = Date.now();
  const provider = providerFromEnv();
  const defaults = PROVIDERS[provider];
  const providerPrefix = provider.toUpperCase().replace("-", "_");
  const baseUrl = process.env.AI_BASE_URL || process.env[`${providerPrefix}_BASE_URL`] || process.env.OLLAMA_BASE_URL || defaults.baseUrl;
  const model = process.env.AI_MODEL || process.env[`${providerPrefix}_MODEL`] || process.env.OLLAMA_MODEL || defaults.model;
  const requiredKey = defaults.key;
  const fallbackKey = provider === "ollama" ? FALLBACK_OLLAMA_API_KEY : "";
  const hasApiKey = Boolean(process.env[requiredKey] || process.env.AI_API_KEY || fallbackKey);
  const missing = !hasApiKey && !(provider === "ollama" && isLocalOllama(baseUrl)) ? [requiredKey] : [];

  console.info("[HARYX AI] status route", {
    provider,
    baseUrl,
    model,
    requiredKey,
    hasApiKey,
    missing,
    deployment: process.env.VERCEL ? "vercel" : process.env.NODE_ENV || "local"
  });

  return NextResponse.json({
    provider,
    currentModel: model,
    apiStatus: missing.length ? "missing-configuration" : "configured",
    responseTime: Date.now() - started,
    missing,
    requiredKey,
    hasApiKey,
    baseUrl,
    buildVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    deploymentEnvironment: process.env.VERCEL ? "vercel" : process.env.NODE_ENV || "local",
    lastRequest: new Date().toISOString(),
    memoryUsage: process.memoryUsage()
  });
}
