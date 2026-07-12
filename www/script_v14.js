let religionVerses = {};
let religionBooks = {};
let globalSelectedRels = null;
try {
    const rawRels = localStorage.getItem('globalSelectedRels');
    if (rawRels !== null) {
        const parsed = JSON.parse(rawRels);
        if (Array.isArray(parsed)) {
            globalSelectedRels = parsed;
        } else if (typeof parsed === 'string') {
            globalSelectedRels = [parsed];
        }
    }
} catch (e) {
    globalSelectedRels = null;
}
let verseBatches = { general: [] };
let currentBatchIndex = { general: 0 };
let currentVerseIndex = { general: 0 };
let savedVerses = [];
try {
    const rawSaved = localStorage.getItem('savedVerses');
    if (rawSaved) {
        const parsedSaved = JSON.parse(rawSaved);
        if (Array.isArray(parsedSaved)) savedVerses = parsedSaved;
    }
} catch (e) {
    savedVerses = [];
}
let audio;
let currentTrack = 0;
const musicTracks = [
    'https://www.fesliyanstudios.com/download-link.php?src=i&id=897',
    'https://www.fesliyanstudios.com/download-link.php?src=i&id=310',
    'https://www.fesliyanstudios.com/download-link.php?src=i&id=3007',
];
let currentReligion = '';
let currentBookName = '';

// Audio State
let chapScrollTimeout = null;
let voiceScrollTimeout = null;
let isSpeaking = false;
let isPaused = false;
let isGenerating = false;
let currentUtterance = null;
let lastSpeakClick = 0;
// selectedVoice is now initialized further down
let autoNextBook = false;
let autoMode = false;
let lastAnnouncedChapter = null;
let allVersesUsed = { general: new Set() };
let bookMarkedVerse = JSON.parse(localStorage.getItem('bookMarkedVerse')) || {};
let bookVoiceCurrentVerse = 0;
let bookVoiceTotalVerses = 0;
let currentBookContent = {};
let chapterList = [];
let globalVerseMap = [];
// Voice Settings
let selectedVoice = localStorage.getItem('selectedVoice') || 'en_GB-alan-medium';
let loadedVoices = new Set();
const MIN_CHAR_LIMIT = 70;
const maxCharLimit = 210;
let darkModeStr = localStorage.getItem('darkModeEnabled');
let darkModeEnabled = darkModeStr === null ? true : darkModeStr === 'true';
const religions = ['Christianity', 'Islam', 'Hinduism', 'Sikhism', 'Judaism', 'Buddhism', 'Philosophy'];

const dataUrls = {
    Christianity: ['./data/bible.json?v=20'],
    Islam: ['./data/quran_v2.json?v=20', './data/hadiths_v2.json?v=20'],
    Hinduism: ['./data/gita.json?v=20', './data/hindu_books.json?v=20'],
    Judaism: ['./data/sefaria.json?v=20'],
    Sikhism: ['./data/gurbani.json?v=20'],
    Buddhism: ['./data/buddhism.json?v=20'],
    Philosophy: ['./data/philosophy.json?v=20']
};
let loadedReligions = new Set();
// Settings
let ttsAnnounceSource = localStorage.getItem('ttsAnnounceSource') === 'true';

let ttsRandomVoice = localStorage.getItem('ttsRandomVoice') === 'true';

const voiceBaseLengths = {
    'en_GB-alan-medium': 0.9,
    'en_GB-alba-medium': 1.25,
    'en_US-libritts_r-medium': 1.66
};
// Rendering Variables
let currentRenderedChapter = null;
let chapterStartIndices = {};
// Gesture Variables
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
// Onboarding Temp Selection
let onboardingSelection = new Set();
// Bookmark / Album state
let selectedSavedAlbum = null;
let createdAlbums = JSON.parse(localStorage.getItem('createdAlbums') || '[]');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let unlockTriggered = false;

function unlockAudio() {
    if (unlockTriggered) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // Play a silent oscillator to force iOS WebKit to fully unlock the audio engine
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(0);
        osc.stop(audioCtx.currentTime + 0.01);
    } catch (e) {}
    
    unlockTriggered = true;
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('mousedown', unlockAudio);
    document.removeEventListener('touchend', unlockAudio);
}

document.addEventListener('touchstart', unlockAudio, {passive: true});
document.addEventListener('mousedown', unlockAudio, {passive: true});
document.addEventListener('touchend', unlockAudio, {passive: true});
document.addEventListener('pointerdown', unlockAudio, {passive: true});
document.addEventListener('keydown', unlockAudio, {passive: true});
document.addEventListener('click', unlockAudio, {passive: true});

let noiseBuffer = null;
function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const len = audioCtx.sampleRate * 0.015; // 15ms
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
        output[i] = Math.random() * 2 - 1; // Pure white noise
    }
    return noiseBuffer;
}

function playScrollSound() {
    if (audioCtx.state === 'suspended') return;
    try {
        const source = audioCtx.createBufferSource();
        source.buffer = getNoiseBuffer();
        
        // Lowpass filter makes it a dull mechanical plastic "click" rather than harsh static
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.002);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.014);
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime + 0.015);
        
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        source.start(audioCtx.currentTime);
    } catch (e) {}
}

let lastActiveVoiceIdx = -1;
let lastActiveChapterIdx = -1;
// Scroll Sync Flag
let isProgrammaticScroll = false;
// (System TTS fallback setup removed, purely using offline Piper TTS)
async function initApp() {
    applyAutoSpeed(selectedVoice);
    try {
        addSelectionListeners();

        const darkToggle = document.getElementById('dark-mode-toggle');
        updateDarkModeIcon(darkModeEnabled);
        darkToggle.addEventListener('click', () => {
            darkModeEnabled = !darkModeEnabled;
            localStorage.setItem('darkModeEnabled', darkModeEnabled);
            updateDarkModeIcon(darkModeEnabled);
            if (darkModeEnabled) {
                document.body.setAttribute('data-theme', 'dark');
            } else {
                document.body.removeAttribute('data-theme');
            }
        });
        if (darkModeEnabled) {
            document.body.setAttribute('data-theme', 'dark');
        }

        audio = document.getElementById('audio');
        audio.volume = 0.5;
        audio.src = musicTracks[currentTrack];
        audio.addEventListener('ended', nextTrack);
        if (globalSelectedRels === null) {
            // Bypass onboarding entirely and select all religions by default
            globalSelectedRels = [...religions];
            localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
        }
        
        // Setup smooth fill tracking for loading screen
        const diskWaveform = document.querySelector('.disk-waveform');
        let totalPreloadItems = 2; // 1 for data, 1 for selected voice
        let completedPreloads = 0;
        let targetFill = 0;
        let currentFill = 0;

        const fillInterval = setInterval(() => {
            currentFill += (targetFill - currentFill) * 0.25;
            const rounded = Math.round(currentFill);
            if (diskWaveform) {
                diskWaveform.style.setProperty('--app-fill-level', rounded + '%');
                diskWaveform.style.setProperty('--app-progress', (rounded / 100).toFixed(3));
            }
        }, 30);

        function updateProgress() {
            completedPreloads++;
            targetFill = (completedPreloads / totalPreloadItems) * 100;
        }

        // Step 1: Load religion data
        await loadSelectedData();
        updateProgress();

        // Step 2: Preload Piper TTS voice
        try {
            await initPiper(selectedVoice);
        } catch(e) {}
        updateProgress();

        // Step 3: Do heavy JS initialization before the animation starts
        initializeVerseFeed();
        setupGestures();
        setupWheelListeners();
        
        // Wait until smooth fill catches up
        let waitLoops = 0;
        while (currentFill < 98 && waitLoops < 20) {
            await new Promise(r => setTimeout(r, 50));
            waitLoops++;
        }

        // Complete fill to 100%
        clearInterval(fillInterval);
        if (diskWaveform) {
            diskWaveform.style.setProperty('--app-fill-level', '100%');
            diskWaveform.style.setProperty('--app-progress', '1');
        }

        await new Promise(r => setTimeout(r, 200));

        // Switch target section in background
        goTo('verse-feed');

        // Add loaded class to trigger full-screen expansion animation
        const loaderEl = document.getElementById('loading');
        if (loaderEl) {
            loaderEl.classList.add('loaded');
        }

        // Wait for screen expansion animation to finish (e.g. 1400ms)
        await new Promise(r => setTimeout(r, 1400));

        // Fade out loading screen
        if (loaderEl) {
            loaderEl.style.opacity = '0';
            setTimeout(() => {
                loaderEl.style.display = 'none';
                loaderEl.classList.remove('loaded');
            }, 600);
        }
        
        loadUnselectedDataInBackground();
    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('loading').innerHTML = '<div style="color:var(--text-color)">Error loading data.</div>';
    }
    // Pre-load Piper TTS in background so first play is instant
    initPiper();
}
function updateDarkModeIcon(isDark) {
    const btn = document.getElementById('dark-mode-toggle');
    if (isDark) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    } else {
        btn.innerHTML = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    }
}
function setupGestures() {
    document.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: false });
    document.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleGesture();
    }, { passive: false });
    const feedStage = document.getElementById('feed-stage');
    feedStage.addEventListener('click', (e) => {
        if (e.target.closest('.bookmark-btn') || e.target.closest('.speak-btn')) return;
        const width = window.innerWidth;
        const clickX = e.clientX;
        
        // Use 40% on left and right for navigation. The middle 20% is a safe deadzone.
        if (clickX < width * 0.4) {
            prevCard();
        } else if (clickX > width * 0.6) {
            nextCard();
        }
    });
}
function handleGesture() {
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
            if (isFeed) {
                prevCard();
            } else {
                goBack();
            }
        } else {
            if (isFeed) {
                nextCard();
            }
        }
    }
}
// --- Piper TTS Audio Initialization ---
let piperSession = null;
let piperInitializing = false;
let piperInitPromise = null;
let audioContext = null;
let currentAudioNode = null;
let currentAudioBuffer = null;
let currentAudioStartTime = 0;
let currentAudioPausedAt = 0;
let currentAudioContextType = null;

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

let piperSessionsCache = {};

async function initPiper(voiceId = "en_US-libritts_r-medium") {
    if (piperSessionsCache[voiceId]) {
        piperSession = piperSessionsCache[voiceId];
        return piperSession;
    }
    if (piperSession && piperSession.voiceId === voiceId) return piperInitPromise;
    piperInitPromise = (async () => {
        piperInitializing = true;
        try {
            const tts = await import("./libs/piper/piper-bundle.js?v=" + Date.now());
            if (tts.TtsSession._instance) {
                tts.TtsSession._instance = null; // Force reload of ONNX model
            }
            console.log("Loading Piper TTS voice:", voiceId);
            const newSession = await tts.TtsSession.create({
                voiceId: voiceId,
                wasmPaths: {
                    onnxWasm: "/libs/piper/",
                    piperData: "/libs/piper/piper_phonemize.data",
                    piperWasm: "/libs/piper/piper_phonemize.wasm"
                }
            });
            newSession.voiceId = voiceId;
            let savedSpeed = localStorage.getItem('voiceSpeed_' + voiceId);
            if (!savedSpeed) {
                if (voiceId === 'en_GB-alan-medium') savedSpeed = "1.1";
                else if (voiceId === 'en_GB-alba-medium') savedSpeed = "0.9";
                else if (voiceId === 'en_US-libritts_r-medium') savedSpeed = "0.6";
                else savedSpeed = "1.0";
            }
            const baseLen = voiceBaseLengths[voiceId] || 1.0;
            newSession.speedScale = baseLen / parseFloat(savedSpeed);
            
            piperSessionsCache[voiceId] = newSession;
            piperSession = newSession;
            console.log(`Piper TTS loaded with ${voiceId} via offline WebAssembly.`);
        } catch (e) {
            console.error("Piper TTS init failed:", e);
            piperSession = null;
            throw e;
        }
        piperInitializing = false;
    })();
    return piperInitPromise;
}

function updateMusicVolume() {
    const slider = document.getElementById('music-volume-slider');
    const audioEl = document.getElementById('audio');
    if (slider && audioEl) {
        audioEl.volume = parseFloat(slider.value);
    }
}

function toggleTTSSource() {
    ttsAnnounceSource = !ttsAnnounceSource;
    localStorage.setItem('ttsAnnounceSource', ttsAnnounceSource);
    updateTogglesUI();
}

function toggleTTSRandom() {
    ttsRandomVoice = !ttsRandomVoice;
    localStorage.setItem('ttsRandomVoice', ttsRandomVoice);
    updateTogglesUI();
}

function updateTogglesUI() {
    const srcBtn = document.getElementById('tts-source-toggle');
    const rndBtn = document.getElementById('tts-random-toggle');
    if (srcBtn) {
        if (ttsAnnounceSource) srcBtn.classList.add('active');
        else srcBtn.classList.remove('active');
        
        srcBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 9.5 C7 6 9 3 12 3 C15 3 17 6 17 9.5 C17 13 15 16 12 16 H11 C11 19 13 21 15 21 V23.5 C10 23.5 7 20 7 9.5 Z" /></svg>';
    }
    if (rndBtn) {
        if (ttsRandomVoice) rndBtn.classList.add('active');
        else rndBtn.classList.remove('active');
    }
}



// --- Audio Handling Functions ---
let currentGenerationId = 0;
let audioChunkQueue = [];
let playingQueueIndex = 0;

