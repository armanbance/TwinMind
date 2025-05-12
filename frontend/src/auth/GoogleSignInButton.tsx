import React from "react";
import { useGoogleLogin } from "@react-oauth/google";
// import { FcGoogle } from 'react-icons/fc'; // Example: if you want to use an icon
import { Button } from "../components/ui/button"; // Corrected path
import { useAuth } from "../contexts/AuthContext"; // Corrected path

interface GoogleSignInButtonProps {
  onAuthError?: () => void;
}

export function GoogleSignInButton({ onAuthError }: GoogleSignInButtonProps) {
  const auth = useAuth();
  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      console.log(
        "[GoogleSignInButton] Google Login Raw Success. tokenResponse:",
        tokenResponse
      );
      if (auth && typeof auth.login === "function") {
        console.log("[GoogleSignInButton] Calling auth.login()...");
        try {
          await auth.login(tokenResponse);
          console.log("[GoogleSignInButton] auth.login() completed.");
          // Log the JWT after successful login
          const jwtToken = auth.getAuthToken();
          console.log("[GoogleSignInButton] JWT Token:", jwtToken);
        } catch (error) {
          console.error(
            "[GoogleSignInButton] Error during auth.login():",
            error
          );
          if (onAuthError) {
            onAuthError();
          }
        }
      } else {
        console.error(
          "[GoogleSignInButton] auth.login is not available or not a function."
        );
        if (onAuthError) {
          onAuthError();
        }
      }
    },
    onError: () => {
      console.error(
        "[GoogleSignInButton] Google Login Failed via useGoogleLogin onError."
      );
      if (onAuthError) {
        onAuthError();
      }
    },
    scope:
      "openid email profile https://www.googleapis.com/auth/calendar.readonly",
  });
  return (
    <Button
      onClick={() => {
        console.log(
          "[GoogleSignInButton] Clicked. Calling handleGoogleLogin()..."
        );
        handleGoogleLogin();
      }}
      variant="outline"
      size="lg"
      className="text-lg gap-2 shadow-lg hover:shadow-xl transition-shadow"
    >
      {/* <FcGoogle className="mr-2 h-4 w-4" /> */}
      Continue with Google
    </Button>
  );
}
