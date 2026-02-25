/**
 * @fileoverview Tests for CompetitiveAnalysisPanel component.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { 
  CompetitiveAnalysisPanel,
  CompetitiveAnalysis 
} from '../../../../src/frontend/src/components/CompetitiveAnalysisResults';

// Mock data for testing
const mockAnalysisData: CompetitiveAnalysis = {
  marketStats: {
    min: 159.99,
    max: 229.99,
    average: 189.45,
    median: 185.99
  },
  primaryCompetitor: {
    name: 'DeWalt Pro Series',
    price: 185.99,
    matchConfidence: 89
  },
  marketPosition: 'Mid-Premium',
  pricingStrategy: 'Match competitor pricing with slight premium',
  screenshots: [
    { url: 'https://example.com/screenshot1.jpg', competitor: 'DeWalt' },
    { url: 'https://example.com/screenshot2.jpg', competitor: 'Milwaukee' }
  ]
};

const mockOnRetry = jest.fn();

describe('CompetitiveAnalysisPanel', () => {
  beforeEach(() => {
    mockOnRetry.mockClear();
  });

  it('should render loading state', () => {
    render(
      <CompetitiveAnalysisPanel 
        analysis={null}
        loading={true}
        error={null}
        onRetry={mockOnRetry}
      />
    );
    
    expect(screen.getByText('Competitive Analysis')).toBeInTheDocument();
    expect(screen.getByText('Analyzing competitive landscape and market positioning...')).toBeInTheDocument();
  });

  it('should render error state', () => {
    const error = new Error('Analysis failed');
    render(
      <CompetitiveAnalysisPanel 
        analysis={null}
        loading={false}
        error={error}
        onRetry={mockOnRetry}
      />
    );
    
    expect(screen.getByText('Competitive Analysis Failed')).toBeInTheDocument();
    expect(screen.getByText('Analysis failed')).toBeInTheDocument();
  });

  it('should render summary view with key metrics when expanded', () => {
    render(
      <CompetitiveAnalysisPanel 
        analysis={mockAnalysisData}
        loading={false}
        error={null}
        onRetry={mockOnRetry}
      />
    );
    
    // Expand the section first
    const expandableHeader = screen.getByText('Competitive Analysis');
    fireEvent.click(expandableHeader);
    
    // Check that key labels and values are present
    expect(screen.getByText('Market Position')).toBeInTheDocument();
    expect(screen.getAllByText('Mid-Premium').length).toBeGreaterThan(0);
    expect(screen.getByText('Primary Competitor')).toBeInTheDocument();
    expect(screen.getAllByText('DeWalt Pro Series').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$185.99').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Recommended Strategy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Match competitor pricing with slight premium').length).toBeGreaterThan(0);
  });

  it('should expand to show detailed view', () => {
    render(
      <CompetitiveAnalysisPanel 
        analysis={mockAnalysisData}
        loading={false}
        error={null}
        onRetry={mockOnRetry}
      />
    );
    
    // Initially, detailed sections should not be visible
    expect(screen.queryByText('Market Price Statistics')).not.toBeInTheDocument();
    
    // Click to expand - click on the header text
    const expandableHeader = screen.getByText('Competitive Analysis');
    fireEvent.click(expandableHeader);
    
    // Detailed sections should now be visible
    expect(screen.getByText('Market Price Statistics')).toBeInTheDocument();
    expect(screen.getByText('Primary Competitor Details')).toBeInTheDocument();
    expect(screen.getByText('Market Position Assessment')).toBeInTheDocument();
    expect(screen.getByText('Pricing Strategy Recommendations')).toBeInTheDocument();
  });

  it('should display market statistics in detailed view', () => {
    render(
      <CompetitiveAnalysisPanel 
        analysis={mockAnalysisData}
        loading={false}
        error={null}
        onRetry={mockOnRetry}
      />
    );
    
    // Expand the panel
    const expandableHeader = screen.getByText('Competitive Analysis');
    fireEvent.click(expandableHeader);
    
    // Check market statistics section exists
    expect(screen.getByText('Market Price Statistics')).toBeInTheDocument();
    expect(screen.getByText('$159.99')).toBeInTheDocument(); // min
    expect(screen.getByText('$229.99')).toBeInTheDocument(); // max
    expect(screen.getByText('$189.45')).toBeInTheDocument(); // average
    // Note: $185.99 appears in multiple places (median and competitor price)
    expect(screen.getAllByText('$185.99').length).toBeGreaterThan(0);
  });

  it('should display competitor screenshots when available', () => {
    render(
      <CompetitiveAnalysisPanel 
        analysis={mockAnalysisData}
        loading={false}
        error={null}
        onRetry={mockOnRetry}
      />
    );
    
    // Expand the panel
    const expandableHeader = screen.getByText('Competitive Analysis');
    fireEvent.click(expandableHeader);
    
    // Check for screenshots section
    expect(screen.getByText('Competitor Screenshots')).toBeInTheDocument();
    expect(screen.getByAltText('DeWalt screenshot')).toBeInTheDocument();
    expect(screen.getByAltText('Milwaukee screenshot')).toBeInTheDocument();
  });

  it('should handle missing data gracefully', () => {
    render(
      <CompetitiveAnalysisPanel 
        analysis={null}
        loading={false}
        error={null}
        onRetry={mockOnRetry}
      />
    );
    
    expect(screen.getByText('No Analysis Available')).toBeInTheDocument();
    expect(screen.getByText('Competitive analysis data is not yet available. Please wait for the analysis to complete.')).toBeInTheDocument();
  });

  it('should display match confidence with badge', () => {
    render(
      <CompetitiveAnalysisPanel 
        analysis={mockAnalysisData}
        loading={false}
        error={null}
        onRetry={mockOnRetry}
      />
    );
    
    // Expand the panel
    const expandableHeader = screen.getByText('Competitive Analysis');
    fireEvent.click(expandableHeader);
    
    // Check for confidence badge and percentage
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('89%')).toBeInTheDocument();
  });
});