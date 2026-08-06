import type { BookingProfile } from "./BookingProfile.js";

export interface ProviderFieldDefinition {
  profileKey: keyof BookingProfile;
  label: string;
  selector: string;
  htmlName: string;
  htmlId: string;
  inputType: "text" | "email" | "tel";
  required: boolean;
  placeholder: string;
  pattern: string;
  autocomplete: string;
}

/**
 * Observed on denhaag.mijnafspraakmaken.nl for product 35 on 2026-08-06.
 * The provider emitted empty name attributes, so selectors use observed IDs.
 * Callers should verify labels and IDs before any future auto-fill operation.
 */
export const theHagueProviderFieldMapping: readonly ProviderFieldDefinition[] = [
  { profileKey: "initials", label: "Voorletters", selector: "#field_0_0", htmlName: "", htmlId: "field_0_0", inputType: "text", required: true, placeholder: "", pattern: "", autocomplete: "off" },
  { profileKey: "firstName", label: "Voornaam", selector: "#field_1_0", htmlName: "", htmlId: "field_1_0", inputType: "text", required: false, placeholder: "", pattern: "", autocomplete: "given-name" },
  { profileKey: "namePrefix", label: "Tussenvoegsels", selector: "#field_2_0", htmlName: "", htmlId: "field_2_0", inputType: "text", required: false, placeholder: "", pattern: "", autocomplete: "off" },
  { profileKey: "lastName", label: "Achternaam", selector: "#field_3_0", htmlName: "", htmlId: "field_3_0", inputType: "text", required: true, placeholder: "", pattern: "", autocomplete: "family-name" },
  { profileKey: "street", label: "Straatnaam", selector: "#field_4_0", htmlName: "", htmlId: "field_4_0", inputType: "text", required: true, placeholder: "", pattern: "", autocomplete: "street-address" },
  { profileKey: "houseNumber", label: "Huisnummer", selector: "#field_5_0", htmlName: "", htmlId: "field_5_0", inputType: "text", required: true, placeholder: "", pattern: "", autocomplete: "off" },
  { profileKey: "houseNumberAddition", label: "Toevoeging", selector: "#field_6_0", htmlName: "", htmlId: "field_6_0", inputType: "text", required: false, placeholder: "", pattern: "", autocomplete: "off" },
  { profileKey: "city", label: "Plaatsnaam", selector: "#field_7_0", htmlName: "", htmlId: "field_7_0", inputType: "text", required: true, placeholder: "", pattern: "", autocomplete: "address-level2" },
  { profileKey: "email", label: "E-mailadres", selector: "#field-default-8_0", htmlName: "", htmlId: "field-default-8_0", inputType: "email", required: true, placeholder: "", pattern: "", autocomplete: "email" },
  { profileKey: "birthDate", label: "Geboortedatum (dd-mm-jjjj)", selector: "#field_9_0", htmlName: "", htmlId: "field_9_0", inputType: "text", required: true, placeholder: "", pattern: "", autocomplete: "bday" },
  { profileKey: "mobilePhone", label: "Mobiel nummer", selector: "#field_10_0", htmlName: "", htmlId: "field_10_0", inputType: "tel", required: true, placeholder: "", pattern: "", autocomplete: "tel" }
] as const;
