const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function validateRegistration(body) {
  const { email, username, displayName, password } = body ?? {};
  const errors = [];

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(normalizeEmail(email))) {
    errors.push('A valid email is required');
  }
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    errors.push('Username must be 3-30 letters, numbers, or underscores');
  }
  if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.trim().length > 80) {
    errors.push('Display name must be between 1 and 80 characters');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    errors.push('Password must be between 12 and 128 characters');
  }

  return errors;
}

export function validateLogin(body) {
  if (
    typeof body?.email !== 'string' ||
    !EMAIL_PATTERN.test(normalizeEmail(body.email)) ||
    typeof body?.password !== 'string' ||
    body.password.length === 0 ||
    body.password.length > 128
  ) {
    return ['A valid email and password are required'];
  }
  return [];
}
