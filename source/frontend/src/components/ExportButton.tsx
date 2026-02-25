/**
 * @fileoverview ExportButton component for PDF export functionality.
 * 
 * Provides a button to export pricing analysis results as a professionally
 * formatted PDF document. Includes all sections: product details, final
 * recommendations, demand analysis, competitive analysis, and margin analysis.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import React, { useState } from 'react';
import { Button, Box } from '@cloudscape-design/components';
import jsPDF from 'jspdf';
import { formatPrice } from '../types/product-types';

/**
 * Product data interface for PDF export.
 */
interface ProductData {
  product_id: string;
  category: string;
  subcategory: string;
  role: string;
  vendor: string;
  cost: number;
  MSRP: number;
  MAP: number;
  yearTarget: number;
  features: string[];
  imageUrl: string;
  attributes?: Record<string, any>;
}

/**
 * Demand forecast data interface for PDF export.
 */
interface DemandForecastData {
  recommendedPrice?: number;
  priceFloor?: number;
  priceCeiling?: number;
  confidence?: number;
  confidenceIntervals?: {
    p10: number;
    p50: number;
    p90: number;
  };
  rationale?: string;
}

/**
 * Competitive analysis data interface for PDF export.
 */
interface CompetitiveAnalysisData {
  lowest_market_price?: number;
  highest_market_price?: number;
  average_market_price?: number;
  median_market_price?: number;
  primary_competitor?: string;
  competitive_confidence_score?: number;
  competitor_price_point?: number;
  market_position_assessment?: string;
  recommended_base_price?: number;
  price_position_strategy?: string;
}

/**
 * Margin analysis data interface for PDF export.
 */
interface MarginAnalysisData {
  suggestedPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  calculatedMargin?: number;
  baseMarginRate?: number;
  adjustedMarginRate?: number;
  mapCompliant?: boolean;
  marginCompliant?: boolean;
  requiresReview?: boolean;
  reviewReason?: string;
}

/**
 * Final recommendations data interface for PDF export.
 */
interface FinalRecommendationsData {
  suggestedPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  confidence: number;
  mapCompliant: boolean;
  marginCompliant: boolean;
  requiresReview: boolean;
  reviewReason?: string;
}

/**
 * Props for ExportButton component.
 */
export interface ExportButtonProps {
  /** Product details */
  product: ProductData | null;
  
  /** Demand analysis results */
  demandAnalysis: DemandForecastData | null;
  
  /** Competitive analysis results */
  competitiveAnalysis: CompetitiveAnalysisData | null;
  
  /** Margin analysis results */
  marginAnalysis: MarginAnalysisData | null;
  
  /** Final recommendations */
  finalRecommendations: FinalRecommendationsData | null;
  
  /** Optional session ID for filename */
  sessionId?: string;
}

