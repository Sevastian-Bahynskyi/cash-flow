export const getErrorMessage = (error: unknown, fallback = 'Something went wrong.'): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') {
      return serialized;
    }
  } catch {
    // Ignore serialization failures and fall back to the default message.
  }

  return fallback;
};

export const reportDevError = (
  scope: string,
  error: unknown,
  details?: Record<string, unknown>,
): void => {
  if (!__DEV__) return;

  const payload =
    details === undefined
      ? { error: getErrorMessage(error, 'Unknown error.') }
      : { error: getErrorMessage(error, 'Unknown error.'), details };

  console.error(`[${scope}]`, payload);
};
