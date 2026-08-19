import { useEffect, useMemo, useState } from "react";

/**
 * Bind the dashboard top-bar search to page-local list filters.
 * Pass `headerSearch` to DashboardLayout and use `search` in your filter logic.
 */
export function useDashboardSearch(initialPlaceholder = "Search anything…") {
  const [search, setSearch] = useState("");
  const [placeholder, setPlaceholder] = useState(initialPlaceholder);

  useEffect(() => {
    setSearch("");
    setPlaceholder(initialPlaceholder);
  }, [initialPlaceholder]);

  const headerSearch = useMemo(
    () => ({
      value: search,
      onChange: setSearch,
      placeholder,
    }),
    [search, placeholder],
  );

  return { search, setSearch, placeholder, setPlaceholder, headerSearch };
}
