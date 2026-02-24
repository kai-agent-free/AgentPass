#!/usr/bin/env bash
# ============================================================
# AgentPass Quickstart — get a passport in under 60 seconds
# Requirements: curl, openssl, jq (optional but recommended)
# ============================================================
set -euo pipefail

API="http://38.49.210.10:3846"
RAND=$(openssl rand -hex 4)
EMAIL="agent-${RAND}@example.com"
PASSWORD="SecurePass_${RAND}!"
NAME="agent-${RAND}"

echo "🚀 AgentPass Quickstart"
echo "========================"
echo ""

# --- Step 1: Register an account ---
echo "1️⃣  Registering account: ${EMAIL}"
REG_RESP=$(curl -sf -X POST "${API}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"name\":\"${NAME}\"}")

TOKEN=$(echo "$REG_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null \
  || echo "$REG_RESP" | jq -r '.token' 2>/dev/null)
OWNER_ID=$(echo "$REG_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['owner_id'])" 2>/dev/null \
  || echo "$REG_RESP" | jq -r '.owner_id' 2>/dev/null)

echo "   ✅ Registered! Owner ID: ${OWNER_ID}"
echo ""

# --- Step 2: Generate Ed25519 keypair ---
echo "2️⃣  Generating Ed25519 keypair..."
TMPDIR=$(mktemp -d)
openssl genpkey -algorithm Ed25519 -out "${TMPDIR}/key.pem" 2>/dev/null
openssl pkey -in "${TMPDIR}/key.pem" -pubout -out "${TMPDIR}/pub.pem" 2>/dev/null

# Extract raw base64 public key (strip PEM headers)
PUB_KEY=$(grep -v '^-' "${TMPDIR}/pub.pem" | tr -d '\n')
echo "   ✅ Public key: ${PUB_KEY:0:20}..."
echo ""

# --- Step 3: Create a passport ---
echo "3️⃣  Creating passport..."
PASS_RESP=$(curl -sf -X POST "${API}/passports" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"public_key\":\"${PUB_KEY}\",\"name\":\"${NAME}\",\"description\":\"Quickstart demo agent\"}")

PASSPORT_ID=$(echo "$PASS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['passport_id'])" 2>/dev/null \
  || echo "$PASS_RESP" | jq -r '.passport_id' 2>/dev/null)
AGENT_EMAIL=$(echo "$PASS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['email'])" 2>/dev/null \
  || echo "$PASS_RESP" | jq -r '.email' 2>/dev/null)

echo "   ✅ Passport created: ${PASSPORT_ID}"
echo ""

# --- Step 4: Query the passport back ---
echo "4️⃣  Verifying passport..."
GET_RESP=$(curl -sf -X GET "${API}/passports/${PASSPORT_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

TRUST_LEVEL=$(echo "$GET_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('trust_level','unknown'))" 2>/dev/null \
  || echo "$GET_RESP" | jq -r '.trust_level' 2>/dev/null)
STATUS=$(echo "$GET_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null \
  || echo "$GET_RESP" | jq -r '.status' 2>/dev/null)

echo "   ✅ Verified!"
echo ""

# --- Cleanup ---
rm -rf "${TMPDIR}"

# --- Summary ---
echo "=========================================="
echo "🎉 Your AgentPass Passport is ready!"
echo "=========================================="
echo ""
echo "  Passport ID:   ${PASSPORT_ID}"
echo "  Agent Email:    ${AGENT_EMAIL}"
echo "  Owner Email:    ${EMAIL}"
echo "  Owner ID:       ${OWNER_ID}"
echo "  Status:         ${STATUS}"
echo "  Trust Level:    ${TRUST_LEVEL}"
echo "  Public Key:     ${PUB_KEY:0:32}..."
echo ""
echo "  JWT Token (save this!):"
echo "  ${TOKEN:0:40}..."
echo ""
echo "  Use your token to call the API:"
echo "  curl -H \"Authorization: Bearer \${TOKEN}\" ${API}/passports"
echo ""
echo "=========================================="