function stopAudio(preserveAutoMode = false) {
    currentGenerationId++;
    clearTimeout(playDebounceTimer);
    clearTimeout(autoNextTimeout);
    if (currentAudioNode) {
        try {
            currentAudioNode.onended = null;
            currentAudioNode.stop();
            currentAudioNode.disconnect();
        } catch (e) { }
        currentAudioNode = null;
    }
    if (currentUtterance) {
        speechSynthesis.cancel();
        currentUtterance = null;
    }
    isSpeaking = false;
    isPaused = false;
    isGenerating = false;
    isQueueGenerating = false;
    audioChunkQueue = [];
    playingQueueIndex = 0;
    currentAudioBuffer = null;
    currentAudioPausedAt = 0;
    if (!preserveAutoMode) {
        autoMode = false;
        autoNextBook = false;
    }
    updateSpeakIcons();
    const btn = document.getElementById('speak-general');
    if (btn) btn.classList.remove('loading');
    stopWaveformVisualizer();
}


let selectedVerse = null;
let lastSelectedBookVerse = null;
let activeSavedVerse = null;

let programmaticScrollTimeout = null;

if (!localStorage.getItem('speed_defaults_set_v8')) {
    localStorage.removeItem('voiceSpeed_en_GB-alan-medium');
    localStorage.removeItem('voiceSpeed_en_GB-alba-medium');
    localStorage.removeItem('voiceSpeed_en_US-libritts_r-medium');
    localStorage.setItem('voiceSpeed_en_GB-alan-medium', '1.1');
    localStorage.setItem('voiceSpeed_en_GB-alba-medium', '0.9');
    localStorage.setItem('voiceSpeed_en_US-libritts_r-medium', '0.9');
    localStorage.setItem('speed_defaults_set_v8', 'true');
}

let playDebounceTimer = null;
let autoNextTimeout = null;

let lastRandomVoiceId = null;

async function playText(text, context) {
    // Stop any current audio FIRST, which increments currentGenerationId and resets UI state
    stopAudio(true);
    // NOW capture the new generationId (after stop bumped it)
    const generationId = currentGenerationId;

    // Clean text for TTS pronunciation
    text = text.replace(/son\(s\)/gi, 'sons')
               .replace(/god's/gi, 'gods')
               .replace(/god 's/gi, 'gods')
               .replace(/\(l\d+\)/gi, '')
               .replace(/\[l\d+\]/gi, '')
               .replace(/-/g, ' ');

    // Immediately update UI so it feels instant
    isSpeaking = true;
    isPaused = false;
    currentAudioContextType = context;
    updateSpeakButton('speak-general');
    const btn = document.getElementById('speak-general');
    if (btn) btn.classList.add('loading');

    // Load the right voice
    if (ttsRandomVoice) {
        const available = voicesList.filter(v => v.value !== lastRandomVoiceId);
        const randomVoice = available[Math.floor(Math.random() * available.length)].value;
        lastRandomVoiceId = randomVoice;
        
        selectedVoice = randomVoice;
        localStorage.setItem('selectedVoice', selectedVoice);
        syncVoiceWheelToCurrent();

        await initPiper(randomVoice);
        applyAutoSpeed();
    } else {
        await initPiper(selectedVoice);
    }

    if (!piperSession) {
        if (btn) btn.classList.remove('loading');
        isSpeaking = false;
        updateSpeakButton('speak-general');
        return;
    }

    // Check if still valid after async initPiper
    if (generationId !== currentGenerationId) {
        if (btn) btn.classList.remove('loading');
        return;
    }

    // Strip HTML
    text = text.replace(/<span class='author-attr'>.*?<\/span>/gm, '');
    text = text.replace(/<[^>]*>?/gm, '');

    isGenerating = true;

    let sanitizedText = text.replace(/ﷺ/g, 'Peace be upon him');
    sanitizedText = ", " + sanitizedText
        .replace(/\b[iI]\.[eE]\./g, 'that is')
        .replace(/\b[iI],[eE]\b/g, 'that is')
        .replace(/[:;]/g, '. ');

    const fallbackTTS = () => {
        console.log("Using browser TTS fallback");
        if (generationId !== currentGenerationId) return;
        if (btn) btn.classList.remove('loading');
        isGenerating = false;
        isSpeaking = true;
        isPaused = false;
        updateSpeakButton('speak-general');
        
        window.speechSynthesis.cancel();
        currentUtterance = new SpeechSynthesisUtterance(sanitizedText);
        const speedSlider = document.getElementById('voice-speed-slider');
        currentUtterance.rate = speedSlider ? parseFloat(speedSlider.value) : 0.5;
        currentUtterance.onend = () => {
            if (isPaused) return;
            isSpeaking = false;
            updateSpeakButton('speak-general');
            clearTimeout(autoNextTimeout);
            autoNextTimeout = setTimeout(() => {
                if (currentAudioContextType === 'feed' && autoMode) nextCard(true);
                else if (currentAudioContextType === 'book' && autoNextBook) advanceBookVerse();
            }, 800);
        };
        currentUtterance.onerror = (e) => {
            console.log("SpeechSynthesis error:", e);
            if (!isPaused) {
                isSpeaking = false;
                updateSpeakButton('speak-general');
            }
        };
        window.speechSynthesis.speak(currentUtterance);
    };

    // Split text into sentence chunks
    let chunks = sanitizedText.split(/([.!?,;:]+[\s]+|\|PAUSE\|\s*)/).filter(Boolean);
    let combinedChunks = [];
    let tempChunk = "";
    for(let i = 0; i < chunks.length; i++) {
        tempChunk += chunks[i];
        if (chunks[i].match(/[.!?,;:]+[\s]+/) || chunks[i].match(/\|PAUSE\|/)) {
            let ch = tempChunk.replace(/\|PAUSE\|/g, '').trim();
            if (ch) combinedChunks.push(ch);
            if (chunks[i].match(/\|PAUSE\|/)) combinedChunks.push("|PAUSE|");
            tempChunk = "";
        }
    }
    if (tempChunk.trim()) combinedChunks.push(tempChunk.trim());
    if (combinedChunks.length === 0) combinedChunks = [sanitizedText];

    audioChunkQueue = [];
    playingQueueIndex = 0;

    // Short debounce to avoid double-fires
    clearTimeout(playDebounceTimer);
    playDebounceTimer = setTimeout(async () => {
        if (generationId !== currentGenerationId) {
            if (btn) btn.classList.remove('loading');
            return;
        }
        if (!piperSession) { fallbackTTS(); return; }
        isQueueGenerating = true;
        processAudioQueue(combinedChunks, generationId, fallbackTTS);
    }, 30);
}

async function processAudioQueue(chunks, generationId, fallbackTTS) {
    for (let i = 0; i < chunks.length; i++) {
        if (generationId !== currentGenerationId) break;
        
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();

            if (chunks[i] === "|PAUSE|") {
                const sampleRate = ctx.sampleRate || 22050;
                const pauseFrames = Math.floor(sampleRate * 0.8); // 0.8 seconds pause
                const pauseBuffer = ctx.createBuffer(1, pauseFrames, sampleRate);
                audioChunkQueue.push(pauseBuffer);
                continue;
            }

            const wavBlob = await piperSession.predict(chunks[i]);
            if (generationId !== currentGenerationId) break;

            const arrayBuffer = await wavBlob.arrayBuffer();
            const decodedData = await ctx.decodeAudioData(arrayBuffer);
            
            if (generationId !== currentGenerationId) break;

            const sampleRate = decodedData.sampleRate;
            const paddingFrames = Math.floor(sampleRate * 0.2); // 200ms pause
            const paddedBuffer = ctx.createBuffer(
                decodedData.numberOfChannels, 
                decodedData.length + paddingFrames, 
                sampleRate
            );
            
            for (let channel = 0; channel < decodedData.numberOfChannels; channel++) {
                const channelData = paddedBuffer.getChannelData(channel);
                channelData.set(decodedData.getChannelData(channel), paddingFrames);
            }

            audioChunkQueue.push(paddedBuffer);
            
            if (i === 0) {
                const btn = document.getElementById('speak-general');
                if (btn) btn.classList.remove('loading');
                isGenerating = false;
                startAudioPlayback(0, generationId);
            }
        } catch (err) {
            console.error("Piper generation error on chunk " + i, err);
            if (i === 0 && generationId === currentGenerationId) fallbackTTS();
            break;
        }
    }
    if (generationId === currentGenerationId) {
        isQueueGenerating = false;
    }
}

function startAudioPlayback(offset, generationId) {
    if (generationId !== currentGenerationId) return;

    if (playingQueueIndex >= audioChunkQueue.length) {
        if (isQueueGenerating) {
            isGenerating = true;
            updateSpeakButton('speak-general');
            const checkInterval = setInterval(() => {
                if (generationId !== currentGenerationId || !isSpeaking || isPaused) {
                    clearInterval(checkInterval);
                    return;
                }
                if (playingQueueIndex < audioChunkQueue.length) {
                    clearInterval(checkInterval);
                    isGenerating = false;
                    startAudioPlayback(0, generationId);
                } else if (!isQueueGenerating) {
                    clearInterval(checkInterval);
                    startAudioPlayback(0, generationId);
                }
            }, 100);
            return;
        } else {
            isSpeaking = false;
            isPaused = false;
            isGenerating = false;
            currentAudioPausedAt = 0;
            updateSpeakButton('speak-general');

            clearTimeout(autoNextTimeout);
            autoNextTimeout = setTimeout(() => {
                if (currentAudioContextType === 'feed' && autoMode) {
                    nextCard(true);
                } else if (currentAudioContextType === 'book' && autoNextBook) {
                    advanceBookVerse();
                }
            }, 300);
            return;
        }
    }

    currentAudioBuffer = audioChunkQueue[playingQueueIndex];
    if (!currentAudioBuffer || isPaused) return;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = currentAudioBuffer;

    const gainNode = ctx.createGain();
    const voiceId = piperSession ? piperSession.voiceId : "en_US-libritts_r-medium";
    
    if (voiceId === "en_GB-alan-medium") {
        gainNode.gain.value = 0.8;
    } else if (voiceId === "en_GB-alba-medium") {
        gainNode.gain.value = 1.6;
    } else {
        gainNode.gain.value = 1.0;
    }
    
    source.connect(gainNode);
    if (!audioAnalyser) { audioAnalyser = ctx.createAnalyser(); audioAnalyser.fftSize = 128; }
    gainNode.connect(audioAnalyser);
    audioAnalyser.connect(ctx.destination);
    startWaveformVisualizer();

    source.onended = () => {
        if (isPaused || generationId !== currentGenerationId) return;
        playingQueueIndex++;
        startAudioPlayback(0, generationId);
    };

    currentAudioStartTime = ctx.currentTime - offset;
    source.start(0, offset);
    currentAudioNode = source;
    updateSpeakButton('speak-general');
}

function updateSpeakButton(buttonId) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.innerHTML = isSpeaking && !isPaused ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="speak-svg"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="speak-svg"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    }
}
// --- Unified Audio Control ---
function speakCurrent(type) {
    const now = Date.now();
    if (now - lastSpeakClick < 400) return; // Prevent double-tap jitter
    lastSpeakClick = now;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(e => console.error("AudioContext resume failed:", e));
    }

    const isBookSection = document.getElementById('read-books').classList.contains('active-section')
        && !document.getElementById('book-content-view').classList.contains('hidden');
    const isFeedSection = document.getElementById('verse-feed').classList.contains('active-section');

    if (!isBookSection && !isFeedSection) return;

    if (isGenerating) {
        console.log("Audio generating, ignoring extra clicks...");
        return;
    }

    if (isSpeaking) {
        if (!isPaused) {
            isPaused = true;
            if (currentAudioNode) {
                try {
                    currentAudioNode.onended = null;
                    currentAudioNode.stop();
                } catch (e) { }
                stopWaveformVisualizer();
            }
            updateSpeakIcons();
            return;
        } else {
            isPaused = false;
            startAudioPlayback(0, currentGenerationId);
            updateSpeakIcons();
            return;
        }
    } else {
        if (isBookSection) {
            const info = globalVerseMap[bookVoiceCurrentVerse];
            if (info && chapterStartIndices[info.chapter] === bookVoiceCurrentVerse) {
                lastAnnouncedChapter = null;
            }
            playBookVerse(bookVoiceCurrentVerse);
            autoNextBook = true;
        } else {
            const verse = getVerseAtIndex(currentVerseIndex.general);
            if (verse) {
                let text = verse.spoken_text || verse.text;
                if (!text.endsWith('.')) text += '.';
                
                if (ttsAnnounceSource) {
                    text += '. ' + verse.book + '.';
                }

                text = text.replace(/`/g, '');
                playText(text, 'feed');
                autoMode = true;
            }
        }
    }
}
// --- Book Audio ---
function handleVerseClick(index) {
    const info = globalVerseMap[index];
    if (info) {
        selectVerse(info, 'book', 'book-verse-' + index);
    }
}
function playPauseBook() {
    // Now just delegates to the main speakCurrent
    speakCurrent('general');
}
function playBookVerse(index) {
    const info = globalVerseMap[index];
    if (info) {
        let textToSpeak = info.spoken_text || info.text;

        if (lastAnnouncedChapter !== info.chapter) {
            textToSpeak = info.book + '. |PAUSE| ' + textToSpeak;
            lastAnnouncedChapter = info.chapter;
        }
        if (!textToSpeak.endsWith('.')) textToSpeak += '.';

        playText(textToSpeak, 'book');
    }
};
function advanceBookVerse() {
    const nextIndex = (bookVoiceCurrentVerse + 1) % bookVoiceTotalVerses;
    bookVoiceCurrentVerse = nextIndex;
    markVerse();
    scrollToBookVerse(nextIndex);
    syncWheelsToCurrent();
    playBookVerse(nextIndex);
    autoNextBook = true;
}
// --- Data Loading & Processing ---
async function loadReligionData(rel) {
    if (loadedReligions.has(rel)) return;
    try {
        const urls = dataUrls[rel];
        const responses = await Promise.all(urls.map(url => fetch(url).then(res => res.json())));

        if (rel === 'Christianity') processBibleData(responses[0]);
        if (rel === 'Islam') { processQuranData(responses[0]); processHadithData(responses[1]); }
        if (rel === 'Hinduism') { 
            processGitaData(responses[0]); 
            processHinduBooks(responses[1]); 
        }
        if (rel === 'Judaism') processSefariaData(responses[0]);
        if (rel === 'Sikhism') processSikhismData(responses[0]);
        if (rel === 'Buddhism') processBuddhismData(responses[0]);

        loadedReligions.add(rel);
        buildSettings();

        if (document.getElementById('read-books').classList.contains('active-section') && !document.getElementById('library-home').classList.contains('hidden')) {
            showReligions();
        }
    } catch (e) {
        console.error(`Error loading ${rel}:`, e);
    }
}
async function loadSelectedData() {
    const relsToLoad = globalSelectedRels ? globalSelectedRels : religions;
    await Promise.all(relsToLoad.map(rel => loadReligionData(rel)));
}
async function loadUnselectedDataInBackground() {
    const relsToLoad = religions.filter(r => !loadedReligions.has(r));
    for (const rel of relsToLoad) {
        await loadReligionData(rel);
    }
}
function cleanText(text) {
    if (!text) return '';
    return text.replace(/\(\(peace be upon him\)\)/gi, '')
               .replace(/\(peace be upon him\)/gi, '')
               .replace(/[{}[\]\\@#$^*_+=`~]/g, '')
               .replace(/\s+/g, ' ')
               .trim();
}
function processBibleData(bible) {
    let christianVerses = [];
    let christianBooks = [];
    Object.keys(bible).forEach(bookName => {
        const bookContent = bible[bookName];
        if (typeof bookContent === 'object') {
            let chapters = {};
            Object.keys(bookContent).forEach(chapNum => {
                const verses = bookContent[chapNum];
                chapters[chapNum] = verses;
                Object.keys(verses).forEach(verseNum => {
                    christianVerses.push({ book: bookName, chapter: chapNum, verse: verseNum, text: cleanText(verses[verseNum]), religion: 'Christianity' });
                });
            });
            christianBooks.push({ name: bookName, content: chapters });
        }
    });
    religionVerses.Christianity = christianVerses;
    religionBooks.Christianity = { books: christianBooks };
}
function processQuranData(quran) {
    let islamVerses = religionVerses.Islam || [];
    let quranChapters = {};
    quran.forEach(surah => {
        let verses = {};
        surah.verses.forEach(v => {
            verses[v.id] = v.translation;
            islamVerses.push({ book: 'Quran', chapter: surah.id, verse: v.id, text: cleanText(v.translation), religion: 'Islam' });
        });
        quranChapters[surah.id] = verses;
    });
    let islamBooks = [{ name: 'Quran', content: quranChapters }];
    religionVerses.Islam = islamVerses;
    religionBooks.Islam = { books: islamBooks };
}
function processHadithData(allHadiths) {
    let islamVerses = religionVerses.Islam || [];
    let islamBooks = (religionBooks.Islam && religionBooks.Islam.books) ? religionBooks.Islam.books : [];
    let hadithCollections = {};
    let counters = {};

    allHadiths.forEach(h => {
        const collection = h.source;
        if (!hadithCollections[collection]) {
            hadithCollections[collection] = { chapters: {} };
            counters[collection] = 1;
        }

        const text = h.text_en;
        if (text && text !== "Missing English text") {
            const metaPhrases = [
                "chain of transmitters",
                "chain of transmission",
                "variation of wording",
                "change of words",
                "rest of the hadith is the same",
                "similar hadith has been",
                "same hadith has been",
                "this hadith has been reported",
                "this hadith is reported",
                "this hadith has been transmitted",
                "exception of these words",
                "with this addition",
                "but he made no mention of",
                "the hadith was narrated"
            ];
            const lowerText = text.toLowerCase();
            const hasMetaPhrase = metaPhrases.some(phrase => lowerText.includes(phrase));
            if (hasMetaPhrase) return; // Skip this hadith completely to keep feed clean

            let verseNum = counters[collection]++;
            // Group into chapters of 100 for better UI scroll
            let chapter = Math.floor((verseNum - 1) / 100) + 1;
            chapter = chapter.toString();
            let verseStr = (((verseNum - 1) % 100) + 1).toString();

            if (!hadithCollections[collection].chapters[chapter]) {
                hadithCollections[collection].chapters[chapter] = {};
            }

            hadithCollections[collection].chapters[chapter][verseStr] = text;
            islamVerses.push({ book: collection, chapter: chapter, verse: verseStr, text: cleanText(text), religion: 'Islam' });
        }
    });

    Object.keys(hadithCollections).forEach(collection => {
        islamBooks.push({ name: collection, content: hadithCollections[collection].chapters });
    });
    religionVerses.Islam = islamVerses;
    religionBooks.Islam = { books: islamBooks };
}
function processGitaData(gita) {
    const chapterLengths = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78];
    let hinduVerses = [];
    let gitaChapters = {};
    let uniqueVerses = {};

    gita.filter(g => g.lang && g.lang.toLowerCase() === 'english').forEach(g => {
        if (!uniqueVerses[g.verse_id]) {
            uniqueVerses[g.verse_id] = g.description;
        }
    });

    let currentChapter = 1;
    let verseInChapter = 1;
    let chapterEnd = chapterLengths[0];

    for (let vid = 1; vid <= 701; vid++) {
        if (!uniqueVerses[vid]) continue;
        const chap = currentChapter.toString();
        const vers = verseInChapter.toString();
        const text = cleanText(uniqueVerses[vid]);
        
        hinduVerses.push({
            book: 'Bhagavad Gita',
            chapter: chap,
            verse: vers,
            text: text,
            religion: 'Hinduism'
        });
        
        if (!gitaChapters[chap]) gitaChapters[chap] = {};
        gitaChapters[chap][vers] = text;

        verseInChapter++;
        if (verseInChapter > chapterEnd && currentChapter < 18) {
            currentChapter++;
            verseInChapter = 1;
            chapterEnd = chapterLengths[currentChapter - 1];
        }
    }

    let chapterOrder = Array.from({length: 18}, (_, i) => (i + 1).toString());
    let hinduBooks = [{ name: 'Bhagavad Gita', content: gitaChapters, chapterOrder: chapterOrder, isNested: false }];
    
    religionVerses.Hinduism = hinduVerses;
    religionBooks.Hinduism = { books: hinduBooks };
}
function processHinduBooks(data, allowedBooks = null, excludedBooks = null) {
    let hinduVerses = religionVerses.Hinduism || [];
    let hinduBooksMap = {};
    Object.keys(data).forEach(bookName => {
        if (allowedBooks && !allowedBooks.includes(bookName)) return;
        if (excludedBooks && excludedBooks.includes(bookName)) return;

        const bookData = data[bookName];
        let chapters = {};
        let chapterOrder = [];
        
        // Ensure chapter sorting logic handles string/number combinations (e.g., "Book 1", "Mandala 10")
        const chapKeys = Object.keys(bookData).sort((a, b) => {
            const numA = parseInt((a.match(/\d+/) || [0])[0]);
            const numB = parseInt((b.match(/\d+/) || [0])[0]);
            return numA - numB;
        });

        chapKeys.forEach(chapName => {
            chapterOrder.push(chapName);
            chapters[chapName] = {};
            const verses = bookData[chapName];
            
            const verseKeys = Object.keys(verses).sort((a, b) => {
                const numA = parseInt((a.match(/\d+/) || [0])[0]);
                const numB = parseInt((b.match(/\d+/) || [0])[0]);
                return numA - numB;
            });
            
            verseKeys.forEach(vKey => {
                const text = verses[vKey];
                if (text && text.trim() !== '') {
                    chapters[chapName][vKey] = text;
                    hinduVerses.push({
                        book: bookName,
                        chapter: chapName,
                        verse: vKey,
                        text: text,
                        religion: 'Hinduism'
                    });
                }
            });
        });

        hinduBooksMap[bookName] = {
            name: bookName,
            content: chapters,
            chapterOrder: chapterOrder,
            isNested: false
        };
    });

    religionVerses.Hinduism = hinduVerses;
    let existingBooks = religionBooks.Hinduism ? religionBooks.Hinduism.books : [];
    religionBooks.Hinduism = { books: [...existingBooks, ...Object.values(hinduBooksMap)] };
}


