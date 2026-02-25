/**
 * @fileoverview Performance monitoring utilities.
 * 
 * Provides utilities for monitoring and measuring performance metrics
 * including FPS, render times, and memory usage.
 * 
 * Performance monitoring (Requirement 15.4)
 */

/**
 * Performance metrics interface.
 */
export interface PerformanceMetrics {
  /** Frames per second */
  fps: number;
  /** Average frame time in milliseconds */
  frameTime: number;
  /** Memory usage in MB (if available) */
  memoryUsage?: number;
  /** Number of renders */
  renderCount: number;
}

/**
 * FPS monitor class for tracking frame rate.
 */
export class FPSMonitor {
  private frames: number = 0;
  private lastTime: number = performance.now();
  private fps: number = 60;
  private frameTime: number = 16.67;
  private animationFrameId: number | null = null;
  private callback?: (metrics: PerformanceMetrics) => void;

  /**
   * Starts monitoring FPS.
   * 
   * @param callback - Callback function to receive metrics
   */
  start(callback?: (metrics: PerformanceMetrics) => void): void {
    this.callback = callback;
    this.frames = 0;
    this.lastTime = performance.now();
    this.tick();
  }

  /**
   * Stops monitoring FPS.
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Gets current FPS.
   * 
   * @returns Current FPS value
   */
  getFPS(): number {
    return this.fps;
  }

  /**
   * Gets current frame time.
   * 
   * @returns Current frame time in milliseconds
   */
  getFrameTime(): number {
    return this.frameTime;
  }

  /**
   * Tick function for animation frame.
   */
  private tick = (): void => {
    this.frames++;
    const currentTime = performance.now();
    const elapsed = currentTime - this.lastTime;

    // Update FPS every second
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frames * 1000) / elapsed);
      this.frameTime = elapsed / this.frames;
      this.frames = 0;
      this.lastTime = currentTime;

      // Call callback with metrics
      if (this.callback) {
        this.callback(this.getMetrics());
      }
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  /**
   * Gets current performance metrics.
   * 
   * @returns Performance metrics
   */
  private getMetrics(): PerformanceMetrics {
    const metrics: PerformanceMetrics = {
      fps: this.fps,
      frameTime: this.frameTime,
      renderCount: this.frames
    };

    // Add memory usage if available
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      metrics.memoryUsage = Math.round(memory.usedJSHeapSize / 1048576); // Convert to MB
    }

    return metrics;
  }
}

/**
 * Render time tracker for measuring component render performance.
 */
export class RenderTimeTracker {
  private renderTimes: Map<string, number[]> = new Map();
  private maxSamples: number = 100;

  /**
   * Starts tracking render time for a component.
   * 
   * @param componentName - Name of the component
   * @returns Start time
   */
  startRender(componentName: string): number {
    return performance.now();
  }

  /**
   * Ends tracking render time for a component.
   * 
   * @param componentName - Name of the component
   * @param startTime - Start time from startRender
   */
  endRender(componentName: string, startTime: number): void {
    const endTime = performance.now();
    const renderTime = endTime - startTime;

    // Get or create array for this component
    let times = this.renderTimes.get(componentName);
    if (!times) {
      times = [];
      this.renderTimes.set(componentName, times);
    }

    // Add render time
    times.push(renderTime);

    // Keep only last N samples
    if (times.length > this.maxSamples) {
      times.shift();
    }
  }

  /**
   * Gets average render time for a component.
   * 
   * @param componentName - Name of the component
   * @returns Average render time in milliseconds
   */
  getAverageRenderTime(componentName: string): number {
    const times = this.renderTimes.get(componentName);
    if (!times || times.length === 0) {
      return 0;
    }

    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  /**
   * Gets all render time statistics.
   * 
   * @returns Map of component names to average render times
   */
  getAllStats(): Map<string, number> {
    const stats = new Map<string, number>();
    
    for (const [componentName, times] of this.renderTimes) {
      if (times.length > 0) {
        const sum = times.reduce((acc, time) => acc + time, 0);
        stats.set(componentName, sum / times.length);
      }
    }

    return stats;
  }

  /**
   * Clears all render time data.
   */
  clear(): void {
    this.renderTimes.clear();
  }
}

/**
 * Performance observer for monitoring long tasks.
 */
export class LongTaskObserver {
  private observer: PerformanceObserver | null = null;
  private longTasks: PerformanceEntry[] = [];
  private callback?: (task: PerformanceEntry) => void;

  /**
   * Starts observing long tasks.
   * 
   * @param callback - Callback function to receive long task entries
   */
  start(callback?: (task: PerformanceEntry) => void): void {
    if (!('PerformanceObserver' in window)) {
      console.warn('PerformanceObserver not supported');
      return;
    }

    this.callback = callback;

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push(entry);
          
          if (this.callback) {
            this.callback(entry);
          }

          // Log warning for tasks over 50ms
          if (entry.duration > 50) {
            console.warn(`Long task detected: ${entry.duration.toFixed(2)}ms`, entry);
          }
        }
      });

      this.observer.observe({ entryTypes: ['longtask'] });
    } catch (error) {
      console.warn('Failed to observe long tasks:', error);
    }
  }

  /**
   * Stops observing long tasks.
   */
  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Gets all recorded long tasks.
   * 
   * @returns Array of long task entries
   */
  getLongTasks(): PerformanceEntry[] {
    return this.longTasks;
  }

  /**
   * Clears all recorded long tasks.
   */
  clear(): void {
    this.longTasks = [];
  }
}

/**
 * Global performance monitor instance.
 */
export const performanceMonitor = {
  fpsMonitor: new FPSMonitor(),
  renderTimeTracker: new RenderTimeTracker(),
  longTaskObserver: new LongTaskObserver()
};

/**
 * Logs performance metrics to console (development only).
 * 
 * @param metrics - Performance metrics to log
 */
export function logPerformanceMetrics(metrics: PerformanceMetrics): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('Performance Metrics:', {
      fps: `${metrics.fps} FPS`,
      frameTime: `${metrics.frameTime.toFixed(2)}ms`,
      memoryUsage: metrics.memoryUsage ? `${metrics.memoryUsage}MB` : 'N/A',
      renderCount: metrics.renderCount
    });

    // Warn if FPS is below 60
    if (metrics.fps < 60) {
      console.warn(`Low FPS detected: ${metrics.fps} FPS (target: 60 FPS)`);
    }

    // Warn if frame time is above 16.67ms (60 FPS threshold)
    if (metrics.frameTime > 16.67) {
      console.warn(`High frame time detected: ${metrics.frameTime.toFixed(2)}ms (target: <16.67ms)`);
    }
  }
}

/**
 * Measures the execution time of a function.
 * 
 * @param name - Name of the measurement
 * @param fn - Function to measure
 * @returns Result of the function
 */
export async function measureExecutionTime<T>(
  name: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const startTime = performance.now();
  
  try {
    const result = await fn();
    const endTime = performance.now();
    const duration = endTime - startTime;

    if (process.env.NODE_ENV === 'development') {
      console.log(`${name} took ${duration.toFixed(2)}ms`);
    }

    return result;
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    if (process.env.NODE_ENV === 'development') {
      console.error(`${name} failed after ${duration.toFixed(2)}ms`, error);
    }

    throw error;
  }
}
