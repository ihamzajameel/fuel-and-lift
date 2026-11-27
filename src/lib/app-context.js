import { createContext, useContext } from 'react';

/** App-level UI services: navigation, toasts, rest timer, reminder banners. */
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
