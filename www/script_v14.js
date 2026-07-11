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
let createdAlbums = [];
try {
    const rawAlbums = localStorage.getItem('createdAlbums');
    if (rawAlbums) {
        createdAlbums = JSON.parse(rawAlbums);
    }
} catch (e) {
    createdAlbums = [];
}
let audio;
let currentTrack = 0;
const musicTracks = [
    './music/ambient_dream_1.mp3',
    './music/ambient_dream_2.mp3',
    './music/ambient_dream_3.mp3',
    './music/ambient_dream_4.mp3',
    './music/ambient_dream_5.mp3',
    './music/ambient_dream_6.mp3',
    './music/ambient_flute.mp3',
    './music/ambient_guitar.mp3',
    './music/ambient_meditation.mp3',
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
let selectedSavedAlbum = null;
let currentSavedVersesList = [];
let activeSavedVerse = null;
let selectedVerse = null;
let lastSelectedBookVerse = null;
let loadedVoices = new Set();
const MIN_CHAR_LIMIT = 70;
const maxCharLimit = 180;
let darkModeStr = localStorage.getItem('darkModeEnabled');
let darkModeEnabled = darkModeStr === null ? true : darkModeStr === 'true';
let isSubscribed = true; // Temporary: Making the app completely free for everyone
const religions = ['Christianity', 'Islam', 'Hinduism', 'Sikhism', 'Judaism', 'Buddhism', 'Philosophy', 'Psychology'];

const dataUrls = {
    Christianity: ['./data/bible.json?v=36'],
    Islam: ['./data/quran_v2.json?v=36', './data/hadiths_v2.json?v=36'],
    Hinduism: ['./data/gita.json?v=36', './data/hindu_books.json?v=36'],
    Judaism: ['./data/sefaria.json?v=36'],
    Sikhism: ['./data/gurbani.json?v=36'],
    Buddhism: ['./data/buddhism.json?v=36'],
    Philosophy: ['./data/philosophy.json?v=36'],
    Psychology: ['./data/psychology.json?v=36']
};
let loadedReligions = new Set();
let verseRankings = {};
// Settings
let ttsAnnounceSource = localStorage.getItem('ttsAnnounceSource') === 'true';

let ttsRandomVoice = localStorage.getItem('ttsRandomVoice') === null ? true : localStorage.getItem('ttsRandomVoice') === 'true';

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
let isGoogleLoggedIn = localStorage.getItem('isGoogleLoggedIn') === 'true';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let unlockTriggered = false;

function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
}

function unlockAudio() {
    resumeAudio();
    if (unlockTriggered) return;
    
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
}

document.addEventListener('touchstart', unlockAudio, {passive: true});
document.addEventListener('mousedown', unlockAudio, {passive: true});
document.addEventListener('touchend', unlockAudio, {passive: true});
document.addEventListener('pointerdown', unlockAudio, {passive: true});
document.addEventListener('keydown', unlockAudio, {passive: true});
document.addEventListener('click', unlockAudio, {passive: true});

// Persistent resume listeners that are never removed to keep audioCtx alive
document.addEventListener('touchstart', resumeAudio, {passive: true});
document.addEventListener('touchmove', resumeAudio, {passive: true});
document.addEventListener('mousedown', resumeAudio, {passive: true});
document.addEventListener('click', resumeAudio, {passive: true});
document.addEventListener('keydown', resumeAudio, {passive: true});
document.addEventListener('wheel', resumeAudio, {passive: true});

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
    resumeAudio();
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
    
    const CURRENT_VERSION = '37';
    if (localStorage.getItem('app_version') !== CURRENT_VERSION) {
        localStorage.removeItem('feedVerseBatches');
        localStorage.removeItem('feedCurrentVerseIndex');
        localStorage.removeItem('feedAllVersesUsed');
        localStorage.removeItem('feedSavedSelectedRels');
        localStorage.setItem('app_version', CURRENT_VERSION);
        location.reload();
    }
    
    // Check for remote updates
    checkForUpdates(CURRENT_VERSION);
    
    try {
        try {
            const rankingsRes = await fetch('./data/active_rankings.json?v=36');
            if (rankingsRes.ok) {
                verseRankings = await rankingsRes.json();
            }
        } catch (re) {
            console.error('Error loading verse rankings:', re);
        }
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
        let hasCompletedOnboarding = localStorage.getItem('onboardingCompleted') === 'true';
        if (globalSelectedRels === null) {
            hasCompletedOnboarding = false;
        }
        if (!hasCompletedOnboarding) {
            document.getElementById('top-nav-menu').classList.add('hidden');
            document.getElementById('verse-feed').classList.remove('active-section');
            document.getElementById('verse-feed').classList.add('hidden');
            document.getElementById('onboarding').classList.remove('hidden');
            document.getElementById('onboarding').classList.add('active-section');
            
            if (!globalSelectedRels) {
                globalSelectedRels = [];
                document.querySelectorAll('.onboard-pill').forEach(pill => {
                    pill.classList.remove('selected');
                });
            } else {
                document.querySelectorAll('.onboard-pill').forEach(pill => {
                    if (globalSelectedRels.includes(pill.getAttribute('data-rel'))) {
                        pill.classList.add('selected');
                    } else {
                        pill.classList.remove('selected');
                    }
                });
            }
        } else {
            initializeVerseFeed();
        }
        
    } catch (e) {
        console.error("Initialization error:", e);
    }

    // Setup smooth fill tracking for loading screen
    const diskWaveform = document.querySelector('.disk-waveform');
    let totalPreloadItems = 1; // Only wait for data loading
    let completedPreloads = 0;
    let targetFill = 0;
    let currentFill = 0;

    const fillInterval = setInterval(() => {
        currentFill += (targetFill - currentFill) * 0.5;
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

    // Step 2: Preload Piper TTS voice in background without blocking
    initPiper(selectedVoice).catch(e => console.error("Error preloading voice:", e));

    // Step 3: Do heavy JS initialization before the animation starts
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
    if (localStorage.getItem('onboardingCompleted') !== 'true') {
        goToOnboarding();
    } else {
        goTo('verse-feed');
        if (isGoogleLoggedIn) {
            autoSyncOnStartup();
        }
    }

    // Add loaded class to trigger full-screen expansion animation
    const loaderEl = document.getElementById('loading');
    if (loaderEl) {
        loaderEl.classList.add('loaded');
    }

    // Wait for screen expansion animation to finish (e.g. 200ms)
    await new Promise(r => setTimeout(r, 200));

    // Fade out loading screen
    if (loaderEl) {
        loaderEl.style.opacity = '0';
        setTimeout(() => {
            loaderEl.style.display = 'none';
            loaderEl.classList.remove('loaded');
        }, 600);
    }
    
    renderVoiceSettings(); // Pre-populate settings wheel on startup
    updateSettingsUserSectionUI(); // Pre-populate Premium/Google user row
    loadUnselectedDataInBackground();
    
    // Pre-load Piper TTS in background so first play is instant
    initPiper();
}


async function checkForUpdates(currentVersion) {
    try {
        const versionUrl = "https://your-domain.com/version.json";
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(versionUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            const remoteVersion = parseInt(data.latest_version, 10);
            const localVersion = parseInt(currentVersion, 10);
            if (remoteVersion > localVersion) {
                document.getElementById("update-modal").classList.remove("hidden");
            }
        }
    } catch (e) {
        console.warn("Could not check for updates:", e);
    }
}

function openPlayStore() {
    window.open("https://play.google.com/store/apps/details?id=com.lumina.spiritual", "_blank");
}
