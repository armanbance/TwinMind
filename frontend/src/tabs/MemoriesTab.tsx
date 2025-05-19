import React, { useState, useEffect, useCallback } from "react";
// Removed axios import as it was only used for the legacy AI feature
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAuth } from "../contexts/AuthContext";
// Removed Input and Button imports that were only for the legacy AI form, if they are not used elsewhere in this file.
// Assuming Button might still be used for error retry, will keep it for now unless linter complains.
import { Button } from "@/components/ui/button";
import { fetchMeetings, IMeetingSummary } from "@/lib/apiClient";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Define API_BASE_URL, assuming VITE_API_BASE_URL should point to the backend
// This can be removed if no other API calls in this file use it directly.
// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

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

  // Removed state variables for the legacy AI feature:
  // const [userQuestion, setUserQuestion] = useState<string>("");
  // const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  // const [isAskingAI, setIsAskingAI] = useState<boolean>(false);
  // const [askAIError, setAskAIError] = useState<string | null>(null);
  // const [retrievedMemoriesCountForAsk, setRetrievedMemoriesCountForAsk] = useState<number | null>(null);

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
  }, [auth]); // Removed listVersion from dependency array as it's passed directly now

  useEffect(() => {
    loadMeetingSummaries();
  }, [loadMeetingSummaries, listVersion]); // listVersion is the prop triggering refresh

  // Removed handleAskAISubmit function entirely

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
      {/* The entire Card for "Ask TwinMind AI (All Memories)" has been removed */}

      <div>
        <h2 className="text-xl font-semibold mb-4">Your Meeting Summaries</h2>
        {meetingsContent}
      </div>
    </div>
  );
}
