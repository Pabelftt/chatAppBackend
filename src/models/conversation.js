import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
      validate: {
        validator: (participants) => participants.length === 2,
        message: 'A direct conversation must have exactly two participants'
      }
    },
    participantKey: {
      type: String,
      required: true,
      unique: true
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    }
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
