import { test, expect } from "@playwright/test";
import {
  maskPhonePeVirtualPaymentAddress,
  maskPhonePeUtr,
  normalizeUpiInstrumentVariant,
  formatUpiInstrumentVariantLabel,
  sanitizePhonePeLogIdentifiers,
} from "@shared/upi";
import { phonePeIdentifierFixture, phonePeLogFixture } from "@shared/__fixtures__/upi";

test.describe("PhonePe identifier masking", () => {
  test("applies masking to VPA and UTR values", () => {
    expect(maskPhonePeVirtualPaymentAddress(phonePeIdentifierFixture.vpa)).toBe(
      phonePeIdentifierFixture.maskedVpa
    );
    expect(maskPhonePeUtr(phonePeIdentifierFixture.utr)).toBe(phonePeIdentifierFixture.maskedUtr);
  });

  test("resolves readable instrument labels", () => {
    const variant = normalizeUpiInstrumentVariant(phonePeIdentifierFixture.variant);
    expect(variant).toBe(phonePeIdentifierFixture.variant);
    expect(formatUpiInstrumentVariantLabel(variant)).toBe(phonePeIdentifierFixture.label);
  });

  test("sanitizes log payloads to remove PII", () => {
    expect(sanitizePhonePeLogIdentifiers(phonePeLogFixture.raw)).toMatchObject(
      phonePeLogFixture.sanitized
    );
  });
});
