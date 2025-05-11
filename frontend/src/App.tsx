import { ThemeProvider } from "@/components/theme-provider";
import { LandingPage } from "./components/landing-page";
import { HomePage } from "./HomePage";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext"; // Adjusted path
import { ProtectedRoute } from "./auth/ProtectedRoute"; // Adjusted path

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <ThemeProvider defaultTheme="light" storageKey="twinmind-theme">
      <Routes>
        <Route
          path="/"
          element={
            !isAuthenticated ? <LandingPage /> : <Navigate to="/home" replace />
          }
        />
        <Route element={<ProtectedRoute />}>
          {/* Routes nested under ProtectedRoute require authentication */}
          <Route path="/home" element={<HomePage />} />
          {/* Add other protected routes here, e.g., /dashboard, /profile */}
        </Route>
        {/* You can add other public routes here if needed, e.g., /about, /contact */}
        {/* <Route path="*" element={<NotFoundPage />} /> */}
        {/* Optional: 404 page */}
      </Routes>
    </ThemeProvider>
  );
}

export default App;
