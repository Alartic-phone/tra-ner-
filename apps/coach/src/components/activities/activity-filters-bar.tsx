"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/field.tsx";

export type ActivitySort = "date" | "distance" | "hr";

/**
 * Recherche texte + tri du fil d'activités. Pilote l'URL plutôt qu'un état
 * local caché : le filtrage reste server-side (recherche sur tout
 * l'historique, pas seulement les lignes déjà chargées), et l'URL reste
 * partageable/rechargeable.
 *
 * Changer la recherche ou le tri repart de la première page (le paramètre
 * `limit` posé par « charger plus » est retiré) : mélanger un tri différent
 * avec une pagination pensée pour l'ancien n'aurait aucun sens.
 */
export function ActivityFiltersBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("limit");
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParams({ q: value.trim() || null }), 300);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Rechercher une activité…"
        aria-label="Rechercher une activité par nom"
        className="h-8 max-w-[220px] text-xs"
      />
      <Select
        defaultValue={searchParams.get("sort") ?? "date"}
        onChange={(e) => updateParams({ sort: e.target.value === "date" ? null : e.target.value })}
        aria-label="Trier les activités"
        className="h-8 w-auto text-xs"
      >
        <option value="date">Plus récentes</option>
        <option value="distance">Distance</option>
        <option value="hr">FC moyenne</option>
      </Select>
    </div>
  );
}
