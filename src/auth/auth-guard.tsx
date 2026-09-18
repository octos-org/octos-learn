import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import {
  isEmbeddedCourseLocation,
  isKnownEmbeddedCourseLocation,
  parseCoursePackRouteParams,
} from "./embedded-course-access";

const skipAuth = import.meta.env.VITE_SKIP_AUTH === "true";

export function AuthGuard() {
  const { token, loading } = useAuth();
  const location = useLocation();
  const isCoursePackRoute =
    location.pathname === "/board" && Boolean(parseCoursePackRouteParams(location.search));

  const [embeddedAllowed, setEmbeddedAllowed] = useState<boolean | null>(() => {
    if (!isCoursePackRoute) return false;
    return isKnownEmbeddedCourseLocation(location) ? true : null;
  });

  useEffect(() => {
    if (!isCoursePackRoute) return;
    let active = true;
    void isEmbeddedCourseLocation(location).then((allowed) => {
      if (active) setEmbeddedAllowed(allowed);
    });
    return () => {
      active = false;
    };
  }, [isCoursePackRoute, location]);

  // Trusted embedded CoursePacks play offline without requiring an account.
  // The loader still verifies the digest-locked archive. Blank whiteboards,
  // settings, and cloud-backed routes retain the ordinary authentication boundary.
  if (skipAuth || (isCoursePackRoute && embeddedAllowed === true)) return <Outlet />;

  if (loading || (isCoursePackRoute && embeddedAllowed === null)) {
    // Branded splash while the stored token is validated against /me —
    // replaces the old bare "Loading..." on a hard-coded dark background
    // (which also ignored the user's theme).
    return (
      <div className="workbench-shell flex h-screen flex-col items-center justify-center gap-4 px-4">
        <img
          src="/images/octos-logo-color.svg"
          alt="Octos"
          className="h-10 w-auto animate-pulse select-none"
        />
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  if (!token) {
    // Preserve the destination so a deep link (bookmarked /chat, a shared
    // studio URL, …) survives the sign-in detour. LoginPage validates the
    // `redirect` param (same-origin paths only) before honoring it.
    const from = `${location.pathname}${location.search}`;
    const to =
      from === "/" ? "/login" : `/login?redirect=${encodeURIComponent(from)}`;
    return <Navigate to={to} replace />;
  }

  return <Outlet />;
}
