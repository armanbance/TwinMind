import request from "supertest";
import mongoose from "mongoose";
import app from "../index"; // Your Express app
import { google } from "googleapis";

// --- Mocks ---
jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn().mockImplementation(() => ({
      events: {
        list: jest.fn(),
      },
    })),
  },
}));

const mockGoogleCalendarEventsList = google.calendar("v3").events
  .list as jest.Mock;

describe("GET /api/calendar/events", () => {
  let userAuthToken: string;
  const testGoogleAccessToken = "test-google-access-token";

  beforeEach(() => {
    jest.clearAllMocks();

    const JWT_SECRET = process.env.JWT_SECRET || "testonlysecretfordjws";
    userAuthToken = require("jsonwebtoken").sign(
      { userId: "testUserId123", email: "test@example.com" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Default mock for successful calendar events list
    mockGoogleCalendarEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: "event1",
            summary: "Test Event 1",
            start: { dateTime: new Date().toISOString() },
          },
          {
            id: "event2",
            summary: "Test Event 2",
            start: { dateTime: new Date().toISOString() },
          },
        ],
      },
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      // Though not directly used, good practice if other tests use it
      await mongoose.connection.close();
    }
  });

  it("should fetch calendar events successfully with valid tokens", async () => {
    const res = await request(app)
      .get("/api/calendar/events")
      .set("Authorization", `Bearer ${userAuthToken}`)
      .set("X-Google-Access-Token", testGoogleAccessToken);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toHaveProperty("summary", "Test Event 1");
    expect(google.auth.OAuth2).toHaveBeenCalled();
    // @ts-ignore // Accessing mock internals for verification
    const oauth2ClientInstance = google.auth.OAuth2.mock.results[0].value;
    expect(oauth2ClientInstance.setCredentials).toHaveBeenCalledWith({
      access_token: testGoogleAccessToken,
    });
    expect(mockGoogleCalendarEventsList).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        maxResults: 50,
        singleEvents: true,
        orderBy: "startTime",
      })
    );
  });

  it("should return 401 if no app auth token is provided", async () => {
    const res = await request(app)
      .get("/api/calendar/events")
      .set("X-Google-Access-Token", testGoogleAccessToken);
    expect(res.statusCode).toEqual(401); // From authenticateToken middleware
  });

  it("should return 400 if no Google access token is provided", async () => {
    const res = await request(app)
      .get("/api/calendar/events")
      .set("Authorization", `Bearer ${userAuthToken}`);
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty(
      "error",
      "Missing X-Google-Access-Token header."
    );
  });

  it("should handle Google API returning no events", async () => {
    mockGoogleCalendarEventsList.mockResolvedValueOnce({ data: { items: [] } });
    const res = await request(app)
      .get("/api/calendar/events")
      .set("Authorization", `Bearer ${userAuthToken}`)
      .set("X-Google-Access-Token", testGoogleAccessToken);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual([]);
  });

  it("should handle Google API returning undefined events", async () => {
    mockGoogleCalendarEventsList.mockResolvedValueOnce({ data: {} }); // No items field
    const res = await request(app)
      .get("/api/calendar/events")
      .set("Authorization", `Bearer ${userAuthToken}`)
      .set("X-Google-Access-Token", testGoogleAccessToken);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual([]); // Endpoint gracefully handles this by returning []
  });

  it("should return 401 if Google API indicates an invalid/expired token", async () => {
    // Simulate Google API error for invalid token
    const googleApiError = new Error("Invalid Credentials") as any;
    googleApiError.code = 401;
    googleApiError.response = { data: { error: "invalid_grant" } }; // Ensure this structure for the 401 path in route
    mockGoogleCalendarEventsList.mockRejectedValueOnce(googleApiError);

    const res = await request(app)
      .get("/api/calendar/events")
      .set("Authorization", `Bearer ${userAuthToken}`)
      .set("X-Google-Access-Token", "expired-or-invalid-google-token");
    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty(
      "error",
      "Invalid or expired Google Access Token."
    );
  });

  it("should return 500 for other Google API errors", async () => {
    const googleApiError = new Error("Service unavailable") as any;
    googleApiError.code = 503; // Or any code that isn't 401
    // For this case, the route handler might not find error.response.data, relying on error.message
    mockGoogleCalendarEventsList.mockRejectedValueOnce(googleApiError);

    const res = await request(app)
      .get("/api/calendar/events")
      .set("Authorization", `Bearer ${userAuthToken}`)
      .set("X-Google-Access-Token", testGoogleAccessToken);
    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty(
      "error",
      "Failed to fetch calendar events."
    );
  });
});
