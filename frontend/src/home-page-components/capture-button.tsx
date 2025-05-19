import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import {
  transcribeAudioChunkWithClient,
  startMeeting,
  endMeeting,
  askLiveMeetingTranscriptAI,
} from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CaptureButtonProps {
  onMeetingSuccessfullyEnded?: () => void;
}

export function CaptureButton({
  onMeetingSuccessfullyEnded,
}: CaptureButtonProps) {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [supportedMimeType, setSupportedMimeType] = useState<string | null>(
    null
  );
  const [liveTranscript, setLiveTranscript] = useState("");
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const pendingChunksRef = useRef(0);
  const isStoppingIntentRef = useRef(false);
  const activeMeetingIdRef = useRef<string | null>(null);
  const segmentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // State for live AI chat during recording
  const [liveQuestion, setLiveQuestion] = useState("");
  const [liveAiChatHistory, setLiveAiChatHistory] = useState<
    { user: string; ai: string }[]
  >([]);
  const [isAskingLiveAi, setIsAskingLiveAi] = useState(false);
  const [liveAiError, setLiveAiError] = useState<string | null>(null);
  const currentLiveAiResponseRef = useRef(""); // Ref to accumulate current AI response
  const liveAiEventSourceControllerRef = useRef<AbortController | null>(null); // To abort fetch if needed

  useEffect(() => {
    const checkMimeTypeSupport = () => {
      const mimeTypes = [
        "audio/wav",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
        "audio/mp3",
      ];
      if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
        for (const type of mimeTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            console.log(
              `[CaptureButton] Browser supports recording in ${type}`
            );
            setSupportedMimeType(type);
            return;
          }
        }
      }
      setSupportedMimeType("");
      console.log(
        "[CaptureButton] No explicit MIME type support detected, using browser default"
      );
    };
    checkMimeTypeSupport();
  }, []);

  async function handleAndSendAudioChunk(
    chunkBlob: Blob,
    meetingIdForChunk: string
  ) {
    if (!meetingIdForChunk || !user?.mongoId || !isAuthenticated) {
      console.log(
        "[CaptureButton] handleAndSendAudioChunk: Aborting because meetingIdForChunk or user details are missing.",
        `Meeting ID: ${meetingIdForChunk}, User ID: ${user?.mongoId}, Authenticated: ${isAuthenticated}`
      );
      return;
    }

    pendingChunksRef.current++;
    setIsProcessingChunk(true);
    console.log(
      `[CaptureButton] handleAndSendAudioChunk: Incremented pendingChunks. Now: ${pendingChunksRef.current}. About to call API for meeting ${meetingIdForChunk}`
    );
    try {
      const actualMimeType =
        chunkBlob.type ||
        mediaRecorderRef.current?.mimeType ||
        supportedMimeType ||
        "audio/wav";
      const mimeTypeWithoutCodec = actualMimeType.split(";")[0];
      const extension = mimeTypeWithoutCodec.split("/")[1] || "wav";
      const chunkFilename = `audio_chunk.${extension}`;

      console.log(
        `[CaptureButton] handleAndSendAudioChunk: Calling transcribeAudioChunkWithClient for meeting ${meetingIdForChunk}`
      );
      const response = await transcribeAudioChunkWithClient(
        chunkBlob,
        user.mongoId,
        chunkFilename,
        meetingIdForChunk
      );
      console.log(
        `[CaptureButton] handleAndSendAudioChunk: API call completed for meeting ${meetingIdForChunk}. Response:`,
        response
      );

      if (response.transcription) {
        setLiveTranscript((prev) => prev + response.transcription + " ");
      } else if (response.error) {
        console.error(
          "[CaptureButton] Chunk transcription error:",
          response.error
        );
      }
    } catch (err) {
      console.error(
        "[CaptureButton] handleAndSendAudioChunk: CATCH block. Failed to send/process audio chunk:",
        err
      );
    } finally {
      pendingChunksRef.current--;
      console.log(
        `[CaptureButton] handleAndSendAudioChunk: FINALLY block. Decremented pendingChunks. Now: ${pendingChunksRef.current}. isStopping: ${isStopping}, recorderState: ${mediaRecorderRef.current?.state}`
      );
      if (pendingChunksRef.current === 0) {
        setIsProcessingChunk(false);
      }
      if (
        isStoppingIntentRef.current &&
        pendingChunksRef.current === 0 &&
        mediaRecorderRef.current?.state === "inactive"
      ) {
        console.log(
          "[CaptureButton] handleAndSendAudioChunk: Conditions met in finally block (using ref), calling finalizeMeetingEnd()."
        );
        finalizeMeetingEnd(meetingIdForChunk ?? undefined);
      } else {
        console.log(
          "[CaptureButton] handleAndSendAudioChunk: Conditions NOT met in finally block for calling finalizeMeetingEnd() (using ref).",
          `isStoppingIntent: ${isStoppingIntentRef.current}`,
          `pendingChunks: ${pendingChunksRef.current}`,
          `recorderState: ${mediaRecorderRef.current?.state}`
        );
      }
    }
  }

  async function finalizeMeetingEnd(meetingIdToFinalizeParam?: string) {
    const meetingIdToUse =
      meetingIdToFinalizeParam || activeMeetingIdRef.current;
    console.log(
      "[CaptureButton] finalizeMeetingEnd called. ID to use:",
      meetingIdToUse,
      "isStoppingIntentRef:",
      isStoppingIntentRef.current
    );

    if (!meetingIdToUse) {
      console.log(
        "[CaptureButton] finalizeMeetingEnd: No meetingIdToUse available (from param or ref). Resetting UI states."
      );
      setIsRecording(false);
      setIsStopping(false);
      isStoppingIntentRef.current = false;
      setIsProcessingChunk(false);
      activeMeetingIdRef.current = null;
      if (currentMeetingId) setCurrentMeetingId(null);
      return;
    }

    console.log(
      "[CaptureButton] finalizeMeetingEnd: Proceeding to end meeting ID:",
      meetingIdToUse
    );

    try {
      console.log(
        `[CaptureButton] finalizeMeetingEnd: Calling endMeeting API for ${meetingIdToUse}`
      );
      const endResponse = await endMeeting(meetingIdToUse);
      console.log(
        "[CaptureButton] finalizeMeetingEnd: endMeeting API response:",
        endResponse
      );

      if (endResponse.error) {
        setError(
          endResponse.error || "Failed to properly end meeting on server."
        );
        console.error(
          "[CaptureButton] finalizeMeetingEnd: Error from endMeeting API:",
          endResponse.error
        );
      } else {
        console.log(
          "[CaptureButton] finalizeMeetingEnd: Meeting ended successfully on server:",
          endResponse
        );
        setLiveTranscript("");
        onMeetingSuccessfullyEnded?.();
      }
    } catch (err: any) {
      console.error(
        "[CaptureButton] finalizeMeetingEnd: Caught an exception during endMeeting call or processing:",
        err
      );
      setError("An error occurred while trying to end the meeting.");
    } finally {
      console.log(
        "[CaptureButton] finalizeMeetingEnd: Entering finally block. Resetting UI states for meeting:",
        meetingIdToUse
      );
      setIsRecording(false);
      setIsStopping(false);
      isStoppingIntentRef.current = false;
      setIsProcessingChunk(false);
      if (activeMeetingIdRef.current === meetingIdToUse) {
        activeMeetingIdRef.current = null;
      }
      setCurrentMeetingId(null);
      console.log("[CaptureButton] finalizeMeetingEnd: UI states reset.");
    }
  }

  function startNextRecordingSegment() {
    if (
      !streamRef.current ||
      streamRef.current
        .getTracks()
        .every((track) => track.readyState === "ended")
    ) {
      console.error(
        "[CaptureButton] startNextRecordingSegment: Stream is not available or ended. Cannot start next segment."
      );
      finalizeMeetingEnd(activeMeetingIdRef.current ?? undefined);
      return;
    }
    if (!activeMeetingIdRef.current) {
      console.error(
        "[CaptureButton] startNextRecordingSegment: No activeMeetingIdRef.current. Cannot start next segment."
      );
      finalizeMeetingEnd();
      return;
    }
    if (isStoppingIntentRef.current) {
      console.log(
        "[CaptureButton] startNextRecordingSegment: User has initiated a full stop. Aborting start of next segment."
      );
      return;
    }

    console.log(
      `[CaptureButton] startNextRecordingSegment: Attempting to start next segment for meeting ID: ${activeMeetingIdRef.current}`
    );

    const recorderOptions: MediaRecorderOptions = {};
    if (supportedMimeType) {
      recorderOptions.mimeType = supportedMimeType;
    }

    try {
      mediaRecorderRef.current = new MediaRecorder(
        streamRef.current,
        recorderOptions
      );
    } catch (error) {
      console.warn(
        `[CaptureButton] startNextRecordingSegment: Failed with mime type ${supportedMimeType}, trying without. Error: ${
          (error as Error).message
        }`
      );
      mediaRecorderRef.current = new MediaRecorder(streamRef.current!);
    }

    mediaRecorderRef.current.ondataavailable = (event) => {
      console.log(
        `[CaptureButton] >>> EVENT: ondataavailable (segment) - Fired. Recorder state: ${mediaRecorderRef.current?.state}, Data size: ${event.data.size}`
      );
      if (event.data.size > 0 && activeMeetingIdRef.current) {
        handleAndSendAudioChunk(event.data, activeMeetingIdRef.current);
      } else {
        console.log(
          "[CaptureButton] ondataavailable (segment): No data or meetingId. Not sending."
        );
      }
    };

    mediaRecorderRef.current.onstop = async () => {
      const idFromRefOnStop = activeMeetingIdRef.current;
      const wasIntentionalStopInitiatedByUser = isStoppingIntentRef.current;

      console.log(
        `[CaptureButton] MediaRecorder.onstop FIRED (during segment cycle). Meeting ID: ${idFromRefOnStop}. Pending Chunks: ${pendingChunksRef.current}. Was intentional stop: ${wasIntentionalStopInitiatedByUser}. Recorder state: ${mediaRecorderRef.current?.state}`
      );

      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current);
        segmentTimerRef.current = null;
        console.log(
          "[CaptureButton] onstop (segment cycle): Cleared segment timer."
        );
      }

      if (wasIntentionalStopInitiatedByUser) {
        console.log(
          "[CaptureButton] onstop (segment cycle): User-initiated stop detected. Stopping stream tracks."
        );
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        isStoppingIntentRef.current = true;
        if (!isStopping) setIsStopping(true);

        if (pendingChunksRef.current === 0) {
          finalizeMeetingEnd(idFromRefOnStop ?? undefined);
        } else {
          console.log(
            `[CaptureButton] onstop (segment cycle, user stop): Waiting for ${pendingChunksRef.current} pending chunks.`
          );
        }
      } else {
        console.log(
          "[CaptureButton] onstop (segment cycle): Programmatic segment stop. Attempting to start next segment."
        );
        if (!isStoppingIntentRef.current) {
          startNextRecordingSegment();
        } else {
          console.log(
            "[CaptureButton] onstop (segment cycle): User initiated stop during programmatic flow. Finalizing."
          );
          if (streamRef.current)
            streamRef.current.getTracks().forEach((track) => track.stop());
          if (pendingChunksRef.current === 0)
            finalizeMeetingEnd(idFromRefOnStop ?? undefined);
        }
      }
    };

    mediaRecorderRef.current.start();
    console.log(
      "[CaptureButton] startNextRecordingSegment: Next segment started."
    );

    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
    segmentTimerRef.current = setInterval(() => {
      console.log(
        "[CaptureButton] 30s segment timer fired (during segment cycle). Checking recorder state..."
      );
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        console.log(
          "[CaptureButton] Segment timer (segment cycle): Recorder active. Calling programmatic stop."
        );
        mediaRecorderRef.current.stop();
      } else {
        console.log(
          "[CaptureButton] Segment timer (segment cycle): Recorder not active. Timer will persist until full stop."
        );
      }
    }, 30000);
  }

  async function handleToggleRecording() {
    setError(null);
    if (isRecording) {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        console.log(
          "[CaptureButton] handleToggleRecording: User clicked Stop. Setting isStoppingIntentRef.current = true, setIsStopping(true)."
        );
        isStoppingIntentRef.current = true;
        setIsStopping(true);
        if (segmentTimerRef.current) {
          clearInterval(segmentTimerRef.current);
          segmentTimerRef.current = null;
        }
        mediaRecorderRef.current.stop();
      } else {
        console.log(
          "[CaptureButton] handleToggleRecording: Stop clicked, but recorder not in 'recording' state. Attempting to finalize if activeMeetingIdRef exists.",
          activeMeetingIdRef.current
        );
        if (segmentTimerRef.current) {
          clearInterval(segmentTimerRef.current);
          segmentTimerRef.current = null;
        }
        setIsRecording(false);
        setIsStopping(false);
        isStoppingIntentRef.current = false;
        if (activeMeetingIdRef.current) {
          finalizeMeetingEnd(activeMeetingIdRef.current ?? undefined);
        } else {
          activeMeetingIdRef.current = null;
          setCurrentMeetingId(null);
        }
      }
    } else {
      setLiveTranscript("");
      setCurrentMeetingId(null);
      activeMeetingIdRef.current = null;
      pendingChunksRef.current = 0;
      isStoppingIntentRef.current = false;
      setIsProcessingChunk(false);
      setIsStopping(false);

      try {
        console.log(
          "[CaptureButton] handleToggleRecording: Start clicked. Calling startMeeting API."
        );
        const meetingResponse = await startMeeting();
        if (meetingResponse.error || !meetingResponse.meetingId) {
          console.error(
            "[CaptureButton] Failed to start meeting:",
            meetingResponse.error
          );
          setError(
            meetingResponse.error ||
              "Could not start a new meeting on the server."
          );
          return;
        }
        setCurrentMeetingId(meetingResponse.meetingId);
        activeMeetingIdRef.current = meetingResponse.meetingId;
        console.log(
          "[CaptureButton] Started new meeting. state.currentMeetingId:",
          meetingResponse.meetingId,
          "ref.activeMeetingIdRef:",
          activeMeetingIdRef.current
        );
        const activeMeetingIdForClosure = meetingResponse.meetingId;

        try {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        } catch (err: any) {
          console.error("[CaptureButton] Error getting user media:", err);
          setError(`Error accessing microphone: ${err.message}`);
          setIsRecording(false);
          setIsStopping(false);
          isStoppingIntentRef.current = false;
          activeMeetingIdRef.current = null;
          setCurrentMeetingId(null);
          return;
        }

        const recorderOptions: MediaRecorderOptions = {};
        if (supportedMimeType) {
          recorderOptions.mimeType = supportedMimeType;
        }

        try {
          mediaRecorderRef.current = new MediaRecorder(
            streamRef.current!,
            recorderOptions
          );
        } catch (error) {
          console.warn(
            `[CaptureButton] Failed with mime type ${supportedMimeType}, trying without. Error: ${
              (error as Error).message
            }`
          );
          mediaRecorderRef.current = new MediaRecorder(streamRef.current!);
        }

        mediaRecorderRef.current.ondataavailable = (event) => {
          console.log(
            `[CaptureButton] >>> EVENT: ondataavailable (initial) - Fired. Recorder state: ${mediaRecorderRef.current?.state}, Data size: ${event.data.size}`
          );
          if (event.data.size > 0 && activeMeetingIdRef.current) {
            console.log(
              "[CaptureButton] ondataavailable (initial): event.data.size > 0 & activeMeetingIdRef.current exists, calling handleAndSendAudioChunk."
            );
            handleAndSendAudioChunk(event.data, activeMeetingIdRef.current);
          } else {
            console.log(
              "[CaptureButton] ondataavailable (initial): event.data.size is 0 or activeMeetingIdRef.current is missing. Not calling handleAndSendAudioChunk.",
              `Data size: ${event.data.size}, Active Meeting ID from ref: ${activeMeetingIdRef.current}`
            );
          }
        };

        mediaRecorderRef.current.onstop = async () => {
          const idFromRefOnStop = activeMeetingIdRef.current;
          const wasIntentionalStopInitiatedByUser = isStoppingIntentRef.current;

          console.log(
            `[CaptureButton] MediaRecorder.onstop FIRED (initial setup). Meeting ID: ${idFromRefOnStop}. Pending Chunks: ${pendingChunksRef.current}. Was intentional stop: ${wasIntentionalStopInitiatedByUser}. Recorder state: ${mediaRecorderRef.current?.state}`
          );

          if (segmentTimerRef.current) {
            clearInterval(segmentTimerRef.current);
            segmentTimerRef.current = null;
            console.log(
              "[CaptureButton] onstop (initial setup): Cleared segment timer."
            );
          }

          if (wasIntentionalStopInitiatedByUser) {
            console.log(
              "[CaptureButton] onstop (initial setup): User-initiated stop. Stopping stream tracks."
            );
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((track) => track.stop());
            }

            isStoppingIntentRef.current = true;
            if (!isStopping) setIsStopping(true);

            if (pendingChunksRef.current === 0) {
              console.log(
                "[CaptureButton] onstop (initial setup, user stop): No pending chunks. Calling finalizeMeetingEnd(). Meeting ID:",
                idFromRefOnStop
              );
              if (idFromRefOnStop)
                finalizeMeetingEnd(idFromRefOnStop ?? undefined);
              else finalizeMeetingEnd();
            } else {
              console.log(
                `[CaptureButton] onstop (initial setup, user stop): Waiting for ${pendingChunksRef.current} pending chunks.`
              );
            }
          } else {
            console.log(
              "[CaptureButton] onstop (initial setup): Programmatic segment stop. Attempting to start next segment."
            );
            if (!isStoppingIntentRef.current) {
              startNextRecordingSegment();
            } else {
              console.log(
                "[CaptureButton] onstop (initial setup): User initiated stop during programmatic flow. Finalizing."
              );
              if (streamRef.current)
                streamRef.current.getTracks().forEach((track) => track.stop());
              if (pendingChunksRef.current === 0)
                finalizeMeetingEnd(idFromRefOnStop ?? undefined);
            }
          }
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);

        if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
        segmentTimerRef.current = setInterval(() => {
          console.log(
            "[CaptureButton] 30s segment timer fired. Checking recorder state..."
          );
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === "recording"
          ) {
            console.log(
              "[CaptureButton] Segment timer: Recorder is active. Calling programmatic stop."
            );
            mediaRecorderRef.current.stop();
          } else {
            console.log(
              "[CaptureButton] Segment timer: Recorder not active or already stopped. Timer will continue until cleared by user stop or error."
            );
          }
        }, 30000);

        console.log(
          "[CaptureButton] Recording started. Segment timer initiated for 30s intervals."
        );
      } catch (err: any) {
        console.error(
          "[CaptureButton] Error starting recording or meeting:",
          err
        );
        let message = "Could not start recording.";
        if (err.message) message = err.message;
        setError(message);
        setIsRecording(false);
        setIsStopping(false);
        isStoppingIntentRef.current = false;
        activeMeetingIdRef.current = null;
        if (currentMeetingId) {
          console.warn(
            "[CaptureButton] Recording failed after meeting was started on backend. currentMeetingId was:",
            currentMeetingId
          );
          setCurrentMeetingId(null);
        }
      }
    }
  }

  // Handler for submitting questions about the live transcript
  async function handleAskLiveAISubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!liveQuestion.trim() || !currentMeetingId) {
      setLiveAiError("Please enter a question. A meeting must be active.");
      return;
    }

    // If there's an ongoing stream, abort it before starting a new one
    if (liveAiEventSourceControllerRef.current) {
      liveAiEventSourceControllerRef.current.abort();
    }
    liveAiEventSourceControllerRef.current = new AbortController();

    const questionToAsk = liveQuestion;
    setLiveQuestion("");
    setIsAskingLiveAi(true);
    setLiveAiError(null);
    currentLiveAiResponseRef.current = ""; // Reset accumulator

    // Add user's question and a placeholder for AI's streaming response
    const newChatHistoryEntry = { user: questionToAsk, ai: "" };
    setLiveAiChatHistory((prev) => [...prev, newChatHistoryEntry]);
    const currentChatEntryIndex = liveAiChatHistory.length; // Index of the entry we just added (before state update finishes)

    function updateCurrentAiMessage(textChunk: string) {
      currentLiveAiResponseRef.current += textChunk;
      setLiveAiChatHistory((prev) =>
        prev.map((chat, index) =>
          index === currentChatEntryIndex
            ? { ...chat, ai: currentLiveAiResponseRef.current }
            : chat
        )
      );
    }

    function handleStreamEnd() {
      setIsAskingLiveAi(false);
      liveAiEventSourceControllerRef.current = null; // Clear controller
      console.log("[CaptureButton] Live AI stream ended.");
    }

    function handleStreamError(errorMessage: string) {
      setLiveAiError(errorMessage);
      setLiveAiChatHistory((prev) =>
        prev.map((chat, index) =>
          index === currentChatEntryIndex && chat.ai === ""
            ? { ...chat, ai: `Error: ${errorMessage}` }
            : chat
        )
      );
      setIsAskingLiveAi(false);
      liveAiEventSourceControllerRef.current = null; // Clear controller
    }

    try {
      // The AbortSignal would be passed to fetch if askLiveMeetingTranscriptAI supported it directly.
      // For now, manual abort via controller is used before new call.
      await askLiveMeetingTranscriptAI(
        currentMeetingId!,
        questionToAsk,
        updateCurrentAiMessage,
        handleStreamEnd,
        handleStreamError,
        liveAiEventSourceControllerRef.current?.signal
      );
    } catch (error: any) {
      // This catch is for unexpected errors in invoking askLiveMeetingTranscriptAI itself (e.g., if it wasn't async)
      // Most errors should be handled by the onError callback passed to it.
      console.error(
        "[CaptureButton] Unexpected error calling askLiveMeetingTranscriptAI:",
        error
      );
      handleStreamError("Unexpected system error occurred.");
    }
  }

  const buttonDisabled =
    isAuthLoading ||
    (isRecording && isStopping && !isStoppingIntentRef.current);
  const showSpinner = isRecording && (isStopping || isProcessingChunk);

  return (
    <div className="flex flex-col items-center space-y-4 p-4 w-full max-w-md mx-auto">
      <Button
        size="icon"
        className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        onClick={handleToggleRecording}
        disabled={buttonDisabled}
        variant={isRecording ? "destructive" : "default"}
      >
        {showSpinner ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : isRecording ? (
          <Square className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
        <span className="sr-only">
          {isRecording
            ? showSpinner
              ? "Processing..."
              : "Stop Capture"
            : isAuthLoading
            ? "Authenticating..."
            : "Start Capture"}
        </span>
      </Button>
      {currentMeetingId && (isRecording || isStopping) && (
        <p className="text-xs text-gray-500">Meeting ID: {currentMeetingId}</p>
      )}
      {isRecording && liveTranscript && (
        <Card className="w-full mt-4">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-md font-semibold">
              Live Transcript
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 max-h-48 overflow-y-auto">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {liveTranscript}
            </p>
          </CardContent>
        </Card>
      )}
      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      {/* Live AI Chat during recording */}
      {isRecording && currentMeetingId && liveTranscript && (
        <Card className="w-full mt-4">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-md font-semibold">
              Ask AI (Live Transcript)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-3">
            {liveAiChatHistory.length > 0 && (
              <ScrollArea className="h-40 w-full p-2 border rounded-md">
                {liveAiChatHistory.map((chat, index) => (
                  <div key={index} className="mb-2 text-xs">
                    <p className="font-semibold text-blue-600">
                      You: {chat.user}
                    </p>
                    <p className="text-gray-700 whitespace-pre-wrap">
                      AI: {chat.ai}
                    </p>
                  </div>
                ))}
              </ScrollArea>
            )}
            <form onSubmit={handleAskLiveAISubmit} className="flex space-x-2">
              <Input
                type="text"
                placeholder="Ask about live transcript..."
                value={liveQuestion}
                onChange={(e) => setLiveQuestion(e.target.value)}
                disabled={isAskingLiveAi}
                className="flex-grow"
              />
              <Button type="submit" disabled={isAskingLiveAi} size="sm">
                {isAskingLiveAi ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Ask"
                )}
              </Button>
            </form>
            {liveAiError && (
              <p className="text-xs text-red-500">Error: {liveAiError}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
