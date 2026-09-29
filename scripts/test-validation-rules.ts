/**
 * Feature tests for Validation Rules (matches merchant UI configuration).
 * Run: npx tsx scripts/test-validation-rules.ts
 */
import { DEFAULT_MESSAGES, RULE_KEYS, type RuleAction, type RuleKey } from "../app/lib/defaults";
import { validateAddress } from "../app/services/validation/engine";
import type { AddressInput, MerchantRule } from "../app/services/validation/types";

/** Actions as shown in the Validation Rules screenshot */
const SCREENSHOT_ACTIONS: Record<RuleKey, RuleAction> = {
  require_house_number: "block",
  block_po_boxes: "block",
  block_special_characters: "block",
  validate_postal_code: "block",
  validate_city_postal: "allow",
  validate_street_name: "warn",
  detect_incomplete: "block",
  detect_invalid: "review",
  auto_correct_typos: "fix",
};

function rulesWith(overrides: Partial<Record<RuleKey, { enabled?: boolean; action?: RuleAction }>> = {}): MerchantRule[] {
  return RULE_KEYS.map((ruleKey) => ({
    ruleKey,
    enabled: overrides[ruleKey]?.enabled ?? true,
    action: overrides[ruleKey]?.action ?? SCREENSHOT_ACTIONS[ruleKey],
  }));
}

let caseId = 0;

