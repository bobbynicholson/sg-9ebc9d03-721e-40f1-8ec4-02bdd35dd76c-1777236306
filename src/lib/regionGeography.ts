// Geography data for region creation. Kept in TS so the form can render
// dependent dropdowns without a DB round-trip.

export type CountryCode = "ZA" | "GB" | "US";

export interface CountryConfig {
  code: CountryCode;
  name: string;
  defaultTimezone: string;
  defaultCurrency: string;
  /** Display label for the second-level admin division. */
  divisionLabel: string;
  divisions: string[];
}

export const COUNTRIES: CountryConfig[] = [
  {
    code: "ZA",
    name: "South Africa",
    defaultTimezone: "Africa/Johannesburg",
    defaultCurrency: "ZAR",
    divisionLabel: "Province",
    divisions: [
      "Eastern Cape",
      "Free State",
      "Gauteng",
      "KwaZulu-Natal",
      "Limpopo",
      "Mpumalanga",
      "Northern Cape",
      "North West",
      "Western Cape",
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    defaultTimezone: "Europe/London",
    defaultCurrency: "GBP",
    divisionLabel: "County / Region",
    divisions: [
      // England - historic + ceremonial counties (subset most catering ops use)
      "Bedfordshire",
      "Berkshire",
      "Bristol",
      "Buckinghamshire",
      "Cambridgeshire",
      "Cheshire",
      "Cornwall",
      "Cumbria",
      "Derbyshire",
      "Devon",
      "Dorset",
      "Durham",
      "East Riding of Yorkshire",
      "East Sussex",
      "Essex",
      "Gloucestershire",
      "Greater London",
      "Greater Manchester",
      "Hampshire",
      "Herefordshire",
      "Hertfordshire",
      "Isle of Wight",
      "Kent",
      "Lancashire",
      "Leicestershire",
      "Lincolnshire",
      "Merseyside",
      "Norfolk",
      "Northamptonshire",
      "Northumberland",
      "North Yorkshire",
      "Nottinghamshire",
      "Oxfordshire",
      "Rutland",
      "Shropshire",
      "Somerset",
      "South Yorkshire",
      "Staffordshire",
      "Suffolk",
      "Surrey",
      "Tyne and Wear",
      "Warwickshire",
      "West Midlands",
      "West Sussex",
      "West Yorkshire",
      "Wiltshire",
      "Worcestershire",
      // Scotland
      "Aberdeen",
      "Edinburgh",
      "Glasgow",
      "Highland",
      "Stirling",
      // Wales
      "Cardiff",
      "Swansea",
      "Newport",
      // Northern Ireland
      "Antrim",
      "Belfast",
      "Down",
    ],
  },
  {
    code: "US",
    name: "United States",
    defaultTimezone: "America/New_York",
    defaultCurrency: "USD",
    divisionLabel: "State",
    divisions: [
      "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
      "District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
      "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota",
      "Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
      "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon",
      "Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah",
      "Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming",
    ],
  },
];

export function getCountry(code: CountryCode): CountryConfig {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}
