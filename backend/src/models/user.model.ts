import mongoose, { Schema, Document } from "mongoose";

// Interface to define the User document structure
export interface IUser extends Document {
  googleId: string;
  email: string;
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  googleId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Export the Mongoose model
export default mongoose.model<IUser>("User", UserSchema);
