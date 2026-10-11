/**
 * Colours for a calendar event chip.
 *
 * The event's colour identifies its kind through the left bar and a ~15%
 * tint; the title is always ink. Drawing the title in the accent colour over
 * its own tint put it near 3:1, below WCAG AA for 11-12px text, and a
 * user-picked focus colour could go lower still.
 */
export function eventChipColors(color: string): { backgroundColor: string; borderColor: string; textColor: string } {
  return {
    backgroundColor: `${color}26`, // ~15% alpha
    borderColor: color,
    textColor: "hsl(var(--foreground))",
  };
}
