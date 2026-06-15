// Hooks de datos con TanStack Query. Reemplaza el viejo refreshData(scope):
// cada dataset tiene su query key y la invalidación se hace por scope.
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchers } from './api';
import { createEmptyReporting } from './utils';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function useContacts() {
  return useQuery({ queryKey: ['contacts'], queryFn: fetchers.contacts, placeholderData: [] });
}
export function useSummary() {
  return useQuery({
    queryKey: ['summary'],
    queryFn: fetchers.summary,
    placeholderData: {
      total_contacts: 0, total_companies: 0, priority_contacts: 0,
      review_contacts: 0, imports_count: 0, draft_imports: 0, confirmed_imports: 0,
    },
  });
}
export function useReporting() {
  return useQuery({
    queryKey: ['reporting'],
    queryFn: fetchers.reporting,
    placeholderData: createEmptyReporting(),
  });
}
export function useImports() {
  return useQuery({ queryKey: ['imports'], queryFn: fetchers.imports, placeholderData: [] });
}
export function useCapabilities() {
  return useQuery({
    queryKey: ['capabilities'],
    queryFn: fetchers.capabilities,
    placeholderData: { openai_enabled: false, providers: [] },
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
}
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: fetchers.templates,
    placeholderData: [],
    staleTime: 5 * 60_000,
  });
}
export function useCvFiles() {
  return useQuery({
    queryKey: ['cvFiles'],
    queryFn: fetchers.cvFiles,
    placeholderData: [],
    staleTime: 5 * 60_000,
  });
}
export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: fetchers.schedules,
    placeholderData: [],
    staleTime: 10 * 60_000,
  });
}
export function useEmailJobs() {
  return useQuery({ queryKey: ['emailJobs'], queryFn: fetchers.emailJobs, placeholderData: [] });
}
export function useGmailStatus() {
  return useQuery({
    queryKey: ['gmailStatus'],
    queryFn: fetchers.gmailStatus,
    placeholderData: { authorized: false, has_readonly: false },
    staleTime: 2 * 60_000,
  });
}
export function useTemplateStats() {
  return useQuery({
    queryKey: ['templateStats'],
    queryFn: fetchers.templateStats,
    placeholderData: { templates: [], totals: { sent: 0, replied: 0, response_rate: 0, bounced_contacts: 0 } },
  });
}

// Mapa scope → query keys (compatible con el viejo refreshData(scope))
const SCOPE_KEYS = {
  jobs: [['emailJobs'], ['gmailStatus']],
  cvs: [['cvFiles']],
  templates: [['templates']],
  schedules: [['schedules']],
  contacts: [['contacts'], ['summary'], ['reporting'], ['templateStats']],
};

export function useRefresh() {
  const client = useQueryClient();
  return async function refresh(scope = 'all') {
    const keys = SCOPE_KEYS[scope];
    if (keys) {
      await Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: key })));
      return;
    }
    await client.invalidateQueries();
  };
}
