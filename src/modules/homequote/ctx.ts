import { createContext, useContext } from 'react';
import type { Account, Carrier, Property } from '@/lib/types';
import type { HomeWorkflow, Issue } from './model';

/** State and actions shared by the Home quoting workflow's steps. */
export type HomeCtx = {
  w: HomeWorkflow;
  up: (fn: (w: HomeWorkflow) => HomeWorkflow) => void;
  issues: Map<string, string>;
  allIssues: Issue[];
  account: Account;
  property: Property | null;
  homeCarriers: Carrier[];
  hidePrefilled: boolean;
  go: (view: string, field?: string) => void;
};

export const HomeCtxValue = createContext<HomeCtx | null>(null);
export function useHome() {
  const c = useContext(HomeCtxValue);
  if (!c) throw new Error('useHome outside the home workflow');
  return c;
}
