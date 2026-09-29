// @ts-check

/**
 * Cart and Checkout Validation Function.
 * Enforces deterministic merchant rules at checkout submission, including express wallets.
 * External provider calls are not available here; those run in the Remix app.
 */

const PO_BOX =
  /\b(p\.?\s*o\.?\s*box|post\s*office\s*box|postfach|packstation|paketbox|packing\s*station|parcel\s*locker)\b|\bp\.?\s*o\.?\s*b\.?\s*\d|^\s*box\s*#?\s*\d/i;

/** Mirrors RULE_CATALOG defaults so checkout is still protected before the config metafield syncs. */
const DEFAULT_RULES = {
  require_house_number: { ruleKey: "require_house_number", enabled: true, action: "block" },
  block_po_boxes: { ruleKey: "block_po_boxes", enabled: true, action: "block" },
  block_special_characters: { ruleKey: "block_special_characters", enabled: true, action: "warn" },
  detect_incomplete: { ruleKey: "detect_incomplete", enabled: true, action: "block" },
};
const HOUSE_NUMBER = /(?:^|\s)\d+[a-zA-Z]?(?:\s*[-\/]\s*\d+[a-zA-Z]?)?/;
const SPECIAL_CHARS = /[<>^*{}|\\~`#$]/;

const POSTAL = {
  US: /^\d{5}(?:-\d{4})?$/,
  CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,
  DE: /^\d{5}$/,
  IN: /^\d{6}$/,
  AU: /^\d{4}$/,
  FR: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Z]{2}$/i,
};

/**
 * @param {any} input
 */
export function cartValidationsGenerateRun(input) {
  const config = input?.shop?.metafield?.jsonValue || {};
  const errors = [];

  if (config.validationEnabled === false) {
    return { operations: [{ validationAdd: { errors } }] };
  }

  const rules =
    Array.isArray(config.rules) && config.rules.length
      ? Object.fromEntries(config.rules.map((rule) => [rule.ruleKey, rule]))
      : DEFAULT_RULES;
  const messages = config.messages || {};
  const groups = input?.cart?.deliveryGroups || [];

  groups.forEach((group, index) => {
    const address = group.deliveryAddress;
    if (!address) return;
    // Store pickup / pickup points carry the location's address, not the customer's.
    const methodType = group.selectedDeliveryOption?.deliveryMethodType;
    if (methodType && methodType !== "SHIPPING" && methodType !== "LOCAL") return;
    const target = `$.cart.deliveryGroups[${index}].deliveryAddress`;
    const line = `${address.address1 || ""} ${address.address2 || ""}`.trim();

    addError(errors, rules, messages, "detect_incomplete", "incomplete_address", target, () => {
      return !address.address1 || !address.city || !address.zip || !address.countryCode;
    });
    const shippingMethod = group.selectedDeliveryOption?.title || "";
    // PO Box page rules override the default rule, so they are evaluated outside addError's
    // "default rule enabled + block" gate.
    if (PO_BOX.test(line) && poBoxShouldBlock(config.poBoxRules, address.countryCode, shippingMethod, rules)) {
      errors.push({
        message: messages.po_box_not_allowed?.body || defaultMessage("po_box_not_allowed"),
        target: `${target}.address1`,
      });
    }
    addError(
      errors,
      rules,
      messages,
      "block_special_characters",
      "special_characters_not_allowed",
      `${target}.address1`,
      () => Boolean(line && SPECIAL_CHARS.test(line)),
    );
    addError(errors, rules, messages, "require_house_number", "missing_house_number", `${target}.address1`, () => {
      return Boolean(address.address1 && !HOUSE_NUMBER.test(address.address1) && !PO_BOX.test(line));
    });
    addError(errors, rules, messages, "validate_street_name", "invalid_street", `${target}.address1`, () => {
      return Boolean(address.address1 && (address.address1.length < 3 || /^\d+$/.test(address.address1)));
    });
    addError(errors, rules, messages, "validate_postal_code", "invalid_postal_code", `${target}.zip`, () => {
      const pattern = POSTAL[address.countryCode];
      if (!address.zip) return false;
      if (pattern) return !pattern.test(address.zip);
      return address.zip.length < 3;
    });
  });

  return {
    operations: [
      {
        validationAdd: {
          errors,
        },
      },
    ],
  };
}

function poBoxShouldBlock(poBoxRules, country, shippingMethod, rules) {
  const method = String(shippingMethod || "").toLowerCase();
  const matches = (poBoxRules || []).filter((rule) => {
    if (!rule?.enabled) return false;
    if (rule.country && String(rule.country).toUpperCase() !== country) return false;
    if (rule.shippingMethod && (!method || !method.includes(String(rule.shippingMethod).toLowerCase()))) {
      return false;
    }
    // Shipping zone is not available to functions; zone-scoped rules are enforced in the app only.
    if (rule.shippingZone) return false;
    return true;
  });
  // Same precedence as the app: country and shipping method are the most specific.
  const score = (rule) => (rule.country ? 2 : 0) + (rule.shippingMethod ? 2 : 0);
  matches.sort((a, b) => score(b) - score(a));
  if (matches[0]) return matches[0].action === "block";
  const fallback = rules.block_po_boxes;
  return Boolean(fallback?.enabled) && fallback.action === "block";
}

function addError(errors, rules, messages, ruleKey, messageKey, target, matches) {
  const rule = rules[ruleKey];
  if (!rule?.enabled || rule.action !== "block") return;
  if (!matches()) return;
  errors.push({
    message: messages[messageKey]?.body || defaultMessage(messageKey),
    target,
  });
}

function defaultMessage(messageKey) {
  const defaults = {
    incomplete_address: "This address looks incomplete.",
    po_box_not_allowed: "We cannot ship to a PO Box or packing station.",
    special_characters_not_allowed: "Please remove special characters from the address.",
    missing_house_number: "Please add a house or building number.",
    invalid_street: "Please check the street name.",
    invalid_postal_code: "That postal code does not look valid.",
  };
  return defaults[messageKey] || "Address needs attention.";
}
