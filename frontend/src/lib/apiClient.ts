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
  // No longer just a single answer, but streaming, so this interface might be less relevant
  // or represent the final accumulated answer if needed elsewhere, though callbacks handle live updates.
}

// Function to ask AI about a specific meeting's transcript - NOW STREAMING
export async function askMeetingAI(
  meetingId: string,
  question: string,
  onChunkReceived: (textChunk: string) => void, // Callback for each text chunk
  onEnd: () => void, // Callback for when stream ends
  onError: (errorMessage: string) => void, // Callback for errors
  signal?: AbortSignal // Optional AbortSignal
): Promise<void> {
  // Returns void as data is handled via callbacks
  console.log(
    `[apiClient] Asking AI (streaming) about meeting ${meetingId}, question: "${question}"`
  );
  const token = localStorage.getItem(APP_AUTH_TOKEN_KEY);
  if (!token) {
    onError("No authentication token found.");
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/meetings/${meetingId}/ask-ai`, // Ensure this is the correct endpoint
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ question }),
        signal,
      }
    );

    if (!response.ok) {
      try {
        const errorData = await response.json();
        const errorMessage =
          errorData.details ||
          errorData.error ||
          `Server responded with ${response.status}`;
        console.error(
          "[apiClient] askMeetingAI Server error (not ok):",
          errorMessage,
          "Status:",
          response.status,
          "Data:",
          errorData
        );
        onError(errorMessage);
      } catch (e) {
        console.error(
          "[apiClient] askMeetingAI Server error (not ok, could not parse JSON body):",
          response.status
        );
        onError(`Server responded with ${response.status}`);
      }
      return;
    }

    if (!response.body) {
      console.error("[apiClient] askMeetingAI Response body is null.");
      onError("Response body is null, cannot read stream.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    async function processStream() {
      console.log(
        "[apiClient] askMeetingAI processStream started. Signal aborted:",
        signal?.aborted
      );
      if (signal?.aborted) {
        console.log(
          "[apiClient] askMeetingAI processStream: Request aborted before streaming began."
        );
        onError("Request aborted before streaming began.");
        if (!reader.closed)
          reader
            .cancel("Request aborted")
            .catch((e) =>
              console.warn(
                "[apiClient] askMeetingAI Error cancelling reader (pre-stream abort):",
                e
              )
            );
        return;
      }

      try {
        while (true) {
          if (signal?.aborted) {
            console.log(
              "[apiClient] askMeetingAI processStream: Request aborted during streaming loop."
            );
            onError("Request aborted during streaming.");
            if (!reader.closed)
              reader
                .cancel("Request aborted")
                .catch((e) =>
                  console.warn(
                    "[apiClient] askMeetingAI Error cancelling reader (mid-stream abort):",
                    e
                  )
                );
            break;
          }

          console.log(
            "[apiClient] askMeetingAI processStream: Calling reader.read()"
          );
          const { done, value } = await reader.read();
          console.log(
            "[apiClient] askMeetingAI processStream: reader.read() returned. Done:",
            done
          );

          if (done) {
            console.log(
              "[apiClient] askMeetingAI processStream: Stream done. Final buffer:",
              buffer
            );
            if (buffer.trim()) {
              try {
                const jsonString = buffer.replace(/^data: /, "").trim();
                if (jsonString) {
                  console.log(
                    "[apiClient] askMeetingAI processStream (done): Parsing final buffered JSON string:",
                    jsonString
                  );
                  const json = JSON.parse(jsonString);
                  console.log(
                    "[apiClient] askMeetingAI processStream (done): Parsed final JSON:",
                    json
                  );
                  if (json.text) {
                    console.log(
                      "[apiClient] askMeetingAI processStream (done): Calling onChunkReceived with final text:",
                      json.text
                    );
                    onChunkReceived(json.text);
                  } else if (json.event === "EOS") {
                    console.log(
                      "[apiClient] askMeetingAI processStream (done): EOS event found in final buffer."
                    );
                  } else if (json.error) {
                    const finalErrorMessage = json.details || json.error;
                    console.error(
                      "[apiClient] askMeetingAI processStream (done): Error event in final buffer:",
                      finalErrorMessage
                    );
                    onError(finalErrorMessage);
                    return;
                  }
                }
              } catch (e: any) {
                console.error(
                  "[apiClient] askMeetingAI processStream (done): Error parsing final buffered JSON:",
                  e.message,
                  "Buffer:",
                  buffer
                );
              }
            }
            console.log(
              "[apiClient] askMeetingAI processStream: Calling onEnd() as stream is done."
            );
            onEnd();
            break;
          }

          const decodedChunk = decoder.decode(value, { stream: true });
          console.log(
            "[apiClient] askMeetingAI processStream: Decoded chunk:",
            decodedChunk
          );
          buffer += decodedChunk;
          console.log(
            "[apiClient] askMeetingAI processStream: Current buffer:",
            buffer
          );

          let eolIndex;
          while ((eolIndex = buffer.indexOf("\n\n")) >= 0) {
            const line = buffer.substring(0, eolIndex).trim();
            buffer = buffer.substring(eolIndex + 2);
            console.log(
              "[apiClient] askMeetingAI processStream: Processing line:",
              line,
              "Remaining buffer:",
              buffer
            );

            if (line.startsWith("data:")) {
              const jsonString = line.substring("data:".length).trim();
              if (jsonString) {
                console.log(
                  "[apiClient] askMeetingAI processStream: Parsing JSON string from line:",
                  jsonString
                );
                try {
                  const json = JSON.parse(jsonString);
                  console.log(
                    "[apiClient] askMeetingAI processStream: Parsed JSON:",
                    json
                  );
                  if (json.text) {
                    console.log(
                      "[apiClient] askMeetingAI processStream: Calling onChunkReceived with text:",
                      json.text
                    );
                    onChunkReceived(json.text);
                  } else if (json.event === "EOS") {
                    console.log(
                      "[apiClient] askMeetingAI processStream: EOS event received. Stream should close soon."
                    );
                  } else if (json.error) {
                    const streamErrorMessage = json.details || json.error;
                    console.error(
                      "[apiClient] askMeetingAI processStream: Error event from stream:",
                      streamErrorMessage
                    );
                    onError(streamErrorMessage);
                    if (!reader.closed)
                      reader
                        .cancel("Error received from server")
                        .catch((e) =>
                          console.warn(
                            "[apiClient] askMeetingAI Error cancelling reader (server error event):",
                            e
                          )
                        );
                    return;
                  }
                } catch (e: any) {
                  console.error(
                    "[apiClient] askMeetingAI processStream: Error parsing JSON from stream:",
                    e.message,
                    "Line:",
                    line
                  );
                  onError("Error parsing data from stream: " + e.message);
                  if (!reader.closed)
                    reader
                      .cancel("JSON parsing error")
                      .catch((err) =>
                        console.warn(
                          "[apiClient] askMeetingAI Error cancelling reader (JSON parse error):",
                          err
                        )
                      );
                  return;
                }
              } else {
                console.warn(
                  "[apiClient] askMeetingAI processStream: Received data: prefix with empty content. Line:",
                  line
                );
              }
            } else if (line.trim()) {
              console.warn(
                "[apiClient] askMeetingAI processStream: Received non-empty line without data: prefix:",
                line
              );
            }
          }
        }
      } catch (loopError: any) {
        console.error(
          "[apiClient] askMeetingAI processStream: Error in streaming loop:",
          loopError.message,
          "Signal aborted:",
          signal?.aborted
        );
        if (
          signal?.aborted &&
          (loopError.name === "AbortError" ||
            loopError.message.includes("aborted"))
        ) {
          console.log(
            "[apiClient] askMeetingAI processStream: Stream reading aborted as expected."
          );
          if (!reader.closed) {
            onError("Request aborted during data reading.");
          }
        } else {
          onError(
            "Critical error during AI response reading: " + loopError.message
          );
        }
        if (!reader.closed)
          reader
            .cancel("Streaming loop error")
            .catch((e) =>
              console.warn(
                "[apiClient] askMeetingAI Error cancelling reader (loop error):",
                e
              )
            );
      } finally {
        console.log(
          "[apiClient] askMeetingAI processStream: Exiting. Reader closed status:",
          reader.closed
        );
      }
    }

    processStream().catch((streamError: any) => {
      console.error(
        "[apiClient] askMeetingAI processStream Outer Catch: Unhandled error during stream processing:",
        streamError.message,
        "Signal aborted:",
        signal?.aborted
      );
      if (
        signal?.aborted &&
        (streamError.name === "AbortError" ||
          streamError.message.includes("aborted"))
      ) {
        console.log(
          "[apiClient] askMeetingAI processStream Outer Catch: Stream processing aborted as expected."
        );
      } else {
        onError(
          "A critical unhandled error occurred while reading the AI response: " +
            streamError.message
        );
      }
      if (!reader.closed) {
        reader
          .cancel("Outer stream processing error")
          .catch((cancelError) =>
            console.warn(
              "[apiClient] askMeetingAI Error during reader cancellation (outer catch):",
              cancelError
            )
          );
      }
    });
  } catch (error: any) {
    console.error(
      "[apiClient] askMeetingAI: Top-level fetch/setup error:",
      error.message,
      "Signal aborted:",
      signal?.aborted
    );
    if (
      signal?.aborted &&
      (error.name === "AbortError" || error.message.includes("aborted"))
    ) {
      console.log(
        "[apiClient] askMeetingAI: Fetch request was aborted by signal."
      );
      onError("Request aborted.");
    } else {
      onError(
        "Failed to initiate connection to the server for AI chat: " +
          error.message
      );
    }
  }
}

export async function askLiveMeetingTranscriptAI(
  meetingId: string,
  question: string,
  onChunkReceived: (textChunk: string) => void,
  onEnd: () => void,
  onError: (errorMessage: string) => void,
  signal?: AbortSignal // Add AbortSignal as an optional parameter
): Promise<void> {
  // Returns void as data is handled via callbacks
  const token = localStorage.getItem("appAuthToken");
  if (!token) {
    onError("No authentication token found.");
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/meetings/${meetingId}/ask-live-transcript`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream", // Important: tell server we can handle SSE
        },
        body: JSON.stringify({ question }),
        signal, // Pass the signal to fetch
      }
    );

    if (!response.ok) {
      try {
        const errorData = await response.json();
        const errorMessage =
          errorData.details ||
          errorData.error ||
          `Server responded with ${response.status}`;
        console.error(
          "[apiClient] Server error (not ok):",
          errorMessage,
          "Status:",
          response.status,
          "Data:",
          errorData
        );
        onError(errorMessage);
      } catch (e) {
        console.error(
          "[apiClient] Server error (not ok, could not parse JSON body):",
          response.status
        );
        onError(`Server responded with ${response.status}`);
      }
      return;
    }

    if (!response.body) {
      console.error("[apiClient] Response body is null.");
      onError("Response body is null, cannot read stream.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    async function processStream() {
      console.log(
        "[apiClient] processStream started. Signal aborted:",
        signal?.aborted
      );
      if (signal?.aborted) {
        console.log(
          "[apiClient] processStream: Request aborted before streaming began."
        );
        onError("Request aborted before streaming began.");
        // reader.cancel() might not be necessary if fetch promise itself was aborted,
        // but good for completeness if somehow processStream is called with an already aborted signal.
        if (!reader.closed)
          reader
            .cancel("Request aborted")
            .catch((e) =>
              console.warn(
                "[apiClient] Error cancelling reader (pre-stream abort):",
                e
              )
            );
        return;
      }

      try {
        while (true) {
          if (signal?.aborted) {
            console.log(
              "[apiClient] processStream: Request aborted during streaming loop."
            );
            onError("Request aborted during streaming.");
            if (!reader.closed)
              reader
                .cancel("Request aborted")
                .catch((e) =>
                  console.warn(
                    "[apiClient] Error cancelling reader (mid-stream abort):",
                    e
                  )
                );
            break;
          }

          console.log("[apiClient] processStream: Calling reader.read()");
          const { done, value } = await reader.read();
          console.log(
            "[apiClient] processStream: reader.read() returned. Done:",
            done
          );

          if (done) {
            console.log(
              "[apiClient] processStream: Stream done. Final buffer:",
              buffer
            );
            if (buffer.trim()) {
              try {
                const jsonString = buffer.replace(/^data: /, "").trim();
                if (jsonString) {
                  console.log(
                    "[apiClient] processStream (done): Parsing final buffered JSON string:",
                    jsonString
                  );
                  const json = JSON.parse(jsonString);
                  console.log(
                    "[apiClient] processStream (done): Parsed final JSON:",
                    json
                  );
                  if (json.text) {
                    console.log(
                      "[apiClient] processStream (done): Calling onChunkReceived with final text:",
                      json.text
                    );
                    onChunkReceived(json.text);
                  } else if (json.event === "EOS") {
                    console.log(
                      "[apiClient] processStream (done): EOS event found in final buffer."
                    );
                  } else if (json.error) {
                    const finalErrorMessage = json.details || json.error;
                    console.error(
                      "[apiClient] processStream (done): Error event in final buffer:",
                      finalErrorMessage
                    );
                    onError(finalErrorMessage);
                    return;
                  }
                }
              } catch (e: any) {
                console.error(
                  "[apiClient] processStream (done): Error parsing final buffered JSON:",
                  e.message,
                  "Buffer:",
                  buffer
                );
                // onError("Error parsing final part of stream: " + e.message); // Avoid double error if stream just ends.
              }
            }
            console.log(
              "[apiClient] processStream: Calling onEnd() as stream is done."
            );
            onEnd();
            break;
          }

          const decodedChunk = decoder.decode(value, { stream: true });
          console.log(
            "[apiClient] processStream: Decoded chunk:",
            decodedChunk
          );
          buffer += decodedChunk;
          console.log("[apiClient] processStream: Current buffer:", buffer);

          let eolIndex;
          while ((eolIndex = buffer.indexOf("\n\n")) >= 0) {
            const line = buffer.substring(0, eolIndex).trim();
            buffer = buffer.substring(eolIndex + 2);
            console.log(
              "[apiClient] processStream: Processing line:",
              line,
              "Remaining buffer:",
              buffer
            );

            if (line.startsWith("data:")) {
              const jsonString = line.substring("data:".length).trim();
              if (jsonString) {
                console.log(
                  "[apiClient] processStream: Parsing JSON string from line:",
                  jsonString
                );
                try {
                  const json = JSON.parse(jsonString);
                  console.log("[apiClient] processStream: Parsed JSON:", json);
                  if (json.text) {
                    console.log(
                      "[apiClient] processStream: Calling onChunkReceived with text:",
                      json.text
                    );
                    onChunkReceived(json.text);
                  } else if (json.event === "EOS") {
                    console.log(
                      "[apiClient] processStream: EOS event received. Stream should close soon."
                    );
                    // EOS received. Loop will continue until done=true, then onEnd will be called.
                  } else if (json.error) {
                    const streamErrorMessage = json.details || json.error;
                    console.error(
                      "[apiClient] processStream: Error event from stream:",
                      streamErrorMessage
                    );
                    onError(streamErrorMessage);
                    if (!reader.closed)
                      reader
                        .cancel("Error received from server")
                        .catch((e) =>
                          console.warn(
                            "[apiClient] Error cancelling reader (server error event):",
                            e
                          )
                        );
                    return;
                  }
                } catch (e: any) {
                  console.error(
                    "[apiClient] processStream: Error parsing JSON from stream:",
                    e.message,
                    "Line:",
                    line
                  );
                  onError("Error parsing data from stream: " + e.message);
                  if (!reader.closed)
                    reader
                      .cancel("JSON parsing error")
                      .catch((err) =>
                        console.warn(
                          "[apiClient] Error cancelling reader (JSON parse error):",
                          err
                        )
                      );
                  return;
                }
              } else {
                console.warn(
                  "[apiClient] processStream: Received data: prefix with empty content. Line:",
                  line
                );
              }
            } else if (line.trim()) {
              console.warn(
                "[apiClient] processStream: Received non-empty line without data: prefix:",
                line
              );
            }
          }
        }
      } catch (loopError: any) {
        console.error(
          "[apiClient] processStream: Error in streaming loop:",
          loopError.message,
          "Signal aborted:",
          signal?.aborted
        );
        if (
          signal?.aborted &&
          (loopError.name === "AbortError" ||
            loopError.message.includes("aborted"))
        ) {
          // This can happen if abort occurs during an await reader.read()
          console.log(
            "[apiClient] processStream: Stream reading aborted as expected."
          );
          // onError might have already been called by the signal check at loop start.
          // Ensure it's called if not.
          if (!reader.closed) {
            // Check if it wasn't already handled
            onError("Request aborted during data reading.");
          }
        } else {
          onError(
            "Critical error during AI response reading: " + loopError.message
          );
        }
        if (!reader.closed)
          reader
            .cancel("Streaming loop error")
            .catch((e) =>
              console.warn(
                "[apiClient] Error cancelling reader (loop error):",
                e
              )
            );
      } finally {
        console.log(
          "[apiClient] processStream: Exiting. Reader closed status:",
          reader.closed
        );
        // Ensure reader is always attempted to be closed if not already,
        // unless an abort signal was the cause and handled it.
        // onEnd() or onError() should have been called to signal completion/failure.
      }
    }

    processStream().catch((streamError: any) => {
      // This catch is for errors thrown synchronously by processStream itself OR unhandled rejections from its async operations
      // (though the inner try/catch in processStream should handle most).
      console.error(
        "[apiClient] processStream Outer Catch: Unhandled error during stream processing:",
        streamError.message,
        "Signal aborted:",
        signal?.aborted
      );
      if (
        signal?.aborted &&
        (streamError.name === "AbortError" ||
          streamError.message.includes("aborted"))
      ) {
        console.log(
          "[apiClient] processStream Outer Catch: Stream processing aborted as expected."
        );
        // onError should have been called by now.
      } else {
        onError(
          "A critical unhandled error occurred while reading the AI response: " +
            streamError.message
        );
      }
      if (!reader.closed) {
        reader
          .cancel("Outer stream processing error")
          .catch((cancelError) =>
            console.warn(
              "[apiClient] Error during reader cancellation (outer catch):",
              cancelError
            )
          );
      }
    });
  } catch (error: any) {
    console.error(
      "[apiClient] askLiveMeetingTranscriptAI: Top-level fetch/setup error:",
      error.message,
      "Signal aborted:",
      signal?.aborted
    );
    if (
      signal?.aborted &&
      (error.name === "AbortError" || error.message.includes("aborted"))
    ) {
      // Fetch itself was aborted.
      // onError might not have been called if processStream didn't start.
      // Ensure onError is called.
      console.log("[apiClient] Fetch request was aborted by signal.");
      onError("Request aborted.");
    } else {
      onError(
        "Failed to initiate connection to the server for live AI chat: " +
          error.message
      );
    }
  }
}
