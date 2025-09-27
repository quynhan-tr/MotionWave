'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

// Audio synthesis class using Web Audio API directly
class VoiceScanner {
  private audioContext: AudioContext | null = null;
  private oscillators: { [key: string]: OscillatorNode | null } = {};
  private gainNodes: { [key: string]: GainNode } = {};
  private filterNodes: { [key: string]: BiquadFilterNode } = {};
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create audio nodes for each voice
      const voices = ['bass', 'tenor', 'mezzoSoprano', 'soprano'];
      
      voices.forEach(voice => {
        // Create gain node for volume control
        this.gainNodes[voice] = this.audioContext!.createGain();
        this.gainNodes[voice].gain.value = 0.3; // Default volume
        
        // Create filter for vowel formants
        this.filterNodes[voice] = this.audioContext!.createBiquadFilter();
        this.filterNodes[voice].type = 'bandpass';
        this.filterNodes[voice].Q.value = 2;
        this.filterNodes[voice].frequency.value = this.getFormantFrequency(voice, 'A');
        
        // Connect filter to gain to destination
        this.filterNodes[voice].connect(this.gainNodes[voice]);
        this.gainNodes[voice].connect(this.audioContext!.destination);
        
        // Initialize oscillator as null
        this.oscillators[voice] = null;
      });
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Web Audio:', error);
    }
  }

  private getFormantFrequency(voice: string, vowel: 'A' | 'O'): number {
    const formants = {
      bass: { A: 600, O: 400 },
      tenor: { A: 650, O: 430 },
      mezzoSoprano: { A: 700, O: 460 },
      soprano: { A: 750, O: 500 }
    };
    
    return formants[voice as keyof typeof formants]?.[vowel] || 600;
  }

  private midiToFrequency(midiNote: number): number {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  playNote(voice: string, midiNote: number, velocity: number, vowel: 'A' | 'O') {
    if (!this.initialized || !this.audioContext) return;
    
    // Stop current oscillator if playing
    this.stopNote(voice);
    
    // Create new oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = this.midiToFrequency(midiNote);
    
    // Connect to filter chain
    oscillator.connect(this.filterNodes[voice]);
    
    // Update filter frequency for vowel
    this.filterNodes[voice].frequency.setTargetAtTime(
      this.getFormantFrequency(voice, vowel),
      this.audioContext.currentTime,
      0.1
    );
    
    // Set volume
    this.gainNodes[voice].gain.setTargetAtTime(
      velocity * 0.3,
      this.audioContext.currentTime,
      0.05
    );
    
    // Start oscillator
    oscillator.start();
    this.oscillators[voice] = oscillator;
  }

  updateNote(voice: string, midiNote: number, velocity: number, vowel: 'A' | 'O') {
    if (!this.initialized || !this.audioContext) return;
    
    // Update filter frequency for vowel changes
    this.filterNodes[voice].frequency.setTargetAtTime(
      this.getFormantFrequency(voice, vowel),
      this.audioContext.currentTime,
      0.05
    );
    
    // Update volume
    this.gainNodes[voice].gain.setTargetAtTime(
      velocity * 0.3,
      this.audioContext.currentTime,
      0.05
    );
    
    // Update frequency if oscillator exists
    if (this.oscillators[voice]) {
      this.oscillators[voice]!.frequency.setTargetAtTime(
        this.midiToFrequency(midiNote),
        this.audioContext.currentTime,
        0.05
      );
    }
  }

  stopNote(voice: string) {
    if (!this.initialized || !this.audioContext) return;
    
    const oscillator = this.oscillators[voice];
    if (oscillator) {
      try {
        oscillator.stop();
      } catch (e) {
        // Oscillator may already be stopped
      }
      this.oscillators[voice] = null;
    }
  }

  setVolume(voice: string, volume: number) {
    if (!this.initialized || !this.audioContext) return;
    
    this.gainNodes[voice].gain.setTargetAtTime(
      volume * 0.3,
      this.audioContext.currentTime,
      0.1
    );
  }

  dispose() {
    // Stop all oscillators
    Object.keys(this.oscillators).forEach(voice => {
      this.stopNote(voice);
    });
    
    // Clean up audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.oscillators = {};
    this.gainNodes = {};
    this.filterNodes = {};
    this.initialized = false;
  }
}
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
  
  // Audio synthesis state
  const [voiceSynth] = useState(() => new VoiceScanner());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const previousNotesRef = useRef<{ [voice: string]: number }>({});
  
  // Manual controls for testing audio when MediaPipe fails
  const [manualMode, setManualMode] = useState(false);
  const [manualPitch, setManualPitch] = useState(0.5);
  const [manualVolume, setManualVolume] = useState(0.7);
  const [manualVowel, setManualVowel] = useState<'A' | 'O'>('A');
  const [manualSinger, setManualSinger] = useState(1); // Default to Tenor

  // Initialize audio when user enables it
  const initializeAudio = useCallback(async () => {
    try {
      await voiceSynth.initialize();
      setAudioEnabled(true);
    } catch (error) {
      console.error('Failed to initialize audio:', error);
    }
  }, [voiceSynth]);

  // Play harmony notes
  const playHarmony = useCallback((harmony: HarmonyResult) => {
    if (!audioEnabled) return;
    
    const voices = ['bass', 'tenor', 'mezzoSoprano', 'soprano'] as const;
    
    voices.forEach(voice => {
      const note = harmony[voice];
      const previousNote = previousNotesRef.current[voice];
      
      // Only trigger new note if it changed
      if (note.midiNote !== previousNote) {
        voiceSynth.playNote(voice, note.midiNote, note.velocity, note.vowel);
        previousNotesRef.current[voice] = note.midiNote;
      } else {
        // Update existing note (vowel/volume changes)
        voiceSynth.updateNote(voice, note.midiNote, note.velocity, note.vowel);
      }
      
      // Set volume
      voiceSynth.setVolume(voice, note.velocity);
    });
    
    setIsPlaying(true);
  }, [audioEnabled, voiceSynth]);

  // Stop all voices
  const stopAllVoices = useCallback(() => {
    if (!audioEnabled) return;
    
    const voices = ['bass', 'tenor', 'mezzoSoprano', 'soprano'];
    voices.forEach(voice => {
      voiceSynth.stopNote(voice);
    });
    
    previousNotesRef.current = {};
    setIsPlaying(false);
  }, [audioEnabled, voiceSynth]);
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

  // Generate harmony when lead voice changes (supports manual mode)
  const updateHarmony = useCallback((activeSingerIndex: number, pitch: number, volume: number, vowel: 'A' | 'O' | 'NONE') => {
    if (activeSingerIndex === -1 || vowel === 'NONE') {
      stopAllVoices();
      return;
    }
    
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
    
    // Play the harmony if audio is enabled
    if (audioEnabled) {
      playHarmony(harmony);
    }
  }, [harmonizer, pitchToMidi, audioEnabled, playHarmony, stopAllVoices]);

  // Manual harmony trigger for testing
  const triggerManualHarmony = useCallback(() => {
    updateHarmony(manualSinger, manualPitch, manualVolume, manualVowel);
  }, [updateHarmony, manualSinger, manualPitch, manualVolume, manualVowel]);

  // Update manual harmony when controls change
  useEffect(() => {
    if (manualMode && audioEnabled) {
      triggerManualHarmony();
    }
  }, [manualMode, audioEnabled, triggerManualHarmony, manualPitch, manualVolume, manualVowel, manualSinger]);

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
    
    // Draw soprano label only
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    const sopranoText = 'Soprano Control';
    const textWidth = ctx.measureText(sopranoText).width;
    const textX = (canvas.width - textWidth) / 2;
    ctx.strokeText(sopranoText, textX, 40);
    ctx.fillText(sopranoText, textX, 40);

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
        
        // Draw pitch indicator line across full width
        const pitchY = controlHandData.y * canvas.height;
        ctx.strokeStyle = '#FFD700'; // Soprano gold color
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, pitchY);
        ctx.lineTo(canvas.width, pitchY);
        ctx.stroke();

        // Draw vowel indicator in center
        if (controlHandData.vowel !== 'NONE') {
          ctx.font = 'bold 48px Arial';
          ctx.fillStyle = '#FFD700';
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 4;
          const vowelText = controlHandData.vowel;
          const textWidth = ctx.measureText(vowelText).width;
          const textX = (canvas.width - textWidth) / 2;
          const textY = pitchY - 30;
          
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
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@latest/hands.js');
          console.log('MediaPipe loaded successfully');
          
          // Initialize MediaPipe Hands
          const hands = new (window as any).Hands({
            locateFile: (file: string) => {
              return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
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
          setError('MediaPipe failed to load. Switch to manual mode to test audio.');
          setIsLoading(false);
          setManualMode(true); // Automatically enable manual mode
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

    // Cleanup function
    return () => {
      if (audioEnabled) {
        stopAllVoices();
        voiceSynth.dispose();
      }
    };
  }, [onResults, handPreference, audioEnabled, stopAllVoices, voiceSynth]);

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
          <div className="flex items-center justify-center gap-4 mb-2">
            <span className="text-lg">
              <strong>{handPreference === 'right' ? 'Right' : 'Left'} hand:</strong> Pitch & Vowel | 
              <strong> {handPreference === 'right' ? 'Left' : 'Right'} hand:</strong> Volume
            </span>
            
            {/* Audio Controls */}
            <div className="flex items-center gap-2">
              {!audioEnabled ? (
                <button
                  onClick={initializeAudio}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  🎵 Enable Audio
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm ${
                    isPlaying ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                  }`}>
                    {isPlaying ? '🎵 Playing' : '🔇 Silent'}
                  </div>
                  <button
                    onClick={stopAllVoices}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                  >
                    Stop
                  </button>
                  
                  {/* Manual Mode Toggle */}
                  <button
                    onClick={() => setManualMode(!manualMode)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      manualMode ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
                    }`}
                  >
                    Manual
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Manual Controls */}
          {manualMode && audioEnabled && (
            <div className="mb-4 p-4 bg-blue-900/20 rounded-lg">
              <h3 className="text-lg font-semibold mb-3 text-center">Manual Orchestra Controls</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Singer Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">Lead Singer</label>
                  <select 
                    value={manualSinger}
                    onChange={(e) => setManualSinger(parseInt(e.target.value))}
                    className="w-full p-2 bg-gray-700 text-white rounded"
                  >
                    <option value={0}>Bass</option>
                    <option value={1}>Tenor</option>
                    <option value={2}>Mezzo-Soprano</option>
                    <option value={3}>Soprano</option>
                  </select>
                </div>
                
                {/* Pitch */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Pitch: {midiToNoteName(pitchToMidi(manualPitch, manualSinger))}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={manualPitch}
                    onChange={(e) => setManualPitch(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                {/* Volume */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Volume: {(manualVolume * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={manualVolume}
                    onChange={(e) => setManualVolume(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                {/* Vowel */}
                <div>
                  <label className="block text-sm font-medium mb-2">Vowel</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setManualVowel('A')}
                      className={`flex-1 py-2 px-3 rounded text-sm font-bold ${
                        manualVowel === 'A' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      A
                    </button>
                    <button
                      onClick={() => setManualVowel('O')}
                      className={`flex-1 py-2 px-3 rounded text-sm font-bold ${
                        manualVowel === 'O' ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      O
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {isLoading && (
          <div className="text-center mb-6">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
            <p className="mt-2 text-gray-300">Initializing camera and hand tracking...</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera Feed */}
          <div className="lg:col-span-2">
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
            
            <div className="mt-4 text-center">
              <div className="mb-4">
                <h3 className="font-semibold text-lg mb-2">Soprano Control</h3>
                <p className="text-gray-300">
                  Control Hand: <span className="font-bold text-green-400">{controlHand.detected ? 'DETECTED' : 'NOT DETECTED'}</span>
                </p>
                {controlHand.detected && (
                  <div className="space-y-2 mt-2">
                    <div className="text-3xl font-bold text-yellow-400">
                      ♪ {midiToNoteName(pitchToMidi(currentPitch, 3))}
                    </div>
                    <div className="flex items-center justify-center gap-4">
                      <span className="text-gray-300">
                        Pitch: {(currentPitch * 100).toFixed(0)}%
                      </span>
                      <span className={`font-bold text-2xl ${
                        controlHand.vowel === 'A' ? 'text-blue-400' : 
                        controlHand.vowel === 'O' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {controlHand.vowel}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mb-4">
                <p className="text-gray-300">
                  Volume Hand: <span className="font-bold text-cyan-400">{volumeHand.detected ? 'DETECTED' : 'NOT DETECTED'}</span>
                </p>
                {volumeHand.detected && (
                  <p className="text-gray-300">
                    Volume: <span className="font-bold text-green-400">{(currentVolume * 100).toFixed(0)}%</span>
                  </p>
                )}
              </div>
                
              {/* Current Harmony Display */}
              {currentHarmony && (
                <div className="p-3 bg-gray-800 rounded-lg inline-block">
                  <div className="text-sm text-gray-400 mb-2">Four-Part Harmony:</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-amber-600">S: {midiToNoteName(currentHarmony.soprano.midiNote)}</div>
                    <div className="text-pink-400">M: {midiToNoteName(currentHarmony.mezzoSoprano.midiNote)}</div>
                    <div className="text-blue-400">T: {midiToNoteName(currentHarmony.tenor.midiNote)}</div>
                    <div className="text-amber-800">B: {midiToNoteName(currentHarmony.bass.midiNote)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Simple Control Panel */}
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-4">Virtual Choir</h2>
              <div className="p-4 bg-gray-800 rounded-lg">
                <div className="text-lg font-medium text-yellow-400 mb-2">Soprano (Lead)</div>
                <div className="text-sm text-gray-400 mb-4">You control the soprano voice</div>
                
                {currentHarmony && (
                  <div className="space-y-3">
                    {/* Soprano */}
                    <div className="p-3 bg-yellow-900/30 rounded border border-yellow-600">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-yellow-400">Soprano</span>
                        <span className="text-yellow-300">♪ {midiToNoteName(currentHarmony.soprano.midiNote)}</span>
                      </div>
                      <div className="text-xs text-yellow-200 mt-1">
                        LEAD - {(currentHarmony.soprano.velocity * 100).toFixed(0)}% | {currentHarmony.soprano.vowel}
                      </div>
                    </div>
                    
                    {/* Harmony Voices */}
                    <div className="p-3 bg-gray-700 rounded">
                      <div className="text-sm text-gray-300 mb-2 font-medium">Auto Harmony:</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-pink-400">Mezzo-Soprano</span>
                          <span>♪ {midiToNoteName(currentHarmony.mezzoSoprano.midiNote)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-400">Tenor</span>
                          <span>♪ {midiToNoteName(currentHarmony.tenor.midiNote)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-amber-700">Bass</span>
                          <span>♪ {midiToNoteName(currentHarmony.bass.midiNote)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 bg-blue-900 rounded-lg">
              <h3 className="font-medium text-blue-200 mb-2">How to Use:</h3>
              <ul className="text-sm text-blue-100 space-y-1">
                <li>• Use your <strong>dominant hand</strong> to control soprano</li>
                <li>• Move <strong>up/down</strong> to change pitch</li>
                <li>• <strong>Open palm</strong> = "A" vowel</li>
                <li>• <strong>Closed fist</strong> = "O" vowel</li>
                <li>• Use your <strong>other hand</strong> to control volume</li>
                <li>• The other 3 voices harmonize automatically</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
