import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken"; // Import jsonwebtoken
import User from "./models/user.model"; // Import the User model
import Memory, { IMemory } from "./models/memory.model"; // Import the Memory model and its interface
import { google } from "googleapis"; // Import googleapis
import { exec } from "child_process"; // Added for ffmpeg
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import multerS3 from "multer-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import os from "os";
import Meeting from "./models/meeting.model"; // Import the new Meeting model

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
  origin: process.env.FRONTEND_URL, // Allow requests from your frontend
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

// Configure S3
const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Update multer to use S3 instead of local storage
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || "your-bucket-name",
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      // Get the correct extension from the file's mimetype or original filename
      let extension = "";
      if (file.originalname) {
        let rawExtension = path.extname(file.originalname); // e.g., .webm or .webm;codecs=opus
        extension = rawExtension.split(";")[0]; // Take only the part before any semicolon
      }

      if (!extension && file.mimetype) {
        // Map MIME types to extensions if the file doesn't have one
        const mimeToExt: Record<string, string> = {
          "audio/webm": ".webm",
          "audio/mp4": ".mp4",
          "audio/m4a": ".m4a",
          "audio/mpeg": ".mp3",
          "audio/ogg": ".ogg",
          "audio/wav": ".wav",
          "audio/x-wav": ".wav",
        };
        // Only use mapped extension if found, otherwise keep extension empty to hit the final default
        if (mimeToExt[file.mimetype]) {
          extension = mimeToExt[file.mimetype];
        }
      }

      // Default to .wav if no valid extension was found by other means
      if (!extension || extension === ".bin") {
        // also catch .bin as an invalid extension for whisper
        extension = ".wav";
      }

      console.log(
        `Processing upload with mimetype: ${file.mimetype}, using extension: ${extension}`
      );

      cb(null, `audio-uploads/${Date.now().toString()}${extension}`);
    },
  }),
});

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

    try {
      // Get a presigned URL for the S3 object
      const s3Key = (req.file as Express.MulterS3.File).key;
      if (!s3Key) {
        throw new Error("Failed to get S3 key from uploaded file");
      }

      // Determine the file extension from the S3 key
      const fileExtension = path.extname(s3Key) || ".wav"; // Default to .wav if no extension found

      // Create a temporary file to store the audio with the correct extension
      const tempFilePath = path.join(
        os.tmpdir(),
        `${Date.now()}${fileExtension}`
      );

      // Download the file from S3
      const getObjectParams = {
        Bucket: process.env.S3_BUCKET_NAME || "your-bucket-name",
        Key: s3Key,
      };

      const { Body } = await s3.send(new GetObjectCommand(getObjectParams));

      if (!Body) {
        throw new Error("Failed to retrieve file from S3");
      }

      // Write the file to disk
      const writeStream = fs.createWriteStream(tempFilePath);
      // @ts-ignore - Body has pipe method but TypeScript doesn't recognize it
      Body.pipe(writeStream);

      // Wait for file to be fully written
      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", () => resolve());
        writeStream.on("error", reject);
      });

      // Use the local file for transcription
      const transcriptionResponse = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: fs.createReadStream(tempFilePath),
      });

      // Clean up the temporary file
      fs.unlinkSync(tempFilePath);

      const transcribedText = transcriptionResponse.text;

      // 2. Save the transcription as a Memory associated with the authenticated user
      const memoryDoc = new Memory({
        userId: userIdFromToken,
        text: transcribedText,
      });
      const savedMemory = await memoryDoc.save();

      res.status(201).json({
        message: "Transcription successful and memory saved.",
        transcription: transcribedText,
        memory: savedMemory,
      });
    } catch (error: any) {
      console.error("Error transcribing audio or saving memory:", error);
      let errorMessage = "Failed to process audio transcription.";
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

// Endpoint to fetch all meetings for the authenticated user
app.get(
  "/api/meetings",
  authenticateToken,
  async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    const userIdFromToken = req.userAuth?.userId;

    if (!userIdFromToken) {
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found." });
      return;
    }

    try {
      // Fetch meetings, sort by most recent startTime by default
      const meetings = await Meeting.find({ userId: userIdFromToken })
        .sort({ startTime: -1 })
        .select("-transcriptChunks"); // Exclude bulky transcriptChunks by default
      // Frontend can fetch full transcript for a specific meeting if needed

      res.status(200).json(meetings);
    } catch (error: any) {
      console.error(
        `[User ${userIdFromToken}] Error fetching meetings:`,
        error
      );
      res.status(500).json({
        error: "Failed to fetch meetings.",
        details: error.message,
      });
    }
  }
);

