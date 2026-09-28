import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { initializeLearningDocuments, learningStorageStatus, retryLearningDocumentWrites } from './learning-document-store';

export function LearningStorageBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const saveError = useSyncExternalStore(learningStorageStatus.subscribe, learningStorageStatus.getSnapshot);
  useEffect(() => {
    let active = true;
    void initializeLearningDocuments().then(
      () => { if (active) { setReady(true); setError(''); } },
      cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); },
    );
    return () => { active = false; };
  }, [attempt]);
  if (!ready) return <div role="status">{error || '正在打开本地学习记录…'}{error && <button onClick={() => setAttempt(value => value + 1)}>重试</button>}</div>;
  return <><DocumentReadBoundary>{children}</DocumentReadBoundary>{saveError && <div role="alert" style={{ position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 10000, background: '#fff3d6', color: '#532f00', padding: 16 }}>
    {saveError} <button onClick={() => { void retryLearningDocumentWrites().catch(() => undefined); }}>重试保存</button>
  </div>}</>;
}

class DocumentReadBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <div role="alert">学习记录暂时无法打开：{this.state.error.message}
      <button onClick={() => this.setState({ error: null })}>重试打开</button>
    </div>;
    return this.props.children;
  }
}
