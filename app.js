import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return request.ip || request.socket.remoteAddress || "unknown";
}

export function createApp({ config, statsStore, security, grammarAnalyzer, wordExplainer }) {
  const app = express();
  const loginAttempts = new Map();

  app.set("trust proxy", true);
  app.use(express.json());

  function cleanExpiredSessions() {
    security.cleanupExpiredSessions();

    const now = Date.now();

    for (const [key, value] of loginAttempts.entries()) {
      if ((value.blockedUntil && value.blockedUntil <= now) || value.firstAttemptAt + config.loginWindowMs <= now) {
        loginAttempts.delete(key);
      }
    }
  }

  function getRemainingBlockSeconds(attempt) {
    return Math.max(1, Math.ceil((attempt.blockedUntil - Date.now()) / 1000));
  }

  function registerFailedLogin(ipAddress) {
    const now = Date.now();
    const attempt = loginAttempts.get(ipAddress);

    if (!attempt || attempt.firstAttemptAt + config.loginWindowMs <= now) {
      loginAttempts.set(ipAddress, {
        count: 1,
        firstAttemptAt: now,
        blockedUntil: 0,
      });
      return null;
    }

    attempt.count += 1;

    if (attempt.count >= config.maxLoginAttempts) {
      attempt.blockedUntil = now + config.loginBlockMs;
      return getRemainingBlockSeconds(attempt);
    }

    return null;
  }

  function clearFailedLogin(ipAddress) {
    loginAttempts.delete(ipAddress);
  }

  function requireAdminAuth(request, response, next) {
    const token = security.readBearerToken(request.headers.authorization);

    if (!token) {
      response.status(401).json({ message: "관리자 인증이 필요합니다." });
      return;
    }

    const session = security.getSession(token);

    if (!session) {
      response.status(401).json({ message: "관리자 세션이 유효하지 않습니다." });
      return;
    }

    request.adminSession = session;
    request.adminToken = token;
    next();
  }

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/admin/login", async (request, response) => {
    cleanExpiredSessions();

    const ipAddress = getClientIp(request);
    const existingAttempt = loginAttempts.get(ipAddress);

    if (existingAttempt?.blockedUntil && existingAttempt.blockedUntil > Date.now()) {
      response.status(429).json({
        message: `로그인 시도가 너무 많습니다. ${getRemainingBlockSeconds(existingAttempt)}초 후 다시 시도해 주세요.`,
      });
      return;
    }

    const username = String(request.body?.username ?? "").trim();
    const password = String(request.body?.password ?? "");
    const adminUser = await security.authenticate(username, password);

    if (!adminUser) {
      const blockedSeconds = registerFailedLogin(ipAddress);

      if (blockedSeconds) {
        response.status(429).json({
          message: `로그인 시도가 너무 많습니다. ${blockedSeconds}초 후 다시 시도해 주세요.`,
        });
        return;
      }

      response.status(401).json({ message: "관리자 계정 정보가 올바르지 않습니다." });
      return;
    }

    clearFailedLogin(ipAddress);

    const session = security.createSession(adminUser);

    response.json({
      token: session.token,
      username: session.username,
      displayName: session.displayName,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  });

  app.post("/api/admin/logout", requireAdminAuth, (request, response) => {
    security.revokeSession(request.adminToken);
    response.status(204).end();
  });

  app.get("/api/admin/stats", requireAdminAuth, async (request, response, next) => {
    try {
      const limit = Number.parseInt(String(request.query.limit ?? "8"), 10) || 8;
      const summary = await statsStore.getSummary(limit);
      response.json({
        admin: request.adminSession.displayName,
        ...summary,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/export", requireAdminAuth, async (request, response, next) => {
    try {
      const exportedAt = new Date().toISOString();
      const payload = {
        exportedAt,
        admin: request.adminSession.displayName,
        stats: await statsStore.exportAll(),
      };

      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="word-stats-backup-${exportedAt.slice(0, 10)}.json"`);
      response.send(JSON.stringify(payload, null, 2));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/reset", requireAdminAuth, async (_request, response, next) => {
    try {
      await statsStore.reset();
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/word-lookups", async (request, response, next) => {
    const inputWords = Array.isArray(request.body?.words) ? request.body.words : [];
    const words = [...new Set(inputWords.map(statsStore.normalizeWord).filter(Boolean))];

    if (!words.length) {
      response.status(400).json({ message: "words must include at least one English word." });
      return;
    }

    try {
      await statsStore.recordLookup(words);
      response.status(201).json({
        savedWords: words.length,
        stats: await statsStore.getSummary(5),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/grammar-analysis", async (request, response) => {
    const sentence = String(request.body?.sentence ?? "").trim();

    if (!sentence) {
      response.status(400).json({ message: "sentence is required." });
      return;
    }

    if (!grammarAnalyzer?.isEnabled()) {
      response.status(503).json({
        message: "문법 분석 API 키가 설정되지 않았습니다. OPENAI_API_KEY를 추가해 주세요.",
      });
      return;
    }

    try {
      const analysis = await grammarAnalyzer.analyze(sentence);
      response.json({ analysis });
    } catch (error) {
      console.error(error);
      response.status(502).json({
        message: "문법 분석 API 호출에 실패했습니다.",
      });
    }
  });

  app.post("/api/word-explanations", async (request, response) => {
    const text = String(request.body?.text ?? "").trim();

    if (!text) {
      response.status(400).json({ message: "text is required." });
      return;
    }

    if (!wordExplainer?.isEnabled()) {
      response.status(503).json({
        message: "단어 뜻 변환 API 키가 설정되지 않았습니다. OPENAI_API_KEY를 추가해 주세요.",
      });
      return;
    }

    try {
      const entries = await wordExplainer.explain(text);
      response.json({ entries });
    } catch (error) {
      console.error(error);
      response.status(502).json({
        message: "단어 뜻 변환 API 호출에 실패했습니다.",
      });
    }
  });

  app.use(express.static(path.join(__dirname, "dist"), { extensions: ["html"] }));

  app.get("/", (_request, response) => {
    response.sendFile(path.join(__dirname, "dist", "index.html"));
  });

  app.get("/admin.html", (_request, response) => {
    response.sendFile(path.join(__dirname, "dist", "admin.html"));
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  });

  return app;
}