function processSefariaData(sefariaData) {
    let verses = [];
    let books = [];
    const collections = sefariaData.collections || {};

    // Each collection (Torah, Prophets, Writings, Mishnah) becomes a top-level navigable entry
    // with sub-books inside it (like Hinduism's nested structure)
    Object.keys(collections).forEach(collectionName => {
        const collectionBooks = collections[collectionName];
        if (!collectionBooks || collectionBooks.length === 0) return;

        let subBooks = {};
        let subBookOrder = [];

        collectionBooks.forEach(book => {
            const bookName = book.name;
            const validChapterOrder = book.chapterOrder && book.chapterOrder.length > 0 && book.chapterOrder[0] !== '' 
                ? book.chapterOrder 
                : Object.keys(book.content).sort((a, b) => Number(a) - Number(b));

            subBooks[bookName] = {
                content: book.content,
                chapterOrder: validChapterOrder
            };
            subBookOrder.push(bookName);

            // Add verses to the flat feed pool
            const chapterOrder = subBooks[bookName].chapterOrder;
            chapterOrder.forEach(chap => {
                const chapVerses = book.content[chap];
                if (!chapVerses) return;
                Object.keys(chapVerses).forEach(verseNum => {
                    const text = chapVerses[verseNum];
                    if (text && text.trim()) {
                        verses.push({
                            book: bookName,
                            collection: collectionName,
                            chapter: `${chap}`,
                            verse: verseNum,
                            text: cleanText(text),
                            religion: 'Judaism'
                        });
                    }
                });
            });
        });

        books.push({
            name: collectionName,
            subBooks: subBooks,
            subBookOrder: subBookOrder,
            isNested: true
        });
    });

    religionVerses.Judaism = verses;
    religionBooks.Judaism = { books: books };
}
function processSikhismData(data) {
    let verses = [];
    let books = [];
    if (data.books && data.books.length > 0) {
        data.books.forEach(book => {
            let processedContent = {};
            let chapterOrder = [];
            
            const chapterKeys = Object.keys(book.content);
            
            chapterKeys.forEach(chapNameStr => {
                processedContent[chapNameStr] = {};
                chapterOrder.push(chapNameStr);
                
                const rawContent = book.content[chapNameStr];
                const verseKeys = Object.keys(rawContent).sort((a, b) => Number(a) - Number(b));
                
                verseKeys.forEach(k => {
                    processedContent[chapNameStr][k] = rawContent[k];
                    verses.push({
                        book: book.name,
                        chapter: chapNameStr,
                        verse: k,
                        text: cleanText(rawContent[k]),
                        religion: 'Sikhism'
                    });
                });
            });

            books.push({ 
                name: book.name, 
                content: processedContent,
                chapterOrder: chapterOrder,
                isNested: false
            });
        });
    }
    religionVerses.Sikhism = verses;
    religionBooks.Sikhism = { books: books };
}
function processBuddhismData(data) {
    let verses = [];
    let books = [];
    
    // The Dhammapada is a single book with 26 chapters
    let dhammapadaContent = {};
    
    if (data && data.chapters) {
        data.chapters.forEach((chapter, index) => {
            const chapterNum = (index + 1).toString();
            dhammapadaContent[chapterNum] = {};
            
            if (chapter.verses) {
                chapter.verses.forEach(v => {
                    const verseNum = v.no;
                    const text = cleanText(v.verse);
                    dhammapadaContent[chapterNum][verseNum] = text;
                    
                    verses.push({
                        religion: 'Buddhism',
                        book: 'Dhammapada',
                        chapter: chapterNum,
                        verse: verseNum,
                        text: text
                    });
                });
            }
        });
        
        books.push({
            name: 'Dhammapada',
            content: dhammapadaContent
        });
    }
    
    religionVerses.Buddhism = verses;
    religionBooks.Buddhism = { books: books };
}

