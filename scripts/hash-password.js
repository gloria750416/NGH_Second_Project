import { hashPassword } from "../lib/security.js";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash-password -- <plain-password>");
  process.exit(1);
}

console.log(hashPassword(password));
