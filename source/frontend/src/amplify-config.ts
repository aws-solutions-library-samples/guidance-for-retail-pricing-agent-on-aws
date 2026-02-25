/**
 * @fileoverview AWS Amplify configuration with Cognito User Pool and optional Midway OIDC.
 * 
 * Configures Amplify with Cognito User Pool for authentication and optional
 * Midway OIDC integration for Amazon employee SSO.
 */

import { Amplify, type ResourcesConfig } from 'aws-amplify';
import amplifyOutputs from '../amplify_outputs.json';

/**
 * Extended amplify outputs interface to include optional identity pool.
 */
interface ExtendedAmplifyOutputs {
  auth: {
    aws_region: string;
    user_pool_id: string;
    user_pool_client_id: string;
    identity_pool_id?: string;
  };
  api?: {
    aws_appsync_graphqlEndpoint: string;
    aws_appsync_region: string;
    aws_appsync_authenticationType: string;
    aws_appsync_apiKey?: string;
  };
}

/**
 * Environment configuration for different deployment scenarios.
 */
interface EnvironmentConfig {
  region: string;
  userPoolId: string;
  userPoolWebClientId: string;
  identityPoolId?: string;
  midwayOIDC?: {
    enabled: boolean;
    domain: string;
    clientId: string;
  };
  graphql?: {
    endpoint: string;
    apiKey?: string;
  };
}

/**
 * Get environment-specific configuration.
 * Supports both amplify_outputs.json and environment variables.
 */
const getEnvironmentConfig = (): EnvironmentConfig => {
  const extendedOutputs = amplifyOutputs as ExtendedAmplifyOutputs;
  
  // Check if we have amplify_outputs.json configuration
  if (extendedOutputs?.auth) {
    return {
      region: extendedOutputs.auth.aws_region,
      userPoolId: extendedOutputs.auth.user_pool_id,
      userPoolWebClientId: extendedOutputs.auth.user_pool_client_id,
      identityPoolId: extendedOutputs.auth.identity_pool_id,
      graphql: extendedOutputs.api ? {
        endpoint: extendedOutputs.api.aws_appsync_graphqlEndpoint,
        apiKey: extendedOutputs.api.aws_appsync_apiKey
      } : undefined,
      midwayOIDC: {
        enabled: import.meta.env.VITE_MIDWAY_OIDC_ENABLED === 'true',
        domain: import.meta.env.VITE_MIDWAY_OIDC_DOMAIN || '',
        clientId: import.meta.env.VITE_MIDWAY_OIDC_CLIENT_ID || ''
      }
    };
  }

  // Fallback to environment variables
  return {
    region: import.meta.env.VITE_AWS_REGION || 'us-west-2',
    userPoolId: import.meta.env.VITE_USER_POOL_ID || '',
    userPoolWebClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '',
    identityPoolId: import.meta.env.VITE_IDENTITY_POOL_ID,
    graphql: {
      endpoint: import.meta.env.VITE_GRAPHQL_ENDPOINT || '',
      apiKey: import.meta.env.VITE_GRAPHQL_API_KEY
    },
    midwayOIDC: {
      enabled: import.meta.env.VITE_MIDWAY_OIDC_ENABLED === 'true',
      domain: import.meta.env.VITE_MIDWAY_OIDC_DOMAIN || '',
      clientId: import.meta.env.VITE_MIDWAY_OIDC_CLIENT_ID || ''
    }
  };
};

/**
 * Build OAuth configuration for Midway OIDC integration.
 * 
 * @param config - Environment configuration
 * @returns OAuth configuration object or undefined
 */
const buildOAuthConfig = (config: EnvironmentConfig) => {
  if (!config.midwayOIDC?.enabled || !config.midwayOIDC.domain) {
    return undefined;
  }

  const baseUrl = window.location.origin;
  
  return {
    domain: config.midwayOIDC.domain,
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: `${baseUrl}/oauth/callback`,
    redirectSignOut: `${baseUrl}/login`,
    responseType: 'code' as const
  };
};

/**
 * Build complete Amplify configuration.
 * 
 * @param config - Environment configuration
 * @returns Complete Amplify configuration
 */
const buildAmplifyConfig = (config: EnvironmentConfig): ResourcesConfig => {
  const amplifyConfig: ResourcesConfig = {
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolWebClientId,
        ...(config.identityPoolId && { identityPoolId: config.identityPoolId })
      }
    }
  };

  // Add OAuth configuration if Midway OIDC is enabled
  const oauthConfig = buildOAuthConfig(config);
  if (oauthConfig && amplifyConfig.Auth?.Cognito) {
    amplifyConfig.Auth.Cognito.loginWith = {
      oauth: {
        domain: oauthConfig.domain,
        scopes: oauthConfig.scope,
        redirectSignIn: [oauthConfig.redirectSignIn],
        redirectSignOut: [oauthConfig.redirectSignOut],
        responseType: 'code'
      }
    };
  }

  // Add GraphQL API configuration if available
  if (config.graphql?.endpoint) {
    amplifyConfig.API = {
      GraphQL: {
        endpoint: config.graphql.endpoint,
        region: config.region,
        defaultAuthMode: config.graphql.apiKey ? 'apiKey' : 'userPool',
        ...(config.graphql.apiKey && { apiKey: config.graphql.apiKey })
      }
    };
  }

  return amplifyConfig;
};

/**
 * Configure AWS Amplify with Cognito User Pool and optional Midway OIDC.
 * 
 * This function should be called before rendering the React app to ensure
 * Amplify is properly configured for authentication.
 */
export const configureAmplify = (): void => {
  try {
    const envConfig = getEnvironmentConfig();
    const amplifyConfig = buildAmplifyConfig(envConfig);

    console.log('Configuring Amplify with Cognito User Pool...');
    console.log('Region:', envConfig.region);
    console.log('User Pool ID:', envConfig.userPoolId);
    console.log('Midway OIDC Enabled:', envConfig.midwayOIDC?.enabled || false);

    // Validate required configuration
    if (!envConfig.userPoolId || !envConfig.userPoolWebClientId) {
      throw new Error('Missing required Cognito configuration. Please check your amplify_outputs.json or environment variables.');
    }

    // Configure Amplify
    Amplify.configure(amplifyConfig);

    console.log('Amplify configured successfully');
    
    // Log configuration details (excluding sensitive data)
    if (envConfig.graphql?.endpoint) {
      console.log('GraphQL Endpoint:', envConfig.graphql.endpoint);
    }
    
    if (envConfig.midwayOIDC?.enabled) {
      console.log('Midway OIDC Domain:', envConfig.midwayOIDC.domain);
    }

  } catch (error) {
    console.error('Failed to configure Amplify:', error);
    throw new Error(`Amplify configuration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Get current Amplify configuration for debugging purposes.
 * 
 * @returns Current environment configuration (excluding sensitive data)
 */
export const getAmplifyConfigInfo = () => {
  const config = getEnvironmentConfig();
  
  return {
    region: config.region,
    userPoolId: config.userPoolId,
    hasIdentityPool: !!config.identityPoolId,
    midwayEnabled: config.midwayOIDC?.enabled || false,
    hasGraphQL: !!config.graphql?.endpoint
  };
};

/**
 * Check if Midway OIDC is enabled and properly configured.
 * 
 * @returns True if Midway OIDC is enabled and configured
 */
export const isMidwayOIDCEnabled = (): boolean => {
  const config = getEnvironmentConfig();
  return !!(config.midwayOIDC?.enabled && config.midwayOIDC.domain && config.midwayOIDC.clientId);
};

// Export configuration for use in other modules
export { type EnvironmentConfig };