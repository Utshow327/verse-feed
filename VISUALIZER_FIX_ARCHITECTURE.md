# Visualizer 60FPS Lag-Free Architecture & Instant Audio Response

> **Git Milestone Tag:** `visualizer-lag-fixed-v3.9.123`  
> **App Version:** `v3.9.123` (Build `302`)  
> **Date:** September 2026  

---

## 1. The Root Cause of the Visualizer Lag

JavaScript in browsers and Android WebViews executes on a **single main UI thread**. That single thread is responsible for:
1. Running `requestAnimationFrame` at 60Hz to clear and repaint the `<canvas id="waveform-canvas">`.
2. Calculating quadratic Bézier wave physics and drawing multi-layer gradient fills.
3. Handling touch gestures, card swipes, and CSS transitions.

### Why It Lagged Previously:
When Piper TTS (an ONNX WebAssembly neural text-to-speech engine) synthesized audio, it performed millions of floating-point matrix multiplications. Because it was running on the main UI thread, it completely saturated the CPU for 200–600ms per sentence chunk. The browser's event loop was starved, causing `requestAnimationFrame` to drop frames or freeze completely. When verses changed, the visualizer stuttered or flatlined.

---

## 2. Why There Was a "Reaction Delay"

Even after moving voice calculations to a background worker, there was a noticeable delay before the visualizer reacted to the speaker's voice.

### The Cause of the Delay:
Inside `script_v14.js`, the visualizer `draw()` loop contained this condition:
```javascript
if (audioAnalyser && isSpeaking && !isPaused && !isGenerating && !isQueueGenerating)
```
Playback starts **immediately after chunk 0 is ready**. However, `isQueueGenerating` remained `true` while the background worker generated chunk 1, chunk 2, and chunk 3. 

Because `isQueueGenerating` was `true`, the visualizer was locked out of reading `audioAnalyser.getByteFrequencyData()`. It fell back to the idle "breathing wave" until **all** chunks finished generating. Only then did it suddenly react to the voice.

---

## 3. The Complete Two-Part Fix

### Part A: Off-Thread Neural Speech Synthesis (Background Web Worker)
1. **`libs/piper/piper-worker.js`:**
   - A dedicated ES module Web Worker runs on a separate CPU core.
   - It instantiates `TtsSession.create` and performs all `predict(text)` calculations off the main thread.
   - It transfers raw PCM audio buffers back to the main thread via zero-copy `ArrayBuffer` transfer (`self.postMessage({ ... }, [arrayBuffer])`).
   - Main thread CPU usage during synthesis drops to **~0%**, leaving the UI thread 100% free for 60fps rendering.

2. **`libs/piper/piper-bundle.js` Patch:**
   - Changed `'caches' in window` to `'caches' in self` (lines 19652, 19689, 19715) so Piper's ONNX model cache functions properly in both Web Worker and Window scopes.

3. **Background Next-Verse Pre-generation:**
   - `pregenerateNextVerseAudio()`: While the user is listening to the final sentence of the current verse, the worker quietly computes chunk 0 of the upcoming verse in advance. When the verse advances, audio starts with zero delay.

### Part B: Instant Visualizer Audio Reaction
In `script_v14.js` (inside `startWaveformVisualizer` -> `draw`):
```javascript
const isAudioPlaying = audioAnalyser && isSpeaking && !isPaused && !isGenerating && currentAudioNode;
if (isAudioPlaying) {
    audioAnalyser.getByteFrequencyData(visualizerDataArray);
    let sum = 0;
    const len = visualizerDataArray.length;
    for (let i = 0; i < len; i++) sum += visualizerDataArray[i];
    const avgVolume = sum / len / 255.0;

    // Immediate, snappy response on the very first syllable of speech
    if (avgVolume > 0.005) {
        visualizerSmoothedVol += (avgVolume - visualizerSmoothedVol) * 0.38;
    } else {
        visualizerSmoothedVol += (avgVolume - visualizerSmoothedVol) * 0.22;
    }
} else if (isGenerating || isQueueGenerating) {
    // Breathing wave only when waiting for audio to start
    const breathTarget = 0.12 + 0.06 * Math.sin(time * 3.2);
    visualizerSmoothedVol += (breathTarget - visualizerSmoothedVol) * 0.12;
} else {
    visualizerSmoothedVol *= 0.90;
}
```
**Result:** The instant `currentAudioNode` starts playing chunk 0, the visualizer immediately begins reading real-time frequency data. The waveform dances from the very first millisecond of speech.

---

## 4. How to Inspect or Restore in Git Anytime

If anyone ever touches the visualizer or TTS in the future and causes issues, you can reference or restore this exact milestone using Git:

### View this exact version:
```powershell
git show visualizer-lag-fixed-v3.9.123
```

### See the exact diff that fixed it:
```powershell
git diff visualizer-lag-fixed-v3.9.123~1 visualizer-lag-fixed-v3.9.123
```

### Restore these files if ever dangled in the future:
```powershell
git checkout visualizer-lag-fixed-v3.9.123 -- libs/piper/ script_v14.js
```
