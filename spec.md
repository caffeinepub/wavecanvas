# WaveCanvas – Wavetable Sound Engine

## Current State
New project. No existing code.

## Requested Changes (Diff)

### Add
- Full wavetable synthesis engine running in AudioWorklet
- Interactive 2D canvas: X = wavetable frame index, Y = amplitude (-1 to +1), optional color = harmonic weighting
- Brush modes: Draw, Smooth, Add Harmonics, Randomize Partials, Morph between frames, Harmonic Lock
- Gesture controls: horizontal drag = morph position, vertical drag = pitch mod, pinch = unison detune, long press = select frame, two-finger swipe = scan speed
- Wavetable structure: 64–256 frames, 512–2048 samples/frame, preallocated Float32Array buffers
- Interpolation: linear between samples, linear/cubic between frames, optional FFT spectral morph mode
- Oscillator engine: up to 4 oscillators per voice, each with wavetable osc, sub osc (-1 oct sine/square), noise gen (white/pink), phase randomization, analog drift, unison (1–8 voices with stereo spread)
- Modulation system: 3 LFOs (BPM-syncable), 3 ADSR envelopes, 8-slot modulation matrix; targets: wavetable position, scan speed, amplitude, filter cutoff/resonance, harmonic emphasis, stereo spread, phase distortion
- Dual filter: Filter 1 multimode (LP/HP/BP/Notch), Filter 2 serial/parallel; drive stage, key tracking, envelope amount, analog cutoff drift
- Effects: Chorus (Roland-style), stereo tempo-synced delay, reverb, soft saturation, output limiter; all toggleable
- Spectral mode: FFT domain harmonic editing
- Morph lanes: automated morph paths across frames
- Snapshot system: save/recall full engine state (stored in backend)
- Arpeggiator with pattern editor
- MIDI + QWERTY keyboard support
- **Wavetable Performance Mode** button: enables 2–4 oscs, 64–256 frames, full mod matrix, unison, dual filter
  - 8 presets: Evolving Glass Pad, Digital Growl Bass, Morphing Lead, Metallic Texture Drone, Supersaw Wall, Formant Vocal Pad, Plucked Digital Arp, Chaotic Morph FX
- **SC Preset Mode** button: static PCM-style waveforms, restricted modulation, clean ROMpler behavior, scrollable dropdown
  - Presets: SC Acoustic Piano, SC Electric Piano, SC Strings Ensemble, SC Synth Brass, SC Bass, SC Synth Pad, SC Flute, SC Orchestra Hit
  - Engine limits: 4-slot mod matrix, no morphing, no harmonic painting, resonance <40%, unison max 2
  - Optional GM Compatibility Mode button
- **Experimental Wavetable Pack** button: random phase, pitch drift ±3–5 cents, wavetable jitter, "Instability Amount" knob
  - 8 presets: Fractured Glass Pad, Mutated Bass Organism, Chaos Lead, Broken Music Box, Digital Creature Drone, Glitch Perc Engine, Warped String Synth, Unstable Arp Matrix
- **Groove Sequencer** (Roland-style drum machine):
  - BPM 30–300, swing 0–75%, 16/32/64 steps, 64 pattern slots, pattern chaining, song mode
  - 10 drum voices: Kick, Snare, Clap, Closed Hat, Open Hat, Low Tom, Mid Tom, High Tom, Rim, Cymbal
  - Each voice: synthesized engine (not samples), tune/decay/level/pan/accent/drive controls
  - Step controls: tap on/off, long press for velocity/micro-timing/probability/flam/ratchet
  - Per-step params: velocity, probability, micro-timing, pitch offset, reverse trigger, conditional trigger
  - Humanize mode
  - Drum synth details: kick (sine + pitch env + click transient), snare (noise + tonal body), hats (metallic noise, open chokes closed), clap (multi-pulse noise), toms (tuned sine/tri), cymbal (metallic noise cluster)
  - Mixer: per-voice volume/pan/mute/solo; global compressor, tape saturation, reverb/delay send, sidechain from kick
  - Live mode: quantized pattern switching, roll button, mute groups, fill button
  - Subdivide button (1/32), triplet mode
  - Integration: shares BPM, can trigger synth envelopes, kick sidechain ducking on pads
  - Optional: parameter locks, Euclidean rhythm generator, randomize pattern
  - Dark hardware-style UI, glowing step buttons, smooth playhead, accent color differentiation

### Modify
Nothing (new project).

### Remove
Nothing (new project).

## Implementation Plan

1. **Backend (Motoko)**: Snapshot/preset storage — save and load named engine state snapshots as JSON blobs. Simple CRUD: create, read, update, delete snapshots.
2. **AudioWorklet**: Implement wavetable oscillator processor, ADSR envelope, dual filter, effects chain (chorus, delay, reverb, saturation, limiter), drum synth voices — all running off the main thread with preallocated buffers.
3. **Wavetable Canvas**: React canvas component with brush modes, frame display, morph lane overlay, spectral mode view.
4. **Synth Control Panel**: Oscillator section, mod matrix UI, filter section, effects toggles, global controls (wavetable position knob, unison, drift, drive, FX mix).
5. **Mode Buttons**: Wavetable Performance Mode, SC Preset Mode (with scrollable dropdown), Experimental Mode (with Instability knob), GM Compatibility toggle.
6. **Presets**: Hard-coded parameter sets for all 24 presets across three modes, loaded into engine on selection.
7. **Groove Sequencer Panel**: Step grid (16×10), per-step popup editor, drum voice mixer strip, pattern management, BPM/swing controls, live mode controls.
8. **MIDI + QWERTY**: WebMIDI API integration, keyboard note mapping, pitch bend, mod wheel.
9. **Arpeggiator**: Pattern editor, BPM sync, latch mode.
10. **Snapshot System**: Save/load from backend canister, named snapshots list.
