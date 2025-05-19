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
                {isChatLoading && (
                  <div className="flex justify-start mb-2">
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                      Thinking...
                    </div>
                  </div>
                )}
              </ScrollArea>

              <form
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  if (!currentQuestion.trim() || isChatLoading || !meetingId)
                    return;

                  const newChatMessage: ChatMessage = {
                    type: "user",
                    content: currentQuestion.trim(),
                  };
                  setChatHistory((prev) => [...prev, newChatMessage]);
                  setCurrentQuestion("");
                  setIsChatLoading(true);
                  setChatError(null);

                  const response = await askMeetingAI(
                    meetingId,
                    newChatMessage.content
                  );

                  if (response.answer) {
                    setChatHistory((prev) => [
                      ...prev,
                      { type: "ai", content: response.answer! },
                    ]);
                  } else if (response.error) {
                    setChatError(response.error);
                    setChatHistory((prev) => [
                      ...prev,
                      { type: "ai", content: `Error: ${response.error}` },
                    ]);
                  }
                  setIsChatLoading(false);
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
