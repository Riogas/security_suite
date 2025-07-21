import * as Sentry from "@sentry/nextjs";

export const withApiLogging = async <T>(
  endpoint: string,
  apiCall: () => Promise<T>,
  method: string = "POST",
  requestData?: any
): Promise<T> => {
  const startTime = Date.now();
  try {
    const result = await apiCall();
    Sentry.addBreadcrumb({
      message: `API call successful: ${endpoint}`,
      category: "api",
      level: "info",
      data: {
        endpoint,
        duration: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString(),
      },
    });
    return result;
  } catch (error: any) {
    Sentry.addBreadcrumb({
      message: `API call failed: ${endpoint}`,
      category: "api",
      level: "error",
      data: {
        endpoint,
        error: error.message || "Unknown error",
        statusCode: error.response?.status,
        responseData: error.response?.data,
        requestData,
        duration: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString(),
      },
    });
    Sentry.captureException(error, {
      tags: {
        section: "api",
        endpoint,
      },
      extra: {
        requestData,
        responseData: error.response?.data,
      },
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
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
    role: user.role,
  });
};

export const clearSentryUser = () => {
  Sentry.setUser(null);
};
