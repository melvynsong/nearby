"use client";


import { useState, useRef } from 'react';
import PhotoAdjustSheet from '@/components/PhotoAdjustSheet';
import ErrorState from '@/components/ErrorState';
// Import other components and helpers as needed
// For HEIC conversion, use heic2any if available
// import heic2any from 'heic2any';

export default function AddPlace() {
  // State for photo upload
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dishSuggestions, setDishSuggestions] = useState<string[]>([]);
  const [selectedDish, setSelectedDish] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [showAdjustSheet, setShowAdjustSheet] = useState(false);
  // ...other state for place, groups, etc.

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Handle photo upload with HEIC conversion
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let processedFile = file;
    // HEIC conversion (mocked, add real logic if heic2any is available)
    if (file.type === 'image/heic' || file.name.endsWith('.heic') || file.name.endsWith('.HEIC')) {
      // TODO: Use heic2any for real conversion
      setAiError('HEIC conversion not implemented in this demo. Please use JPEG/PNG.');
      return;
    }
    setPhoto(processedFile);
    setPhotoUrl(URL.createObjectURL(processedFile));
    // Trigger AI scan
    runAiScan(processedFile);
  };

  // Mock AI scan logic
  const runAiScan = async (file: File) => {
    setAiLoading(true);
    setAiError(null);
    // Simulate API call
    setTimeout(() => {
      setDishSuggestions(["Laksa", "Chicken Rice", "Char Kway Teow"]);
      setConfidence(0.92);
      setSelectedDish("Laksa");
      setAiLoading(false);
    }, 1500);
  };

  // Handle dish selection
  const handleDishSelect = (dish: string) => {
    setSelectedDish(dish);
  };

  // UI rendering
  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-28 flex flex-col items-center">
      <div className="w-full max-w-lg bg-white rounded-xl shadow p-6 mt-8">
        <h2 className="text-xl font-bold mb-4">Add a Place</h2>
        {/* Photo upload */}
        <div className="mb-4">
          <input
            type="file"
            accept="image/*,.heic,.heif"
            ref={fileInputRef}
            onChange={handlePhotoChange}
            className="hidden"
          />
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => fileInputRef.current?.click()}
          >
            {photo ? "Change Photo" : "Upload Photo"}
          </button>
          {photoUrl && (
            <div className="mt-4">
              <img src={photoUrl} alt="Preview" className="rounded-lg max-h-60" />
              <button
                className="mt-2 text-blue-600 underline"
                onClick={() => setShowAdjustSheet(true)}
              >
                Adjust Photo
              </button>
            </div>
          )}
        </div>
        {/* AI scan and suggestions */}
        {aiLoading && <p>Analyzing photo...</p>}
        {aiError && <ErrorState title="AI Error" message={aiError} onPrimary={() => setAiError(null)} />}
        {dishSuggestions.length > 0 && (
          <div className="mb-4">
            <p className="font-semibold">AI Suggestions:</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {dishSuggestions.map((dish) => (
                <button
                  key={dish}
                  className={`px-3 py-1 rounded-full border ${selectedDish === dish ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                  onClick={() => handleDishSelect(dish)}
                >
                  {dish}
                </button>
              ))}
            </div>
            {confidence !== null && (
              <p className="mt-2 text-sm text-gray-500">Confidence: {(confidence * 100).toFixed(1)}%</p>
            )}
          </div>
        )}
        {/* TODO: Place autocomplete, group selection, note, save button, etc. */}
      </div>
      {/* Photo adjustment sheet */}
      <PhotoAdjustSheet
        isOpen={showAdjustSheet}
        src={photoUrl}
        initialTransform={{ scale: 1, offsetX: 0, offsetY: 0 }}
        onCancel={() => setShowAdjustSheet(false)}
        onDone={() => setShowAdjustSheet(false)}
      />
    </main>
  );
}