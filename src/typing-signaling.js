const TYPING_TIMEOUT_MS = 5_000;

function acknowledge(callback, response) {
  if (typeof callback === 'function') callback(response);
}

export function attachTypingSignaling(io, socket, getConversation) {
  const activeTyping = new Map();
  const userId = socket.data.userId;

  async function setTyping(payload, isTyping, callback) {
    const conversationId = payload?.conversationId;
    if (typeof conversationId !== 'string' || conversationId.length > 64) {
      acknowledge(callback, { ok: false, error: 'A valid conversation is required' });
      return;
    }

    try {
      const conversation = await getConversation(userId, conversationId);
      const participantIds = conversation.participants.map((participant) =>
        participant.id?.toString() ?? participant.toString()
      );
      const recipientId = participantIds.find((id) => id !== userId);
      if (!recipientId) {
        acknowledge(callback, { ok: false, error: 'Conversation participant not found' });
        return;
      }

      const previousTyping = activeTyping.get(conversationId);
      if (previousTyping) clearTimeout(previousTyping.timeout);
      activeTyping.delete(conversationId);

      if (isTyping) {
        const timeout = setTimeout(() => {
          activeTyping.delete(conversationId);
          io.to(`user:${recipientId}`).emit('typing:stopped', { conversationId, userId });
        }, TYPING_TIMEOUT_MS);
        timeout.unref?.();
        activeTyping.set(conversationId, { recipientId, timeout });
        if (!previousTyping) {
          io.to(`user:${recipientId}`).emit('typing:started', { conversationId, userId });
        }
      } else if (previousTyping) {
        io.to(`user:${recipientId}`).emit('typing:stopped', { conversationId, userId });
      }
      acknowledge(callback, { ok: true });
    } catch (error) {
      acknowledge(callback, {
        ok: false,
        error: error?.status === 404 ? 'Conversation not found' : 'Unable to update typing status'
      });
    }
  }

  socket.on('typing:start', (payload, callback) => {
    void setTyping(payload, true, callback);
  });
  socket.on('typing:stop', (payload, callback) => {
    void setTyping(payload, false, callback);
  });
  socket.on('disconnect', () => {
    for (const [conversationId, typing] of activeTyping) {
      clearTimeout(typing.timeout);
      io.to(`user:${typing.recipientId}`).emit('typing:stopped', {
        conversationId,
        userId
      });
    }
    activeTyping.clear();
  });
}
