import React from "react";
import { useAuth } from "../contexts/AuthContext"; // Corrected path
import { Button } from "../components/ui/button"; // Corrected path

export function LogoutButton() {
  const { logout, isAuthenticated } = useAuth();
  const handleLogout = () => {
    logout();
  };
  if (!isAuthenticated) {
    return null;
  }
  return (
    <Button onClick={handleLogout} variant="outline">
      Log Out
    </Button>
  );
}
