// TypeScript interfaces for Google Blob Opera Harmonizer

export interface HarmonizerNote {
  midiNote: number;
  tie: boolean;
  probability: number;
}

export interface HarmonyChord {
  soprano: HarmonizerNote;
  alto: HarmonizerNote;
  tenor: HarmonizerNote;
  bass: HarmonizerNote;
}

export interface HarmonizerMessage {
  type: 'Loaded' | 'Notes';
  notes?: HarmonizerNote[];
}

export interface HarmonizerWorkerMessage {
  data: HarmonizerMessage;
}

export interface MelodyNote {
  midiNote: number;
  noteName: string;
  timestamp: number;
}

export interface HarmonySequence {
  id: string;
  title: string;
  melody: MelodyNote[];
  harmonies: HarmonyChord[];
  createdAt: Date;
}

export interface HarmonizerState {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  currentSequence: HarmonySequence | null;
  isPlaying: boolean;
}

// Utility type for MIDI note range (21-108 is standard piano range)
export type MidiNote = number & { __brand: 'MidiNote' };

// Voice types for the harmonizer
export type VoiceType = 'soprano' | 'alto' | 'tenor' | 'bass';

// Note names for display
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type NoteName = typeof NOTE_NAMES[number];

// Predefined melody examples
export interface MelodyExample {
  id: string;
  title: string;
  description: string;
  melody: number[];
  difficulty: 'easy' | 'medium' | 'hard';
  genre: 'classical' | 'folk' | 'pop' | 'jazz';
}

// Export validation functions
export const isValidMidiNote = (note: number): note is MidiNote => {
  return Number.isInteger(note) && note >= 21 && note <= 108;
};

export const midiToNoteName = (midi: number): string => {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
};

export const noteNameToMidi = (noteName: string): number | null => {
  const match = noteName.match(/^([A-G]#?)(\d+)$/);
  if (!match) return null;
  
  const [, note, octave] = match;
  const noteIndex = NOTE_NAMES.indexOf(note as NoteName);
  if (noteIndex === -1) return null;
  
  return (parseInt(octave) + 1) * 12 + noteIndex;
};

// Voice range definitions (typical SATB ranges)
export const VOICE_RANGES = {
  soprano: { min: 60, max: 84, name: 'Soprano' }, // C4 to C6
  alto: { min: 55, max: 72, name: 'Alto' },       // G3 to C5
  tenor: { min: 48, max: 67, name: 'Tenor' },     // C3 to G4
  bass: { min: 36, max: 55, name: 'Bass' }        // C2 to G3
} as const;