/**
 * ExportButton component.
 * 
 * Generates and downloads a PDF report of pricing analysis results with
 * professional formatting including headers, footers, and organized sections.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const ExportButton: React.FC<ExportButtonProps> = ({
  product,
  demandAnalysis,
  competitiveAnalysis,
  marginAnalysis,
  finalRecommendations,
  sessionId
}) => {
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Generates the PDF filename with product ID and date.
   * Format: pricing-analysis-{productId}-{date}.pdf
   * 
   * Requirement: 12.5
   */
  const generateFilename = (): string => {
    const productId = product?.product_id || 'unknown';
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    return `pricing-analysis-${productId}-${date}.pdf`;
  };

  /**
   * Adds a header to the PDF page.
   * 
   * @param doc - jsPDF document instance
   * @param pageNumber - Current page number
   */
  const addHeader = (doc: jsPDF, pageNumber: number) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header background
    doc.setFillColor(0, 87, 184); // AWS blue
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    // Header text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Pricing Analysis Report', 15, 15);
    
    // Page number
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${pageNumber}`, pageWidth - 30, 15);
  };

  /**
   * Adds a footer to the PDF page.
   * 
   * @param doc - jsPDF document instance
   */
  const addFooter = (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Footer line
    doc.setDrawColor(200, 200, 200);
    doc.line(15, pageHeight - 20, pageWidth - 15, pageHeight - 20);
    
    // Footer text
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const timestamp = new Date().toLocaleString();
    doc.text(`Generated: ${timestamp}`, 15, pageHeight - 12);
    doc.text('Retail Pricing Agent Orchestrator', pageWidth - 15, pageHeight - 12, { align: 'right' });
  };

  /**
   * Adds a section header to the PDF.
   * 
   * @param doc - jsPDF document instance
   * @param title - Section title
   * @param yPosition - Y position for the section
   * @returns New Y position after the section header
   */
  const addSectionHeader = (doc: jsPDF, title: string, yPosition: number): number => {
    doc.setFillColor(240, 240, 240);
    doc.rect(15, yPosition, doc.internal.pageSize.getWidth() - 30, 10, 'F');
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 20, yPosition + 7);
    
    return yPosition + 15;
  };

  /**
   * Adds a key-value pair to the PDF.
   * 
   * @param doc - jsPDF document instance
   * @param key - Label text
   * @param value - Value text
   * @param yPosition - Y position
   * @returns New Y position
   */
  const addKeyValue = (doc: jsPDF, key: string, value: string, yPosition: number): number => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    doc.text(`${key}:`, 20, yPosition);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(value, 80, yPosition);
    
    return yPosition + 6;
  };

  /**
   * Adds wrapped text to the PDF.
   * 
   * @param doc - jsPDF document instance
   * @param text - Text to wrap
   * @param yPosition - Y position
   * @param maxWidth - Maximum width for text
   * @returns New Y position
   */
  const addWrappedText = (doc: jsPDF, text: string, yPosition: number, maxWidth: number = 170): number => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, 20, yPosition);
    
    return yPosition + (lines.length * 5) + 3;
  };

  /**
   * Checks if a new page is needed and adds one if necessary.
   * 
   * @param doc - jsPDF document instance
   * @param currentY - Current Y position
   * @param requiredSpace - Required space for next content
   * @param pageNumber - Current page number
   * @returns Object with new Y position and page number
   */
  const checkPageBreak = (
    doc: jsPDF,
    currentY: number,
    requiredSpace: number,
    pageNumber: number
  ): { y: number; page: number } => {
    const pageHeight = doc.internal.pageSize.getHeight();
    
    if (currentY + requiredSpace > pageHeight - 30) {
      doc.addPage();
      pageNumber++;
      addHeader(doc, pageNumber);
      addFooter(doc);
      return { y: 35, page: pageNumber };
    }
    
    return { y: currentY, page: pageNumber };
  };

  /**
   * Generates and downloads the PDF report.
   * 
   * Requirements: 12.2, 12.3, 12.4, 12.5
   */
  const handleExport = async () => {
    if (!product) {
      console.error('Cannot export: No product data available');
      return;
    }

    setIsExporting(true);

    try {
      // Create new PDF document
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      let currentY = 35;
      let pageNumber = 1;

      // Add header and footer to first page
      addHeader(doc, pageNumber);
      addFooter(doc);

      // ===== PRODUCT DETAILS SECTION =====
      currentY = addSectionHeader(doc, '1. Product Details', currentY);
      currentY = addKeyValue(doc, 'Product ID', product.product_id, currentY);
      currentY = addKeyValue(doc, 'Category', `${product.category} / ${product.subcategory}`, currentY);
      currentY = addKeyValue(doc, 'Vendor', product.vendor, currentY);
      currentY = addKeyValue(doc, 'Role', product.role.toUpperCase(), currentY);
      currentY = addKeyValue(doc, 'Cost', formatPrice(product.cost), currentY);
      currentY = addKeyValue(doc, 'MSRP', formatPrice(product.MSRP), currentY);
      currentY = addKeyValue(doc, 'MAP', formatPrice(product.MAP), currentY);
      currentY += 5;

      // Product features
      if (product.features && product.features.length > 0) {
        ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 30, pageNumber));
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Key Features:', 20, currentY);
        currentY += 6;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        product.features.forEach((feature, index) => {
          ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 10, pageNumber));
          doc.text(`• ${feature}`, 25, currentY);
          currentY += 5;
        });
        currentY += 5;
      }

      // ===== FINAL RECOMMENDATIONS SECTION =====
      if (finalRecommendations) {
        ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 50, pageNumber));
        
        currentY = addSectionHeader(doc, '2. Final Recommendations', currentY);
        
        // Suggested price (prominent)
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Suggested Price:', 20, currentY);
        doc.setFontSize(18);
        doc.setTextColor(3, 127, 12); // Green for compliant
        doc.text(formatPrice(finalRecommendations.suggestedPrice), 80, currentY);
        currentY += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        currentY = addKeyValue(doc, 'Price Range', 
          `${formatPrice(finalRecommendations.priceRange.min)} - ${formatPrice(finalRecommendations.priceRange.max)}`, 
          currentY);
        currentY = addKeyValue(doc, 'Confidence Score', `${finalRecommendations.confidence}%`, currentY);
        currentY = addKeyValue(doc, 'MAP Compliant', finalRecommendations.mapCompliant ? 'Yes' : 'No', currentY);
        currentY = addKeyValue(doc, 'Margin Compliant', finalRecommendations.marginCompliant ? 'Yes' : 'No', currentY);
        currentY = addKeyValue(doc, 'Requires Review', finalRecommendations.requiresReview ? 'Yes' : 'No', currentY);
        
        if (finalRecommendations.reviewReason) {
          currentY += 3;
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Review Reason:', 20, currentY);
          currentY += 5;
          currentY = addWrappedText(doc, finalRecommendations.reviewReason, currentY);
        }
        currentY += 5;
      }

      // ===== DEMAND ANALYSIS SECTION =====
      if (demandAnalysis) {
        ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 50, pageNumber));
        
        currentY = addSectionHeader(doc, '3. Demand Analysis', currentY);
        
        if (demandAnalysis.recommendedPrice !== undefined) {
          currentY = addKeyValue(doc, 'Recommended Price', formatPrice(demandAnalysis.recommendedPrice), currentY);
        }
        if (demandAnalysis.priceFloor !== undefined) {
          currentY = addKeyValue(doc, 'Price Floor', formatPrice(demandAnalysis.priceFloor), currentY);
        }
        if (demandAnalysis.priceCeiling !== undefined) {
          currentY = addKeyValue(doc, 'Price Ceiling', formatPrice(demandAnalysis.priceCeiling), currentY);
        }
        if (demandAnalysis.confidence !== undefined) {
          currentY = addKeyValue(doc, 'Confidence', `${demandAnalysis.confidence}%`, currentY);
        }
        
        if (demandAnalysis.confidenceIntervals) {
          currentY += 3;
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Confidence Intervals:', 20, currentY);
          currentY += 6;
          
          currentY = addKeyValue(doc, 'P10', formatPrice(demandAnalysis.confidenceIntervals.p10), currentY);
          currentY = addKeyValue(doc, 'P50', formatPrice(demandAnalysis.confidenceIntervals.p50), currentY);
          currentY = addKeyValue(doc, 'P90', formatPrice(demandAnalysis.confidenceIntervals.p90), currentY);
        }
        
        if (demandAnalysis.rationale) {
          ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 30, pageNumber));
          
          currentY += 3;
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Rationale:', 20, currentY);
          currentY += 5;
          currentY = addWrappedText(doc, demandAnalysis.rationale, currentY);
        }
        currentY += 5;
      }

      // ===== COMPETITIVE ANALYSIS SECTION =====
      if (competitiveAnalysis) {
        ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 50, pageNumber));
        
        currentY = addSectionHeader(doc, '4. Competitive Analysis', currentY);
        
        // Market statistics
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Market Price Statistics:', 20, currentY);
        currentY += 6;
        
        if (competitiveAnalysis.lowest_market_price !== undefined) {
          currentY = addKeyValue(doc, 'Lowest Price', formatPrice(competitiveAnalysis.lowest_market_price), currentY);
        }
        if (competitiveAnalysis.highest_market_price !== undefined) {
          currentY = addKeyValue(doc, 'Highest Price', formatPrice(competitiveAnalysis.highest_market_price), currentY);
        }
        if (competitiveAnalysis.average_market_price !== undefined) {
          currentY = addKeyValue(doc, 'Average Price', formatPrice(competitiveAnalysis.average_market_price), currentY);
        }
        if (competitiveAnalysis.median_market_price !== undefined) {
          currentY = addKeyValue(doc, 'Median Price', formatPrice(competitiveAnalysis.median_market_price), currentY);
        }
        
        currentY += 3;
        
        // Primary competitor
        if (competitiveAnalysis.primary_competitor) {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Primary Competitor:', 20, currentY);
          currentY += 6;
          
          currentY = addKeyValue(doc, 'Competitor', competitiveAnalysis.primary_competitor, currentY);
          if (competitiveAnalysis.competitor_price_point !== undefined) {
            currentY = addKeyValue(doc, 'Price Point', formatPrice(competitiveAnalysis.competitor_price_point), currentY);
          }
          if (competitiveAnalysis.competitive_confidence_score !== undefined) {
            currentY = addKeyValue(doc, 'Match Confidence', `${competitiveAnalysis.competitive_confidence_score}%`, currentY);
          }
          currentY += 3;
        }
        
        // Market position
        if (competitiveAnalysis.market_position_assessment) {
          ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 30, pageNumber));
          
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Market Position:', 20, currentY);
          currentY += 5;
          currentY = addWrappedText(doc, competitiveAnalysis.market_position_assessment, currentY);
          currentY += 3;
        }
        
        // Pricing strategy
        if (competitiveAnalysis.price_position_strategy) {
          ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 30, pageNumber));
          
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Pricing Strategy:', 20, currentY);
          currentY += 5;
          currentY = addWrappedText(doc, competitiveAnalysis.price_position_strategy, currentY);
        }
        currentY += 5;
      }

      // ===== MARGIN ANALYSIS SECTION =====
      if (marginAnalysis) {
        ({ y: currentY, page: pageNumber } = checkPageBreak(doc, currentY, 50, pageNumber));
        
        currentY = addSectionHeader(doc, '5. Margin Analysis', currentY);
        
        if (marginAnalysis.suggestedPrice !== undefined) {
          currentY = addKeyValue(doc, 'Suggested Price', formatPrice(marginAnalysis.suggestedPrice), currentY);
        }
        if (marginAnalysis.minPrice !== undefined) {
          currentY = addKeyValue(doc, 'Minimum Price', formatPrice(marginAnalysis.minPrice), currentY);
        }
        if (marginAnalysis.maxPrice !== undefined) {
          currentY = addKeyValue(doc, 'Maximum Price', formatPrice(marginAnalysis.maxPrice), currentY);
        }
        if (marginAnalysis.calculatedMargin !== undefined) {
          currentY = addKeyValue(doc, 'Calculated Margin', `${(marginAnalysis.calculatedMargin * 100).toFixed(2)}%`, currentY);
        }
        if (marginAnalysis.baseMarginRate !== undefined) {
          currentY = addKeyValue(doc, 'Base Margin Rate', `${(marginAnalysis.baseMarginRate * 100).toFixed(2)}%`, currentY);
        }
        if (marginAnalysis.adjustedMarginRate !== undefined) {
          currentY = addKeyValue(doc, 'Adjusted Margin Rate', `${(marginAnalysis.adjustedMarginRate * 100).toFixed(2)}%`, currentY);
        }
        
        currentY += 3;
        
        // Compliance status
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Compliance Status:', 20, currentY);
        currentY += 6;
        
        currentY = addKeyValue(doc, 'MAP Compliant', marginAnalysis.mapCompliant ? 'Yes' : 'No', currentY);
        currentY = addKeyValue(doc, 'Margin Compliant', marginAnalysis.marginCompliant ? 'Yes' : 'No', currentY);
        currentY = addKeyValue(doc, 'Requires Review', marginAnalysis.requiresReview ? 'Yes' : 'No', currentY);
        
        if (marginAnalysis.reviewReason) {
          currentY += 3;
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Review Reason:', 20, currentY);
          currentY += 5;
          currentY = addWrappedText(doc, marginAnalysis.reviewReason, currentY);
        }
      }

      // Generate filename and trigger download
      const filename = generateFilename();
      doc.save(filename);

      console.log(`PDF exported successfully: ${filename}`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Disable button if no product data is available
  const isDisabled = !product || isExporting;

  return (
    <Button
      variant="primary"
      iconName="download"
      onClick={handleExport}
      loading={isExporting}
      disabled={isDisabled}
      ariaLabel="Export pricing analysis as PDF"
    >
      {isExporting ? 'Exporting...' : 'Export PDF'}
    </Button>
  );
};
