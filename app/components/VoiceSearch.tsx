'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, X } from 'lucide-react';

interface VoiceSearchProps {
  onTranscript: (transcript: string) => void;
  onSearch: (transcript: string) => void;
}

export default function VoiceSearch({ onTranscript, onSearch }: VoiceSearchProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<any>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check if browser supports speech recognition
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        console.log('Voice recognition started');
        setError('');
      };

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        if (finalTranscript) {
          setTranscript(prev => prev + ' ' + finalTranscript);
          onTranscript(transcript + ' ' + finalTranscript);
        }
        setInterimTranscript(interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setError(`Error: ${event.error}`);
        setIsListening(false);
        setShowModal(false);
      };

      recognitionRef.current.onend = () => {
        console.log('Voice recognition ended');
        setIsListening(false);
        if (transcript.trim()) {
          handleSearch();
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [transcript]);

  const startListening = () => {
    if (!isSupported) {
      setError('Voice search is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    setTranscript('');
    setInterimTranscript('');
    setError('');
    setShowModal(true);
    setIsListening(true);

    try {
      recognitionRef.current.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError('Failed to start voice recognition. Please try again.');
      setIsListening(false);
      setShowModal(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleSearch = () => {
    const finalText = transcript.trim();
    if (finalText) {
      onSearch(finalText);
      setShowModal(false);
      setTranscript('');
      setInterimTranscript('');
    }
  };

  const cancelListening = () => {
    stopListening();
    setShowModal(false);
    setTranscript('');
    setInterimTranscript('');
  };

  const handleModalSearch = () => {
    stopListening();
    handleSearch();
  };

  if (!isSupported) {
    return (
      <button
        disabled
        className="p-2 text-gray-400 cursor-not-allowed"
        title="Voice search not supported"
      >
        <MicOff size={20} />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={startListening}
        className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
        title="Voice search"
      >
        <Mic size={20} />
      </button>

      {/* Voice Search Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {isListening ? 'Listening...' : 'Voice Search'}
              </h3>
              <button
                onClick={cancelListening}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Animated mic indicator */}
            <div className="flex justify-center mb-6">
              <div className={`relative ${isListening ? 'animate-pulse' : ''}`}>
                <div className={`absolute inset-0 bg-blue-400 rounded-full blur-xl ${
                  isListening ? 'animate-ping' : ''
                }`} />
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`relative p-6 rounded-full transition-all ${
                    isListening 
                      ? 'bg-red-500 hover:bg-red-600' 
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {isListening ? (
                    <MicOff size={32} className="text-white" />
                  ) : (
                    <Mic size={32} className="text-white" />
                  )}
                </button>
              </div>
            </div>

            {/* Transcript display */}
            <div className="min-h-[100px] p-4 bg-gray-50 rounded-lg mb-4">
              {error ? (
                <p className="text-red-600 text-sm">{error}</p>
              ) : (
                <>
                  {(transcript || interimTranscript) ? (
                    <div>
                      <p className="text-gray-900">
                        {transcript}
                        <span className="text-gray-400">{interimTranscript}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-center">
                      {isListening 
                        ? 'Start speaking...' 
                        : 'Click the microphone to start'}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Tips */}
            <div className="mb-4 text-xs text-gray-500">
              <p className="mb-1">💡 Try saying:</p>
              <ul className="space-y-1 ml-4">
                <li>"Cookie dough under 100 dollars"</li>
                <li>"Organic pasta between 5 and 20 dollars"</li>
                <li>"Paper plates on sale"</li>
                <li>"Chocolate chips in stock"</li>
              </ul>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleModalSearch}
                disabled={!transcript.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Search
              </button>
              <button
                onClick={cancelListening}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Status indicator */}
            {isListening && (
              <div className="mt-3 flex items-center justify-center text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin mr-2" />
                Listening...
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}