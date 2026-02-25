import { usePricingService, type PricingSessionWithParsedProduct } from "@/hooks";
import { Table, Box, SpaceBetween, Header, StatusIndicator, Container, Spinner, Alert, Button, Badge } from "@cloudscape-design/components";
import { useNavigate } from "react-router-dom";
import type { PricingAnalysisStatus } from "@/graphql/types";

/**
 * Pricing sessions list page.
 * 
 * Displays a table of pricing sessions for the authenticated user,
 * showing session details, status, and completed analysis stages.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 * 
 * @returns JSX element
 */
export const PricingDashboardListPage = () => {
    const { usePricingSessions } = usePricingService();
    const { data, error, isLoading, refetch } = usePricingSessions();
    const navigate = useNavigate();

    /**
     * Returns a StatusIndicator component based on the session status.
     * 
     * Requirements: 1.2 - Display status with StatusIndicator
     * 
     * @param status - The pricing analysis status
     * @returns StatusIndicator component with appropriate type and label
     */
    const getStatusIndicator = (status: PricingAnalysisStatus | string) => {
        switch (status) {
        case 'success':
        case 'completed':
            return <StatusIndicator type="success">Completed</StatusIndicator>;
        case 'in_progress':
            return <StatusIndicator type="in-progress">In Progress</StatusIndicator>;
        case 'demand_analysis_complete':
            return <StatusIndicator type="in-progress">Demand Complete</StatusIndicator>;
        case 'competitive_analysis_complete':
            return <StatusIndicator type="in-progress">Competitive Complete</StatusIndicator>;
        case 'margin_analysis_complete':
            return <StatusIndicator type="in-progress">Margin Complete</StatusIndicator>;
        case 'error':
        case 'failed':
            return <StatusIndicator type="error">Failed</StatusIndicator>;
        case 'initiated':
            return <StatusIndicator type="pending">Initiated</StatusIndicator>;
        default:
            return <StatusIndicator type="info">{status}</StatusIndicator>;
        }
    };

    /**
     * Returns an array of completed stage names based on session data.
     * 
     * Requirements: 1.2 - Show completed stages as badges
     * 
     * @param session - The pricing session with parsed product data
     * @returns Array of completed stage names
     */
    const getCompletedStages = (session: PricingSessionWithParsedProduct): string[] => {
        const stages: string[] = [];
        
        if (session.demandForecast) {
            stages.push('Demand');
        }
        if (session.competitiveAnalysis) {
            stages.push('Competitive');
        }
        if (session.marginAnalysis) {
            stages.push('Margin');
        }
        if (session.finalRecommendation) {
            stages.push('Final');
        }
        
        return stages;
    };

    /**
     * Formats a timestamp string to a localized date/time string.
     * 
     * Requirements: 1.2 - Format timestamps
     * 
     * @param timestamp - ISO timestamp string
     * @returns Formatted date/time string
     */
    const formatTimestamp = (timestamp: string): string => {
        try {
            return new Date(timestamp).toLocaleString();
        } catch {
            return timestamp;
        }
    };


    if (isLoading) {
        return (
        <Container>
            <Box textAlign="center" padding="l">
            <SpaceBetween direction="vertical" size="m">
                <Spinner size="large" />
                <Box color="text-body-secondary">Loading pricing sessions...</Box>
            </SpaceBetween>
            </Box>
        </Container>
        );
    }

    if (error) {
        return (
        <Container>
            <Alert
            type="error"
            header="Failed to Load Pricing Sessions"
            action={
                <Button variant="primary" onClick={() => refetch()}>
                Retry
                </Button>
            }
            >
            {error.message || 'An unknown error occurred while loading pricing sessions. Please try again.'}
            </Alert>
        </Container>
        );
    }

    // Sessions are already parsed by usePricingSessions hook
    const sessions = data?.items ?? [];

    return (
        <SpaceBetween size="m">
            <Container
                header={
                    <Header
                        variant="h2"
                        counter={`(${sessions.length})`}
                        actions={
                            <Button iconName="refresh" onClick={() => refetch()}>
                                Refresh
                            </Button>
                        }
                    >
                        Pricing Sessions
                    </Header>
                }
            >
                <Table<PricingSessionWithParsedProduct>
                    variant="container"
                    wrapLines={false}
                    stickyHeader={true}
                    columnDefinitions={[
                        {
                            id: 'product',
                            header: <Box textAlign="center" fontWeight="bold">Product</Box>,
                            cell: (item) => item.parsedProduct?.product_id || item.productId || 'N/A',
                            sortingField: 'productId'
                        },
                        {
                            id: 'category',
                            header: <Box textAlign="center" fontWeight="bold">Category</Box>,
                            cell: (item) => item.parsedProduct?.category || 'N/A',
                            sortingField: 'category'
                        },
                        {
                            id: 'status',
                            header: <Box textAlign="center" fontWeight="bold">Status</Box>,
                            cell: (item) => getStatusIndicator(item.status)
                        },
                        {
                            id: 'stages',
                            header: <Box textAlign="center" fontWeight="bold">Completed Stages</Box>,
                            cell: (item) => {
                                const stages = getCompletedStages(item);
                                
                                return (
                                    <SpaceBetween direction="horizontal" size="xs">
                                        {stages.length > 0 ? (
                                            stages.map((stage) => (
                                                <Badge key={stage} color="green">
                                                    {stage}
                                                </Badge>
                                            ))
                                        ) : (
                                            <Box color="text-body-secondary">None</Box>
                                        )}
                                    </SpaceBetween>
                                );
                            }
                        },
                        {
                            id: 'createdAt',
                            header: <Box textAlign="center" fontWeight="bold">Created</Box>,
                            cell: (item) => formatTimestamp(item.createdAt),
                            sortingField: 'createdAt'
                        },
                        {
                            id: 'actions',
                            header: <Box textAlign="center" fontWeight="bold">Actions</Box>,
                            cell: (item) => (
                                <Button
                                    variant="inline-link"
                                    onClick={() => navigate(`/pricing/${item.sessionId || item.id}`)}
                                >
                                    View
                                </Button>
                            )
                        }
                    ]}
                    items={sessions}
                    loadingText="Loading sessions"
                    empty={
                        <Box textAlign="center" color="inherit">
                            <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                                No pricing sessions found
                            </Box>
                            <Button onClick={() => navigate('/products')}>
                                Create Pricing Session
                            </Button>
                        </Box>
                    }
                    sortingDisabled={false}
                />
            </Container>
        </SpaceBetween>
    );
};
