'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

// Simplified types to avoid build conflicts
interface Note {
  midiNote: number;
  velocity: number;
  vowel: 'A' | 'O';
}

interface HarmonyResult {
  bass: Note;
  tenor: Note;
  mezzoSoprano: Note;
  soprano: Note;
}

type HandPreference = 'left' | 'right' | null;

// Simple built-in harmonizer to avoid import issues
class SimpleHarmonizer {
  private previousHarmony: HarmonyResult | null = null;

  generateHarmony(
    leadVoice: 'bass' | 'tenor' | 'mezzoSoprano' | 'soprano',
    leadNote: Note,
    volume: number
  ): HarmonyResult {
    const leadMidi = leadNote.midiNote;
    
    // Generate basic chord harmony
    const chordType = this.getChordType(leadMidi);
    let harmony = this.generateChordHarmony(leadMidi, chordType);
    
    // Apply voice leading if we have previous harmony
    if (this.previousHarmony) {
      harmony = this.smoothVoiceLeading(harmony, this.previousHarmony);
    }
    
    // Set volumes and vowels
    Object.keys(harmony).forEach(voice => {
      const voiceKey = voice as keyof HarmonyResult;
      if (voice === leadVoice) {
        harmony[voiceKey].velocity = volume;
        harmony[voiceKey].vowel = leadNote.vowel;
      } else {
        harmony[voiceKey].velocity = volume * 0.6;
        harmony[voiceKey].vowel = Math.random() < 0.8 ? leadNote.vowel : (leadNote.vowel === 'A' ? 'O' : 'A');
      }
    });
    
    this.previousHarmony = harmony;
    return harmony;
  }

  private getChordType(midiNote: number): 'major' | 'minor' {
    const noteClass = midiNote % 12;
    // Prefer major for white keys that are commonly major tonics
    const majorNotes = [0, 2, 4, 5, 7, 9]; // C, D, E, F, G, A
    return majorNotes.includes(noteClass) ? 'major' : 'minor';
  }

  private generateChordHarmony(leadMidi: number, chordType: 'major' | 'minor'): HarmonyResult {
    const third = chordType === 'major' ? 4 : 3;
    const fifth = 7;
    
    return {
      bass: { midiNote: this.constrainToRange(leadMidi - 12, 40, 64), velocity: 0.6, vowel: 'A' },
      tenor: { midiNote: this.constrainToRange(leadMidi - fifth, 48, 69), velocity: 0.6, vowel: 'A' },
      mezzoSoprano: { midiNote: this.constrainToRange(leadMidi - third, 57, 77), velocity: 0.6, vowel: 'A' },
      soprano: { midiNote: this.constrainToRange(leadMidi, 60, 84), velocity: 0.6, vowel: 'A' }
    };
  }

  private constrainToRange(note: number, min: number, max: number): number {
    while (note < min) note += 12;
    while (note > max) note -= 12;
    return Math.max(min, Math.min(max, note));
  }

  private smoothVoiceLeading(newHarmony: HarmonyResult, prevHarmony: HarmonyResult): HarmonyResult {
    Object.keys(newHarmony).forEach(voice => {
      const voiceKey = voice as keyof HarmonyResult;
      const newNote = newHarmony[voiceKey].midiNote;
      const prevNote = prevHarmony[voiceKey].midiNote;
      const interval = Math.abs(newNote - prevNote);
      
      // If interval is large, try octave alternatives
      if (interval > 6) {
        const alternatives = [newNote + 12, newNote - 12];
        let bestNote = newNote;
        let smallestInterval = interval;
        
        alternatives.forEach(alt => {
          const ranges = { bass: [40, 64], tenor: [48, 69], mezzoSoprano: [57, 77], soprano: [60, 84] };
          const [min, max] = ranges[voiceKey] || [40, 84];
          
          if (alt >= min && alt <= max) {
            const altInterval = Math.abs(alt - prevNote);
            if (altInterval < smallestInterval) {
              smallestInterval = altInterval;
              bestNote = alt;
            }
          }
        });
        
        newHarmony[voiceKey].midiNote = bestNote;
      }
    });
    
    return newHarmony;
  }

