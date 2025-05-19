# TwinMind

TwinMind is a web application that helps users capture, store, and interact with their audio memories using modern AI and cloud technologies. Users can record audio directly in the browser, which is then transcribed using OpenAI Whisper and securely stored. Transcriptions are saved in MongoDB. Users can chat with their meeting transcripts, with AI providing context-aware answers based on the content of those specific transcripts. The app also includes Google Calendar integration and a browser for reviewing meeting details and summaries.

## Load Testing Plan (For Development & Staging Environments Only)

This section outlines a basic plan for load testing the TwinMind backend. **These tests should not be run against a production environment.**

### 1. Objectives

- Determine the maximum concurrent users the system can handle for core transcription and AI chat functionalities.
- Identify performance bottlenecks under load.
- Measure response times and error rates for critical API endpoints.
- Ensure stability and reliability during peak usage.

### 2. Key Endpoints to Test

- **POST /api/meetings/start**: Meeting creation.
- **POST /api/meetings/:meetingId/chunk**: Audio chunk processing and transcription.
- **POST /api/meetings/:meetingId/end**: Meeting finalization and summary generation.
- **POST /api/meetings/:meetingId/ask-ai**: Chat with completed meeting transcript.
- **POST /api/meetings/:meetingId/ask-live-transcript**: Live AI chat during an active meeting.
- **GET /api/meetings**: Fetching all meetings.
- **GET /api/meetings/:meetingId**: Fetching a specific meeting.

### 3. Metrics to Collect

- **Response Time (p95, p99, average):** For each key endpoint.
- **Throughput (requests per second/minute):** For each key endpoint and overall system.
- **Error Rate (%):** For each key endpoint.
- **CPU and Memory Utilization:** On the backend server.
- **Database Performance:** Query latency, connection pool usage.
- **Whisper API & OpenAI API Latency/Error Rates:** If possible, monitor external service performance.

### 4. Tools

- **k6 (recommended):** A modern load testing tool for developers and testers. Allows scripting tests in JavaScript.
- Other options: Apache JMeter, Locust.

### 5. Scenarios

- **Scenario 1: Single User Full Workflow (Baseline)**
  - Simulate a single user starting a meeting, sending multiple audio chunks over a period (e.g., 10 minutes), ending the meeting, and then asking a few questions to the transcript.
- **Scenario 2: Concurrent Chunk Processing**
  - Simulate multiple users (e.g., 10, 50, 100) concurrently in meetings and sending audio chunks every 30 seconds.
  - Focus on the `/api/meetings/:meetingId/chunk` endpoint.
- **Scenario 3: Concurrent Live AI Chat**
  - Simulate multiple users concurrently using the live AI chat feature during active meetings.
  - Focus on the `/api/meetings/:meetingId/ask-live-transcript` endpoint.
- **Scenario 4: Concurrent Completed Meeting AI Chat**
  - Simulate multiple users concurrently using the AI chat feature on completed meetings.
  - Focus on the `/api/meetings/:meetingId/ask-ai` endpoint.
- **Scenario 5: General API Usage**
  - Simulate a mix of users performing various actions: starting meetings, ending meetings, fetching meeting lists, fetching individual meeting details.

### 6. Test Execution & Analysis

- Start with a small number of virtual users (VUs) and gradually increase the load.
- Run tests for a sustained period (e.g., 15-30 minutes per load level).
- Monitor metrics in real-time and collect detailed reports.
- Analyze results to identify bottlenecks (e.g., slow database queries, CPU-intensive operations in `ffmpeg` or AI calls, network latency).
- Iterate on optimizations and re-test.
