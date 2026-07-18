import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createApp } from "../app.js";
import { createSecurity, hashPassword } from "../lib/security.js";
import { createStatsStore } from "../lib/stats-store.js";

async function startTestServer() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ngh-project-"));
  const dbPath = path.join(tempDir, "stats.db");
  const config = {
    adminUsername: "나건후",
    adminPassword: "unused",
    adminPasswordHash: hashPassword("test-password"),
    sessionDurationMs: 1000 * 60 * 60,
    loginWindowMs: 1000 * 60,
    loginBlockMs: 1000 * 60,
    maxLoginAttempts: 5,
  };
  const statsStore = await createStatsStore(dbPath);
  const security = createSecurity(config);
  const grammarAnalyzer = {
    isEnabled() {
      return true;
    },
    async analyze(text) {
      return {
        overview: `${text} 지문의 핵심 내용을 학습용으로 정리했습니다.`,
        translation: "날씨가 추웠지만 우리는 여행을 계속했고, 결국 작은 마을에 도착했다는 내용입니다.",
        meaning: "어려움이 있어도 계획을 계속 밀고 나간 상황을 보여주는 지문입니다.",
        sentenceBreakdown: [
          {
            sentence: "Although the weather was cold, we decided to continue our journey.",
            translation: "날씨가 추웠지만 우리는 여행을 계속하기로 결정했다.",
          },
          {
            sentence: "We finally arrived at a small village before sunset.",
            translation: "우리는 해 지기 전에 마침내 작은 마을에 도착했다.",
          },
        ],
        sentenceType: "복문",
        tense: "과거 시제 중심 문장입니다.",
        subject: "we",
        verb: "decided",
        verbDetail: "'decided to continue'에서 decide 뒤에 to부정사가 이어져 결정한 내용을 나타냅니다.",
        objectOrComplement: "to continue our journey",
        modifiers: ["Although the weather was cold"],
        connector: "although",
        clauseDetail: "'Although the weather was cold'가 양보절이고, 뒤의 'we decided to continue our journey'가 주절입니다.",
        patternDetail: "'we decided to continue our journey'는 S + V + to부정사 구조로 볼 수 있습니다.",
        structureNote: "'Although the weather was cold'라는 양보절이 먼저 나오고, 그 뒤에 주절이 이어지는 구조입니다.",
        learningTips: [
          "'Although the weather was cold'처럼 although 뒤에는 절이 와서 양보 의미를 만듭니다.",
          "'decided to continue'처럼 decide 뒤에는 to부정사가 자주 옵니다.",
        ],
      };
    },
  };
  const wordExplainer = {
    isEnabled() {
      return true;
    },
    async explain() {
      return [
        {
          text: "Although the weather was cold",
          normalized: "although the weather was cold",
          partOfSpeechKo: "양보절",
          meaningKo: "날씨가 추웠지만",
          noteKo: "'Although the weather was cold' 전체가 양보 의미를 만드는 절입니다.",
          statsWords: ["weather", "cold"],
        },
        {
          text: "decided to continue",
          normalized: "decided to continue",
          partOfSpeechKo: "동사구",
          meaningKo: "계속하기로 결정했다",
          noteKo: "'decided to continue'는 decide + to부정사 구조입니다.",
          statsWords: ["decide", "continue"],
        },
      ];
    },
  };
  const app = createApp({ config, statsStore, security, grammarAnalyzer, wordExplainer });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      statsStore.close();
      await rm(tempDir, { recursive: true, force: true });
    },
    baseUrl,
    statsStore,
  };
}

test("word lookups are stored and returned through admin stats", async () => {
  const fixture = await startTestServer();

  try {
    let response = await fetch(`${fixture.baseUrl}/api/word-lookups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: ["Although", "weather", "weather"] }),
    });
    assert.equal(response.status, 201);

    response = await fetch(`${fixture.baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "나건후", password: "test-password" }),
    });
    assert.equal(response.status, 200);
    const login = await response.json();
    assert.ok(login.token);

    response = await fetch(`${fixture.baseUrl}/api/admin/stats?limit=5`, {
      headers: {
        Authorization: `Bearer ${login.token}`,
      },
    });
    assert.equal(response.status, 200);
    const stats = await response.json();
    assert.equal(stats.totalSearches, 1);
    assert.equal(stats.trackedWords, 1);
    assert.equal(stats.words[0].word, "weather");
    assert.equal(stats.words[0].count, 1);
  } finally {
    await fixture.close();
  }
});

test("stats store ignores function words in tracked vocabulary", async () => {
  const fixture = await startTestServer();

  try {
    fixture.statsStore.recordLookup(["the", "a", "although", "weather", "decide"]);
    const summary = fixture.statsStore.getSummary(10);

    assert.equal(summary.trackedWords, 2);
    assert.deepEqual(summary.words.map((item) => item.word), ["decide", "weather"]);
  } finally {
    await fixture.close();
  }
});

test("admin stats require authentication", async () => {
  const fixture = await startTestServer();

  try {
    const response = await fetch(`${fixture.baseUrl}/api/admin/stats`);
    assert.equal(response.status, 401);
  } finally {
    await fixture.close();
  }
});

test("admin reset clears accumulated statistics", async () => {
  const fixture = await startTestServer();

  try {
    await fetch(`${fixture.baseUrl}/api/word-lookups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: ["journey"] }),
    });

    const loginResponse = await fetch(`${fixture.baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "나건후", password: "test-password" }),
    });
    const login = await loginResponse.json();

    const resetResponse = await fetch(`${fixture.baseUrl}/api/admin/reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${login.token}`,
      },
    });
    assert.equal(resetResponse.status, 204);

    const statsResponse = await fetch(`${fixture.baseUrl}/api/admin/stats`, {
      headers: {
        Authorization: `Bearer ${login.token}`,
      },
    });
    const stats = await statsResponse.json();
    assert.equal(stats.totalSearches, 0);
    assert.equal(stats.trackedWords, 0);
    assert.equal(stats.words.length, 0);
  } finally {
    await fixture.close();
  }
});

test("grammar analysis endpoint returns example-based grammar explanations", async () => {
  const fixture = await startTestServer();

  try {
    const response = await fetch(`${fixture.baseUrl}/api/grammar-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sentence: "Although the weather was cold, we decided to continue our journey. We finally arrived at a small village before sunset.",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.analysis.subject, "we");
    assert.equal(payload.analysis.connector, "although");
    assert.equal(payload.analysis.sentenceBreakdown.length, 2);
    assert.match(payload.analysis.clauseDetail, /Although the weather was cold/);
    assert.match(payload.analysis.structureNote, /Although the weather was cold/);
    assert.match(payload.analysis.verbDetail, /decided to continue/);
  } finally {
    await fixture.close();
  }
});

test("word explanation endpoint returns meaningful chunks instead of single words", async () => {
  const fixture = await startTestServer();

  try {
    const response = await fetch(`${fixture.baseUrl}/api/word-explanations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Although the weather was cold, we decided to continue our journey.",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.entries.length, 2);
    assert.equal(payload.entries[0].text, "Although the weather was cold");
    assert.equal(payload.entries[0].partOfSpeechKo, "양보절");
    assert.equal(payload.entries[1].meaningKo, "계속하기로 결정했다");
    assert.deepEqual(payload.entries[0].statsWords, ["weather", "cold"]);
    assert.deepEqual(payload.entries[1].statsWords, ["decide", "continue"]);
  } finally {
    await fixture.close();
  }
});