// Endpoint to fetch a single meeting with full details (including transcript)
app.get(
  "/api/meetings/:meetingId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userIdFromToken = req.userAuth?.userId;
    const { meetingId } = req.params;

    if (!userIdFromToken) {
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found." });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      res.status(400).json({ error: "Invalid meeting ID format." });
      return;
    }

    try {
      const meeting = await Meeting.findById(meetingId);

      if (!meeting) {
        res.status(404).json({ error: "Meeting not found." });
        return;
      }
      if (meeting.userId.toString() !== userIdFromToken) {
        res
          .status(403)
          .json({ error: "User not authorized to view this meeting." });
        return;
      }

      // Return the full meeting document, including transcriptChunks and fullTranscriptText
      res.status(200).json(meeting);
    } catch (error: any) {
      console.error(
        `[User ${userIdFromToken}] Error fetching meeting ${meetingId}:`,
        error
      );
      res.status(500).json({
        error: "Failed to fetch meeting details.",
        details: error.message,
      });
    }
  }
);

// NEW ENDPOINT: Ask AI about a specific meeting's transcript
app.post(
  "/api/meetings/:meetingId/ask-ai",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { meetingId } = req.params;
    const { question } = req.body;
    const userIdFromToken = req.userAuth?.userId;

    if (!userIdFromToken) {
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found in token." });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      res.status(400).json({ error: "Invalid meeting ID format." });
      return;
    }

    if (!question || typeof question !== "string" || question.trim() === "") {
      res.status(400).json({ error: "Question is required." });
      return;
    }

    try {
      const meeting = await Meeting.findById(meetingId);

      if (!meeting) {
        res.status(404).json({ error: "Meeting not found." });
        return;
      }

      if (meeting.userId.toString() !== userIdFromToken) {
        res.status(403).json({
          error: "Forbidden: You do not have access to this meeting.",
        });
        return;
      }

      if (meeting.status !== "completed") {
        res
          .status(400)
          .json({ error: "Cannot ask AI about an incomplete meeting." });
        return;
      }

      if (
        !meeting.fullTranscriptText ||
        meeting.fullTranscriptText.trim() === ""
      ) {
        res
          .status(400)
          .json({ error: "Meeting transcript is empty or not available." });
        return;
      }

      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders(); // Send headers immediately

      const systemPrompt = `You are an intelligent assistant. Based *only* on the provided meeting transcript, answer the user's question. Do not use any external knowledge or make assumptions beyond what is stated in the transcript. If the answer cannot be found in the transcript, clearly state that the information is not available in the provided text.`;

      const userMessageContent = `Meeting Transcript:\n---\n${meeting.fullTranscriptText}\n---\n\nUser's Question: ${question}`;

      const stream = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessageContent },
        ],
        temperature: 0.2,
        stream: true, // Enable streaming
      });

      for await (const chunk of stream) {
        const contentDelta = chunk.choices[0]?.delta?.content || "";
        if (contentDelta) {
          res.write(`data: ${JSON.stringify({ text: contentDelta })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ event: "EOS" })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error(
        `Error in /api/meetings/${meetingId}/ask-ai (streaming):`,
        error
      );
      if (res.headersSent) {
        try {
          res.write(
            `data: ${JSON.stringify({
              error: "An error occurred during streaming.",
              details: error.message || "Unknown error",
            })}\n\n`
          );
        } catch (e) {
          console.error(
            "Error writing error event to SSE stream for /ask-ai:",
            e
          );
        } finally {
          res.end();
        }
      } else {
        let statusCode = 500;
        let errorMessage = "Internal server error processing your question.";
        if (error instanceof OpenAI.APIError) {
          statusCode = error.status || 500;
          errorMessage = `OpenAI API Error: ${error.message}`;
        }
        res
          .status(statusCode)
          .json({ error: errorMessage, details: error.message });
      }
    }
  }
);

// NEW ENDPOINT: Ask AI about an ACTIVE meeting's live transcript (NOW STREAMING)
app.post(
  "/api/meetings/:meetingId/ask-live-transcript",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { meetingId } = req.params;
    const { question } = req.body;
    const userIdFromToken = req.userAuth?.userId;

    if (!userIdFromToken) {
      // Headers not sent yet, so we can send a normal JSON error response
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found in token." });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      res.status(400).json({ error: "Invalid meeting ID format." });
      return;
    }
    if (!question || typeof question !== "string" || question.trim() === "") {
      res.status(400).json({ error: "Question is required." });
      return;
    }

    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found." });
        return;
      }
      if (meeting.userId.toString() !== userIdFromToken) {
        res.status(403).json({
          error: "Forbidden: You do not have access to this meeting.",
        });
        return;
      }
      if (meeting.status !== "active" && meeting.status !== "completed") {
        res.status(400).json({
          error: `Cannot ask AI about a meeting with status: ${meeting.status}. Must be active or completed.`,
        });
        return;
      }
      if (
        !meeting.fullTranscriptText ||
        meeting.fullTranscriptText.trim() === ""
      ) {
        res.status(400).json({
          error:
            "Meeting transcript is currently empty. Ask again once there is some text.",
        });
        return;
      }

      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders(); // Send headers immediately

      const systemPrompt = `You are an intelligent assistant. Based *only* on the provided live meeting transcript, answer the user's question concisely. The transcript may be incomplete as the meeting is ongoing. If the answer cannot be found in the transcript, clearly state that the information is not available in the provided text.`;
      const userMessageContent = `Live Meeting Transcript (may be incomplete):
---
${meeting.fullTranscriptText}
---

User's Question: ${question}`;

      const stream = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessageContent },
        ],
        temperature: 0.3,
        stream: true, // Enable streaming
      });

      for await (const chunk of stream) {
        const contentDelta = chunk.choices[0]?.delta?.content || "";
        if (contentDelta) {
          // SSE format: data: JSON_string\n\n
          res.write(`data: ${JSON.stringify({ text: contentDelta })}\n\n`);
        }
      }
      // Signal end of stream
      res.write(`data: ${JSON.stringify({ event: "EOS" })}\n\n`);
      // res.end(); // Connection will be kept alive by default, client or timeout should close.
      // Or explicitly end after the loop if no more data is expected from this request.
      // For simplicity, let's end it here.
      res.end();
    } catch (error: any) {
      console.error(
        `Error in /api/meetings/${meetingId}/ask-live-transcript (streaming):`,
        error
      );
      // If headers have already been sent, we can't change the status code.
      // We try to send an error event through the stream.
      if (res.headersSent) {
        try {
          res.write(
            `data: ${JSON.stringify({
              error: "An error occurred during streaming.",
              details: error.message || "Unknown error", // Send error message
            })}\n\n`
          );
        } catch (e) {
          console.error("Error writing error event to SSE stream:", e);
        } finally {
          // Crucially, ensure the response is ended if an error occurs mid-stream.
          res.end();
        }
      } else {
        // Headers not sent, so we can send a normal JSON error response
        res.status(500).json({
          error: "Failed to start streaming AI response.",
          details: error.message, // Include error message
        });
      }
    }
  }
);

