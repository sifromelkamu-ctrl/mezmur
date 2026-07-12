// ISO 3166-1 alpha-2 code + international dial code for every country,
// used by the phone sign-up/login country picker. Flags are computed from
// the ISO code (regional indicator symbols) rather than stored, so this
// stays a plain data table.
export interface Country {
  name: string;
  code: string; // ISO 3166-1 alpha-2
  dialCode: string; // e.g. "+1"
}

export function countryFlagEmoji(isoCode: string): string {
  return isoCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export const COUNTRIES: Country[] = [
  { name: "Ethiopia", code: "ET", dialCode: "+251" },
  { name: "United States", code: "US", dialCode: "+1" },
  { name: "United Kingdom", code: "GB", dialCode: "+44" },
  { name: "Canada", code: "CA", dialCode: "+1" },
  { name: "Kenya", code: "KE", dialCode: "+254" },
  { name: "Eritrea", code: "ER", dialCode: "+291" },
  { name: "Sudan", code: "SD", dialCode: "+249" },
  { name: "South Sudan", code: "SS", dialCode: "+211" },
  { name: "Somalia", code: "SO", dialCode: "+252" },
  { name: "Djibouti", code: "DJ", dialCode: "+253" },
  { name: "Egypt", code: "EG", dialCode: "+20" },
  { name: "Nigeria", code: "NG", dialCode: "+234" },
  { name: "Ghana", code: "GH", dialCode: "+233" },
  { name: "South Africa", code: "ZA", dialCode: "+27" },
  { name: "Tanzania", code: "TZ", dialCode: "+255" },
  { name: "Uganda", code: "UG", dialCode: "+256" },
  { name: "Rwanda", code: "RW", dialCode: "+250" },
  { name: "Germany", code: "DE", dialCode: "+49" },
  { name: "France", code: "FR", dialCode: "+33" },
  { name: "Italy", code: "IT", dialCode: "+39" },
  { name: "Spain", code: "ES", dialCode: "+34" },
  { name: "Netherlands", code: "NL", dialCode: "+31" },
  { name: "Sweden", code: "SE", dialCode: "+46" },
  { name: "Norway", code: "NO", dialCode: "+47" },
  { name: "Denmark", code: "DK", dialCode: "+45" },
  { name: "Switzerland", code: "CH", dialCode: "+41" },
  { name: "Austria", code: "AT", dialCode: "+43" },
  { name: "Belgium", code: "BE", dialCode: "+32" },
  { name: "Ireland", code: "IE", dialCode: "+353" },
  { name: "Portugal", code: "PT", dialCode: "+351" },
  { name: "Poland", code: "PL", dialCode: "+48" },
  { name: "Greece", code: "GR", dialCode: "+30" },
  { name: "Finland", code: "FI", dialCode: "+358" },
  { name: "Israel", code: "IL", dialCode: "+972" },
  { name: "Saudi Arabia", code: "SA", dialCode: "+966" },
  { name: "United Arab Emirates", code: "AE", dialCode: "+971" },
  { name: "Qatar", code: "QA", dialCode: "+974" },
  { name: "Kuwait", code: "KW", dialCode: "+965" },
  { name: "Jordan", code: "JO", dialCode: "+962" },
  { name: "Lebanon", code: "LB", dialCode: "+961" },
  { name: "Turkey", code: "TR", dialCode: "+90" },
  { name: "India", code: "IN", dialCode: "+91" },
  { name: "Pakistan", code: "PK", dialCode: "+92" },
  { name: "Bangladesh", code: "BD", dialCode: "+880" },
  { name: "China", code: "CN", dialCode: "+86" },
  { name: "Japan", code: "JP", dialCode: "+81" },
  { name: "South Korea", code: "KR", dialCode: "+82" },
  { name: "Philippines", code: "PH", dialCode: "+63" },
  { name: "Indonesia", code: "ID", dialCode: "+62" },
  { name: "Malaysia", code: "MY", dialCode: "+60" },
  { name: "Singapore", code: "SG", dialCode: "+65" },
  { name: "Thailand", code: "TH", dialCode: "+66" },
  { name: "Vietnam", code: "VN", dialCode: "+84" },
  { name: "Australia", code: "AU", dialCode: "+61" },
  { name: "New Zealand", code: "NZ", dialCode: "+64" },
  { name: "Brazil", code: "BR", dialCode: "+55" },
  { name: "Mexico", code: "MX", dialCode: "+52" },
  { name: "Argentina", code: "AR", dialCode: "+54" },
  { name: "Chile", code: "CL", dialCode: "+56" },
  { name: "Colombia", code: "CO", dialCode: "+57" },
  { name: "Peru", code: "PE", dialCode: "+51" },
  { name: "Russia", code: "RU", dialCode: "+7" },
  { name: "Ukraine", code: "UA", dialCode: "+380" },
  { name: "Morocco", code: "MA", dialCode: "+212" },
  { name: "Algeria", code: "DZ", dialCode: "+213" },
  { name: "Tunisia", code: "TN", dialCode: "+216" },
  { name: "Zimbabwe", code: "ZW", dialCode: "+263" },
  { name: "Zambia", code: "ZM", dialCode: "+260" },
  { name: "Malawi", code: "MW", dialCode: "+265" },
  { name: "Mozambique", code: "MZ", dialCode: "+258" },
  { name: "Botswana", code: "BW", dialCode: "+267" },
  { name: "Namibia", code: "NA", dialCode: "+264" },
  { name: "Senegal", code: "SN", dialCode: "+221" },
  { name: "Ivory Coast", code: "CI", dialCode: "+225" },
  { name: "Cameroon", code: "CM", dialCode: "+237" },
  { name: "Democratic Republic of the Congo", code: "CD", dialCode: "+243" },
];

export function findCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

// Best-effort auto-detection using the browser/OS locale's region subtag
// (e.g. "en-ET" -> "ET") — no geolocation permission prompt, no IP lookup,
// so it's instant and privacy-friendly, at the cost of only reflecting the
// device's language/region setting rather than true physical location.
export function detectCountryFromLocale(): Country | undefined {
  const locales = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const locale of locales) {
    const region = locale.split("-")[1];
    if (!region) continue;
    const match = findCountryByCode(region.toUpperCase());
    if (match) return match;
  }
  return undefined;
}
