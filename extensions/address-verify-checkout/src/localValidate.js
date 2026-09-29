const HOUSE_NUMBER = /(?:^|\s)\d+[a-zA-Z]?(?:\s*[-\/]\s*\d+[a-zA-Z]?)?/;
const PO_BOX =
  /\b(p\.?\s*o\.?\s*box|post\s*office\s*box|postfach|packstation|paketbox|packing\s*station|parcel\s*locker)\b|\bp\.?\s*o\.?\s*b\.?\s*\d|^\s*box\s*#?\s*\d/i;
const SPECIAL_CHARS = /[<>^*{}|\\~`#$]/;

const STREET_SUFFIX = {
  stret: "Street",
  streeet: "Street",
  strt: "Street",
  st: "Street",
  avenu: "Avenue",
  aveune: "Avenue",
  ave: "Avenue",
  rd: "Road",
  rode: "Road",
  raod: "Road",
  blvd: "Boulevard",
  ln: "Lane",
  dr: "Drive",
};

const CITY_CORRECTIONS = {
  "new yrok": "New York",
  "new yorkk": "New York",
  "los angles": "Los Angeles",
  "san fransisco": "San Francisco",
  seatte: "Seattle",
  chigago: "Chicago",
  bangalore: "Bengaluru",
};

const DEFAULT_MESSAGES = {
  missing_house_number: {
    title: "Your address is not verified",
    body: "Please add a house or building number so we can deliver your order.",
  },
  incomplete_address: {
    title: "Your address is not verified",
    body: "We were not able to validate your address. Please recheck your shipping address.",
  },
  po_box_not_allowed: {
    title: "Your address is not verified",
    body: "We cannot ship to a PO Box or packing station.",
  },
  special_characters_not_allowed: {
    title: "Your address is not verified",
    body: "Please remove special characters from the address.",
  },
  invalid_street: {
    title: "Your address is not verified",
    body: "Please check the street name.",
  },
  invalid_postal_code: {
    title: "Your address is not verified",
    body: "That postal code does not look valid for the selected country.",
  },
  address_unverified: {
    title: "Your address is not verified",
    body: "We were not able to validate your address. Please recheck your shipping address.",
  },
};

function ruleEnabled(rules, key) {
  if (!Array.isArray(rules) || !rules.length) return true;
  const rule = rules.find((item) => item.ruleKey === key || item.key === key);
  if (!rule) return false;
  return rule.enabled !== false;
}

function correctStreet(address1) {
  const parts = String(address1 || "")
    .trim()
    .split(/\s+/);
  if (!parts.length) return { value: address1 || "", changed: false };
  const last = parts[parts.length - 1].replace(/[.,]/g, "").toLowerCase();
  if (STREET_SUFFIX[last]) {
    parts[parts.length - 1] = STREET_SUFFIX[last];
    return { value: parts.join(" "), changed: true };
  }
  return { value: address1 || "", changed: false };
}

function correctCity(city) {
  const key = String(city || "")
    .trim()
    .toLowerCase();
  if (CITY_CORRECTIONS[key]) {
    return { value: CITY_CORRECTIONS[key], changed: CITY_CORRECTIONS[key].toLowerCase() !== key };
  }
  return { value: city || "", changed: false };
}

/**
 * Local thank-you validation. Uses shop metafield rules when present.
 * Does not call the network.
 */
export function validateAddressLocally(rawAddress, config = {}) {
  const address = {
    address1: rawAddress?.address1 || "",
    address2: rawAddress?.address2 || "",
    city: rawAddress?.city || "",
    province: rawAddress?.province || rawAddress?.provinceCode || "",
    zip: rawAddress?.zip || "",
    country: String(rawAddress?.country || rawAddress?.countryCode || "").toUpperCase(),
  };

  const rules = config.rules || [];
  const messages = { ...DEFAULT_MESSAGES, ...(config.messages || {}) };
  const line = `${address.address1} ${address.address2}`.trim();
  const issues = [];

  const missingCore = !address.address1 || !address.city || !address.zip || !address.country;
  if (missingCore && ruleEnabled(rules, "detect_incomplete")) {
    issues.push("incomplete_address");
  }
  if (!missingCore && !address.address1 && !address.zip) {
    issues.push("incomplete_address");
  }
  if (line && PO_BOX.test(line) && ruleEnabled(rules, "block_po_boxes")) {
    issues.push("po_box_not_allowed");
  }
  if (line && SPECIAL_CHARS.test(line) && ruleEnabled(rules, "block_special_characters")) {
    issues.push("special_characters_not_allowed");
  }
  if (
    address.address1 &&
    !HOUSE_NUMBER.test(address.address1) &&
    !PO_BOX.test(line) &&
    ruleEnabled(rules, "require_house_number")
  ) {
    issues.push("missing_house_number");
  }
  if (
    address.address1 &&
    (address.address1.length < 3 || /^\d+$/.test(address.address1)) &&
    ruleEnabled(rules, "validate_street_name")
  ) {
    issues.push("invalid_street");
  }
  if (address.country === "US" && address.zip && !/^\d{5}(?:-\d{4})?$/.test(address.zip)) {
    if (ruleEnabled(rules, "validate_postal_code")) issues.push("invalid_postal_code");
  }
  if (address.country === "IN" && address.zip && !/^\d{6}$/.test(address.zip)) {
    if (ruleEnabled(rules, "validate_postal_code")) issues.push("invalid_postal_code");
  }

  const streetFix = correctStreet(address.address1);
  const cityFix = correctCity(address.city);
  const suggested =
    streetFix.changed || cityFix.changed
      ? {
          ...address,
          address1: streetFix.value,
          city: cityFix.value,
        }
      : null;

  if (!issues.length && !suggested) {
    // Still show unverified when address data is missing/redacted on Thank You.
    if (!address.address1 && !address.zip) {
      const copy = messages.incomplete_address || DEFAULT_MESSAGES.incomplete_address;
      return {
        valid: false,
        status: "invalid",
        messageTitle: copy.title,
        messageBody: copy.body,
        suggested: null,
        address,
        enabled: true,
      };
    }
    return {
      valid: true,
      status: "valid",
      messageTitle: null,
      messageBody: null,
      suggested: null,
      address,
      enabled: true,
    };
  }

  if (!issues.length && suggested) {
    issues.push("address_unverified");
  }

  const key = issues[0] || "address_unverified";
  const copy = messages[key] || DEFAULT_MESSAGES[key] || DEFAULT_MESSAGES.address_unverified;

  return {
    valid: false,
    status: "invalid",
    messageTitle: copy.title || DEFAULT_MESSAGES.address_unverified.title,
    messageBody: copy.body || DEFAULT_MESSAGES.address_unverified.body,
    suggested,
    address,
    enabled: true,
  };
}
