// ==============================================
// GLOBAL USER STATE & ISOLATED PROFILE / CLOUD SYNC ENGINE
// ==============================================
const originalGetItem = localStorage.getItem;
const originalSetItem = localStorage.setItem;
const originalRemoveItem = localStorage.removeItem;

let googleUser = null;
try {
    const rawUser = originalGetItem.call(localStorage, 'googleUser');
    if (rawUser) googleUser = JSON.parse(rawUser);
} catch(e) { googleUser = null; }

let googleAccessToken = null;
let cloudSyncTimeout = null;
let isRestoringState = false;

const STATE_KEYS = [
    'globalSelectedRels', 'savedVerses', 'createdAlbums', 
    'bookMarkedVerse', 'darkModeEnabled', 'selectedVoice', 
    'ttsAnnounceSource', 'ttsRandomVoice', 'musicVolume', 'musicEnabled'
];

function getActiveProfileId() {
    if (googleUser && googleUser.sub) {
        return 'account_' + googleUser.sub;
    }
    return 'guest';
}

// Automatic One-Time Migration of un-namespaced keys into pf_guest_*
(function migrateOldStorageToGuest() {
    const migrated = originalGetItem.call(localStorage, 'pf_guest_migrated_v2');
    if (!migrated) {
        STATE_KEYS.forEach(key => {
            const oldVal = originalGetItem.call(localStorage, key);
            if (oldVal !== null && oldVal !== undefined) {
                originalSetItem.call(localStorage, 'pf_guest_' + key, oldVal);
                originalRemoveItem.call(localStorage, key);
            }
        });
        originalSetItem.call(localStorage, 'pf_guest_migrated_v2', 'true');
    }
})();

// Intercept localStorage methods for STATE_KEYS so every component operates on active profile sandbox
localStorage.getItem = function(key) {
    if (STATE_KEYS.includes(key)) {
        const profileId = getActiveProfileId();
        return originalGetItem.call(this, 'pf_' + profileId + '_' + key);
    }
    return originalGetItem.call(this, key);
};

localStorage.setItem = function(key, value) {
    if (STATE_KEYS.includes(key)) {
        const profileId = getActiveProfileId();
        originalSetItem.call(this, 'pf_' + profileId + '_' + key, value);
        if (!isRestoringState && typeof triggerCloudSync === 'function') {
            triggerCloudSync();
        }
        return;
    }
    originalSetItem.call(this, key, value);
};

localStorage.removeItem = function(key) {
    if (STATE_KEYS.includes(key)) {
        const profileId = getActiveProfileId();
        originalRemoveItem.call(this, 'pf_' + profileId + '_' + key);
        return;
    }
    originalRemoveItem.call(this, key);
};

function switchProfile(targetProfileId) {
    isRestoringState = true;
    
    try {
        savedVerses = JSON.parse(localStorage.getItem('savedVerses') || '[]');
    } catch(e) { savedVerses = []; }

    try {
        createdAlbums = JSON.parse(localStorage.getItem('createdAlbums') || '[]');
    } catch(e) { createdAlbums = []; }

    try {
        bookMarkedVerse = JSON.parse(localStorage.getItem('bookMarkedVerse') || '{}');
    } catch(e) { bookMarkedVerse = {}; }

    try {
        const rawRels = localStorage.getItem('globalSelectedRels');
        if (rawRels) {
            const parsed = JSON.parse(rawRels);
            if (Array.isArray(parsed)) {
                globalSelectedRels = parsed.filter(r => ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'].includes(r));
            } else if (typeof parsed === 'string' && ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'].includes(parsed)) {
                globalSelectedRels = [parsed];
            } else {
                globalSelectedRels = null;
            }
        } else {
            globalSelectedRels = null;
        }
    } catch(e) { globalSelectedRels = null; }

    if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
        globalSelectedRels = [...religions];
        localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    }

    const dmStr = localStorage.getItem('darkModeEnabled');
    darkModeEnabled = dmStr === null ? true : dmStr === 'true';
    if (darkModeEnabled) document.body.setAttribute('data-theme', 'dark');
    else document.body.removeAttribute('data-theme');
    if (typeof updateDarkModeIcon === 'function') updateDarkModeIcon(darkModeEnabled);

    selectedVoice = localStorage.getItem('selectedVoice') || 'en_GB-alan-medium';
    ttsAnnounceSource = localStorage.getItem('ttsAnnounceSource') === 'true';
    ttsRandomVoice = localStorage.getItem('ttsRandomVoice') === 'true';

    if (typeof audio !== 'undefined' && audio) {
        audio.volume = parseFloat(localStorage.getItem('musicVolume') || '0.5');
    }
    const slider = document.getElementById('music-volume-slider');
    if (slider) slider.value = localStorage.getItem('musicVolume') || '0.5';

    const mEnabled = localStorage.getItem('musicEnabled') !== 'false';
    const musicBtn = document.getElementById('music-toggle');
    if (musicBtn) {
        if (mEnabled) {
            if (typeof audio !== 'undefined' && audio) {
                audio.play().then(() => {
                    musicBtn.classList.add('active');
                }).catch(e => {
                    const playOnInteract = () => {
                        if (localStorage.getItem('musicEnabled') !== 'false') {
                            audio.play().then(() => {
                                const btn = document.getElementById('music-toggle');
                                if (btn) btn.classList.add('active');
                                document.removeEventListener('click', playOnInteract);
                                document.removeEventListener('pointerdown', playOnInteract);
                                document.removeEventListener('touchstart', playOnInteract);
                            }).catch(err => {});
                        }
                    };
                    document.addEventListener('click', playOnInteract);
                    document.addEventListener('pointerdown', playOnInteract);
                    document.addEventListener('touchstart', playOnInteract, {passive: true});
                });
            }
        } else {
            musicBtn.classList.remove('active');
            if (typeof audio !== 'undefined' && audio) audio.pause();
        }
    }

    if (typeof updateTogglesUI === 'function') updateTogglesUI();
    if (typeof buildSettings === 'function') buildSettings();
    if (typeof syncVoiceWheelToCurrent === 'function') syncVoiceWheelToCurrent();

    if (typeof showSavedVerses === 'function' && document.getElementById('saved-verses')) {
        showSavedVerses();
    }

    isRestoringState = false;
}

function loadStateFromProfile(profileId) {
    switchProfile(profileId);
}

function saveStateToProfile(profileId) {
    // Isolated profile storage handles saving automatically via intercepted setItem
}

function triggerCloudSync() {
    if (!googleUser || !googleUser.sub) return;
    clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = setTimeout(() => {
        if (typeof saveUserDataToFirestore === 'function') {
            saveUserDataToFirestore(googleUser.sub);
        }
    }, 1500);
}
// ==============================================



const validReligions = ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'];
let religionVerses = {};
let religionBooks = {};
let globalSelectedRels = null;
try {
    const rawRels = localStorage.getItem('globalSelectedRels');
    if (rawRels !== null) {
        const parsed = JSON.parse(rawRels);
        if (Array.isArray(parsed)) {
            globalSelectedRels = parsed.filter(r => validReligions.includes(r));
        } else if (typeof parsed === 'string') {
            globalSelectedRels = validReligions.includes(parsed) ? [parsed] : null;
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
// Migration: Ensure all loaded verses have unique IDs
if (Array.isArray(savedVerses)) {
    let changed = false;
    savedVerses.forEach(v => {
        if (!v.id || typeof v.id !== 'string') {
            v.id = 'sv_' + Date.now() + '_' + Math.floor(Math.random()*100000);
            changed = true;
        }
    });
    if (changed) {
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    }
}
let audio;
let currentTrack = 0;
const musicTracks = [
    'https://www.fesliyanstudios.com/download-link.php?src=i&id=310',
    'https://www.fesliyanstudios.com/download-link.php?src=i&id=897',
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
const religions = ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'];

const dataUrls = {
    Christianity: ['./data/bible.json?v=21'],
    Islam: ['./data/quran_v2.json?v=21', './data/hadiths_v2.json?v=21'],
    Hinduism: ['./data/gita.json?v=21'], // Removed hindu_books.json to fix garbled Rigveda Agni verses
    Judaism: ['./data/sefaria.json?v=21'],
    Sikhism: ['./data/gurbani.json?v=21'],
    Buddhism: ['./data/buddhism.json?v=21'],
    Philosophy: ['./data/philosophy.json?v=21']
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
if (!Array.isArray(createdAlbums)) createdAlbums = [];

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioAnalyser = null;
let waveformAnimFrame = null;
let unlockTriggered = false;

// Random Ad scheduling (every 10-15 verses)
let nextAdIndex = Math.floor(Math.random() * 6) + 10;

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

async function checkForAppUpdates() {
    if (!window.Capacitor || !Capacitor.isNative) return;
    try {
        const AppUpdate = Capacitor.Plugins.AppUpdate;
        if (AppUpdate) {
            const result = await AppUpdate.getAppUpdateInfo();
            // 2 = UPDATE_AVAILABLE
            if (result.updateAvailability === 2 && result.immediateUpdateAllowed) {
                await AppUpdate.performImmediateUpdate();
            }
        }
    } catch (e) {
        console.error("App Update check failed:", e);
    }
}

async function initApp() {
    checkForAppUpdates();
    updateUserUI();
    switchProfile(getActiveProfileId());
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
        let savedVol = localStorage.getItem('musicVolume');
        audio.volume = savedVol !== null ? parseFloat(savedVol) : 0.5;
        
        let volumeSlider = document.getElementById('music-volume-slider');
        if (volumeSlider) {
            volumeSlider.value = audio.volume;
        }

        audio.src = musicTracks[currentTrack];
        audio.addEventListener('ended', nextTrack);

        let musicEnabled = localStorage.getItem('musicEnabled');
        if (musicEnabled === null) musicEnabled = 'true'; // Default on
        
        const musicBtn = document.getElementById('music-toggle');
        if (musicEnabled === 'true' && musicBtn) {
            audio.play().then(() => {
                musicBtn.classList.add('active');
            }).catch(e => {
                const playOnInteract = () => {
                    if (localStorage.getItem('musicEnabled') !== 'false') {
                        audio.play().then(() => {
                            const btn = document.getElementById('music-toggle');
                            if (btn) btn.classList.add('active');
                            document.removeEventListener('click', playOnInteract);
                            document.removeEventListener('pointerdown', playOnInteract);
                            document.removeEventListener('touchstart', playOnInteract);
                        }).catch(err => {});
                    }
                };
                document.addEventListener('click', playOnInteract);
                document.addEventListener('pointerdown', playOnInteract);
                document.addEventListener('touchstart', playOnInteract, {passive: true});
            });
        }

        if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
            globalSelectedRels = [...religions];
            localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
            triggerCloudSync();
        }

        setupGestures();
        setupWheelListeners();
        
        // Do not await loadSelectedData, let it load in background so app starts instantly
        loadSelectedData().then(() => {
            // Once initial data loads, initialize the feed if we haven't already
            if (Object.keys(verseBatches.general).length === 0) {
                initializeVerseFeed();
            }
        });
        
        // Show feed UI immediately (will be blank for a split second until data loads)
        goTo('verse-feed');

        const loadingScreen = document.getElementById('loading');
        if (loadingScreen) {
            loadingScreen.classList.add('loaded');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 300);
        }

        // Initialize Piper TTS in background without blocking UI rendering
        try {
            initPiper(selectedVoice).catch(e => console.log("Piper init error:", e));
        } catch(e) {}

    } catch (error) {
        console.error('Initialization error:', error);
    }
}
function updateDarkModeIcon(isDark) {
    const btn = document.getElementById('dark-mode-toggle');
    if (!btn) return;
    if (isDark) {
        btn.innerHTML = '<svg id="dark-mode-icon-svg" style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    } else {
        btn.innerHTML = '<svg id="dark-mode-icon-svg" style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    }
}
let lastSwipeTime = 0;

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
        if (Date.now() - lastSwipeTime < 500) return; // Prevent phantom clicks after a swipe
        
        if (e.target.closest('.bookmark-btn') || e.target.closest('.speak-btn')) return;
        const width = window.innerWidth;
        const clickX = e.clientX;
        
        // Use 40% on left and right for navigation. The middle 20% selects the verse.
        const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
        if (!isFeed) return;
        if (clickX < width * 0.4) {
            prevCard();
        } else if (clickX > width * 0.6) {
            nextCard();
        } else {
            if (e.target.closest('.verse-card')) {
                const currentVerse = getVerseAtIndex(currentVerseIndex.general);
                if (currentVerse) {
                    selectVerse({ ...currentVerse, isManual: true }, 'feed', null);
                }
            } else {
                deselectVerse();
            }
        }
    });
}
function handleGesture() {
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        lastSwipeTime = Date.now();
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
            const tts = await import("./libs/piper/piper-bundle.js?v=20");
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
        localStorage.setItem('musicVolume', slider.value);
    }
}

function toggleTTSSource() {
    if (!isPremiumUser) {
        openPremiumModal();
        return;
    }
    ttsAnnounceSource = !ttsAnnounceSource;
    localStorage.setItem('ttsAnnounceSource', ttsAnnounceSource);
    updateTogglesUI();
}

