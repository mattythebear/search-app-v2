'use client';

import { useState } from 'react';
import { Mic } from 'lucide-react';
import VoiceSearch from './VoiceSearch';

interface FloatingVoiceButtonProps {
  onSearch: (transcript: string) => void;
}

export default function FloatingVoiceButton({ onSearch }: FloatingVoiceButtonProps) {
  const [showVoice, setShowVoice] = useState(false);

  return (
    <>
      {/* Only show on mobile */}
      <button
        onClick={() => setShowVoice(true)}
        className="md:hidden fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110 z-40"
        aria-label="Voice search"
      >
        <Mic size={24} />
      </button>

      {showVoice && (
        <div className="fixed inset-0 z-50">
          <VoiceSearch
            onTranscript={() => {}}
            onSearch={(transcript) => {
              onSearch(transcript);
              setShowVoice(false);
            }}
          />
        </div>
      )}
    </>
  );
}