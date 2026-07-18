import { execSync } from "node:child_process";

const targetPorts = [3000, 5173, 5174, 5175];

function readListeningPids(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return [...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => line.includes("LISTENING"))
        .map((line) => line.split(/\s+/).at(-1))
        .filter(Boolean),
    )];
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`, {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

const killed = [];

for (const port of targetPorts) {
  for (const pid of readListeningPids(port)) {
    if (killPid(pid)) {
      killed.push({ port, pid });
    }
  }
}

if (killed.length) {
  for (const item of killed) {
    console.log(`Stopped PID ${item.pid} on port ${item.port}`);
  }
}
