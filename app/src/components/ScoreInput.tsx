"use client";

import React, { useState, useEffect } from "react";
import type { DimensionConfig } from "@/lib/score";

interface ScoreInputProps {
  dimension: DimensionConfig;
  value: number | undefined;
  explanation: string | undefined;
  onChange: (value: number, explanation: string) => void;
}

export function ScoreInput({ dimension, value, explanation, onChange }: ScoreInputProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationValue, setExplanationValue] = useState(explanation || "");

  useEffect(() => {
    setExplanationValue(explanation || "");
  }, [explanation]);

  if (dimension.type === "yesno") {
    return (
      <div>
        <label className="block text-xs text-gray-600 mb-1">{dimension.name}</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange(1, explanationValue)}
            className={`px-2 py-1 rounded text-xs ${
              value === 1 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange(0, explanationValue)}
            className={`px-2 py-1 rounded text-xs ${
              value === 0 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            No
          </button>
        </div>
        {showExplanation && (
          <input
            type="text"
            value={explanationValue}
            onChange={(e) => setExplanationValue(e.target.value)}
            onBlur={() => {
              onChange(value ?? 0, explanationValue);
              setShowExplanation(false);
            }}
            placeholder="Explanation"
            className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
            autoFocus
          />
        )}
        {!showExplanation && (
          <button
            type="button"
            onClick={() => setShowExplanation(true)}
            className="mt-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {explanationValue ? "Edit explanation" : "Add explanation"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{dimension.name}</label>
      <div className="flex gap-0.5">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n, explanationValue)}
            className={`w-8 py-1 rounded text-xs ${
              value === n ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {showExplanation && (
        <input
          type="text"
          value={explanationValue}
          onChange={(e) => setExplanationValue(e.target.value)}
          onBlur={() => {
            onChange(value ?? 0, explanationValue);
            setShowExplanation(false);
          }}
          placeholder="Explanation"
          className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
          autoFocus
        />
      )}
      {!showExplanation && (
        <button
          type="button"
          onClick={() => setShowExplanation(true)}
          className="mt-1 text-xs text-gray-500 hover:text-gray-700"
        >
          {explanationValue ? "Edit explanation" : "Add explanation"}
        </button>
      )}
    </div>
  );
}