function processPhilosophyData(data) {
    let verses = [];
    let books = [];
    
    if (data && data.books) {
        for (const [bookName, chaptersMap] of Object.entries(data.books)) {
            let bookChapters = [];
            let chapterContent = {};
            
            for (const [chapterName, versesMap] of Object.entries(chaptersMap)) {
                bookChapters.push(chapterName);
                chapterContent[chapterName] = {};
                
                for (const [verseNum, verseText] of Object.entries(versesMap)) {
                    const text = cleanText(verseText);
                    chapterContent[chapterName][verseNum] = text;
                    verses.push({ text: text, religion: 'Philosophy', book: bookName, chapter: chapterName, verse: verseNum });
                }
            }
            
            books.push({
                name: bookName,
                chapterOrder: bookChapters,
                content: chapterContent
            });
        }
    }
    
    religionVerses['Philosophy'] = verses;
    religionBooks['Philosophy'] = books;
}
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getAllBooks(rel) {
    return religionBooks[rel]?.books.map(b => b.name) || [];
}
function toggleOnboardingRel(el, rel) {
    el.classList.toggle('selected');
    if (onboardingSelection.has(rel)) {
        onboardingSelection.delete(rel);
    } else {
        onboardingSelection.add(rel);
    }
}
async function saveOnboarding() {
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('loading').style.opacity = '1';

    const relsToLoad = Array.from(onboardingSelection);
    await Promise.all(relsToLoad.map(rel => loadReligionData(rel)));

    globalSelectedRels = Array.from(onboardingSelection);
    localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    updateBatchesAfterSettings();

    document.getElementById('onboarding').classList.remove('active-section');
    document.getElementById('onboarding').classList.add('hidden');

    document.getElementById('loading').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
    }, 500);

    initializeVerseFeed();
    goTo('verse-feed');
}
async function skipOnboarding() {
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('loading').style.opacity = '1';

    await Promise.all(religions.map(rel => loadReligionData(rel)));

    globalSelectedRels = [...religions];
    localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    updateBatchesAfterSettings();

    document.getElementById('onboarding').classList.remove('active-section');
    document.getElementById('onboarding').classList.add('hidden');

    document.getElementById('loading').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
    }, 500);

    initializeVerseFeed();
    goTo('verse-feed');
}
function buildSettings() {
    document.querySelectorAll('.global-rel-btn').forEach(btn => {
        const rel = btn.textContent.trim();
        if (globalSelectedRels && globalSelectedRels.includes(rel)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
function toggleGlobalReligion(rel) {
    if (!globalSelectedRels) globalSelectedRels = [];
    if (globalSelectedRels.includes(rel)) {
        globalSelectedRels = globalSelectedRels.filter(r => r !== rel);
    } else {
        globalSelectedRels.push(rel);
    }
    localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    buildSettings();
    updateBatchesAfterSettings();
    if (typeof showReligions === "function" && document.getElementById('library-home') && !document.getElementById('library-home').classList.contains('hidden')) {
        showReligions();
    }
}
function addSelectionListeners() {
    // Legacy function preserved but empty since we removed the book chips
}
function updateBatchesAfterSettings() {
    verseBatches.general = [];
    currentBatchIndex.general = 0;
    currentVerseIndex.general = 0;
    allVersesUsed.general.clear();
    if (document.getElementById('verse-feed').classList.contains('active-section')) {
        initializeVerseFeed();
    }
}
function initializeVerseFeed() {
    const stage = document.getElementById('feed-stage');
    const emptyState = document.getElementById('feed-empty-state');

    if (!globalSelectedRels || globalSelectedRels.length === 0) {
        stage.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }
    if (verseBatches.general.length > 0) {
        renderFeedCard(currentVerseIndex.general);
        return;
    }
    verseBatches.general = [generateBatch('general', [])];
    if (verseBatches.general[0] && verseBatches.general[0].length === 0) {
        stage.innerHTML = '<div class="verse-card card-center"><div class="verse-text">Loading verses... Please wait.</div><div class="card-footer"></div></div>';
        setTimeout(() => {
            if (verseBatches.general[0] && verseBatches.general[0].length === 0) {
                verseBatches.general = [];
                initializeVerseFeed();
            }
        }, 1000);
        return;
    }
    renderFeedCard(0);
}
const negativeWords = ['smite', 'kill', 'destroy', 'wrath', 'blood', 'sword', 'curse', 'hell', 'fire', 'punish', 'death', 'die', 'slay', 'enemy', 'evil', 'wicked', 'sin', 'weep', 'wail', 'gnash', 'vengeance', 'terror', 'fear', 'plague', 'famine', 'perish', 'slaughter', 'condemn', 'abomination', 'hate', 'despise', 'anger', 'fury'];
const positiveWords = ['love', 'peace', 'joy', 'hope', 'faith', 'light', 'grace', 'mercy', 'compassion', 'kindness', 'bless', 'heal', 'forgive', 'comfort', 'strength', 'wisdom', 'truth', 'spirit', 'heart', 'soul', 'heaven', 'glory', 'righteous', 'holy', 'pure', 'good', 'rejoice', 'glad', 'praise', 'worship', 'save', 'deliver', 'guide', 'protect'];
function generateBatch(type, lastRels = []) {
    const rels = (globalSelectedRels || []).filter(r => religionVerses[r] && religionVerses[r].length > 0);
    if (rels.length === 0) {
        return [{ text: "Debug: No religions selected or loaded yet. rels is empty.", religion: 'System', book: 'Debug', chapter: '1', verse: '1' }];
    }
    const size = 10;
    const per = Math.floor(size / rels.length);
    const extra = size % rels.length;
    let slots = [];
    rels.forEach((r, i) => {
        const count = per + (i < extra ? 1 : 0);
        slots.push(...Array(count).fill(r));
    });
    let tries = 0;
    const maxTries = 100;
    while (tries < maxTries) {
        slots = slots.sort(() => Math.random() - 0.5);
        let hasThreeConsec = false;
        for (let i = 2; i < slots.length; i++) {
            if (slots[i] === slots[i - 1] && slots[i] === slots[i - 2]) {
                hasThreeConsec = true;
                break;
            }
        }
        const extended = [...lastRels, ...slots];
        for (let i = 2; i < extended.length; i++) {
            if (extended[i] === extended[i - 1] && extended[i] === extended[i - 2]) {
                hasThreeConsec = true;
                break;
            }
        }
        if (!hasThreeConsec) break;
        tries++;
    }
    return slots.map(r => {
        let fullPool = religionVerses[r] || [];

        const filteredPool = fullPool.filter(v => {
            if (v.text.length < MIN_CHAR_LIMIT || v.text.length > maxCharLimit) return false;
            if (v.text.trim() === '') return false;

            const textLower = v.text.toLowerCase();
            const hasNegative = negativeWords.some(word => textLower.includes(word));
            if (hasNegative) return false;

            const hasPositive = positiveWords.some(word => textLower.includes(word));
            if (!hasPositive) return false;

            if (textLower.startsWith('and ') || textLower.startsWith('but ') || textLower.startsWith('then ') || textLower.startsWith('therefore ') || textLower.startsWith('for ')) {
                return false;
            }
            return true;
        });
        let pool = filteredPool.length > 0 ? filteredPool : fullPool.filter(v => {
            return v.text.length >= MIN_CHAR_LIMIT && v.text.length <= maxCharLimit && v.text.trim() !== '';
        });

        if (pool.length === 0) {
            return { text: "Debug: Pool is empty for religion " + r + ".", religion: 'System', book: 'Debug', chapter: '1', verse: '1' };
        }
        let availablePool = pool.filter(v => !allVersesUsed.general.has(v.text));
        if (availablePool.length === 0) {
            // If this specific religion has exhausted its valid unread verses,
            // fall back to the full pool (accepting duplicates) rather than clearing the global cache.
            availablePool = pool;
        }
        const idx = Math.floor(Math.random() * availablePool.length);
        const selectedVerse = availablePool[idx];
        
        allVersesUsed.general.add(selectedVerse.text);
        if (allVersesUsed.general.size > 200) {
            const oldestVerse = allVersesUsed.general.values().next().value;
            allVersesUsed.general.delete(oldestVerse);
        }
        
        return selectedVerse;
    }).filter(v => v !== null);
}
function getVerseAtIndex(index) {
    const batchSize = 10;
    const batchIdx = Math.floor(index / batchSize);
    const verseIdx = index % batchSize;

    while (batchIdx >= verseBatches.general.length) {
        const prevBatch = verseBatches.general[verseBatches.general.length - 1];
        const lastRels = prevBatch ? prevBatch.slice(-2).map(v => v.religion) : [];
        const newBatch = generateBatch('general', lastRels);
        if (newBatch.length === 0) return null;
        verseBatches.general.push(newBatch);
    }
    return verseBatches.general[batchIdx][verseIdx];
}
function renderFeedCard(index, direction = 'none') {
    const stage = document.getElementById('feed-stage');
    const verse = getVerseAtIndex(index);
    if (!verse) return;
    const card = document.createElement('div');
    card.classList.add('verse-card');

    if (direction === 'next') {
        card.classList.add('card-right');
    } else if (direction === 'prev') {
        card.classList.add('card-left');
    } else {
        card.classList.add('card-center');
    }
    const textEl = document.createElement('div');
    textEl.classList.add('verse-text');
    const footer = document.createElement('div');
    footer.classList.add('card-footer');
    const refEl = document.createElement('div');
    refEl.classList.add('verse-ref');

    if (verse) {
        let displayVerse = verse.text;
        // Clean/strip author attribution and other HTML tags for the feed card display
        displayVerse = displayVerse.replace(/<span class='author-attr'>.*?<\/span>/gm, '');
        displayVerse = displayVerse.replace(/<[^>]*>?/gm, '');
        if (displayVerse.endsWith('.')) {
            displayVerse = displayVerse.slice(0, -1);
        }
        textEl.innerText = displayVerse;
        
        // Construct the source reference with book name, chapter and verse
        // Just have book names; no number sourcing.
        let refText = verse.book;
        refEl.innerText = refText;
    }

    footer.appendChild(refEl);
    card.appendChild(textEl);
    card.appendChild(footer);
    stage.appendChild(card);
    requestAnimationFrame(() => {
        if (direction !== 'none') {
            const oldCard = stage.querySelector('.card-center');
            if (oldCard) {
                oldCard.classList.remove('card-center');
                if (direction === 'next') oldCard.classList.add('card-left');
                else oldCard.classList.add('card-right');
                setTimeout(() => oldCard.remove(), 400);
            }
            card.classList.remove('card-right', 'card-left');
            card.classList.add('card-center');
        } else {
            const others = stage.querySelectorAll('.verse-card:not(:last-child)');
            others.forEach(c => c.remove());
        }
    });
}
function nextCard(isAuto = false) {
    const wasPlaying = isSpeaking && !isPaused;

    stopAudio();
    currentVerseIndex.general++;
    renderFeedCard(currentVerseIndex.general, 'next');

    if (isAuto || wasPlaying) {
        const verse = getVerseAtIndex(currentVerseIndex.general);
        if (verse) {
            let spokenText = verse.spoken_text || verse.text;
            if (!spokenText.endsWith('.')) spokenText += '.';
            
            if (ttsAnnounceSource) {
                spokenText += '. ' + verse.book + '.';
            }

            playText(spokenText, 'feed');
            autoMode = true;
        }
    }
}
function prevCard() {
    const wasPlaying = isSpeaking && !isPaused;

    stopAudio();
    if (currentVerseIndex.general > 0) {
        currentVerseIndex.general--;
        renderFeedCard(currentVerseIndex.general, 'prev');

        if (wasPlaying) {
            const verse = getVerseAtIndex(currentVerseIndex.general);
            if (verse) {
                let spokenText = verse.spoken_text || verse.text;
                if (!spokenText.endsWith('.')) spokenText += '.';
                
                if (ttsAnnounceSource) {
                    spokenText += '. ' + verse.book + '.';
                }

                playText(spokenText, 'feed');
                autoMode = true;
            }
        }
    }
}
function goTo(section) {
    if (selectedVerse && selectedVerse.type === 'book') {
        lastSelectedBookVerse = selectedVerse;
        selectedVerse = null;
        deactivatePillUI();
    } else {
        deselectVerse();
    }
    stopAudio();
    document.querySelectorAll('.app-section').forEach(s => {
        s.classList.remove('active-section');
    });

    document.getElementById(section).classList.add('active-section');

    document.querySelectorAll('.nav-icon').forEach(btn => btn.classList.remove('active-nav'));
    if (section === 'verse-feed') document.getElementById('nav-feed').classList.add('active-nav');
    if (section === 'read-books') document.getElementById('nav-books').classList.add('active-nav');
    if (section === 'saved-verses') document.getElementById('nav-saved').classList.add('active-nav');
    if (section === 'settings') document.getElementById('nav-settings').classList.add('active-nav');
    if (section === 'read-books') {
        showReligions();
    }
    if (section === 'verse-feed') {
        if (verseBatches.general.length === 0) {
            initializeVerseFeed();
        }
    }
    if (section === 'settings') {
        buildSettings();
        renderVoiceSettings();
        updateTogglesUI();
    }
    if (section === 'saved-verses') showSavedVerses();
}
function goBack() {
    const current = document.querySelector('.app-section.active-section').id;

    if (current === 'read-books') {
        const bookContent = document.getElementById('book-content-view');
        const bookList = document.getElementById('book-list-view');
        const subBookList = document.getElementById('sub-book-list-view');
        
        if (!bookContent.classList.contains('hidden')) {
            if (currentBookObj && currentBookObj.isNested && currentBookObj.subBookOrder.length > 1) {
                // Go back to sub-books list
                showBookContent(currentReligion, currentBookObj);
            } else {
                showBooks(currentReligion);
            }
            return;
        } else if (!subBookList.classList.contains('hidden')) {
            // Go back to main books list
            showBooks(currentReligion);
            return;
        } else if (!bookList.classList.contains('hidden')) {
            showReligions();
            return;
        }
    }
    goTo('verse-feed');
}
function isVerseSaved(v) {
    return savedVerses.some(s => s.book === v.book && s.chapter === v.chapter && s.verse === v.verse);
}
function toggleBookmark(v, btnElement) {
    const index = savedVerses.findIndex(s => s.book === v.book && s.chapter === v.chapter && s.verse === v.verse);
    if (index > -1) {
        savedVerses.splice(index, 1);
        if (btnElement) btnElement.classList.remove('bookmarked');
    } else {
        savedVerses.push(v);
        if (btnElement) btnElement.classList.add('bookmarked');
    }
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
}

function getAlbumsGrouped() {
    const albums = {};
    createdAlbums.forEach(name => {
        if (!albums[name]) albums[name] = [];
    });
    savedVerses.forEach((v, i) => {
        if (!v) return;
        if (v.album && v.album !== 'Default') {
            if (!albums[v.album]) albums[v.album] = [];
            albums[v.album].push({v, i});
        }
    });
    return albums;
}

function showSavedVerses(rebuildFolders = true) {
    const list = document.getElementById('saved-list');
    
    // Create containers if they don't exist
    let foldersContainer = document.getElementById('saved-folders-container');
    let versesContainer = document.getElementById('saved-verses-container');
    
    if (!foldersContainer) {
        foldersContainer = document.createElement('div');
        foldersContainer.id = 'saved-folders-container';
        list.appendChild(foldersContainer);
    }
    
    if (!versesContainer) {
        versesContainer = document.createElement('div');
        versesContainer.id = 'saved-verses-container';
        list.appendChild(versesContainer);
    }

    const albums = getAlbumsGrouped();
    let validVerses = [];
    savedVerses.forEach((v, i) => {
        if (!v) return;
        validVerses.push({v, i});
    });

    if (rebuildFolders) {
        foldersContainer.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.display = 'flex';
        grid.style.flexWrap = 'wrap';
        grid.style.justifyContent = 'center';
        grid.style.gap = '12px';
        grid.style.width = '90%';
        grid.style.maxWidth = '600px';
        grid.style.margin = '20px auto';
        grid.style.padding = '10px 0 30px 0';
        grid.style.borderBottom = '1px solid var(--glass-border)';
        
        const addFolder = document.createElement('button');
        addFolder.className = 'global-rel-btn';
        addFolder.style.width = 'calc(33.333% - 8px)';
        addFolder.style.aspectRatio = '1';
        addFolder.style.height = 'auto';
        addFolder.innerHTML = `<div style="font-size: 3rem; opacity: 0.5; margin: auto;">+</div>`;
        addFolder.onclick = () => openCreateBookmarkModal();
        grid.appendChild(addFolder);
        
        for (const [albumName, verses] of Object.entries(albums)) {
            const folder = document.createElement('button');
            folder.className = 'global-rel-btn album-folder-btn';
            folder.style.width = 'calc(33.333% - 8px)';
            folder.style.aspectRatio = '1';
            folder.style.height = 'auto';
            folder.style.fontSize = '1.2rem';
            folder.innerText = albumName;
            
            if (selectedSavedAlbum === albumName) {
                folder.classList.add('active');
            }
            
            folder.onclick = () => {
                if (selectedSavedAlbum === albumName) {
                    selectedSavedAlbum = null;
                    folder.classList.remove('active');
                } else {
                    document.querySelectorAll('.album-folder-btn').forEach(btn => btn.classList.remove('active'));
                    selectedSavedAlbum = albumName;
                    folder.classList.add('active');
                }
                showSavedVerses(false); // Do not rebuild folders, just verses
            };
            
            bindRadialMenu(folder, () => {
                return { isAlbum: true, name: albumName };
            }, ['rename', 'delete']);
            
            grid.appendChild(folder);
        }
        foldersContainer.appendChild(grid);
    }
    
    // Rebuild verses list
    versesContainer.innerHTML = '';
    const header = document.createElement('div');
    header.style.fontSize = '1.5rem';
    header.style.marginBottom = '20px';
    header.style.fontWeight = '500';
    header.style.textAlign = 'center';
    
    let versesToRender = validVerses;
    if (selectedSavedAlbum) {
        header.innerText = selectedSavedAlbum;
        versesToRender = albums[selectedSavedAlbum] || [];
    } else {
        header.innerText = 'All';
    }
    
    if (versesToRender.length > 0) {
        versesContainer.appendChild(header);
        renderVersesList(versesToRender, versesContainer);
    } else {
        if (selectedSavedAlbum) {
            header.innerText = selectedSavedAlbum;
            versesContainer.appendChild(header);
            const placeholder = document.createElement('div');
            placeholder.style.textAlign = 'center';
            placeholder.style.opacity = '0.6';
            placeholder.innerText = 'No verses in this folder yet.';
            versesContainer.appendChild(placeholder);
        }
    }
}

function renderVersesList(versesArray, listElement) {
    versesArray.forEach(({v, i}) => {
        const container = document.createElement('div');
        container.classList.add('saved-verse-container');
        const div = document.createElement('div');
        div.classList.add('saved-verse');
        div.style.borderRadius = '16px';
        div.style.transition = 'all 0.2s ease';
        
        const text = document.createElement('div');
        text.classList.add('verse-text');
        let displayVerse = v.text;
        displayVerse = displayVerse.replace(/<span class='author-attr'>.*?<\/span>/gm, '');
        displayVerse = displayVerse.replace(/<[^>]*>?/gm, '');
        text.innerText = displayVerse;
        
        const ref = document.createElement('div');
        ref.classList.add('verse-ref');
        ref.innerText = `${v.book} ${v.chapter}:${v.verse}`;
        
        div.appendChild(text);
        div.appendChild(ref);
        container.appendChild(div);

        // Function to apply active styles
        const applyVerseStyle = () => {
            if (activeSavedVerse && activeSavedVerse.book === v.book && activeSavedVerse.chapter === v.chapter && activeSavedVerse.verse === v.verse) {
                div.style.background = 'var(--text-color)';
                div.style.color = 'var(--bg-grad-1)';
                div.style.opacity = '1';
                div.style.borderColor = 'var(--text-color)';
                text.style.color = 'var(--bg-grad-1)'; // Ensure text follows inverse color
            } else {
                div.style.background = '';
                div.style.color = '';
                div.style.opacity = '';
                div.style.borderColor = '';
                text.style.color = ''; // Reset text color
            }
        };
        applyVerseStyle();

        div.onclick = () => {
            const verseIndex = savedVerses.findIndex(sv => sv.book === v.book && sv.chapter === v.chapter && sv.verse === v.verse);
            if (verseIndex !== -1) {
                activeSavedVerse = savedVerses[verseIndex];
                // Update all verses styling without fully re-rendering them to preserve animation
                document.querySelectorAll('.saved-verse').forEach(el => {
                    el.style.background = '';
                    el.style.color = '';
                    el.style.opacity = '';
                    el.style.borderColor = '';
                    const childText = el.querySelector('.verse-text');
                    if (childText) childText.style.color = '';
                });
                
                // Set the clicked one active
                div.style.background = 'var(--text-color)';
                div.style.color = 'var(--bg-grad-1)';
                div.style.opacity = '1';
                div.style.borderColor = 'var(--text-color)';
                text.style.color = 'var(--bg-grad-1)';
            }
        };
        
        bindRadialMenu(container, () => v, ['share', 'delete']);
        listElement.appendChild(container);
    });
}

function performLibSearch() {
    let pool = [];
    (globalSelectedRels || []).forEach(rel => {
        if (religionVerses[rel]) pool.push(...religionVerses[rel]);
    });

    const kwInput = document.getElementById('lib-search-input').value.trim();
    if (!kwInput) {
        document.getElementById('lib-search-results').innerHTML = '';
        document.getElementById('lib-search-results-count').innerText = '';
        return;
    }
    const input = kwInput.split(/[\s,]+/).filter(Boolean).map(k => k.toLowerCase());
    const positiveKws = input.filter(k => !k.startsWith('-'));
    const negativeKws = input.filter(k => k.startsWith('-')).map(k => k.slice(1));

    const results = pool.filter(v => {
        const textLower = v.text.toLowerCase();
        const matchesPositive = positiveKws.every(k => {
            if (k === 'peace') {
                return textLower.includes('peace') && !textLower.includes('peace be upon');
            } else {
                return textLower.match(new RegExp('\\b' + escapeRegExp(k) + '\\b'));
            }
        });
        const matchesNegative = negativeKws.some(k => textLower.match(new RegExp('\\b' + escapeRegExp(k) + '\\b')));
        return matchesPositive && !matchesNegative;
    });

    document.getElementById('lib-search-results-count').innerText = `Found ${results.length} results`;
    const resultsDiv = document.getElementById('lib-search-results');
    resultsDiv.innerHTML = '';

    const groupedResults = {};
    results.slice(0, 50).forEach(v => {
        if (!groupedResults[v.religion]) groupedResults[v.religion] = [];
        groupedResults[v.religion].push(v);
    });

    for (const [rel, relVerses] of Object.entries(groupedResults)) {
        const header = document.createElement('h3');
        header.style.cursor = 'pointer';
        header.style.padding = '10px';
        header.style.backgroundColor = 'var(--glass-bg)';
        header.style.borderRadius = '12px';
        header.style.marginTop = '15px';
        header.style.color = 'var(--text-color)';
        header.innerText = rel + ' ▼';
        
        const contentDiv = document.createElement('div');
        contentDiv.style.display = 'block';
        
        header.onclick = () => {
            if (contentDiv.style.display === 'none') {
                contentDiv.style.display = 'block';
                header.innerText = rel + ' ▼';
            } else {
                contentDiv.style.display = 'none';
                header.innerText = rel + ' ▶';
            }
        };
        
        resultsDiv.appendChild(header);
        
        relVerses.forEach(v => {
            let highlightedText = v.text;
            positiveKws.forEach(k => {
                const escapedK = escapeRegExp(k);
                const regex = new RegExp('\\b' + escapedK + '\\b', 'gi');
                highlightedText = highlightedText.replace(regex, match => `<span class="highlight">${match}</span>`);
            });
            const div = document.createElement('div');
            div.classList.add('result');
            div.innerHTML = `<div>${highlightedText}</div><div style="text-align: right; font-style: italic; margin-top: 10px; opacity: 0.7;">${v.book} ${v.chapter}:${v.verse}</div>`;
            contentDiv.appendChild(div);
        });
        resultsDiv.appendChild(contentDiv);
    }
}
function showReligions() {
    const list = document.getElementById('rel-list');
    list.innerHTML = '';
    document.getElementById('library-home').classList.remove('hidden');
    document.getElementById('book-list-view').classList.add('hidden');
    document.getElementById('sub-book-list-view').classList.add('hidden');
    document.getElementById('book-content-view').classList.add('hidden');

    (globalSelectedRels || []).forEach(rel => {
        const btn = document.createElement('button');
        btn.innerText = rel;
        if (!religionBooks[rel]) {
            btn.innerText = rel + ' (Loading...)';
            btn.disabled = true;
            btn.style.opacity = '0.5';
        } else {
            btn.onclick = () => showBooks(rel);
        }
        list.appendChild(btn);
    });
}
function showBooks(rel) {
    currentReligion = rel;
    document.getElementById('library-home').classList.add('hidden');
    document.getElementById('book-list-view').classList.remove('hidden');
    document.getElementById('sub-book-list-view').classList.add('hidden');
    document.getElementById('book-content-view').classList.add('hidden');

    const list = document.getElementById('book-list');
    list.innerHTML = '<h2>' + rel + '</h2>';
    religionBooks[rel].books.forEach(book => {
        const btn = document.createElement('button');
        btn.innerText = book.name;
        btn.onclick = () => showBookContent(rel, book);
        list.appendChild(btn);
    });
}

let currentBookObj = null;
let currentSubBook = null;



function showBookContent(rel, book) {
    stopAudio();
    deactivatePillUI();
    currentBookName = book.name;
    currentReligion = rel;
    currentBookObj = book;

    document.getElementById('book-list-view').classList.add('hidden');

    if (book.isNested && book.subBookOrder.length > 1) {
        // Show Sub-Book List
        document.getElementById('book-content-view').classList.add('hidden');
        document.getElementById('sub-book-list-view').classList.remove('hidden');
        
        const list = document.getElementById('sub-book-list');
        list.innerHTML = `<h2>${book.name}</h2>`;
        
        book.subBookOrder.forEach(sub => {
            const btn = document.createElement('button');
            btn.innerText = sub;
            btn.onclick = () => showSubBookContent(sub);
            list.appendChild(btn);
        });
    } else {
        // Direct to Book Content
        document.getElementById('sub-book-list-view').classList.add('hidden');
        document.getElementById('book-content-view').classList.remove('hidden');
        currentSubBook = book.isNested ? book.subBookOrder[0] : null;
        
        const content = book.isNested ? book.subBooks[currentSubBook].content : book.content;
        const chapterOrder = book.isNested ? book.subBooks[currentSubBook].chapterOrder : book.chapterOrder;
        
        currentBookContent = content;
        initializeChapterView(content, chapterOrder);
    }
}

function showSubBookContent(subBookName) {
    stopAudio();
    deactivatePillUI();
    currentSubBook = subBookName;
    document.getElementById('sub-book-list-view').classList.add('hidden');
    document.getElementById('book-content-view').classList.remove('hidden');
    
    const subBookData = currentBookObj.subBooks[subBookName];
    currentBookContent = subBookData.content;
    initializeChapterView(subBookData.content, subBookData.chapterOrder);
}

function initializeChapterView(content, chapterOrder) {
    // Reset State
    currentRenderedChapter = null;
    chapterStartIndices = {};
    globalVerseMap = [];
    let globalIndex = 0;
    chapterList = chapterOrder || Object.keys(content).sort((a, b) => {
        const numA = Number(a.replace(/[^0-9]/g, '')) || 0;
        const numB = Number(b.replace(/[^0-9]/g, '')) || 0;
        return numA - numB;
    });

    // Defensive: some datasets accidentally include duplicate chapter keys in the order list.
    // Dedupe while preserving order so the scrollwheel doesn't show repeating numbers endlessly.
    if (Array.isArray(chapterList)) {
        const seen = new Set();
        chapterList = chapterList.filter(ch => {
            if (seen.has(ch)) return false;
            seen.add(ch);
            return true;
        });
    }
    // Build Global Map
    chapterList.forEach(chap => {
        chapterStartIndices[chap] = globalIndex;
        const verses = Object.keys(content[chap]).sort((a, b) => {
            const numA = Number(a.replace(/[^0-9.]/g, '')) || 0;
            const numB = Number(b.replace(/[^0-9.]/g, '')) || 0;
            return numA - numB;
        });
        verses.forEach(vers => {
            globalVerseMap.push({
                chapter: chap,
                verse: vers,
                text: content[chap][vers],
                globalIndex: globalIndex,
                religion: currentReligion,
                book: currentBookName
            });
            globalIndex++;
        });
    });
    bookVoiceTotalVerses = globalIndex;
    const key = currentReligion + '_' + currentBookName + (currentSubBook ? '_' + currentSubBook : '');
    const marked = bookMarkedVerse[key];
    bookVoiceCurrentVerse = marked !== undefined ? marked : 0;

    populateChapterWheel();

    // Initial Render
    const targetInfo = globalVerseMap[bookVoiceCurrentVerse];
    if (targetInfo) {
        renderChapter(targetInfo.chapter);
        scrollToBookVerse(bookVoiceCurrentVerse);
    } else if (chapterList.length > 0) {
        renderChapter(chapterList[0]);
    }
}
function renderChapter(chapter) {
    if (currentRenderedChapter === chapter) return;

    const container = document.getElementById('book-content-text');
    container.innerHTML = '';

    const verses = currentBookContent[chapter];
    if (!verses) return;
    const sortedKeys = Object.keys(verses).sort((a, b) => {
        const numA = Number(a.replace(/[^0-9.]/g, '')) || 0;
        const numB = Number(b.replace(/[^0-9.]/g, '')) || 0;
        return numA - numB;
    });
    const startIndex = chapterStartIndices[chapter];
    sortedKeys.forEach((vKey, i) => {
        const gIndex = startIndex + i;
        const text = verses[vKey];
        const p = document.createElement('p');
        p.className = 'book-verse';
        p.id = 'book-verse-' + gIndex;
        p.style.cursor = 'pointer';
        let displayVerse = text;
        if (displayVerse.endsWith('.')) displayVerse = displayVerse.slice(0, -1);
        p.innerHTML = displayVerse;
        p.onclick = (e) => {
            e.stopPropagation();
            handleVerseClick(gIndex);
        };
        container.appendChild(p);
    });
    currentRenderedChapter = chapter;
    document.getElementById('read-books').scrollTop = 0;
}
function populateChapterWheel() {
    const wheel = document.getElementById('chapter-scroll-wheel');
    if (!wheel) return;
    wheel.innerHTML = '';

    chapterList.forEach((chap, index) => {
        const div = document.createElement('div');
        div.className = 'chap-wheel-item';
        div.innerText = (index + 1).toString();
        div.dataset.val = chap;
        div.onclick = () => {
            const target = div.offsetLeft + div.offsetWidth / 2 - wheel.clientWidth / 2;
            wheel.scrollTo({ left: target, behavior: 'smooth' });
        };
        wheel.appendChild(div);
    });

    setupChapterWheelListeners();
    requestAnimationFrame(() => syncChapterWheelToCurrent());
}

function setupChapterWheelListeners() {
    const wheel = document.getElementById('chapter-scroll-wheel');
    if (!wheel) return;

    // On scroll: update active styling and debounce chapter selection
    wheel.addEventListener('scroll', () => {
        updateChapterWheelActiveStyle();
        clearTimeout(chapScrollTimeout);
        chapScrollTimeout = setTimeout(() => {
            const active = getActiveChapterWheelItem();
            if (active) chapWheelSelectChapter(active.dataset.val);
        }, 200);
    }, { passive: true });

    // Mouse wheel: translate vertical scroll to horizontal, ONE item per tick
    let wheelCooldown = false;
    wheel.addEventListener('wheel', e => {
        // Let native horizontal scrolling through (trackpad)
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        e.preventDefault();
        if (wheelCooldown) return;
        wheelCooldown = true;
        setTimeout(() => { wheelCooldown = false; }, 200);

        const items = getChapterWheelItems();
        const firstItem = items[0];
        const itemWidth = firstItem ? firstItem.offsetWidth : 50;
        const direction = Math.sign(e.deltaY);
        wheel.scrollBy({ left: direction * itemWidth, behavior: 'smooth' });
    }, { passive: false });
}

function getChapterWheelItems() {
    const wheel = document.getElementById('chapter-scroll-wheel');
    return wheel ? Array.from(wheel.querySelectorAll('.chap-wheel-item[data-val]')) : [];
}

function getActiveChapterWheelItem() {
    const wheel = document.getElementById('chapter-scroll-wheel');
    if (!wheel) return null;
    const items = getChapterWheelItems();
    const containerCenter = wheel.scrollLeft + wheel.clientWidth / 2;
    let closest = null, closestDist = Infinity;
    items.forEach(item => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2;
        const dist = Math.abs(containerCenter - itemCenter);
        if (dist < closestDist) { closestDist = dist; closest = item; }
    });
    return closest;
}

function chapWheelSelectChapter(chap) {
    const currentInfo = globalVerseMap[bookVoiceCurrentVerse];
    if (currentInfo && currentInfo.chapter === chap) return;
    const newIndex = chapterStartIndices[chap];
    if (newIndex !== undefined) {
        selectAndPlayVerse(newIndex);
    }
}

function updateChapterWheelActiveStyle() {
    const wheel = document.getElementById('chapter-scroll-wheel');
    if (!wheel) return;
    const items = getChapterWheelItems();
    const containerCenter = wheel.scrollLeft + wheel.clientWidth / 2;
    const itemWidth = 50; // approximate width of item

    let closestIdx = 0, closestDist = Infinity;

    items.forEach((item, i) => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2;
        const dist = itemCenter - containerCenter;
        const normDist = dist / itemWidth;
        const absNormDist = Math.abs(normDist);

        if (Math.abs(dist) < closestDist) {
            closestDist = Math.abs(dist);
            closestIdx = i;
        }

        // Real-time scale, opacity, and Y-axis rotation
        if (absNormDist < 1.1) {
            const opacity = 1 - absNormDist * 0.4;
            const scale = 1.15 - absNormDist * 0.3;
            const angle = normDist * 40; // 3D rotation angle
            item.style.opacity = opacity;
            item.style.transform = `rotateY(${-angle}deg) scale(${scale}) translateZ(0)`;
            item.style.fontWeight = absNormDist < 0.5 ? '700' : '500';
            item.style.pointerEvents = 'auto';
        } else {
            item.style.opacity = 0;
            item.style.transform = 'scale(0.1) translateZ(0)';
            item.style.pointerEvents = 'none';
        }
    });

    if (lastActiveChapterIdx !== -1 && lastActiveChapterIdx !== closestIdx) {
        playScrollSound();
    }
    lastActiveChapterIdx = closestIdx;
}

function syncChapterWheelToCurrent() {
    const info = globalVerseMap[bookVoiceCurrentVerse];
    if (!info) return;
    const wheel = document.getElementById('chapter-scroll-wheel');
    if (!wheel) return;
    const items = getChapterWheelItems();
    const idx = items.findIndex(i => i.dataset.val === info.chapter);
    if (idx !== -1) {
        isProgrammaticScroll = true;
        const item = items[idx];
        const targetScroll = item.offsetLeft + item.offsetWidth / 2 - wheel.clientWidth / 2;
        wheel.scrollTo({ left: targetScroll, behavior: 'smooth' });
        setTimeout(() => { isProgrammaticScroll = false; updateChapterWheelActiveStyle(); }, 350);
    }
}

// Keep syncWheelsToCurrent as alias for back-compat
function syncWheelsToCurrent() {
    syncChapterWheelToCurrent();
}

function setupWheelListeners() {
    // Horizontal chapter wheel listeners are set up in setupChapterWheelListeners()
    // called from populateChapterWheel() when a book is opened.
}
function scrollToBookVerse(verseIndex) {
    const info = globalVerseMap[verseIndex];
    if (!info) return;
    if (info.chapter !== currentRenderedChapter) {
        renderChapter(info.chapter);
    }
    setTimeout(() => {
        const el = document.getElementById('book-verse-' + verseIndex);
        if (el) {
            const container = document.getElementById('read-books');
            const rect = el.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const currentScroll = container.scrollTop;
            const relativeTop = rect.top - containerRect.top + currentScroll;
            const targetScroll = relativeTop - (container.clientHeight * 0.35);

            container.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
            markVerse();
        }
    }, 50);
}
function selectAndPlayVerse(verseIndex) {
    const wasPlaying = isSpeaking && !isPaused;

    const info = globalVerseMap[verseIndex];
    if (info && info.chapter !== lastAnnouncedChapter) {
        lastAnnouncedChapter = info.chapter;
    }
    bookVoiceCurrentVerse = verseIndex;
    markVerse();
    scrollToBookVerse(bookVoiceCurrentVerse);

    if (wasPlaying) {
        const isFirstVerse = chapterStartIndices[info.chapter] === verseIndex;
        if (isFirstVerse) lastAnnouncedChapter = null;
        playBookVerse(verseIndex);
        autoNextBook = true;
    } else {
        stopAudio();
    }
}
function markVerse() {
    const prev = document.querySelector('.book-verse.marked');
    if (prev) prev.classList.remove('marked');

    const verse = document.getElementById('book-verse-' + bookVoiceCurrentVerse);
    if (verse) {
        verse.classList.add('marked');
    }
    const key = currentReligion + '_' + currentBookName + (currentSubBook ? '_' + currentSubBook : '');
    bookMarkedVerse[key] = bookVoiceCurrentVerse;
    localStorage.setItem('bookMarkedVerse', JSON.stringify(bookMarkedVerse));
}
function toggleMusic() {
    const btn = document.getElementById('music-toggle');
    if (audio.paused) {
        audio.play();
        btn.classList.add('active');
    } else {
        audio.pause();
        btn.classList.remove('active');
    }
}
function nextTrack() {
    currentTrack = (currentTrack + 1) % musicTracks.length;
    audio.src = musicTracks[currentTrack];
    audio.load();
    if (document.getElementById('music-toggle').classList.contains('active')) {
        audio.play().catch(e => console.log("Audio play error:", e));
    }
}
function prevTrack() {
    currentTrack = (currentTrack - 1 + musicTracks.length) % musicTracks.length;
    audio.src = musicTracks[currentTrack];
    audio.load();
    if (document.getElementById('music-toggle').classList.contains('active')) {
        audio.play().catch(e => console.log("Audio play error:", e));
    }
}
function toggleAccordion(header) {
    const religion = header.parentElement.parentElement;
    religion.classList.toggle('expanded');
}

const voicesList = [
    { value: 'en_GB-alan-medium', label: 'Alan' },
    { value: 'en_GB-alba-medium', label: 'Alba' },
    { value: 'en_US-libritts_r-medium', label: 'Libri' }
];

function applyAutoSpeed() {
    let voiceId = selectedVoice;
    if (typeof piperSession !== 'undefined' && piperSession && ttsRandomVoice) {
        voiceId = piperSession.voiceId;
    }

    let speed = 0.9; // Default 4 steps (Alba & Libri)
    if (voiceId === 'en_GB-alan-medium') speed = 1.1; // 6 steps
    
    if (typeof piperSession !== 'undefined' && piperSession && piperSession.voiceId === voiceId) {
        const baseLen = voiceBaseLengths[voiceId] || 1.0;
        piperSession.speedScale = baseLen / speed;
    }
}

// Clamp any old saved voice IDs to the supported Piper voice list.
if (!voicesList.some(v => v.value === selectedVoice)) {
    selectedVoice = 'en_GB-alan-medium';
    localStorage.setItem('selectedVoice', selectedVoice);
    applyAutoSpeed();
}

let isDraggingVoiceWheel = false;

function renderVoiceSettings() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel) return;
    wheel.innerHTML = '';

    voicesList.forEach(v => {
        const div = document.createElement('div');
        div.className = 'voice-wheel-item';
        div.innerText = v.label;
        div.dataset.val = v.value;
        div.onclick = () => {
            const targetScroll = div.offsetTop + div.offsetHeight / 2 - wheel.clientHeight / 2;
            wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
        };
        wheel.appendChild(div);
    });

    setupVoiceWheelListeners();
    syncVoiceWheelToCurrent();
}

