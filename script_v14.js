let religionVerses = {};
let activeRankings = {};
let rankingIndices = {};
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
const maxCharLimit = 180;
let darkModeEnabled = localStorage.getItem('darkModeEnabled') !== 'false';
const religions = ['Christianity', 'Islam', 'Hinduism', 'Sikhism', 'Judaism', 'Buddhism', 'Philosophy', 'Psychology'];

const dataUrls = {
    Christianity: ['./data/bible.json'],
    Islam: ['./data/quran_v2.json', './data/hadiths_v2.json'],
    Hinduism: ['./data/gita.json', './data/hindu_books.json'],
    Judaism: ['./data/sefaria.json'],
    Sikhism: ['./data/gurbani.json'],
    Buddhism: ['./data/buddhism.json'],
    Philosophy: ['./data/philosophy.json'],
    Psychology: ['./data/psychology.json']
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
    populateVoiceWheel();

    showSavedVerses();
    
    try {
        const res = await fetch('./data/active_rankings.json');
        if (res.ok) {
            activeRankings = await res.json();
            Object.keys(activeRankings).forEach(r => rankingIndices[r] = 0);
        }
    } catch(e) {
        console.error("Could not load active_rankings.json", e);
    }
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
        
        await loadSelectedData();
        document.getElementById('loading').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
        }, 500);
        initializeVerseFeed();
        goTo('verse-feed');
        loadUnselectedDataInBackground();
    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('loading').innerHTML = '<div style="color:var(--text-color)">Error loading data.</div>';
    }
    setupGestures();
    setupWheelListeners();
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
                } catch (e) {}
                currentAudioPausedAt = ctx.currentTime - currentAudioStartTime;
                if (currentAudioPausedAt < 0) currentAudioPausedAt = 0;
            } else if (currentUtterance) {
                window.speechSynthesis.pause();
            }
            stopWaveformVisualizer();
            updateSpeakIcons();
            return;
        } else {
            isPaused = false;
            if (currentAudioBuffer) {
                startAudioPlayback(currentAudioPausedAt, currentGenerationId);
            } else if (currentUtterance) {
                window.speechSynthesis.resume();
            }
            updateSpeakIcons();
            return;
        }
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
    const wasPlaying = isSpeaking && !isPaused;
    stopAudio();

    const info = globalVerseMap[index];
    if (info && info.chapter !== lastAnnouncedChapter) {
        lastAnnouncedChapter = info.chapter;
    }
    bookVoiceCurrentVerse = index;
    markVerse();
    syncWheelsToCurrent();
    if (wasPlaying) {
        const isFirstVerse = chapterStartIndices[info.chapter] === index;
        if (isFirstVerse) lastAnnouncedChapter = null;
        playBookVerse(index);
        autoNextBook = true;
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
        if (rel === 'Philosophy') processGenericData(responses[0], 'Philosophy');
        if (rel === 'Psychology') processGenericData(responses[0], 'Psychology');

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
function processGenericData(data, relName) {
    let verses = [];
    let books = [];
    if (data && data.books) {
        Object.keys(data.books).forEach(bookName => {
            let bookData = data.books[bookName];
            let bookChapters = {};
            Object.keys(bookData).forEach(chapNum => {
                let chapData = bookData[chapNum];
                bookChapters[chapNum] = chapData;
                Object.keys(chapData).forEach(verseNum => {
                    verses.push({
                        book: bookName,
                        chapter: chapNum,
                        verse: verseNum,
                        text: cleanText(chapData[verseNum]),
                        religion: relName
                    });
                });
            });
            books.push({ name: bookName, content: bookChapters });
        });
    }
    religionVerses[relName] = verses;
    religionBooks[relName] = { books: books };
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
function showSavedVerses() {
    const list = document.getElementById('saved-list');
    list.innerHTML = '';
    const albums = {};
    savedVerses.forEach((v, i) => {
        const container = document.createElement('div');
        container.classList.add('saved-verse-container');
        const div = document.createElement('div');
        div.classList.add('saved-verse');
        const albumName = v.album || 'Default';
        if (!albums[albumName]) albums[albumName] = [];
        albums[albumName].push({ v, i });
    });
    
    for (const [albumName, verses] of Object.entries(albums)) {
        const albumHeader = document.createElement('h3');
        albumHeader.style.color = 'var(--text-color)';
        albumHeader.style.marginTop = '20px';
        albumHeader.style.marginBottom = '10px';
        albumHeader.innerText = albumName;
        list.appendChild(albumHeader);
        
        verses.forEach(({v, i}) => {
            const container = document.createElement('div');
            container.classList.add('saved-verse-container');
            const div = document.createElement('div');
            div.classList.add('saved-verse');
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
            
            // Bind radial menu to this saved verse card
            bindRadialMenu(container, () => v, ['share', 'delete']);
            
            list.appendChild(container);
        });
    }
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

function populateVoiceWheel() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel) return;
    wheel.innerHTML = '';

    voicesList.forEach((voiceObj, index) => {
        const voiceKey = voiceObj.value;
        const div = document.createElement('div');
        div.className = 'voice-wheel-item';
        div.innerText = voiceObj.label.split(' ')[0]; // short name
        div.dataset.val = voiceKey;
        div.onclick = () => {
            const target = div.offsetTop + div.offsetHeight / 2 - wheel.clientHeight / 2;
            wheel.scrollTo({ top: target, behavior: 'smooth' });
        };
        wheel.appendChild(div);
    });

    setupVoiceWheelListeners();
    requestAnimationFrame(() => syncVoiceWheelToCurrent());
}

function setupVoiceWheelListeners() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel) return;

    wheel.addEventListener('scroll', () => {
        updateVoiceWheelActiveStyle();
        clearTimeout(voiceScrollTimeout);
        voiceScrollTimeout = setTimeout(() => {
            const active = getActiveVoiceWheelItem();
            if (active && active.dataset.val !== selectedVoice) {
                selectedVoice = active.dataset.val;
                localStorage.setItem('selectedVoice', selectedVoice);
                applyAutoSpeed(selectedVoice);
            }
        }, 200);
    }, { passive: true });

    let wheelCooldown = false;
    wheel.addEventListener('wheel', e => {
        if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        e.preventDefault();
        if (wheelCooldown) return;
        wheelCooldown = true;
        setTimeout(() => { wheelCooldown = false; }, 200);

        const items = getVoiceWheelItems();
        const firstItem = items[0];
        const itemHeight = firstItem ? firstItem.offsetHeight : 30;
        const direction = Math.sign(e.deltaY);
        wheel.scrollBy({ top: direction * itemHeight, behavior: 'smooth' });
    }, { passive: false });
}

