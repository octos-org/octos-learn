import { Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAuthenticatedFileBlob } from "@/api/files";
import type { WhiteboardQuestionRecord } from "./whiteboard-questions";

export function WhiteboardQuestionImage({
  question,
}: {
  question: WhiteboardQuestionRecord;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadedImage, setLoadedImage] = useState<{
    path: string;
    url: string | null;
    failed: boolean;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const path = question.imagePath;
    if (!path) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetchAuthenticatedFileBlob(
      path,
      {
        sessionId: question.sessionId,
        profileId: question.imageProfileId,
      },
      controller.signal,
    ).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setLoadedImage({ path, url: objectUrl, failed: false });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      console.error("[learn] failed to load question image", error);
      setLoadedImage({ path, url: null, failed: true });
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [question.imagePath, question.imageProfileId, question.sessionId]);

  const currentImage = loadedImage?.path === question.imagePath
    ? loadedImage
    : null;
  const imageUrl = currentImage?.url ?? null;
  const loadFailed = currentImage?.failed ?? false;

  useEffect(() => {
    if (!previewOpen) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      trigger?.focus();
    };
  }, [previewOpen]);

  if (!question.imagePath) return null;
  if (loadFailed) {
    return (
      <div
        className="learning-whiteboard-question-camera is-error"
        role="img"
        aria-label="本次问题随附的摄像头画面暂时无法显示"
      >
        图片暂时无法显示
      </div>
    );
  }
  if (!imageUrl) {
    return (
      <div
        className="learning-whiteboard-question-camera is-loading"
        role="status"
      >
        正在加载图片…
      </div>
    );
  }

  return (
    <>
      <div className="learning-whiteboard-question-camera">
        <img
          className="learning-whiteboard-question-camera-frame"
          src={imageUrl}
          alt="本次问题随附的摄像头画面"
        />
        <button
          ref={triggerRef}
          type="button"
          className="learning-whiteboard-question-camera-expand"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            setPreviewOpen(true);
          }}
          aria-label="放大查看本次问题图片"
          title="放大查看"
        >
          <Maximize2 size={16} aria-hidden="true" />
        </button>
      </div>
      {previewOpen
        ? createPortal(
            <div
              className="learning-question-image-preview-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label="本次问题图片预览"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setPreviewOpen(false);
                }
              }}
            >
              <div className="learning-question-image-preview">
                <img src={imageUrl} alt="放大的本次问题随附摄像头画面" />
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  aria-label="关闭图片预览"
                  title="关闭"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