function getVoiceWheelItems() {
    const wheel = document.getElementById('voice-scroll-wheel');
    return wheel ? Array.from(wheel.querySelectorAll('.voice-wheel-item[data-val]')) : [];
}

function voiceWheelSelect(val) {
    if (selectedVoice === val) return;
    selectedVoice = val;
    localStorage.setItem('selectedVoice', val);

    if (ttsRandomVoice) {
        ttsRandomVoice = false;
        localStorage.setItem('ttsRandomVoice', ttsRandomVoice);
        updateTogglesUI();
    }

    applyAutoSpeed();
    const items = getVoiceWheelItems();
    items.forEach(el => {
        if (el.dataset.val === val) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}

function updateVoiceWheelActiveStyle() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel) return;
    const clientHeight = wheel.clientHeight || 120;
    const items = getVoiceWheelItems();
    const containerCenter = wheel.scrollTop + clientHeight / 2;
    const itemHeight = 30;

    let closestIdx = 0, closestDist = Infinity;

    items.forEach((item, i) => {
        const offsetHeight = item.offsetHeight || itemHeight;
        const itemCenter = item.offsetTop + offsetHeight / 2;
        const dist = itemCenter - containerCenter;
        const normDist = dist / itemHeight;
        const absNormDist = Math.abs(normDist);

        if (Math.abs(dist) < closestDist) {
            closestDist = Math.abs(dist);
            closestIdx = i;
        }

        // Real-time scale, opacity, and X-axis rotation
        if (absNormDist < 1.1) {
            const opacity = 1 - absNormDist * 0.55;
            const scale = 1.15 - absNormDist * 0.3;
            const angle = normDist * 40;
            item.style.opacity = opacity;
            item.style.transform = `rotateX(${angle}deg) scale(${scale}) translateZ(0)`;
            item.style.fontWeight = absNormDist < 0.5 ? '600' : '400';
            item.style.pointerEvents = 'auto';
        } else {
            item.style.opacity = 0;
            item.style.transform = 'scale(0.1) translateZ(0)';
            item.style.pointerEvents = 'none';
        }
    });

    if (lastActiveVoiceIdx !== -1 && lastActiveVoiceIdx !== closestIdx) {
        if (!isProgrammaticScroll) {
            playScrollSound();
        }
    }
    lastActiveVoiceIdx = closestIdx;

    const activeItem = items[closestIdx];
    if (activeItem) {
        const newVal = activeItem.dataset.val;
        if (selectedVoice !== newVal) {
            selectedVoice = newVal;
            localStorage.setItem('selectedVoice', newVal);

            if (!isProgrammaticScroll && ttsRandomVoice) {
                ttsRandomVoice = false;
                localStorage.setItem('ttsRandomVoice', ttsRandomVoice);
                updateTogglesUI();
            }

            applyAutoSpeed();
        }
    }
}

