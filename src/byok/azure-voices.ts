import { tr } from "@/i18n";

/**
 * Native US English Azure AI Speech voices offered to learners. Ana is a
 * child's voice; the others are friendly adult voices. Any other Azure voice
 * name can still be entered as a custom voice.
 */
export const AZURE_VOICES: readonly { id: string; name: () => string }[] = [
  { id: "en-US-AnaNeural", name: () => tr("Ana (child)") },
  { id: "en-US-AvaNeural", name: () => tr("Ava") },
  { id: "en-US-EmmaNeural", name: () => tr("Emma") },
  { id: "en-US-JennyNeural", name: () => tr("Jenny") },
  { id: "en-US-AndrewNeural", name: () => tr("Andrew") },
  { id: "en-US-BrianNeural", name: () => tr("Brian") },
];
