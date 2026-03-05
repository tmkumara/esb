// Route types
export type RouteStatus = 'Started' | 'Stopped' | 'Suspended';

export interface Route {
  name: string;
  source: {
    type: string;
    method?: string;
    path?: string;
  };
  target: {
    type: string;
    endpointUrl?: string;
    operation?: string;
  };
  status: RouteStatus;
  transform?: {
    request?: { type: string };
    response?: { type: string };
  };
}

export interface RouteSpec {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
  };
  source: {
    type: string;
    method?: string;
    path?: string;
  };
  target: {
    type: string;
    endpointUrl?: string;
    operation?: string;
    timeout?: number;
  };
  transform?: {
    request?: { type: string; spec?: object };
    response?: { type: string; spec?: object };
  };
  interceptors?: Array<{
    type: string;
    config?: object;
  }>;
}

// Validation types
export type ValidationLayer = 'STRUCTURAL' | 'SCHEMA' | 'SEMANTIC';
export type ValidationStatus = 'PASS' | 'FAIL' | 'WARN';

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}

export interface ValidationLayerResult {
  layer: ValidationLayer;
  status: ValidationStatus;
  issues: ValidationIssue[];
}

export interface ValidationResult {
  valid: boolean;
  layers: ValidationLayerResult[];
  summary?: string;
}

// Monitoring types
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export interface LogEntry {
  id: string;
  timestamp: string;
  correlationId: string;
  route: string;
  level: LogLevel;
  message: string;
}

// React Flow node types
export type NodeType = 'source' | 'transform' | 'target' | 'interceptor';

export type SourceType = 'REST Source' | 'Direct Source';
export type TargetType = 'SOAP Target' | 'HTTP Target';
export type TransformType = 'Jolt Transform' | 'Passthrough';
export type InterceptorType = 'Correlation' | 'Error Handler' | 'Retry';

export interface SourceNodeData {
  label: string;
  sourceType: SourceType;
  method: string;
  path: string;
}

export interface TargetNodeData {
  label: string;
  targetType: TargetType;
  endpointUrl: string;
  operation?: string;
  timeout?: number;
}

export interface TransformNodeData {
  label: string;
  transformType: TransformType;
  joltSpec?: string;
}

export interface InterceptorNodeData {
  label: string;
  interceptorType: InterceptorType;
  config?: Record<string, string | number | boolean>;
}

export type CanvasNodeData =
  | SourceNodeData
  | TargetNodeData
  | TransformNodeData
  | InterceptorNodeData;

// Dashboard types
export interface StatCard {
  title: string;
  value: number;
  trend: number;
  trendUp: boolean;
  icon: string;
  color: string;
}

export interface RecentRoute {
  name: string;
  accessedAt: string;
  status: RouteStatus;
}

export interface FavoriteRoute {
  name: string;
  status: RouteStatus;
}

// Health types
export interface HealthStatus {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  routes: {
    total: number;
    started: number;
    stopped: number;
    suspended: number;
  };
}

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

// Component palette item
export interface PaletteItem {
  type: NodeType;
  subType: string;
  label: string;
  description: string;
  color: string;
}
