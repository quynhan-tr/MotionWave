// improved-harmonizer.ts - Neural network inspired harmonization
export interface Note {
  midiNote: number;
  velocity: number;
  vowel: 'A' | 'O';
  tie?: boolean;
}

export interface HarmonyResult {
  bass: Note;
  tenor: Note;
  mezzoSoprano: Note;
  soprano: Note;
}

// Neural network-style note encoding (inspired by Google's approach)
// Maps MIDI notes to vocabulary indices like in the original code
const NOTE_VOCABULARY: { [key: string]: number } = {};
const VOCABULARY_TO_NOTE: { [key: number]: string } = {};

// Initialize vocabulary for white keys only in singing range
function initializeVocabulary() {
  let index = 0;
  
  // Special tokens
  NOTE_VOCABULARY['START'] = index++;
  NOTE_VOCABULARY['END'] = index++;
  NOTE_VOCABULARY['|'] = index++; // Separator
  
  VOCABULARY_TO_NOTE[NOTE_VOCABULARY['START']] = 'START';
  VOCABULARY_TO_NOTE[NOTE_VOCABULARY['END']] = 'END';
  VOCABULARY_TO_NOTE[NOTE_VOCABULARY['|']] = '|';
  
  // White keys from C2 to C7 (expanded singing range)
  const whiteKeyPattern = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
  const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  
  for (let octave = 2; octave <= 6; octave++) {
    for (let i = 0; i < whiteKeyPattern.length; i++) {
      const midiNote = (octave + 1) * 12 + whiteKeyPattern[i];
      const noteName = `${noteNames[i]}${octave}`;
      
      // Add both tied and untied versions
      for (const tie of [true, false]) {
        const key = `(${midiNote},${tie})`;
        NOTE_VOCABULARY[key] = index;
        VOCABULARY_TO_NOTE[index] = key;
        index++;
      }
    }
  }
}

// Initialize vocabulary on module load
initializeVocabulary();

// Transition probability matrix (simplified neural network simulation)
class HarmonyNetwork {
  private transitionMatrix: number[][];
  private vocabularySize: number;
  private lastStates: number[] = [];
  private maxHistory = 8;

  constructor() {
    this.vocabularySize = Object.keys(VOCABULARY_TO_NOTE).length;
    this.initializeTransitionMatrix();
  }

  private initializeTransitionMatrix() {
    this.transitionMatrix = Array(this.vocabularySize).fill(0)
      .map(() => Array(this.vocabularySize).fill(0));
    
    // Fill with music theory-based probabilities
    Object.entries(NOTE_VOCABULARY).forEach(([fromKey, fromIdx]) => {
      if (fromKey === 'START' || fromKey === 'END' || fromKey === '|') return;
      
      const fromNote = this.parseNoteKey(fromKey);
      if (!fromNote) return;
      
      Object.entries(NOTE_VOCABULARY).forEach(([toKey, toIdx]) => {
        if (toKey === 'START' || toKey === 'END' || toKey === '|') return;
        
        const toNote = this.parseNoteKey(toKey);
        if (!toNote) return;
        
        // Calculate probability based on musical interval
        const interval = Math.abs(toNote.midiNote - fromNote.midiNote);
        let probability = 0;
        
        // Prefer smaller intervals (voice leading)
        if (interval === 0) probability = 0.3; // Same note
        else if (interval <= 2) probability = 0.25; // Step-wise motion
        else if (interval <= 4) probability = 0.2; // Small jumps
        else if (interval <= 7) probability = 0.15; // Larger intervals
        else if (interval === 12) probability = 0.08; // Octave
        else probability = 0.02; // Large jumps (discouraged)
        
        // Bonus for consonant intervals
        const consonantIntervals = [3, 4, 5, 7, 8, 9, 12]; // Major/minor thirds, fourths, fifths, etc.
        if (consonantIntervals.includes(interval % 12)) {
          probability *= 1.5;
        }
        
        // Slight preference for tied notes to create smoother harmony
        if (toNote.tie && interval === 0) {
          probability *= 1.2;
        }
        
        this.transitionMatrix[fromIdx][toIdx] = probability;
      });
      
      // Normalize probabilities for this from-state
      const sum = this.transitionMatrix[fromIdx].reduce((a, b) => a + b, 0);
      if (sum > 0) {
        this.transitionMatrix[fromIdx] = this.transitionMatrix[fromIdx].map(p => p / sum);
      }
    });
  }

