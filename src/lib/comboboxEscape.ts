/**
 * For a Radix `DialogContent onEscapeKeyDown`: Escape pressed in a combobox
 * whose suggestion list is open closes that list, not the whole dialog.
 *
 * Radix listens for Escape on the document in the capture phase, so it sees
 * the key before the combobox's own handler and while `aria-expanded` still
 * says the list is open.
 */
export function keepDialogOpenForOpenCombobox(event: KeyboardEvent): void {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.getAttribute("role") === "combobox" &&
    target.getAttribute("aria-expanded") === "true"
  ) {
    event.preventDefault();
  }
}