// Modified endpoint for transcribing and saving audio chunks to a specific meeting
app.post(
  "/api/meetings/:meetingId/chunk", // Changed route to include meetingId
  authenticateToken,
  upload.single("audio"),
  async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    const userIdFromToken = req.userAuth?.userId;
    const { meetingId } = req.params;

    console.log(
      `[Backend /chunk] Endpoint hit for meetingId: ${meetingId}. UserID: ${userIdFromToken}`
    );

    if (!req.file) {
      console.log("[Backend /chunk] No audio chunk file uploaded.");
      res.status(400).json({ error: "No audio chunk uploaded." });
      return;
    }
    console.log(
      `[Backend /chunk] Received file: ${req.file.originalname}, size: ${
        req.file.size
      }, mimetype: ${req.file.mimetype}, s3Key: ${
        (req.file as Express.MulterS3.File).key
      }`
    );

    if (!userIdFromToken) {
      console.log("[Backend /chunk] Auth error: User ID not found in token.");
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found." });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      res.status(400).json({ error: "Invalid meeting ID format." });
      return;
    }

    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found." });
        return;
      }
      if (meeting.userId.toString() !== userIdFromToken) {
        res
          .status(403)
          .json({ error: "User not authorized for this meeting." });
        return;
      }
      if (meeting.status !== "active") {
        res.status(400).json({
          error: `Meeting is not active (status: ${meeting.status}). Cannot add chunk.`,
        });
        return;
      }

      const s3Key = (req.file as Express.MulterS3.File).key;
      if (!s3Key) {
        throw new Error("Failed to get S3 key from uploaded chunk");
      }

      // Force .wav extension for the temporary file sent to OpenAI
      const tempFilePath = path.join(os.tmpdir(), `${Date.now()}_chunk.wav`);
      const getObjectParams = {
        Bucket: process.env.S3_BUCKET_NAME || "your-bucket-name",
        Key: s3Key,
      };
      const { Body } = await s3.send(new GetObjectCommand(getObjectParams));
      if (!Body) {
        throw new Error("Failed to retrieve chunk from S3");
      }
      const writeStream = fs.createWriteStream(tempFilePath);
      // @ts-ignore
      Body.pipe(writeStream);
      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      // Convert to WAV using ffmpeg before sending to OpenAI
      const tempWavPath =
        tempFilePath.replace(/\.[^/.]+$/, "") + "_converted.wav";
      console.log(
        `[Backend /chunk Meeting ${meetingId}] Original temp file: ${tempFilePath}, attempting conversion to: ${tempWavPath}`
      );

      await new Promise<void>((resolve, reject) => {
        const command = `ffmpeg -y -i "${tempFilePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempWavPath}"`;
        console.log(
          `[Backend /chunk Meeting ${meetingId}] Executing ffmpeg: ${command}`
        );
        exec(command, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            console.error(
              `[Backend /chunk Meeting ${meetingId}] ffmpeg conversion error: ${error.message}`
            );
            console.error(
              `[Backend /chunk Meeting ${meetingId}] ffmpeg stderr: ${stderr}`
            );
            // Attempt to delete temp files even if ffmpeg fails to prevent clutter
            try {
              if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
              if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
            } catch (cleanupError: any) {
              console.error(
                `[Backend /chunk Meeting ${meetingId}] Error during cleanup after ffmpeg failure: ${cleanupError.message}`
              );
            }
            return reject(
              new Error(
                `ffmpeg conversion failed: ${error.message} STDErr: ${stderr}`
              )
            ); // Include stderr in reject
          }
          // Check if the output file was actually created and has size
          if (
            !fs.existsSync(tempWavPath) ||
            fs.statSync(tempWavPath).size === 0
          ) {
            console.error(
              `[Backend /chunk Meeting ${meetingId}] ffmpeg created an empty or missing output file: ${tempWavPath}`
            );
            console.error(
              `[Backend /chunk Meeting ${meetingId}] ffmpeg stdout: ${stdout}`
            );
            console.error(
              `[Backend /chunk Meeting ${meetingId}] ffmpeg stderr: ${stderr}`
            );
            try {
              if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
              if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
            } catch (cleanupError: any) {
              console.error(
                `[Backend /chunk Meeting ${meetingId}] Error during cleanup after empty output: ${cleanupError.message}`
              );
            }
            return reject(
              new Error(
                `ffmpeg created an empty or missing output file. STDErr: ${stderr} STDOUT: ${stdout}`
              )
            );
          }
          console.log(
            `[Backend /chunk Meeting ${meetingId}] ffmpeg conversion successful to ${tempWavPath}. STDOUT: ${stdout}`
          );
          resolve();
        });
      });

      const transcriptionResponse = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: fs.createReadStream(tempWavPath), // Use the converted WAV file
      });

      fs.unlinkSync(tempFilePath); // Delete the original temporary S3 download
      if (fs.existsSync(tempWavPath)) {
        // Delete the temporary WAV file
        fs.unlinkSync(tempWavPath);
      }

      const transcribedText = transcriptionResponse.text;
      console.log(
        `[Backend /chunk Meeting ${meetingId}] OpenAI transcription result: "${transcribedText}" (Length: ${transcribedText?.length})`
      );

      if (transcribedText && transcribedText.trim().length > 0) {
        const newChunkOrder = meeting.transcriptChunks.length;
        meeting.transcriptChunks.push({
          order: newChunkOrder,
          text: transcribedText,
          timestamp: new Date(),
        });
        // The pre-save hook on the Meeting model will update fullTranscriptText
        await meeting.save();
        console.log(
          `[Backend /chunk Meeting ${meetingId}] Chunk ${newChunkOrder} SAVED. Text: ${transcribedText.substring(
            0,
            50
          )}...`
        );
      } else {
        console.log(
          `[Backend /chunk Meeting ${meetingId}] Transcription resulted in empty text. Chunk NOT SAVED.`
        );
      }

      // Respond with the text of the current chunk for live frontend update
      res.status(200).json({ transcription: transcribedText });
    } catch (error: any) {
      console.error(
        `[Meeting ${meetingId}] Error transcribing/saving audio chunk:`,
        error
      );
      let errorMessage = "Failed to process audio chunk.";
      if (error.response?.data?.error?.message) {
        errorMessage = error.response.data.error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      res.status(500).json({ error: errorMessage, details: error.message });
    }
  }
);

