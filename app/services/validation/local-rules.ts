import { normalizeAction, type MessageKey, type RuleAction, type RuleKey } from "../../lib/defaults";
import type { AddressInput, MerchantRule, PoBoxRuleInput, ValidationContext, ValidationIssue } from "./types";

const STREET_SUFFIX: Record<string, string> = {
  stret: "Street",
  streeet: "Street",
  strt: "Street",
  str: "Street",
  st: "Street",
  avenu: "Avenue",
  aveune: "Avenue",
  avn: "Avenue",
  ave: "Avenue",
  av: "Avenue",
  rd: "Road",
  rode: "Road",
  raod: "Road",
  blvd: "Boulevard",
  blvrd: "Boulevard",
  boul: "Boulevard",
  ln: "Lane",
  dr: "Drive",
  driv: "Drive",
  drv: "Drive",
  ct: "Court",
  crt: "Court",
  cir: "Circle",
  cirle: "Circle",
  pl: "Place",
  pkwy: "Parkway",
  hwy: "Highway",
  ter: "Terrace",
  terr: "Terrace",
  sq: "Square",
  trl: "Trail",
  way: "Way",
};

const CITY_CORRECTIONS: Record<string, string> = {
  "new yrok": "New York",
  "new yorkk": "New York",
  "ny city": "New York",
  "los angles": "Los Angeles",
  "los angeles": "Los Angeles",
  "san fransisco": "San Francisco",
  "san francisco": "San Francisco",
  "washington dc": "Washington",
  "seatte": "Seattle",
  "chigago": "Chicago",
  "houston": "Houston",
  "philadelpia": "Philadelphia",
  "phoenix": "Phoenix",
  "toronto": "Toronto",
  "vancouver": "Vancouver",
  "london": "London",
  "berlin": "Berlin",
  "munich": "Munich",
  "mumbai": "Mumbai",
  "bangalore": "Bengaluru",
  "bengaluru": "Bengaluru",
};

const CITY_POSTAL_HINTS: Array<{ country: string; zipPrefix: RegExp; city: string }> = [
  { country: "US", zipPrefix: /^100/, city: "New York" },
  { country: "US", zipPrefix: /^900/, city: "Los Angeles" },
  { country: "US", zipPrefix: /^606/, city: "Chicago" },
  { country: "US", zipPrefix: /^770/, city: "Houston" },
  { country: "US", zipPrefix: /^191/, city: "Philadelphia" },
  { country: "US", zipPrefix: /^850/, city: "Phoenix" },
  { country: "US", zipPrefix: /^782/, city: "San Antonio" },
  { country: "US", zipPrefix: /^921/, city: "San Diego" },
  { country: "US", zipPrefix: /^752/, city: "Dallas" },
  { country: "US", zipPrefix: /^951/, city: "San Jose" },
  { country: "US", zipPrefix: /^787/, city: "Austin" },
  { country: "US", zipPrefix: /^322/, city: "Jacksonville" },
  { country: "US", zipPrefix: /^981/, city: "Seattle" },
  { country: "US", zipPrefix: /^802/, city: "Denver" },
  { country: "US", zipPrefix: /^021/, city: "Boston" },
  { country: "US", zipPrefix: /^200/, city: "Washington" },
  { country: "US", zipPrefix: /^303/, city: "Atlanta" },
  { country: "US", zipPrefix: /^331/, city: "Miami" },
  { country: "GB", zipPrefix: /^SW1|^W1|^EC1|^WC1/i, city: "London" },
  { country: "DE", zipPrefix: /^10/, city: "Berlin" },
  { country: "DE", zipPrefix: /^80/, city: "Munich" },
  { country: "IN", zipPrefix: /^110/, city: "New Delhi" },
  { country: "IN", zipPrefix: /^400/, city: "Mumbai" },
  { country: "IN", zipPrefix: /^560/, city: "Bengaluru" },
];

