import { Registry, Histogram, Counter, collectDefaultMetrics } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

/**
 * Prometheus instrumentation for the API.
 *
 * One process-wide registry. Default Node/process metrics (event-loop lag, heap,
 * GC, CPU, open handles) plus per-request HTTP duration/count are collected on
 * each scrape. The endpoint is exposed at GET /metrics and scraped over the
 * private docker network (backend:5000/metrics) -- the edge proxy never routes
 * it to the public internet.
 */
export const register = new Registry();
register.setDefaultLabels({ app: 'carbonytics-backend' });
collectDefaultMetrics({ register });

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Times every request and records method/route/status. `route` uses the matched
 * Express route pattern (e.g. /api/calculations/:id) so label cardinality stays
 * bounded; unmatched paths collapse to "unmatched".
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    stopTimer(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
}

/** GET /metrics — Prometheus scrape endpoint (internal network only). */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
