export const RULE_KEYS = [
  "require_house_number",
  "block_po_boxes",
  "block_special_characters",
  "validate_postal_code",
  "validate_city_postal",
  "validate_street_name",
  "detect_incomplete",
  "detect_invalid",
  "auto_correct_typos",
] as const;

export type RuleKey = (typeof RULE_KEYS)[number];

/** Rules shown on the Validation Rules admin page (subset of RULE_KEYS). */
export const MERCHANT_RULE_KEYS = [
  "require_house_number",
  "block_po_boxes",
  "block_special_characters",
  "detect_incomplete",
  "auto_correct_typos",
] as const satisfies readonly RuleKey[];

export type MerchantRuleKey = (typeof MERCHANT_RULE_KEYS)[number];

/** Hidden from merchants — kept in schema but forced off on save from the rules page. */
export const HIDDEN_RULE_KEYS = RULE_KEYS.filter(
  (key) => !(MERCHANT_RULE_KEYS as readonly string[]).includes(key),
) as RuleKey[];
export type RuleAction = "allow" | "warn" | "fix" | "block" | "review";

export const RULE_ACTIONS: Array<{ label: string; value: RuleAction; help: string }> = [
  { label: "Allow", value: "allow", help: "Do not block checkout." },
  { label: "Warn", value: "warn", help: "Show a warning but allow checkout." },
  { label: "Fix", value: "fix", help: "Automatically attempt to correct the address." },
  { label: "Block", value: "block", help: "Prevent checkout until the issue is resolved." },
  { label: "Review", value: "review", help: "Allow the order, then mark it for merchant review." },
];

export function normalizeAction(action?: string | null): RuleAction {
  if (action === "auto_correct") return "fix";
  if (action === "allow" || action === "warn" || action === "fix" || action === "block" || action === "review") {
    return action;
  }
  return "block";
}

export const RULE_CATALOG: Record<
  RuleKey,
  { title: string; help: string; defaultEnabled: boolean; defaultAction: RuleAction }
> = {
  require_house_number: {
    title: "Require house number",
    help: "Flag addresses that have a street name but no detectable building number.",
    defaultEnabled: true,
    defaultAction: "block",
  },
  block_po_boxes: {
    title: "PO Boxes (default)",
    help: "Default PO Box behavior. Override this by country or shipping method on PO Box Rules.",
    defaultEnabled: true,
    defaultAction: "block",
  },
  block_special_characters: {
    title: "Block special characters",
    help: "Flag address lines that contain characters carriers often reject.",
    defaultEnabled: true,
    defaultAction: "warn",
  },
  validate_postal_code: {
    title: "Validate postal / ZIP code",
    help: "Check postal code format for the selected country.",
    defaultEnabled: false,
    defaultAction: "block",
  },
  validate_city_postal: {
    title: "Validate city + postal code",
    help: "Detect obvious city and postal code mismatches or city typos.",
    defaultEnabled: false,
    defaultAction: "warn",
  },
  validate_street_name: {
    title: "Validate street name",
    help: "Detect missing, too-short, or likely invalid street names.",
    defaultEnabled: false,
    defaultAction: "warn",
  },
  detect_incomplete: {
    title: "Detect incomplete addresses",
    help: "Require street, city, postal code, and country before checkout continues.",
    defaultEnabled: true,
    defaultAction: "block",
  },
  detect_invalid: {
    title: "Detect invalid addresses",
    help: "Treat addresses the provider cannot verify as invalid.",
    defaultEnabled: false,
    defaultAction: "review",
  },
  auto_correct_typos: {
    title: "Automatically correct common typos",
    help: "Normalize common street and city spelling mistakes.",
    defaultEnabled: true,
    defaultAction: "fix",
  },
};