  private parseNoteKey(key: string): { midiNote: number; tie: boolean } | null {
    if (!key.startsWith('(')) return null;
    
    const match = key.match(/\((\d+),(true|false)\)/);
    if (!match) return null;
    
    return {
      midiNote: parseInt(match[1]),
      tie: match[2] === 'true'
    };
  }

  // Generate next note probabilities (simulating neural network forward pass)
  generateProbabilities(currentNote: number, contextNotes: number[] = []): number[] {
    const probabilities = new Array(this.vocabularySize).fill(0);
    
    // Base probabilities from transition matrix
    if (currentNote >= 0 && currentNote < this.vocabularySize) {
      for (let i = 0; i < this.vocabularySize; i++) {
        probabilities[i] = this.transitionMatrix[currentNote][i];
      }
    }
    
    // Context influence (simplified attention mechanism)
    if (contextNotes.length > 0) {
      const contextWeight = 0.3;
      contextNotes.forEach((contextNote, distance) => {
        if (contextNote >= 0 && contextNote < this.vocabularySize) {
          const weight = contextWeight * Math.exp(-distance * 0.5); // Decay with distance
          for (let i = 0; i < this.vocabularySize; i++) {
            probabilities[i] += weight * this.transitionMatrix[contextNote][i];
          }
        }
      });
    }
    
    // Apply temperature-like softmax for more musical variation
    const temperature = 1.2;
    const maxProb = Math.max(...probabilities);
    const expProbs = probabilities.map(p => Math.exp((p - maxProb) / temperature));
    const sumExp = expProbs.reduce((a, b) => a + b, 0);
    
    return expProbs.map(p => p / sumExp);
  }

  // Sample from probability distribution (like the original argmax with randomness)
  sampleFromProbabilities(probabilities: number[]): number {
    // Add some randomness but favor higher probabilities
    const random = Math.random();
    
    // Sort indices by probability (descending)
    const indices = Array.from({length: probabilities.length}, (_, i) => i);
    indices.sort((a, b) => probabilities[b] - probabilities[a]);
    
    // Use weighted random selection from top candidates
    if (random < 0.6) return indices[0]; // 60% chance for best
    if (random < 0.8) return indices[1] || indices[0]; // 20% for second best
    if (random < 0.9) return indices[2] || indices[0]; // 10% for third best
    
    // 10% chance for more random selection
    const randomIndex = Math.floor(Math.random() * Math.min(5, indices.length));
    return indices[randomIndex];
  }
}

export class NeuralHarmonizer {
  private network: HarmonyNetwork;
  private voiceHistory: { [voice: string]: number[] } = {
    bass: [],
    tenor: [],
    mezzoSoprano: [],
    soprano: []
  };

  constructor() {
    this.network = new HarmonyNetwork();
    this.reset();
  }

