import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
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
  const [supportedMimeType, setSupportedMimeType] = useState<string | null>(
    null
  );

  // Determine supported audio MIME types on component mount
  useEffect(() => {
    const checkMimeTypeSupport = () => {
      // Order of preference (most desired to least)
      const mimeTypes = [
        "audio/wav",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
        "audio/mp3",
      ];

      // For Safari on iOS 14.3+
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
      // Fallback for older browsers - they might work without explicit type
      setSupportedMimeType("");
      console.log(
        "[CaptureButton] No explicit MIME type support detected, using browser default"
      );
    };

    checkMimeTypeSupport();
  }, []);

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

        // Create MediaRecorder with supported MIME type if available
        const recorderOptions: MediaRecorderOptions = {};
        if (supportedMimeType) {
          recorderOptions.mimeType = supportedMimeType;
        }

        try {
          mediaRecorderRef.current = new MediaRecorder(stream, recorderOptions);
        } catch (error) {
          console.warn(
            `[CaptureButton] Failed with mime type ${supportedMimeType}, trying without specific type. Error: ${
              (error as Error).message
            }`
          );
          // If fails with specific MIME type, try without it (browser will use default)
          mediaRecorderRef.current = new MediaRecorder(stream);
        }

        audioChunksRef.current = [];
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = async () => {
          // Use the actual MIME type from the MediaRecorder
          const actualMimeType =
            mediaRecorderRef.current?.mimeType ||
            supportedMimeType ||
            "audio/wav"; // Default to WAV
          const audioBlob = new Blob(audioChunksRef.current, {
            type: actualMimeType,
          });

          // For debugging
          console.log(
            `[CaptureButton] Recording completed with MIME type: ${actualMimeType}`
          );

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
            // Use the actual MIME type extension for the filename
            const mimeTypeWithoutCodec = actualMimeType.split(";")[0]; // e.g., "audio/webm" from "audio/webm;codecs=opus"
            const extension = mimeTypeWithoutCodec.split("/")[1] || "wav"; // Default extension to wav
            const filename = `audio.${extension}`;

            // Use the new function that sends JWT via apiClient
            const response = await transcribeAudioWithClient(
              audioBlob,
              userIdForTranscription,
              triggerMemoriesRefresh,
              filename
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

        // Start recording with intervals appropriate for mobile
        // Smaller interval = more chunks = better handling of failures
        mediaRecorderRef.current.start(1000); // Create a chunk every second
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