function toggleTTSRandom() {
    if (!isPremiumUser) {
        openPremiumModal();
        return;
    }
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
    stopWaveformVisualizer(true);
    updateSpeakIcons();
    const btn = document.getElementById('speak-general');
    if (btn) btn.classList.remove('loading');
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

    // Immediately update UI with loading state while pre-generating audio
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

    let sanitizedText = text.replace(/may peace be upon him/gi, 'upon him')
        .replace(/peace be upon him/gi, 'upon him')
        .replace(/ﷺ/g, 'upon him')
        .replace(/\(pbuh\)/gi, 'upon him');
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
            const wasAutoMode = autoMode; // Save state before stopAudio clears it
            const currentContext = currentAudioContextType;
            isSpeaking = false;
            updateSpeakButton('speak-general');
            clearTimeout(autoNextTimeout);
            autoNextTimeout = setTimeout(() => {
                if (currentContext === 'feed' && wasAutoMode) nextCard(true);
                else if (currentContext === 'book' && autoNextBook) advanceBookVerse();
                else if (currentContext === 'saved' && wasAutoMode) advanceSavedVerse();
                else if (currentContext === 'search' && wasAutoMode) advanceSearchVerse();
                
                setTimeout(() => {
                    if (!isSpeaking) stopWaveformVisualizer(true);
                }, 50);
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
        
        // Yield to browser macrotask event loop so scrolling and touch inputs run at 60fps with zero lag
        await new Promise(r => setTimeout(r, 40));
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
            
        } catch (err) {
            console.error("Piper generation error on chunk " + i, err);
            if (i === 0 && generationId === currentGenerationId) fallbackTTS();
            break;
        }
    }
    
    isQueueGenerating = false;
    if (generationId === currentGenerationId && audioChunkQueue.length > 0) {
        const btn = document.getElementById('speak-general');
        if (btn) btn.classList.remove('loading');
        isGenerating = false;
        
        setTimeout(() => {
            if (generationId === currentGenerationId) {
                startWaveformVisualizer();
                startAudioPlayback(0, generationId);
            }
        }, 50);
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
                } else if (currentAudioContextType === 'saved' && autoMode) {
                    advanceSavedVerse();
                } else if (currentAudioContextType === 'search' && autoMode) {
                    advanceSearchVerse();
                }
                
                setTimeout(() => {
                    if (!isSpeaking) stopWaveformVisualizer(true);
                }, 50);
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
    if (!btn) return;
    
    if (buttonId === 'speak-general') {
        const playIcon = btn.querySelector('.pill-play-icon');
        if (playIcon) {
            if (isSpeaking && !isPaused) {
                playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            } else {
                playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            }
            return;
        }
    }
    
    btn.innerHTML = isSpeaking && !isPaused ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="speak-svg"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="speak-svg"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
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
        selectVerse({ ...info, isManual: true }, 'book', 'book-verse-' + index);
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
            const chapStr = isNaN(info.chapter) ? info.chapter : 'Chapter ' + info.chapter;
            textToSpeak = chapStr + '. |PAUSE| ' + textToSpeak;
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
    
    setTimeout(() => {
        playBookVerse(nextIndex);
        autoNextBook = true;
    }, 400); // Wait for smooth scrolling to finish before blocking main thread
}
// --- Data Loading & Processing ---
async function loadReligionData(rel) {
    if (loadedReligions.has(rel)) return;
    try {
        const urls = dataUrls[rel];
        const responses = await Promise.all(urls.map(url => fetch(url).then(res => res.json())));
        
        await new Promise(r => setTimeout(r, 5)); // Yield to UI thread

        if (rel === 'Christianity') processBibleData(responses[0]);
        if (rel === 'Islam') { 
            processQuranData(responses[0]); 
            await new Promise(r => setTimeout(r, 5)); // Yield 
            processHadithData(responses[1]); 
        }
        if (rel === 'Hinduism') { 
            processGitaData(responses[0]); 
            // hindu_books.json was removed
        }
        if (rel === 'Judaism') processSefariaData(responses[0]);
        if (rel === 'Sikhism') processSikhismData(responses[0]);
        if (rel === 'Buddhism') processBuddhismData(responses[0]);
        if (rel === 'Philosophy') processGenericData(responses[0], 'Philosophy');

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
    if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
        globalSelectedRels = [...religions];
    }
    for (const rel of globalSelectedRels) {
        await loadReligionData(rel);
    }
    loadUnselectedDataInBackground();
}
async function loadUnselectedDataInBackground() {
    for (const rel of religions) {
        if (!loadedReligions.has(rel)) {
            loadReligionData(rel);
        }
    }
}
function formatVerseRef(v) {
    if (!v) return '';
    const book = v.book || '';
    
    let chap = '';
    if (v.chapterNum !== undefined && v.chapterNum !== null && v.chapterNum !== '') {
        chap = v.chapterNum;
    } else if (v.chapterIndex !== undefined && v.chapterIndex !== null && v.chapterIndex !== '') {
        chap = v.chapterIndex;
    } else if (typeof v.chapter === 'number') {
        chap = v.chapter;
    } else if (typeof v.chapter === 'string') {
        const match = v.chapter.match(/\d+/);
        if (match) {
            chap = parseInt(match[0]);
        }
    }
    
    let verse = '';
    if (v.verseNum !== undefined && v.verseNum !== null && v.verseNum !== '') {
        verse = v.verseNum;
    } else if (typeof v.verse === 'number') {
        verse = v.verse;
    } else if (typeof v.verse === 'string') {
        const match = v.verse.match(/\d+/);
        if (match) {
            verse = parseInt(match[0]);
        } else {
            verse = v.verse;
        }
    }

    let chapPart = (chap !== '' && chap !== null && chap !== undefined) ? ' ' + chap : '';
    let versePart = (verse !== '' && verse !== null && verse !== undefined) ? (chapPart ? ':' + verse : ' ' + verse) : '';
    
    return `${book}${chapPart}${versePart}`.trim();
}

