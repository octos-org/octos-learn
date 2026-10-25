import { useEffect, useState } from "react";

import type { TeacherActivity } from "@/hooks/use-teacher-skin";

import type { TeacherDefinition } from "./teachers";

/** The five classroom poses drawn for every preset teacher. */
export const PORTRAIT_POSES = ["idle", "listening", "thinking", "explaining", "approving"] as const;
export type PortraitPose = (typeof PORTRAIT_POSES)[number];

/** Static files under public/teachers/<id>/: bust-<pose>, arch-bg and card. */
export function portraitAsset(teacherId: TeacherDefinition["id"], file: string): string {
  return `${import.meta.env.BASE_URL}teachers/${teacherId}/${file}.webp`;
}

export function poseForActivity(activity: TeacherActivity): PortraitPose {
  if (activity === "listening" || activity === "thinking") return activity;
  if (activity === "speaking") return "explaining";
  return "idle";
}

/** A practice task met its program-checked goal; the classroom teacher shows
 * approval for a moment. The event carries no data and claims nothing. */
export const TEACHER_APPROVAL_EVENT = "octos-teacher-approval";
const APPROVAL_MS = 2400;

export function announceTeacherApproval(): void {
  window.dispatchEvent(new Event(TEACHER_APPROVAL_EVENT));
}

export function useTeacherApproval(): boolean {
  const [approving, setApproving] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const onApproval = () => {
      window.clearTimeout(timer);
      setApproving(true);
      timer = window.setTimeout(() => setApproving(false), APPROVAL_MS);
    };
    window.addEventListener(TEACHER_APPROVAL_EVENT, onApproval);
    return () => {
      window.removeEventListener(TEACHER_APPROVAL_EVENT, onApproval);
      window.clearTimeout(timer);
    };
  }, []);
  return approving;
}
