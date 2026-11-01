import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000
    }
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });

export const Message = mongoose.model('Message', messageSchema);