function syncVoiceWheelToCurrent() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel || wheel.clientHeight === 0) return;
    const items = getVoiceWheelItems();
    const idx = items.findIndex(i => i.dataset.val === selectedVoice);
    if (idx !== -1) {
        const item = items[idx];
        const targetScroll = item.offsetTop + item.offsetHeight / 2 - wheel.clientHeight / 2;
        isProgrammaticScroll = true;
        wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
        clearTimeout(programmaticScrollTimeout);
        programmaticScrollTimeout = setTimeout(() => {
            isProgrammaticScroll = false;
            updateVoiceWheelActiveStyle();
        }, 500);
    }
}

function getActiveVoiceWheelItem() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel || wheel.clientHeight === 0) return null;
    const items = getVoiceWheelItems();
    const containerCenter = wheel.scrollTop + wheel.clientHeight / 2;
    let closest = null, closestDist = Infinity;
    items.forEach(item => {
        const itemCenter = item.offsetTop + item.offsetHeight / 2;
        const dist = Math.abs(containerCenter - itemCenter);
        if (dist < closestDist) { closestDist = dist; closest = item; }
    });
    return closest;
}

function setupVoiceWheelListeners() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel) return;

    wheel.addEventListener('scroll', () => {
        updateVoiceWheelActiveStyle();
        clearTimeout(voiceScrollTimeout);
        voiceScrollTimeout = setTimeout(() => {
            const active = getActiveVoiceWheelItem();
            if (active) {
                const newVal = active.dataset.val;
                if (selectedVoice !== newVal) {
                    selectedVoice = newVal;
                    localStorage.setItem('selectedVoice', newVal);

                    if (!isProgrammaticScroll && ttsRandomVoice) {
                        ttsRandomVoice = false;
                        localStorage.setItem('ttsRandomVoice', ttsRandomVoice);
                        updateTogglesUI();
                    }

                    applyAutoSpeed();
                }
            }
        }, 150);
    }, { passive: true });
}