function getVoiceWheelItems() {
    return Array.from(document.querySelectorAll('.voice-wheel-item'));
}

function updateVoiceWheelActiveStyle() {
    const active = getActiveVoiceWheelItem();
    getVoiceWheelItems().forEach(item => {
        if (item === active) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function getActiveVoiceWheelItem() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel) return null;
    const center = wheel.scrollTop + wheel.clientHeight / 2;
    let closest = null;
    let minDiff = Infinity;
    getVoiceWheelItems().forEach(item => {
        const itemCenter = item.offsetTop + item.offsetHeight / 2;
        const diff = Math.abs(itemCenter - center);
        if (diff < minDiff) {
            minDiff = diff;
            closest = item;
        }
    });
    return closest;
}

function syncVoiceWheelToCurrent() {
    const wheel = document.getElementById('voice-scroll-wheel');
    if (!wheel) return;
    const items = getVoiceWheelItems();
    const idx = items.findIndex(i => i.dataset.val === selectedVoice);
    if (idx !== -1) {
        const item = items[idx];
        const targetScroll = item.offsetTop + item.offsetHeight / 2 - wheel.clientHeight / 2;
        wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
        setTimeout(() => updateVoiceWheelActiveStyle(), 350);
    }
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
    let closestIdx = 0, closestDist = Infinity;
    items.forEach((item, i) => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2;
        const dist = Math.abs(containerCenter - itemCenter);
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    items.forEach((item, i) => {
        item.classList.remove('chap-active', 'chap-neighbor');
        if (i === closestIdx) {
            item.classList.add('chap-active');
            if (lastActiveChapterIdx !== -1 && lastActiveChapterIdx !== closestIdx) {
                playScrollSound();
            }
            lastActiveChapterIdx = closestIdx;
        } else if (i === closestIdx - 1 || i === closestIdx + 1) {
            item.classList.add('chap-neighbor');
        }
    });
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
    if (!wheel || wheel.clientHeight === 0) return;
    const items = getVoiceWheelItems();
    const containerCenter = wheel.scrollTop + wheel.clientHeight / 2;
    let closestIdx = 0, closestDist = Infinity;
    items.forEach((item, i) => {
        const itemCenter = item.offsetTop + item.offsetHeight / 2;
        const dist = Math.abs(containerCenter - itemCenter);
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    items.forEach((item, i) => {
        item.classList.remove('voice-active');
        if (i === closestIdx) {
            item.classList.add('voice-active');
            if (lastActiveVoiceIdx !== -1 && lastActiveVoiceIdx !== closestIdx) {
                playScrollSound();
            }
            lastActiveVoiceIdx = closestIdx;
            const newVal = item.dataset.val;
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
    });
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
        document.querySelector('.radial-item[data-id=""]').classList.add('highlighted');
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
        const text = `"${currentTargetVerse.text}" - ${currentTargetVerse.author}, ${currentTargetVerse.book_name || currentTargetVerse.book}`;
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

function openAlbumModal(verseObj) {
    pendingBookmarkVerse = verseObj;
    const modal = document.getElementById('album-modal');
    const list = document.getElementById('album-list');
    
    const albums = new Set(['Default']);
    savedVerses.forEach(v => {
        if (v.album) albums.add(v.album);
    });
    
    list.innerHTML = '';
    albums.forEach(album => {
        const btn = document.createElement('button');
        btn.className = 'global-rel-btn';
        btn.innerText = album;
        btn.onclick = () => saveToAlbum(album);
        list.appendChild(btn);
    });
    
    modal.classList.remove('hidden');
}

function closeAlbumModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('album-modal').classList.add('hidden');
    pendingBookmarkVerse = null;
}

function saveToNewAlbum() {
    const input = document.getElementById('new-album-name');
    const name = input.value.trim();
    if (name) saveToAlbum(name);
    input.value = '';
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



// ==========================================
// GOOGLE AUTHENTICATION (Restored)
// ==========================================
let isGoogleLoggedIn = false;
let googleUserToken = null;
let googleUserData = null;
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID";

window.onload = function() {
    if (typeof google !== "undefined" && GOOGLE_CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID") {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse
        });
        
        // Auto-login check
        const storedToken = localStorage.getItem('googleUserToken');
        if (storedToken) {
            handleGoogleCredentialResponse({ credential: storedToken });
        }
    }
};

function handleGoogleCredentialResponse(response) {
    try {
        const payload = parseJwt(response.credential);
        googleUserToken = response.credential;
        googleUserData = payload;
        isGoogleLoggedIn = true;
        
        localStorage.setItem('googleUserToken', googleUserToken);
        
        // Update UI
        const authBtn = document.getElementById('user-google-btn');
        if (authBtn) {
            const svg = document.getElementById('google-icon-svg');
            const avatar = document.getElementById('google-avatar-text');
            if (svg) svg.classList.add('hidden');
            if (avatar) {
                avatar.classList.remove('hidden');
                avatar.innerText = payload.name ? payload.name.charAt(0).toUpperCase() : 'U';
            }
        }
        
        // Sync local data with cloud here
        showToast("Logged in successfully as " + payload.name);
        
    } catch (e) {
        console.error("Google login failed", e);
    }
}

function parseJwt(token) {
    try {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch(e) {
        return {};
    }
}

function toggleGoogleAuth() {
    if (isGoogleLoggedIn) {
        // Logout
        isGoogleLoggedIn = false;
        googleUserToken = null;
        googleUserData = null;
        localStorage.removeItem('googleUserToken');
        
        const authBtn = document.getElementById('user-google-btn');
        if (authBtn) {
            const svg = document.getElementById('google-icon-svg');
            const avatar = document.getElementById('google-avatar-text');
            if (svg) svg.classList.remove('hidden');
            if (avatar) avatar.classList.add('hidden');
        }
        showToast("Logged out successfully");
    } else {
        // Login
        if (typeof google !== "undefined" && GOOGLE_CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID") {
            google.accounts.id.prompt();
        } else {
            showToast("Google Login is not configured yet. Add your Client ID.");
        }
    }
}

function continueAsGuest() {
    // Hide auth modal if we had one
    const premiumModal = document.getElementById('premium-modal');
    if (premiumModal) {
        premiumModal.classList.add('hidden');
    }
}

// ==========================================
// SUBSCRIPTION / PREMIUM LOGIC (Restored)
// ==========================================
// The variable isSubscribed is currently defined near the top. We will just use localStorage for it.
let isSubscribed = localStorage.getItem('isSubscribed') === 'true';

function openPremiumModal() {
    const modal = document.getElementById('premium-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Configure actions based on login state
        const guestActions = document.getElementById('premium-guest-actions');
        const userActions = document.getElementById('premium-user-actions');
        
        if (isGoogleLoggedIn) {
            if (guestActions) guestActions.classList.add('hidden');
            if (userActions) userActions.classList.remove('hidden');
        } else {
            if (guestActions) guestActions.classList.remove('hidden');
            if (userActions) userActions.classList.add('hidden');
            
            // Render google button here if needed
            if (typeof google !== "undefined" && GOOGLE_CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID") {
                google.accounts.id.renderButton(
                    document.getElementById("google-signin-btn-container-modal"),
                    { theme: "outline", size: "large", width: 250 }
                );
            }
        }
    }
}

function closePremiumModal(e) {
    if (e && e.target && !e.target.classList.contains('modal-overlay') && !e.target.classList.contains('premium-close-btn')) {
        return; 
    }
    const modal = document.getElementById('premium-modal');
    if (modal) modal.classList.add('hidden');
}

function simulatePurchase() {
    isSubscribed = true;
    localStorage.setItem('isSubscribed', 'true');
    showToast("Premium Unlocked! Thank you for subscribing.");
    closePremiumModal({ target: { classList: { contains: () => true } } });
}

// ==========================================
// CUSTOM ALBUMS & BOOKMARKS (Restored)
// ==========================================
function closeCreateBookmarkModal(e) {
    if (e) e.stopPropagation();
    const m = document.getElementById('create-bookmark-modal');
    if (m) m.classList.add('hidden');
}

function setCreateModalTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    const btn = document.querySelector(`.tab-btn[onclick="setCreateModalTab('${tabId}')"]`);
    if (btn) btn.classList.add('active');
    
    const content = document.getElementById(`tab-${tabId}`);
    if (content) content.classList.add('active');
}

function submitCreateVerse() {
    const text = document.getElementById('custom-verse-text').value;
    const author = document.getElementById('custom-verse-author').value;
    const ref = document.getElementById('custom-verse-ref').value;
    
    if (!text) {
        showToast("Please enter text");
        return;
    }
    
    const verse = {
        book_id: "Custom",
        book_name: "Personal Notes",
        author: author || "Me",
        chapter: "1",
        verse: ref || "1",
        text: text,
        religion: "Custom"
    };
    
    savedVerses.push(verse);
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    showToast("Note saved!");
    closeCreateBookmarkModal();
    document.getElementById('custom-verse-text').value = '';
    document.getElementById('custom-verse-author').value = '';
    document.getElementById('custom-verse-ref').value = '';
}

function submitCreateAlbum() {
    const name = document.getElementById('new-album-name').value;
    if (!name) {
        showToast("Please enter an album name");
        return;
    }
    
    createdAlbums.push({
        id: Date.now().toString(),
        name: name,
        verses: []
    });
    
    localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
    showToast(`Album "${name}" created`);
    closeCreateBookmarkModal();
    document.getElementById('new-album-name').value = '';
}

function closeRenameModal(e) {
    if (e) e.stopPropagation();
    const m = document.getElementById('rename-modal');
    if (m) m.classList.add('hidden');
}

function submitRenameAlbum() {
    const m = document.getElementById('rename-modal');
    if (!m) return;
    const albumId = m.getAttribute('data-album-id');
    const newName = document.getElementById('rename-input').value;
    
    if (albumId && newName) {
        const album = createdAlbums.find(a => a.id === albumId);
        if (album) {
            album.name = newName;
            localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
            showToast("Album renamed");
            showSavedVerses(); // Refresh UI
        }
    }
    closeRenameModal();
}

// ==========================================
// PILL SWIPE GESTURES (Restored)
// ==========================================
function handlePillLeftAction(el) {
    const idx = parseInt(el.getAttribute('data-idx'));
    const source = el.getAttribute('data-source');
    let verse = null;
    
    if (source === 'history' && typeof listeningHistory !== 'undefined') verse = listeningHistory[idx];
    else if (source === 'saved' && typeof savedVerses !== 'undefined') verse = savedVerses[idx];
    else if (source === 'album' && typeof currentAlbumVerses !== 'undefined') verse = currentAlbumVerses[idx];
    
    if (verse) toggleBookmark(verse, el);
}

function handlePillPlay(el) {
    const idx = parseInt(el.getAttribute('data-idx'));
    const source = el.getAttribute('data-source');
    let verse = null;
    
    if (source === 'history' && typeof listeningHistory !== 'undefined') verse = listeningHistory[idx];
    else if (source === 'saved' && typeof savedVerses !== 'undefined') verse = savedVerses[idx];
    else if (source === 'album' && typeof currentAlbumVerses !== 'undefined') verse = currentAlbumVerses[idx];
    
    if (verse) {
        selectAndPlayVerse(verse);
        goTo('verse-feed');
    }
}

function handlePillShare(el) {
    const idx = parseInt(el.getAttribute('data-idx'));
    const source = el.getAttribute('data-source');
    let verse = null;
    
    if (source === 'history' && typeof listeningHistory !== 'undefined') verse = listeningHistory[idx];
    else if (source === 'saved' && typeof savedVerses !== 'undefined') verse = savedVerses[idx];
    else if (source === 'album' && typeof currentAlbumVerses !== 'undefined') verse = currentAlbumVerses[idx];
    
    if (verse) {
        if (navigator.share) {
            navigator.share({
                title: `${verse.book_name} - ${verse.author}`,
                text: `"${verse.text}"
— ${verse.author}, ${verse.book_name}`
            });
        } else {
            navigator.clipboard.writeText(`"${verse.text}"
— ${verse.author}, ${verse.book_name}`);
            showToast("Copied to clipboard!");
        }
    }
}

// ==========================================
// DIAGNOSTICS (Restored)
// ==========================================
function copyErrorLogsToClipboard() {
    const diag = document.getElementById('error-list-content');
    if (diag) {
        navigator.clipboard.writeText(diag.innerText);
        showToast("Logs copied to clipboard");
    }
}

function selectDiagnosticsText() {
    const diag = document.getElementById('error-list-content');
    if (diag) {
        const range = document.createRange();
        range.selectNodeContents(diag);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// --- Diagnostics & Fallbacks ---
function updateSpeakIcons() { updateSpeakButton('speak-general'); }
