import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { TokenResponse, googleLogout } from "@react-oauth/google";
import axios from "axios";

// Define this in a central place, e.g., src/config.ts or src/lib/api.ts
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// User interface matching the DTO from backend (mongoId instead of _id)
interface AppUser {
  mongoId: string;
  googleId: string;
  email: string;
  createdAt?: string; // Optional, if you want to use it from backend DTO
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AppUser | null;
  isLoading: boolean;
  login: (tokenRes: TokenResponse) => Promise<void>;
  logout: () => void;
  getAuthToken: () => string | null; // Function to retrieve the auth token
  getGoogleAccessToken: () => string | null; // Google's access token
  memoriesVersion: number; // New: for triggering refetch
  triggerMemoriesRefresh: () => void; // New: function to trigger refetch
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const APP_AUTH_TOKEN_KEY = "appAuthToken";
const APP_USER_KEY = "appUser";
const APP_IS_AUTHENTICATED_KEY = "appIsAuthenticated";
const GOOGLE_ACCESS_TOKEN_KEY = "googleAccessToken"; // New key for Google token

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(APP_IS_AUTHENTICATED_KEY) === "true";
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [memoriesVersion, setMemoriesVersion] = useState<number>(0); // New state

  useEffect(() => {
    console.log("[AuthContext] useEffect: Attempting to restore session...");
    const appToken = localStorage.getItem(APP_AUTH_TOKEN_KEY);
    const storedUserString = localStorage.getItem(APP_USER_KEY);
    // Google Access Token is not strictly needed to restore app session state, but if present, good.
    const googleToken = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);

    if (appToken && storedUserString) {
      try {
        const storedUser: AppUser = JSON.parse(storedUserString);
        console.log(
          "[AuthContext] Restored app token, user, and Google token (if any) from localStorage:",
          { appToken, storedUser, googleTokenExists: !!googleToken }
        );
        setUser(storedUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error(
          "[AuthContext] Error parsing stored user, clearing all auth storage:",
          error
        );
        localStorage.removeItem(APP_AUTH_TOKEN_KEY);
        localStorage.removeItem(APP_USER_KEY);
        localStorage.removeItem(APP_IS_AUTHENTICATED_KEY);
        localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
      }
    } else {
      console.log(
        "[AuthContext] No app token or stored user found in localStorage."
      );
    }
    setIsLoading(false);
  }, []);

  const login = async (tokenRes: TokenResponse) => {
    console.log(
      "[AuthContext] login started with google tokenResponse:",
      tokenRes
    );
    setIsLoading(true);
    if (!tokenRes.access_token) {
      console.error("[AuthContext] Google tokenResponse missing access_token.");
      setIsAuthenticated(false);
      setUser(null);
      setIsLoading(false);
      return;
    }
    const googleApiAccessToken = tokenRes.access_token; // This is Google's token

    try {
      const googleProfileResponse = await axios.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${tokenRes.access_token}` } }
      );
      const { sub: googleId, email } = googleProfileResponse.data;
      if (!googleId || !email) throw new Error("Invalid Google profile data.");

      const backendPayload = { googleId, email };
      console.log(
        "[AuthContext] Calling backend /upsert-google-user with:",
        backendPayload
      );
      const backendResponse = await axios.post(
        `${API_BASE_URL}/api/auth/users/upsert-google-user`,
        backendPayload
      );
      console.log(
        "[AuthContext] Backend upsert response:",
        backendResponse.data
      );

      // Backend now sends { message, user: { mongoId, googleId, email, createdAt }, token }
      if (
        backendResponse.data &&
        backendResponse.data.user &&
        backendResponse.data.token
      ) {
        const appUser: AppUser = backendResponse.data.user; // This is our AppUser DTO from backend
        const appAuthToken: string = backendResponse.data.token;

        console.log(
          "[AuthContext] Login successful. Setting app user:",
          appUser,
          "appJWT:",
          appAuthToken,
          "googleAccessToken:",
          googleApiAccessToken
        );
        setUser(appUser);
        setIsAuthenticated(true);
        localStorage.setItem(APP_USER_KEY, JSON.stringify(appUser));
        localStorage.setItem(APP_AUTH_TOKEN_KEY, appAuthToken);
        localStorage.setItem(APP_IS_AUTHENTICATED_KEY, "true");
        localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, googleApiAccessToken);
      } else {
        throw new Error(
          "Backend response missing user data or token after upsert."
        );
      }
    } catch (error) {
      console.error("[AuthContext] Error during login process:", error);
      // ... (error handling as before, ensure storage is cleared) ...
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem(APP_USER_KEY);
      localStorage.removeItem(APP_AUTH_TOKEN_KEY);
      localStorage.removeItem(APP_IS_AUTHENTICATED_KEY);
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    console.log("[AuthContext] logout initiated.");
    googleLogout();
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem(APP_USER_KEY);
    localStorage.removeItem(APP_AUTH_TOKEN_KEY);
    localStorage.removeItem(APP_IS_AUTHENTICATED_KEY);
    localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    // localStorage.clear(); // Be cautious with clear(), it removes everything
    console.log(
      "[AuthContext] User logged out. All relevant local storage cleared."
    );
  };

  const getAuthToken = (): string | null => {
    return localStorage.getItem(APP_AUTH_TOKEN_KEY);
  };

  const getGoogleAccessToken = (): string | null => {
    return localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  };

  const triggerMemoriesRefresh = () => {
    console.log("[AuthContext] Triggering memories refresh...");
    setMemoriesVersion((prevVersion) => prevVersion + 1);
  }; // New function

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        isLoading,
        login,
        logout,
        getAuthToken,
        getGoogleAccessToken,
        memoriesVersion, // Provide new state
        triggerMemoriesRefresh, // Provide new function
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
