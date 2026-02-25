/**
 * @fileoverview Debug component to check authentication and API status.
 */

import React, { useState, useEffect } from 'react';
import { Box, Button, Alert, SpaceBetween } from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';
import { client } from '../graphql/client';

export const DebugInfo = () => {
  const { isAuthenticated, user } = useAuth();
  const [apiTest, setApiTest] = useState<any>(null);
  const [isTestingAPI, setIsTestingAPI] = useState(false);

  const testGraphQLAPI = async () => {
    setIsTestingAPI(true);
    try {
      const result = await client.graphql({
        query: `
          query ListProducts($category: ProductCategory!) {
            listProducts(category: $category, first: 3) {
              edges {
                node {
                  id
                  product_id
                  vendor
                  MSRP
                }
              }
              totalCount
            }
          }
        `,
        variables: {
          category: 'powertools'
        }
      });
      
      setApiTest({ success: true, data: result });
    } catch (error: any) {
      setApiTest({ success: false, error: error.message });
    } finally {
      setIsTestingAPI(false);
    }
  };

  return (
    <Box padding="m">
      <SpaceBetween size="m">
        <Box variant="h3">Debug Information</Box>
        
        <Alert type="info" header="Authentication Status">
          <SpaceBetween size="s">
            <Box>Authenticated: {isAuthenticated ? '✅ Yes' : '❌ No'}</Box>
            {user && <Box>User: {user.username}</Box>}
          </SpaceBetween>
        </Alert>

        <Box>
          <Button 
            onClick={testGraphQLAPI} 
            loading={isTestingAPI}
            disabled={!isAuthenticated}
          >
            Test GraphQL API
          </Button>
        </Box>

        {apiTest && (
          <Alert 
            type={apiTest.success ? "success" : "error"} 
            header={apiTest.success ? "API Test Successful" : "API Test Failed"}
          >
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {JSON.stringify(apiTest, null, 2)}
            </pre>
          </Alert>
        )}
      </SpaceBetween>
    </Box>
  );
};