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
  filename: string = "audio.webm" // Add optional filename parameter with default
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
