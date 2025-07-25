import LogRocket from 'logrocket';

/**
 * Funciones helper para LogRocket
 */

/**
 * Identifica un usuario en LogRocket
 */
export const identifyUser = (user: {
  email: string;
  name: string;
  role: string;
  [key: string]: any;
}) => {
  if (typeof window !== 'undefined') {
    const { name, role, email, ...rest } = user;
    LogRocket.identify(email, {
      name,
      role,
      loginTime: new Date().toISOString(),
      ...rest
    });
    
    LogRocket.track('User Identified', {
      email: user.email,
      role: user.role,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Limpia la identidad del usuario (para logout)
 */
export const clearUserIdentity = () => {
  if (typeof window !== 'undefined') {
    LogRocket.track('User Logout', {
      timestamp: new Date().toISOString()
    });
    
    // Reinicializar LogRocket para nueva sesión anónima
    LogRocket.init('w2ree2/securitysuite');
  }
};

/**
 * Registra un evento personalizado
 */
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (typeof window !== 'undefined') {
    LogRocket.track(eventName, {
      timestamp: new Date().toISOString(),
      ...properties
    });
  }
};
