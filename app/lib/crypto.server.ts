import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

const PREFIX = "av1";

function keyMaterial() {
  return process.env.SHOPIFY_API_SECRET || "addressverify-dev-secret";
}

let cachedKey: { material: string; key: Buffer } | null = null;

// scrypt is deliberately slow and synchronous; derive once instead of on every checkout request.
function derivedKey() {
  const material = keyMaterial();
  if (!cachedKey || cachedKey.material !== material) {
    cachedKey = { material, key: scryptSync(material, "addressverify-settings", 32) };
  }
  return cachedKey.key;
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return "";
  if (!value.startsWith(`${PREFIX}.`)) return value;
  try {
    const [, iv, tag, data] = value.split(".");
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Secret rotated or value corrupted: treat as unset rather than failing checkout validation.
    console.warn("AddressVerify could not decrypt a stored secret; re-enter it in settings.");
    return "";
  }
}

export function hashIdentifier(value: string | null | undefined) {
  if (!value) return null;
  return createHash("sha256").update(`${keyMaterial()}:${value}`).digest("hex").slice(0, 32);
}

export function maskSecret(value: string | null | undefined) {
  if (!value) return "";
  const plain = decryptSecret(value);
  if (plain.length < 8) return "••••";
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}
