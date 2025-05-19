import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITranscriptChunk {
  order: number;
  text: string;
  timestamp: Date;
}

export interface IMeeting extends Document {
  userId: Types.ObjectId;
  calendarEventId?: string; // Optional: if linked to a calendar event
  startTime: Date;
  endTime?: Date;
  status: "active" | "processing_final_chunk" | "completed" | "error";
  transcriptChunks: ITranscriptChunk[];
  fullTranscriptText?: string; // Denormalized, built from chunks
  summary?: string; // For later summary generation
  title?: string; // Optional meeting title
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptChunkSchema = new Schema<ITranscriptChunk>({
  order: { type: Number, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const MeetingSchema = new Schema<IMeeting>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    calendarEventId: { type: String, required: false },
    startTime: { type: Date, default: Date.now, required: true },
    endTime: { type: Date, required: false },
    status: {
      type: String,
      enum: ["active", "processing_final_chunk", "completed", "error"],
      default: "active",
      required: true,
    },
    transcriptChunks: [TranscriptChunkSchema],
    fullTranscriptText: { type: String, default: "" },
    summary: { type: String, required: false },
    title: { type: String, required: false },
  },
  { timestamps: true } // Adds createdAt and updatedAt automatically
);

// Method to update fullTranscriptText (optional, can also be done in service/route logic)
MeetingSchema.pre<IMeeting>("save", function (next) {
  if (this.isModified("transcriptChunks")) {
    this.fullTranscriptText = this.transcriptChunks
      .sort((a, b) => a.order - b.order)
      .map((chunk) => chunk.text)
      .join(" ");
  }
  next();
});

const Meeting = mongoose.model<IMeeting>("Meeting", MeetingSchema);

export default Meeting;
