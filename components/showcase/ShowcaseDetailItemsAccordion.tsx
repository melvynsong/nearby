"use client";
import React, { useEffect, useState, useCallback } from "react";
import { getShowcaseItemsForCategory } from "@/app/nearby/showcase/[category]/ShowcaseDetailItems.client";
import { attachDistances, ShowcaseItem } from "@/lib/showcase-utils";

interface ShowcaseDetailItemsAccordionProps {
  categoryId: string;
}

const sortModes = [
  { key: "top", label: "Top Rated" },
  { key: "near", label: "Nearest to Me" },
];

export default function ShowcaseDetailItemsAccordion({ categoryId }: ShowcaseDetailItemsAccordionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [sortMode, setSortMode] = useState("top");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  // Fetch showcase items
  useEffect(() => {
    setLoading(true);
    setError(null);
    setItems([]);
    getShowcaseItemsForCategory(categoryId)
      .then((result) => {
        setItems(result);
        setLoading(false);
        console.log("[ShowcaseDetailItemsAccordion] fetched items:", result.length);
      })
      .catch((err) => {
        setError("Failed to load showcase items.");
        setLoading(false);
        console.error("[ShowcaseDetailItemsAccordion] fetch error:", err);
      });
  }, [categoryId]);

  // Geolocation for nearest sort
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      setLocationDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
        setLocationDenied(false);
        console.log("[ShowcaseDetailItemsAccordion] got user location");
      },
      (err) => {
        setError("Location permission denied.");
        setUserLocation(null);
        setLocationDenied(true);
        console.warn("[ShowcaseDetailItemsAccordion] location error:", err);
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

  return (
    <div className="rounded-2xl bg-white/95 border border-neutral-100 shadow-lg p-6 flex flex-col gap-4 animate-fade-in">
      <div className="flex gap-2 mb-2">
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
              if (mode.key === "near" && !userLocation && !locationDenied) requestLocation();
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {locationDenied && sortMode === "near" && (
        <div className="text-xs text-red-500 mb-2">Location permission denied. Showing Top Rated instead.</div>
      )}
      {loading && <div className="py-8 text-center text-neutral-400">Loading...</div>}
      {error && <div className="py-8 text-center text-red-500">{error}</div>}
      {!loading && !error && !displayItems.length && (
        <div className="py-8 text-center text-neutral-400">No places found for this showcase.</div>
      )}
      {!loading && !error && displayItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-7 mt-2">
          {displayItems.map((item) => (
            <div
              key={item.placeId}
              className="rounded-3xl bg-white/95 border border-neutral-100 shadow p-6 flex flex-col items-start hover:shadow-xl transition cursor-pointer min-h-[220px] backdrop-blur-sm"
            >
              {item.photos?.length > 0 ? (
                <img
                  src={item.photos[0]}
                  alt={item.placeName}
                  className="w-full h-36 object-cover rounded-2xl mb-4 bg-neutral-100 shadow-sm"
                />
              ) : (
                <div className="w-full h-36 rounded-2xl mb-4 bg-neutral-100 flex items-center justify-center text-3xl text-neutral-300">🍽️</div>
              )}
              <div className="font-extrabold text-lg text-neutral-900 mb-1 truncate w-full drop-shadow-sm">{item.placeName}</div>
              <div className="text-xs text-neutral-500 mb-2 truncate w-full">{item.address}</div>
              <div className="flex gap-2 text-xs text-yellow-700 mb-2">
                <span>⭐ {item.googleRating ?? 'N/A'}</span>
                <span>({item.googleRatingCount ?? 0} ratings)</span>
                {item.distanceKm != null && (
                  <span className="text-xs text-cyan-700">{item.distanceKm.toFixed(1)} km</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