export const MESSAGE_KEYS = [
  "missing_house_number",
  "invalid_postal_code",
  "invalid_city",
  "city_postal_mismatch",
  "po_box_not_allowed",
  "special_characters_not_allowed",
  "invalid_street",
  "incomplete_address",
  "address_unverified",
  "service_unavailable",
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

/** Customer messages shown on Settings (aligned with merchant-visible rules). */
export const MERCHANT_MESSAGE_KEYS = [
  "missing_house_number",
  "po_box_not_allowed",
  "special_characters_not_allowed",
  "incomplete_address",
  "service_unavailable",
] as const satisfies readonly MessageKey[];

export type MerchantMessageKey = (typeof MERCHANT_MESSAGE_KEYS)[number];

export const DEFAULT_MESSAGES: Record<MessageKey, { title: string; body: string }> = {
  missing_house_number: {
    title: "Address needs attention",
    body: "Please add a house or building number so we can deliver your order.",
  },
  invalid_postal_code: {
    title: "Address needs attention",
    body: "That postal code does not look valid for the selected country.",
  },
  invalid_city: {
    title: "Address needs attention",
    body: "Please check the city name.",
  },
  city_postal_mismatch: {
    title: "Address needs attention",
    body: "The city and postal code do not appear to match.",
  },
  po_box_not_allowed: {
    title: "Address needs attention",
    body: "We cannot ship to a PO Box or packing station.",
  },
  special_characters_not_allowed: {
    title: "Address needs attention",
    body: "Please remove special characters from the address.",
  },
  invalid_street: {
    title: "Address needs attention",
    body: "Please check the street name.",
  },
  incomplete_address: {
    title: "Address needs attention",
    body: "This address looks incomplete. Add the missing details to continue.",
  },
  address_unverified: {
    title: "Address needs attention",
    body: "Please enter a valid shipping address.",
  },
  service_unavailable: {
    title: "Address check delayed",
    body: "Address verification is temporarily unavailable. You can continue unless your store blocks checkout in this case.",
  },
};

export const LOCALES = ["en", "fr", "de", "es", "it"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
};

export const DEFAULT_TRANSLATIONS: Record<Exclude<AppLocale, "en">, Record<MessageKey, { title: string; body: string }>> = {
  fr: {
    missing_house_number: {
      title: "Adresse à vérifier",
      body: "Veuillez ajouter un numéro de maison ou de bâtiment.",
    },
    invalid_postal_code: {
      title: "Adresse à vérifier",
      body: "Ce code postal ne semble pas valide pour le pays sélectionné.",
    },
    invalid_city: { title: "Adresse à vérifier", body: "Veuillez vérifier le nom de la ville." },
    city_postal_mismatch: {
      title: "Adresse à vérifier",
      body: "La ville et le code postal ne semblent pas correspondre.",
    },
    po_box_not_allowed: {
      title: "Adresse à vérifier",
      body: "Nous ne pouvons pas livrer à une boîte postale.",
    },
    special_characters_not_allowed: {
      title: "Adresse à vérifier",
      body: "Veuillez retirer les caractères spéciaux de l'adresse.",
    },
    invalid_street: { title: "Adresse à vérifier", body: "Veuillez vérifier le nom de la rue." },
    incomplete_address: {
      title: "Adresse à vérifier",
      body: "Cette adresse est incomplète. Ajoutez les informations manquantes.",
    },
    address_unverified: {
      title: "Adresse à vérifier",
      body: "Veuillez saisir une adresse de livraison valide.",
    },
    service_unavailable: {
      title: "Vérification temporairement indisponible",
      body: "La vérification d'adresse est temporairement indisponible.",
    },
  },
  de: {
    missing_house_number: {
      title: "Adresse prüfen",
      body: "Bitte fügen Sie eine Haus- oder Gebäudenummer hinzu.",
    },
    invalid_postal_code: {
      title: "Adresse prüfen",
      body: "Diese Postleitzahl scheint für das gewählte Land ungültig zu sein.",
    },
    invalid_city: { title: "Adresse prüfen", body: "Bitte prüfen Sie den Ortsnamen." },
    city_postal_mismatch: {
      title: "Adresse prüfen",
      body: "Ort und Postleitzahl scheinen nicht zusammenzupassen.",
    },
    po_box_not_allowed: {
      title: "Adresse prüfen",
      body: "Wir können nicht an ein Postfach liefern.",
    },
    special_characters_not_allowed: {
      title: "Adresse prüfen",
      body: "Bitte entfernen Sie Sonderzeichen aus der Adresse.",
    },
    invalid_street: { title: "Adresse prüfen", body: "Bitte prüfen Sie den Straßennamen." },
    incomplete_address: {
      title: "Adresse prüfen",
      body: "Diese Adresse ist unvollständig. Bitte ergänzen Sie die fehlenden Angaben.",
    },
    address_unverified: {
      title: "Adresse prüfen",
      body: "Bitte geben Sie eine gültige Lieferadresse ein.",
    },
    service_unavailable: {
      title: "Prüfung vorübergehend nicht verfügbar",
      body: "Die Adressprüfung ist vorübergehend nicht verfügbar.",
    },
  },
  es: {
    missing_house_number: {
      title: "Revisa la dirección",
      body: "Añade un número de casa o edificio para poder entregar el pedido.",
    },
    invalid_postal_code: {
      title: "Revisa la dirección",
      body: "Ese código postal no parece válido para el país seleccionado.",
    },
    invalid_city: { title: "Revisa la dirección", body: "Comprueba el nombre de la ciudad." },
    city_postal_mismatch: {
      title: "Revisa la dirección",
      body: "La ciudad y el código postal no parecen coincidir.",
    },
    po_box_not_allowed: {
      title: "Revisa la dirección",
      body: "No podemos enviar a un apartado de correos.",
    },
    special_characters_not_allowed: {
      title: "Revisa la dirección",
      body: "Quita los caracteres especiales de la dirección.",
    },
    invalid_street: { title: "Revisa la dirección", body: "Comprueba el nombre de la calle." },
    incomplete_address: {
      title: "Revisa la dirección",
      body: "Esta dirección está incompleta. Añade los datos que faltan.",
    },
    address_unverified: {
      title: "Revisa la dirección",
      body: "Introduce una dirección de envío válida.",
    },
    service_unavailable: {
      title: "Comprobación no disponible",
      body: "La verificación de dirección no está disponible temporalmente.",
    },
  },
  it: {
    missing_house_number: {
      title: "Controlla l'indirizzo",
      body: "Aggiungi un numero civico per la consegna.",
    },
    invalid_postal_code: {
      title: "Controlla l'indirizzo",
      body: "Questo CAP non sembra valido per il Paese selezionato.",
    },
    invalid_city: { title: "Controlla l'indirizzo", body: "Controlla il nome della città." },
    city_postal_mismatch: {
      title: "Controlla l'indirizzo",
      body: "Città e CAP non sembrano corrispondere.",
    },
    po_box_not_allowed: {
      title: "Controlla l'indirizzo",
      body: "Non possiamo spedire a una casella postale.",
    },
    special_characters_not_allowed: {
      title: "Controlla l'indirizzo",
      body: "Rimuovi i caratteri speciali dall'indirizzo.",
    },
    invalid_street: { title: "Controlla l'indirizzo", body: "Controlla il nome della via." },
    incomplete_address: {
      title: "Controlla l'indirizzo",
      body: "Questo indirizzo è incompleto. Aggiungi i dati mancanti.",
    },
    address_unverified: {
      title: "Controlla l'indirizzo",
      body: "Inserisci un indirizzo di spedizione valido.",
    },
    service_unavailable: {
      title: "Verifica temporaneamente non disponibile",
      body: "La verifica dell'indirizzo non è al momento disponibile.",
    },
  },
};

export const ERROR_TYPE_LABELS: Record<string, string> = {
  missing_house_number: "Missing house number",
  invalid_postal_code: "Invalid postal code",
  invalid_city: "Invalid city",
  city_postal_mismatch: "City / postal mismatch",
  po_box_not_allowed: "PO Box",
  special_characters_not_allowed: "Special characters",
  invalid_street: "Invalid street",
  incomplete_address: "Incomplete address",
  address_unverified: "Could not verify",
  service_unavailable: "Service unavailable",
  street_typo: "Typo",
};

export const TAG_KEYS = [
  "address_valid",
  "address_fixed",
  "address_invalid",
  "address_missing_house_number",
  "address_po_box",
  "address_special_character",
  "address_typo_corrected",
  "address_unconfirmed",
  "address_review",
] as const;

export type TagKey = (typeof TAG_KEYS)[number];

export const DEFAULT_TAGS: Record<TagKey, string> = {
  address_valid: "address_valid",
  address_fixed: "address_fixed",
  address_invalid: "address_invalid",
  address_missing_house_number: "address_missing_house_number",
  address_po_box: "address_po_box",
  address_special_character: "address_special_character",
  address_typo_corrected: "address_typo_corrected",
  address_unconfirmed: "address_unconfirmed",
  address_review: "address_review",
};

export const TAG_LABELS: Record<TagKey, string> = {
  address_valid: "Valid address",
  address_fixed: "Address automatically fixed",
  address_invalid: "Invalid address",
  address_missing_house_number: "Missing house number",
  address_po_box: "PO Box detected",
  address_special_character: "Special characters",
  address_typo_corrected: "Typo corrected",
  address_unconfirmed: "Unconfirmed address",
  address_review: "Needs review",
};

export type DatePreset = "today" | "7d" | "30d" | "90d" | "custom";

export function rangeFromPreset(preset: DatePreset, start?: string, end?: string) {
  const now = new Date();
  const parsedEnd = end ? new Date(`${end}T23:59:59.999`) : null;
  const to = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : now;
  const parsedStart = start ? new Date(`${start}T00:00:00.000`) : null;
  if (preset === "custom" && parsedStart && !Number.isNaN(parsedStart.getTime())) {
    return parsedStart <= to ? { from: parsedStart, to } : { from: to, to: parsedStart };
  }
  const from = new Date(to);
  if (preset === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (preset === "7d") {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (preset === "90d") {
    from.setDate(from.getDate() - 89);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

export function normalizeLocale(locale?: string | null): AppLocale {
  const prefix = (locale || "en").toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(prefix) ? (prefix as AppLocale) : "en";
}
