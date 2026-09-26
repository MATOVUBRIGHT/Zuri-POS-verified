import { useEffect, useState } from "react";

// Non-standard API interfaces
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

interface NetworkInformation extends EventTarget {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  onchange: EventListener;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}

// Performance monitoring service
export class PerformanceMonitor {
  private metrics: Array<{
    name: string;
    value: number;
    timestamp: number;
  }> = [];
  private marks: Record<string, number> = {};
  private measures: Record<string, number> = {};

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Set up performance monitoring
    if (window.performance) {
      // Mark initial load time
      this.mark("appStart");

      // Listen for navigation timing
      window.addEventListener("load", () => {
        this.mark("pageLoaded");
        this.measure("timeToLoad", "appStart", "pageLoaded");
      });
    }
  }

  // Mark a performance timestamp
  public mark(name: string) {
    this.marks[name] = performance.now();
    this.logMetric(`${name}_mark`, performance.now());
  }

  // Measure time between two marks
  public measure(name: string, startMark: string, endMark: string) {
    if (this.marks[startMark] && this.marks[endMark]) {
      const duration = this.marks[endMark] - this.marks[startMark];
      this.measures[name] = duration;
      this.logMetric(`${name}_duration`, duration);
      return duration;
    }
    return 0;
  }

  // Log a performance metric
  public logMetric(name: string, value: number) {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now()
    });

    // Store in localStorage for analytics
    try {
      const storedMetrics = JSON.parse(localStorage.getItem("performanceMetrics") || "[]");
      storedMetrics.push({ name, value, timestamp: Date.now() });
      localStorage.setItem("performanceMetrics", JSON.stringify(storedMetrics.slice(-100))); // Keep last 100
    } catch (error) {
      console.error("Failed to store performance metric:", error);
    }
  }

  // Get all metrics
  public getMetrics() {
    return [...this.metrics];
  }

  // Get marks
  public getMarks() {
    return { ...this.marks };
  }

  // Get measures
  public getMeasures() {
    return { ...this.measures };
  }

  // Clear metrics
  public clearMetrics() {
    this.metrics = [];
    this.marks = {};
    this.measures = {};
    localStorage.removeItem("performanceMetrics");
  }

  // Track navigation performance
  public trackNavigation(url: string) {
    this.mark(`navigationStart_${url}`);
  }

  // Track API call performance
  public trackApiCall(apiName: string, startTime: number) {
    const duration = performance.now() - startTime;
    this.logMetric(`${apiName}_api_duration`, duration);
  }

  // Track component render time
  public trackComponentRender(componentName: string, startTime: number) {
    const duration = performance.now() - startTime;
    this.logMetric(`${componentName}_render_duration`, duration);
  }

  // Get performance score (0-100)
  public getPerformanceScore() {
    // Calculate score based on key metrics
    const loadTime = this.measures["timeToLoad"] || 0;
    const score = Math.max(0, 100 - (loadTime / 10)); // 10ms = 1% penalty

    return Math.min(100, Math.round(score));
  }

  // Send metrics to analytics (placeholder)
  public async sendMetricsToAnalytics() {
    try {
      const metrics = this.getMetrics();
      if (metrics.length === 0) return;

      // In a real app, this would send to your analytics service
      if (import.meta.env.DEV) console.log("Sending performance metrics to analytics:", metrics);

      // Clear metrics after sending
      this.clearMetrics();

    } catch (error) {
      console.error("Failed to send performance metrics:", error);
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();
