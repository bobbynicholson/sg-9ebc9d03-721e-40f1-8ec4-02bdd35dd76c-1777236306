export const LEAD_EVENT_TYPE_OPTIONS = [
  { value: "year_end", label: "Year-End" },
  { value: "team_building", label: "Team Building" },
  { value: "corporate", label: "Corporate" },
  { value: "birthday", label: "Birthday" },
  { value: "confirmation", label: "Confirmation" },
  { value: "baptism", label: "Baptism" },
  { value: "wedding", label: "Wedding" },
  { value: "bachelors", label: "Bachelors" },
  { value: "bachelorettes", label: "Bachelorettes" },
  { value: "anniversary", label: "Anniversary" },
  { value: "graduation", label: "Graduation" },
  { value: "reunion", label: "Reunion" },
  { value: "holy_communion", label: "1st Holy Communion" },
  { value: "other", label: "Other" },
];

export const LEAD_EVENT_TYPE_LABELS = LEAD_EVENT_TYPE_OPTIONS.map(({ label }) => label);

export function normalizeLeadEventTypeOptions(fields: any[]): any[] {
  return fields.map((field) =>
    field?.id === "event_type" && (field.type === "select" || field.type === "radio")
      ? { ...field, options: LEAD_EVENT_TYPE_OPTIONS }
      : field,
  );
}