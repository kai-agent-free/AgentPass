#!/usr/bin/env node
/**
 * AgentPass Quickstart — get a passport in under 60 seconds (Node.js)
 * Requirements: Node.js 18+ (built-in fetch & crypto)
 */

import crypto from "node:crypto";

const API = "http://38.49.210.10:3846";
const rand = crypto.randomBytes(4).toString("hex");
const EMAIL = `agent-${rand}@example.com`;
const PASSWORD = `SecurePass_${rand}!`;
const NAME = `agent-${rand}`;

async function main() {
  console.log("🚀 AgentPass Quickstart (Node.js)");
  console.log("==================================\n");

  // --- Step 1: Register ---
  console.log(`1️⃣  Registering account: ${EMAIL}`);
  const regRes = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: NAME }),
  });
  if (!regRes.ok) throw new Error(`Register failed: ${regRes.status} ${await regRes.text()}`);
  const reg = await regRes.json();
  const { token, owner_id } = reg;
  console.log(`   ✅ Registered! Owner ID: ${owner_id}\n`);

  // --- Step 2: Generate Ed25519 keypair ---
  console.log("2️⃣  Generating Ed25519 keypair...");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubKeyDer = publicKey.export({ type: "spki", format: "der" });
  const pubKeyB64 = pubKeyDer.toString("base64");
  console.log(`   ✅ Public key: ${pubKeyB64.slice(0, 20)}...\n`);

  // --- Step 3: Create passport ---
  console.log("3️⃣  Creating passport...");
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const createRes = await fetch(`${API}/passports`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      public_key: pubKeyB64,
      name: NAME,
      description: "Quickstart demo agent (Node.js)",
    }),
  });
  if (!createRes.ok) throw new Error(`Create failed: ${createRes.status} ${await createRes.text()}`);
  const created = await createRes.json();
  console.log(`   ✅ Passport created: ${created.passport_id}\n`);

  // --- Step 4: Query passport back ---
  console.log("4️⃣  Verifying passport...");
  const getRes = await fetch(`${API}/passports/${created.passport_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getRes.ok) throw new Error(`Get failed: ${getRes.status} ${await getRes.text()}`);
  const passport = await getRes.json();
  console.log("   ✅ Verified!\n");

  // --- Summary ---
  console.log("==========================================");
  console.log("🎉 Your AgentPass Passport is ready!");
  console.log("==========================================\n");
  console.log(`  Passport ID:   ${passport.id}`);
  console.log(`  Agent Email:    ${created.email}`);
  console.log(`  Owner Email:    ${EMAIL}`);
  console.log(`  Owner ID:       ${owner_id}`);
  console.log(`  Status:         ${passport.status}`);
  console.log(`  Trust Level:    ${passport.trust_level}`);
  console.log(`  Public Key:     ${pubKeyB64.slice(0, 32)}...`);
  console.log(`\n  JWT Token (save this!):`);
  console.log(`  ${token.slice(0, 40)}...`);
  console.log(`\n  Use your token to call the API:`);
  console.log(`  curl -H "Authorization: Bearer \${TOKEN}" ${API}/passports`);
  console.log("\n==========================================");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
