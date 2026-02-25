/**
 * @fileoverview Main entry point for the React application.
 * 
 * Configures AWS Amplify with Cognito authentication and renders the App component.
 * Amplify must be configured before the React app renders to ensure authentication works properly.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { configureAmplify } from './amplify-config';

// Import debug utilities in development
if (process.env.NODE_ENV === 'development') {
  import('./utils/auth-debug').catch(error => {
    console.warn('Failed to load auth debug utilities:', error);
  });
}

// Configure AWS Amplify before rendering the app
try {
  configureAmplify();
} catch (error) {
  console.error('Failed to configure Amplify:', error);
  // Still render the app but authentication may not work
}

// Get the root element
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Make sure there is an element with id="root" in your HTML.');
}

// Create root and render the app
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);