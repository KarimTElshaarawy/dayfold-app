import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import { api } from './api';
import { ApiError } from './errors';
import { buzz } from './format';
import type { Block, Boot, DayView, Stats } from './types';

/** All data is on the device, so there is nothing to retry or keep offline. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 0, gcTime: 1000 * 60 * 10, networkMode: 'always', retry: false, refetchOnWindowFocus: true },
    mutations: { networkMode: 'always' },
  },
});

export const bootQuery = { queryKey: ['boot'], queryFn: () => api<Boot>('GET', '/api/bootstrap') };
export const useBoot = () => useQuery({ ...bootQuery, refetchInterval: 60_000 });
export const useDay = (date: string | undefined) =>
  useQuery({ queryKey: ['plan', date], queryFn: () => api<DayView>('GET', `/api/plan/${date}`), enabled: !!date });
export const useWeek = (start: string | null) =>
  useQuery({ queryKey: ['week', start], queryFn: () => api<DayView[]>('GET', `/api/week?start=${start}`), enabled: !!start, placeholderData: keepPreviousData });
export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('GET', '/api/stats') });

const applyToggle = (day: DayView, id: string, done: boolean): DayView => {
  const blocks = day.blocks.map((b): Block => (b.id === id ? { ...b, status: done ? 'done' : 'planned', doneAt: done ? new Date().toISOString() : null } : b));
  const study = blocks.filter((b) => b.kind === 'study' || b.kind === 'review');
  return {
    ...day,
    blocks,
    done: study.filter((b) => b.status === 'done').length,
    doneMin: study.filter((b) => b.status === 'done').reduce((s, b) => s + b.end - b.start, 0),
  };
};

export const useToggle = (date: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api('PATCH', `/api/blocks/${encodeURIComponent(id)}`, { done }),
    onMutate: async ({ id, done }) => {
      buzz(done ? 12 : 6);
      await qc.cancelQueries({ queryKey: ['plan', date] });
      const prev = qc.getQueryData<DayView>(['plan', date]);
      if (prev) qc.setQueryData(['plan', date], applyToggle(prev, id, done));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (err instanceof ApiError && err.status === 409) toast(err.message);
      if (ctx?.prev) qc.setQueryData(['plan', date], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['plan'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['week'] });
    },
  });
};
