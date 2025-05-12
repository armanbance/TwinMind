import React, { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "../contexts/AuthContext";

// Define API_BASE_URL, assuming VITE_API_BASE_URL should point to the backend
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

interface IMemory {
  _id: string;
  userId: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

export function MemoriesTab() {
  const [memoriesData, setMemoriesData] = useState<IMemory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();

  useEffect(() => {
    async function fetchMemories() {
      if (!auth.isAuthenticated) {
        // Don't attempt to fetch if not authenticated, or wait for auth state to be confirmed.
        // This check might be redundant if the tab is only shown to authenticated users,
        // but provides an early exit.
        setIsLoading(false);
        setError("Please log in to view your memories."); // Or set to null if you prefer blank screen
        return;
      }

      const token = auth.getAuthToken();
      if (!token) {
        setError(
          "Authentication token not found. Please ensure you are logged in."
        );
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null); // Clear previous errors

      try {
        const response = await axios.get(`${API_BASE_URL}/api/memories`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setMemoriesData(response.data);
      } catch (err: unknown) {
        console.error("Error fetching memories:", err);
        if (axios.isAxiosError(err)) {
          if (err.response) {
            if (err.response.status === 401 || err.response.status === 403) {
              setError(
                "Authentication failed or token expired. Please log out and log in again."
              );
              // Consider calling auth.logout() here or prompting user to re-login
            } else {
              setError(
                `Failed to load memories: ${
                  (err.response.data as { error?: string }).error || err.message
                }`
              );
            }
          } else {
            setError(`Failed to load memories: ${err.message}`);
          }
        } else if (err instanceof Error) {
          setError(
            `Failed to load memories. An unexpected error occurred: ${err.message}`
          );
        } else {
          setError(
            "Failed to load memories. An unexpected and unknown error occurred."
          );
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchMemories();
  }, [auth, auth.isAuthenticated]); // Re-run if auth object or isAuthenticated status changes

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Loading memories...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-red-600">
          <p className="font-semibold">Error</p>
          <p>{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (memoriesData.length === 0) {
    return (
      <div className="text-center text-muted-foreground">
        <p>No memories found.</p>
        <p className="text-sm">
          Record your first memory using the voice input!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {memoriesData.map((memory) => (
        <Card key={memory._id}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">
              {new Date(memory.createdAt).toLocaleString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-base">{memory.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
