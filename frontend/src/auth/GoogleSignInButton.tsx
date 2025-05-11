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
      console.log("Google Login Success from Button:", tokenResponse);
      await auth.login(tokenResponse);
    },
    onError: () => {
      console.error("Google Login Failed");
      if (onAuthError) {
        onAuthError();
      }
    },
    scope:
      "openid email profile https://www.googleapis.com/auth/calendar.readonly",
  });
  return (
    <Button
      onClick={() => handleGoogleLogin()}
      variant="outline"
      size="lg"
      className="text-lg gap-2 shadow-lg hover:shadow-xl transition-shadow"
    >
      {/* <FcGoogle className="mr-2 h-4 w-4" /> */}
      Continue with Google
    </Button>
  );
}