function onVoiceChange(val) {
    voiceWheelSelect(val);
}

// --- Credits Modal ---
function openCreditsModal() {
    const modal = document.getElementById('credits-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeCreditsModal(event) {
    if (event && event.type === 'click' && event.target !== event.currentTarget) return;
    const modal = document.getElementById('credits-modal');
    if (modal) modal.classList.add('hidden');
}

initApp();

// --- Tooltips Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const tooltip = document.getElementById('global-tooltip');
    let tooltipTimeout;

    function showTooltip(el) {
        let text = el.getAttribute('data-tooltip');
        if (!text || !tooltip) return;
        
        if (text.includes(': ')) {
            text = text.substring(text.indexOf(': ') + 2);
        }
        
        tooltip.innerText = text;
        tooltip.classList.remove('hidden');
        
        const rect = el.getBoundingClientRect();
        let top = rect.bottom + 10;
        let left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
        
        if (left < 10) left = 10;
        if (left + tooltip.offsetWidth > window.innerWidth - 10) left = window.innerWidth - tooltip.offsetWidth - 10;
        if (top + tooltip.offsetHeight > window.innerHeight - 10) top = rect.top - tooltip.offsetHeight - 10;
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    function hideTooltip() {
        if (tooltip) tooltip.classList.add('hidden');
        clearTimeout(tooltipTimeout);
    }

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = setTimeout(() => showTooltip(target), 1000);
        }
    });

    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) hideTooltip();
    });

    document.addEventListener('touchstart', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = setTimeout(() => showTooltip(target), 1000);
        } else {
            hideTooltip();
        }
    }, {passive: true});

    document.addEventListener('touchend', hideTooltip);
    document.addEventListener('touchmove', hideTooltip, {passive: true});
    document.addEventListener('mousedown', hideTooltip, {passive: true});
    document.addEventListener('input', hideTooltip, {passive: true});
});

/* --- Pinterest-style Radial Menu --- */
let radialTimeout = null;
let radialActive = false;
let radialStartPos = { x: 0, y: 0 };
let currentTargetVerse = null;
let activeRadialId = null;
let currentRadialContext = null;
let currentRadialElement = null;

const RADIAL_ACTIONS = {
    bookmark: { id: 'bookmark', icon: '??', color: '#ffb300' },
    share: { id: 'share', icon: '??', color: '#4caf50' },
    delete: { id: 'delete', icon: '???', color: '#f44336' }
};

function getCurrentActiveVerse() {
    const isBookSection = document.getElementById('read-books').classList.contains('active-section') && !document.getElementById('book-content-view').classList.contains('hidden');
    const isFeedSection = document.getElementById('verse-feed').classList.contains('active-section');
    if (isFeedSection && currentFeedBatch[currentCardIndex]) return currentFeedBatch[currentCardIndex];
    if (isBookSection && globalVerseMap[bookVoiceCurrentVerse]) return globalVerseMap[bookVoiceCurrentVerse];
    return null;
}

function bindRadialMenu(element, getVerseFn, actionIds, onClickFn) {
    element.style.touchAction = 'none'; // Prevent scrolling while holding
    element.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return; // only left click
        radialStartPos = { x: e.clientX, y: e.clientY };
        currentTargetVerse = getVerseFn();
        currentRadialContext = actionIds;
        currentRadialElement = element;
        
        radialTimeout = setTimeout(() => {
            if (currentTargetVerse) {
                radialActive = true;
                showRadialMenu(radialStartPos, actionIds);
            }
        }, 300);
    });
}

window.addEventListener('pointermove', (e) => {
    if (!radialActive) {
        // Cancel hold if moved too far before timeout
        if (radialTimeout && currentRadialElement) {
            const dist = Math.hypot(e.clientX - radialStartPos.x, e.clientY - radialStartPos.y);
            if (dist > 15) {
                clearTimeout(radialTimeout);
                radialTimeout = null;
            }
        }
        return;
    }
    updateRadialMenu(e.clientX, e.clientY);
});

window.addEventListener('pointerup', (e) => {
    if (radialTimeout) {
        clearTimeout(radialTimeout);
        radialTimeout = null;
    }
    if (radialActive) {
        executeRadialAction();
        hideRadialMenu();
        radialActive = false;
        currentRadialElement = null;
    } else if (currentRadialElement && e.target.closest('#' + currentRadialElement.id) || (currentRadialElement && currentRadialElement.contains(e.target))) {
        // It was a short click
        if (currentRadialElement.id === 'speak-general') {
            speakCurrent('general');
        }
        currentRadialElement = null;
    }
});

function showRadialMenu(pos, actionIds) {
    const overlay = document.getElementById('radial-overlay');
    overlay.innerHTML = '';
    
    const angleStep = Math.PI / (actionIds.length - 1 || 1); // Arc distribution
    const radius = 70;
    let startAngle = -Math.PI; // default arc
    
    if (actionIds.length === 1) startAngle = -Math.PI / 2;
    
    actionIds.forEach((id, index) => {
        const action = RADIAL_ACTIONS[id];
        if (!action) return;
        
        const item = document.createElement('div');
        item.className = 'radial-item';
        item.innerHTML = action.icon;
        item.dataset.id = action.id;
        
        const angle = actionIds.length === 1 ? startAngle : startAngle + (index * angleStep);
        const x = pos.x + Math.cos(angle) * radius;
        const y = pos.y + Math.sin(angle) * radius;
        
        item.style.left = x + 'px';
        item.style.top = y + 'px';
        
        overlay.appendChild(item);
        setTimeout(() => item.classList.add('active'), 10);
    });
}

function updateRadialMenu(mouseX, mouseY) {
    const items = document.querySelectorAll('.radial-item');
    let minDistance = Infinity;
    activeRadialId = null;
    
    items.forEach(item => {
        item.classList.remove('highlighted');
        const rect = item.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dist = Math.hypot(mouseX - centerX, mouseY - centerY);
        if (dist < minDistance) {
            minDistance = dist;
            activeRadialId = item.dataset.id;
        }
    });
    
    if (minDistance < 50) {
        document.querySelector(`.radial-item[data-id="${activeRadialId}"]`).classList.add('highlighted');
    } else {
        activeRadialId = null;
    }
}

function executeRadialAction() {
    if (!activeRadialId || !currentTargetVerse) return;
    
    if (activeRadialId === 'bookmark') {
        const index = savedVerses.findIndex(s => s.book === currentTargetVerse.book && s.chapter === currentTargetVerse.chapter && s.verse === currentTargetVerse.verse);
        if (index > -1) {
            savedVerses.splice(index, 1);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            showSavedVerses();
            showToast('Removed Bookmark');
        } else {
            openAlbumModal(currentTargetVerse);
        }
    } else if (activeRadialId === 'share') {
        const text = currentTargetVerse.text + " - " + currentTargetVerse.book + " " + currentTargetVerse.chapter + ":" + currentTargetVerse.verse;
        if (navigator.share) {
            navigator.share({ title: 'Daily Verse', text: text }).catch(console.error);
        } else {
            navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!');
        }
    } else if (activeRadialId === 'delete') {
        const index = savedVerses.findIndex(s => s.book === currentTargetVerse.book && s.chapter === currentTargetVerse.chapter && s.verse === currentTargetVerse.verse);
        if (index > -1) {
            savedVerses.splice(index, 1);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            if (document.getElementById('saved-verses').classList.contains('active-section')) {
                showSavedVerses();
            }
            showToast('Deleted from saved.');
        }
    }
}

function hideRadialMenu() {
    const overlay = document.getElementById('radial-overlay');
    overlay.innerHTML = '';
}

function showToast(msg) {
    const tt = document.getElementById('global-tooltip');
    tt.innerText = msg;
    tt.classList.remove('hidden');
    setTimeout(() => tt.classList.add('hidden'), 2000);
}


// Initialize Radial on main buttons
document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('speak-general');
    if (playBtn) {
        bindRadialMenu(playBtn, getCurrentActiveVerse, ['bookmark', 'share']);
    }
});


/* --- Audio Waveform Visualizer --- */
let audioAnalyser = null;
let waveformAnimFrame = null;

function startWaveformVisualizer() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas || !audioAnalyser) return;
    canvas.classList.add('active');
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = 150;
    
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        if (!document.getElementById('waveform-canvas').classList.contains('active')) return;
        waveformAnimFrame = requestAnimationFrame(draw);
        
        audioAnalyser.getByteFrequencyData(dataArray);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw a smooth curved blob
        ctx.beginPath();
        
        const sliceWidth = canvas.width / (bufferLength / 2);
        let x = 0;
        
        // Move to start bottom left
        ctx.moveTo(0, canvas.height);
        
        for (let i = 0; i < bufferLength / 2; i++) {
            // Smooth the data for a blob-like effect
            const v = dataArray[i] / 255.0; // 0 to 1
            const y = canvas.height - (v * canvas.height * 0.8);
            
            // Add control points for smooth bezier curves
            if (i === 0) {
                ctx.lineTo(x, y);
            } else {
                const prevV = dataArray[i-1] / 255.0;
                const prevY = canvas.height - (prevV * canvas.height * 0.8);
                const cpX = x - sliceWidth / 2;
                ctx.quadraticCurveTo(cpX, prevY, x, y);
            }
            x += sliceWidth;
        }
        
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, 'rgba(var(--accent-rgb), 0)');
        gradient.addColorStop(0.5, 'rgba(var(--accent-rgb), 0.5)');
        gradient.addColorStop(1, 'rgba(var(--accent-rgb), 0)');
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw an inner solid line
        ctx.beginPath();
        x = 0;
        for (let i = 0; i < bufferLength / 2; i++) {
            const v = dataArray[i] / 255.0;
            const y = canvas.height - (v * canvas.height * 0.8);
            if (i === 0) ctx.moveTo(x, y);
            else {
                const prevV = dataArray[i-1] / 255.0;
                const prevY = canvas.height - (prevV * canvas.height * 0.8);
                const cpX = x - sliceWidth / 2;
                ctx.quadraticCurveTo(cpX, prevY, x, y);
            }
            x += sliceWidth;
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'var(--accent)';
        ctx.stroke();
    }
    
    draw();
}

function stopWaveformVisualizer() {
    const canvas = document.getElementById('waveform-canvas');
    if (canvas) canvas.classList.remove('active');
    if (waveformAnimFrame) cancelAnimationFrame(waveformAnimFrame);
}


/* --- Album Logic --- */
let pendingBookmarkVerse = null;
let albumScrollTimeout = null;
let isDraggingAlbumWheel = false;
let isProgrammaticAlbumScroll = false;
let programmaticAlbumScrollTimeout = null;
let lastActiveAlbumIdx = -1;

function openAlbumModal(verseObj) {
    pendingBookmarkVerse = verseObj;
    const modal = document.getElementById('album-modal');
    if (!modal) return;
    populateAlbumWheel();
    modal.classList.remove('hidden');
}

function closeAlbumModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('album-modal');
    if (modal) modal.classList.add('hidden');
    pendingBookmarkVerse = null;
}

function saveToAlbum(albumName) {
    if (!pendingBookmarkVerse) return;
    
    const v = { ...pendingBookmarkVerse, album: albumName };
    savedVerses.push(v);
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    
    closeAlbumModal();
    showSavedVerses();
    showToast('Saved to ' + albumName);
}

function getAlbumWheelItems() {
    const wheel = document.getElementById('album-scroll-wheel');
    return wheel ? Array.from(wheel.querySelectorAll('.album-wheel-item[data-val]')) : [];
}

function getActiveAlbumWheelItem() {
    const wheel = document.getElementById('album-scroll-wheel');
    if (!wheel || wheel.clientHeight === 0) return null;
    const items = getAlbumWheelItems();
    const containerCenter = wheel.scrollTop + wheel.clientHeight / 2;
    let closest = null, closestDist = Infinity;
    items.forEach(item => {
        const itemCenter = item.offsetTop + item.offsetHeight / 2;
        const dist = Math.abs(containerCenter - itemCenter);
        if (dist < closestDist) { closestDist = dist; closest = item; }
    });
    return closest;
}

