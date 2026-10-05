/** Reveal a linked or invalid field without unmounting the user's other work. */
export function revealSection(target: HTMLElement | null, focus = false): void {
  if (!target) return;
  let parent: HTMLElement | null = target;
  while (parent) {
    if (parent.tagName === "DETAILS") (parent as HTMLDetailsElement).open = true;
    if (parent.hasAttribute("data-collapsible")) {
      parent.dispatchEvent(new CustomEvent("ui:expand-section"));
    }
    parent = parent.parentElement;
  }
  // React commits the disclosure before scrolling/focusing the hidden field.
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (focus) {
      const field = target.matches('input,textarea,select,button,[tabindex]')
        ? target
        : target.querySelector<HTMLElement>('input,textarea,select,button,[tabindex]');
      field?.focus({ preventScroll: true });
    }
  });
}
