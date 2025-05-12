import mongoose, { Schema, Document } from "mongoose";

// Interface to define the Memory document structure
export interface IMemory extends Document {
  userId: mongoose.Schema.Types.ObjectId; // Reference to the User
  text: string; // Transcribed text
  createdAt: Date;
}

const MemorySchema: Schema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // This creates a reference to the User model
    required: true,
    index: true, // Index for faster querying of user's memories
  },
  text: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Export the Mongoose model
export default mongoose.model<IMemory>("Memory", MemorySchema);
