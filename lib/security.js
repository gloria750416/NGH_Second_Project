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

function verifyPasswordAgainstHash(password, storedHash) {
  const [salt, hashedValue] = String(storedHash ?? "").split(":");

  if (!salt || !hashedValue) {
    return false;
  }

  const derived = deriveHash(password, salt).toString("hex");
  return safeCompare(derived, hashedValue);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = deriveHash(password, salt).toString("hex");
  return `${salt}:${hash}`;
}

export function createSecurity(config, options = {}) {
  const adminStore = options.adminStore ?? null;
  const sessions = new Map();

  function readBearerToken(authorizationHeader) {
    const authHeader = String(authorizationHeader ?? "");

    if (!authHeader.startsWith("Bearer ")) {
      return null;
    }

    return authHeader.slice("Bearer ".length).trim() || null;
  }

  async function authenticate(username, password) {
    const inputUsername = String(username ?? "").trim();
    const inputPassword = String(password ?? "");

    if (!inputUsername || !inputPassword) {
      return null;
    }

    if (adminStore) {
      const adminUser = await adminStore.findByUsername(inputUsername);

      if (!adminUser || !adminUser.isActive) {
        return null;
      }

      if (!verifyPasswordAgainstHash(inputPassword, adminUser.passwordHash)) {
        return null;
      }

      await adminStore.touchLastLogin(adminUser.id);
      return adminUser;
    }

    const usernameMatches = safeCompare(inputUsername, config.adminUsername);
    const passwordMatches = config.adminPasswordHash
      ? verifyPasswordAgainstHash(inputPassword, config.adminPasswordHash)
      : safeCompare(inputPassword, config.adminPassword);

    if (!usernameMatches || !passwordMatches) {
      return null;
    }

    return {
      id: "local-admin",
      username: config.adminUsername,
      displayName: config.adminUsername,
      isActive: true,
      passwordHash: config.adminPasswordHash,
    };
  }

  function createSession(adminUser) {
    const token = crypto.randomUUID();
    const now = Date.now();
    const session = {
      token,
      adminId: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName || adminUser.username,
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
    authenticate,
    cleanupExpiredSessions,
    createSession,
    getSession,
    readBearerToken,
    revokeSession,
  };
}
