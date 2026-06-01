import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { log } from "../logger.js";

// Default model: llama-3.3-70b-versatile — fast, free, excellent at structured JSON.
// Override with GROQ_MODEL env var if needed (e.g. "mixtral-8x7b-32768").
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

/**
 * Generic AI gateway wrapper using Vercel AI SDK with Groq.
 * Returns raw text; caller performs JSON parsing and healing.
 * @param {Array<{role:string, content:string}>} messages
 * @param {{ model?: string, maxTokens?: number }} [options]
 * @returns {Promise<string>}
 */
export async function askAI(messages, { model = DEFAULT_MODEL, maxTokens = 2048 } = {}) {
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    log("AI key missing: set GROQ_API_KEY in .env — get a free key at https://console.groq.com");
    return "";
  }

  const client = createGroq({ apiKey });

  // Split system message from the rest for Vercel AI SDK
  const system = messages.find(m => m.role === "system")?.content;
  const prompt = messages.filter(m => m.role !== "system").map(m => m.content).join("\n");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { text } = await generateText({
        model: client(model),
        ...(system ? { system } : {}),
        prompt,
        maxTokens,
        temperature: 0.7,
      });
      return text;
    } catch (err) {
      log(`AI request failed (attempt ${attempt}): ${err.message}`);
      if (attempt === 2) throw err;
    }
  }
}
