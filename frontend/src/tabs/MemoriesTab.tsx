import React, { useState, useEffect, useCallback } from "react";
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
import { fetchMeetings, IMeetingSummary } from "@/lib/apiClient";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Define API_BASE_URL, assuming VITE_API_BASE_URL should point to the backend
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

interface MemoriesTabProps {
  listVersion: number; // Prop to trigger refresh
}

export function MemoriesTab({ listVersion }: MemoriesTabProps) {
  const [meetingSummaries, setMeetingSummaries] = useState<IMeetingSummary[]>(
    []
  );
  const [isLoadingMeetings, setIsLoadingMeetings] = useState<boolean>(true);
  const [loadMeetingsError, setLoadMeetingsError] = useState<string | null>(
    null
  );

  const [userQuestion, setUserQuestion] = useState<string>("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isAskingAI, setIsAskingAI] = useState<boolean>(false);
  const [askAIError, setAskAIError] = useState<string | null>(null);
  const [retrievedMemoriesCountForAsk, setRetrievedMemoriesCountForAsk] =
    useState<number | null>(null);

  const auth = useAuth();
  const navigate = useNavigate();

  const loadMeetingSummaries = useCallback(async () => {
    if (!auth.isAuthenticated) {
      setIsLoadingMeetings(false);
      setLoadMeetingsError("Please log in to view your meeting summaries.");
      setMeetingSummaries([]);
      return;
    }
    setIsLoadingMeetings(true);
    setLoadMeetingsError(null);
    const result = await fetchMeetings();
    if ("error" in result) {
      setLoadMeetingsError(result.error);
      setMeetingSummaries([]);
    } else {
      const displayableMeetings = result.filter(
        (meeting) =>
          meeting.status === "completed" &&
          meeting.fullTranscriptText &&
          meeting.fullTranscriptText.trim() !== ""
      );
      setMeetingSummaries(displayableMeetings);
    }
    setIsLoadingMeetings(false);
  }, [auth, listVersion]);

  useEffect(() => {
    loadMeetingSummaries();
  }, [loadMeetingSummaries, listVersion]);

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
      console.error("Error asking global AI:", err);
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
        setAskAIError("An unknown error occurred while asking global AI.");
      }
    } finally {
      setIsAskingAI(false);
    }
  };

  let meetingsContent;
  if (isLoadingMeetings) {
    meetingsContent = (
      <div className="flex justify-center items-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        <p className="ml-2">Loading meeting summaries...</p>
      </div>
    );
  } else if (loadMeetingsError) {
    meetingsContent = (
      <Card className="border-destructive bg-destructive/10">
        <CardHeader className="flex flex-row items-center pb-2 pt-3">
          <AlertCircle className="h-5 w-5 text-destructive mr-2" />
          <CardTitle className="text-destructive text-md">
            Error Loading
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 text-destructive text-xs">
          <p>{loadMeetingsError}</p>
          <Button
            variant="link"
            className="p-0 h-auto text-xs mt-1"
            onClick={() =>
              auth.isAuthenticated ? loadMeetingSummaries() : auth.logout!()
            }
          >
            {auth.isAuthenticated ? "Try Again" : "Login"}
          </Button>
        </CardContent>
      </Card>
    );
  } else if (meetingSummaries.length === 0) {
    meetingsContent = (
      <div className="text-center text-muted-foreground py-8">
        <p>No meeting summaries found yet.</p>
        <p className="text-sm">
          Record a meeting and end it to see its summary here!
        </p>
      </div>
    );
  } else {
    meetingsContent = (
      <div className="space-y-4">
        {meetingSummaries.map((meeting) => (
          <Card
            key={meeting._id}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(`/meetings/${meeting._id}`)}
          >
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-md font-semibold">
                {meeting.title ||
                  `Meeting on ${new Date(
                    meeting.startTime
                  ).toLocaleDateString()}`}
              </CardTitle>
              <CardDescription className="text-xs">
                {new Date(meeting.startTime).toLocaleString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
                {meeting.endTime &&
                  ` - ${new Date(meeting.endTime).toLocaleTimeString(
                    undefined,
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    }
                  )}`}
                <span
                  className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                    meeting.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {meeting.status}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-3">
                {meeting.summary}
              </p>
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
          <CardTitle>Ask TwinMind AI (All Memories)</CardTitle>
          <CardDescription>
            Ask questions about your historically recorded memories (old
            system).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAskAISubmit} className="space-y-3">
            <Input
              type="text"
              placeholder="What would you like to know about your old memories?"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              disabled={isAskingAI}
            />
            <Button
              type="submit"
              disabled={isAskingAI}
              className="w-full sm:w-auto"
            >
              {isAskingAI ? "Thinking..." : "Ask Legacy AI"}
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
                  TwinMind Legacy AI Says:
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="whitespace-pre-wrap">{aiAnswer}</p>
                {retrievedMemoriesCountForAsk !== null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    (Answer based on {retrievedMemoriesCountForAsk} memory
                    snippets from the old system)
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Your Meeting Summaries</h2>
        {meetingsContent}
      </div>
    </div>
  );
}
