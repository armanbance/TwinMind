import request from "supertest";
import mongoose from "mongoose";
import User from "../models/user.model"; // Path to your User model
import app from "../index"; // Import the actual app instance

// --- Mocking Mongoose User Model ---
// jest.mock('../models/user.model'); // This will auto-mock the User model
// If User.findOne or .save are static/prototype methods, jest.mock should handle them.
// Or, more explicitly:
const mockUserSave = jest.fn();
const mockUserFindOne = jest.fn();

jest.mock("../models/user.model", () => {
  // Mock the default export (the model itself)
  return jest.fn().mockImplementation(() => {
    // This is the constructor mock for `new User()`
    return { save: mockUserSave }; // Instance methods
  });
});

// Assign static methods to the mocked constructor
(User as jest.MockedClass<typeof User>).findOne = mockUserFindOne as any;

describe("POST /api/auth/users/upsert-google-user", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockUserFindOne.mockReset();
    mockUserSave.mockReset();
    // Simulate JWT_SECRET in environment for this test scope
    process.env.JWT_SECRET = "testonlysecretfordjws";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("should create a new user and return 201 if user does not exist", async () => {
    mockUserFindOne.mockResolvedValue(null); // Simulate user not found

    // When new User() is called in the actual route, its .save() method (which is mockUserSave)
    // needs to be configured to resolve.
    const mockNewUserInstance = {
      _id: new mongoose.Types.ObjectId(),
      googleId: "newGoogleId123",
      email: "newuser@example.com",
      createdAt: new Date(),
    };
    mockUserSave.mockResolvedValueOnce(mockNewUserInstance); // Mock the save operation for the new user

    const res = await request(app) // Use the imported app
      .post("/api/auth/users/upsert-google-user")
      .send({ googleId: "newGoogleId123", email: "newuser@example.com" });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty("message", "User created successfully");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("googleId", "newGoogleId123");
    expect(res.body.user).toHaveProperty(
      "mongoId",
      mockNewUserInstance._id.toString()
    );
    expect(res.body).toHaveProperty("token");
    // Check if the constructor of User was called, and then save was called on its instance
    expect(User).toHaveBeenCalledWith({
      googleId: "newGoogleId123",
      email: "newuser@example.com",
    });
    expect(mockUserSave).toHaveBeenCalledTimes(1);
  });

  it("should return existing user and 200 if user already exists", async () => {
    const existingUserId = new mongoose.Types.ObjectId();
    const existingUser = {
      _id: existingUserId,
      googleId: "existingGoogleId456",
      email: "existing@example.com",
      createdAt: new Date(),
    };
    mockUserFindOne.mockResolvedValue(existingUser); // Simulate user found

    const res = await request(app) // Use the imported app
      .post("/api/auth/users/upsert-google-user")
      .send({ googleId: "existingGoogleId456", email: "existing@example.com" });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("message", "User logged in successfully");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("mongoId", existingUserId.toString());
    expect(res.body.user).toHaveProperty("googleId", "existingGoogleId456");
    expect(res.body).toHaveProperty("token");
    expect(mockUserSave).not.toHaveBeenCalled();
  });

  it("should return 400 if googleId is missing", async () => {
    const res = await request(app) // Use the imported app
      .post("/api/auth/users/upsert-google-user")
      .send({ email: "test@example.com" });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty(
      "error",
      "Missing required fields: googleId, email."
    );
  });

  it("should return 400 if email is missing", async () => {
    const res = await request(app) // Use the imported app
      .post("/api/auth/users/upsert-google-user")
      .send({ googleId: "googleId123" });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty(
      "error",
      "Missing required fields: googleId, email."
    );
  });

  // Consider adding a test for the 500 error if User.findOne or .save rejects
  it("should return 500 if database operation fails for new user", async () => {
    mockUserFindOne.mockResolvedValue(null); // New user path
    mockUserSave.mockRejectedValueOnce(new Error("Database save error"));

    const res = await request(app)
      .post("/api/auth/users/upsert-google-user")
      .send({ googleId: "errorUser123", email: "error@example.com" });

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty(
      "error",
      "Server error during user upsert."
    );
    // expect(res.body).toHaveProperty("details", "Database save error"); // Check if details are passed
  });

  it("should return 500 if User.findOne operation fails", async () => {
    mockUserFindOne.mockRejectedValueOnce(new Error("Database findOne error"));

    const res = await request(app)
      .post("/api/auth/users/upsert-google-user")
      .send({ googleId: "errorUser123", email: "error@example.com" });

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty(
      "error",
      "Server error during user upsert."
    );
  });
});

afterAll(async () => {
  // Close the Mongoose connection after all tests in this file are done
  // to prevent Jest from hanging or showing open handle warnings.
  // This is important even if you are mocking, as some underlying Mongoose setup might persist.
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});
