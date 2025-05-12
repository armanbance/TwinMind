import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAuth } from "../contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const [isLoadingMemories, setIsLoadingMemories] = useState<boolean>(true);
  const [loadMemoriesError, setLoadMemoriesError] = useState<string | null>(
    null
  );

  const [userQuestion, setUserQuestion] = useState<string>("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isAskingAI, setIsAskingAI] = useState<boolean>(false);
  const [askAIError, setAskAIError] = useState<string | null>(null);
  const [retrievedMemoriesCountForAsk, setRetrievedMemoriesCountForAsk] =
    useState<number | null>(null);

  const auth = useAuth();

  useEffect(() => {
    async function fetchMemories() {
      if (!auth.isAuthenticated) {
        setIsLoadingMemories(false);
        setLoadMemoriesError("Please log in to view your memories.");
        return;
      }
      const token = auth.getAuthToken();
      if (!token) {
        setLoadMemoriesError("Authentication token not found. Please log in.");
        setIsLoadingMemories(false);
        return;
      }
      setIsLoadingMemories(true);
      setLoadMemoriesError(null);
      try {
        const response = await axios.get(`${API_BASE_URL}/api/memories`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMemoriesData(response.data);
      } catch (err: unknown) {
        console.error("Error fetching memories:", err);
        if (axios.isAxiosError(err)) {
          if (err.response) {
            if (err.response.status === 401 || err.response.status === 403) {
              setLoadMemoriesError(
                "Auth failed. Please log out and log in again."
              );
            } else {
              setLoadMemoriesError(
                `Failed to load memories: ${
                  (err.response.data as { error?: string }).error || err.message
                }`
              );
            }
          } else {
            setLoadMemoriesError(`Failed to load memories: ${err.message}`);
          }
        } else if (err instanceof Error) {
          setLoadMemoriesError(
            `Unexpected error loading memories: ${err.message}`
          );
        } else {
          setLoadMemoriesError(
            "An unknown error occurred while loading memories."
          );
        }
      } finally {
        setIsLoadingMemories(false);
      }
    }
    fetchMemories();
  }, [auth, auth.isAuthenticated]);

  const handleAskAISubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userQuestion.trim()) {
      setAskAIError("Please enter a question.");
      return;
    }
    const token = auth.getAuthToken();
    if (!token) {
      setAskAIError("Not authenticated. Please log in.");
      return;
    }

    setIsAskingAI(true);
    setAiAnswer(null);
    setAskAIError(null);
    setRetrievedMemoriesCountForAsk(null);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/memories/ask-ai`,
        { question: userQuestion },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      setAiAnswer(response.data.answer);
      setRetrievedMemoriesCountForAsk(response.data.retrievedMemoriesCount);
    } catch (err: unknown) {
      console.error("Error asking AI:", err);
      if (axios.isAxiosError(err) && err.response) {
        setAskAIError(
          `Error: ${
            err.response.data.error ||
            err.response.statusText ||
            "Failed to get answer"
          }`
        );
      } else if (err instanceof Error) {
        setAskAIError(`Error: ${err.message}`);
      } else {
        setAskAIError("An unknown error occurred while asking AI.");
      }
    } finally {
      setIsAskingAI(false);
    }
  };

  let memoriesContent;
  if (isLoadingMemories) {
    memoriesContent = <p>Loading memories...</p>;
  } else if (loadMemoriesError) {
    memoriesContent = (
      <Card className="border-destructive">
        <CardContent className="p-4 text-destructive">
          <p className="font-semibold">Error Loading Memories</p>
          <p>{loadMemoriesError}</p>
        </CardContent>
      </Card>
    );
  } else if (memoriesData.length === 0) {
    memoriesContent = (
      <div className="text-center text-muted-foreground py-8">
        <p>No memories found yet.</p>
        <p className="text-sm">
          Use the voice input to record your first memory!
        </p>
      </div>
    );
  } else {
    memoriesContent = (
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
              <p className="text-base whitespace-pre-wrap">{memory.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Ask TwinMind AI</CardTitle>
          <CardDescription>
            Ask questions about your recorded memories.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAskAISubmit} className="space-y-3">
            <Input
              type="text"
              placeholder="What would you like to know about your memories?"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              disabled={isAskingAI}
            />
            <Button
              type="submit"
              disabled={isAskingAI}
              className="w-full sm:w-auto"
            >
              {isAskingAI ? "Thinking..." : "Ask AI"}
            </Button>
          </form>

          {askAIError && (
            <Card className="border-destructive bg-destructive/10">
              <CardContent className="p-3 text-destructive">
                <p className="font-medium text-sm">Error</p>
                <p className="text-xs">{askAIError}</p>
              </CardContent>
            </Card>
          )}

          {aiAnswer && (
            <Card className="bg-muted/50">
              <CardHeader className="pb-2 pt-4">
                <p className="text-xs font-medium text-primary">
                  TwinMind AI Says:
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="whitespace-pre-wrap">{aiAnswer}</p>
                {retrievedMemoriesCountForAsk !== null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    (Answer based on {retrievedMemoriesCountForAsk} relevant
                    memory snippet
                    {retrievedMemoriesCountForAsk === 1 ? "" : "s"})
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Your Memories</h2>
        {memoriesContent}
      </div>
    </div>
  );
}
