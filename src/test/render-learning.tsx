import { act, render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';

/** Flush the asynchronous playback-store hydration used by Runtime/UI fixtures. */
export async function renderLearning(ui: ReactNode, options?: RenderOptions) {
  let result!: RenderResult;
  await act(async () => { result = render(ui, options); });
  return result;
}
