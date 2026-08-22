/** A rejected/no-speech attempt must not consume the selection image. The
 * caller clears the pending selection only after ASR admits real speech, so a
 * later real utterance can still reference the same source. */
export function pendingVoiceSelectionFiles(
  pending: { file: File } | null,
): File[] {
  return pending ? [pending.file] : [];
}
