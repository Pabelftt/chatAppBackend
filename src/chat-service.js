import mongoose from 'mongoose';
import { HttpError } from './errors.js';
import { Conversation } from './models/conversation.js';
import { Message } from './models/message.js';
import { User } from './models/user.js';
import { isObjectId, validateMessageContent, validateSearchQuery } from './chat-validation.js';

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName
  };
}

export function messageDto(message) {
  return {
    id: message.id,
    conversationId: message.conversationId.toString(),
    content: message.content,
    sender: publicUser(message.senderId),
    createdAt: message.createdAt
  };
}

export function conversationDto(conversation) {
  return {
    id: conversation.id,
    participants: conversation.participants.map(publicUser),
    lastMessage: conversation.lastMessage ? messageDto(conversation.lastMessage) : null,
    updatedAt: conversation.updatedAt
  };
}

export function conversationParticipantId(participant) {
  if (participant?._id) return participant._id.toString();
  if (typeof participant?.id === 'string') return participant.id;
  return participant.toString();
}

export async function searchUsers(userId, query) {
  const safeQuery = validateSearchQuery(query);
  if (!safeQuery) {
    throw new HttpError(400, 'Search must contain between 2 and 50 characters');
  }

  const users = await User.find({
    _id: { $ne: userId },
    $or: [
      { usernameSearch: { $regex: `^${safeQuery.toLowerCase()}` } },
      { displayNameSearch: { $regex: `^${safeQuery.toLowerCase()}` } }
    ]
  })
    .select('username displayName')
    .sort({ username: 1 })
    .limit(20);

  return users.map(publicUser);
}

export async function listConversations(userId) {
  const conversations = await Conversation.find({ participants: userId })
    .populate('participants', 'username displayName')
    .populate({
      path: 'lastMessage',
      populate: { path: 'senderId', select: 'username displayName' }
    })
    .sort({ updatedAt: -1 })
    .limit(100);

  return conversations.map(conversationDto);
}

export async function createDirectConversation(userId, participantId) {
  if (!isObjectId(participantId)) {
    throw new HttpError(400, 'A valid user ID is required');
  }
  if (participantId === userId.toString()) {
    throw new HttpError(400, 'You cannot start a conversation with yourself');
  }

  const otherUser = await User.findById(participantId).select('_id');
  if (!otherUser) {
    throw new HttpError(404, 'User not found');
  }

  const participantKey = [userId.toString(), participantId].sort().join(':');
  const existing = await Conversation.findOne({ participantKey })
    .populate('participants', 'username displayName')
    .populate({
      path: 'lastMessage',
      populate: { path: 'senderId', select: 'username displayName' }
    });
  if (existing) {
    return conversationDto(existing);
  }

  try {
    const conversation = await Conversation.create({
      participants: [new mongoose.Types.ObjectId(userId), otherUser._id],
      participantKey
    });
    await conversation.populate('participants', 'username displayName');
    return conversationDto(conversation);
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const conversation = await Conversation.findOne({ participantKey })
      .populate('participants', 'username displayName')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'username displayName' }
      });
    if (!conversation) {
      throw error;
    }
    return conversationDto(conversation);
  }
}

async function getAuthorizedConversation(userId, conversationId) {
  if (!isObjectId(conversationId)) {
    throw new HttpError(400, 'A valid conversation ID is required');
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId
  }).populate('participants', 'username displayName');
  if (!conversation) {
    throw new HttpError(404, 'Conversation not found');
  }
  return conversation;
}

export async function listMessages(userId, conversationId, rawLimit) {
  await getAuthorizedConversation(userId, conversationId);
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError(400, 'Message limit must be between 1 and 100');
  }

  const messages = await Message.find({ conversationId })
    .populate('senderId', 'username displayName')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit);
  return messages.reverse().map(messageDto);
}

export async function createMessage(userId, conversationId, rawContent) {
  const content = validateMessageContent(rawContent);
  if (!content) {
    throw new HttpError(400, 'Message must contain between 1 and 4000 characters');
  }

  await getAuthorizedConversation(userId, conversationId);
  const message = await Message.create({
    conversationId,
    senderId: userId,
    content
  });
  await Conversation.updateOne(
    { _id: conversationId, participants: userId },
    { $set: { lastMessage: message._id, updatedAt: message.createdAt } }
  );
  await message.populate('senderId', 'username displayName');
  return messageDto(message);
}

export async function getConversationForParticipant(userId, conversationId) {
  return getAuthorizedConversation(userId, conversationId);
}