  reset(): void {
    this.previousHarmony = null;
  }
}

interface Singer {
  name: string;
  range: string;
  color: string;
  active: boolean;
  pitch: number; // 0-1, where 0 is lowest, 1 is highest
  volume: number; // 0-1, volume level
  midiNote?: number; // Current MIDI note being sung
  harmonyNote?: Note; // Current harmony note from harmonizer
}

interface HandPosition {
  x: number; // 0-1, left to right
  y: number; // 0-1, top to bottom (inverted for pitch)
  detected: boolean;
  vowel: 'A' | 'O' | 'NONE'; // Vowel based on hand gesture
}

interface VolumeHand {
  y: number; // 0-1, controls volume
  detected: boolean;
}

export default function VirtualOrchestra() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  
  // All hooks must be declared before any conditional returns
  const [handPreference, setHandPreference] = useState<HandPreference>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Control hand (dominant hand) - pitch and vowel
  const [controlHand, setControlHand] = useState<HandPosition>({
    x: 0.5,
    y: 0.5,
    detected: false,
    vowel: 'NONE'
  });
  
  // Volume hand (non-dominant hand) - volume control
  const [volumeHand, setVolumeHand] = useState<VolumeHand>({
    y: 0.5,
    detected: false
  });
  
  const [singers] = useState<Singer[]>([
    { name: 'Bass', range: 'E2-E4', color: '#8B4513', active: false, pitch: 0.2, volume: 0.5, midiNote: 52 },
    { name: 'Tenor', range: 'C3-A4', color: '#4169E1', active: false, pitch: 0.4, volume: 0.5, midiNote: 60 },
    { name: 'Mezzo-Soprano', range: 'A3-F5', color: '#FF69B4', active: false, pitch: 0.6, volume: 0.5, midiNote: 67 },
    { name: 'Soprano', range: 'C4-C6', color: '#FFD700', active: false, pitch: 0.8, volume: 0.5, midiNote: 72 }
  ]);

  // Harmonizer state
  const [harmonizer] = useState(() => new SimpleHarmonizer());
  const [currentHarmony, setCurrentHarmony] = useState<HarmonyResult | null>(null);

  // Get active singer based on hand X position
  const getActiveSinger = useCallback((x: number): number => {
    if (x < 0.25) return 0; // Bass
    if (x < 0.5) return 1;  // Tenor  
    if (x < 0.75) return 2; // Mezzo-Soprano
    return 3;               // Soprano
  }, []);

  // Convert Y position to pitch (inverted: top = high pitch)
  const getPitchFromY = useCallback((y: number): number => {
    return Math.max(0, Math.min(1, 1 - y)); // Invert Y axis
  }, []);

  // Convert Y position to volume (inverted: top = high volume)
  const getVolumeFromY = useCallback((y: number): number => {
    return Math.max(0, Math.min(1, 1 - y)); // Invert Y axis
  }, []);

  // Convert pitch (0-1) to MIDI note based on singer's range - WHITE KEYS ONLY
  const pitchToMidi = useCallback((pitch: number, singerIndex: number): number => {
    // White key patterns for each octave (C, D, E, F, G, A, B)
    const whiteKeyPattern = [0, 2, 4, 5, 7, 9, 11]; // Semitone offsets from C
    
    const ranges = [
      { startOctave: 2, startNote: 4, endOctave: 4, endNote: 4 }, // Bass: E2-E4
      { startOctave: 3, startNote: 0, endOctave: 4, endNote: 5 }, // Tenor: C3-A4  
      { startOctave: 3, startNote: 5, endOctave: 5, endNote: 3 }, // Mezzo-Soprano: A3-F5
      { startOctave: 4, startNote: 0, endOctave: 6, endNote: 0 }  // Soprano: C4-C6
    ];
    
    const range = ranges[singerIndex];
    
    // Create array of all white keys in the range
    const whiteKeys: number[] = [];
    
    for (let octave = range.startOctave; octave <= range.endOctave; octave++) {
      const startIdx = (octave === range.startOctave) ? range.startNote : 0;
      const endIdx = (octave === range.endOctave) ? range.endNote : 6;
      
      for (let noteIdx = startIdx; noteIdx <= endIdx; noteIdx++) {
        const midiNote = (octave + 1) * 12 + whiteKeyPattern[noteIdx];
        whiteKeys.push(midiNote);
      }
    }
    
    // Map pitch (0-1) to discrete white key index
    const keyIndex = Math.floor(pitch * (whiteKeys.length - 1));
    return whiteKeys[keyIndex];
  }, []);

  // Convert MIDI note number to note name (e.g., 60 -> "C4")
  const midiToNoteName = useCallback((midiNote: number): string => {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;
    return `${noteNames[noteIndex]}${octave}`;
  }, []);

  // Generate harmony when lead voice changes
  const updateHarmony = useCallback((activeSingerIndex: number, pitch: number, volume: number, vowel: 'A' | 'O' | 'NONE') => {
    if (activeSingerIndex === -1 || vowel === 'NONE') return;
    
    const singerNames = ['bass', 'tenor', 'mezzoSoprano', 'soprano'] as const;
    const leadVoice = singerNames[activeSingerIndex];
    const midiNote = pitchToMidi(pitch, activeSingerIndex);
    
    const leadNote: Note = {
      midiNote,
      velocity: volume,
      vowel: vowel as 'A' | 'O'
    };
    
    const harmony = harmonizer.generateHarmony(leadVoice, leadNote, volume);
    setCurrentHarmony(harmony);
  }, [harmonizer, pitchToMidi]);

  // Detect vowel based on hand gesture
  const detectVowel = useCallback((landmarks: any[]): 'A' | 'O' | 'NONE' => {
    if (!landmarks || landmarks.length < 21) return 'NONE';
    
    // Check for open palm (A) - all fingers extended
    const fingers = [
      { tip: landmarks[8], pip: landmarks[6] },   // Index
      { tip: landmarks[12], pip: landmarks[10] }, // Middle
      { tip: landmarks[16], pip: landmarks[14] }, // Ring
      { tip: landmarks[20], pip: landmarks[18] }  // Pinky
    ];
    
    const extendedFingers = fingers.filter(finger => finger.tip.y < finger.pip.y).length;
    
    // Check for fist (O) - all fingers folded
    const foldedFingers = fingers.filter(finger => finger.tip.y > finger.pip.y).length;
    
    if (extendedFingers >= 3) return 'A'; // Open palm
    if (foldedFingers >= 3) return 'O';   // Fist
    return 'NONE'; // Unclear gesture
  }, []);

  const onResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    // Draw column dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    for (let i = 1; i < 4; i++) {
      const x = (canvas.width / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw singer labels
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    singers.forEach((singer, index) => {
      const x = (canvas.width / 4) * index + (canvas.width / 8);
      const y = 40;
      ctx.strokeText(singer.name, x - ctx.measureText(singer.name).width / 2, y);
      ctx.fillText(singer.name, x - ctx.measureText(singer.name).width / 2, y);
    });

    // Draw volume indicator on the side
    const volumeBarX = handPreference === 'right' ? 20 : canvas.width - 40;
    const volumeBarY = 80;
    const volumeBarHeight = canvas.height - 160;
    
    // Volume bar background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(volumeBarX, volumeBarY, 20, volumeBarHeight);
    
    // Volume level indicator
    const currentVol = volumeHand.detected ? getVolumeFromY(volumeHand.y) : 0.5;
    const volumeFillHeight = currentVol * volumeBarHeight;
    ctx.fillStyle = volumeHand.detected ? '#00FF00' : '#666666';
    ctx.fillRect(volumeBarX, volumeBarY + volumeBarHeight - volumeFillHeight, 20, volumeFillHeight);
    
    // Volume label
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    const volumeText = 'VOL';
    const volumeTextX = volumeBarX - (handPreference === 'right' ? 30 : -25);
    ctx.strokeText(volumeText, volumeTextX, volumeBarY - 10);
    ctx.fillText(volumeText, volumeTextX, volumeBarY - 10);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      let controlHandData = null;
      let volumeHandData = null;

      // Process each detected hand
      results.multiHandLandmarks.forEach((landmarks: any, handIndex: number) => {
        const handedness = results.multiHandedness?.[handIndex]?.label || 'Unknown';
        const isRightHand = handedness === 'Right';
        const isLeftHand = handedness === 'Left';
        
        // Determine which hand is which based on user preference
        // Note: Due to camera mirroring, we need to flip the hand detection
        const isControlHand = (handPreference === 'right' && isLeftHand) || 
                              (handPreference === 'left' && isRightHand);
        const isVolumeHand = (handPreference === 'right' && isRightHand) || 
                             (handPreference === 'left' && isLeftHand);

        // Draw hand landmarks with different colors
        landmarks.forEach((landmark: any, index: number) => {
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, index === 8 ? 8 : 4, 0, 2 * Math.PI);
          
          if (isControlHand) {
            ctx.fillStyle = index === 8 ? '#FF0000' : '#00FF00'; // Red for index finger, green for others
          } else if (isVolumeHand) {
            ctx.fillStyle = index === 8 ? '#FF00FF' : '#00FFFF'; // Magenta for index finger, cyan for others
          } else {
            ctx.fillStyle = '#FFFF00'; // Yellow for unassigned hands
          }
          
          ctx.fill();
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // Draw hand connections
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
          [0, 5], [5, 6], [6, 7], [7, 8], // Index
          [0, 17], [5, 9], [9, 10], [10, 11], [11, 12], // Middle
          [9, 13], [13, 14], [14, 15], [15, 16], // Ring
          [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
        ];

        ctx.strokeStyle = isControlHand ? '#00FF00' : isVolumeHand ? '#00FFFF' : '#FFFF00';
        ctx.lineWidth = 2;
        connections.forEach(([start, end]) => {
          const startPoint = landmarks[start];
          const endPoint = landmarks[end];
          
          if (startPoint && endPoint) {
            const x1 = startPoint.x * canvas.width;
            const y1 = startPoint.y * canvas.height;
            const x2 = endPoint.x * canvas.width;
            const y2 = endPoint.y * canvas.height;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        });

        // Store hand data
        if (isControlHand) {
          const indexTip = landmarks[8];
          controlHandData = {
            x: indexTip.x,
            y: indexTip.y,
            detected: true,
            vowel: detectVowel(landmarks)
          };
        } else if (isVolumeHand) {
          const indexTip = landmarks[8];
          volumeHandData = {
            y: indexTip.y,
            detected: true
          };
        }
      });

      // Update hand states
      if (controlHandData) {
        setControlHand(controlHandData);
        
        // Generate harmony for current position
        const activeIndex = getActiveSinger(controlHandData.x);
        const currentPitch = getPitchFromY(controlHandData.y);
        const currentVol = getVolumeFromY(volumeHand.detected ? volumeHand.y : 0.5);
        
        updateHarmony(activeIndex, currentPitch, currentVol, controlHandData.vowel);
        
        // Highlight active column and draw pitch line
        const columnWidth = canvas.width / 4;
        const columnX = columnWidth * activeIndex;
        
        ctx.fillStyle = `${singers[activeIndex].color}40`;
        ctx.fillRect(columnX, 0, columnWidth, canvas.height);
        
        // Draw pitch indicator line with vowel label
        const pitchY = controlHandData.y * canvas.height;
        ctx.strokeStyle = singers[activeIndex].color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(columnX, pitchY);
        ctx.lineTo(columnX + columnWidth, pitchY);
        ctx.stroke();

        // Draw vowel indicator
        if (controlHandData.vowel !== 'NONE') {
          ctx.font = 'bold 40px Arial';
          ctx.fillStyle = singers[activeIndex].color;
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 3;
          const vowelText = controlHandData.vowel;
          const textWidth = ctx.measureText(vowelText).width;
          const textX = columnX + (columnWidth - textWidth) / 2;
          const textY = pitchY - 20;
          
          ctx.strokeText(vowelText, textX, textY);
          ctx.fillText(vowelText, textX, textY);
        }
      } else {
        setControlHand(prev => ({ ...prev, detected: false, vowel: 'NONE' }));
      }

      if (volumeHandData) {
        setVolumeHand(volumeHandData);
      } else {
        setVolumeHand(prev => ({ ...prev, detected: false }));
      }

    } else {
      setControlHand(prev => ({ ...prev, detected: false, vowel: 'NONE' }));
      setVolumeHand(prev => ({ ...prev, detected: false }));
    }
  }, [singers, getActiveSinger, detectVowel, handPreference, getVolumeFromY, updateHarmony, getPitchFromY, midiToNoteName, pitchToMidi]);

  useEffect(() => {
    const initializeCamera = async () => {
      try {
        if (!videoRef.current || !canvasRef.current) return;
        
        // Get user media (camera)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: 'user'
          }
        });
        
        videoRef.current.srcObject = stream;
        
        // Load MediaPipe Hands with timeout and error handling
        const loadScript = (src: string): Promise<void> => {
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
            
            // Timeout after 10 seconds
            setTimeout(() => reject(new Error(`Timeout loading ${src}`)), 10000);
          });
        };

        try {
          console.log('Loading MediaPipe...');
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/hands.js');
          console.log('MediaPipe loaded successfully');
          
          // Initialize MediaPipe Hands
          const hands = new (window as any).Hands({
            locateFile: (file: string) => {
              return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;
            }
          });
          
          hands.setOptions({
            maxNumHands: 2, // Track both hands
            modelComplexity: 0,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5
          });
          
          hands.onResults(onResults);
          handsRef.current = hands;
          
          // Process video frames
          const processFrame = async () => {
            if (videoRef.current && videoRef.current.readyState === 4 && handsRef.current) {
              try {
                await handsRef.current.send({ image: videoRef.current });
              } catch (err) {
                console.warn('Frame processing error:', err);
              }
            }
            requestAnimationFrame(processFrame);
          };
          
          // Start processing once video is loaded
          videoRef.current!.onloadeddata = () => {
            console.log('Video loaded, starting hand detection...');
            setIsLoading(false);
            processFrame();
          };
          
        } catch (err) {
          console.error('MediaPipe loading error:', err);
          setError('Failed to load MediaPipe. Please refresh the page.');
          setIsLoading(false);
        }
        
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play();
        };
        
      } catch (err) {
        console.error('Error initializing camera:', err);
        setError('Failed to access camera. Please ensure camera permissions are granted.');
        setIsLoading(false);
      }
    };

    if (handPreference) {
      initializeCamera();
    }
  }, [onResults, handPreference]);

  const activeSingerIndex = controlHand.detected ? getActiveSinger(controlHand.x) : -1;
  const currentPitch = controlHand.detected ? getPitchFromY(controlHand.y) : 0;
  const currentVolume = volumeHand.detected ? getVolumeFromY(volumeHand.y) : 0.5;

  // Hand preference selection page
  if (handPreference === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center p-8 bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl max-w-md">
          <h1 className="text-4xl font-bold text-white mb-2">Virtual Orchestra</h1>
          <p className="text-blue-200 mb-8">Choose your dominant hand for control</p>
          
          <div className="space-y-4">
            <button
              onClick={() => setHandPreference('right')}
              className="w-full p-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl font-semibold text-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              <div className="flex items-center justify-center space-x-3">
                <span className="text-2xl">👋</span>
                <div>
                  <div>Right Handed</div>
                  <div className="text-sm opacity-80">Right hand controls pitch & vowel</div>
                </div>
              </div>
            </button>
            
            <button
              onClick={() => setHandPreference('left')}
              className="w-full p-6 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-xl font-semibold text-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              <div className="flex items-center justify-center space-x-3">
                <span className="text-2xl">🤚</span>
                <div>
                  <div>Left Handed</div>
                  <div className="text-sm opacity-80">Left hand controls pitch & vowel</div>
                </div>
              </div>
            </button>
          </div>
          
          <div className="mt-8 p-4 bg-blue-900/50 rounded-lg">
            <p className="text-blue-200 text-sm">
              <strong>Control System:</strong><br/>
              • Dominant hand: Singer selection, pitch, vowel<br/>
              • Other hand: Volume control
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-700">{error}</p>
          <p className="text-sm text-gray-500 mt-2">
            Make sure you've granted camera permissions and are using HTTPS
          </p>
          <button 
            onClick={() => setHandPreference(null)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Back to Hand Selection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Virtual Orchestra
          </h1>
          <button 
            onClick={() => setHandPreference(null)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            Change Hand Preference
          </button>
        </div>
        
        <div className="mb-4 text-center">
          <span className="text-lg">
            <strong>{handPreference === 'right' ? 'Right' : 'Left'} hand:</strong> Pitch & Vowel | 
            <strong> {handPreference === 'right' ? 'Left' : 'Right'} hand:</strong> Volume
          </span>
        </div>
        
        {isLoading && (
          <div className="text-center mb-6">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
            <p className="mt-2 text-gray-300">Initializing camera and hand tracking...</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Camera Feed */}
          <div className="lg:col-span-3">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className="relative z-10 w-full h-full"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
            
            <div className="mt-4 grid grid-cols-2 gap-4 text-center">
              <div>
                <h3 className="font-semibold text-lg mb-2">Control Hand ({handPreference === 'right' ? 'Right' : 'Left'})</h3>
                <p className="text-gray-300">
                  Detected: <span className="font-bold text-green-400">{controlHand.detected ? 'YES' : 'NO'}</span>
                </p>
                {controlHand.detected && (
                  <div className="space-y-1">
                    <p className="text-gray-300">
                      Position: X: {(controlHand.x * 100).toFixed(1)}%, Y: {(controlHand.y * 100).toFixed(1)}%
                    </p>
                    <div className="text-2xl font-bold text-yellow-400 mt-2">
                      ♪ {midiToNoteName(pitchToMidi(currentPitch, activeSingerIndex >= 0 ? activeSingerIndex : 0))}
                    </div>
                    <p className="text-gray-300">
                      Vowel: <span className={`font-bold text-lg ${
                        controlHand.vowel === 'A' ? 'text-blue-400' : 
                        controlHand.vowel === 'O' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {controlHand.vowel}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2">Volume Hand ({handPreference === 'right' ? 'Left' : 'Right'})</h3>
                <p className="text-gray-300">
                  Detected: <span className="font-bold text-cyan-400">{volumeHand.detected ? 'YES' : 'NO'}</span>
                </p>
                {volumeHand.detected && (
                  <p className="text-gray-300">
                    Volume: <span className="font-bold text-green-400">{(currentVolume * 100).toFixed(0)}%</span>
                  </p>
                )}
                
                {/* Current Harmony Display */}
                {currentHarmony && (
                  <div className="mt-3 p-2 bg-gray-800 rounded-lg">
                    <div className="text-xs text-gray-400 mb-1">Harmony Notes:</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div>B: {midiToNoteName(currentHarmony.bass.midiNote)}</div>
                      <div>T: {midiToNoteName(currentHarmony.tenor.midiNote)}</div>
                      <div>M: {midiToNoteName(currentHarmony.mezzoSoprano.midiNote)}</div>
                      <div>S: {midiToNoteName(currentHarmony.soprano.midiNote)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Singer Control Panel */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-center mb-4">Singers</h2>
            
            {singers.map((singer, index) => {
              const isActive = activeSingerIndex === index;
              const harmonyNote = currentHarmony ? currentHarmony[
                ['bass', 'tenor', 'mezzoSoprano', 'soprano'][index] as keyof HarmonyResult
              ] : null;
              
              return (
                <div
                  key={singer.name}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                    isActive
                      ? `border-2 shadow-lg`
                      : 'border-gray-600 bg-gray-800'
                  }`}
                  style={{
                    backgroundColor: isActive ? `${singer.color}20` : undefined,
                    borderColor: isActive ? singer.color : undefined,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg" style={{ color: singer.color }}>
                      {singer.name}
                    </span>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        isActive ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'
                      }`}>
                        {isActive ? 'LEAD' : 'HARMONY'}
                      </span>
                      {harmonyNote && (
                        <span className="px-2 py-1 rounded text-xs bg-blue-500 text-white">
                          {harmonyNote.vowel}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-400 mb-2">
                    Range: {singer.range}
                    {harmonyNote && (
                      <div className="text-sm text-green-300 mt-1 font-semibold">
                        ♪ {midiToNoteName(harmonyNote.midiNote)} | {(harmonyNote.velocity * 100).toFixed(0)}% vol
                      </div>
                    )}
                    {isActive && controlHand.detected && (
                      <div className="text-sm text-yellow-300 mt-1 font-semibold">
                        ♪ {midiToNoteName(pitchToMidi(currentPitch, index))} | LEAD
                      </div>
                    )}
                  </div>
                  
                  {/* Pitch Indicator */}
                  <div className="mb-2">
                    <div className="text-xs text-gray-400 mb-1">Pitch</div>
                    <div className="h-2 bg-gray-700 rounded">
                      <div 
                        className="h-full rounded transition-all duration-100"
                        style={{ 
                          width: `${isActive ? currentPitch * 100 : singer.pitch * 100}%`,
                          backgroundColor: singer.color 
                        }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {isActive ? 
                        `${(currentPitch * 100).toFixed(0)}%` : 
                        `${(singer.pitch * 100).toFixed(0)}%`
                      }
                    </div>
                  </div>

                  {/* Volume Indicator */}
                  <div className="mb-2">
                    <div className="text-xs text-gray-400 mb-1">Volume</div>
                    <div className="h-2 bg-gray-700 rounded">
                      <div 
                        className="h-full rounded transition-all duration-100"
                        style={{ 
                          width: `${harmonyNote ? harmonyNote.velocity * 100 : singer.volume * 100}%`,
                          backgroundColor: '#00FF00'
                        }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {harmonyNote ? 
                        `${(harmonyNote.velocity * 100).toFixed(0)}%` : 
                        `${(singer.volume * 100).toFixed(0)}%`
                      }
                    </div>
                  </div>
                  
                  {/* Vowel Indicator */}
                  {(isActive && controlHand.detected) || harmonyNote ? (
                    <div className="mt-2">
                      <div className="text-xs text-gray-400 mb-1">Vowel</div>
                      <div className={`text-center py-2 rounded font-bold text-2xl ${
                        (isActive ? controlHand.vowel : harmonyNote?.vowel) === 'A' ? 'bg-blue-900 text-blue-200' :
                        (isActive ? controlHand.vowel : harmonyNote?.vowel) === 'O' ? 'bg-red-900 text-red-200' :
                        'bg-gray-700 text-gray-400'
                      }`}>
                        {isActive 
                          ? (controlHand.vowel === 'NONE' ? '—' : controlHand.vowel)
                          : (harmonyNote?.vowel || '—')
                        }
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            
            <div className="mt-6 p-4 bg-blue-900 rounded-lg">
              <h3 className="font-medium text-blue-200 mb-2">Controls:</h3>
              <ul className="text-sm text-blue-100 space-y-1">
                <li>• <strong>Control hand:</strong> Singer selection (L/R), pitch (U/D)</li>
                <li>• <strong>Open palm</strong> = "A" vowel (blue)</li>
                <li>• <strong>Closed fist</strong> = "O" vowel (red)</li>
                <li>• <strong>Volume hand:</strong> Volume (U/D)</li>
                <li>• <strong>Colors:</strong> Green/Red = control, Cyan/Magenta = volume</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}