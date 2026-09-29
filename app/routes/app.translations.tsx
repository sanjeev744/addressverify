import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { Banner, BlockStack, Card, FormLayout, Select, Text, TextField } from "@shopify/polaris";
import { AppPage } from "../components/AppPage";
import { useMemo, useState } from "react";
import {
  DEFAULT_MESSAGES,
  DEFAULT_TRANSLATIONS,
  LOCALES,
  LOCALE_LABELS,
  MESSAGE_KEYS,
  type AppLocale,
} from "../lib/defaults";
import { ensureShopDefaults, saveTranslations } from "../services/shop.server";
import { syncShopConfig } from "../services/shopify-sync.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundle = await ensureShopDefaults(session.shop);
  return { translations: bundle.translations, messages: bundle.messages };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const requested = String(form.get("locale") || "fr");
  const locale = ((LOCALES as readonly string[]).includes(requested) ? requested : "fr") as AppLocale;
  // A blank field would otherwise show customers an empty message; fall back to the default copy.
  const defaults = locale === "en" ? DEFAULT_MESSAGES : DEFAULT_TRANSLATIONS[locale];
  await saveTranslations(
    session.shop,
    MESSAGE_KEYS.map((key) => ({
      messageKey: key,
      locale,
      title: String(form.get(`${key}:title`) || "").trim() || defaults[key].title,
      body: String(form.get(`${key}:body`) || "").trim() || defaults[key].body,
    })),
  );
  await syncShopConfig(admin, session.shop);
  return redirect(`/app/translations?locale=${locale}&saved=1`);
};

export default function TranslationsPage() {
  const { translations, messages } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [locale, setLocale] = useState<AppLocale>("fr");
  const draft = useMemo(() => {
    return Object.fromEntries(
      MESSAGE_KEYS.map((key) => {
        const saved = translations.find((item) => item.messageKey === key && item.locale === locale);
        const fallback =
          locale === "en"
            ? messages.find((item) => item.messageKey === key) || DEFAULT_MESSAGES[key]
            : DEFAULT_TRANSLATIONS[locale as Exclude<AppLocale, "en">]?.[key] || DEFAULT_MESSAGES[key];
        return [key, { title: saved?.title || fallback.title, body: saved?.body || fallback.body }];
      }),
    );
  }, [locale, translations, messages]);
  const [copy, setCopy] = useState(draft);

  const changeLocale = (next: AppLocale) => {
    setLocale(next);
    const nextDraft = Object.fromEntries(
      MESSAGE_KEYS.map((key) => {
        const saved = translations.find((item) => item.messageKey === key && item.locale === next);
        const fallback =
          next === "en"
            ? messages.find((item) => item.messageKey === key) || DEFAULT_MESSAGES[key]
            : DEFAULT_TRANSLATIONS[next as Exclude<AppLocale, "en">]?.[key] || DEFAULT_MESSAGES[key];
        return [key, { title: saved?.title || fallback.title, body: saved?.body || fallback.body }];
      }),
    );
    setCopy(nextDraft);
  };

  const save = () => {
    const data = new FormData();
    data.set("locale", locale);
    for (const key of MESSAGE_KEYS) {
      data.set(`${key}:title`, copy[key].title);
      data.set(`${key}:body`, copy[key].body);
    }
    submit(data, { method: "post" });
  };

  return (
    <AppPage
      title="Translations"
      subtitle="Customer-facing checkout copy follows the store or buyer language. Validation logic stays the same."
      primaryAction={{ content: "Save translations", onAction: save }}
    >
      <BlockStack gap="400">
        {typeof window !== "undefined" && window.location.search.includes("saved=1") ? <Banner tone="success" title="Translations saved" /> : null}
        <Card>
          <Select
            label="Language"
            options={LOCALES.map((item) => ({ label: LOCALE_LABELS[item], value: item }))}
            value={locale}
            onChange={(value) => changeLocale(value as AppLocale)}
          />
        </Card>
        <Card>
          <BlockStack gap="400">
            {MESSAGE_KEYS.map((key) => (
              <FormLayout key={key}>
                <Text as="h3" variant="headingSm">{key.replaceAll("_", " ")}</Text>
                <TextField label="Title" value={copy[key].title} onChange={(title) => setCopy((current) => ({ ...current, [key]: { ...current[key], title } }))} autoComplete="off" />
                <TextField label="Message" value={copy[key].body} onChange={(body) => setCopy((current) => ({ ...current, [key]: { ...current[key], body } }))} multiline={2} autoComplete="off" />
              </FormLayout>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </AppPage>
  );
}
