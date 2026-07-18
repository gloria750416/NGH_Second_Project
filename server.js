import { createApp } from "./app.js";
import { createAdminStore } from "./lib/admin-store.js";
import { loadConfig } from "./lib/config.js";
import { createGrammarAnalyzer } from "./lib/grammar-analyzer.js";
import { createSecurity } from "./lib/security.js";
import { createStatsStore } from "./lib/stats-store.js";
import { createSupabaseServerClient } from "./lib/supabase.js";
import { createWordExplainer } from "./lib/word-explainer.js";

const config = loadConfig();
const supabase = createSupabaseServerClient(config);
const adminStore = createAdminStore({ supabase });
const statsStore = await createStatsStore({
  databasePath: config.databasePath,
  supabase,
});
const security = createSecurity(config, { adminStore });
const grammarAnalyzer = createGrammarAnalyzer(config);
const wordExplainer = createWordExplainer(config);
const app = createApp({ config, statsStore, security, grammarAnalyzer, wordExplainer });

const cleanupTimer = setInterval(() => {
  security.cleanupExpiredSessions();
}, Math.min(config.sessionDurationMs, 1000 * 60 * 10));

cleanupTimer.unref();

const server = app.listen(config.port, () => {
  console.log(`Server listening on http://127.0.0.1:${config.port}`);
  if (supabase) {
    console.log("Supabase-backed admin auth and word stats are enabled.");
  } else {
    console.log("Supabase env not found. Falling back to local SQLite stats and env-based admin login.");
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(cleanupTimer);
    server.close(() => {
      statsStore.close();
      process.exit(0);
    });
  });
}
