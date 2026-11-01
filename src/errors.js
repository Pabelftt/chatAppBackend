export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(error, _request, response, _next) {
  if (error instanceof HttpError) {
    return response.status(error.status).json({ error: error.message });
  }

  if (error?.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'Request body must be valid JSON' });
  }

  if (error?.message === 'Origin is not allowed by CORS') {
    return response.status(403).json({ error: error.message });
  }

  if (error?.code === 11000) {
    return response.status(409).json({ error: 'Email or username is already in use' });
  }

  console.error(error);
  return response.status(500).json({ error: 'Internal server error' });
}
