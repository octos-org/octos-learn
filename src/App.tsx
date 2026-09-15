import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { AuthProvider } from "./auth/auth-context";
import { AuthGuard } from "./auth/auth-guard";
import { LoginPage } from "./auth/login-page";
import { LearningPage } from "./learning/learning-page";
import { CourseLauncher } from "./learning/course-launcher";
import { isCoursePackIdentity } from "./learning/course-pack/course-pack-catalog";
import { LearningSetupGate, SetupWhiteboard } from "./learning/setup-whiteboard";
import { AdminSettingsPage } from "./settings/settings-page";

function LegacyLearningRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/board", search }} replace />;
}

function ProductRoot() {
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  // Pre-launcher bookmarked fixture and CoursePack URLs still open the canvas.
  return query.has("oll-fixture") || query.has("course-pack")
    ? <Navigate to={{ pathname: "/board", search }} replace />
    : <CourseLauncher />;
}

function CourseRoute() {
  const { packId } = useParams();
  const [query] = useSearchParams();
  const version = query.get("version");
  if (!packId || !version || !isCoursePackIdentity(packId, version)) {
    return <Navigate to="/" replace />;
  }
  const courseMode = query.get("mode") === "learn" ? "learn" : "preview";
  const instanceId = query.get("instance");
  const boardQuery = new URLSearchParams({
    "course-pack": packId,
    "course-version": version,
    "course-mode": courseMode,
  });
  const title = query.get("title")?.trim();
  if (title) boardQuery.set("course-title", title.slice(0, 120));
  if (courseMode === "learn" && instanceId?.startsWith("learn-")) {
    boardQuery.set("course-instance", instanceId);
  }
  const search = `?${boardQuery.toString()}`;
  return <Navigate to={{ pathname: "/board", search }} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProductRoot />} />
      <Route path="/course/:packId" element={<CourseRoute />} />
      <Route path="/learn" element={<LegacyLearningRedirect />} />
      <Route element={<AuthGuard />}>
        <Route path="/board" element={<LearningSetupGate><LearningPage /></LearningSetupGate>} />
        <Route path="/setup" element={<SetupWhiteboard />} />
        <Route path="/settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
