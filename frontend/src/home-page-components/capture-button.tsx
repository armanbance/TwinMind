import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";
import { transcribeAudioWithClient } from "@/lib/apiClient"; // New import
import { useAuth } from "@/contexts/AuthContext"; // Assuming path is correct

export function CaptureButton() {
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    triggerMemoriesRefresh,
  } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  async function handleToggleRecording() {
    setError(null);
    if (isRecording) {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: "audio/webm",
        });
        audioChunksRef.current = [];
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          audioChunksRef.current = [];
          stream.getTracks().forEach((track) => track.stop());

          setIsTranscribing(true);
          const userIdForTranscription = user?.mongoId;
          console.log(
            "[CaptureButton] Attempting to transcribe with userId:",
            userIdForTranscription
          );

          if (isAuthLoading) {
            console.warn(
              "[CaptureButton] Auth is still loading. Aborting transcription attempt."
            );
            setError(
              "Authentication is still initializing. Please try again shortly."
            );
            setIsTranscribing(false);
            setIsRecording(false);
            return;
          }
          if (!isAuthenticated || !userIdForTranscription) {
            console.error(
              "[CaptureButton] User not authenticated or mongoId missing for transcription."
            );
            setError(
              "User not authenticated. Please log in again to transcribe."
            );
            setIsTranscribing(false);
            setIsRecording(false);
            return;
          }

          try {
            // Use the new function that sends JWT via apiClient
            const response = await transcribeAudioWithClient(
              audioBlob,
              userIdForTranscription,
              triggerMemoriesRefresh
            );
            if (response.error) {
              console.error(
                "[CaptureButton] Transcription error:",
                response.error
              );
              setError(`Transcription failed: ${response.error}`);
            } else if (response.transcription) {
              console.log(
                "[CaptureButton] Transcription successful:",
                response.transcription,
                "Memory:",
                response.memory
              );
              // TODO: Display transcription/memory info to user
            } else {
              console.warn(
                "[CaptureButton] Received an empty or unexpected response from transcription API"
              );
              setError("Received an unexpected response after transcription.");
            }
          } catch (err: unknown) {
            console.error("[CaptureButton] API call failed:", err);
            let message = "Unknown error during transcription call.";
            if (err instanceof Error) message = err.message;
            setError(`Transcription API call failed: ${message}`);
          } finally {
            setIsTranscribing(false);
            setIsRecording(false);
          }
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error(
          "[CaptureButton] Error accessing microphone or starting recording:",
          err
        );
        let message =
          "Could not start recording. Please ensure microphone access.";
        if (err instanceof Error) message = err.message;
        setError(message);
        setIsRecording(false);
      }
    }
  }

  return (
    <div className="flex flex-col items-center space-y-2">
      <Button
        size="icon"
        className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        onClick={handleToggleRecording}
        disabled={isTranscribing || isAuthLoading}
        variant={isRecording ? "destructive" : "default"}
      >
        {isTranscribing ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : isRecording ? (
          <Square className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
        <span className="sr-only">
          {isTranscribing
            ? "Transcribing..."
            : isRecording
            ? "Stop Capture"
            : isAuthLoading
            ? "Authenticating..."
            : "Start Capture"}
        </span>
      </Button>
      {error && <p className="text-sm text-red-500">Error: {error}</p>}
    </div>
  );
}
