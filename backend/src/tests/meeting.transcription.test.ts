import request from "supertest";
import mongoose from "mongoose";
import app from "../index"; // Your Express app
import Meeting from "../models/meeting.model";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { exec, ChildProcess } from "child_process";
import OpenAI from "openai"; // Import the OpenAI class
import { Readable, Writable } from "stream"; // Import stream types

// --- Mocks ---
jest.mock("../models/meeting.model");
jest.mock("@aws-sdk/client-s3");
jest.mock("fs");
jest.mock("child_process");
jest.mock("openai"); // Mock the entire openai module

const mockMeetingFindById = Meeting.findById as jest.Mock;
const mockMeetingSave = jest.fn();

const mockS3Send = jest.fn();
(S3Client as jest.Mock).mockImplementation(() => ({
  send: mockS3Send,
}));

const mockFsCreateReadStream = fs.createReadStream as jest.Mock;
const mockFsCreateWriteStream = fs.createWriteStream as jest.Mock;
const mockFsUnlinkSync = fs.unlinkSync as jest.Mock;
const mockFsExistsSync = fs.existsSync as jest.Mock;
const mockFsStatSync = fs.statSync as jest.Mock;

const mockExec = exec as jest.Mock;

// Mock OpenAI constructor and its methods
const mockOpenAIAudioTranscriptionsCreate = jest.fn();
(OpenAI as jest.Mock).mockImplementation(() => {
  return {
    audio: {
      transcriptions: {
        create: mockOpenAIAudioTranscriptionsCreate,
      },
    },
  };
});

// --- Helper to simulate a file stream for fs.createReadStream ---
interface MockStream extends Readable, Writable {
  pipe: jest.Mock<this, [any]>;
  on: jest.Mock<this, [string, (arg?: any) => void]>;
  // Add other methods if needed, ensuring they conform to stream interfaces
  _read?: (size: number) => void;
  _write?: (
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) => void;
  // Add dummy implementations for Writable stream if needed for pipe() target
  end: jest.Mock<this, []>;
}

const mockStream: MockStream = {
  pipe: jest.fn().mockReturnThis(),
  on: jest.fn(function (
    this: MockStream,
    event: string,
    callback: (arg?: any) => void
  ) {
    if (event === "finish" || event === "end") {
      setImmediate(() => callback());
    }
    // For 'error' events, the test should trigger them explicitly if needed.
    return this;
  }) as jest.Mock<MockStream, [string, (arg?: any) => void]>, // Explicit cast for the mock function itself
  readable: true,
  writable: true,
  // Dummy implementations for Readable/Writable methods if not fully mocked by jest.fn()
  read: jest.fn(),
  write: jest.fn((chunk, encoding, callback) => {
    if (callback) callback();
    return true;
  }), // Ensure callback is called for write
  end: jest.fn(function (this: MockStream) {
    this.emit("finish"); // Ensure finish event is emitted on end
    return this;
  }) as jest.Mock<MockStream, []>,
  // Emitter methods need to be present for 'on' to work as expected
  emit: jest.fn(),
  // ... other necessary stream properties/methods ...
} as MockStream;

