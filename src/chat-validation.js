import mongoose from 'mongoose';

export function isObjectId(value) {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

export function validateSearchQuery(query) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 50) {
    return null;
  }
  return query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateMessageContent(content) {
  if (typeof content !== 'string') {
    return null;
  }
  const normalized = content.trim();
  return normalized.length >= 1 && normalized.length <= 4000 ? normalized : null;
}
