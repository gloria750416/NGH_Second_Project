import { createApp } from "./app.js";
import { loadConfig } from "./lib/config.js";
import { createSecurity } from "./lib/security.js";
import { createGrammarAnalyzer } from "./lib/grammar-analyzer.js";
import { createStatsStore } from "./lib/stats-store.js";
import { createWordExplainer } from "./lib/word-explainer.js";

const config = loadConfig();
const statsStore = await createStatsStore(config.databasePath);
const security = createSecurity(config);
const grammarAnalyzer = createGrammarAnalyzer(config);
const wordExplainer = createWordExplainer(config);
const app = createApp({ config, statsStore, security, grammarAnalyzer, wordExplainer });

const cleanupTimer = setInterval(() => {
  security.cleanupExpiredSessions();
}, Math.min(config.sessionDurationMs, 1000 * 60 * 10));

cleanupTimer.unref();

const server = app.listen(config.port, () => {
  console.log(`Server listening on http://127.0.0.1:${config.port}`);
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
