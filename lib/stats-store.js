import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export async function createStatsStore(databasePath) {
  await mkdir(path.dirname(databasePath), { recursive: true });

  const ignoredWords = new Set([
    "a", "an", "the",
    "and", "but", "or", "nor", "so", "yet",
    "if", "although", "because", "when", "while", "that", "which", "who", "whom", "whose",
    "to", "of", "in", "on", "at", "for", "from", "by", "with", "about", "into", "over", "under", "after", "before",
    "as", "than",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their",
    "this", "these", "those",
    "be", "am", "is", "are", "was", "were", "been", "being",
    "do", "does", "did", "done",
    "have", "has", "had",
    "can", "could", "may", "might", "must", "shall", "should", "will", "would",
    "not",
  ]);

  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_searches INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS words (
      word TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      last_searched_at TEXT
    );

    INSERT INTO meta (id, total_searches, updated_at)
    VALUES (1, 0, NULL)
    ON CONFLICT(id) DO NOTHING;
  `);

  const normalizeWord = (word) =>
    String(word ?? "")
      .trim()
      .toLowerCase()
      .replace(/^[^a-z]+|[^a-z'-]+$/g, "");

  const normalizeTrackedWord = (word) => {
    const normalized = normalizeWord(word);
    return normalized && !ignoredWords.has(normalized) ? normalized : "";
  };

  const selectMeta = db.prepare(`
    SELECT total_searches AS totalSearches, updated_at AS updatedAt
    FROM meta
    WHERE id = 1
  `);

  const selectWords = db.prepare(`
    SELECT word, count, last_searched_at AS lastSearchedAt
    FROM words
    ORDER BY count DESC, last_searched_at DESC, word ASC
    LIMIT ?
  `);

  const countTrackedWords = db.prepare(`SELECT COUNT(*) AS trackedWords FROM words`);
  const upsertWord = db.prepare(`
    INSERT INTO words (word, count, last_searched_at)
    VALUES (?, 1, ?)
    ON CONFLICT(word) DO UPDATE SET
      count = count + 1,
      last_searched_at = excluded.last_searched_at
  `);
  const updateMeta = db.prepare(`
    UPDATE meta
    SET total_searches = total_searches + 1,
        updated_at = ?
    WHERE id = 1
  `);
  const clearWords = db.prepare(`DELETE FROM words`);
  const resetMeta = db.prepare(`UPDATE meta SET total_searches = 0, updated_at = NULL WHERE id = 1`);

  function getSummary(limit = 10) {
    const meta = selectMeta.get() ?? { totalSearches: 0, updatedAt: null };
    const tracked = countTrackedWords.get() ?? { trackedWords: 0 };
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    return {
      totalSearches: meta.totalSearches,
      trackedWords: tracked.trackedWords,
      updatedAt: meta.updatedAt,
      words: selectWords.all(safeLimit),
    };
  }

  function recordLookup(words) {
    const uniqueWords = [...new Set(words.map(normalizeTrackedWord).filter(Boolean))];

    if (!uniqueWords.length) {
      return;
    }

    const now = new Date().toISOString();

    db.exec("BEGIN");

    try {
      for (const word of uniqueWords) {
        upsertWord.run(word, now);
      }

      updateMeta.run(now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function exportAll() {
    const meta = selectMeta.get() ?? { totalSearches: 0, updatedAt: null };
    const tracked = countTrackedWords.get() ?? { trackedWords: 0 };
    const allWords = db
      .prepare(`
        SELECT word, count, last_searched_at AS lastSearchedAt
        FROM words
        ORDER BY count DESC, last_searched_at DESC, word ASC
      `)
      .all();

    return {
      totalSearches: meta.totalSearches,
      trackedWords: tracked.trackedWords,
      updatedAt: meta.updatedAt,
      words: allWords,
    };
  }

  function reset() {
    db.exec("BEGIN");

    try {
      clearWords.run();
      resetMeta.run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function close() {
    db.close();
  }

  return {
    close,
    exportAll,
    getSummary,
    normalizeWord,
    normalizeTrackedWord,
    recordLookup,
    reset,
  };
}
