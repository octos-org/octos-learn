import { Award, Landmark, LogOut, ScrollText, Settings, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { LanguageSwitch } from "@/i18n/language-switch";

import "../course-launcher.css";
import "./academy.css";

/** The academy's places. The hall is the home page; each other place is its
 * own page so it can be opened, bookmarked and shown on a large screen. */
export const ACADEMY_PLACES = [
  { to: "/", label: "大厅", end: true, icon: Landmark },
  { to: "/atlas", label: "星图", end: false, icon: Sparkles },
  { to: "/achievements", label: "成就", end: false, icon: Award },
  { to: "/records", label: "记录", end: false, icon: ScrollText },
] as const;

export function AcademyHeader() {
  const { token, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  return (
    <header className="academy-header">
      <Link to="/" className="academy-brand" aria-label="Octos Learn，回到大厅">
        <img src="/images/octos-logo-color.svg" alt="" />
        <span>Octos Learn</span>
      </Link>
      {token && (
        <nav className="academy-places" aria-label="学院">
          {ACADEMY_PLACES.map((place) => (
            <NavLink key={place.to} to={place.to} end={place.end}><place.icon size={17} aria-hidden="true" />{place.label}</NavLink>
          ))}
        </nav>
      )}
      <nav className="academy-account" aria-label="账户">
        <LanguageSwitch />
        {token ? (
          <>
            <Link to="/settings"><Settings size={17} aria-hidden="true" /> 设置</Link>
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => {
                setLoggingOut(true);
                void logout().finally(() => setLoggingOut(false));
              }}
            >
              <LogOut size={17} aria-hidden="true" />
              {loggingOut ? "正在退出…" : "退出"}
            </button>
          </>
        ) : (
          <Link to="/login">登录</Link>
        )}
      </nav>
    </header>
  );
}
