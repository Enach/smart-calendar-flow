/**
 * PAC-122 SF-024: the write succeeded and only the follow-up re-read failed.
 * Never shown as a failed write (a retry would repeat it); the caller says
 * the write happened and refreshes. `cause` is the re-read's error.
 */
export class SavedButNotReadError extends Error {
  readonly cause: unknown;
  /** The saved object's id when the write's answer named it (a created team). */
  readonly savedId?: string;
  constructor(cause: unknown, savedId?: string) {
    super("Saved, but Paceday could not load the result yet.");
    this.name = "SavedButNotReadError";
    this.cause = cause;
    this.savedId = savedId;
  }
}

export function isSavedButNotRead(e: unknown): e is SavedButNotReadError {
  return e instanceof SavedButNotReadError;
}

/** Runs the re-read that follows a successful write; its failure is a SavedButNotReadError. */
export async function readBack<T>(read: () => Promise<T>, savedId?: string): Promise<T> {
  try {
    return await read();
  } catch (e) {
    throw new SavedButNotReadError(e, savedId);
  }
}
