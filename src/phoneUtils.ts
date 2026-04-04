export type PhoneType = "mobile" | "fixe" | null;

export function classifyPhone(phone: string | null): PhoneType {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s.+()-]/g, "");
  // Normalise +33XXXXXXXXX, 33XXXXXXXXX et 0033XXXXXXXXX vers 0XXXXXXXXX
  const withoutCountryCode = cleaned.replace(/^00/, "");
  const normalized =
    withoutCountryCode.startsWith("33") && withoutCountryCode.length === 11
      ? "0" + withoutCountryCode.slice(2)
      : cleaned;
  if (/^0[67]/.test(normalized)) return "mobile";
  if (/^0[1-59]/.test(normalized)) return "fixe";
  return null;
}

const MOBILE_SQL = "(telephone LIKE '06%' OR telephone LIKE '07%' OR telephone LIKE '+336%' OR telephone LIKE '+337%' OR telephone LIKE '336%' OR telephone LIKE '337%')";

export function phoneTypeCondition(phoneType: "mobile" | "fixe"): string {
  if (phoneType === "mobile") return MOBILE_SQL;
  return `(telephone IS NOT NULL AND telephone != '' AND NOT ${MOBILE_SQL})`;
}
