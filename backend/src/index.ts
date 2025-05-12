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
import Memory, { IMemory } from "./models/memory.model"; // Import the Memory model and its interface
import { google } from "googleapis"; // Import googleapis
import {
  getPineconeIndex,
  OPENAI_EMBEDDING_MODEL,
} from "./lib/pinecone-client"; // Added Pinecone import
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import multerS3 from "multer-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import os from "os";

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
      const extension = path.extname(file.originalname) || ".webm";
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

      // Create a temporary file to store the audio
      const tempFilePath = path.join(os.tmpdir(), `${Date.now()}.webm`);

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

      // After saving to MongoDB, generate embedding and upsert to Pinecone
      try {
        const pineconeIndex = await getPineconeIndex();

        // 1. Generate embedding from OpenAI
        const embeddingResponse = await openai.embeddings.create({
          model: OPENAI_EMBEDDING_MODEL,
          input: transcribedText,
        });

        const embeddingVector = embeddingResponse.data[0].embedding;

        if (!embeddingVector) {
          throw new Error(
            "OpenAI embedding generation failed, no vector returned."
          );
        }

        // 2. Prepare vector for Pinecone
        // Mongoose documents have an `id` virtual getter which is `_id.toString()`
        // and `_id` is of type ObjectId. `createdAt` is a Date.
        const pineconeVectorId = savedMemory.id; // This is a string
        const memoryIdForMetadata = savedMemory.id; // Also a string
        const createdAtForMetadata = (
          savedMemory.createdAt as Date
        ).toISOString();

        const vectorToUpsert = {
          id: pineconeVectorId,
          values: embeddingVector,
          metadata: {
            userId: userIdFromToken,
            memoryId: memoryIdForMetadata,
            originalTextSnippet: transcribedText.substring(0, 500),
            createdAt: createdAtForMetadata,
          },
        };

        // 3. Upsert to Pinecone
        await pineconeIndex.upsert([vectorToUpsert]);
        console.log(
          `[Pinecone] Successfully upserted embedding for memory ${pineconeVectorId}`
        );
      } catch (pineconeEmbedError: unknown) {
        let errorMessage =
          "An unknown error occurred during Pinecone embedding/upsert.";
        if (pineconeEmbedError instanceof Error) {
          errorMessage = pineconeEmbedError.message;
        }
        console.error(
          `[Pinecone Error] Failed to upsert embedding for memory ${savedMemory.id}:`,
          errorMessage
        );
      }

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

// Endpoint to ask questions about memories using AI and Pinecone for semantic search
app.post(
  "/api/memories/ask-ai",
  authenticateToken,
  async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    const userIdFromToken = req.userAuth?.userId;
    const { question } = req.body;

    if (!userIdFromToken) {
      res
        .status(401)
        .json({ error: "Authentication error: User ID not found." });
      return;
    }
    if (!question || typeof question !== "string") {
      res
        .status(400)
        .json({ error: "Missing or invalid 'question' in request body." });
      return;
    }

    try {
      const pineconeIndex = await getPineconeIndex();

      // 1. Generate embedding for the user's question
      const questionEmbeddingResponse = await openai.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL, // from ./lib/pinecone-client
        input: question,
      });
      const questionVector = questionEmbeddingResponse.data[0].embedding;

      if (!questionVector) {
        throw new Error("Failed to generate embedding for the question.");
      }

      // 2. Query Pinecone for relevant memories, filtering by userId
      const topK = 5; // Number of relevant memories to retrieve
      const queryResponse = await pineconeIndex.query({
        vector: questionVector,
        topK: topK,
        filter: { userId: userIdFromToken },
        includeMetadata: true, // Ensure metadata is returned
        includeValues: false, // We don't need the vectors themselves, just metadata
      });

      const relevantMemoryIds =
        queryResponse.matches?.map((match: { id: any }) => match.id) || [];

      if (relevantMemoryIds.length === 0) {
        res.status(200).json({
          answer:
            "I couldn't find any memories directly relevant to your question. Try rephrasing or asking something else!",
        });
        return;
      }

      // 3. Retrieve full memory text from MongoDB for the relevant IDs
      const relevantMemoriesFromDb = await Memory.find({
        _id: { $in: relevantMemoryIds },
        userId: userIdFromToken, // Double check userId for security
      }).sort({ createdAt: "desc" }); // Sort by most recent if desired

      if (relevantMemoriesFromDb.length === 0) {
        // This case should be rare if Pinecone returned IDs that were originally from this user
        console.warn(
          `[ask-ai] Pinecone returned IDs [${relevantMemoryIds.join(
            ", "
          )}] but no matching memories found in DB for user ${userIdFromToken}`
        );
        res.status(200).json({
          answer:
            "Found some potentially relevant memories, but couldn't retrieve their full text. Please try again.",
        });
        return;
      }

      // 4. Construct context and prompt for OpenAI Chat Completion
      const contextForLLM = relevantMemoriesFromDb
        .map(
          (mem) =>
            `Memory from ${new Date(mem.createdAt).toLocaleDateString()}:\n${
              mem.text
            }`
        )
        .join("\n\n---\n\n");

      // 5. Call OpenAI Chat Completion API
      const chatCompletionResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are an AI assistant. Your task is to answer the user's question based ONLY on the provided context from their memories. The relevant memories are listed below. If the answer cannot be found within this context, you MUST explicitly state that you cannot answer the question based on the provided memories. Do not rely on any external knowledge. Be concise and accurate.",
          },
          {
            role: "user",
            content: `Context from my relevant memories:\n---\n${contextForLLM}\n---\n\nBased *only* on the context above, please answer my question: ${question}`,
          },
        ],
      });

      const aiAnswer =
        chatCompletionResponse.choices[0].message?.content?.trim();

      if (!aiAnswer) {
        throw new Error("OpenAI chat completion did not return an answer.");
      }

      res.status(200).json({
        answer: aiAnswer,
        retrievedMemoriesCount: relevantMemoriesFromDb.length,
      });
    } catch (error: any) {
      console.error(
        "[ask-ai] Error processing question:",
        error.message || error
      );
      res.status(500).json({
        error: "Failed to process your question.",
        details: error.message,
      });
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
