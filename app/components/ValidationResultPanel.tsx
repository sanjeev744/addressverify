import { Banner, BlockStack, Card, Text } from "@shopify/polaris";
import type { ValidationResult } from "../services/validation/types";
import { formatAddress } from "../services/validation/types";

export function ValidationResultPanel({
  result,
  original,
}: {
  result: ValidationResult;
  original: string;
}) {
  const tone =
    result.actionTaken === "block"
      ? "critical"
      : result.status === "warning" || result.status === "unavailable"
        ? "warning"
        : "success";

  return (
    <Card>
      <BlockStack gap="300">
        <Banner title={result.messageTitle || "Validation result"} tone={tone}>
          <p>{result.messageBody}</p>
        </Banner>
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" tone="subdued">
            Result: {result.status} · Action: {result.actionTaken} · Confidence: {Math.round(result.confidence * 100)}% · Provider: {result.provider}
          </Text>
          <Text as="p" variant="bodyMd">
            Entered: {original}
          </Text>
          {result.suggested ? (
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              Suggested: {formatAddress(result.suggested)}
            </Text>
          ) : null}
          {result.errorTypes.length ? (
            <Text as="p" variant="bodySm">
              Issues: {result.errorTypes.join(", ")}
            </Text>
          ) : (
            <Text as="p" variant="bodySm">
              No issues found.
            </Text>
          )}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
