import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // Assuming your main App component is here
import "./index.css"; // Or your global stylesheet
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./contexts/AuthContext";
import { BrowserRouter as Router } from "react-router-dom";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId="919529792912-v5s1mee0jepsgi4tq2mjvf5ei7ia3obq.apps.googleusercontent.com">
      <AuthProvider>
        <Router>
          <App />
        </Router>
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