async function run(
  label: string,
  address: AddressInput,
  expect: {
    actionTaken?: string | string[];
    status?: string | string[];
    errorTypesIncludes?: string;
    errorTypesExcludes?: string;
    valid?: boolean;
    suggestedStreetIncludes?: string;
  },
  ruleOverrides: Partial<Record<RuleKey, { enabled?: boolean; action?: RuleAction }>> = {},
) {
  caseId += 1;
  const result = await validateAddress(address, {
    // Unique shop per case avoids in-memory validation cache collisions
    shop: `validation-rules-test-${caseId}.myshopify.com`,
    rules: rulesWith(ruleOverrides),
    messages: DEFAULT_MESSAGES,
    provider: { type: "builtin", timeoutMs: 2500 },
    failClosed: false,
    validationEnabled: true,
  });

  const actions = Array.isArray(expect.actionTaken) ? expect.actionTaken : expect.actionTaken ? [expect.actionTaken] : null;
  const statuses = Array.isArray(expect.status) ? expect.status : expect.status ? [expect.status] : null;

  const checks: string[] = [];
  let ok = true;

  if (actions && !actions.includes(result.actionTaken || "")) {
    ok = false;
    checks.push(`actionTaken=${result.actionTaken} (expected ${actions.join("|")})`);
  }
  if (statuses && !statuses.includes(result.status || "")) {
    ok = false;
    checks.push(`status=${result.status} (expected ${statuses.join("|")})`);
  }
  if (expect.valid != null && result.valid !== expect.valid) {
    ok = false;
    checks.push(`valid=${result.valid} (expected ${expect.valid})`);
  }
  if (expect.errorTypesIncludes && !result.errorTypes.includes(expect.errorTypesIncludes)) {
    ok = false;
    checks.push(`missing errorType ${expect.errorTypesIncludes}; got [${result.errorTypes.join(", ")}]`);
  }
  if (expect.errorTypesExcludes && result.errorTypes.includes(expect.errorTypesExcludes)) {
    ok = false;
    checks.push(`unexpected errorType ${expect.errorTypesExcludes}`);
  }
  if (expect.suggestedStreetIncludes) {
    const street = result.suggested?.address1 || result.normalized?.address1 || "";
    if (!street.toLowerCase().includes(expect.suggestedStreetIncludes.toLowerCase())) {
      ok = false;
      checks.push(`suggested street "${street}" missing "${expect.suggestedStreetIncludes}"`);
    }
  }

  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${label}`);
  if (!ok) {
    console.log(`      ${checks.join("; ")}`);
    console.log(
      `      detail: action=${result.actionTaken} status=${result.status} errors=[${result.errorTypes.join(", ")}] issues=${JSON.stringify(result.issues.map((i) => `${i.type}:${i.action}`))}`,
    );
  }
  return ok;
}

async function main() {
  console.log("Validation Rules feature tests (screenshot configuration)\n");
  const results: boolean[] = [];

  // 1. Require house number → Block
  results.push(
    await run(
      "1. Require house number → Block",
      {
        address1: "Main Street",
        city: "New York",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        actionTaken: "block",
        valid: false,
        errorTypesIncludes: "missing_house_number",
      },
    ),
  );

  // 2. PO Boxes → Block
  results.push(
    await run(
      "2. PO Boxes → Block",
      {
        address1: "PO Box 1234",
        city: "New York",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        actionTaken: "block",
        valid: false,
        errorTypesIncludes: "po_box_not_allowed",
      },
    ),
  );

  // 3. Block special characters → Block
  results.push(
    await run(
      "3. Block special characters → Block",
      {
        address1: "123 Main St <suite>",
        city: "New York",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        actionTaken: "block",
        valid: false,
        errorTypesIncludes: "special_characters_not_allowed",
      },
    ),
  );

  // 4. Validate postal / ZIP code → Block
  results.push(
    await run(
      "4. Validate postal / ZIP code → Block",
      {
        address1: "123 Main Street",
        city: "New York",
        province: "NY",
        zip: "ABCDE",
        country: "US",
      },
      {
        actionTaken: "block",
        valid: false,
        errorTypesIncludes: "invalid_postal_code",
      },
    ),
  );

  // 5. Validate city + postal → Allow (screenshot): mismatch must not appear
  results.push(
    await run(
      "5. Validate city + postal → Allow (mismatch ignored)",
      {
        address1: "123 Main Street",
        city: "X",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        errorTypesExcludes: "city_postal_mismatch",
        actionTaken: ["allow", "fix", "warn", "review"],
      },
      {
        require_house_number: { enabled: true, action: "allow" },
        block_po_boxes: { enabled: true, action: "allow" },
        block_special_characters: { enabled: true, action: "allow" },
        validate_postal_code: { enabled: true, action: "allow" },
        validate_street_name: { enabled: true, action: "allow" },
        detect_incomplete: { enabled: true, action: "allow" },
        detect_invalid: { enabled: true, action: "allow" },
        auto_correct_typos: { enabled: false },
        validate_city_postal: { enabled: true, action: "allow" },
      },
    ),
  );

  // Control: mismatch surfaces when action=warn (suggestion may upgrade overall action to fix)
  results.push(
    await run(
      "5b. City+postal mismatch fires when action=warn",
      {
        address1: "123 Main Street",
        city: "New",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        errorTypesIncludes: "city_postal_mismatch",
        valid: true,
        actionTaken: ["warn", "fix"],
      },
      {
        require_house_number: { enabled: true, action: "allow" },
        block_po_boxes: { enabled: true, action: "allow" },
        block_special_characters: { enabled: true, action: "allow" },
        validate_postal_code: { enabled: true, action: "allow" },
        validate_street_name: { enabled: true, action: "allow" },
        detect_incomplete: { enabled: true, action: "allow" },
        detect_invalid: { enabled: true, action: "allow" },
        auto_correct_typos: { enabled: false },
        validate_city_postal: { enabled: true, action: "warn" },
      },
    ),
  );

  // 6. Validate street name → Warn
  results.push(
    await run(
      "6. Validate street name → Warn",
      {
        address1: "12",
        city: "New York",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        actionTaken: "warn",
        errorTypesIncludes: "invalid_street",
        valid: true,
      },
      {
        // street "12" is digits-only → invalid_street; also missing house pattern differently
        require_house_number: { enabled: false },
        block_po_boxes: { enabled: false },
        block_special_characters: { enabled: false },
        validate_postal_code: { enabled: true, action: "allow" },
        validate_city_postal: { enabled: true, action: "allow" },
        detect_incomplete: { enabled: true, action: "allow" },
        detect_invalid: { enabled: true, action: "allow" },
        auto_correct_typos: { enabled: false },
        validate_street_name: { enabled: true, action: "warn" },
      },
    ),
  );

  // 7. Detect incomplete addresses → Block
  results.push(
    await run(
      "7. Detect incomplete addresses → Block",
      {
        address1: "",
        city: "",
        province: "NY",
        zip: "",
        country: "US",
      },
      {
        actionTaken: "block",
        valid: false,
        errorTypesIncludes: "incomplete_address",
      },
    ),
  );

  // 8. Detect invalid addresses → Review (isolated from other blocking rules)
  {
    const result = await validateAddress(
      {
        address1: "99999 Zzzyx Nonexistent Blvd",
        city: "Fakeville",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        shop: "validation-rules-test-8.myshopify.com",
        rules: rulesWith({
          require_house_number: { enabled: true, action: "allow" },
          block_po_boxes: { enabled: true, action: "allow" },
          block_special_characters: { enabled: true, action: "allow" },
          validate_postal_code: { enabled: true, action: "allow" },
          validate_city_postal: { enabled: true, action: "allow" },
          validate_street_name: { enabled: true, action: "allow" },
          detect_incomplete: { enabled: true, action: "allow" },
          auto_correct_typos: { enabled: false },
          detect_invalid: { enabled: true, action: "review" },
        }),
        messages: DEFAULT_MESSAGES,
        provider: { type: "builtin", timeoutMs: 2500 },
        failClosed: false,
        validationEnabled: true,
      },
    );
    const hasReviewIssue = result.issues.some((i) => i.type === "address_unverified" && i.action === "review");
    const ok = result.actionTaken === "review" || hasReviewIssue;
    console.log(`${ok ? "PASS" : "FAIL"}  8. Detect invalid addresses → Review`);
    if (!ok) {
      console.log(
        `      action=${result.actionTaken} status=${result.status} errors=[${result.errorTypes.join(", ")}] issues=${JSON.stringify(result.issues)}`,
      );
    }
    results.push(ok);
  }

  // 9. Automatically correct common typos → Fix
  results.push(
    await run(
      "9. Automatically correct common typos → Fix",
      {
        address1: "123 Main Stret",
        city: "New York",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        actionTaken: "fix",
        status: "corrected",
        suggestedStreetIncludes: "Street",
      },
      {
        require_house_number: { enabled: true, action: "allow" },
        block_po_boxes: { enabled: true, action: "allow" },
        block_special_characters: { enabled: true, action: "allow" },
        validate_postal_code: { enabled: true, action: "allow" },
        validate_city_postal: { enabled: true, action: "allow" },
        validate_street_name: { enabled: true, action: "allow" },
        detect_incomplete: { enabled: true, action: "allow" },
        detect_invalid: { enabled: true, action: "allow" },
        auto_correct_typos: { enabled: true, action: "fix" },
      },
    ),
  );

  // 10. Happy path — fully valid address
  results.push(
    await run(
      "10. Valid address → Allow",
      {
        address1: "123 Main Street",
        city: "New York",
        province: "NY",
        zip: "10001",
        country: "US",
      },
      {
        actionTaken: ["allow", "fix"],
        valid: true,
      },
    ),
  );

  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log(`\n${passed}/${total} tests passed`);
  if (passed < total) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
