import { randomUUID } from 'node:crypto';

const DESCRIPTION_LIMIT = 256_000;
const CANDIDATE_LIMIT = 16_000;
const RING_TIMEOUT_MS = 45_000;
const MAX_CALL_DURATION_MS = 4 * 60 * 60 * 1000;
const CALLS_PER_MINUTE_LIMIT = 5;

function acknowledge(callback, response) {
  if (typeof callback === 'function') callback(response);
}

function validDescription(description, type) {
  return description
    && description.type === type
    && typeof description.sdp === 'string'
    && description.sdp.length > 0
    && description.sdp.length <= DESCRIPTION_LIMIT;
}

function getOtherParticipant(conversation, userId) {
  return conversation.participants.find((participant) => participant.id !== userId);
}

export function attachCallSignaling(io, socket, {
  getConversation,
  getPublicUser,
  iceServers,
  callRegistry,
  callAttempts,
  now = Date.now
}) {
  const registry = callRegistry ?? new Map();
  const attemptsByUser = callAttempts ?? new Map();
  const userId = socket.data.userId;

  socket.on('call:prepare', async (payload, callback) => {
    try {
      await getConversation(userId, payload?.conversationId);
      acknowledge(callback, { ok: true, iceServers });
    } catch (error) {
      acknowledge(callback, {
        ok: false,
        error: error?.status === 404 ? 'Conversation not found' : 'Unable to prepare call'
      });
    }
  });

  socket.on('call:start', async (payload, callback) => {
    let startingCallId;
    try {
      if (!validDescription(payload?.offer, 'offer') || !['audio', 'video'].includes(payload?.mediaType)) {
        acknowledge(callback, { ok: false, error: 'Invalid call offer' });
        return;
      }

      const conversation = await getConversation(userId, payload?.conversationId);
      const recipient = getOtherParticipant(conversation, userId);
      if (!recipient) {
        acknowledge(callback, { ok: false, error: 'Call participant not found' });
        return;
      }
      const recentAttempts = (attemptsByUser.get(userId) ?? [])
        .filter((timestamp) => now() - timestamp < 60_000);
      if (recentAttempts.length >= CALLS_PER_MINUTE_LIMIT) {
        acknowledge(callback, { ok: false, error: 'Call rate limit exceeded' });
        return;
      }
      recentAttempts.push(now());
      attemptsByUser.set(userId, recentAttempts);
      const cleanup = setTimeout(() => {
        const remaining = (attemptsByUser.get(userId) ?? [])
          .filter((timestamp) => now() - timestamp < 60_000);
        if (remaining.length === 0) attemptsByUser.delete(userId);
        else attemptsByUser.set(userId, remaining);
      }, 60_000);
      cleanup.unref?.();
      if ([...registry.values()].some((call) =>
        call.status !== 'ended'
        && [userId, recipient.id].some((id) => [call.callerId, call.recipientId].includes(id))
      )) {
        acknowledge(callback, { ok: false, error: 'One participant already has an active call' });
        return;
      }

      const callId = randomUUID();
      startingCallId = callId;
      const call = {
        callId,
        conversationId: conversation.id,
        callerId: userId,
        recipientId: recipient.id,
        status: 'starting',
        createdAt: now(),
        timer: null,
        iceCandidateCount: 0
      };
      registry.set(callId, call);
      const caller = await getPublicUser(userId);
      call.status = 'ringing';
      call.timer = setTimeout(() => {
        if (registry.get(callId) !== call || call.status !== 'ringing') return;
        registry.delete(callId);
        call.status = 'ended';
        io.to(`user:${call.callerId}`).emit('call:ended', { callId, reason: 'timeout' });
        io.to(`user:${call.recipientId}`).emit('call:ended', { callId, reason: 'timeout' });
      }, RING_TIMEOUT_MS);
      call.timer.unref?.();
      io.to(`user:${recipient.id}`).emit('call:incoming', {
        callId,
        conversationId: conversation.id,
        caller,
        mediaType: payload.mediaType,
        offer: payload.offer,
        iceServers
      });
      acknowledge(callback, { ok: true, callId });
    } catch (error) {
      if (startingCallId && registry.get(startingCallId)?.status === 'starting') {
        registry.delete(startingCallId);
      }
      acknowledge(callback, {
        ok: false,
        error: error?.status === 404 ? 'Conversation not found' : 'Unable to start call'
      });
    }
  });

  socket.on('call:accept', (payload, callback) => {
    const call = registry.get(payload?.callId);
    if (!call || call.recipientId !== userId || call.status !== 'ringing') {
      acknowledge(callback, { ok: false, error: 'Call is no longer available' });
      return;
    }
    if (!validDescription(payload?.answer, 'answer')) {
      acknowledge(callback, { ok: false, error: 'Invalid call answer' });
      return;
    }
    clearTimeout(call.timer);
    call.status = 'active';
    call.timer = setTimeout(() => {
      if (registry.get(call.callId) !== call) return;
      registry.delete(call.callId);
      call.status = 'ended';
      io.to(`user:${call.callerId}`).emit('call:ended', {
        callId: call.callId,
        reason: 'maximum-duration'
      });
      io.to(`user:${call.recipientId}`).emit('call:ended', {
        callId: call.callId,
        reason: 'maximum-duration'
      });
    }, MAX_CALL_DURATION_MS);
    call.timer.unref?.();
    io.to(`user:${call.callerId}`).emit('call:accepted', {
      callId: call.callId,
      answer: payload.answer
    });
    acknowledge(callback, { ok: true });
  });

  socket.on('call:decline', (payload, callback) => {
    const call = registry.get(payload?.callId);
    if (!call || call.recipientId !== userId || call.status !== 'ringing') {
      acknowledge(callback, { ok: false, error: 'Call is no longer available' });
      return;
    }
    clearTimeout(call.timer);
    registry.delete(call.callId);
    call.status = 'ended';
    io.to(`user:${call.callerId}`).emit('call:ended', {
      callId: call.callId,
      reason: 'declined'
    });
    acknowledge(callback, { ok: true });
  });

  socket.on('call:end', (payload, callback) => {
    const call = registry.get(payload?.callId);
    if (!call || ![call.callerId, call.recipientId].includes(userId)) {
      acknowledge(callback, { ok: false, error: 'Call is no longer available' });
      return;
    }
    clearTimeout(call.timer);
    registry.delete(call.callId);
    call.status = 'ended';
    const recipientId = call.callerId === userId ? call.recipientId : call.callerId;
    io.to(`user:${recipientId}`).emit('call:ended', {
      callId: call.callId,
      reason: 'ended'
    });
    acknowledge(callback, { ok: true });
  });

  socket.on('call:ice', (payload, callback) => {
    const call = registry.get(payload?.callId);
    const candidate = payload?.candidate;
    if (!call || !['ringing', 'active'].includes(call.status)
      || ![call.callerId, call.recipientId].includes(userId)) {
      acknowledge(callback, { ok: false, error: 'Call is no longer active' });
      return;
    }
    if (!candidate || typeof candidate.candidate !== 'string'
      || candidate.candidate.length === 0 || candidate.candidate.length > CANDIDATE_LIMIT
      || (candidate.sdpMid !== undefined
        && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 256))
      || (candidate.sdpMLineIndex !== undefined
        && (!Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0))) {
      acknowledge(callback, { ok: false, error: 'Invalid ICE candidate' });
      return;
    }
    if (call.iceCandidateCount >= 256) {
      acknowledge(callback, { ok: false, error: 'ICE candidate limit exceeded' });
      return;
    }
    call.iceCandidateCount += 1;
    const recipientId = call.callerId === userId ? call.recipientId : call.callerId;
    io.to(`user:${recipientId}`).emit('call:ice', {
      callId: call.callId,
      candidate
    });
    acknowledge(callback, { ok: true });
  });
}
