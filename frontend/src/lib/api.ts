import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// Define a simple interface for the Memory object expected from the backend
export interface IFrontendMemory {
  _id: string;
  userId: string;
  text: string;
  createdAt: string; // Dates are often stringified in JSON
}

interface TranscriptionResponse {
  transcription?: string;
  error?: string;
  message?: string; // Backend sends a message on successful save
  memory?: IFrontendMemory; // Use the defined interface
}

export async function transcribeAudio(
  audioBlob: Blob,
  userId: string
): Promise<TranscriptionResponse> {
  console.log("[api.ts] transcribeAudio received userId:", userId);
  const formData = new FormData();
  // Ensure the filename has an extension, as Whisper might rely on it, or the backend multer setup.
  // Using .webm as a default as it's a common format from MediaRecorder.
  formData.append("audio", audioBlob, "audio.wav");
  formData.append("userId", userId);

  try {
    const response = await axios.post<TranscriptionResponse>(
      `${API_BASE_URL}/api/transcribe`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return response.data;
  } catch (error: unknown) {
    // Changed from any to unknown for better type safety
    if (axios.isAxiosError(error) && error.response) {
      // The backend might send a response with an error message
      return error.response.data as TranscriptionResponse; // Assume error response matches structure
    }
    return { error: "An unexpected error occurred during transcription." };
  }
}
