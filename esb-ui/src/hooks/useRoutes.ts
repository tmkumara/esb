import { useState, useCallback } from 'react';
import type { Route } from '../types';
import { esbApi } from '../api/esb-api';

interface UseRoutesReturn {
  routes: Route[];
  loading: boolean;
  error: string | null;
  fetchRoutes: () => Promise<void>;
  deleteRoute: (name: string) => Promise<void>;
  reloadRoute: (name: string) => Promise<void>;
  deployRoute: (yaml: string) => Promise<void>;
}

// Mock data for when the server is unavailable
const MOCK_ROUTES: Route[] = [
  {
    name: 'customer-create-route',
    source: { type: 'REST Source', method: 'POST', path: '/api/customers' },
    target: { type: 'SOAP Target', endpointUrl: 'http://crm-service/CustomerService', operation: 'createCustomer' },
    status: 'Started',
    transform: {
      request: { type: 'Jolt Transform' },
      response: { type: 'Jolt Transform' },
    },
  },
  {
    name: 'order-lookup-route',
    source: { type: 'REST Source', method: 'GET', path: '/api/orders/{id}' },
    target: { type: 'HTTP Target', endpointUrl: 'http://order-svc/orders' },
    status: 'Started',
    transform: {
      request: { type: 'Passthrough' },
      response: { type: 'Jolt Transform' },
    },
  },
  {
    name: 'inventory-sync-route',
    source: { type: 'Direct Source', path: 'inventory.sync' },
    target: { type: 'SOAP Target', endpointUrl: 'http://inventory-svc/InventoryService', operation: 'syncInventory' },
    status: 'Stopped',
  },
  {
    name: 'payment-gateway-route',
    source: { type: 'REST Source', method: 'POST', path: '/api/payments' },
    target: { type: 'HTTP Target', endpointUrl: 'https://payment-gateway.example.com/process' },
    status: 'Started',
    transform: {
      request: { type: 'Jolt Transform' },
      response: { type: 'Passthrough' },
    },
  },
  {
    name: 'notification-route',
    source: { type: 'Direct Source', path: 'notification.send' },
    target: { type: 'HTTP Target', endpointUrl: 'http://notification-svc/send' },
    status: 'Suspended',
  },
];

// Backend returns a flat RouteStatusView — convert to the nested Route shape the UI expects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRoute(raw: any): Route {
  // Already nested (mock data or future API upgrade)
  if (raw.source && typeof raw.source === 'object') return raw as Route;

  // Flat shape from LiveRouteRegistry.RouteStatusView
  const reqType = raw.requestTransformType as string | null;
  const resType = raw.responseTransformType as string | null;
  return {
    name:   raw.name ?? 'unknown',
    status: raw.status ?? 'Stopped',
    source: {
      type:   raw.sourceType   ?? 'rest',
      method: raw.sourceMethod ?? undefined,
      path:   raw.sourcePath   ?? undefined,
    },
    target: {
      type:        raw.targetType        ?? 'http',
      endpointUrl: raw.targetEndpointUrl ?? undefined,
      operation:   raw.targetOperation   ?? undefined,
    },
    transform: (reqType || resType) ? {
      request:  reqType ? { type: reqType }  : undefined,
      response: resType ? { type: resType } : undefined,
    } : undefined,
  };
}

export function useRoutes(): UseRoutesReturn {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await esbApi.getRoutes();
      const data = response.data;
      if (Array.isArray(data)) {
        setRoutes(data.map(normalizeRoute));
      } else if (data?.routes && Array.isArray(data.routes)) {
        setRoutes(data.routes.map(normalizeRoute));
      } else {
        setRoutes(MOCK_ROUTES);
      }
    } catch {
      // Fall back to mock data when server is unavailable
      setRoutes(MOCK_ROUTES);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteRoute = useCallback(async (name: string) => {
    await esbApi.deleteRoute(name);
    setRoutes((prev) => prev.filter((r) => r.name !== name));
  }, []);

  const reloadRoute = useCallback(async (name: string) => {
    await esbApi.reloadRoute(name);
    // Refresh routes after reload
    await fetchRoutes();
  }, [fetchRoutes]);

  const deployRoute = useCallback(async (yaml: string) => {
    await esbApi.deployRoute(yaml);
    await fetchRoutes();
  }, [fetchRoutes]);

  return {
    routes,
    loading,
    error,
    fetchRoutes,
    deleteRoute,
    reloadRoute,
    deployRoute,
  };
}
