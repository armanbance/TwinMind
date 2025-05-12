import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken"; // Import jsonwebtoken
import User from "./models/user.model"; // Import the User model
import Memory from "./models/memory.model"; // Import the Memory model
import { google } from "googleapis"; // Import googleapis

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
  process.exit(1);
}

app.use(express.json()); // Add this to parse JSON request bodies

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Error: MONGODB_URI is not defined in your .env file.");
  process.exit(1); // Stop the application if DB connection string is missing
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Successfully connected to MongoDB!");
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1); // Stop the application if DB connection fails
  });
// --- End MongoDB Connection ---

// CORS configuration
const corsOptions = {
  origin: "http://localhost:3000", // Allow requests from your frontend
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions)); // Use cors middleware

// Define an interface for our JWT payload to be attached to the request
export interface AuthenticatedRequest extends express.Request {
  userAuth?: {
    // Or req.user, req.auth, etc.
    userId: string;
    email: string;
  };
}

// --- JWT Authentication Middleware ---
const authenticateToken = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
): void => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (token == null) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err: any, decodedPayload: any) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      res.status(403).json({ error: "Token is not valid or expired" });
      return;
    }
    req.userAuth = decodedPayload as { userId: string; email: string };
    next();
  });
};
// --- End JWT Authentication Middleware ---

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure Multer for file uploads
// Store files in a temporary 'uploads' directory
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Keep original extension if available, otherwise default to .webm
    const extension = path.extname(file.originalname) || ".webm";
    cb(null, file.fieldname + "-" + Date.now() + extension);
  },
});
const upload = multer({ storage: storage });

app.get("/", (req: Request, res: Response) => {
  res.send("Hello from Express + TypeScript Server");
});

// Endpoint to handle audio transcription
app.post(
  "/api/transcribe",
  authenticateToken,
  upload.single("audio"),
  async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    const userIdFromToken = req.userAuth?.userId;

    if (!req.file) {
      res.status(400).json({ error: "No audio file uploaded." });
      return;
    }

    if (!userIdFromToken) {
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found in token." });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(userIdFromToken)) {
      res
        .status(500)
        .json({ error: "Server error: Invalid user ID format in token." });
      return;
    }

    const audioFilePath = req.file.path;

    try {
      // 1. Transcribe the audio
      const transcriptionResponse = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: fs.createReadStream(audioFilePath),
      });

      const transcribedText = transcriptionResponse.text;

      // 2. Save the transcription as a Memory associated with the authenticated user
      const newMemory = new Memory({
        userId: userIdFromToken,
        text: transcribedText,
      });
      await newMemory.save();

      res.status(201).json({
        message: "Transcription successful and memory saved.",
        transcription: transcribedText,
        memory: newMemory,
      });
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      // It's good practice to avoid sending detailed internal errors to the client
      // For example, check if error.response exists and has data for OpenAI API errors
      let errorMessage = "Failed to transcribe audio.";
      if (
        error.response &&
        error.response.data &&
        error.response.data.error &&
        error.response.data.error.message
      ) {
        errorMessage = error.response.data.error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      res.status(500).json({ error: errorMessage });
    } finally {
      // Clean up the uploaded file
      fs.unlink(audioFilePath, (err) => {
        if (err) {
          console.error("Error deleting uploaded file:", err);
        }
      });
    }
  }
);

// Endpoint to upsert user from Google Sign-In
app.post(
  "/api/auth/users/upsert-google-user",
  async (req: express.Request, res: express.Response): Promise<void> => {
    const { googleId, email } = req.body;

    if (!googleId || !email) {
      res.status(400).json({
        error: "Missing required fields: googleId, email.",
      });
      return;
    }

    try {
      let user = await User.findOne({ googleId });
      let isNewUser = false;

      if (!user) {
        const newUserDoc = new User({
          googleId,
          email,
        });
        user = await newUserDoc.save();
        isNewUser = true;
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user._id, email: user.email }, // Payload
        JWT_SECRET,
        { expiresIn: "1d" } // Token expiration (e.g., 1 day)
      );

      res.status(isNewUser ? 201 : 200).json({
        message: isNewUser
          ? "User created successfully"
          : "User logged in successfully",
        user: {
          // Send back a DTO, not the raw Mongoose doc with __v etc.
          mongoId: user._id,
          googleId: user.googleId,
          email: user.email,
          createdAt: user.createdAt,
        },
        token,
      });
    } catch (error: any) {
      console.error("Error upserting user:", error);
      if (error.code === 11000) {
        res.status(409).json({
          error:
            "User with this email or Google ID might already exist with different details.",
          details: error.keyValue,
        });
        return;
      }
      res.status(500).json({
        error: "Server error during user upsert.",
        details: error.message,
      });
    }
  }
);

// Endpoint to fetch Google Calendar events for the next 7 days
app.get(
  "/api/calendar/events",
  authenticateToken, // Protect with your app's JWT auth
  async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    const googleAccessToken = req.headers["x-google-access-token"] as string;

    if (!googleAccessToken) {
      res.status(400).json({ error: "Missing X-Google-Access-Token header." });
      return;
    }

    console.log(
      `[Backend /api/calendar/events] Received request for user: ${req.userAuth?.userId}`
    );
    console.log(
      `[Backend /api/calendar/events] Using Google Access Token (first 10 chars): ${googleAccessToken.substring(
        0,
        10
      )}...`
    );

    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: googleAccessToken });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const now = new Date();
      const sevenDaysFromNow = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000
      );

      const calendarResponse = await calendar.events.list({
        calendarId: "primary", // Use 'primary' for the user's main calendar
        timeMin: now.toISOString(),
        timeMax: sevenDaysFromNow.toISOString(),
        maxResults: 50, // Max number of events to return
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = calendarResponse.data.items;
      res.status(200).json(events || []);
    } catch (error: any) {
      console.error(
        "[Backend /api/calendar/events] Error fetching calendar events:",
        error.response?.data || error.message || error
      );
      // Check for specific Google API errors, e.g., invalid token
      if (
        error.code === 401 ||
        (error.response && error.response.status === 401)
      ) {
        res.status(401).json({
          error: "Invalid or expired Google Access Token.",
          details: error.response?.data?.error,
        });
      } else {
        res.status(500).json({
          error: "Failed to fetch calendar events.",
          details: error.message,
        });
      }
    }
  }
);

// Endpoint to fetch all memories for the authenticated user
app.get(
  "/api/memories",
  authenticateToken,
  async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    const userIdFromToken = req.userAuth?.userId;

    if (!userIdFromToken) {
      // This case should ideally be caught by authenticateToken, but good for defense
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found in token." });
      return;
    }

    try {
      const memories = await Memory.find({ userId: userIdFromToken }).sort({
        createdAt: -1,
      }); // Sort by newest first
      res.status(200).json(memories);
    } catch (error: any) {
      console.error(
        `[Backend /api/memories] Error fetching memories for user ${userIdFromToken}:`,
        error
      );
      res.status(500).json({
        error: "Failed to fetch memories.",
        details: error.message,
      });
    }
  }
);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
