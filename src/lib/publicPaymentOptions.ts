/** EFT is a public payment option only when online checkout is unavailable. */
export function isManualEftAvailable(
  onlineAvailable: boolean,
  eftDetailsAvailable: boolean,
): boolean {
  return !onlineAvailable && eftDetailsAvailable;
}
