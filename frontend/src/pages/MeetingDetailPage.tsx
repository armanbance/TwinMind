import { useEffect, useState, FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import {
  fetchFullMeetingDetails,
  IFullMeeting,
  askMeetingAI,
  AskMeetingAIResponse,
} from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Send,
  Loader2,
} from "lucide-react";
import { useRef } from "react";

interface ChatMessage {
  type: "user" | "ai";
  content: string;
}

export function MeetingDetailPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { isAuthenticated } = useAuth();
  const [meeting, setMeeting] = useState<IFullMeeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Refs for streaming AI chat
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const currentAiResponseRef = useRef<string>("");

  useEffect(() => {
    async function loadMeeting() {
      if (!isAuthenticated || !meetingId) {
        setIsLoading(false);
        if (!isAuthenticated)
          setError("Please log in to view meeting details.");
        if (!meetingId) setError("Meeting ID is missing.");
        return;
      }
      setIsLoading(true);
      setError(null);
      const result = await fetchFullMeetingDetails(meetingId);
      if ("error" in result) {
        setError(result.error);
        setMeeting(null);
      } else {
        setMeeting(result);
      }
      setIsLoading(false);
    }
    loadMeeting();
  }, [meetingId, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen p-8">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
        <p className="ml-3 text-xl">Loading meeting details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 md:p-8">
        <Button asChild variant="outline" className="mb-4">
          <Link to="/home">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Link>
        </Button>
        <Card className="border-red-500">
          <CardHeader className="flex flex-row items-center">
            <AlertCircle className="h-6 w-6 text-red-500 mr-2" />
            <CardTitle className="text-red-600">
              Error Loading Meeting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="container mx-auto p-4 md:p-8">
        <Button asChild variant="outline" className="mb-4">
          <Link to="/home">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Link>
        </Button>
        <p className="text-center text-xl text-gray-500">Meeting not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl">
      <Button asChild variant="outline" className="mb-6">
        <Link to="/home">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Summaries
        </Link>
      </Button>

      <Card className="mb-8 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">
            {meeting.title || `Meeting Details`}
          </CardTitle>
          <CardDescription className="text-sm md:text-base">
            Recorded on: {new Date(meeting.startTime).toLocaleString()}
            {meeting.endTime &&
              ` - Ended: ${new Date(meeting.endTime).toLocaleString()}`}
          </CardDescription>
          {meeting.status === "completed" && meeting.summary && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-lg font-semibold mb-2 text-gray-800">
                Summary:
              </h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-md">
                {meeting.summary}
              </p>
            </div>
          )}
        </CardHeader>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">Full Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          {meeting.fullTranscriptText &&
          meeting.fullTranscriptText.trim() !== "" ? (
            <p className="text-base text-gray-700 whitespace-pre-wrap leading-relaxed">
              {meeting.fullTranscriptText}
            </p>
          ) : (
            <p className="text-gray-500">
              No transcript content available for this meeting.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Meeting-Specific Chat Interface */}
      {meeting &&
        meeting.status === "completed" &&
        meeting.fullTranscriptText && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="mr-2 h-6 w-6 text-primary" />
                Chat with this Meeting's Transcript
              </CardTitle>
              <CardDescription>
                Ask questions specifically about the content of this meeting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-72 w-full rounded-md border p-4">
                {chatHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center">
                    Ask a question to start the conversation.
                  </p>
                )}
                {chatHistory.map((msg, index) => (
                  <div
                    key={index}
                    className={`mb-3 flex ${
                      msg.type === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        msg.type === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </ScrollArea>

              <form
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  if (!currentQuestion.trim() || !meetingId) return;
                  // Do not return if isChatLoading is true, instead, abort previous and start new.

                  // Abort previous stream if any
                  if (chatAbortControllerRef.current) {
                    chatAbortControllerRef.current.abort();
                  }
                  chatAbortControllerRef.current = new AbortController();

                  const questionToAsk = currentQuestion.trim();
                  const userChatMessage: ChatMessage = {
                    type: "user",
                    content: questionToAsk,
                  };

                  // Placeholder for AI response
                  // The actual AI message content will be updated by the stream
                  const aiPlaceholderMessage: ChatMessage = {
                    type: "ai",
                    content: "",
                  };

                  setChatHistory((prev) => [
                    ...prev,
                    userChatMessage,
                    aiPlaceholderMessage,
                  ]);
                  const currentAiMessageIndex = chatHistory.length + 1; // Index of aiPlaceholderMessage after user msg

                  setCurrentQuestion("");
                  setIsChatLoading(true);
                  setChatError(null);
                  currentAiResponseRef.current = ""; // Reset accumulator

                  function handleChunkReceived(textChunk: string) {
                    currentAiResponseRef.current += textChunk;
                    setChatHistory((prevChatHistory) => {
                      const newHistory = [...prevChatHistory];
                      if (newHistory[currentAiMessageIndex]) {
                        newHistory[currentAiMessageIndex] = {
                          ...newHistory[currentAiMessageIndex],
                          content: currentAiResponseRef.current,
                        };
                      }
                      return newHistory;
                    });
                  }

                  function handleStreamEnd() {
                    setIsChatLoading(false);
                    chatAbortControllerRef.current = null;
                    console.log("[MeetingDetail] AI stream ended.");
                  }

                  function handleStreamError(errorMessage: string) {
                    setChatError(errorMessage);
                    setChatHistory((prevChatHistory) => {
                      const newHistory = [...prevChatHistory];
                      if (newHistory[currentAiMessageIndex]) {
                        // Update the placeholder with error or keep it empty
                        newHistory[currentAiMessageIndex] = {
                          ...newHistory[currentAiMessageIndex],
                          content: currentAiResponseRef.current.trim()
                            ? currentAiResponseRef.current +
                              `\nError: ${errorMessage}`
                            : `Error: ${errorMessage}`,
                        };
                      } else {
                        // If placeholder somehow wasn't there, add error as new message
                        newHistory.push({
                          type: "ai",
                          content: `Error: ${errorMessage}`,
                        });
                      }
                      return newHistory;
                    });
                    setIsChatLoading(false);
                    chatAbortControllerRef.current = null;
                  }

                  try {
                    await askMeetingAI(
                      meetingId,
                      questionToAsk,
                      handleChunkReceived,
                      handleStreamEnd,
                      handleStreamError,
                      chatAbortControllerRef.current.signal
                    );
                  } catch (outerError: any) {
                    console.error(
                      "[MeetingDetail] Unexpected error calling askMeetingAI:",
                      outerError
                    );
                    handleStreamError(
                      "Unexpected system error starting AI chat."
                    );
                  }
                }}
                className="flex items-center space-x-2"
              >
                <Input
                  type="text"
                  placeholder="Ask about the transcript..."
                  value={currentQuestion}
                  onChange={(e) => setCurrentQuestion(e.target.value)}
                  disabled={
                    isChatLoading || !meeting || meeting.status !== "completed"
                  }
                  className="flex-grow"
                />
                <Button
                  type="submit"
                  disabled={isChatLoading || !currentQuestion.trim()}
                >
                  {isChatLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="ml-2 sm:inline hidden">Send</span>
                </Button>
              </form>
              {chatError && (
                <p className="text-sm text-red-500 mt-2">Error: {chatError}</p>
              )}
            </CardContent>
          </Card>
        )}
    </div>
  );
}
