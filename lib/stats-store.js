import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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

function normalizeWord(word) {
  return String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z'-]+$/g, "");
}

function normalizeTrackedWord(word) {
  const normalized = normalizeWord(word);
  return normalized && !ignoredWords.has(normalized) ? normalized : "";
}

function mapWordRow(row) {
  return {
    word: row.word,
    count: row.count,
    lastSearchedAt: row.last_searched_at ?? row.lastSearchedAt ?? null,
  };
}

function mapMetaRow(row) {
  return {
    totalSearches: row?.total_searches ?? row?.totalSearches ?? 0,
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
  };
}

function ensureSupabaseResult(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
}

function createSupabaseStatsStore(supabase) {
  async function getMetaRow() {
    const result = await supabase
      .from("word_lookup_meta")
      .select("id, total_searches, updated_at")
      .eq("id", true)
      .maybeSingle();

    ensureSupabaseResult(result, "Failed to read word_lookup_meta");
    return result.data;
  }

  async function getTrackedWordsCount() {
    const result = await supabase
      .from("word_stats")
      .select("word", { count: "exact", head: true });

    ensureSupabaseResult(result, "Failed to count tracked words");
    return result.count ?? 0;
  }

  async function getWords(limit) {
    const result = await supabase
      .from("word_stats")
      .select("word, count, last_searched_at")
      .order("count", { ascending: false })
      .order("last_searched_at", { ascending: false })
      .order("word", { ascending: true })
      .limit(limit);

    ensureSupabaseResult(result, "Failed to load tracked words");
    return (result.data ?? []).map(mapWordRow);
  }

  async function getSummary(limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const [metaRow, trackedWords, words] = await Promise.all([
      getMetaRow(),
      getTrackedWordsCount(),
      getWords(safeLimit),
    ]);
    const meta = mapMetaRow(metaRow);

    return {
      totalSearches: meta.totalSearches,
      trackedWords,
      updatedAt: meta.updatedAt,
      words,
    };
  }

  async function recordLookup(words) {
    const uniqueWords = [...new Set(words.map(normalizeTrackedWord).filter(Boolean))];

    if (!uniqueWords.length) {
      return;
    }

    const now = new Date().toISOString();
    const metaRow = await getMetaRow();
    const nextTotalSearches = (metaRow?.total_searches ?? 0) + 1;

    for (const word of uniqueWords) {
      const existing = await supabase
        .from("word_stats")
        .select("word, count")
        .eq("word", word)
        .maybeSingle();

      ensureSupabaseResult(existing, `Failed to load tracked word "${word}"`);

      const count = (existing.data?.count ?? 0) + 1;
      const upsertResult = await supabase
        .from("word_stats")
        .upsert(
          {
            word,
            count,
            last_searched_at: now,
            updated_at: now,
          },
          { onConflict: "word" },
        );

      ensureSupabaseResult(upsertResult, `Failed to upsert tracked word "${word}"`);
    }

    const metaUpsert = await supabase
      .from("word_lookup_meta")
      .upsert(
        {
          id: true,
          total_searches: nextTotalSearches,
          updated_at: now,
        },
        { onConflict: "id" },
      );

    ensureSupabaseResult(metaUpsert, "Failed to update word lookup meta");
  }

  async function exportAll() {
    return getSummary(1000);
  }

  async function reset() {
    const deleteResult = await supabase
      .from("word_stats")
      .delete()
      .gte("count", 0);

    ensureSupabaseResult(deleteResult, "Failed to reset tracked words");

    const metaReset = await supabase
      .from("word_lookup_meta")
      .upsert(
        {
          id: true,
          total_searches: 0,
          updated_at: null,
        },
        { onConflict: "id" },
      );

    ensureSupabaseResult(metaReset, "Failed to reset word lookup meta");
  }

  return {
    close() {},
    exportAll,
    getSummary,
    normalizeWord,
    normalizeTrackedWord,
    recordLookup,
    reset,
  };
}

function createSqliteStatsStore(databasePath) {
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

  return {
    close() {
      db.close();
    },
    async exportAll() {
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
        words: allWords.map(mapWordRow),
      };
    },
    async getSummary(limit = 10) {
      const meta = selectMeta.get() ?? { totalSearches: 0, updatedAt: null };
      const tracked = countTrackedWords.get() ?? { trackedWords: 0 };
      const safeLimit = Math.min(Math.max(limit, 1), 100);

      return {
        totalSearches: meta.totalSearches,
        trackedWords: tracked.trackedWords,
        updatedAt: meta.updatedAt,
        words: selectWords.all(safeLimit).map(mapWordRow),
      };
    },
    normalizeWord,
    normalizeTrackedWord,
    async recordLookup(words) {
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
    },
    async reset() {
      db.exec("BEGIN");

      try {
        clearWords.run();
        resetMeta.run();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

export async function createStatsStore(options = {}) {
  if (typeof options === "string") {
    await mkdir(path.dirname(options), { recursive: true });
    return createSqliteStatsStore(options);
  }

  const databasePath = options.databasePath ?? "";
  const supabase = options.supabase ?? null;

  if (supabase) {
    return createSupabaseStatsStore(supabase);
  }

  if (!databasePath) {
    throw new Error("databasePath is required when Supabase is not configured.");
  }

  await mkdir(path.dirname(databasePath), { recursive: true });
  return createSqliteStatsStore(databasePath);
}