  generateHarmony(
    leadVoice: 'bass' | 'tenor' | 'mezzoSoprano' | 'soprano',
    leadNote: Note,
    volume: number
  ): HarmonyResult {
    // Convert lead note to vocabulary index
    const leadKey = `(${leadNote.midiNote},${leadNote.tie || false})`;
    const leadVocabIndex = NOTE_VOCABULARY[leadKey];
    
    if (leadVocabIndex === undefined) {
      // Fallback for notes not in vocabulary
      return this.generateFallbackHarmony(leadVoice, leadNote, volume);
    }
    
    // Update lead voice history
    this.voiceHistory[leadVoice].push(leadVocabIndex);
    if (this.voiceHistory[leadVoice].length > 8) {
      this.voiceHistory[leadVoice].shift();
    }
    
    const harmony: Partial<HarmonyResult> = {};
    
    // Generate harmony for each voice
    const voices: (keyof HarmonyResult)[] = ['bass', 'tenor', 'mezzoSoprano', 'soprano'];
    voices.forEach(voice => {
      if (voice === leadVoice) {
        harmony[voice] = { ...leadNote, velocity: volume };
        return;
      }
      
      // Get context from this voice's history and the lead voice
      const voiceContext = this.voiceHistory[voice].slice(-4);
      const leadContext = this.voiceHistory[leadVoice].slice(-2);
      const context = [...voiceContext, ...leadContext];
      
      // Get last note for this voice (or use a default)
      const lastNote = voiceContext.length > 0 ? voiceContext[voiceContext.length - 1] : leadVocabIndex;
      
      // Generate probabilities and sample
      const probabilities = this.network.generateProbabilities(lastNote, context);
      const selectedIndex = this.network.sampleFromProbabilities(probabilities);
      
      // Convert back to note
      const vocabKey = VOCABULARY_TO_NOTE[selectedIndex];
      const note = this.vocabKeyToNote(vocabKey, volume * 0.6); // Harmony at 60% volume
      
      if (note) {
        harmony[voice] = note;
        this.voiceHistory[voice].push(selectedIndex);
        if (this.voiceHistory[voice].length > 8) {
          this.voiceHistory[voice].shift();
        }
      } else {
        // Fallback
        harmony[voice] = { ...leadNote, velocity: volume * 0.4 };
      }
    });
    
    return this.applyVoiceRangeConstraints(harmony as HarmonyResult);
  }

  private vocabKeyToNote(vocabKey: string, baseVolume: number): Note | null {
    if (!vocabKey || !vocabKey.startsWith('(')) return null;
    
    const parsed = vocabKey.match(/\((\d+),(true|false)\)/);
    if (!parsed) return null;
    
    const midiNote = parseInt(parsed[1]);
    const tie = parsed[2] === 'true';
    
    // Add slight volume variation
    const volumeVariation = (Math.random() - 0.5) * 0.2;
    const volume = Math.max(0.1, Math.min(1.0, baseVolume + volumeVariation));
    
    return {
      midiNote,
      velocity: volume,
      vowel: Math.random() < 0.8 ? 'A' : 'O', // Prefer 'A' but vary occasionally
      tie
    };
  }

  private applyVoiceRangeConstraints(harmony: HarmonyResult): HarmonyResult {
    const voiceRanges = {
      bass: { min: 40, max: 64 },
      tenor: { min: 48, max: 69 },
      mezzoSoprano: { min: 57, max: 77 },
      soprano: { min: 60, max: 84 }
    };
    
    Object.entries(voiceRanges).forEach(([voice, range]) => {
      const voiceKey = voice as keyof HarmonyResult;
      const note = harmony[voiceKey];
      
      if (note.midiNote < range.min) {
        note.midiNote += 12; // Octave up
      } else if (note.midiNote > range.max) {
        note.midiNote -= 12; // Octave down
      }
      
      // Ensure still in range after octave adjustment
      note.midiNote = Math.max(range.min, Math.min(range.max, note.midiNote));
    });
    
    return harmony;
  }

  private generateFallbackHarmony(
    leadVoice: string,
    leadNote: Note,
    volume: number
  ): HarmonyResult {
    // Simple chord-based fallback
    const intervals = {
      bass: -12,
      tenor: -7,
      mezzoSoprano: -3,
      soprano: 0
    };
    
    const harmony: Partial<HarmonyResult> = {};
    Object.entries(intervals).forEach(([voice, interval]) => {
      const voiceKey = voice as keyof HarmonyResult;
      harmony[voiceKey] = {
        midiNote: leadNote.midiNote + interval,
        velocity: voice === leadVoice ? volume : volume * 0.6,
        vowel: leadNote.vowel
      };
    });
    
    return this.applyVoiceRangeConstraints(harmony as HarmonyResult);
  }

  reset(): void {
    Object.keys(this.voiceHistory).forEach(voice => {
      this.voiceHistory[voice] = [NOTE_VOCABULARY['START']];
    });
  }

  getCurrentHarmony(): HarmonyResult | null {
    // Could return last generated harmony if needed
    return null;
  }
}

// Export both harmonizers for comparison
export { Harmonizer } from './harmonizer';
export const createHarmonizer = (useNeural: boolean = true) => {
  return useNeural ? new NeuralHarmonizer() : new Harmonizer();
};