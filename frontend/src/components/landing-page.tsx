import { GoogleSignInButton } from "../auth/GoogleSignInButton";

export function LandingPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background">
      <GoogleSignInButton />
    </div>
  );
}