function cleanText(text) {
    if (!text) return '';
    
    // Standardize all forms of Islamic honorifics strictly to (pbuh)
    text = text.replace(/[\(\[\{]*\s*(?:may\s+)?peace\s+(?:be\s+)?upon\s+him\s*[\)\]\}]*/gi, ' (pbuh) ')
               .replace(/[\(\[\{]*\s*pbuh\s*[\)\]\}]*/gi, ' (pbuh) ')
               .replace(/ﷺ|\ufdfa/g, ' (pbuh) ');
    
    text = text.replace(/[{}[\]\@#*_+=~0-9]/g, '')
               .replace(/\s+/g, ' ')
               .replace(/^[\s\-.,:;]+/, '')
               .trim();

    // Final safety check to eliminate any double parentheses around (pbuh)
    while (text.includes('((pbuh))')) {
        text = text.replace('((pbuh))', '(pbuh)');
    }
    while (text.includes('( (pbuh) )')) {
        text = text.replace('( (pbuh) )', '(pbuh)');
    }
    return text;
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

        chapKeys.forEach((chapName, chapIdx) => {
            chapterOrder.push(chapName);
            chapters[chapName] = {};
            const verses = bookData[chapName];
            
            const verseKeys = Object.keys(verses).sort((a, b) => {
                const numA = parseInt((a.match(/\d+/) || [0])[0]);
                const numB = parseInt((b.match(/\d+/) || [0])[0]);
                return numA - numB;
            });
            
            verseKeys.forEach((vKey, vIdx) => {
                const text = verses[vKey];
                if (text && text.trim() !== '') {
                    chapters[chapName][vKey] = text;
                    
                    const chapMatch = chapName.match(/\d+/);
                    const chapNum = chapMatch ? parseInt(chapMatch[0]) : (chapIdx + 1);
                    
                    const vMatch = vKey.match(/\d+/);
                    const verseNum = vMatch ? parseInt(vMatch[0]) : (vIdx + 1);
                    
                    hinduVerses.push({
                        book: bookName,
                        chapter: chapName,
                        chapterNum: chapNum,
                        verseNum: verseNum,
                        verse: verseNum,
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
            if (book.name === 'Dasam Granth') return;
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
    
    if (data && data.books) {
        Object.keys(data.books).forEach(bookName => {
            const bookContent = data.books[bookName];
            let chapters = {};
            Object.keys(bookContent).forEach(chapNum => {
                const chapterVerses = bookContent[chapNum];
                chapters[chapNum] = chapterVerses;
                Object.keys(chapterVerses).forEach(verseNum => {
                    const rawText = chapterVerses[verseNum];
                    const lowerText = rawText.toLowerCase();
                    const badPhrases = [
                        'gutenberg', 'copyright', 'ebook', 'translator', 'volume', 
                        'edition', 'chapter', 'section', 'index', 'preface', 'introduction', 
                        'footnote', 'indemnity', 'trademark'
                    ];
                    if (badPhrases.some(phrase => lowerText.includes(phrase))) return;
                    
                    verses.push({ book: bookName, chapter: chapNum, verse: verseNum, text: cleanText(rawText), religion: 'Buddhism' });
                });
            });
            books.push({ name: bookName, content: chapters });
        });
    }

    religionVerses.Buddhism = verses;
    religionBooks.Buddhism = { books: books };
}

function processGenericData(data, relName) {
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
                    verses.push({ text: text, religion: relName, book: bookName, chapter: chapterName, verse: verseNum });
                }
            }
            
            books.push({
                name: bookName,
                chapterOrder: bookChapters,
                content: chapterContent
            });
        }
    }
    
    religionVerses[relName] = verses;
    religionBooks[relName] = { books: books };
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
    triggerCloudSync();
    updateBatchesAfterSettings();

    document.getElementById('onboarding').classList.remove('active-section');
    document.getElementById('onboarding').classList.add('hidden');

    document.getElementById('loading').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
    }, 500);

    localStorage.setItem('hasOnboarded', 'true');
    initializeVerseFeed();
    goTo('verse-feed');
}
async function skipOnboarding() {
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('loading').style.opacity = '1';

    await Promise.all(religions.map(rel => loadReligionData(rel)));

    globalSelectedRels = [...religions];
    localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    triggerCloudSync();
    updateBatchesAfterSettings();

    document.getElementById('onboarding').classList.remove('active-section');
    document.getElementById('onboarding').classList.add('hidden');

    document.getElementById('loading').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
    }, 500);

    localStorage.setItem('hasOnboarded', 'true');
    initializeVerseFeed();
    goTo('verse-feed');
}
function buildSettings() {
    if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
        globalSelectedRels = [...religions];
        localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    }
    document.querySelectorAll('.global-rel-btn').forEach(btn => {
        if (btn.id === 'dark-mode-toggle') return;
        const rel = btn.textContent.trim();
        if (globalSelectedRels.includes(rel)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
async function toggleGlobalReligion(rel) {
    if (!globalSelectedRels) globalSelectedRels = [];
    if (globalSelectedRels.includes(rel)) {
        if (globalSelectedRels.length === 1) return; // Prevent deselecting last topic
        globalSelectedRels = globalSelectedRels.filter(r => r !== rel);
    } else {
        globalSelectedRels.push(rel);
        if (!loadedReligions.has(rel)) {
            await loadReligionData(rel);
        }
    }
    localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    triggerCloudSync();
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

    if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
        globalSelectedRels = [...religions];
    }
    
    emptyState.classList.add('hidden');
    if (verseBatches.general.length > 0) {
        renderFeedCard(currentVerseIndex.general);
        return;
    }
    const newBatch = generateBatch('general', []);
    if (newBatch.length === 0) {
        setTimeout(() => {
            initializeVerseFeed();
        }, 1000);
        return;
    }
    verseBatches.general.push(...newBatch);
    renderFeedCard(0);
}
const negativeWords = ['smite', 'kill', 'destroy', 'wrath', 'blood', 'sword', 'curse', 'hell', 'fire', 'punish', 'death', 'die', 'slay', 'enemy', 'evil', 'wicked', 'sin', 'weep', 'wail', 'gnash', 'vengeance', 'terror', 'fear', 'plague', 'famine', 'perish', 'slaughter', 'condemn', 'abomination', 'hate', 'despise', 'anger', 'fury', 'saliva', 'spit', 'vomit', 'urine', 'defecate', 'excrement', 'menstruation', 'menses', 'camel', 'slave', 'sexual', 'intercourse', 'naked', 'breast', 'suck', 'suckling', 'semen', 'sperm', 'genital'];
const positiveWords = ['love', 'peace', 'joy', 'hope', 'faith', 'light', 'grace', 'mercy', 'compassion', 'kindness', 'bless', 'heal', 'forgive', 'comfort', 'strength', 'wisdom', 'truth', 'spirit', 'heart', 'soul', 'heaven', 'glory', 'righteous', 'holy', 'pure', 'good', 'rejoice', 'glad', 'praise', 'worship', 'save', 'deliver', 'guide', 'protect'];
const filteredPoolCache = {};

function getFilteredPool(rel) {
    if (filteredPoolCache[rel]) return filteredPoolCache[rel];
    const fullPool = religionVerses[rel] || [];
    if (fullPool.length === 0) return [];
    
    const filteredPool = fullPool.filter(v => {
        if (!v || !v.text) return false;
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
    
    const finalPool = filteredPool.length > 0 ? filteredPool : fullPool.filter(v => {
        return v && v.text && v.text.length >= MIN_CHAR_LIMIT && v.text.length <= maxCharLimit && v.text.trim() !== '';
    });
    
    filteredPoolCache[rel] = finalPool;
    return finalPool;
}

function generateBatch(type, lastRels = []) {
    const rels = (globalSelectedRels || []).filter(r => religionVerses[r] && religionVerses[r].length > 0);
    if (rels.length === 0) {
        return [];
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
        let pool = getFilteredPool(r);

        if (!pool || pool.length === 0) {
            return { text: "Debug: Pool is empty for religion " + r + ".", religion: 'System', book: 'Debug', chapter: '1', verse: '1' };
        }
        let availablePool = pool.filter(v => v && v.text && !allVersesUsed.general.has(v.text));
        if (availablePool.length === 0) {
            availablePool = pool;
        }
        
        // Group available verses by book to guarantee fair, balanced variety across different books
        const bookMap = {};
        availablePool.forEach(v => {
            const b = v.book || 'Unknown';
            if (!bookMap[b]) bookMap[b] = [];
            bookMap[b].push(v);
        });
        
        const bookNames = Object.keys(bookMap);
        let selectedVerse = null;
        if (bookNames.length > 0) {
            const randomBook = bookNames[Math.floor(Math.random() * bookNames.length)];
            const bookVerses = bookMap[randomBook];
            selectedVerse = bookVerses[Math.floor(Math.random() * bookVerses.length)];
        } else {
            selectedVerse = availablePool[Math.floor(Math.random() * availablePool.length)];
        }
        
        if (selectedVerse && selectedVerse.text) {
            allVersesUsed.general.add(selectedVerse.text);
            if (allVersesUsed.general.size > 200) {
                const oldestVerse = allVersesUsed.general.values().next().value;
                allVersesUsed.general.delete(oldestVerse);
            }
        }
        
        return selectedVerse;
    }).filter(v => v !== null);
}
function getVerseAtIndex(index) {
    while (index >= verseBatches.general.length) {
        const lastRels = verseBatches.general.length >= 2 ? 
            [verseBatches.general[verseBatches.general.length - 2].religion, verseBatches.general[verseBatches.general.length - 1].religion] : 
            [];
        const newBatch = generateBatch('general', lastRels);
        if (newBatch.length === 0) {
            break;
        }
        
        for (let verse of newBatch) {
            if (verseBatches.general.length === nextAdIndex && !isPremiumUser) {
                verseBatches.general.push({ isAd: true });
                nextAdIndex += Math.floor(Math.random() * 6) + 10; // Schedule next ad in 10-15 verses
            }
            verseBatches.general.push(verse);
        }
    }
    return verseBatches.general[index];
}

// Interstitial ads removed in favor of in-feed AdSense ads

function renderFeedCard(index, direction = 'none') {
    const stage = document.getElementById('feed-stage');
    if (!stage) return;
    if (direction === 'none') {
        stage.innerHTML = '';
    }
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
        if (verse.isAd) {
            textEl.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 20px;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">🌟</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-color);">Support Our Mission</div>
                    <div style="font-size: 1.1rem; opacity: 0.8; max-width: 80%; line-height: 1.5;">Get exclusive features</div>
                    <button onclick="openPremiumModal()" class="action-btn" style="background: var(--bg-grad-1); color: #fff; border: none; padding: 15px 40px; border-radius: 30px; font-size: 1.1rem; font-weight: bold; margin-top: 10px; box-shadow: 0 4px 15px rgba(255,107,107,0.4); cursor: pointer; transform: scale(1); transition: transform 0.2s;">
                        Premium
                    </button>
                </div>
            `;
            refEl.innerText = '';
        } else {
            let displayVerse = cleanText(verse.text);
            // Clean/strip author attribution and other HTML tags for the feed card display
            displayVerse = displayVerse.replace(/<span class='author-attr'>.*?<\/span>/gm, '');
            displayVerse = displayVerse.replace(/<[^>]*>?/gm, '');
            if (displayVerse.endsWith('.')) {
                displayVerse = displayVerse.slice(0, -1);
            }
            textEl.innerText = displayVerse;
            
            refEl.innerText = formatVerseRef(verse);
        }
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
            card.classList.add('card-center');
        }
    });
}

let versesSinceLastPromo = 0;
let nextPromoTarget = Math.floor(Math.random() * (20 - 14 + 1)) + 14; // Random between 14 and 20

function nextCard(isAuto = false) {
    const wasPlaying = isSpeaking && !isPaused;
    stopAudio();

    versesSinceLastPromo++;
    if (versesSinceLastPromo >= nextPromoTarget) {
        versesSinceLastPromo = 0;
        nextPromoTarget = Math.floor(Math.random() * (20 - 14 + 1)) + 14;
        
        // Inject Premium Promo verse
        const adVerse = {
            text: "Hey! Do you want to support us? Consider getting Premium to unlock more features.",
            book: "Premium",
            chapter: "Support",
            verse: "Us",
            religion: "System",
            isAd: true
        };
        verseBatches.general.splice(currentVerseIndex.general + 1, 0, adVerse);
    }

    currentVerseIndex.general++;
    renderFeedCard(currentVerseIndex.general, 'next');

    const newVerse = getVerseAtIndex(currentVerseIndex.general);

    if (isAuto || wasPlaying) {
        if (newVerse && !newVerse.isAd) {
            selectVerse(newVerse, 'feed', 'feed-card-' + currentVerseIndex.general, true);
            let spokenText = newVerse.spoken_text || newVerse.text;
            if (!spokenText.endsWith('.')) spokenText += '.';
            
            if (ttsAnnounceSource) {
                spokenText += '. ' + newVerse.book + '.';
            }

            setTimeout(() => {
                playText(spokenText, 'feed');
                autoMode = true;
            }, 400); // Allow card animation to finish
        } else if (newVerse && newVerse.isAd) {
            // Auto-skip the ad after 3.5 seconds
            autoMode = true;
            clearTimeout(autoNextTimeout);
            autoNextTimeout = setTimeout(() => {
                nextCard(true);
            }, 3500);
        }
    } else {
        deselectVerse();
    }
}

function prevCard() {
    const wasPlaying = isSpeaking && !isPaused;
    stopAudio();

    if (currentVerseIndex.general > 0) {
        currentVerseIndex.general--;
        renderFeedCard(currentVerseIndex.general, 'prev');
        const newVerse = getVerseAtIndex(currentVerseIndex.general);
        if (wasPlaying && newVerse && !newVerse.isAd) {
            selectVerse(newVerse, 'feed', 'feed-card-' + currentVerseIndex.general, true);
            let spokenText = newVerse.spoken_text || newVerse.text;
            if (!spokenText.endsWith('.')) spokenText += '.';
            
            if (ttsAnnounceSource) {
                spokenText += '. ' + newVerse.book + '.';
            }

            playText(spokenText, 'feed');
            autoMode = true;
        } else if (wasPlaying && newVerse && newVerse.isAd) {
            autoMode = true;
            clearTimeout(autoNextTimeout);
            autoNextTimeout = setTimeout(() => {
                nextCard(true);
            }, 3500);
        } else {
            deselectVerse();
        }
    }
}
function goTo(section) {
    const isAlreadyActive = document.getElementById(section) && document.getElementById(section).classList.contains('active-section');

    if (selectedVerse && selectedVerse.type === 'book') {
        lastSelectedBookVerse = selectedVerse;
    }
    
    stopAudio();
    document.querySelectorAll('.app-section').forEach(s => {
        s.classList.remove('active-section');
    });

    document.getElementById(section).classList.add('active-section');

    document.querySelectorAll('.nav-icon').forEach(btn => btn.classList.remove('active-nav'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    if (section === 'verse-feed') {
        const n = document.getElementById('nav-feed'); if (n) n.classList.add('active-nav');
        const t = document.querySelector('.tab-btn[data-target="verse-feed"]'); if (t) t.classList.add('active');
        if (verseBatches.general.length === 0) {
            initializeVerseFeed();
        }
        deselectVerse();
    }
    if (section === 'read-books') {
        const n = document.getElementById('nav-books'); if (n) n.classList.add('active-nav');
        const t = document.querySelector('.tab-btn[data-target="read-books"]'); if (t) t.classList.add('active');
        const bookList = document.getElementById('book-list-view');
        const subBookList = document.getElementById('sub-book-list-view');
        const bookContent = document.getElementById('book-content-view');
        
        if (isAlreadyActive || (bookList.classList.contains('hidden') && 
            subBookList.classList.contains('hidden') && 
            bookContent.classList.contains('hidden'))) {
            deselectVerse();
            showReligions();
        } else if (!bookContent.classList.contains('hidden') && lastSelectedBookVerse) {
            selectVerse(lastSelectedBookVerse, 'book', lastSelectedBookVerse.elementId || ('book-verse-' + bookVoiceCurrentVerse), true);
        } else {
            deselectVerse();
        }
    }
    if (section === 'saved-verses') {
        const n = document.getElementById('nav-saved'); if (n) n.classList.add('active-nav');
        const t = document.querySelector('.tab-btn[data-target="saved-verses"]'); if (t) t.classList.add('active');
        if (!isAlreadyActive) {
            selectedSavedAlbum = null;
            deselectVerse();
        }
        showSavedVerses();
    }
    if (section === 'settings') {
        const n = document.getElementById('nav-settings'); if (n) n.classList.add('active-nav');
        const t = document.querySelector('.tab-btn[data-target="settings"]'); if (t) t.classList.add('active');
        buildSettings();
        renderVoiceSettings();
        updateTogglesUI();
        deselectVerse();
    }
}
window.switchTab = goTo;

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
    return savedVerses.some(s => s.book === v.book && String(s.chapter) === String(v.chapter) && String(s.verse) === String(v.verse));
}
function toggleBookmark(v, btnElement) {
    const index = savedVerses.findIndex(s => s.book === v.book && String(s.chapter) === String(v.chapter) && String(s.verse) === String(v.verse));
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
        addFolder.className = 'album-square-btn add-folder-btn';
        addFolder.style.width = 'calc(33.333% - 8px)';
        addFolder.style.aspectRatio = '1';
        addFolder.style.height = 'auto';
        addFolder.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" style="width: 32px; height: 32px; opacity: 0.5; margin: auto;" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        addFolder.onclick = () => openCreateBookmarkModal();
        grid.appendChild(addFolder);
        
        let folderIdx = 0;
        for (const [albumName, verses] of Object.entries(albums)) {
            const folder = document.createElement('button');
            folder.className = 'album-square-btn album-folder-btn';
            folder.id = 'album-folder-' + (folderIdx++);
            folder.style.width = 'calc(33.333% - 8px)';
            folder.style.aspectRatio = '1';
            folder.style.height = 'auto';
            folder.style.fontSize = '1.2rem';
            folder.innerText = albumName;
            
            if ((selectedVerse && selectedVerse.type === 'folder' && selectedVerse.name === albumName) || selectedSavedAlbum === albumName) {
                folder.classList.add('active');
            }
            folder.onclick = (e) => {
                if (e) e.stopPropagation();
                if (selectedSavedAlbum === albumName) {
                    selectedSavedAlbum = null;
                    selectedVerse = { type: 'folder', name: albumName, elementId: folder.id };
                    deselectVerse();
                    folder.classList.remove('active');
                    showSavedVerses(false);
                } else {
                    selectedSavedAlbum = albumName;
                    selectVerse({ name: albumName }, 'folder', folder.id, true);
                    document.querySelectorAll('.album-folder-btn').forEach(f => f.classList.remove('active'));
                    folder.classList.add('active');
                    showSavedVerses(false);
                }
            };
            
            grid.appendChild(folder);
        }
        foldersContainer.appendChild(grid);
    }
    
    // Rebuild verses list
    versesContainer.innerHTML = '';
    
    let versesToRender = validVerses;
    if (selectedSavedAlbum) {
        versesToRender = albums[selectedSavedAlbum] || [];
    }
    
    window.currentSavedVersesRendered = versesToRender;
    
    if (versesToRender.length > 0) {
        renderVersesList(versesToRender, versesContainer);
    } else {
        if (selectedSavedAlbum) {
            const placeholder = document.createElement('div');
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.height = '40vh'; // Center vertically in remaining space
            placeholder.style.opacity = '0.6';
            placeholder.style.fontSize = '1.2rem';
            placeholder.innerText = 'No verses yet';
            versesContainer.appendChild(placeholder);
        }
    }
}

function renderVersesList(versesArray, listElement) {
    versesArray.forEach(({v, i}) => {
        const container = document.createElement('div');
        container.classList.add('saved-verse-container');
        const div = document.createElement('div');
        div.id = 'saved-verse-' + i;
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

        let isCurrentlySelected = false;
        if (selectedVerse && selectedVerse.type === 'saved') {
            if (selectedVerse.id && v.id) {
                isCurrentlySelected = (selectedVerse.id === v.id);
            } else if (selectedVerse.elementId) {
                isCurrentlySelected = (selectedVerse.elementId === div.id);
            } else {
                isCurrentlySelected = (selectedVerse.book === v.book && 
                                       String(selectedVerse.chapter) === String(v.chapter) && 
                                       String(selectedVerse.verse) === String(v.verse) && 
                                       selectedVerse.text === v.text);
            }
        }
        if (isCurrentlySelected) {
            div.style.background = 'var(--text-color)';
            div.style.color = 'var(--bg-grad-1)';
            div.style.opacity = '1';
            div.style.borderColor = 'var(--text-color)';
            text.style.color = 'var(--bg-grad-1)';
            ref.style.color = 'var(--bg-grad-1)';
        }

        div.onclick = () => {
            selectVerse(v, 'saved', div.id, false);
        };



        listElement.appendChild(container);
    });
}
function showReligions() {
    const list = document.getElementById('rel-list');
    list.innerHTML = '';
    document.getElementById('library-home').classList.remove('hidden');
    document.getElementById('book-list-view').classList.add('hidden');
    document.getElementById('sub-book-list-view').classList.add('hidden');
    document.getElementById('book-content-view').classList.add('hidden');

    if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
        globalSelectedRels = [...religions];
        localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    }

    const populationOrder = ['Christianity', 'Islam', 'Hinduism', 'Sikhism', 'Buddhism', 'Judaism', 'Philosophy'];
    const sortedRels = globalSelectedRels.slice().sort((a, b) => {
        let idxA = populationOrder.indexOf(a);
        let idxB = populationOrder.indexOf(b);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    sortedRels.forEach(rel => {
        const btn = document.createElement('button');
        btn.innerText = rel;
        
        if (!religionBooks[rel]) {
            btn.innerText = rel + ' (Loading...)';
            btn.style.opacity = '0.7';
            if (!loadedReligions.has(rel)) {
                loadReligionData(rel);
            }
        }

        btn.onclick = async () => {
            if (!religionBooks[rel]) {
                btn.innerText = rel + ' (Loading...)';
                btn.style.opacity = '0.7';
                await loadReligionData(rel);
            }
            if (religionBooks[rel]) {
                showBooks(rel);
            }
        };

        list.appendChild(btn);
    });
}
function highlightSearchTerms(text, terms) {
    if (!text) return '';
    if (!terms || terms.length === 0) return text;
    
    let expandTerms = [];
    terms.forEach(t => {
        if (t === 'pbuh' || t === 'phub') {
            expandTerms.push('pbuh', 'peace be upon him', 'ﷺ');
        } else {
            expandTerms.push(t);
        }
    });
    
    let safeTerms = expandTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(t => t.length > 0);
    if (safeTerms.length === 0) return text;
    const regex = new RegExp(`(${safeTerms.join('|')})`, 'gi');
    // Using span instead of mark to prevent any weird block styling issues
    return text.replace(regex, '<span style="background: rgba(var(--loader-rgb), 0.25); color: inherit; font-weight: bold; border-radius: 3px; padding: 0 2px;">$1</span>');
}

let searchDebounceTimeout = null;
window.currentSearchResultsMatches = [];
let currentSearchRenderedCount = 0;
let currentSearchTermsInfo = [];

function debouncedPerformLibSearch() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(performLibSearch, 300);
}

function checkTermMatch(vText, vTrans, term, isExactWord) {
    if (term === 'pbuh' || term === 'phub') {
        return vText.includes('pbuh') || vTrans.includes('pbuh') || 
               vText.includes('peace be upon him') || vTrans.includes('peace be upon him') || 
               vText.includes('ﷺ') || vTrans.includes('ﷺ');
    }
    
    if (isExactWord) {
        const pattern = '(?:^|[^a-zA-Z0-9])' + escapeRegExp(term) + '(?:$|[^a-zA-Z0-9])';
        const regex = new RegExp(pattern, 'i');
        return regex.test(vText) || regex.test(vTrans);
    } else {
        return vText.includes(term) || vTrans.includes(term);
    }
}

function performLibSearch() {
    const input = document.getElementById('lib-search-input');
    const resultsContainer = document.getElementById('lib-search-results');
    if (!input || !resultsContainer) return;
    
    const rawVal = input.value.toLowerCase();
    if (rawVal.trim().length < 2) {
        resultsContainer.innerHTML = '';
        window.currentSearchResultsMatches = [];
        currentSearchRenderedCount = 0;
        currentSearchTermsInfo = [];
        return;
    }
    
    const hasTrailingSpace = /\s$/.test(rawVal);
    const tokens = rawVal.trim().split(/\s+/).filter(t => t.length > 0);
    
    currentSearchTermsInfo = tokens.map((token, idx) => {
        const isLast = (idx === tokens.length - 1);
        const isExactWord = !isLast || hasTrailingSpace;
        return { token, isExactWord };
    });
    
    const pool = (currentReligion && religionVerses[currentReligion]) ? religionVerses[currentReligion] : Object.values(religionVerses).flat();
    
    const matches = [];
    for (let i = 0; i < pool.length; i++) {
        const v = pool[i];
        if (!v) continue;
        const vText = (v.text || '').toLowerCase();
        const vTrans = (v.translation || '').toLowerCase();
        
        const matchesAll = currentSearchTermsInfo.every(info => {
            return checkTermMatch(vText, vTrans, info.token, info.isExactWord);
        });
        
        if (matchesAll) {
            matches.push(v);
        }
    }
    
    window.currentSearchResultsMatches = matches;
    currentSearchRenderedCount = 0;
    
    const currHeight = resultsContainer.offsetHeight;
    if (currHeight > 0) {
        resultsContainer.style.minHeight = currHeight + 'px';
    }
    
    resultsContainer.innerHTML = '';
    
    if (matches.length === 0) {
        resultsContainer.style.minHeight = '';
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; opacity: 0.6;">No verses found</div>';
        return;
    }
    
    renderSearchBatch(20);
    setupSearchScrollListener();
    
    requestAnimationFrame(() => {
        resultsContainer.style.minHeight = '';
    });
    
    renderSearchBatch(20);
    setupSearchScrollListener();
}

function renderSearchBatch(batchSize = 20) {
    const resultsContainer = document.getElementById('lib-search-results');
    if (!resultsContainer || !window.currentSearchResultsMatches) return;
    
    const matches = window.currentSearchResultsMatches;
    const startIndex = currentSearchRenderedCount;
    const endIndex = Math.min(startIndex + batchSize, matches.length);
    
    if (startIndex >= matches.length) return;
    
    for (let idx = startIndex; idx < endIndex; idx++) {
        const match = matches[idx];
        const card = document.createElement('div');
        card.className = 'saved-verse';
        card.id = 'search-verse-' + idx;
        card.style.marginBottom = '15px';
        card.style.textAlign = 'left';
        card.style.cursor = 'pointer';
        card.style.animation = 'sectionFadeIn 0.20s ease-out forwards';
        
        let refStr = formatVerseRef(match);
        
        const highlightedText = highlightSearchTerms(match.text, currentSearchTermsInfo.map(t => t.token));
        let html = `<div style="font-size: 1.1em; line-height: 1.6; margin-bottom: 8px; display: block; word-break: break-word;">${highlightedText}</div>`;
        if (match.translation && match.translation !== match.text) {
            const highlightedTrans = highlightSearchTerms(match.translation, currentSearchTermsInfo.map(t => t.token));
            html += `<div style="font-size: 0.9em; opacity: 0.8; line-height: 1.5; font-style: italic; margin-bottom: 10px;">${highlightedTrans}</div>`;
        }
        
        html += `<div class="verse-ref" style="font-size: 0.8em; opacity: 0.6; margin-top: 15px; text-align: left;">${refStr}</div>`;
        
        card.innerHTML = html;
        card.onclick = (e) => {
            if (e) e.stopPropagation();
            selectVerse(match, 'search', card.id, false);
        };
        resultsContainer.appendChild(card);
    }
    
    currentSearchRenderedCount = endIndex;
}

let isSearchScrollListenerAttached = false;
function setupSearchScrollListener() {
    if (isSearchScrollListenerAttached) return;
    isSearchScrollListenerAttached = true;
    
    const container = document.getElementById('read-books');
    if (!container) return;
    
    container.addEventListener('scroll', () => {
        if (!window.currentSearchResultsMatches || window.currentSearchResultsMatches.length === 0) return;
        if (currentSearchRenderedCount >= window.currentSearchResultsMatches.length) return;
        
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 300) {
            renderSearchBatch(20);
        }
    });
}
function showBooks(rel) {
    currentReligion = rel;
    document.getElementById('library-home').classList.add('hidden');
    document.getElementById('book-list-view').classList.remove('hidden');
    document.getElementById('sub-book-list-view').classList.add('hidden');
    document.getElementById('book-content-view').classList.add('hidden');

    const searchInput = document.getElementById('lib-search-input');
    const resultsContainer = document.getElementById('lib-search-results');
    
    if (searchInput && searchInput.value.trim().length >= 2) {
        performLibSearch();
    } else {
        if (searchInput) searchInput.value = '';
        if (resultsContainer) resultsContainer.innerHTML = '';
        window.currentSearchResultsMatches = [];
        currentSearchRenderedCount = 0;
    }
    
    const bookListContainer = document.getElementById('book-list');

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
    updatePillUI();
}
let currentBookChapterState = null;
let currentBookChapterRenderedCount = 0;

function renderChapter(chapter) {
    if (currentRenderedChapter === chapter && currentBookChapterRenderedCount > 0) return;

    const container = document.getElementById('book-content-text');
    if (!container) return;
    container.innerHTML = '';

    const verses = currentBookContent[chapter];
    if (!verses) return;
    
    const sortedKeys = Object.keys(verses).sort((a, b) => {
        const numA = Number(a.replace(/[^0-9.]/g, '')) || 0;
        const numB = Number(b.replace(/[^0-9.]/g, '')) || 0;
        return numA - numB;
    });
    
    const startIndex = chapterStartIndices[chapter];
    
    currentBookChapterState = { chapter, sortedKeys, verses, startIndex };
    currentBookChapterRenderedCount = 0;
    currentRenderedChapter = chapter;
    
    renderBookChapterBatch(30);
    setupBookChapterScrollListener();
}

function renderBookChapterBatch(batchSize = 30) {
    const container = document.getElementById('book-content-text');
    if (!container || !currentBookChapterState) return;
    
    const { sortedKeys, verses, startIndex } = currentBookChapterState;
    const start = currentBookChapterRenderedCount;
    const end = Math.min(start + batchSize, sortedKeys.length);
    
    if (start >= sortedKeys.length) return;
    
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
        const vKey = sortedKeys[i];
        const gIndex = startIndex + i;
        const text = verses[vKey];
        const p = document.createElement('p');
        p.className = 'book-verse';
        p.id = 'book-verse-' + gIndex;
        p.style.cursor = 'pointer';
        p.style.animation = 'sectionFadeIn 0.20s ease-out forwards';
        
        let displayVerse = text;
        if (displayVerse.endsWith('.')) displayVerse = displayVerse.slice(0, -1);
        p.innerHTML = displayVerse;
        p.onclick = (e) => {
            e.stopPropagation();
            handleVerseClick(gIndex);
        };
        frag.appendChild(p);
    }
    container.appendChild(frag);
    currentBookChapterRenderedCount = end;
    updatePillUI();
}

let isBookChapterScrollAttached = false;
function setupBookChapterScrollListener() {
    if (isBookChapterScrollAttached) return;
    isBookChapterScrollAttached = true;
    
    const scrollContainer = document.getElementById('read-books');
    if (!scrollContainer) return;
    
    scrollContainer.addEventListener('scroll', () => {
        const bookContent = document.getElementById('book-content-view');
        if (!bookContent || bookContent.classList.contains('hidden')) return;
        if (!currentBookChapterState) return;
        
        if (currentBookChapterRenderedCount >= currentBookChapterState.sortedKeys.length) return;
        
        if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 400) {
            renderBookChapterBatch(30);
        }
    });
}
function populateChapterWheel() {
    const wheel = document.getElementById('chapter-scroll-wheel');
    if (!wheel) return;
    wheel.style.maskImage = 'none';
    wheel.style.webkitMaskImage = 'none';
    wheel.innerHTML = '';

    const frag = document.createDocumentFragment();
    chapterList.forEach((chap, index) => {
        const div = document.createElement('div');
        div.className = 'chap-wheel-item';
        div.innerText = (index + 1).toString();
        div.dataset.val = chap;
        div.onclick = () => {
            const target = div.offsetLeft + div.offsetWidth / 2 - wheel.clientWidth / 2;
            wheel.scrollTo({ left: target, behavior: 'smooth' });
        };
        frag.appendChild(div);
    });
    wheel.appendChild(frag);

    updateChapterWheelActiveStyle();
    setupChapterWheelListeners();
    requestAnimationFrame(() => syncChapterWheelToCurrent());
}

let wheelTargetScroll = null;
let wheelScrollTimeout = null;

function setupChapterWheelListeners() {
    const wheel = document.getElementById('chapter-scroll-wheel');
    if (!wheel || wheel.dataset.listened) return;
    wheel.dataset.listened = 'true';

    wheel.addEventListener('scroll', () => {
        updateChapterWheelActiveStyle();
        if (isProgrammaticScroll) return;
        clearTimeout(chapScrollTimeout);
        chapScrollTimeout = setTimeout(() => {
            const active = getActiveChapterWheelItem();
            if (active) chapWheelSelectChapter(active.dataset.val);
        }, 550); // High debounce to eliminate heavy DOM lag while wheel is in motion
    }, { passive: true });

    wheel.addEventListener('wheel', e => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        
        const items = getChapterWheelItems();
        let itemWidth = items[0] ? items[0].offsetWidth : 50;
        if (items.length > 1) {
            itemWidth = items[1].offsetLeft - items[0].offsetLeft;
        }
        
        const scrollAmount = -e.deltaY * (itemWidth / 100);
        
        if (wheelTargetScroll === null) {
            wheelTargetScroll = wheel.scrollLeft;
        }
        
        wheelTargetScroll += scrollAmount;
        const maxScroll = wheel.scrollWidth - wheel.clientWidth;
        wheelTargetScroll = Math.max(0, Math.min(maxScroll, wheelTargetScroll));
        
        wheel.scrollTo({ left: wheelTargetScroll, behavior: 'smooth' });
        
        clearTimeout(wheelScrollTimeout);
        wheelScrollTimeout = setTimeout(() => {
            wheelTargetScroll = null;
        }, 400);
    }, { passive: false });
}


function updateChapterWheelActiveStyle() {
    const wheel = document.getElementById('chapter-scroll-wheel');
    if (!wheel) return;
    const items = getChapterWheelItems();
    if (!items.length) return;
    const containerCenter = wheel.scrollLeft + wheel.clientWidth / 2;
    
    // READ PHASE - Eliminate layout thrashing by reading all offsets before modifying any styles
    const metrics = items.map((item, i) => {
        return item.offsetLeft + item.offsetWidth / 2;
    });

    let itemWidth = items.length > 1 ? (metrics[1] - metrics[0]) : (wheel.clientWidth / 3 || 80);
    if (itemWidth === 0) itemWidth = 80;

    let closestIdx = 0, closestDist = Infinity;
    
    // COMPUTE PHASE
    const stylesToApply = items.map((item, i) => {
        const itemCenter = metrics[i];
        const dist = itemCenter - containerCenter;
        const normDist = dist / itemWidth;
        const absNormDist = Math.abs(normDist);

        if (Math.abs(dist) < closestDist) {
            closestDist = Math.abs(dist);
            closestIdx = i;
        }

        if (absNormDist < 1.5) {
            const opacity = 1 - absNormDist * 0.65;
            const scale = 1.15 - absNormDist * 0.3;
            const angle = normDist * 40; 
            return {
                opacity: Math.max(0, opacity),
                transform: `rotateY(${-angle}deg) scale(${scale}) translateZ(0)`,
                fontWeight: absNormDist < 0.5 ? '700' : '500',
                pointerEvents: 'auto',
                active: absNormDist < 0.5
            };
        } else {
            return {
                opacity: 0,
                transform: 'scale(0.1) translateZ(0)',
                pointerEvents: 'none',
                active: false
            };
        }
    });

    // WRITE PHASE
    items.forEach((item, i) => {
        const s = stylesToApply[i];
        if (item.style.opacity !== String(s.opacity)) {
            item.style.opacity = s.opacity;
            item.style.transform = s.transform;
            if (s.fontWeight) item.style.fontWeight = s.fontWeight;
            item.style.pointerEvents = s.pointerEvents;
        }
        if (s.active && !item.classList.contains('active')) {
            item.classList.add('active');
        } else if (!s.active && item.classList.contains('active')) {
            item.classList.remove('active');
        }
    });

    if (lastActiveChapterIdx !== -1 && lastActiveChapterIdx !== closestIdx) {
        if (wheel.offsetParent !== null) {
            playScrollSound();
        }
    }
    lastActiveChapterIdx = closestIdx;
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

function syncChapterWheelToCurrent() {
    let info = globalVerseMap[bookVoiceCurrentVerse];
    if (!info) info = globalVerseMap[0];
    if (!info) {
        updateChapterWheelActiveStyle();
        return;
    }
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
    document.addEventListener('wheel', e => {
        const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
        if (isFeed && !isProgrammaticScroll && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            if (e.deltaY > 50) {
                nextCard();
            } else if (e.deltaY < -50) {
                prevCard();
            }
        }
    }, {passive: true});
}
function scrollToBookVerse(verseIndex) {
    const info = globalVerseMap[verseIndex];
    if (!info) return;
    if (info.chapter !== currentRenderedChapter) {
        renderChapter(info.chapter);
    }
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
}
function selectAndPlayVerse(verseIndex) {
    const wasPlaying = isSpeaking && !isPaused;

    const info = globalVerseMap[verseIndex];
    if (info && info.chapter !== lastAnnouncedChapter) {
        lastAnnouncedChapter = info.chapter;
    }
    bookVoiceCurrentVerse = verseIndex;
    
    // Scroll and render first
    scrollToBookVerse(bookVoiceCurrentVerse);
    
    if (info) {
        selectVerse({ ...info, isManual: true }, 'book', 'book-verse-' + verseIndex);
    }

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
    document.querySelectorAll('.book-verse.marked').forEach(el => el.classList.remove('marked'));

    const verse = document.getElementById('book-verse-' + bookVoiceCurrentVerse);
    if (verse) {
        verse.classList.add('marked');
    }
    const info = globalVerseMap && globalVerseMap[bookVoiceCurrentVerse];
    if (info) {
        highlightSelectedVerseElement(false);
        selectedVerse = { ...info, type: 'book', elementId: 'book-verse-' + bookVoiceCurrentVerse };
        highlightSelectedVerseElement(true);
        updatePillUI();
    }
    const key = currentReligion + '_' + currentBookName + (currentSubBook ? '_' + currentSubBook : '');
    bookMarkedVerse[key] = bookVoiceCurrentVerse;
    localStorage.setItem('bookMarkedVerse', JSON.stringify(bookMarkedVerse));
}
function toggleMusic() {
    const btn = document.getElementById('music-toggle');
    if (audio.paused) {
        audio.play().catch(e => console.log(e));
        btn.classList.add('active');
        localStorage.setItem('musicEnabled', 'true');
    } else {
        audio.pause();
        btn.classList.remove('active');
        localStorage.setItem('musicEnabled', 'false');
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
    if (wheel.children.length === 0) {
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
    }
    setTimeout(syncVoiceWheelToCurrent, 40);
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
    if (!items.length) return;
    const containerCenter = wheel.scrollTop + clientHeight / 2;
    const itemHeight = 30;

    const metrics = items.map((item, i) => {
        if (!item._cachedCenter) {
            item._cachedCenter = item.offsetTop + (item.offsetHeight || itemHeight) / 2;
        }
        return item._cachedCenter;
    });

    let closestIdx = 0, closestDist = Infinity;
    
    const stylesToApply = items.map((item, i) => {
        const itemCenter = metrics[i];
        const dist = itemCenter - containerCenter;
        const normDist = dist / itemHeight;
        const absNormDist = Math.abs(normDist);

        if (Math.abs(dist) < closestDist) {
            closestDist = Math.abs(dist);
            closestIdx = i;
        }

        if (absNormDist < 2.5) {
            const opacity = 1 - absNormDist * 0.4;
            const scale = 1.0 - absNormDist * 0.15;
            const angle = normDist * 40;
            return {
                opacity: Math.max(0.1, opacity),
                transform: `rotateX(${angle}deg) scale(${scale}) translateZ(0)`,
                fontWeight: absNormDist < 0.5 ? '600' : '400',
                pointerEvents: 'auto',
                selected: absNormDist < 0.5
            };
        } else {
            return {
                opacity: 0,
                transform: 'scale(0.5)',
                pointerEvents: 'none',
                selected: false
            };
        }
    });

    items.forEach((item, i) => {
        const s = stylesToApply[i];
        if (item.style.opacity !== String(s.opacity)) {
            item.style.opacity = s.opacity;
            item.style.transform = s.transform;
            if (s.fontWeight) item.style.fontWeight = s.fontWeight;
            item.style.pointerEvents = s.pointerEvents;
        }
        if (s.selected && !item.classList.contains('selected')) {
            item.classList.add('selected');
        } else if (!s.selected && item.classList.contains('selected')) {
            item.classList.remove('selected');
        }
    });

    if (lastActiveVoiceIdx !== -1 && lastActiveVoiceIdx !== closestIdx) {
        if (!isProgrammaticScroll && wheel.offsetParent !== null) {
            playScrollSound();
        }
    }
    lastActiveVoiceIdx = closestIdx;

    const activeItem = items[closestIdx];
    if (activeItem) {
        const newVal = activeItem.dataset.val;
        if (selectedVoice !== newVal) {
            if (!isPremiumUser) {
                // Not premium, revert to Alan
                selectedVoice = 'en_GB-alan-medium';
                localStorage.setItem('selectedVoice', selectedVoice);
                syncVoiceWheelToCurrent();
                openPremiumModal();
                return;
            }
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
    if (!wheel) return;
    if (wheel.clientHeight === 0) {
        setTimeout(syncVoiceWheelToCurrent, 50);
        return;
    }
    const items = getVoiceWheelItems();
    const idx = items.findIndex(i => i.dataset.val === selectedVoice);
    if (idx !== -1) {
        const item = items[idx];
        const targetScroll = item.offsetTop + item.offsetHeight / 2 - wheel.clientHeight / 2;
        isProgrammaticScroll = true;
        wheel.scrollTo({ top: targetScroll, behavior: 'auto' });
        updateVoiceWheelActiveStyle();
        clearTimeout(programmaticScrollTimeout);
        programmaticScrollTimeout = setTimeout(() => {
            isProgrammaticScroll = false;
            updateVoiceWheelActiveStyle();
        }, 300);
    } else {
        updateVoiceWheelActiveStyle();
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

    // Mouse wheel: scroll proportionally, direction normal based on request
    wheel.addEventListener('wheel', e => {
        // Let native horizontal scrolling through (trackpad)
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        e.preventDefault();
        
        // Calculate items per tick for perfect scaling
        const items = getVoiceWheelItems();
        let itemHeight = items[0] ? items[0].offsetHeight : 30;
        if (items.length > 1) {
            itemHeight = items[1].offsetTop - items[0].offsetTop;
        }

        // deltaY is typically 100 per tick on Windows/mice. Scale it so 1 tick = 1 itemHeight.
        // Use normal scroll delta Y based on user feedback 
        // ("going down and it's going up ... which should be in reverse")
        const scrollAmount = e.deltaY * (itemHeight / 100); 
        
        wheel.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }, { passive: false });
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
    if (isFeedSection) return getVerseAtIndex(currentVerseIndex.general);
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
    } else if (currentRadialElement && ((currentRadialElement.id && e.target.closest('#' + currentRadialElement.id)) || currentRadialElement.contains(e.target))) {
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
        generateAndShareImage(currentTargetVerse, currentTargetVerse.elementId);
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
    return;
}


// Initialize Radial on main buttons
document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('speak-general');
    if (playBtn) {
        // playBtn no longer uses radial menu
    }
});



function advanceSearchVerse() {
    if (!window.currentSearchResultsMatches || window.currentSearchResultsMatches.length === 0) return;
    if (!selectedVerse || selectedVerse.type !== 'search') return;
    
    let currentIndex = window.currentSearchResultsMatches.findIndex((match, idx) => {
        return 'search-verse-' + idx === selectedVerse.elementId;
    });
    
    if (currentIndex >= 0 && currentIndex < window.currentSearchResultsMatches.length - 1) {
        let nextIndex = currentIndex + 1;
        let nextMatch = window.currentSearchResultsMatches[nextIndex];
        let cardId = 'search-verse-' + nextIndex;
        
        if (nextIndex >= currentSearchRenderedCount) {
            renderSearchBatch(10);
        }
        
        selectVerse(nextMatch, 'search', cardId, true);
        
        setTimeout(() => {
            const card = document.getElementById(cardId);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);
        
        setTimeout(() => {
            let textToSpeak = nextMatch.spoken_text || nextMatch.text;
            playText(textToSpeak, 'search');
            autoMode = true;
        }, 400);
    } else {
        stopAudio();
    }
}

function advanceSavedVerse() {
    if (!window.currentSavedVersesRendered || window.currentSavedVersesRendered.length === 0) return;
    if (!selectedVerse || selectedVerse.type !== 'saved') return;
    
    let currentIndex = window.currentSavedVersesRendered.findIndex(item => {
        let v = item.v;
        if (v.id && selectedVerse.id) return v.id === selectedVerse.id;
        return v.book === selectedVerse.book && String(v.chapter) === String(selectedVerse.chapter) && String(v.verse) === String(selectedVerse.verse);
    });
    
    if (currentIndex >= 0 && currentIndex < window.currentSavedVersesRendered.length - 1) {
        let nextItem = window.currentSavedVersesRendered[currentIndex + 1];
        let cardId = 'saved-verse-' + nextItem.i;
        selectVerse(nextItem.v, 'saved', cardId, true);
        
        setTimeout(() => {
            const card = document.getElementById(cardId);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);
        
        setTimeout(() => {
            let textToSpeak = nextItem.v.spoken_text || nextItem.v.text;
            playText(textToSpeak, 'saved');
            autoMode = true;
        }, 400); // Allow card animation to finish
    } else {
        stopAudio();
    }
}

/* --- Audio Waveform Visualizer --- */

function startWaveformVisualizer() {
    const canvas = document.getElementById('waveform-canvas');
    if (canvas) canvas.classList.add('active');

    if (waveformAnimFrame) return; // Prevent duplicate loops
    if (!canvas || !audioAnalyser) return;
    
    const ctx = canvas.getContext('2d');
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        if (!isSpeaking || isPaused) {
            stopWaveformVisualizer(true);
            return;
        }
        waveformAnimFrame = requestAnimationFrame(draw);
        
        const dpr = window.devicePixelRatio || 1;
        const logicalWidth = window.innerWidth;
        const logicalHeight = 380;
        const targetWidth = Math.floor(logicalWidth * dpr);
        const targetHeight = Math.floor(logicalHeight * dpr);

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            canvas.style.width = logicalWidth + 'px';
            canvas.style.height = logicalHeight + 'px';
            ctx.scale(dpr, dpr);
        }
        
        let sum = 0;
        const len = dataArray.length;

        if (isSpeaking && !isPaused) {
            audioAnalyser.getByteFrequencyData(dataArray);
            for (let i = 0; i < len; i++) {
                sum += dataArray[i];
            }
        }
        
        const avgVolume = sum / len / 255.0;
        
        if (window.smoothedVolume === undefined) window.smoothedVolume = 0;
        window.smoothedVolume += (avgVolume - window.smoothedVolume) * 0.12; 
        
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        
        const time = Date.now() * 0.001;
        const numPoints = Math.max(120, Math.floor(logicalWidth / 4));
        const sliceWidth = logicalWidth / (numPoints - 1);
        
        const rootStyle = getComputedStyle(document.body);
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const defaultRgb = isDark ? '215, 195, 175' : '66, 55, 45';
        const rgbStr = rootStyle.getPropertyValue('--visualizer-rgb').trim() || defaultRgb;

        const drawLayer = (speed, frequency, amplitudeBase, audioMult, alpha) => {
            ctx.beginPath();
            ctx.moveTo(0, logicalHeight);
            for (let i = 0; i < numPoints; i++) {
                const x = i * sliceWidth;
                const wave1 = Math.sin(x * frequency + time * speed);
                const wave2 = Math.sin(x * frequency * 1.5 - time * speed * 0.8);
                
                const height = amplitudeBase + (wave1 * 12) + (wave2 * 8) + (window.smoothedVolume * audioMult);
                const y = logicalHeight - Math.max(5, height);
                ctx.lineTo(x, y);
            }
            ctx.lineTo(logicalWidth, logicalHeight);
            ctx.closePath();
            
            const grad = ctx.createLinearGradient(0, logicalHeight, 0, logicalHeight - 120);
            const layerAlpha = isDark ? Math.min(1.0, alpha * 1.35) : alpha;
            grad.addColorStop(0, `rgba(${rgbStr}, ${layerAlpha})`);
            grad.addColorStop(0.6, `rgba(${rgbStr}, ${layerAlpha * 0.4})`);
            grad.addColorStop(1, `rgba(${rgbStr}, 0.0)`);
            
            ctx.fillStyle = grad;
            ctx.fill();
        };

        // Draw multiple softly layered sine waves
        drawLayer(1.5, 0.005, 10, 60, 0.3);   // Back layer
        drawLayer(1.8, 0.007, 15, 80, 0.55);  // Middle layer
        drawLayer(2.2, 0.009, 20, 110, 0.85); // Front layer
    }
    
    draw();
}

function stopWaveformVisualizer(forceHide = true) {
    if (waveformAnimFrame) {
        cancelAnimationFrame(waveformAnimFrame);
        waveformAnimFrame = null;
    }
    const canvas = document.getElementById('waveform-canvas');
    if (canvas) {
        canvas.classList.remove('active');
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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
    const hasAlbums = populateAlbumWheel();
    if (!hasAlbums) {
        showToast('No other folder available. Create a new folder first.');
        openCreateBookmarkModal();
        return;
    }
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
    
    // Check if it already exists
    const existingIdx = savedVerses.findIndex(s => {
        if (s && s.id && pendingBookmarkVerse.id) return s.id === pendingBookmarkVerse.id;
        return s && s.book === pendingBookmarkVerse.book && String(s.chapter) === String(pendingBookmarkVerse.chapter) && String(s.verse) === String(pendingBookmarkVerse.verse);
    });
    
    let isSameAlbum = false;
    
    if (existingIdx > -1) {
        if (savedVerses[existingIdx].album === albumName) {
            isSameAlbum = true;
        } else {
            savedVerses[existingIdx].album = albumName;
        }
    } else {
        const v = { ...pendingBookmarkVerse, album: albumName };
        if (!v.id) v.id = 'sv_' + Date.now() + '_' + Math.floor(Math.random()*100000);
        savedVerses.unshift(v);
    }
    
    if (!isSameAlbum) {
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        showToast(existingIdx > -1 ? ('Moved to ' + albumName) : ('Saved to ' + albumName));
    }
    
    closeAlbumModal();
    deselectVerse();
    if (document.getElementById('saved-verses').classList.contains('active-section')) {
        showSavedVerses(true);
    }
    updatePillUI();
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
    if (!wheel) return false;
    
    // Determine current folder of pendingBookmarkVerse if saved
    let currentAlbum = null;
    if (pendingBookmarkVerse) {
        const existing = savedVerses.find(s => {
            if (!s) return false;
            if (s.id && pendingBookmarkVerse.id) return s.id === pendingBookmarkVerse.id;
            return s.book === pendingBookmarkVerse.book && 
                   String(s.chapter) === String(pendingBookmarkVerse.chapter) && 
                   String(s.verse) === String(pendingBookmarkVerse.verse);
        });
        if (existing && existing.album) {
            currentAlbum = existing.album;
        } else if (pendingBookmarkVerse.album) {
            currentAlbum = pendingBookmarkVerse.album;
        }
    }

    const albums = new Set();
    createdAlbums.forEach(name => {
        if (name && name !== 'Default') albums.add(name);
    });
    savedVerses.forEach(v => {
        if (v && v.album && v.album !== 'Default') albums.add(v.album);
    });
    
    let albumList = Array.from(albums);
    
    // Exclude currentAlbum if verse is already saved in a folder
    if (currentAlbum) {
        albumList = albumList.filter(name => name !== currentAlbum);
    }
    
    if (albumList.length === 0) {
        return false;
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
            if (item.classList.contains('selected')) {
                saveToAlbum(album);
            } else {
                const targetScroll = item.offsetTop + item.offsetHeight / 2 - wheel.clientHeight / 2;
                wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
            }
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

    return true;
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
        
        if (absNormDist < 1.5) {
            const opacity = 1 - absNormDist * 0.65;
            const scale = 1.15 - absNormDist * 0.15;
            const angle = normDist * 40;
            item.style.opacity = Math.max(0, opacity);
            item.style.transform = `rotateX(${angle}deg) scale(${scale}) translateZ(0)`;
            item.style.fontWeight = absNormDist < 0.5 ? '600' : '400';
            item.style.pointerEvents = 'auto';
            item.classList.toggle('selected', absNormDist < 0.5);
        } else {
            item.style.opacity = 0;
            item.style.transform = 'scale(0.5) translateZ(0)';
            item.style.pointerEvents = 'none';
            item.classList.remove('selected');
        }
    });
    
    if (lastActiveAlbumIdx !== -1 && lastActiveAlbumIdx !== closestIdx) {
        if (!isProgrammaticAlbumScroll && wheel.offsetParent !== null) {
            playScrollSound();
        }
    }
    lastActiveAlbumIdx = closestIdx;
}

function updateSpeakIcons() {
    updateSpeakButton('speak-general');
}

/* --- Create Bookmark / Album Modal --- */
function openCreateBookmarkModal() {
    const modal = document.getElementById('create-bookmark-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    setCreateModalTab('album');
}

function closeCreateBookmarkModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('create-bookmark-modal');
    if (modal) modal.classList.add('hidden');
}

let lastActiveCreateVerseAlbumIdx = -1;
let createVerseAlbumWheelTargetScroll = null;
let createVerseAlbumWheelScrollTimeout = null;

function setupCreateVerseAlbumWheelListeners() {
    const wheel = document.getElementById('create-verse-album-wheel');
    if (!wheel || wheel.dataset.listened) return;
    wheel.dataset.listened = 'true';

    wheel.addEventListener('scroll', () => {
        updateCreateVerseAlbumWheelActiveStyle();
    }, { passive: true });

    wheel.addEventListener('wheel', e => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        
        const items = Array.from(wheel.querySelectorAll('.chap-wheel-item[data-val]'));
        let itemWidth = items[0] ? items[0].offsetWidth : 80;
        if (items.length > 1) {
            itemWidth = items[1].offsetLeft - items[0].offsetLeft;
        }
        if (itemWidth === 0) itemWidth = 80;
        
        const scrollAmount = e.deltaY * (itemWidth / 100);
        
        if (createVerseAlbumWheelTargetScroll === null) {
            createVerseAlbumWheelTargetScroll = wheel.scrollLeft;
        }
        
        createVerseAlbumWheelTargetScroll += scrollAmount;
        const maxScroll = wheel.scrollWidth - wheel.clientWidth;
        createVerseAlbumWheelTargetScroll = Math.max(0, Math.min(maxScroll, createVerseAlbumWheelTargetScroll));
        
        wheel.scrollTo({ left: createVerseAlbumWheelTargetScroll, behavior: 'smooth' });
        
        clearTimeout(createVerseAlbumWheelScrollTimeout);
        createVerseAlbumWheelScrollTimeout = setTimeout(() => {
            createVerseAlbumWheelTargetScroll = null;
        }, 400);
    }, { passive: false });
}

function updateCreateVerseAlbumWheelActiveStyle() {
    const wheel = document.getElementById('create-verse-album-wheel');
    if (!wheel || wheel.clientWidth === 0) return;
    const items = Array.from(wheel.querySelectorAll('.chap-wheel-item[data-val]'));
    if (!items.length) return;
    
    const containerCenter = wheel.scrollLeft + wheel.clientWidth / 2;
    const metrics = items.map(item => item.offsetLeft + item.offsetWidth / 2);
    
    let itemWidth = items.length > 1 ? (metrics[1] - metrics[0]) : (wheel.clientWidth / 3 || 80);
    if (itemWidth === 0) itemWidth = 80;

    let closestIdx = 0, closestDist = Infinity;
    
    items.forEach((item, i) => {
        const itemCenter = metrics[i];
        const dist = itemCenter - containerCenter;
        const normDist = dist / itemWidth;
        const absNormDist = Math.abs(normDist);

        if (Math.abs(dist) < closestDist) {
            closestDist = Math.abs(dist);
            closestIdx = i;
        }

        if (absNormDist < 1.5) {
            const opacity = 1 - absNormDist * 0.65;
            const scale = 1.15 - absNormDist * 0.3;
            const angle = normDist * 40; 
            item.style.opacity = Math.max(0, opacity);
            item.style.transform = `rotateY(${-angle}deg) scale(${scale}) translateZ(0)`;
            item.style.fontWeight = absNormDist < 0.5 ? '700' : '500';
            item.style.color = 'var(--text-color)';
            item.style.pointerEvents = 'auto';
            if (absNormDist < 0.5) item.classList.add('active');
            else item.classList.remove('active');
        } else {
            item.style.opacity = 0;
            item.style.transform = 'scale(0.1) translateZ(0)';
            item.style.color = 'var(--text-color)';
            item.style.pointerEvents = 'none';
            item.classList.remove('active');
        }
    });

    if (items[closestIdx]) {
        window.selectedCreateVerseAlbum = items[closestIdx].dataset.val;
    }

    if (lastActiveCreateVerseAlbumIdx !== -1 && lastActiveCreateVerseAlbumIdx !== closestIdx) {
        if (wheel.offsetParent !== null) {
            playScrollSound();
        }
    }
    lastActiveCreateVerseAlbumIdx = closestIdx;
}

function syncCreateVerseAlbumWheelToCurrent(smooth = true) {
    const wheel = document.getElementById('create-verse-album-wheel');
    if (!wheel || wheel.clientWidth === 0) return;
    const items = Array.from(wheel.querySelectorAll('.chap-wheel-item[data-val]'));
    if (!items.length) return;
    
    const targetVal = window.selectedCreateVerseAlbum || items[0].dataset.val;
    const idx = items.findIndex(item => item.dataset.val === targetVal);
    const targetIdx = idx !== -1 ? idx : 0;
    
    const item = items[targetIdx];
    if (item) {
        const targetScroll = item.offsetLeft + item.offsetWidth / 2 - wheel.clientWidth / 2;
        wheel.scrollTo({ left: targetScroll, behavior: smooth ? 'smooth' : 'auto' });
        setTimeout(() => updateCreateVerseAlbumWheelActiveStyle(), smooth ? 300 : 20);
    }
}

function populateCreateVerseAlbumWheel() {
    const wheel = document.getElementById('create-verse-album-wheel');
    if (!wheel) return;
    wheel.innerHTML = '';
    
    const albums = getAlbumsGrouped();
    const albumNames = Object.keys(albums);
    if (albumNames.length === 0) albumNames.push('Default');
    
    albumNames.forEach((name, i) => {
        const item = document.createElement('div');
        item.className = 'chap-wheel-item';
        item.style.fontSize = '1.1rem';
        item.innerText = name;
        item.dataset.val = name;
        item.onclick = (e) => {
            if (e) e.stopPropagation();
            const targetScroll = item.offsetLeft + item.offsetWidth / 2 - wheel.clientWidth / 2;
            wheel.scrollTo({ left: targetScroll, behavior: 'smooth' });
        };
        wheel.appendChild(item);
    });
    
    setupCreateVerseAlbumWheelListeners();
    
    setTimeout(() => {
        updateCreateVerseAlbumWheelActiveStyle();
        syncCreateVerseAlbumWheelToCurrent(false);
    }, 50);
}


function setCreateModalTab(tab) {
    const albumTab = document.getElementById('tab-create-album');
    const verseTab = document.getElementById('tab-create-verse');
    const albumForm = document.getElementById('form-create-album');
    const verseForm = document.getElementById('form-create-verse');
    
    if (tab === 'album') {
        if (albumTab) albumTab.classList.add('active');
        if (verseTab) verseTab.classList.remove('active');
        if (albumForm) albumForm.classList.remove('hidden');
        if (verseForm) verseForm.classList.add('hidden');
    } else {
        if (verseTab) verseTab.classList.add('active');
        if (albumTab) albumTab.classList.remove('active');
        if (verseForm) verseForm.classList.remove('hidden');
        if (albumForm) albumForm.classList.add('hidden');
        
        // Auto pre-fill if active selected verse exists
        if (selectedVerse && selectedVerse.type !== 'folder') {
            const textEl = document.getElementById('create-verse-text');
            const bookEl = document.getElementById('create-verse-book');
            const chapEl = document.getElementById('create-verse-chapter');
            const verseEl = document.getElementById('create-verse-number');
            if (textEl) textEl.value = selectedVerse.text || '';
            if (bookEl) bookEl.value = selectedVerse.book || '';
            if (chapEl) chapEl.value = selectedVerse.chapter || '';
            if (verseEl) verseEl.value = selectedVerse.verse || '';
        }
        
        populateCreateVerseAlbumWheel();
    }
}

function submitCreateAlbum() {
    const input = document.getElementById('create-album-name');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    
    // Premium Lock: Max 2 albums for free users
    if (createdAlbums.length >= 2 && !isPremiumUser) {
        closeCreateBookmarkModal();
        openPremiumModal();
        return;
    }
    
    if (!createdAlbums.includes(name)) {
        createdAlbums.push(name);
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
    }
    
    input.value = '';
    closeCreateBookmarkModal();
    showSavedVerses();
    showToast('Album "' + name + '" created');
}

function submitCreateVerse() {
    const textEl = document.getElementById('create-verse-text');
    const bookEl = document.getElementById('create-verse-book');
    const chapEl = document.getElementById('create-verse-chapter');
    const verseEl = document.getElementById('create-verse-number');
    
    const text = textEl ? textEl.value.trim() : '';
    const book = bookEl ? bookEl.value.trim() : '';
    const chapter = chapEl ? chapEl.value.trim() : '';
    const verse = verseEl ? verseEl.value.trim() : '';
    const album = window.selectedCreateVerseAlbum || 'Default';
    
    if (!text || !book || !chapter || !verse) { 
        showToast('Please fill in all fields'); 
        return; 
    }
    
    const v = { text, book, chapter, verse, album, religion: 'Custom', type: 'saved', id: 'sv_' + Date.now() + '_' + Math.floor(Math.random()*100000) };
    savedVerses.push(v);
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    
    if (textEl) textEl.value = '';
    if (bookEl) bookEl.value = '';
    if (chapEl) chapEl.value = '';
    if (verseEl) verseEl.value = '';
    
    closeCreateBookmarkModal();
    showSavedVerses();
    showToast('Verse saved to ' + album);
}

function deselectVerse() {
    stopWaveformVisualizer(true);
    if (!selectedVerse) return;
    const wasFolder = selectedVerse.type === 'folder';
    highlightSelectedVerseElement(false);
    
    if (!wasFolder && selectedSavedAlbum) {
        selectedVerse = null;
        const folders = document.querySelectorAll('.album-folder-btn');
        let folderId = null;
        folders.forEach(f => {
            if (f.innerText === selectedSavedAlbum) {
                folderId = f.id;
            }
        });
        selectVerse({ name: selectedSavedAlbum }, 'folder', folderId, true);
        return;
    }
    
    selectedVerse = null;
    deactivatePillUI();
    if (wasFolder) {
        selectedSavedAlbum = null;
        showSavedVerses(false);
    }
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
    if (selectedVerse.type === 'saved' || selectedVerse.type === 'search') {
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
    } else if (selectedVerse.type === 'folder') {
        if (el) {
            if (active) {
                el.classList.add('active');
            } else {
                if (selectedSavedAlbum !== selectedVerse.name) {
                    el.classList.remove('active');
                }
            }
        }
    } else if (selectedVerse.type === 'book') {
        if (el) {
            if (active) {
                document.querySelectorAll('.book-verse.marked').forEach(e => e.classList.remove('marked'));
                el.classList.add('marked');
            } else {
                el.classList.remove('marked');
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
    
    // Reset inline styles modified in previous versions
    playBtn.style.opacity = '';
    playBtn.style.pointerEvents = '';
    playBtn.style.transform = '';

    const bookmarkIcon = playBtn.querySelector('.icon-pill-bookmark');
    const deleteIcon = playBtn.querySelector('.icon-pill-delete');
    const shareIcon = playBtn.querySelector('.icon-pill-share');
    const renameIcon = playBtn.querySelector('.icon-pill-rename');
    const playSvg = playBtn.querySelector('.icon-pill-play-svg');
    const folderSvg = playBtn.querySelector('.icon-pill-folder-svg');
    
    let isSaved = false;
    if (selectedVerse && selectedVerse.type !== 'folder') {
        isSaved = savedVerses.some(s => s && s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse));
    }
    
    if (selectedVerse && selectedVerse.type === 'folder') {
        if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
        if (deleteIcon) deleteIcon.classList.remove('hidden');
        
        if (shareIcon) shareIcon.classList.add('hidden');
        if (renameIcon) renameIcon.classList.remove('hidden');
        
        if (playSvg) playSvg.classList.add('hidden');
        if (folderSvg) folderSvg.classList.remove('hidden');
    } else if (selectedVerse && selectedVerse.type === 'saved') {
        if (!selectedSavedAlbum) {
            // "All" View: show Bookmark Icon, filled
            if (bookmarkIcon) {
                bookmarkIcon.classList.remove('hidden');
                bookmarkIcon.style.fill = 'currentColor'; // Universally filled
            }
            if (deleteIcon) deleteIcon.classList.add('hidden');
        } else {
            // Inside a specific folder: show Delete Icon
            if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
            if (deleteIcon) deleteIcon.classList.remove('hidden');
        }
        
        if (shareIcon) shareIcon.classList.remove('hidden');
        if (renameIcon) renameIcon.classList.add('hidden');
        
        if (playSvg) playSvg.classList.remove('hidden');
        if (folderSvg) folderSvg.classList.add('hidden');
        
        if (playSvg) {
            if (isSpeaking && !isPaused) {
                playSvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            } else {
                playSvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
            }
        }
    } else {
        // Book or Feed section: ALWAYS show bookmark icon, NEVER delete icon!
        if (bookmarkIcon) {
            bookmarkIcon.classList.remove('hidden');
            bookmarkIcon.style.fill = 'currentColor'; // Universally filled
        }
        if (deleteIcon) deleteIcon.classList.add('hidden');
        
        if (shareIcon) shareIcon.classList.remove('hidden');
        if (renameIcon) renameIcon.classList.add('hidden');
        
        if (playSvg) playSvg.classList.remove('hidden');
        if (folderSvg) folderSvg.classList.add('hidden');
        
        if (playSvg) {
            if (isSpeaking && !isPaused) {
                playSvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            } else {
                playSvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
            }
        }
    }
    
    const navMenu = document.getElementById('top-nav-menu');
    if (selectedVerse) {
        let shouldExpand = true;
        if (selectedVerse.type === 'feed' && !selectedVerse.isManual) {
            shouldExpand = false;
        }

        if (shouldExpand) {
            playBtn.classList.add('pill-active');
            if (navMenu) navMenu.classList.add('pill-active-menu');
        } else {
            playBtn.classList.remove('pill-active');
            if (navMenu) navMenu.classList.remove('pill-active-menu');
        }
        playBtn.style.display = 'flex';
        playBtn.style.visibility = 'visible';
    } else {
        playBtn.classList.remove('pill-active');
        if (navMenu) navMenu.classList.remove('pill-active-menu');
    }
}

function selectVerse(verseObj, type, elementId, forceSelect = false) {
    if (verseObj && verseObj.isAd) return;
    // Clear all existing saved verse element highlights to prevent multi-selection
    document.querySelectorAll('.saved-verse').forEach(el => {
        el.style.background = '';
        el.style.color = '';
        el.style.opacity = '';
        el.style.borderColor = '';
        const t = el.querySelector('.verse-text');
        if (t) t.style.color = '';
        const r = el.querySelector('.verse-ref');
        if (r) r.style.color = '';
    });
    let isDifferentVerse = false;
    if (!selectedVerse) {
        isDifferentVerse = true;
    } else if (selectedVerse.type !== type) {
        isDifferentVerse = true;
    } else if (type === 'folder' || verseObj.type === 'folder') {
        isDifferentVerse = selectedVerse.name !== verseObj.name;
    } else if (verseObj.id) {
        isDifferentVerse = selectedVerse.id !== verseObj.id;
    } else {
        isDifferentVerse = selectedVerse.book !== verseObj.book || 
                           String(selectedVerse.chapter) !== String(verseObj.chapter) || 
                           String(selectedVerse.verse) !== String(verseObj.verse);
    }

    if (!forceSelect && !isDifferentVerse) {
        if (type === 'book') return; // Prevent deselection in book section
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
            if (selectedVerse.globalIndex !== undefined) {
                const targetIdx = selectedVerse.globalIndex;
                bookVoiceCurrentVerse = targetIdx;
                syncWheelsToCurrent();
                scrollToBookVerse(targetIdx);
                markVerse();
                playBookVerse(targetIdx);
                autoNextBook = true;
            }
        } else if (type === 'saved') {
            playText(selectedVerse.text, 'saved');
            autoMode = true;
        } else if (type === 'feed') {
            playText(selectedVerse.text, 'feed');
            autoMode = true;
        }
    } else if (isSpeaking && isPaused && isDifferentVerse && !forceSelect) {
        // If voice session is paused, select/highlight it and update indices, but do NOT autoplay!
        stopAudio(true);
        if (type === 'book') {
            if (selectedVerse.globalIndex !== undefined) {
                bookVoiceCurrentVerse = selectedVerse.globalIndex;
                syncWheelsToCurrent();
                scrollToBookVerse(selectedVerse.globalIndex);
                markVerse();
            }
        }
    } else {
        if (type === 'book') {
            if (selectedVerse.globalIndex !== undefined) {
                bookVoiceCurrentVerse = selectedVerse.globalIndex;
                syncWheelsToCurrent();
                scrollToBookVerse(selectedVerse.globalIndex);
                markVerse();
            }
        }
    }
    updatePillUI();
}

function handlePillLeftAction(e) {
    if (e) e.stopPropagation();
    
    // Auto-select current feed or book verse if selectedVerse is null
    if (!selectedVerse) {
        const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
        const isBook = document.getElementById('read-books').classList.contains('active-section');
        if (isFeed && typeof currentFeedIndex !== 'undefined' && verseBatches.general && verseBatches.general[currentFeedIndex]) {
            selectedVerse = verseBatches.general[currentFeedIndex];
        } else if (isBook && typeof currentBookObj !== 'undefined' && lastSelectedBookVerse) {
            selectedVerse = lastSelectedBookVerse;
        }
    }
    
    if (!selectedVerse) {
        openCreateBookmarkModal();
        return;
    }
    
    // Safety check just in case
    if (!Array.isArray(savedVerses)) savedVerses = [];
    
    if (selectedVerse.type === 'folder') {
        const albumName = selectedVerse.name;
        if (!albumName) return;
        
        // Remove from createdAlbums
        const albumIndex = createdAlbums.indexOf(albumName);
        if (albumIndex > -1) {
            createdAlbums.splice(albumIndex, 1);
            localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
        }
        
        // Remove album tag from savedVerses (or delete verses in this folder)
        savedVerses.forEach(s => {
            if (s && s.album === albumName) {
                delete s.album;
            }
        });
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        
        const el = document.getElementById(selectedVerse.elementId);
        if (el) {
            el.style.transition = 'opacity 0.20s ease, transform 0.20s ease';
            el.style.opacity = '0';
            el.style.transform = 'scale(0.95)';
            setTimeout(() => {
                selectedSavedAlbum = null;
                deselectVerse();
                showSavedVerses(true);
            }, 200);
        } else {
            selectedSavedAlbum = null;
            deselectVerse();
            showSavedVerses(true);
        }
        
        return;
    }
    
    if (selectedVerse.type === 'saved' || selectedVerse.type === 'search') {
        if (!selectedSavedAlbum) {
            // In "All" view: this is a bookmark button, open album modal
            openAlbumModal(selectedVerse);
            return;
        }
        
        // Delete action
        const index = savedVerses.findIndex(s => {
            if (s.id && selectedVerse.id) return s.id === selectedVerse.id;
            return s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse);
        });
        if (index > -1) {
            savedVerses.splice(index, 1);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            
            if (isSpeaking && !isPaused) {
                stopAudio(true);
            }
            
            const el = document.getElementById(selectedVerse.elementId);
            if (el) {
                el.style.transition = 'opacity 0.20s ease, transform 0.20s ease';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    deselectVerse();
                    activeSavedVerse = null;
                    showSavedVerses();
                }, 200);
            } else {
                deselectVerse();
                activeSavedVerse = null;
                showSavedVerses();
            }
            showToast('Bookmark removed');
        }
    } else {
        // Bookmark/Save action
        const index = savedVerses.findIndex(s => s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse));
        if (index > -1) {
            savedVerses.splice(index, 1);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            showToast('Bookmark removed');
        } else {
            openAlbumModal(selectedVerse);
        }
    }
    updatePillUI();
}

function handlePillPlay(e) {
    if (e) e.stopPropagation();
    if (selectedVerse && selectedVerse.type === 'folder') {
        selectedSavedAlbum = selectedVerse.name;
        showSavedVerses(false);
        return;
    }
    
    // Synchronously resume audio context on user gesture to avoid browser block
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(err => console.error("AudioContext resume failed:", err));
    }

    const isBookSection = document.getElementById('read-books').classList.contains('active-section')
        && !document.getElementById('book-content-view').classList.contains('hidden');
    const isFeedSection = document.getElementById('verse-feed').classList.contains('active-section');

    if (isSpeaking) {
        if (!isPaused) {
            isPaused = true;
            if (currentAudioNode) {
                try {
                    currentAudioNode.onended = null;
                    currentAudioNode.stop();
                } catch (err) { }
            }
            stopWaveformVisualizer();
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
        if (selectedVerse) {
            if (selectedVerse.type === 'book') {
                bookVoiceCurrentVerse = selectedVerse.globalIndex;
                markVerse();
                syncWheelsToCurrent();
                playBookVerse(bookVoiceCurrentVerse);
                autoNextBook = true;
            } else if (selectedVerse.type === 'feed') {
                playText(selectedVerse.text, 'feed');
                autoMode = false; // Only play this selected verse and stop
            } else if (selectedVerse.type === 'search') {
                let textToSpeak = selectedVerse.text;
                playText(textToSpeak, 'search');
                autoMode = true;
            } else if (selectedVerse.type === 'saved') {
                const idx = window.currentSavedVersesRendered ? window.currentSavedVersesRendered.findIndex(item => {
                    let v = item.v;
                    if (v.id && selectedVerse.id) return v.id === selectedVerse.id;
                    return v.book === selectedVerse.book && String(v.chapter) === String(selectedVerse.chapter) && String(v.verse) === String(selectedVerse.verse);
                }) : -1;
                savedVoiceCurrentIndex = idx !== -1 ? idx : 0;
                playText(selectedVerse.text, 'saved');
                autoMode = true;
            }
        } else {
            // Nothing explicitly selected, play contextual default
            if (isFeedSection) {
                const currentVerseObj = getVerseAtIndex(currentVerseIndex.general);
                if (currentVerseObj) {
                    let spokenText = currentVerseObj.spoken_text || currentVerseObj.text;
                    if (!spokenText.endsWith('.')) spokenText += '.';
                    if (ttsAnnounceSource) {
                        spokenText += '. ' + currentVerseObj.book + '.';
                    }
                    playText(spokenText, 'feed');
                    autoMode = true; // Auto advance to next verse
                }
            } else if (isBookSection) {
                playBookVerse(bookVoiceCurrentVerse || 0);
                autoNextBook = true;
            }
        }
        updatePillUI();
    }
}

function handlePillShare(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    
    if (selectedVerse.type === 'folder') {
        const input = document.getElementById('rename-album-input');
        if (input) input.value = selectedVerse.name || '';
        const modal = document.getElementById('rename-modal');
        if (modal) {
            modal.classList.remove('hidden');
            if (input) {
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 50);
            }
        }
        return;
    }
    
    generateAndShareImage(selectedVerse, selectedVerse.elementId);
}

async function generateAndShareImage(verseObj, elementId) {
    if (!verseObj || !window.html2canvas) {
        // Fallback to text
        const text = verseObj.text + " - " + verseObj.book + " " + verseObj.chapter + ":" + verseObj.verse;
        if (navigator.share) {
            navigator.share({ title: 'Daily Verse', text: text }).catch(console.error);
        } else {
            navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!');
        }
        return;
    }
    
    let targetEl;
    if (elementId) {
        targetEl = document.getElementById(elementId);
    } 
    if (!targetEl) {
        targetEl = document.querySelector('.verse-card.card-center');
    }
    
    if (!targetEl) return;
    
    showToast('Preparing image...');
    
    try {
        const originalBoxShadow = targetEl.style.boxShadow;
        targetEl.style.boxShadow = 'none';
        
        const brandingEl = document.createElement('div');
        brandingEl.innerText = 'VerseFeed';
        brandingEl.style.position = 'absolute';
        brandingEl.style.bottom = '15px';
        brandingEl.style.left = '0';
        brandingEl.style.width = '100%';
        brandingEl.style.textAlign = 'center';
        brandingEl.style.fontSize = '1.2rem';
        brandingEl.style.fontWeight = 'bold';
        brandingEl.style.opacity = '0.5';
        brandingEl.style.color = 'var(--text-color)';
        targetEl.appendChild(brandingEl);
        
        const canvas = await html2canvas(targetEl, {
            backgroundColor: document.body.getAttribute('data-theme') === 'dark' ? '#121212' : '#f5f7fa',
            scale: 2,
            logging: false
        });
        
        targetEl.removeChild(brandingEl);
        targetEl.style.boxShadow = originalBoxShadow;
        
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], 'versefeed_share.png', { type: 'image/png' });
            const text = verseObj.text + " - " + verseObj.book + " " + verseObj.chapter + ":" + verseObj.verse;
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: 'Daily Verse',
                        text: text,
                        files: [file]
                    });
                } catch (e) {
                    console.error("Share failed", e);
                }
            } else if (navigator.share) {
                navigator.share({ title: 'Daily Verse', text: text }).catch(console.error);
            } else {
                navigator.clipboard.writeText(text);
                showToast('Copied to clipboard!');
            }
        }, 'image/png');
    } catch (e) {
        console.error('Error generating image', e);
        showToast('Failed to generate image');
    }
}

function closeRenameModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('rename-modal');
    if (modal) modal.classList.add('hidden');
}

function submitRenameAlbum() {
    const input = document.getElementById('rename-album-input');
    if (!input || !selectedVerse || selectedVerse.type !== 'folder') return;
    
    const newName = input.value.trim();
    const oldName = selectedVerse.name;
    if (!newName || newName === oldName) {
        closeRenameModal();
        return;
    }
    
    // Update in savedVerses
    savedVerses.forEach(v => {
        if (v && v.album === oldName) v.album = newName;
    });
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    
    // Update in createdAlbums
    const idx = createdAlbums.indexOf(oldName);
    if (idx > -1) {
        createdAlbums[idx] = newName;
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
    }
    
    selectedSavedAlbum = newName;
    selectedVerse.name = newName;
    
    closeRenameModal();
    showSavedVerses(true);
    showToast('Folder renamed to "' + newName + '"');
}

function confirmRenameAlbum() { submitRenameAlbum(); }


// ==============================================
// FIREBASE AUTHENTICATION & FIRESTORE CLOUD SYNC
// ==============================================

const firebaseConfig = {
  apiKey: "AIzaSyCy1lG5CcGlMj4qGEuUJt-8L_Tul6ZMrKM",
  authDomain: "religionapp-38998.firebaseapp.com",
  projectId: "religionapp-38998",
  storageBucket: "religionapp-38998.firebasestorage.app",
  messagingSenderId: "131330287162",
  appId: "1:131330287162:web:84e3694ec4d07987163703",
  measurementId: "G-R240CQB881"
};

let db = null;

function applyUserAuthSuccess(user) {
    if (!user) return;
    googleUser = {
        name: user.displayName || user.email || 'User',
        picture: user.photoURL || '',
        email: user.email || '',
        sub: user.uid
    };
    try { originalSetItem.call(localStorage, 'googleUser', JSON.stringify(googleUser)); } catch(e){}
    
    switchProfile('account_' + user.uid);
    loadUserDataFromFirestore(user.uid);
    
    if (document.getElementById('onboarding') && document.getElementById('onboarding').classList.contains('active-section')) {
        goTo('verse-feed');
    }
    closeEmailAuthModal();
    closeEmailVerifyModal();
    updatePremiumModalActions();
    updateUserUI();
}

function updatePremiumModalActions() {
    const btn = document.querySelector('.premium-buy-pill');
    if (!btn) return;
    const txt = btn.querySelector('.premium-buy-pill-text');
    if (googleUser || (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser)) {
        if (txt) txt.innerText = 'Get Premium — $2.99/mo';
        btn.onclick = typeof simulatePurchase === 'function' ? simulatePurchase : function(){};
    } else {
        if (txt) txt.innerText = 'Login to Buy Premium';
        btn.onclick = () => { if(typeof closePremiumModal === 'function') closePremiumModal(); openEmailAuthModal('signin'); };
    }
}

function initFirebaseAuth() {
    if (typeof firebase === 'undefined') return;
    
    if (!firebase.apps.length) {
        try {
            firebase.initializeApp(firebaseConfig);
        } catch(e) {
            console.error("Firebase init error:", e);
        }
    }
    
    if (firebase.apps.length) {
        db = firebase.firestore();
        
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                const isPasswordUser = user.providerData && user.providerData.some(p => p.providerId === 'password');
                if (isPasswordUser && !user.emailVerified) {
                    googleUser = null;
                    try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e){}
                    switchProfile('guest');
                    updatePremiumModalActions();
                    updateUserUI();
                    showEmailVerifyModal(user.email);
                } else {
                    applyUserAuthSuccess(user);
                }
            } else {
                googleUser = null;
                try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e){}
                switchProfile('guest');
                closeEmailVerifyModal();
                updatePremiumModalActions();
                updateUserUI();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initFirebaseAuth();
});

function showEmailVerifyModal(email) {
    const modal = document.getElementById('email-verify-modal');
    const emailEl = document.getElementById('verify-modal-email');
    if (emailEl) emailEl.innerText = email || '';
    if (modal) modal.classList.remove('hidden');
}

function closeEmailVerifyModal() {
    const modal = document.getElementById('email-verify-modal');
    if (modal) modal.classList.add('hidden');
}

function checkEmailVerification() {
    const user = firebase.auth().currentUser;
    if (!user) {
        showToast("No active user session. Please sign in.");
        closeEmailVerifyModal();
        return;
    }
    showToast("Checking verification status...");
    user.reload().then(() => {
        if (user.emailVerified) {
            showToast("Email verified successfully! Welcome!");
            applyUserAuthSuccess(user);
        } else {
            showToast("Email is not verified yet. Please check your inbox or spam folder.");
        }
    }).catch(err => {
        console.error("Reload user error:", err);
        showToast("Failed to verify status. Please try again.");
    });
}

function resendVerificationEmail() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    user.sendEmailVerification().then(() => {
        showToast("Verification email resent! Check your inbox or spam.");
    }).catch(err => {
        console.error("Resend verification error:", err);
        showToast(err.message || "Failed to resend email.");
    });
}

function cancelEmailVerification() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().catch(() => {});
    }
    closeEmailVerifyModal();
}

let currentAuthMode = 'signin';

function openEmailAuthModal(tab = 'signin') {
    switchAuthTab(tab);
    const modal = document.getElementById('email-auth-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeEmailAuthModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('email-auth-modal');
    if (modal) modal.classList.add('hidden');
    clearAuthErrorMsg();
}

function switchAuthTab(mode) {
    currentAuthMode = mode;
    clearAuthErrorMsg();
    const btnSignin = document.getElementById('auth-tab-signin');
    const btnSignup = document.getElementById('auth-tab-signup');
    const nameContainer = document.getElementById('auth-name-container');
    const confirmContainer = document.getElementById('auth-confirm-container');
    const googleContainer = document.getElementById('auth-google-container');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (mode === 'signin') {
        if (btnSignin) {
            btnSignin.style.background = 'var(--card-bg)';
            btnSignin.style.opacity = '1';
        }
        if (btnSignup) {
            btnSignup.style.background = 'transparent';
            btnSignup.style.opacity = '0.6';
        }
        if (nameContainer) nameContainer.style.display = 'none';
        if (confirmContainer) confirmContainer.style.display = 'none';
        if (googleContainer) googleContainer.style.display = 'flex';
        if (submitBtn) submitBtn.innerText = 'Sign In';
    } else {
        if (btnSignup) {
            btnSignup.style.background = 'var(--card-bg)';
            btnSignup.style.opacity = '1';
        }
        if (btnSignin) {
            btnSignin.style.background = 'transparent';
            btnSignin.style.opacity = '0.6';
        }
        if (nameContainer) nameContainer.style.display = 'flex';
        if (confirmContainer) confirmContainer.style.display = 'flex';
        if (googleContainer) googleContainer.style.display = 'none';
        if (submitBtn) submitBtn.innerText = 'Sign Up';
    }
}

function showAuthErrorMsg(msg, isInfo = false) {
    const errorEl = document.getElementById('auth-error-msg');
    if (errorEl) {
        errorEl.innerText = msg || '';
        errorEl.style.color = isInfo ? 'var(--accent)' : '#ff4757';
    }
}

function formatFirebaseAuthError(error) {
    if (!error) return "An error occurred. Please try again.";
    const code = error.code || '';
    const message = error.message || '';

    switch (code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
            return "Incorrect email or password. Please check your details.";
        case 'auth/user-not-found':
            return "No account found with this email. Switch to Sign Up above.";
        case 'auth/email-already-in-use':
            return "An account already exists with this email. Switch to Sign In above.";
        case 'auth/invalid-email':
            return "Please enter a valid email address.";
        case 'auth/weak-password':
            return "Password should be at least 6 characters long.";
        case 'auth/too-many-requests':
            return "Too many failed attempts. Please wait a moment and try again.";
        case 'auth/network-request-failed':
            return "Network error. Please check your internet connection.";
        case 'auth/user-disabled':
            return "This user account has been disabled.";
        default:
            return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?$/i, '') || "Authentication error.";
    }
}

function clearAuthErrorMsg() {
    showAuthErrorMsg('');
}

function submitAuthForm() {
    if (currentAuthMode === 'signin') {
        handleEmailSignIn();
    } else {
        handleEmailSignUp();
    }
}

function handleEmailSignIn() {
    clearAuthErrorMsg();
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    if (!emailEl || !passEl) return;
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) {
        showAuthErrorMsg("Please enter email and password");
        return;
    }
    showAuthErrorMsg("Signing in...", true);
    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((result) => {
            if (result && result.user) {
                if (!result.user.emailVerified) {
                    closeEmailAuthModal();
                    showEmailVerifyModal(result.user.email);
                    showToast("Please verify your email to complete sign in.");
                } else {
                    applyUserAuthSuccess(result.user);
                    showToast("Signed in successfully!");
                }
            }
        })
        .catch((error) => {
            console.error("Email Sign In Error:", error);
            showAuthErrorMsg(formatFirebaseAuthError(error));
        });
}

function handleEmailSignUp() {
    clearAuthErrorMsg();
    const nameEl = document.getElementById('auth-name');
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    const confirmPassEl = document.getElementById('auth-confirm-password');

    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passEl ? passEl.value : '';
    const confirmPassword = confirmPassEl ? confirmPassEl.value : '';

    if (!name) { showAuthErrorMsg("Please enter your name"); return; }
    if (!email || !password) { showAuthErrorMsg("Please enter email & password"); return; }
    if (password.length < 6) { showAuthErrorMsg("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { showAuthErrorMsg("Passwords do not match"); return; }

    showAuthErrorMsg("Creating account...", true);

    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((result) => {
            if (result && result.user) {
                if (name && result.user.updateProfile) {
                    result.user.updateProfile({ displayName: name }).catch(() => {});
                }
                result.user.sendEmailVerification().then(() => {
                    closeEmailAuthModal();
                    showEmailVerifyModal(email);
                }).catch((err) => {
                    console.error("Error sending email verification:", err);
                    closeEmailAuthModal();
                    showEmailVerifyModal(email);
                });
            }
        })
        .catch((error) => {
            console.error("Email Sign Up Error:", error);
            showAuthErrorMsg(formatFirebaseAuthError(error));
        });
}

let isGooglePopupOpen = false;

function toggleGoogleAuth() {
    if (googleUser) {
        openUserProfileModal();
    } else {
        openEmailAuthModal('signin');
    }
}

function signInWithGoogle() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        showToast("Firebase loading, please try again in a moment...");
        return;
    }
    
    isGooglePopupOpen = true;
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).then(() => {
        closeEmailAuthModal();
    }).catch((error) => {
        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            console.log("Google Sign-In cancelled by user.");
            return;
        }
        console.error("Google Sign In Error:", error);
        showToast("Sign in error: " + (error ? (error.message || "Failed") : "Failed"));
    }).finally(() => {
        isGooglePopupOpen = false;
    });
}

function getLocalState() {
    return {
        savedVerses: JSON.parse(localStorage.getItem('savedVerses') || '[]'),
        createdAlbums: JSON.parse(localStorage.getItem('createdAlbums') || '[]'),
        bookMarkedVerse: JSON.parse(localStorage.getItem('bookMarkedVerse') || '{}'),
        globalSelectedRels: JSON.parse(localStorage.getItem('globalSelectedRels') || 'null'),
        darkModeEnabled: localStorage.getItem('darkModeEnabled') === 'true',
        selectedVoice: localStorage.getItem('selectedVoice') || 'en_GB-alan-medium',
        ttsAnnounceSource: localStorage.getItem('ttsAnnounceSource') === 'true',
        ttsRandomVoice: localStorage.getItem('ttsRandomVoice') === 'true',
        musicVolume: localStorage.getItem('musicVolume') || '0.5',
        musicEnabled: localStorage.getItem('musicEnabled') !== 'false',
        updatedAt: Date.now()
    };
}

async function saveUserDataToFirestore(uid) {
    if (!db || !uid) return;
    try {
        const payloadToSave = getLocalState();
        await db.collection('users').doc(uid).set(payloadToSave, { merge: true });
    } catch(err) {
        console.error("Firestore Save Error:", err);
    }
}

async function loadUserDataFromFirestore(uid) {
    if (!db || !uid) return;
    try {
        const docRef = db.collection('users').doc(uid);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const remoteData = doc.data();
            if (remoteData && typeof remoteData === 'object') {
                const localState = getLocalState();
                const remoteIsNewer = (remoteData.updatedAt || 0) > (localState.updatedAt || 0);

                // Merge savedVerses
                let mergedSavedVerses = [...(localState.savedVerses || [])];
                if (Array.isArray(remoteData.savedVerses)) {
                    remoteData.savedVerses.forEach(rv => {
                        const exists = mergedSavedVerses.some(lv => 
                            (lv.id && rv.id && lv.id === rv.id) ||
                            (lv.book && rv.book && lv.book === rv.book && String(lv.chapter) === String(rv.chapter) && String(lv.verse) === String(rv.verse))
                        );
                        if (!exists) {
                            mergedSavedVerses.push(rv);
                        }
                    });
                }
                savedVerses = mergedSavedVerses;
                localStorage.setItem('savedVerses', JSON.stringify(savedVerses));

                // Merge createdAlbums
                let mergedAlbums = [...(localState.createdAlbums || [])];
                if (Array.isArray(remoteData.createdAlbums)) {
                    remoteData.createdAlbums.forEach(ra => {
                        if (typeof ra === 'string') {
                            if (!mergedAlbums.includes(ra)) {
                                mergedAlbums.push(ra);
                            }
                        } else if (ra && typeof ra === 'object') {
                            const exists = mergedAlbums.some(la => typeof la === 'object' ? (la.name === ra.name || la.id === ra.id) : la === ra.name);
                            if (!exists) mergedAlbums.push(ra);
                        }
                    });
                }
                createdAlbums = mergedAlbums;
                localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));

                // Merge bookMarkedVerse
                let mergedBookmarks = Object.assign({}, localState.bookMarkedVerse || {});
                if (remoteData.bookMarkedVerse && typeof remoteData.bookMarkedVerse === 'object') {
                    Object.keys(remoteData.bookMarkedVerse).forEach(k => {
                        if (!mergedBookmarks[k]) mergedBookmarks[k] = remoteData.bookMarkedVerse[k];
                    });
                }
                bookMarkedVerse = mergedBookmarks;
                localStorage.setItem('bookMarkedVerse', JSON.stringify(bookMarkedVerse));

                // Preferences
                if (remoteIsNewer) {
                    if (Array.isArray(remoteData.globalSelectedRels) && remoteData.globalSelectedRels.length > 0) {
                        globalSelectedRels = remoteData.globalSelectedRels.filter(r => ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'].includes(r));
                    } else {
                        globalSelectedRels = [...religions];
                    }
                    localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
                    
                    if (typeof remoteData.darkModeEnabled !== 'undefined') {
                        darkModeEnabled = remoteData.darkModeEnabled === true || remoteData.darkModeEnabled === 'true';
                        localStorage.setItem('darkModeEnabled', darkModeEnabled);
                        if (darkModeEnabled) document.body.setAttribute('data-theme', 'dark');
                        else document.body.removeAttribute('data-theme');
                        updateDarkModeIcon(darkModeEnabled);
                    }
                    if (remoteData.selectedVoice) {
                        selectedVoice = remoteData.selectedVoice;
                        localStorage.setItem('selectedVoice', selectedVoice);
                    }
                }
                
                updateTogglesUI();
                if (typeof syncVoiceWheelToCurrent === 'function') syncVoiceWheelToCurrent();
                if (typeof showSavedVerses === 'function') showSavedVerses();
                if (typeof renderAlbums === 'function') renderAlbums();

                saveUserDataToFirestore(uid);
            }
        } else {
            saveUserDataToFirestore(uid);
        }
    } catch(err) {
        console.error("Firestore Load Error:", err);
    }
}



function openUserProfileModal() {
    if (!googleUser) return;
    const modal = document.getElementById('user-profile-modal');
    const nameEl = document.getElementById('user-modal-name');
    const emailEl = document.getElementById('user-modal-email');
    const imgEl = document.getElementById('user-modal-avatar-img');
    const txtEl = document.getElementById('user-modal-avatar-text');
    
    if (nameEl) nameEl.innerText = googleUser.name || 'User';
    if (emailEl) emailEl.innerText = googleUser.email || '';
    
    if (imgEl && txtEl) {
        if (googleUser.picture) {
            imgEl.src = googleUser.picture;
            imgEl.style.display = 'block';
            txtEl.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            txtEl.style.display = 'inline';
            txtEl.innerText = googleUser.name ? googleUser.name.charAt(0).toUpperCase() : 'U';
        }
    }
    
    if (modal) modal.classList.remove('hidden');
}

function closeUserProfileModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.classList.add('hidden');
}

function confirmSignOut() {
    const doCleanup = () => {
        googleUser = null;
        try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e){}
        googleAccessToken = null;
        switchProfile('guest');
        closeUserProfileModal();
        updateUserUI();
        updatePremiumModalActions();
        const savedVersesEl = document.getElementById('saved-verses');
        if (typeof showSavedVerses === 'function' && document.getElementById('saved-list') && savedVersesEl && savedVersesEl.classList.contains('active-section')) {
            showSavedVerses();
        }
        showToast('Signed out, restored Guest state');
    };

    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        firebase.auth().signOut().then(doCleanup).catch((err) => {
            console.error("Firebase SignOut Error:", err);
            doCleanup();
        });
    } else {
        doCleanup();
    }
}

function updateUserUI() {
    const btn = document.getElementById('user-google-btn');
    const svg = document.getElementById('google-icon-svg');
    const txt = document.getElementById('google-avatar-text');
    const img = document.getElementById('google-avatar-img');
    if (!btn || !svg || !txt) return;
    
    if (googleUser) {
        svg.classList.add('hidden');
        
        if (googleUser.picture && img) {
            img.src = googleUser.picture;
            img.classList.remove('hidden');
            img.style.display = 'block';
            txt.classList.add('hidden');
        } else {
            if (img) {
                img.classList.add('hidden');
                img.style.display = 'none';
            }
            txt.classList.remove('hidden');
            txt.innerText = googleUser.name ? googleUser.name.charAt(0).toUpperCase() : 'U';
        }
    } else {
        svg.classList.remove('hidden');
        txt.classList.add('hidden');
        if (img) {
            img.classList.add('hidden');
            img.style.display = 'none';
        }
    }
}

// --- Premium Modal Logic (RevenueCat) ---
let isPremiumUser = false;
let rcPackages = [];

async function initRevenueCat() {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) {
            const { Purchases } = window.Capacitor.Plugins;
            // Replace this with your actual Public API Key from RevenueCat dashboard
            await Purchases.configure({ apiKey: 'goog_oaXBzDwHBvBaJzSuIZbFuuvwkLM' });
            
            const customerInfo = await Purchases.getCustomerInfo();
            if (customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && customerInfo.entitlements.active['VerseFeed Premium']) {
                isPremiumUser = true;
            }
            
            const offerings = await Purchases.getOfferings();
            if (offerings.current && offerings.current.availablePackages) {
                rcPackages = offerings.current.availablePackages;
            }
        } else {
            // Web/dev mode bypass: auto-unlock premium for testing
            isPremiumUser = true;
        }
    } catch (e) {
        console.error("RevenueCat Init Error:", e);
    }
}

async function initAdMob() {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
            const { AdMob } = window.Capacitor.Plugins;
            await AdMob.initialize({
                requestTrackingAuthorization: true,
                testingDevices: [],
                initializeForTesting: false,
            });

            // Pre-load the first interstitial ad so it's ready when needed
            if (!isPremiumUser) {
                prepareNextInterstitial();
            }
        }
    } catch (e) {
        console.error("AdMob Init Error:", e);
    }
}

function openPremiumModal() {
    const modal = document.getElementById('premium-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderPremiumPackages();
    }
}

function closePremiumModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('premium-modal');
    if (modal) modal.classList.add('hidden');
}

function renderPremiumPackages() {
    const container = document.getElementById('premium-packages');
    if (!container) return;
    
    if (rcPackages.length === 0) {
        return;
    }
    container.innerHTML = rcPackages.map(pkg => `
        <button class="premium-package-btn" onclick="purchasePackage('${pkg.identifier}')">
            <span class="premium-package-title">${pkg.product.title}</span>
            <span class="premium-package-price">${pkg.product.priceString}</span>
        </button>
    `).join('');
}

async function purchasePackage(packageIdentifier) {
    showToast("Processing...");
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) {
            const { Purchases } = window.Capacitor.Plugins;
            const pkg = rcPackages.find(p => p.identifier === packageIdentifier);
            if (!pkg) return;
            const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
            if (customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && customerInfo.entitlements.active['VerseFeed Premium']) {
                isPremiumUser = true;
                showToast("Premium unlocked! Thank you!");
                closePremiumModal();
            }
        }
    } catch (e) {
        if (!e.userCancelled) {
            showToast("Purchase failed. Try again.");
            console.error(e);
        }
    }
}

async function restorePurchases() {
    showToast("Restoring...");
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) {
            const { Purchases } = window.Capacitor.Plugins;
            const customerInfo = await Purchases.restorePurchases();
            if (customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && customerInfo.entitlements.active['VerseFeed Premium']) {
                isPremiumUser = true;
                showToast("Premium restored! Welcome back.");
                closePremiumModal();
            } else {
                showToast("No active subscription found.");
            }
        } else {
            showToast("Restored (Web Test)");
            isPremiumUser = true;
            closePremiumModal();
        }
    } catch (e) {
        showToast("Restore failed.");
    }
}

function simulatePurchase() {
    showToast("Processing payment...");
    setTimeout(() => {
        isPremiumUser = true;
        showToast("Premium unlocked! Thank you for subscribing.");
        closePremiumModal();
    }, 1500);
}

window.addEventListener('load', async () => {
    await initRevenueCat();
    await initAdMob();
});


// --- Direct Google Drive Redirect & Offline Auto Guest ---

// Auto Guest login when offline
window.addEventListener('offline', () => {
    if (googleUser) {
        saveStateToProfile('account_' + googleUser.sub);
        googleUser = null;
        loadStateFromProfile('guest');
        updateUserUI();
        showToast('No internet connection: Switched to Guest mode');
    }
});

function preloadPiperVoices() {
    if ('caches' in window) {
        const cacheName = 'religion-app-v20';
        caches.open(cacheName).then(cache => {
            const voiceUrls = [
                './libs/piper/piper-bundle.js',
                './libs/piper/piper_phonemize.data',
                './libs/piper/piper_phonemize.wasm',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/en_GB-alan-medium.onnx',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx.json'
            ];
            voiceUrls.forEach(url => {
                cache.match(url, { ignoreSearch: true }).then(res => {
                    if (!res) cache.add(url).catch(e => {});
                });
            });
        });
    }
}
