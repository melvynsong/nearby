"use client";


import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PhotoAdjustSheet from '@/components/PhotoAdjustSheet';
import ErrorState from '@/components/ErrorState';
// Import other components and helpers as needed
// For HEIC conversion, use heic2any if available
// import heic2any from 'heic2any';

// TODO: Move static copy and config to a constants file if needed
// TODO: Extract map/photo display to subcomponents for clarity if file grows

// Helper to fetch place details by placeId (for edit mode)
async function fetchPlaceDetails(placeId: string) {
  try {
    const res = await fetch('/api/places/details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId }),
    });
    if (!res.ok) throw new Error('Failed to fetch place details');
    return await res.json();
  } catch {
    return null;
  }
}

export default function AddPlace() {
  // State for photo upload and edit mode
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dishSuggestions, setDishSuggestions] = useState<any[]>([]);
  const [selectedDish, setSelectedDish] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [showAdjustSheet, setShowAdjustSheet] = useState(false);
  const [imageTransform, setImageTransform] = useState<any>(null);
  // Place, group, category, note state
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placePredictions, setPlacePredictions] = useState<any[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<any>(null);
  const [showMap, setShowMap] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [customCategory, setCustomCategory] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editPlaceId, setEditPlaceId] = useState<string | null>(null);
  const router = useRouter();

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // On mount: check for edit mode via query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('editPlaceId');
    if (editId) {
      setEditPlaceId(editId);
      // Fetch and prefill data for edit mode
      (async () => {
        const details = await fetchPlaceDetails(editId);
        if (details) {
          setPlaceName(details.name || '');
          setAddress(details.address || '');
          setPlaceQuery(details.name || '');
          setSelectedPlace({
            text: details.name,
            secondaryText: details.address,
            placeId: details.googlePlaceId,
            lat: details.lat,
            lng: details.lng,
            rating: details.googleRating,
            userRatingsTotal: details.googleRatingCount,
          });
          setNote(details.note || '');
          setSelectedDish(details.dishName || '');
          setSelectedCategory(details.category || '');
          setCustomCategory('');
          setImageTransform(details.imageTransform || null);
          setPhotoUrl(details.photoUrl || null);
          // Optionally fetch and set dish/category suggestions if needed
        }
      })();
    }
  }, []);

  // User location for distance calculation
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserCoords(null),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, []);


  // Handle photo upload with HEIC conversion
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let processedFile = file;
    // HEIC conversion (mocked, add real logic if heic2any is available)
    if (file.type === 'image/heic' || file.name.endsWith('.heic') || file.name.endsWith('.HEIC')) {
      setAiError('HEIC conversion not implemented in this demo. Please use JPEG/PNG.');
      return;
    }
    setPhoto(processedFile);
    setPhotoUrl(URL.createObjectURL(processedFile));
    setImageTransform(null);
    // Trigger AI scan
    await runAiScan(processedFile);
  };

  // Real AI scan logic using /api/food/suggest
  const [keyVisualClues, setKeyVisualClues] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string>('');
  // Fallback: fetch top dishes from database if AI fails
  const fetchFallbackDishes = async () => {
    try {
      const res = await fetch('/api/food/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions: [] }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.rankedSuggestions || []).slice(0, 3);
    } catch {
      return [];
    }
  };

  const runAiScan = async (file: File) => {
    setAiLoading(true);
    setAiError(null);
    setDishSuggestions([]);
    setKeyVisualClues([]);
    setReasoning('');
    setConfidence(null);
    setSelectedDish(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      // Add more context if needed (e.g., placeId, groupId)
      const res = await fetch('/api/food/suggest', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('AI service error');
      const data = await res.json();
      // Debug output
      // eslint-disable-next-line no-console
      console.log('[AddPlace][AI Response]', data);
      // Robust parsing
      let suggestions = Array.isArray(data.top_suggestions)
        ? data.top_suggestions
        : Array.isArray(data.topSuggestions)
        ? data.topSuggestions
        : [];
      if (!suggestions.length && Array.isArray(data.suggestions)) suggestions = data.suggestions;
      // Fallback to DB if AI gives nothing
      if (!suggestions.length) {
        suggestions = await fetchFallbackDishes();
      }
      setSelectedDish(data.dish_name || null);
      setConfidence(data.confidence ?? null);
      setDishSuggestions(suggestions);
      setKeyVisualClues(data.key_visual_clues || []);
      setReasoning(data.reasoning_summary || '');
      setCategorySuggestions([
        ...(data.cuisine ? [data.cuisine] : []),
        ...suggestions.map((s: any) => s.name),
      ].filter(Boolean));
    } catch (err: any) {
      setAiError(err?.message || 'AI analysis failed.');
    } finally {
      setAiLoading(false);
    }
  };

  // Handle dish selection
  const handleDishSelect = (dish: string) => {
    setSelectedDish(dish);
    // Optionally update category suggestion
    if (categorySuggestions.includes(dish)) setSelectedCategory(dish);
  };

  // Handle category selection
  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    setCustomCategory('');
  };

  // Handle custom category
  const handleCustomCategory = (val: string) => {
    setCustomCategory(val);
    setSelectedCategory('');
  };

  // Handle save
  const handleSave = async () => {
    // Validate required fields
    if (!photoUrl && !photo) {
      setSaveError('Photo is required.');
      return;
    }
    if (!selectedDish) {
      setSaveError('Dish name is required.');
      return;
    }
    if (!selectedCategory && !customCategory) {
      setSaveError('Category is required.');
      return;
    }
    if (!selectedPlace) {
      setSaveError('Place selection is required.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const formData = new FormData();
      // If editing and no new photo, skip file upload
      if (photo) formData.append('file', photo);
      formData.append('dishName', selectedDish);
      formData.append('category', customCategory || selectedCategory);
      formData.append('note', note);
      formData.append('name', selectedPlace.text || placeName);
      formData.append('address', selectedPlace.secondaryText || address);
      formData.append('googlePlaceId', selectedPlace.placeId || '');
      if (selectedPlace.lat) formData.append('lat', String(selectedPlace.lat));
      if (selectedPlace.lng) formData.append('lng', String(selectedPlace.lng));
      if (typeof selectedPlace.rating === 'number') formData.append('googleRating', String(selectedPlace.rating));
      if (typeof selectedPlace.userRatingsTotal === 'number') formData.append('googleRatingCount', String(selectedPlace.userRatingsTotal));
      if (imageTransform) formData.append('imageTransform', JSON.stringify(imageTransform));
      if (editPlaceId) formData.append('editPlaceId', editPlaceId);
      // Contribute back to dish_analysis_events if AI scan was run
      if (dishSuggestions.length > 0 || confidence !== null) {
        formData.append('dishAnalysisEvent', JSON.stringify({
          suggestions: dishSuggestions,
          confidence,
          keyVisualClues,
          reasoning,
          timestamp: Date.now(),
        }));
      }
      // TODO: Add groupId, memberId if available
      const res = await fetch('/api/places/save', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Failed to save spot.');
      }
      router.push('/nearby');
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // Drag-and-drop handlers
  const [dragActive, setDragActive] = useState(false);
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handlePhotoChange({ target: { files: e.dataTransfer.files } } as any);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f5f6f8] to-[#eaf0fa] pb-28 flex flex-col items-center font-sans">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8 mt-10 border border-blue-100">
        <h2 className="text-3xl font-extrabold mb-2 text-[#1f355d] flex items-center gap-2 tracking-tight">
          <span role="img" aria-label="camera">📸</span> {editPlaceId ? 'Edit Your Legendary Food Find' : 'Add a Legendary Food Find'}
        </h2>
        <p className="mb-6 text-base text-neutral-700 font-semibold leading-relaxed">
          <span className="block text-xl text-[#ff7e1b] font-extrabold mb-1">{editPlaceId ? 'Update your food story.' : 'Let’s make food history together.'}</span>
          <span className="block text-sm text-neutral-500 font-medium">{editPlaceId ? 'Tweak your photo, dish, or details to keep your recommendation fresh.' : 'Share your most drool-worthy food photo and help the community discover hidden gems.'}<br />
          <span className="text-xs text-blue-500">(Bonus points for noodle slurps, epic cheese pulls, or anything that’ll make us jealous!)</span></span>
        </p>
        {/* Drag-and-drop/photo upload */}
        <div
          className={`relative mb-6 rounded-2xl border-2 border-dashed ${dragActive ? 'border-blue-400 bg-blue-50' : 'border-neutral-200 bg-neutral-50'} flex flex-col items-center justify-center py-8 transition-all`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*,.heic,.heif"
            ref={fileInputRef}
            onChange={handlePhotoChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            tabIndex={-1}
          />
          {!photoUrl ? (
            <>
              <div className="text-5xl mb-2">🍜</div>
              <div className="text-lg font-semibold text-neutral-700">{editPlaceId ? 'Tap to update your food photo' : 'Drop a photo or tap to upload'}</div>
              <div className="text-xs text-neutral-400 mt-1">HEIC, JPEG, PNG supported. No food fights, please.</div>
            </>
          ) : (
            <>
              <img src={photoUrl} alt="Preview" className="rounded-xl max-h-60 mx-auto shadow-sm border border-[#d6ddeb] bg-white" />
              <button
                className="mt-3 rounded-xl border border-[#d6ddeb] bg-white px-4 py-2.5 text-sm font-semibold text-[#1f355d] shadow-sm hover:bg-[#f5f7fc] transition-colors"
                onClick={() => setShowAdjustSheet(true)}
              >
                Adjust Photo (for the perfect noodle angle)
              </button>
              <button
                className="mt-2 text-xs text-neutral-400 underline hover:text-[#1f355d]"
                onClick={() => { setPhoto(null); setPhotoUrl(null); setDishSuggestions([]); setSelectedDish(null); setCategorySuggestions([]); setSelectedCategory(''); setCustomCategory(''); setNote(''); setConfidence(null); setKeyVisualClues([]); setReasoning(''); setImageTransform(null); }}
              >
                {editPlaceId ? 'Replace Photo' : 'Replace Photo & Re-analyze'}
              </button>
            </>
          )}
        </div>
        {/* AI scan and suggestions */}
        {aiLoading && <p className="text-blue-600 font-semibold animate-pulse">{editPlaceId ? 'Re-analyzing your dish…' : 'Summoning the food gods…'}</p>}
        {aiError && <ErrorState title="AI Oops!" message={aiError} onPrimary={() => setAiError(null)} />}
        {/* Show top 3 dish guesses as pills, and confidence, with fallback */}
        {photoUrl && !aiLoading && !aiError && (
          <div className="mb-4">
            <div className="mb-2 flex items-center flex-wrap gap-2">
              {dishSuggestions.length > 0 && dishSuggestions.slice(0, 3).map((dish, idx) => {
                const name = dish?.name || dish?.toString?.() || '…';
                const conf = typeof dish?.confidence === 'number' ? dish.confidence : null;
                return (
                  <button
                    key={name + '-' + idx}
                    className={`px-3 py-1 rounded-full border transition-all duration-150 ${selectedDish === name ? 'bg-[#1f355d] text-white border-[#1f355d]' : 'bg-gradient-to-r from-[#eaf0fa] to-[#d1e7ff] border-blue-200 text-blue-900 hover:bg-blue-50'} text-base font-semibold tracking-tight shadow-sm`}
                    onClick={() => {
                      setSelectedDish(name);
                      setSelectedCategory(name);
                      setCustomCategory('');
                    }}
                  >
                    {name}{conf !== null ? ` (${Math.round(conf)}%)` : ''}
                  </button>
                );
              })}
              <span className="font-semibold text-neutral-700">or</span>
              <input
                type="text"
                placeholder="Add your own dish (e.g. Grandma’s Secret)"
                className="rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm font-semibold bg-white shadow-sm focus:border-[#1f355d] outline-none min-w-[180px]"
                value={customCategory || (selectedDish && !dishSuggestions.map(d => d?.name || d).includes(selectedDish) ? selectedDish : '')}
                onChange={e => {
                  setSelectedDish(e.target.value);
                  setSelectedCategory(e.target.value);
                  setCustomCategory(e.target.value);
                }}
              />
            </div>
            {confidence !== null && (
              <div className="mb-2">
                <span className="font-semibold text-neutral-700">AI Overall Confidence:</span>{' '}
                <span className="text-blue-600 font-bold">{(confidence * 100).toFixed(1)}%</span>
              </div>
            )}
            {keyVisualClues.length > 0 && (
              <div className="mt-2 text-xs text-neutral-500">
                <span className="font-semibold">Visual clues:</span> {keyVisualClues.join(', ')}
              </div>
            )}
            {reasoning && (
              <div className="mt-2 text-xs text-neutral-400 italic">{reasoning}</div>
            )}
          </div>
        )}
        {/* Place autocomplete: Where did you find it? */}
        <div className="mt-4">
          <p className="font-semibold text-neutral-700 mb-1">Where did you find it?</p>
          <input
            type="text"
            className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm font-semibold bg-white shadow-sm focus:border-[#1f355d] outline-none mb-2"
            placeholder="Type a restaurant, hawker, or address…"
            value={placeQuery}
            onChange={async (e) => {
              setPlaceQuery(e.target.value);
              setSelectedPlace(null);
              setShowMap(false);
              if (e.target.value.length > 1) {
                const res = await fetch('/api/places/autocomplete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: e.target.value }),
                });
                const data = await res.json();
                setPlacePredictions(data.predictions || []);
              } else {
                setPlacePredictions([]);
              }
            }}
            autoComplete="off"
          />
          {placePredictions.length > 0 && !selectedPlace && (
            <div className="bg-white border border-[#d6ddeb] rounded-xl shadow-sm p-2 max-h-48 overflow-y-auto z-10 relative">
              {placePredictions.map((p) => (
                <div
                  key={p.placeId}
                  className="cursor-pointer px-3 py-2 hover:bg-[#f5f7fc] rounded-xl text-sm font-semibold text-neutral-900"
                  onClick={() => {
                    setSelectedPlace(p);
                    setPlaceQuery(p.text);
                    setShowMap(true);
                    setPlacePredictions([]);
                  }}
                >
                  <span className="font-semibold text-neutral-800">{p.text}</span>
                  {p.secondaryText && <span className="text-xs text-neutral-500 ml-2">{p.secondaryText}</span>}
                  {typeof p.rating === 'number' && <span className="ml-2 text-xs text-yellow-600">★ {p.rating}</span>}
                </div>
              ))}
            </div>
          )}
          {selectedPlace && selectedPlace.lat && selectedPlace.lng && (
            <div className="mt-2 rounded-2xl overflow-hidden border border-[#d6ddeb] shadow-sm bg-white">
              <div className="p-4 border-b border-[#e6ebf4] flex flex-col gap-1">
                <div className="font-bold text-lg text-[#1f355d] flex items-center gap-2 tracking-tight">{selectedPlace.text}
                  {typeof selectedPlace.rating === 'number' && <span className="ml-2 text-xs text-yellow-600">★ {selectedPlace.rating}</span>}
                </div>
                {selectedPlace.secondaryText && <div className="text-xs text-neutral-500 mt-0.5">{selectedPlace.secondaryText}</div>}
                {userCoords && (
                  <div className="text-xs text-blue-700 font-semibold">
                    {(() => {
                      const R = 6371;
                      const dLat = (selectedPlace.lat - userCoords.lat) * Math.PI / 180;
                      const dLng = (selectedPlace.lng - userCoords.lng) * Math.PI / 180;
                      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(userCoords.lat * Math.PI / 180) * Math.cos(selectedPlace.lat * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
                      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                      const d = R * c;
                      return `~${d.toFixed(2)} km from you`;
                    })()}
                  </div>
                )}
              </div>
              <img
                src={`https://maps.googleapis.com/maps/api/staticmap?center=${selectedPlace.lat},${selectedPlace.lng}&zoom=16&size=600x220&maptype=roadmap&markers=color:red%7C${selectedPlace.lat},${selectedPlace.lng}&key=YOUR_GOOGLE_MAPS_API_KEY&scale=2&visible=${selectedPlace.lat},${selectedPlace.lng}&path=color:0x1f355d80|weight:2|fillcolor:0x1f355d20|enc=`}
                alt="Map preview"
                width={600}
                height={220}
                style={{ width: '100%', height: 220, objectFit: 'cover', border: 0 }}
              />
            </div>
          )}
        </div>
        {/* Note input */}
        <div className="mt-4">
          <p className="font-semibold text-neutral-700 mb-1">Add a note <span className="text-xs text-neutral-400">(optional, e.g. “Best eaten with extra sambal!”)</span></p>
          <textarea
            className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm font-semibold bg-white shadow-sm focus:border-[#1f355d] outline-none"
            rows={2}
            placeholder="What makes this spot special?"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>
        {/* Save button */}
        <div className="mt-4 flex flex-col gap-2">
          <button
            className="w-full rounded-xl bg-[#1f355d] hover:bg-[#162746] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (editPlaceId ? 'Updating...' : 'Saving...') : (editPlaceId ? 'Update this spot' : 'Save this spot')}
          </button>
          {saveError && <div className="text-xs text-red-500 font-semibold">{saveError}</div>}
        </div>
      </div>
      {/* Photo adjustment sheet */}
      <PhotoAdjustSheet
        isOpen={showAdjustSheet}
        src={photoUrl}
        initialTransform={imageTransform || { scale: 1, offsetX: 0, offsetY: 0 }}
        onCancel={() => setShowAdjustSheet(false)}
        onDone={(transform) => {
          setImageTransform(transform);
          setShowAdjustSheet(false);
        }}
      />
    </main>
  );
}