// Endpoint to start a new meeting
app.post(
  "/api/meetings/start",
  authenticateToken,
  async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    const userIdFromToken = req.userAuth?.userId;

    if (!userIdFromToken) {
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found." });
      return;
    }

    try {
      const newMeeting = new Meeting({
        userId: userIdFromToken,
        startTime: new Date(),
        status: "active",
        transcriptChunks: [], // Initialize with empty chunks
      });

      await newMeeting.save();

      res.status(201).json({
        message: "Meeting started successfully.",
        meetingId: newMeeting._id,
      });
    } catch (error: any) {
      console.error("Error starting new meeting:", error);
      res.status(500).json({
        error: "Failed to start new meeting.",
        details: error.message,
      });
    }
  }
);

// Endpoint to end a meeting
app.post(
  "/api/meetings/:meetingId/end",
  authenticateToken,
  async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    const userIdFromToken = req.userAuth?.userId;
    const { meetingId } = req.params;

    if (!userIdFromToken) {
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found." });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      res.status(400).json({ error: "Invalid meeting ID format." });
      return;
    }

    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found." });
        return;
      }
      if (meeting.userId.toString() !== userIdFromToken) {
        res
          .status(403)
          .json({ error: "User not authorized for this meeting." });
        return;
      }
      if (meeting.status === "completed") {
        res.status(400).json({ error: "Meeting has already been completed." });
        return;
      }

      meeting.status = "completed";
      meeting.endTime = new Date();
      // The pre-save hook should ensure fullTranscriptText is up-to-date if any final chunks were added
      await meeting.save(); // Save once to finalize endTime and transcript before summary

      // --- Summary Generation ---
      if (
        meeting.fullTranscriptText &&
        meeting.fullTranscriptText.trim().length > 0
      ) {
        try {
          console.log(
            `[Meeting ${meetingId}] Generating summary... Transcript length: ${meeting.fullTranscriptText.length}`
          );
          const summaryPrompt = `Your task is to generate a structured summary for the following meeting transcript.

First, write a single, concise sentence that provides an overall summary of the meeting's main purpose or outcome. This sentence should stand alone.

After this single sentence, leave a blank line.

Then, provide a more detailed breakdown under the following headings:
- Main Topics: (List key topics discussed. For each topic, provide a brief 1-2 sentence elaboration capturing the core points or examples mentioned about that topic in the transcript. If no main topics were discussed, state "No main topics were discussed.")
- Decisions: (List specific decisions made. If none, state "No specific decisions were made.")
- Action Items: (List action items assigned. If none, state "No action items were assigned.")

Transcript:
---
${meeting.fullTranscriptText}
---

Please ensure your entire response follows this structure:
<Single overall summary sentence>

Main Topics:
- <topic 1>
- <topic 2>

Decisions:
- <decision 1 or "No specific decisions were made.">

Action Items:
- <action item 1 or "No action items were assigned.">`;

          const summaryCompletion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "You are an expert meeting summarizer.",
              },
              { role: "user", content: summaryPrompt },
            ],
            temperature: 0.5,
            max_tokens: 500,
          });

          let generatedSummary =
            summaryCompletion.choices[0]?.message?.content?.trim();

          if (generatedSummary && generatedSummary.trim() !== "") {
            // Prepend "Summary:\n\n" if it doesn't already start with it (case-insensitive)
            if (!generatedSummary.toLowerCase().startsWith("summary:")) {
              generatedSummary = "Summary:\n\n" + generatedSummary;
            }
            meeting.summary = generatedSummary;
            await meeting.save(); // Save again with the summary
            console.log(
              `[Meeting ${meetingId}] Summary generated, prefixed, and saved.`
            );
          } else {
            console.warn(
              `[Meeting ${meetingId}] Summary generation resulted in empty or whitespace content. Summary not saved.`
            );
            // Optionally, save a default placeholder if generatedSummary is empty
            // meeting.summary = "Summary could not be generated for this meeting.";
            // await meeting.save();
          }
        } catch (summaryError: any) {
          console.error(
            `[Meeting ${meetingId}] Error during summary generation:`,
            summaryError.message
          );
          // Do not block meeting end process due to summary failure, but log it.
          // Consider adding a specific status or flag to the meeting if summary failed.
        }
      } else {
        console.log(
          `[Meeting ${meetingId}] Transcript is empty. Skipping summary generation.`
        );
      }
      // --- End Summary Generation ---

      console.log(`[Meeting ${meetingId}] Ended. Status: ${meeting.status}`);

      res.status(200).json({
        message: "Meeting ended successfully.",
        meetingId: meeting._id,
        status: meeting.status,
      });
    } catch (error: any) {
      console.error(`[Meeting ${meetingId}] Error ending meeting:`, error);
      // If meeting was in a weird state, or DB error
      // Consider setting meeting status to 'error' if appropriate
      // await Meeting.findByIdAndUpdate(meetingId, { status: 'error' });
      res.status(500).json({
        error: "Failed to end meeting.",
        details: error.message,
      });
    }
  }
);

// Only start the server if this file is run directly (e.g., not imported by tests)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

export default app; // Export app for testing and potentially for a separate server starter file
