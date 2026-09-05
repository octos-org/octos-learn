import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./auth/auth-context";
import { AuthGuard } from "./auth/auth-guard";
import { LoginPage } from "./auth/login-page";
import { LearningPage } from "./learning/learning-page";
import { LearningSetupGate, SetupWhiteboard } from "./learning/setup-whiteboard";
import { AdminSettingsPage } from "./settings/settings-page";

function LegacyLearningRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/", search }} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard />}>
        <Route path="/" element={<LearningSetupGate><LearningPage /></LearningSetupGate>} />
        <Route path="/setup" element={<SetupWhiteboard />} />
        <Route path="/learn" element={<LegacyLearningRedirect />} />
        <Route path="/settings" element={<AdminSettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
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
