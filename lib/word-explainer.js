import OpenAI from "openai";
import { buildFallbackModels } from "./openai-models.js";

const chunkSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          normalized: { type: "string" },
          partOfSpeechKo: { type: "string" },
          meaningKo: { type: "string" },
          noteKo: { type: "string" },
          statsWords: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["text", "normalized", "partOfSpeechKo", "meaningKo", "noteKo", "statsWords"],
      },
    },
  },
  required: ["entries"],
};

function normalizeStatsWord(word) {
  return String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z'-]+$/g, "");
}

function sanitizeEntries(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];

  return entries
    .map((entry) => ({
      text: String(entry?.text ?? "").trim(),
      normalized: String(entry?.normalized ?? "").trim().toLowerCase(),
      partOfSpeechKo: String(entry?.partOfSpeechKo ?? "").trim(),
      meaningKo: String(entry?.meaningKo ?? "").trim(),
      noteKo: String(entry?.noteKo ?? "").trim(),
      statsWords: Array.isArray(entry?.statsWords)
        ? [...new Set(entry.statsWords.map(normalizeStatsWord).filter(Boolean))]
        : [],
    }))
    .filter((entry) => entry.text && entry.meaningKo);
}

export function createWordExplainer(config) {
  if (!config.openAiApiKey) {
    return {
      isEnabled() {
        return false;
      },
      async explain() {
        throw new Error("OPENAI_API_KEY is not configured.");
      },
    };
  }

  const client = new OpenAI({
    apiKey: config.openAiApiKey,
  });
  const fallbackModels = buildFallbackModels(config.openAiModel);

  async function requestMeaningChunks(model, text) {
    return client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You help Korean students break English text into meaningful learning units. Segment the input in order into chunks that should be learned together. Merge multi-word expressions when they function as one meaning unit, such as 'to be', phrasal verbs, infinitive patterns, fixed expressions, and short collocations. Do not output isolated function words like articles or bare 'to' unless they must stay inside a larger chunk. For each chunk, return a Korean label for its type, an accurate Korean meaning based on the sentence context, and a short Korean note explaining why the words belong together or how they are used. statsWords must contain only core vocabulary words worth counting individually, mainly nouns, main verbs, adjectives, and meaningful adverbs. Exclude articles, pronouns, conjunctions, prepositions, auxiliary verbs, modal verbs, particles, and other function words such as the, a, an, to, of, in, on, at, for, and, but, or, if, although, because, that, who, which, be, do, have, can, will. Return only the requested JSON schema.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                instruction: "Split this English sentence or short passage into meaningful chunks for study and explain each chunk in Korean based on context.",
                text,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meaning_chunks",
          schema: chunkSchema,
          strict: true,
        },
      },
    });
  }

  return {
    isEnabled() {
      return true;
    },
    async explain(text) {
      let lastError;
      let response;

      for (const model of fallbackModels) {
        try {
          response = await requestMeaningChunks(model, text);
          break;
        } catch (error) {
          lastError = error;

          if (error?.status === 403 && error?.code === "model_not_found") {
            continue;
          }

          throw error;
        }
      }

      if (!response) {
        throw lastError ?? new Error("No available model could be used for meaning chunk explanation.");
      }

      const rawText = response.output_text?.trim();

      if (!rawText) {
        throw new Error("The model returned an empty meaning chunk response.");
      }

      return sanitizeEntries(JSON.parse(rawText));
    },
  };
}
