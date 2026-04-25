import React, { useState } from 'react';

interface DishAIConfirmationModalProps {
  suggestedDishName: string;
  confidence: number; // 0-100
  photoUrl?: string;
  onConfirm: (dishName: string, wasConfirmed: boolean) => void;
  onClose: () => void;
}

export const DishAIConfirmationModal: React.FC<DishAIConfirmationModalProps> = ({
  suggestedDishName,
  confidence,
  photoUrl,
  onConfirm,
  onClose,
}) => {
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-2">AI Dish Suggestion</h2>
        {photoUrl && (
          <img src={photoUrl} alt="Uploaded dish" className="w-full h-40 object-cover rounded mb-4" />
        )}
        <div className="mb-4">
          <div className="text-lg font-medium">{suggestedDishName}</div>
          <div className="text-gray-600">AI is <span className="font-bold">{confidence}%</span> confident</div>
        </div>
        {!showCorrection ? (
          <div className="flex flex-col gap-2">
            <button
              className="bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
              onClick={() => onConfirm(suggestedDishName, true)}
            >
              Confirm
            </button>
            <button
              className="text-blue-600 underline"
              onClick={() => setShowCorrection(true)}
            >
              Not correct?
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              className="border rounded px-3 py-2"
              placeholder="Enter correct dish name"
              value={correction}
              onChange={e => setCorrection(e.target.value)}
              autoFocus
            />
            <button
              className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
              onClick={() => correction && onConfirm(correction, false)}
              disabled={!correction.trim()}
            >
              Submit Correction
            </button>
            <button
              className="text-gray-500 underline text-sm"
              onClick={() => setShowCorrection(false)}
            >
              Back
            </button>
          </div>
        )}
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
};
