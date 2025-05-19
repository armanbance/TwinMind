import request from "supertest";
import mongoose from "mongoose";
import app from "../index"; // Your Express app
import Meeting from "../models/meeting.model";
import OpenAI from "openai"; // Import the OpenAI class

// --- Mocks ---
jest.mock("../models/meeting.model");

// Mock OpenAI module
const mockOpenAIChatCompletionsCreate = jest.fn();
jest.mock("openai", () => {
  // Mock the default export which is the OpenAI class
  return jest.fn().mockImplementation(() => {
    return {
      chat: {
        completions: {
          create: mockOpenAIChatCompletionsCreate,
        },
      },
    };
  });
});

const mockMeetingFindById = Meeting.findById as jest.Mock;
const mockMeetingSave = jest.fn();

describe("POST /api/meetings/:meetingId/end", () => {
  let testMeetingId: string;
  let userAuthToken: string;

  beforeEach(() => {
    jest.clearAllMocks();

    testMeetingId = new mongoose.Types.ObjectId().toString();
    const JWT_SECRET = process.env.JWT_SECRET || "testonlysecretfordjws";
    userAuthToken = require("jsonwebtoken").sign(
      { userId: "testUserId123", email: "test@example.com" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Default mock for Meeting.findById
    mockMeetingFindById.mockImplementation((id) => {
      if (id.toString() === testMeetingId) {
        return Promise.resolve({
          _id: testMeetingId,
          userId: "testUserId123",
          status: "active", // Default to active, can be overridden in tests
          fullTranscriptText: "This is a sample transcript for summary.",
          transcriptChunks: [
            {
              order: 0,
              text: "This is a sample transcript for summary.",
              timestamp: new Date(),
            },
          ],
          save: mockMeetingSave.mockResolvedValue(this), // 'this' refers to the resolved object
        });
      }
      return Promise.resolve(null);
    });

    // Default mock for successful meeting save
    mockMeetingSave.mockResolvedValue({ success: true });

    // Default mock for OpenAI summary generation
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: "Summary:\n\nThis is the generated summary.",
          },
        },
      ],
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  it("should successfully end a meeting and generate a summary", async () => {
    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/end`)
      .set("Authorization", `Bearer ${userAuthToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("message", "Meeting ended successfully.");
    expect(mockMeetingFindById).toHaveBeenCalledWith(testMeetingId);
    expect(mockMeetingSave).toHaveBeenCalledTimes(2); // Once to set endTime, once for summary
    expect(mockOpenAIChatCompletionsCreate).toHaveBeenCalledTimes(1);

    // Check if the meeting status was updated and summary saved (via mockMeetingSave arguments)
    // First call to save (status, endTime)
    const firstSaveCallArg = mockMeetingSave.mock.contexts[0]; // `this` context of the first call
    expect(firstSaveCallArg.status).toBe("completed");
    expect(firstSaveCallArg.endTime).toBeInstanceOf(Date);

    // Second call to save (summary)
    const secondSaveCallArg = mockMeetingSave.mock.contexts[1];
    expect(secondSaveCallArg.summary).toBe(
      "Summary:\n\nThis is the generated summary."
    );
  });

  it("should handle meetings with empty transcripts (skip summary)", async () => {
    mockMeetingFindById.mockResolvedValueOnce({
      // Override for this test
      _id: testMeetingId,
      userId: "testUserId123",
      status: "active",
      fullTranscriptText: "   ", // Empty or whitespace transcript
      transcriptChunks: [],
      save: mockMeetingSave.mockResolvedValue(this),
    });

    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/end`)
      .set("Authorization", `Bearer ${userAuthToken}`);

    expect(res.statusCode).toEqual(200);
    expect(mockMeetingSave).toHaveBeenCalledTimes(1); // Only called once to set endTime
    expect(mockOpenAIChatCompletionsCreate).not.toHaveBeenCalled(); // Summary generation skipped
    const firstSaveCallArg = mockMeetingSave.mock.contexts[0];
    expect(firstSaveCallArg.summary).toBeUndefined(); // No summary should be set
  });

  it('should correctly prepend "Summary:\n\n" if AI does not include it', async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValueOnce({
      choices: [
        { message: { content: "Just the raw summary text without prefix." } },
      ],
    });

    await request(app)
      .post(`/api/meetings/${testMeetingId}/end`)
      .set("Authorization", `Bearer ${userAuthToken}`);

    expect(mockMeetingSave).toHaveBeenCalledTimes(2);
    const secondSaveCallArg = mockMeetingSave.mock.contexts[1];
    expect(secondSaveCallArg.summary).toBe(
      "Summary:\n\nJust the raw summary text without prefix."
    );
  });

  it("should handle OpenAI summary generation failure gracefully", async () => {
    mockOpenAIChatCompletionsCreate.mockRejectedValueOnce(
      new Error("OpenAI summary failed")
    );

    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/end`)
      .set("Authorization", `Bearer ${userAuthToken}`);

    expect(res.statusCode).toEqual(200); // Still ends successfully
    expect(mockMeetingSave).toHaveBeenCalledTimes(1); // Only called once to set endTime
    const firstSaveCallArg = mockMeetingSave.mock.contexts[0];
    expect(firstSaveCallArg.summary).toBeUndefined(); // Summary should not be saved
  });

  it("should return 401 if no auth token", async () => {
    const res = await request(app).post(`/api/meetings/${testMeetingId}/end`);
    expect(res.statusCode).toEqual(401);
  });

  it("should return 404 if meeting not found", async () => {
    mockMeetingFindById.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/meetings/${new mongoose.Types.ObjectId().toString()}/end`)
      .set("Authorization", `Bearer ${userAuthToken}`);
    expect(res.statusCode).toEqual(404);
  });

  it("should return 403 if user not authorized", async () => {
    mockMeetingFindById.mockResolvedValueOnce({
      _id: testMeetingId,
      userId: "anotherUserId", // Different user
      status: "active",
      save: mockMeetingSave,
    });
    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/end`)
      .set("Authorization", `Bearer ${userAuthToken}`);
    expect(res.statusCode).toEqual(403);
  });

  it("should return 400 if meeting already completed", async () => {
    mockMeetingFindById.mockResolvedValueOnce({
      _id: testMeetingId,
      userId: "testUserId123",
      status: "completed", // Already completed
      save: mockMeetingSave,
    });
    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/end`)
      .set("Authorization", `Bearer ${userAuthToken}`);
    expect(res.statusCode).toEqual(400);
  });
});
