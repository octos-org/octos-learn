import { useLocale } from "@/i18n/use-locale";
import { tr } from "@/i18n";
import {
  Camera,
  CameraOff,
  ImagePlus,
  Mic,
  Send,
  Square,
} from "lucide-react";
import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { VoiceState } from "@/home/voice/use-voice-conversation";

export function StudentInputDock({
  voiceState,
  cameraActive,
  cameraDisabled,
  voiceDisabled,
  sendDisabled,
  onMic,
  onToggleCamera,
  onSendText,
  onSendImage,
  textOnly = false,
  references = [],
  suggestions = [],
  onRemoveReference,
  initialText = "",
}: {
  voiceState: VoiceState;
  cameraActive: boolean;
  cameraDisabled?: boolean;
  voiceDisabled?: boolean;
  sendDisabled?: boolean;
  onMic: () => void;
  onToggleCamera: () => void;
  onSendText: (text: string) => Promise<void> | void;
  onSendImage: (file: File) => Promise<void> | void;
  /** Hide local media controls on the meeting-display Android build. */
  textOnly?: boolean;
  references?: Array<{ id: string; label: string }>;
  suggestions?: string[];
  onRemoveReference?: (id: string) => void;
  /** Prefilled text the learner may edit or send. */
  initialText?: string;
}) {
  useLocale();
  const [text, setText] = useState(initialText);
  const [sending, setSending] = useState(false);
  const [imagePickerPending, setImagePickerPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || sendDisabled || sending) return;
    setSending(true);
    try {
      await onSendText(value);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const selectImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImagePickerPending(false);
    if (!file || sendDisabled || sending) return;
    setSending(true);
    try {
      await onSendImage(file);
    } finally {
      setSending(false);
    }
  };

  const busy = voiceState === "thinking" || voiceState === "speaking";
  const voiceStarting = voiceState === "starting";

  return (
    <form className="learning-input-dock" data-learning-board-occlusion="" onSubmit={(event) => void submit(event)}>
      {suggestions.length > 0 && !text && !sending && !sendDisabled && references.length === 0 && !imagePickerPending ? (
        <div className="learning-input-suggestions" aria-label={tr("试着从一个主题开始")}>
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" data-air-command="question-suggestion" onClick={() => {
              setText(suggestion);
              textRef.current?.focus();
            }}>{suggestion}</button>
          ))}
        </div>
      ) : null}
      {imagePickerPending ? <div className="learning-input-picker" role="status">
        <span>{tr("请用鼠标或触屏选择图片")}</span>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={sendDisabled || sending}>{tr("选择图片")}</button>
        <button type="button" data-air-command="cancel-image-picker" aria-label={tr("取消选择图片")} onClick={() => setImagePickerPending(false)}>×</button>
      </div> : null}
      {references.length > 0 ? (
        <div className="learning-input-references" aria-label={tr("已引用的白板内容")}>
          {references.map((reference) => (
            <span key={reference.id}>
              {tr("已引用：")}{reference.label}
              <button
                type="button"
                data-air-command="remove-reference"
                onClick={() => onRemoveReference?.(reference.id)}
                aria-label={tr("移除引用：{{v0}}", { v0: reference.label })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {!textOnly ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => void selectImage(event)}
          />
          <button
            type="button"
            className="learning-input-button"
            onClick={event => {
              // Browser file dialogs need a physical user activation. A hand
              // command reveals an explicit picker instead of silently failing.
              if (event.currentTarget.hasAttribute("data-air-activating")) setImagePickerPending(true);
              else fileRef.current?.click();
            }}
            data-air-command="upload-image"
            aria-label={tr("上传题目图片")}
            disabled={sendDisabled || sending}
          >
            <ImagePlus size={19} />
          </button>
          <button
            type="button"
            className={`learning-input-button ${cameraActive ? "is-active" : ""}`}
            onClick={onToggleCamera}
            data-air-command="dock-camera"
            aria-label={cameraActive ? tr("关闭摄像头") : tr("打开摄像头")}
            disabled={cameraDisabled}
          >
            {cameraActive ? <Camera size={19} /> : <CameraOff size={19} />}
          </button>
          <button
            type="button"
            className={`learning-mic-button is-${voiceState}`}
            data-air-command="dock-microphone"
            onClick={onMic}
            aria-label={
              voiceStarting ? tr("语音准备中") : busy ? tr("打断 Octos") : tr("语音提问")
            }
            disabled={voiceDisabled || voiceStarting}
          >
            {busy ? <Square size={16} /> : <Mic size={21} />}
          </button>
        </>
      ) : null}
      <input
        ref={textRef}
        data-air-command="question-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={tr("问一个问题，或告诉 Octos 你卡在哪里…")}
        aria-label={tr("输入学习问题")}
        disabled={sendDisabled || sending}
      />
      <button
        type="submit"
        data-air-command="send-question"
        className="learning-send-button"
        aria-label={tr("发送问题")}
        disabled={sendDisabled || sending || text.trim().length === 0}
      >
        <Send size={18} />
      </button>
    </form>
  );
}
