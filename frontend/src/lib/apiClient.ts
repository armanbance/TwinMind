import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const APP_AUTH_TOKEN_KEY = "appAuthToken"; // Same key as in AuthContext

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Interceptor to add JWT to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(APP_AUTH_TOKEN_KEY);
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    // console.log("[apiClient] Request Config:", config);
    return config;
  },
  (error) => {
    // console.error("[apiClient] Request Error Interceptor:", error);
    return Promise.reject(error);
  }
);

// Optional: Interceptor for responses, e.g., to handle global 401 errors
apiClient.interceptors.response.use(
  (response) => {
    // console.log("[apiClient] Response Data:", response.data);
    return response;
  },
  (error) => {
    // console.error(
    //   "[apiClient] Response Error Interceptor:",
    //   error.response?.data || error.message
    // );
    if (error.response && error.response.status === 401) {
      // Handle 401: e.g., redirect to login, call logout from AuthContext
      // console.warn(
      //   "[apiClient] Received 401 Unauthorized. Consider logging out user."
      // );
      // Example: You might want to call a global logout function or event here
      // authContext.logout(); // This would require passing authContext or using an event emitter
      localStorage.removeItem(APP_AUTH_TOKEN_KEY); // Basic cleanup
      localStorage.removeItem("appUser");
      localStorage.removeItem("appIsAuthenticated");
      // window.location.href = '/login'; // Or your login route
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// You can now refactor transcribeAudio to use this apiClient
// Example of how you might update your transcribeAudio function (e.g., in api.ts or here)

export interface IFrontendMemory {
  _id: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface TranscriptionResponse {
  transcription?: string;
  error?: string;
  message?: string;
  memory?: IFrontendMemory;
}

export async function transcribeAudioWithClient(
  audioBlob: Blob,
  userId: string, // userId is still needed to confirm user is logged in on client, but not sent in form data
  triggerMemoriesRefresh?: () => void, // Add triggerMemoriesRefresh as an optional parameter
  filename: string = "audio.wav" // Changed default filename to audio.wav
): Promise<TranscriptionResponse> {
  console.log(
    "[transcribeAudioWithClient] called for userId (client-side check):",
    userId
  );
  const formData = new FormData();
  formData.append("audio", audioBlob, filename);
  // formData.append('userId', userId); // REMOVED - userId now comes from JWT on backend

  try {
    // apiClient will automatically add the Authorization header if token exists
    const response = await apiClient.post<TranscriptionResponse>(
      "/api/transcribe",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } } // Keep for FormData
    );

    // After successfully creating a new memory, trigger the refresh if the function is provided
    if (
      response.status === 201 &&
      response.data.memory &&
      triggerMemoriesRefresh
    ) {
      // console.log(
      //   "[apiClient] New memory created, calling triggerMemoriesRefresh()."
      // );
      triggerMemoriesRefresh();
    }

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as TranscriptionResponse;
    }
    return {
      error: "An unexpected error occurred during transcription via apiClient.",
    };
  }
}

// New function to send audio chunks for transcription
export async function transcribeAudioChunkWithClient(
  audioBlob: Blob,
  userId: string, // Still useful for context/logging, backend validates user against meeting
  filename: string = "audio_chunk.wav",
  meetingId: string // New parameter for the meeting ID
): Promise<TranscriptionResponse> {
  console.log(
    `[transcribeAudioChunkWithClient] sending chunk for meetingId: ${meetingId}, userId: ${userId}`
  );
  const formData = new FormData();
  formData.append("audio", audioBlob, filename);

  try {
    const response = await apiClient.post<TranscriptionResponse>(
      `/api/meetings/${meetingId}/chunk`, // Updated endpoint
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as TranscriptionResponse;
    }
    return {
      error: "An unexpected error occurred during chunk transcription.",
    };
  }
}

// New function to start a meeting
export interface StartMeetingResponse {
  message?: string;
  meetingId?: string;
  error?: string;
}

export async function startMeeting(): Promise<StartMeetingResponse> {
  console.log("[apiClient] Attempting to start a new meeting.");
  try {
    const response = await apiClient.post<StartMeetingResponse>(
      "/api/meetings/start"
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as StartMeetingResponse;
    }
    return {
      error: "An unexpected error occurred while starting the meeting.",
    };
  }
}

// New function to end a meeting
export interface EndMeetingResponse {
  message?: string;
  meetingId?: string;
  status?: string;
  error?: string;
}

export async function endMeeting(
  meetingId: string
): Promise<EndMeetingResponse> {
  console.log(`[apiClient] Attempting to end meeting: ${meetingId}`);
  try {
    const response = await apiClient.post<EndMeetingResponse>(
      `/api/meetings/${meetingId}/end`
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as EndMeetingResponse;
    }
    return { error: "An unexpected error occurred while ending the meeting." };
  }
}

// Interface for the Meeting object expected from the backend (subset for listing)
export interface IMeetingSummary {
  _id: string;
  userId: string;
  startTime: string; // Dates are often stringified in JSON
  endTime?: string;
  status: "active" | "processing_final_chunk" | "completed" | "error";
  fullTranscriptText?: string; // Might still be included if not explicitly excluded by select, or for small ones
  summary?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchMeetings(): Promise<
  IMeetingSummary[] | { error: string }
> {
  console.log("[apiClient] Fetching meetings.");
  try {
    const response = await apiClient.get<IMeetingSummary[]>("/api/meetings");
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return {
        error:
          error.response.data?.error || "Failed to fetch meetings from server.",
      };
    }
    return { error: "An unexpected error occurred while fetching meetings." };
  }
}

// Interface for a full Meeting object (includes transcript details)
// This should align with IMeeting from backend/src/models/meeting.model.ts
export interface ITranscriptChunk {
  order: number;
  text: string;
  timestamp: string; // Dates are often stringified
}

export interface IFullMeeting extends IMeetingSummary {
  // Extends summary, adds more detail
  transcriptChunks: ITranscriptChunk[];
  // fullTranscriptText is already optional in IMeetingSummary, will be populated here
}

export async function fetchFullMeetingDetails(
  meetingId: string
): Promise<IFullMeeting | { error: string }> {
  console.log(`[apiClient] Fetching full details for meeting: ${meetingId}`);
  try {
    const response = await apiClient.get<IFullMeeting>(
      `/api/meetings/${meetingId}`
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return {
        error:
          error.response.data?.error ||
          `Failed to fetch details for meeting ${meetingId}.`,
      };
    }
    return {
      error: `An unexpected error occurred while fetching details for meeting ${meetingId}.`,
    };
  }
}

// New function to fetch calendar events
export interface GoogleCalendarEvent {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: {
    dateTime?: string | null;
    date?: string | null;
    timeZone?: string | null;
  };
  end?: {
    dateTime?: string | null;
    date?: string | null;
    timeZone?: string | null;
  };
  // Add other event properties you need
}

export async function fetchCalendarEvents(
  googleAccessToken: string
): Promise<GoogleCalendarEvent[]> {
  // console.log(
  //   "[apiClient] fetchCalendarEvents called. Using Google Access Token (first 10 chars):",
  //   googleAccessToken.substring(0, 10) + "..."
  // );
  try {
    // apiClient will automatically add your app's JWT for backend authentication
    const response = await apiClient.get<GoogleCalendarEvent[]>(
      "/api/calendar/events",
      {
        headers: {
          "X-Google-Access-Token": googleAccessToken, // Send Google Access Token in custom header
        },
      }
    );
    return response.data;
  } catch (error: unknown) {
    // console.error("[apiClient] Error fetching calendar events:", error);
    // Let the calling component handle the error display or further action
    // You might want to throw the error or return a specific error structure
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        error.response.data?.error ||
          "Failed to fetch calendar events from backend"
      );
    }
    throw new Error(
      "An unexpected error occurred while fetching calendar events."
    );
  }
}

