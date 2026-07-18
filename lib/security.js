import crypto from "node:crypto";

function deriveHash(password, salt) {
  return crypto.scryptSync(password, salt, 64);
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = deriveHash(password, salt).toString("hex");
  return `${salt}:${hash}`;
}

export function createSecurity(config) {
  const sessions = new Map();

  function readBearerToken(authorizationHeader) {
    const authHeader = String(authorizationHeader ?? "");

    if (!authHeader.startsWith("Bearer ")) {
      return null;
    }

    return authHeader.slice("Bearer ".length).trim() || null;
  }

  async function verifyPassword(inputPassword) {
    if (config.adminPasswordHash) {
      const [salt, storedHash] = config.adminPasswordHash.split(":");

      if (!salt || !storedHash) {
        return false;
      }

      const derived = deriveHash(inputPassword, salt).toString("hex");
      return safeCompare(derived, storedHash);
    }

    return safeCompare(inputPassword, config.adminPassword);
  }

  function isExpectedUsername(username) {
    return safeCompare(username, config.adminUsername);
  }

  function createSession() {
    const token = crypto.randomUUID();
    const now = Date.now();
    const session = {
      token,
      username: config.adminUsername,
      createdAt: now,
      expiresAt: now + config.sessionDurationMs,
    };

    sessions.set(token, session);
    return session;
  }

  function getSession(token) {
    const session = sessions.get(token);

    if (!session) {
      return null;
    }

    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }

    return session;
  }

  function revokeSession(token) {
    sessions.delete(token);
  }

  function cleanupExpiredSessions() {
    const now = Date.now();

    for (const [token, session] of sessions.entries()) {
      if (session.expiresAt <= now) {
        sessions.delete(token);
      }
    }
  }

  return {
    cleanupExpiredSessions,
    createSession,
    getSession,
    isExpectedUsername,
    readBearerToken,
    revokeSession,
    verifyPassword,
  };
}
