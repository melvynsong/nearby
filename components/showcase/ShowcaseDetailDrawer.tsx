"use client";

import React, { useEffect, useState, useCallback } from "react";
import ShowcasePhotoMosaic from "./ShowcasePhotoMosaic";
import { getShowcaseItemsForCategory } from "@/app/nearby/showcase/[category]/ShowcaseDetailItems.client";
import { attachDistances, ShowcaseItem } from "@/lib/showcase-utils";

interface ShowcaseDetailDrawerProps {
  open: boolean;
  showcaseKey: string | null;
  onClose: () => void;
}

const sortModes = [
  { key: "top", label: "Top Rated" },
  { key: "near", label: "Nearest to Me" },
];

export default function ShowcaseDetailDrawer({ open, showcaseKey, onClose }: ShowcaseDetailDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [sortMode, setSortMode] = useState("top");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Fetch showcase items
  useEffect(() => {
    if (!open || !showcaseKey) return;
    setLoading(true);
    setError(null);
    setItems([]);
    getShowcaseItemsForCategory(showcaseKey)
      .then((result) => {
        setItems(result);
        setLoading(false);
        console.log("[ShowcaseDetailDrawer] fetched items:", result.length);
      })
      .catch((err) => {
        setError("Failed to load showcase items.");
        setLoading(false);
        console.error("[ShowcaseDetailDrawer] fetch error:", err);
      });
  }, [open, showcaseKey]);

  // Geolocation for nearest sort
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
        console.log("[ShowcaseDetailDrawer] got user location");
      },
      (err) => {
        setError("Location permission denied.");
        setUserLocation(null);
        console.warn("[ShowcaseDetailDrawer] location error:", err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Attach distances if needed
  const displayItems = React.useMemo(() => {
    if (sortMode === "near" && userLocation && items.length) {
      return attachDistances(items, userLocation.lat, userLocation.lng).sort(
        (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
      );
    }
    return items;
  }, [items, sortMode, userLocation]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-t-3xl shadow-lg p-0 overflow-y-auto max-h-[90vh] animate-slide-up">
        <div className="flex items-center justify-between px-6 pt-5 pb-2 border-b border-neutral-100">
          <h2 className="text-lg font-bold text-neutral-900">Showcase Details</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-2xl font-bold">×</button>
        </div>
        <div className="flex gap-2 px-6 py-3">
          {sortModes.map((mode) => (
            <button
              key={mode.key}
              className={`rounded-full px-4 py-1 text-xs font-semibold transition-all duration-150 ${
                sortMode === mode.key
                  ? "bg-yellow-400 text-yellow-900 shadow"
                  : "bg-neutral-100 text-neutral-700 hover:bg-yellow-100 hover:text-yellow-700"
              }`}
              onClick={() => {
                setSortMode(mode.key);
                if (mode.key === "near" && !userLocation) requestLocation();
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="px-6 pb-6">
          {loading && <div className="py-8 text-center text-neutral-400">Loading...</div>}
          {error && <div className="py-8 text-center text-red-500">{error}</div>}
          {!loading && !error && !displayItems.length && (
            <div className="py-8 text-center text-neutral-400">No places found for this showcase.</div>
          )}
          {!loading && !error && displayItems.length > 0 && (
            <ShowcasePhotoMosaic items={displayItems} locationMode={sortMode === "near"} />
          )}
        </div>
      </div>
    </div>
  );
}