// Interface for the response from the meeting-specific AI endpoint
export interface AskMeetingAIResponse {
  answer?: string;
  error?: string;
}

// Function to ask AI about a specific meeting's transcript
export async function askMeetingAI(
  meetingId: string,
  question: string
): Promise<AskMeetingAIResponse> {
  console.log(
    `[apiClient] Asking AI about meeting ${meetingId}, question: "${question}"`
  );
  try {
    const response = await apiClient.post<AskMeetingAIResponse>(
      `/api/meetings/${meetingId}/ask-ai`,
      { question } // Send question in the body
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as AskMeetingAIResponse;
    }
    return {
      error: "An unexpected error occurred while asking the meeting AI.",
    };
  }
}

export async function askLiveMeetingTranscriptAI(
  meetingId: string,
  question: string
): Promise<{ answer?: string; error?: string }> {
  // Removed direct token handling as apiClient instance will handle it via interceptor
  // const token = localStorage.getItem("authToken");
  // if (!token) return { error: "No authentication token found." };

  try {
    // Use the global apiClient instance which has the interceptor
    const response = await apiClient.post(
      `/api/meetings/${meetingId}/ask-live-transcript`, // apiClient prepends API_BASE_URL
      { question },
      {
        headers: {
          // Authorization header will be added by the interceptor
          "Content-Type": "application/json", // Still good to specify for POST
        },
      }
    );
    return { answer: response.data.answer };
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      console.error(
        "askLiveMeetingTranscriptAI error (axios):",
        error.response.data
      );
      return {
        error:
          error.response.data.error ||
          `Server responded with ${error.response.status}`,
      };
    } else if (error instanceof Error) {
      console.error(
        "askLiveMeetingTranscriptAI error (generic):",
        error.message
      );
      return { error: error.message };
    }
    console.error("askLiveMeetingTranscriptAI error (unknown):", error);
    return { error: "An unknown error occurred." };
  }
}
