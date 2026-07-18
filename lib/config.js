import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function parseDuration(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

export function loadConfig() {
  return {
    port: parseDuration(process.env.PORT, 3000),
    adminUsername: process.env.ADMIN_USERNAME ?? "나건후",
    adminPassword: process.env.ADMIN_PASSWORD ?? "ngh-admin-1234",
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? "",
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
    sessionDurationMs: parseDuration(process.env.ADMIN_SESSION_DURATION_MS, 1000 * 60 * 60 * 12),
    loginWindowMs: parseDuration(process.env.ADMIN_LOGIN_WINDOW_MS, 1000 * 60 * 15),
    loginBlockMs: parseDuration(process.env.ADMIN_LOGIN_BLOCK_MS, 1000 * 60 * 15),
    maxLoginAttempts: parseDuration(process.env.ADMIN_MAX_LOGIN_ATTEMPTS, 5),
    databasePath: process.env.DATA_DB_PATH ?? path.join(rootDir, "data", "word-stats.db"),
    rootDir,
  };
}
