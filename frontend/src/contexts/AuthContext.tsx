import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { TokenResponse } from "@react-oauth/google";

interface User {
  email?: string;
  name?: string;
  picture?: string;
  // Add other user properties you might need
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  tokenResponse: TokenResponse | null;
  login: (tokenRes: TokenResponse) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokenResponse, setTokenResponse] = useState<TokenResponse | null>(
    () => {
      const storedToken = localStorage.getItem("googleAuthToken");
      return storedToken ? JSON.parse(storedToken) : null;
    }
  );
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUserInfo = async (accessToken: string) => {
      try {
        const GAPI_USERINFO_URL =
          "https://www.googleapis.com/oauth2/v3/userinfo";
        const response = await fetch(GAPI_USERINFO_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          throw new Error("Failed to fetch user info");
        }
        const userData = await response.json();
        setUser(userData);
      } catch (error) {
        console.error("Error fetching user info:", error);
        // Handle error, maybe logout user
        setTokenResponse(null);
        setUser(null);
        localStorage.removeItem("googleAuthToken");
      }
    };

    if (tokenResponse?.access_token) {
      localStorage.setItem("googleAuthToken", JSON.stringify(tokenResponse));
      fetchUserInfo(tokenResponse.access_token);
    } else {
      localStorage.removeItem("googleAuthToken");
      setUser(null);
    }
  }, [tokenResponse]);

  const login = async (tokenRes: TokenResponse) => {
    setTokenResponse(tokenRes);
    // User info will be fetched by the useEffect hook
  };

  const logout = () => {
    setTokenResponse(null);
    setUser(null);
    localStorage.removeItem("googleAuthToken");
    // Optionally, you might want to call googleLogout() from '@react-oauth/google'
    // import { googleLogout } from '@react-oauth/google';
    // googleLogout();
    // This helps if you are using One Tap and want to ensure the Google session is cleared.
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!tokenResponse && !!user,
        user,
        tokenResponse,
        login,
        logout,
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
