// Sentry removed - logging functions replaced with console
// Original package @sentry/nextjs has been removed

export const withApiLogging = async <T>(
  endpoint: string,
  apiCall: () => Promise<T>,
  method: string = "POST",
  requestData?: any,
): Promise<T> => {
  const startTime = Date.now();
  try {
    const result = await apiCall();
    console.log(`[API Success] ${endpoint} (${Date.now() - startTime}ms)`);
    return result;
  } catch (error: any) {
    console.error(`[API Error] ${endpoint}:`, {
      error: error.message || "Unknown error",
      statusCode: error.response?.status,
      duration: `${Date.now() - startTime}ms`,
    });
    throw error;
  }
};

export const setSentryUser = (user: {
  id: string;
  email: string;
  name: string;
  role: string;
}) => {
  console.log(`[User] Set user: ${user.name} (${user.email})`);
};

export const clearSentryUser = () => {
  console.log("[User] User cleared");
};
