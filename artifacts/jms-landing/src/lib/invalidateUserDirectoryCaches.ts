import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDashboardStatsQueryKey,
  getGetDashboardSupervisorQueryKey,
  getListAssignableUsersQueryKey,
  getListJobsQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";

/** Refresh cached user lists and screens that show assignee/supervisor names. */
export async function invalidateUserDirectoryCaches(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: getListUsersQueryKey() }),
    qc.invalidateQueries({ queryKey: getListAssignableUsersQueryKey() }),
    qc.invalidateQueries({ queryKey: getListJobsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetDashboardSupervisorQueryKey() }),
  ]);
}
