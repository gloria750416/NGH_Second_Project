import OpenAI from "openai";
import { buildFallbackModels } from "./openai-models.js";

const grammarSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string" },
    translation: { type: "string" },
    meaning: { type: "string" },
    sentenceBreakdown: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sentence: { type: "string" },
          translation: { type: "string" },
        },
        required: ["sentence", "translation"],
      },
    },
    sentenceType: { type: "string" },
    tense: { type: "string" },
    subject: { type: "string" },
    verb: { type: "string" },
    verbDetail: { type: "string" },
    objectOrComplement: { type: "string" },
    modifiers: {
      type: "array",
      items: { type: "string" },
    },
    connector: { type: "string" },
    clauseDetail: { type: "string" },
    patternDetail: { type: "string" },
    structureNote: { type: "string" },
    learningTips: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "overview",
    "translation",
    "meaning",
    "sentenceBreakdown",
    "sentenceType",
    "tense",
    "subject",
    "verb",
    "verbDetail",
    "objectOrComplement",
    "modifiers",
    "connector",
    "clauseDetail",
    "patternDetail",
    "structureNote",
    "learningTips",
  ],
};

function sanitizeAnalysis(payload) {
  const overview = String(payload?.overview ?? "").trim();
  const translation = String(payload?.translation ?? "").trim();
  const meaning = String(payload?.meaning ?? "").trim();
  const structureNote = String(payload?.structureNote ?? "").trim();
  const sentenceBreakdown = Array.isArray(payload?.sentenceBreakdown)
    ? payload.sentenceBreakdown
        .map((entry) => ({
          sentence: String(entry?.sentence ?? "").trim(),
          translation: String(entry?.translation ?? "").trim(),
        }))
        .filter((entry) => entry.sentence || entry.translation)
    : [];

  return {
    overview,
    translation: translation || meaning || overview || structureNote,
    meaning: meaning || translation || overview || structureNote,
    sentenceBreakdown,
    sentenceType: String(payload?.sentenceType ?? "").trim(),
    tense: String(payload?.tense ?? "").trim(),
    subject: String(payload?.subject ?? "").trim(),
    verb: String(payload?.verb ?? "").trim(),
    verbDetail: String(payload?.verbDetail ?? "").trim(),
    objectOrComplement: String(payload?.objectOrComplement ?? "").trim(),
    modifiers: Array.isArray(payload?.modifiers) ? payload.modifiers.map((item) => String(item).trim()).filter(Boolean) : [],
    connector: String(payload?.connector ?? "").trim(),
    clauseDetail: String(payload?.clauseDetail ?? "").trim(),
    patternDetail: String(payload?.patternDetail ?? "").trim(),
    structureNote,
    learningTips: Array.isArray(payload?.learningTips) ? payload.learningTips.map((item) => String(item).trim()).filter(Boolean) : [],
  };
}

export function createGrammarAnalyzer(config) {
  if (!config.openAiApiKey) {
    return {
      isEnabled() {
        return false;
      },
      async analyze() {
        throw new Error("OPENAI_API_KEY is not configured.");
      },
    };
  }

  const client = new OpenAI({
    apiKey: config.openAiApiKey,
  });
  const fallbackModels = buildFallbackModels(config.openAiModel);

  async function requestAnalysis(model, sentence) {
    return client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You analyze English sentences or short passages for Korean learners. Return concise Korean explanations in the requested JSON schema. translation must be a natural Korean overall translation or passage-level summary and must never be empty. meaning must explain the overall message, not grammar structure, and must never be empty. sentenceBreakdown must list each input sentence in order with its Korean translation. If the input has only one sentence, include one item. tense must explain the main tense in Korean. verbDetail must explain the verb form or verb pattern in Korean. clauseDetail must explain how the clauses connect in Korean. patternDetail must explain the sentence pattern in Korean, such as SV, SVC, SVO, or a clause-based pattern. structureNote must stay focused on grammar structure. When explaining a grammar point, use the actual phrase from the input as evidence whenever possible. For example, if there is a relative adverb or relative clause, directly mention the exact part such as 'where he lives' and explain what it modifies and why. clauseDetail, patternDetail, and structureNote should prefer explanation with concrete quoted examples from the input instead of abstract labels only. learningTips must contain 2 or 3 short Korean study tips. If multiple sentences are provided, base the grammar fields on the first sentence unless another sentence is clearly the main focus.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyze this English sentence or short passage and extract its main grammar parts: ${sentence}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "grammar_analysis",
          schema: grammarSchema,
          strict: true,
        },
      },
    });
  }

  return {
    isEnabled() {
      return true;
    },
    async analyze(sentence) {
      let lastError;
      let response;

      for (const model of fallbackModels) {
        try {
          response = await requestAnalysis(model, sentence);
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
        throw lastError ?? new Error("No available model could be used for grammar analysis.");
      }

      const rawText = response.output_text?.trim();

      if (!rawText) {
        throw new Error("The model returned an empty grammar analysis response.");
      }

      return sanitizeAnalysis(JSON.parse(rawText));
    },
  };
}