function setupAlbumWheelListeners() {
    const wheel = document.getElementById('album-scroll-wheel');
    if (!wheel || wheel.dataset.listened) return;
    wheel.dataset.listened = "true";

    wheel.addEventListener('wheel', e => {
        e.preventDefault();
        const scrollAmount = e.deltaY;
        wheel.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    });

    wheel.addEventListener('scroll', () => {
        updateAlbumWheelActiveStyle();

        clearTimeout(albumScrollTimeout);
        albumScrollTimeout = setTimeout(() => {
            if (!isDraggingAlbumWheel) {
                const active = getActiveAlbumWheelItem();
                if (active) {
                    const val = active.dataset.val;
                    isProgrammaticAlbumScroll = true;
                    const targetScroll = active.offsetTop + active.offsetHeight / 2 - wheel.clientHeight / 2;
                    wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
                    clearTimeout(programmaticAlbumScrollTimeout);
                    programmaticAlbumScrollTimeout = setTimeout(() => {
                        isProgrammaticAlbumScroll = false;
                    }, 500);
                }
            }
        }, 150);
    });
}

function syncAlbumWheelToCurrent(smooth = true) {
    const wheel = document.getElementById('album-scroll-wheel');
    if (!wheel) return;
    const clientHeight = wheel.clientHeight || 120;
    const items = getAlbumWheelItems();
    if (items.length === 0) return;
    
    const targetAlbum = selectedSavedAlbum || items[0].dataset.val;
    const idx = items.findIndex(i => i.dataset.val === targetAlbum);
    const targetIdx = idx !== -1 ? idx : 0;
    
    const item = items[targetIdx];
    if (item) {
        const offsetHeight = item.offsetHeight || 30;
        const targetScroll = item.offsetTop + offsetHeight / 2 - clientHeight / 2;
        isProgrammaticAlbumScroll = true;
        wheel.scrollTo({ top: targetScroll, behavior: smooth ? 'smooth' : 'auto' });
        clearTimeout(programmaticAlbumScrollTimeout);
        programmaticAlbumScrollTimeout = setTimeout(() => {
            isProgrammaticAlbumScroll = false;
            updateAlbumWheelActiveStyle();
        }, smooth ? 500 : 50);
        updateAlbumWheelActiveStyle();
    }
}

function populateAlbumWheel() {
    const wheel = document.getElementById('album-scroll-wheel');
    if (!wheel) return;
    
    const albums = new Set();
    createdAlbums.forEach(name => {
        if (name && name !== 'Default') albums.add(name);
    });
    savedVerses.forEach(v => {
        if (v.album && v.album !== 'Default') albums.add(v.album);
    });
    
    const albumList = Array.from(albums);
    if (albumList.length === 0) {
        albumList.push('Default');
    }
    
    wheel.innerHTML = '';
    
    const beforeSpacer = document.createElement('div');
    beforeSpacer.style.flexShrink = '0';
    beforeSpacer.style.height = 'calc(50% - 15px)';
    wheel.appendChild(beforeSpacer);
    
    albumList.forEach(album => {
        const item = document.createElement('div');
        item.className = 'album-wheel-item';
        item.dataset.val = album;
        item.innerText = album;
        item.onclick = (e) => {
            e.stopPropagation();
            saveToAlbum(album);
        };
        wheel.appendChild(item);
    });
    
    const afterSpacer = document.createElement('div');
    afterSpacer.style.flexShrink = '0';
    afterSpacer.style.height = 'calc(50% - 15px)';
    wheel.appendChild(afterSpacer);
    
    setupAlbumWheelListeners();
    syncAlbumWheelToCurrent(false);
    
    setTimeout(() => {
        syncAlbumWheelToCurrent(false);
    }, 50);
}

function updateAlbumWheelActiveStyle() {
    const wheel = document.getElementById('album-scroll-wheel');
    if (!wheel) return;
    const clientHeight = wheel.clientHeight || 120;
    const items = wheel.querySelectorAll('.album-wheel-item');
    const containerCenter = wheel.scrollTop + clientHeight / 2;
    const itemHeight = 30;
    
    let closestIdx = 0, closestDist = Infinity;
    
    items.forEach((item, i) => {
        const offsetHeight = item.offsetHeight || itemHeight;
        const itemCenter = item.offsetTop + offsetHeight / 2;
        const dist = itemCenter - containerCenter;
        const normDist = dist / itemHeight;
        const absNormDist = Math.abs(normDist);
        
        if (Math.abs(dist) < closestDist) {
            closestDist = Math.abs(dist);
            closestIdx = i;
        }
        
        if (absNormDist < 1.1) {
            const opacity = 1 - absNormDist * 0.55;
            const scale = 1.15 - absNormDist * 0.3;
            const angle = normDist * 40;
            item.style.opacity = opacity;
            item.style.transform = `rotateX(${angle}deg) scale(${scale}) translateZ(0)`;
            item.style.fontWeight = absNormDist < 0.5 ? '600' : '400';
            item.style.pointerEvents = 'auto';
        } else {
            item.style.opacity = 0;
            item.style.transform = 'scale(0.1) translateZ(0)';
            item.style.pointerEvents = 'none';
        }
    });
    
    if (lastActiveAlbumIdx !== -1 && lastActiveAlbumIdx !== closestIdx) {
        if (!isProgrammaticAlbumScroll) {
            playScrollSound();
        }
    }
    lastActiveAlbumIdx = closestIdx;
}

function updateSpeakIcons() {
    updateSpeakButton('speak-general');
}

function deselectVerse() {
    if (!selectedVerse) return;
    highlightSelectedVerseElement(false);
    selectedVerse = null;
    deactivatePillUI();
}

function deactivatePillUI() {
    const playBtn = document.getElementById('speak-general');
    if (playBtn) {
        playBtn.classList.remove('pill-active');
    }
    const navMenu = document.getElementById('top-nav-menu');
    if (navMenu) {
        navMenu.classList.remove('pill-active-menu');
    }
}

function highlightSelectedVerseElement(active) {
    if (!selectedVerse) return;
    const el = document.getElementById(selectedVerse.elementId);
    if (selectedVerse.type === 'saved') {
        if (el) {
            if (active) {
                el.style.background = 'var(--text-color)';
                el.style.color = 'var(--bg-grad-1)';
                el.style.opacity = '1';
                el.style.borderColor = 'var(--text-color)';
                const t = el.querySelector('.verse-text');
                if (t) t.style.color = 'var(--bg-grad-1)';
                const r = el.querySelector('.verse-ref');
                if (r) r.style.color = 'var(--bg-grad-1)';
            } else {
                el.style.background = '';
                el.style.color = '';
                el.style.opacity = '';
                el.style.borderColor = '';
                const t = el.querySelector('.verse-text');
                if (t) t.style.color = '';
                const r = el.querySelector('.verse-ref');
                if (r) r.style.color = '';
            }
        }
    } else if (selectedVerse.type === 'book') {
        if (el) {
            if (active) {
                el.style.background = 'var(--text-color)';
                el.style.color = 'var(--bg-grad-1)';
                el.style.padding = '8px 12px';
                el.style.borderRadius = '8px';
            } else {
                el.style.background = '';
                el.style.color = '';
                el.style.padding = '';
                el.style.borderRadius = '';
            }
        }
    } else if (selectedVerse.type === 'feed') {
        const card = document.querySelector('.verse-card.card-center');
        if (card) {
            if (active) {
                card.style.background = 'var(--text-color)';
                card.style.color = 'var(--bg-grad-1)';
                card.style.borderColor = 'var(--text-color)';
                card.style.boxShadow = '0 0 15px rgba(var(--loader-rgb), 0.3)';
                const t = card.querySelector('.verse-text');
                if (t) t.style.color = 'var(--bg-grad-1)';
                const r = card.querySelector('.verse-ref');
                if (r) r.style.color = 'var(--bg-grad-1)';
                const f = card.querySelector('.card-footer');
                if (f) f.style.color = 'var(--bg-grad-1)';
            } else {
                card.style.background = '';
                card.style.color = '';
                card.style.borderColor = '';
                card.style.boxShadow = '';
                const t = card.querySelector('.verse-text');
                if (t) t.style.color = '';
                const r = card.querySelector('.verse-ref');
                if (r) r.style.color = '';
                const f = card.querySelector('.card-footer');
                if (f) f.style.color = '';
            }
        }
    }
}

function updatePillUI() {
    const playBtn = document.getElementById('speak-general');
    if (!playBtn) return;
    
    const bookmarkIcon = playBtn.querySelector('.icon-pill-bookmark');
    const deleteIcon = playBtn.querySelector('.icon-pill-delete');
    
    if (selectedVerse && selectedVerse.type === 'saved') {
        if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
        if (deleteIcon) deleteIcon.classList.remove('hidden');
    } else {
        if (bookmarkIcon) bookmarkIcon.classList.remove('hidden');
        if (deleteIcon) deleteIcon.classList.add('hidden');
    }
    
    const playIcon = playBtn.querySelector('.pill-play-icon');
    if (playIcon) {
        if (isSpeaking && !isPaused) {
            playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        } else {
            playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
    }
    
    playBtn.classList.add('pill-active');
    const navMenu = document.getElementById('top-nav-menu');
    if (navMenu) {
        navMenu.classList.add('pill-active-menu');
    }
}

function selectVerse(verseObj, type, elementId, forceSelect = false) {
    if (window.getSelection && window.getSelection().toString().trim().length > 0) return;
    const isDifferentVerse = !selectedVerse || selectedVerse.book !== verseObj.book || selectedVerse.chapter !== verseObj.chapter || selectedVerse.verse !== verseObj.verse || selectedVerse.type !== type;

    if (!forceSelect && !isDifferentVerse) {
        deselectVerse();
        return;
    }

    highlightSelectedVerseElement(false);
    selectedVerse = { ...verseObj, type, elementId };
    highlightSelectedVerseElement(true);

    // Immediate play on selection ONLY if actively playing (isSpeaking is true AND isPaused is false)
    if (isSpeaking && !isPaused && isDifferentVerse && !forceSelect) {
        stopAudio(true);
        if (type === 'book') {
            if (selectedVerse.gIndex !== undefined) {
                bookVoiceCurrentVerse = selectedVerse.gIndex;
                syncWheelsToCurrent();
                scrollToBookVerse(selectedVerse.gIndex);
                markVerse();
                playBookVerse(selectedVerse.gIndex);
                autoNextBook = true;
            }
        } else if (type === 'saved') {
            playText(selectedVerse.text, 'saved');
        } else if (type === 'feed') {
            playText(selectedVerse.text, 'feed');
            autoMode = true;
        }
    } else if (isSpeaking && isPaused && isDifferentVerse && !forceSelect) {
        // If voice session is paused, select/highlight it and update indices, but do NOT autoplay!
        stopAudio(true);
        if (type === 'book') {
            if (selectedVerse.gIndex !== undefined) {
                bookVoiceCurrentVerse = selectedVerse.gIndex;
                syncWheelsToCurrent();
                scrollToBookVerse(selectedVerse.gIndex);
                markVerse();
            }
        }
    } else {
        if (type === 'book') {
            if (selectedVerse.gIndex !== undefined) {
                bookVoiceCurrentVerse = selectedVerse.gIndex;
                syncWheelsToCurrent();
                scrollToBookVerse(selectedVerse.gIndex);
                markVerse();
            }
        }
    }
    updatePillUI();
}

function handlePillLeftAction(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    
    if (selectedVerse.type === 'saved') {
        // Delete action
        const index = savedVerses.findIndex(s => s.book === selectedVerse.book && s.chapter === selectedVerse.chapter && s.verse === selectedVerse.verse);
        if (index > -1) {
            savedVerses.splice(index, 1);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            deselectVerse();
            stopAudio();
            activeSavedVerse = null;
            showSavedVerses();
        }
    } else {
        // Bookmark/Save action
        const index = savedVerses.findIndex(s => s.book === selectedVerse.book && s.chapter === selectedVerse.chapter && s.verse === selectedVerse.verse);
        if (index > -1) {
            savedVerses.splice(index, 1);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            stopAudio();
        } else {
            openAlbumModal(selectedVerse);
        }
    }
}

function handlePillPlay(e) {
    if (e) e.stopPropagation();
    
    if (selectedVerse) {
        if (isSpeaking) {
            if (!isPaused) {
                isPaused = true;
                if (currentAudioNode) {
                    try {
                        currentAudioNode.onended = null;
                        currentAudioNode.stop();
                    } catch (err) { }
                    stopWaveformVisualizer();
                }
                updateSpeakIcons();
                updatePillUI();
            } else {
                isPaused = false;
                startWaveformVisualizer();
                startAudioPlayback(0, currentGenerationId);
                updateSpeakIcons();
                updatePillUI();
            }
        } else {
            if (selectedVerse.type === 'book') {
                bookVoiceCurrentVerse = selectedVerse.gIndex;
                markVerse();
                syncWheelsToCurrent();
                playBookVerse(bookVoiceCurrentVerse);
                autoNextBook = true;
            } else if (selectedVerse.type === 'feed') {
                playText(selectedVerse.text, 'feed');
                autoMode = true;
            } else if (selectedVerse.type === 'saved') {
                playText(selectedVerse.text, 'saved');
            }
            updatePillUI();
        }
    }
}

function handlePillShare(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    
    const text = selectedVerse.text + " - " + selectedVerse.book + " " + selectedVerse.chapter + ":" + selectedVerse.verse;
    if (navigator.share) {
        navigator.share({ title: 'Daily Verse', text: text }).catch(console.error);
    } else {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
    }
}