describe("POST /api/meetings/:meetingId/chunk", () => {
  let testMeetingId: string;
  let userAuthToken: string; // We'll need a valid JWT for an authenticated user

  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mocks

    testMeetingId = new mongoose.Types.ObjectId().toString();

    // Create a dummy JWT for testing authenticated routes
    // In a real app, you might have a test user and generate this dynamically
    // or use a known test JWT if your JWT_SECRET is static for tests.
    const JWT_SECRET = process.env.JWT_SECRET || "testonlysecretfordjws";
    userAuthToken = require("jsonwebtoken").sign(
      { userId: "testUserId123", email: "test@example.com" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Default successful mock implementations
    mockMeetingFindById.mockImplementation((id) => {
      if (id.toString() === testMeetingId) {
        return Promise.resolve({
          _id: testMeetingId,
          userId: "testUserId123",
          status: "active",
          transcriptChunks: [],
          save: mockMeetingSave.mockResolvedValue(this),
        });
      }
      return Promise.resolve(null);
    });

    mockS3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        // Simulate a streamable body for S3 GetObjectCommand
        const stream = require("stream");
        const readableStream = new stream.Readable();
        readableStream._read = () => {}; // _read is required
        readableStream.push("audio data"); // Simulate some data
        readableStream.push(null); // Signal end of stream
        return Promise.resolve({ Body: readableStream });
      }
      return Promise.resolve({});
    });

    mockFsCreateWriteStream.mockReturnValue(mockStream as any); // mockStream simulates a WritableStream
    mockFsCreateReadStream.mockReturnValue(mockStream as any); // mockStream simulates a ReadableStream
    mockFsExistsSync.mockReturnValue(true); // Assume files exist by default
    mockFsStatSync.mockReturnValue({ size: 100 }); // Assume files have size

    mockExec.mockImplementation(
      (
        command: string,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        // Simulate successful ffmpeg execution
        callback(null, "ffmpeg success", "");
        // Return a mock ChildProcess object with an 'on' method
        const mockChildProcess = {
          on: jest.fn().mockReturnThis(),
          stdout: { on: jest.fn() }, // Mock stdout and stderr if they are used
          stderr: { on: jest.fn() },
          // Add other ChildProcess properties/methods if your code uses them
        } as unknown as ChildProcess; // Cast to ChildProcess
        return mockChildProcess;
      }
    );

    mockOpenAIAudioTranscriptionsCreate.mockResolvedValue({
      text: "Transcribed audio chunk text.",
    });
    mockMeetingSave.mockResolvedValue({ success: true }); // Default save mock
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  it("should successfully transcribe and save an audio chunk", async () => {
    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`)
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm"); // Attach a dummy file

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty(
      "transcription",
      "Transcribed audio chunk text."
    );

    expect(mockS3Send).toHaveBeenCalledTimes(1); // S3 GetObjectCommand
    expect(mockFsCreateWriteStream).toHaveBeenCalled();
    expect(mockExec).toHaveBeenCalled();
    expect(mockOpenAIAudioTranscriptionsCreate).toHaveBeenCalled();
    expect(mockMeetingSave).toHaveBeenCalled();
    expect(mockFsUnlinkSync).toHaveBeenCalledTimes(2); // original temp and converted wav
  });

  it("should return 400 if no audio file is uploaded", async () => {
    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`);
    // No file attached

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty("error", "No audio chunk uploaded.");
  });

  it("should return 401 if no auth token is provided", async () => {
    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm");

    expect(res.statusCode).toEqual(401); // Or 403 depending on your middleware
    expect(res.body).toHaveProperty("error");
  });

  it("should return 404 if meeting not found", async () => {
    const nonExistentMeetingId = new mongoose.Types.ObjectId().toString();
    mockMeetingFindById.mockResolvedValue(null); // Override default mock for this test

    const res = await request(app)
      .post(`/api/meetings/${nonExistentMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`)
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm");

    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty("error", "Meeting not found.");
  });

  it("should return 403 if user not authorized for the meeting", async () => {
    mockMeetingFindById.mockResolvedValueOnce({
      // Override default mock
      _id: testMeetingId,
      userId: "anotherUserId", // Different user
      status: "active",
      save: mockMeetingSave,
    });

    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`) // userAuthToken is for 'testUserId123'
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm");

    expect(res.statusCode).toEqual(403);
    expect(res.body).toHaveProperty(
      "error",
      "User not authorized for this meeting."
    );
  });

  it("should return 400 if meeting is not active", async () => {
    mockMeetingFindById.mockResolvedValueOnce({
      // Override default mock
      _id: testMeetingId,
      userId: "testUserId123",
      status: "completed", // Not active
      save: mockMeetingSave,
    });

    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`)
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm");

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty(
      "error",
      "Meeting is not active (status: completed). Cannot add chunk."
    );
  });

  it("should return 500 if S3 download fails", async () => {
    mockS3Send.mockImplementationOnce(async (command) => {
      // Override S3 mock for this test
      if (command instanceof GetObjectCommand) {
        return Promise.resolve({ Body: null }); // Simulate S3 returning no body
      }
      return Promise.resolve({});
    });

    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`)
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm");

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty("error", "Failed to process audio chunk.");
    expect(res.body).toHaveProperty(
      "details",
      "Failed to retrieve chunk from S3"
    );
  });

  it("should return 500 if ffmpeg conversion fails", async () => {
    mockExec.mockImplementationOnce(
      (
        command: string,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        // Override ffmpeg mock
        callback(new Error("ffmpeg boom"), "", "ffmpeg error details");
        // Return a mock ChildProcess object with an 'on' method
        const mockChildProcess = {
          on: jest.fn().mockReturnThis(),
          stdout: { on: jest.fn() }, // Mock stdout and stderr if they are used
          stderr: { on: jest.fn() },
          // Add other ChildProcess properties/methods if your code uses them
        } as unknown as ChildProcess; // Cast to ChildProcess
        return mockChildProcess;
      }
    );

    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`)
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm");

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty("error", "Failed to process audio chunk.");
    expect(res.body.details).toMatch(
      /ffmpeg conversion failed: ffmpeg boom STDErr: ffmpeg error details/
    );
  });

  it("should return 500 if OpenAI transcription fails", async () => {
    mockOpenAIAudioTranscriptionsCreate.mockRejectedValueOnce(
      new Error("OpenAI API error")
    );

    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`)
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm");

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty("error", "Failed to process audio chunk.");
    expect(res.body).toHaveProperty("details", "OpenAI API error");
  });

  it("should not save chunk if transcription is empty", async () => {
    mockOpenAIAudioTranscriptionsCreate.mockResolvedValue({ text: "   " }); // Empty or whitespace text

    const res = await request(app)
      .post(`/api/meetings/${testMeetingId}/chunk`)
      .set("Authorization", `Bearer ${userAuthToken}`)
      .attach("audio", Buffer.from("fake audio data"), "chunk.webm");

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("transcription", "   ");
    expect(mockMeetingSave).not.toHaveBeenCalled(); // Should not save if transcription is empty
  });
});