const PO_BOX =
  /\b(p\.?\s*o\.?\s*box|post\s*office\s*box|postfach|packstation|paketbox|packing\s*station|parcel\s*locker)\b|\bp\.?\s*o\.?\s*b\.?\s*\d|^\s*box\s*#?\s*\d/i;
const HOUSE_NUMBER = /(?:^|\s)\d+[a-zA-Z]?(?:\s*[-\/]\s*\d+[a-zA-Z]?)?/;
const SPECIAL_CHARS = /[<>^*{}|\\~`#$]|[\u{1F300}-\u{1FAFF}]/u;

const POSTAL: Record<string, RegExp> = {
  US: /^\d{5}(?:-\d{4})?$/,
  CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,
  DE: /^\d{5}$/,
  IN: /^\d{6}$/,
  AU: /^\d{4}$/,
  FR: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Z]{2}$/i,
  IT: /^\d{5}$/,
  ES: /^\d{5}$/,
  AT: /^\d{4}$/,
  CH: /^\d{4}$/,
  BE: /^\d{4}$/,
  NZ: /^\d{4}$/,
  IE: /^[A-Z]\d{2}\s?[A-Z0-9]{4}$/i,
};

function ruleMap(rules: MerchantRule[]) {
  return new Map(rules.map((rule) => [rule.ruleKey, rule]));
}

export function isPoBox(line: string) {
  return PO_BOX.test(line);
}

export function matchPoBoxRule(
  rules: PoBoxRuleInput[] | undefined,
  address: AddressInput,
  context?: ValidationContext,
) {
  const candidates = (rules || []).filter((rule) => rule.enabled);
  const scored = candidates
    .map((rule) => {
      if (rule.country && rule.country.toUpperCase() !== address.country) return null;
      if (rule.shippingMethod && !matchesLoose(context?.shippingMethod, rule.shippingMethod)) return null;
      if (rule.shippingZone && !matchesLoose(context?.shippingZone, rule.shippingZone)) return null;
      let score = 0;
      if (rule.country) score += 2;
      if (rule.shippingMethod) score += 2;
      if (rule.shippingZone) score += 1;
      return { rule, score };
    })
    .filter(Boolean) as Array<{ rule: PoBoxRuleInput; score: number }>;
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.rule;
}

function matchesLoose(value: string | undefined, expected: string) {
  const actual = (value || "").trim().toLowerCase();
  const wanted = expected.trim().toLowerCase();
  // An unknown shipping method/zone must not match every scoped rule ("x".includes("") is true).
  if (!actual || !wanted) return false;
  return actual.includes(wanted) || wanted.includes(actual);
}

function issue(
  rule: MerchantRule | undefined,
  type: ValidationIssue["type"],
  messageKey: MessageKey,
  fallback: RuleAction = "block",
): ValidationIssue | null {
  if (!rule?.enabled) return null;
  return { type, action: normalizeAction(rule.action || fallback), messageKey };
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function correctStreetTypos(address1: string) {
  const parts = address1.trim().split(/\s+/);
  if (parts.length === 0) return { value: address1, changed: false };
  const last = parts[parts.length - 1].replace(/[.,]/g, "").toLowerCase();
  if (STREET_SUFFIX[last]) {
    const original = parts[parts.length - 1];
    parts[parts.length - 1] = STREET_SUFFIX[last];
    return { value: parts.join(" "), changed: original !== STREET_SUFFIX[last] };
  }
  return { value: address1, changed: false };
}

export function correctCityName(city: string) {
  const key = city.trim().toLowerCase();
  if (CITY_CORRECTIONS[key] && CITY_CORRECTIONS[key].toLowerCase() !== key) {
    return { value: CITY_CORRECTIONS[key], changed: true };
  }
  // Only normalise casing when the customer typed all-lower or ALL-CAPS; mixed case such as
  // "McAllen" or "Saint-Denis" is already intentional and title-casing would corrupt it.
  const trimmed = city.trim();
  if (trimmed && (trimmed === trimmed.toLowerCase() || trimmed === trimmed.toUpperCase())) {
    const cased = titleCase(trimmed);
    return { value: cased, changed: cased !== city };
  }
  return { value: city, changed: false };
}

export function applyLocalCorrections(address: AddressInput) {
  const street = correctStreetTypos(address.address1);
  const city = correctCityName(address.city);
  const zip = address.country === "CA" ? address.zip.toUpperCase().replace(/^(\w{3})\s*(\w{3})$/, "$1 $2") : address.zip;
  const next = {
    ...address,
    address1: street.value,
    city: city.value,
    zip,
    country: address.country.toUpperCase(),
  };
  return { address: next, changed: street.changed || city.changed || zip !== address.zip };
}

export function runLocalRules(
  address: AddressInput,
  rules: MerchantRule[],
  poBoxRules?: PoBoxRuleInput[],
  context?: ValidationContext,
) {
  const map = ruleMap(rules);
  const issues: ValidationIssue[] = [];
  const push = (ruleKey: RuleKey, type: ValidationIssue["type"], messageKey: MessageKey) => {
    const created = issue(map.get(ruleKey), type, messageKey);
    if (created) issues.push(created);
  };

  const line = `${address.address1} ${address.address2 || ""}`.trim();
  const missingCore = !address.address1 || !address.city || !address.zip || !address.country;
  if (missingCore) push("detect_incomplete", "incomplete_address", "incomplete_address");

  if (isPoBox(line)) {
    const override = matchPoBoxRule(poBoxRules, address, context);
    if (override) {
      if (override.action !== "allow") {
        issues.push({
          type: "po_box_not_allowed",
          action: normalizeAction(override.action),
          messageKey: "po_box_not_allowed",
        });
      }
    } else {
      push("block_po_boxes", "po_box_not_allowed", "po_box_not_allowed");
    }
  }
  if (line && SPECIAL_CHARS.test(line)) {
    push("block_special_characters", "special_characters_not_allowed", "special_characters_not_allowed");
  }
  if (address.address1 && !HOUSE_NUMBER.test(address.address1) && !PO_BOX.test(line)) {
    push("require_house_number", "missing_house_number", "missing_house_number");
  }
  if (address.address1 && (address.address1.length < 3 || /^\d+$/.test(address.address1))) {
    push("validate_street_name", "invalid_street", "invalid_street");
  }
  if (address.city && address.city.length < 2) {
    push("validate_city_postal", "invalid_city", "invalid_city");
  }

  const postalPattern = POSTAL[address.country];
  if (address.zip && postalPattern && !postalPattern.test(address.zip)) {
    push("validate_postal_code", "invalid_postal_code", "invalid_postal_code");
  } else if (address.zip && !postalPattern && address.zip.length < 3) {
    push("validate_postal_code", "invalid_postal_code", "invalid_postal_code");
  }

  const hint = CITY_POSTAL_HINTS.find(
    (item) => item.country === address.country && item.zipPrefix.test(address.zip),
  );
  if (hint && address.city && hint.city.toLowerCase() !== address.city.toLowerCase()) {
    const cityLooksClose = hint.city.toLowerCase().includes(address.city.toLowerCase().slice(0, 4));
    if (cityLooksClose || address.city.length <= 3) {
      push("validate_city_postal", "city_postal_mismatch", "city_postal_mismatch");
    }
  }

  const typo = correctStreetTypos(address.address1);
  if (typo.changed) {
    const created = issue(map.get("auto_correct_typos"), "street_typo", "address_unverified", "fix");
    if (created) issues.push(created);
  }

  return issues;
}

export function suggestedFromLocal(address: AddressInput, issues: ValidationIssue[]) {
  const corrected = applyLocalCorrections(address).address;
  const hint = CITY_POSTAL_HINTS.find(
    (item) => item.country === address.country && item.zipPrefix.test(address.zip),
  );
  if (hint && issues.some((issueItem) => issueItem.type === "city_postal_mismatch")) {
    corrected.city = hint.city;
  }
  return corrected;
}
