// ==============================================
// GLOBAL USER STATE & ISOLATED PROFILE / CLOUD SYNC ENGINE
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
if (typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        if (typeof firebase.firestore === 'function') {
            db = firebase.firestore();
            try {
                db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
            } catch(err) {}
        }
    } catch(e) {
        console.warn("Early Firebase init notice:", e);
    }
}

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
var sessionUserPremiumAngle = null;

function getFirebaseCurrentUid() {
    try {
        if (googleUser && googleUser.sub) return googleUser.sub;
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && typeof firebase.auth === 'function') {
            const cur = firebase.auth().currentUser;
            return cur ? cur.uid : null;
        }
    } catch(e) {}
    return null;
}

const STATE_KEYS = [
    'globalSelectedRels', 'savedVerses', 'createdAlbums', 
    'bookMarkedVerse', 'darkModeEnabled', 'selectedVoice', 
    'ttsAnnounceSource', 'ttsRandomVoice', 'musicVolume', 'musicEnabled',
    'currentMusicTrack', 'seenVersesHistory'
];

function getActiveProfileId() {
    const uid = getFirebaseCurrentUid();
    if (uid) {
        return 'account_' + uid;
    }
    return 'guest';
}

// --- Flash suppression & local bookmark echo guard ---
let _flashSuppressDepth = 0;
let localBookmarkSnapshot = '';
let localBookmarkMutationUntil = 0;

function getBookmarkSnapshotFromData(data) {
    const sv = Array.isArray(data?.savedVerses) ? data.savedVerses.filter(v => v && v.text) : [];
    const ca = Array.isArray(data?.createdAlbums) ? data.createdAlbums.filter(a => typeof a === 'string' && a.trim()) : [];
    return JSON.stringify({ sv, ca });
}

function getLocalBookmarkSnapshot() {
    return JSON.stringify({
        sv: (savedVerses || []).filter(v => v && v.text),
        ca: (createdAlbums || []).filter(a => typeof a === 'string' && a.trim())
    });
}

function markLocalBookmarkMutation() {
    localBookmarkSnapshot = getLocalBookmarkSnapshot();
    localBookmarkMutationUntil = Date.now() + 8000;
}

function isBookmarkEcho(remoteData) {
    if (!remoteData || Date.now() > localBookmarkMutationUntil) return false;
    return getBookmarkSnapshotFromData(remoteData) === localBookmarkSnapshot;
}

function suppressFlash(fn) {
    document.documentElement.classList.add('flash-suppress');
    _flashSuppressDepth++;
    try {
        if (typeof fn === 'function') fn();
    } finally {
        _flashSuppressDepth--;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (_flashSuppressDepth <= 0) {
                    _flashSuppressDepth = 0;
                    document.documentElement.classList.remove('flash-suppress');
                }
            });
        });
    }
}

function openModal(modalEl) {
    if (!modalEl) return;
    suppressFlash(() => modalEl.classList.remove('hidden'));
}

function closeModal(modalEl) {
    if (!modalEl) return;
    suppressFlash(() => modalEl.classList.add('hidden'));
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
        if ((key === 'savedVerses' || key === 'createdAlbums') && !isRestoringState) {
            markLocalBookmarkMutation();
        }
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
    const prevRels = globalSelectedRels ? JSON.stringify(globalSelectedRels) : null;
    
    try {
        savedVerses = JSON.parse(localStorage.getItem('savedVerses') || '[]');
        if (!Array.isArray(savedVerses)) savedVerses = [];
    } catch(e) { savedVerses = []; }

    try {
        createdAlbums = JSON.parse(localStorage.getItem('createdAlbums') || '[]');
        if (!Array.isArray(createdAlbums)) createdAlbums = [];
    } catch(e) { createdAlbums = []; }

    try {
        bookMarkedVerse = JSON.parse(localStorage.getItem('bookMarkedVerse') || '{}');
        if (!bookMarkedVerse || typeof bookMarkedVerse !== 'object') bookMarkedVerse = {};
    } catch(e) { bookMarkedVerse = {}; }

    try {
        const rawSeen = localStorage.getItem('seenVersesHistory');
        seenVersesList = rawSeen ? JSON.parse(rawSeen) || [] : [];
    } catch(e) { seenVersesList = []; }
    seenVersesSet = new Set(seenVersesList);

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
    if (typeof updateVisualizerThemeCache === 'function') updateVisualizerThemeCache();

    selectedVoice = localStorage.getItem('selectedVoice') || 'en_GB-alan-medium';
    if (targetProfileId === 'guest' || !isPremiumUser) {
        ttsAnnounceSource = false;
        ttsRandomVoice = false;
    } else {
        ttsAnnounceSource = localStorage.getItem('ttsAnnounceSource') === 'true';
        ttsRandomVoice = localStorage.getItem('ttsRandomVoice') === 'true';
    }

    let curVol = parseFloat(localStorage.getItem('musicVolume') || '0.4');
    if (isNaN(curVol)) curVol = 0.4;
    if (typeof audio !== 'undefined' && audio) {
        audio.volume = curVol;
    }
    const slider = document.getElementById('music-volume-slider');
    if (slider) {
        slider.value = curVol;
        const pct = Math.round(curVol * 100);
        slider.setAttribute('data-tooltip', 'Music Volume (' + pct + '%): Adjust the background music volume.');
        slider.title = pct + '%';
    }

    const mEnabled = localStorage.getItem('musicEnabled') !== 'false';
    const musicBtn = document.getElementById('music-toggle');
    if (musicBtn) {
        if (mEnabled) {
            if (typeof audio !== 'undefined' && audio) {
                safePlayAudio(audio).then(() => {
                    musicBtn.classList.add('active');
                }).catch(e => {
                    const playOnInteract = () => {
                        if (localStorage.getItem('musicEnabled') !== 'false') {
                            safePlayAudio(audio).then(() => {
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

    if (typeof showSavedVerses === 'function') {
        showSavedVerses(true);
    }

    if (typeof initializeVerseFeed === 'function') {
        initializeVerseFeed(true);
    }

    isRestoringState = false;
}

function loadStateFromProfile(profileId) {
    switchProfile(profileId);
}

function saveStateToProfile(profileId) {
    // Isolated profile storage handles saving automatically via intercepted setItem
}

function triggerCloudSync(immediate = false) {
    const uid = getFirebaseCurrentUid();
    if (!uid) return;
    clearTimeout(cloudSyncTimeout);
    if (immediate) {
        if (typeof saveUserDataToFirestore === 'function') {
            saveUserDataToFirestore(uid);
        }
        return;
    }
    cloudSyncTimeout = setTimeout(() => {
        if (typeof saveUserDataToFirestore === 'function') {
            saveUserDataToFirestore(uid);
        }
    }, 1500);
}
// ==============================================



const validReligions = ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'];
let religionVerses = {};
let religionBooks = {};
let activeRankings = {};

async function loadActiveRankings() {
    if (Object.keys(activeRankings).length > 0) return;
    try {
        const res = await fetch('./data/active_rankings.json?v=22');
        if (res.ok) {
            activeRankings = await res.json();
        }
    } catch (e) {
        console.warn('Could not load active rankings:', e);
    }
}
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
let lastAnnouncedChapter = null;
let appLoaded = false;
const voicesList = [
    { value: 'en_GB-alan-medium', label: 'Alan' },
    { value: 'en_GB-alba-medium', label: 'Alba' },
    { value: 'en_US-libritts_r-medium', label: 'Libri' }
];

const musicTracks = [
    './music/ambient_flute.mp3',
    './music/ambient_guitar.mp3',
    './music/ambient_meditation.mp3'
];

function getRandomMusicTrackIndex(excludeIndex = -1) {
    // Build list of all track indices excluding the current one
    const allIndices = [];
    for (let i = 0; i < musicTracks.length; i++) {
        if (i !== excludeIndex) allIndices.push(i);
    }
    if (allIndices.length === 0) return 0;
    return allIndices[Math.floor(Math.random() * allIndices.length)];
}

let currentTrack = getRandomMusicTrackIndex(-1);
let currentReligion = '';
let currentBookName = '';

// Audio State
let chapScrollTimeout = null;
let voiceScrollTimeout = null;
let visualizerFadeTimeout = null;
let visualizerWorker = null;
let visualizerWorkerReady = false;
let visualizerLogicalWidth = typeof window !== 'undefined' ? window.innerWidth : 300;
let visualizerLogicalHeight = 380;
let visualizerAudioInterval = null;
let waveformCanvasCtx = null;
let visualizerSmoothedVol = 0;
let currentAppSessionPremiumAngle = null;
let isSpeaking = false;
let isPaused = false;
let isGenerating = false;
let currentUtterance = null;
let lastSpeakClick = 0;
// selectedVoice is now initialized further down
let autoNextBook = false;
let autoMode = false;
let seenVersesList = [];
try {
    const savedSeen = localStorage.getItem('seenVersesHistory');
    if (savedSeen) seenVersesList = JSON.parse(savedSeen) || [];
} catch(e) { seenVersesList = []; }
let seenVersesSet = new Set(seenVersesList);

function saveSeenVerses() {
    try {
        localStorage.setItem('seenVersesHistory', JSON.stringify(seenVersesList.slice(-3000)));
        if (!isRestoringState && googleUser && googleUser.sub) {
            triggerCloudSync();
        }
    } catch(e) {}
}

function getVerseSig(v) {
    if (!v) return '';
    return (v.religion || '') + '|' + (v.book || '') + '|' + (v.chapter || '') + '|' + (v.verse || '') + '|' + (v.text || '').substring(0, 35);
}

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
const MIN_CHAR_LIMIT = 20;
const maxCharLimit = 250;
let darkModeStr = localStorage.getItem('darkModeEnabled');
let darkModeEnabled = darkModeStr === null ? true : darkModeStr === 'true';
const religions = ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'];

const dataUrls = {
    Christianity: ['./data/bible.json?v=21'],
    Islam: ['./data/quran_v2.json?v=21', './data/hadiths_v2.json?v=21'],
    Hinduism: ['./data/gita.json?v=22', './data/hindu_books.json?v=22'],
    Judaism: ['./data/sefaria.json?v=21'],
    Sikhism: ['./data/gurbani.json?v=21'],
    Buddhism: ['./data/buddhism.json?v=21'],
    Philosophy: ['./data/philosophy.json?v=21']
};
let loadedReligions = new Set();
// Settings
let ttsAnnounceSource = false;
let ttsRandomVoice = false;

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

let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        } catch (e) {}
    }
    return audioCtx;
}

let musicSourceNode = null;
let musicHighpassFilter = null;
function setupMusicAudioProcessing() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        if (!musicSourceNode && audio) {
            musicSourceNode = ctx.createMediaElementSource(audio);
            musicHighpassFilter = ctx.createBiquadFilter();
            musicHighpassFilter.type = 'highpass';
            musicHighpassFilter.frequency.value = 130; // Cleanly cuts out sub-130Hz frequencies causing device vibration
            musicHighpassFilter.Q.value = 0.7;
            musicSourceNode.connect(musicHighpassFilter);
            musicHighpassFilter.connect(ctx.destination);
        }
    } catch (e) {
        // Direct audio element fallback
    }
}

function safePlayAudio(audioEl) {
    if (!audioEl) return Promise.resolve();
    try {
        setupMusicAudioProcessing();
        const p = audioEl.play();
        if (p && typeof p.then === 'function') {
            return p;
        }
        return Promise.resolve();
    } catch (e) {
        return Promise.resolve();
    }
}

let audioAnalyser = null;
let waveformAnimFrame = null;
let unlockTriggered = false;

// Random Ad scheduling (every 4th to 6th verse)
let adGapBag = [];
function getNextAdGap() {
    if (adGapBag.length === 0) {
        adGapBag = [3, 4, 5]; // 3=4th card, 4=5th card, 5=6th card
        for (let i = adGapBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [adGapBag[i], adGapBag[j]] = [adGapBag[j], adGapBag[i]];
        }
    }
    return adGapBag.pop();
}

let versesSinceLastAd = 0;
let nextAdGap = getNextAdGap();

function unlockAudio() {
    if (unlockTriggered) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    
    // Play a silent oscillator to force iOS WebKit to fully unlock the audio engine
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(0);
        osc.stop(ctx.currentTime + 0.01);
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
    const ctx = getAudioCtx();
    if (!ctx) return null;
    try {
        const len = Math.floor(ctx.sampleRate * 0.015); // 15ms
        noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
            output[i] = Math.random() * 2 - 1; // Pure white noise
        }
    } catch (e) {
        noiseBuffer = null;
    }
    return noiseBuffer;
}

function playScrollSound() {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state === 'suspended') return;
    try {
        const buffer = getNoiseBuffer();
        if (!buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        
        // Lowpass filter makes it a dull mechanical plastic "click" rather than harsh static
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.002);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.014);
        gainNode.gain.setValueAtTime(0, ctx.currentTime + 0.015);
        
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        source.start(ctx.currentTime);
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
    initVisualizerWorker();
    checkForAppUpdates();
    updateUserUI();
    switchProfile(getActiveProfileId());
    applyAutoSpeed(selectedVoice);
    applyRandomPremiumAngle();
    try {
        addSelectionListeners();

        const darkToggle = document.getElementById('dark-mode-toggle');
        updateDarkModeIcon(darkModeEnabled);
        if (darkToggle) {
            darkToggle.addEventListener('click', () => {
                suppressFlash(() => {
                darkModeEnabled = !darkModeEnabled;
                localStorage.setItem('darkModeEnabled', darkModeEnabled);
                updateDarkModeIcon(darkModeEnabled);
                if (darkModeEnabled) {
                    document.body.setAttribute('data-theme', 'dark');
                } else {
                    document.body.removeAttribute('data-theme');
                }
                updateVisualizerThemeCache();
                });
            });
        }
        if (darkModeEnabled) {
            document.body.setAttribute('data-theme', 'dark');
        }

        audio = document.getElementById('audio');
        let initialVol = 0.4;
        let savedVol = localStorage.getItem('musicVolume');
        if (savedVol !== null && savedVol !== '1' && savedVol !== '1.0' && savedVol !== '0.5' && savedVol !== '0.6') {
            initialVol = parseFloat(savedVol);
            if (isNaN(initialVol)) initialVol = 0.4;
        } else {
            initialVol = 0.4;
        }
        if (audio) {
            audio.volume = initialVol;
        }
        localStorage.setItem('musicVolume', initialVol.toString());
        
        let volumeSlider = document.getElementById('music-volume-slider');
        if (volumeSlider) {
            volumeSlider.value = initialVol;
            const pct = Math.round(initialVol * 100);
            volumeSlider.setAttribute('data-tooltip', 'Music Volume (' + pct + '%): Adjust the background music volume.');
            volumeSlider.title = pct + '%';
        }

        // Random track on every app launch / reload
        currentTrack = getRandomMusicTrackIndex(-1);
        if (audio && musicTracks[currentTrack]) {
            audio.src = musicTracks[currentTrack];
            audio.addEventListener('ended', nextTrack);
        }

        let musicEnabled = localStorage.getItem('musicEnabled');
        if (musicEnabled === null) musicEnabled = 'true'; // Default on
        
        const musicBtn = document.getElementById('music-toggle');
        if (musicEnabled === 'true' && musicBtn) {
            safePlayAudio(audio).then(() => {
                musicBtn.classList.add('active');
            }).catch(e => {
                const playOnInteract = () => {
                    if (localStorage.getItem('musicEnabled') !== 'false') {
                        safePlayAudio(audio).then(() => {
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

        // Pause music when app is backgrounded / user switches apps, resume on return
        let wasMusicPlayingBeforeBackground = false;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (audio && !audio.paused) {
                    wasMusicPlayingBeforeBackground = true;
                    audio.pause();
                }
                if (isSpeaking && !isPaused) {
                    stopAudio(true);
                }
            } else {
                const mEnabled = localStorage.getItem('musicEnabled') !== 'false';
                if (wasMusicPlayingBeforeBackground && mEnabled) {
                    wasMusicPlayingBeforeBackground = false;
                    if (audio) safePlayAudio(audio).catch(() => {});
                }
                if (googleUser && googleUser.sub && typeof loadUserDataFromFirestore === 'function') {
                    loadUserDataFromFirestore(googleUser.sub);
                }
            }
        });

        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
                if (!isActive) {
                    if (audio && !audio.paused) {
                        wasMusicPlayingBeforeBackground = true;
                        audio.pause();
                    }
                } else {
                    const mEnabled = localStorage.getItem('musicEnabled') !== 'false';
                    if (wasMusicPlayingBeforeBackground && mEnabled) {
                        wasMusicPlayingBeforeBackground = false;
                        if (audio) safePlayAudio(audio).catch(() => {});
                    }
                    if (googleUser && googleUser.sub && typeof loadUserDataFromFirestore === 'function') {
                        loadUserDataFromFirestore(googleUser.sub);
                    }
                }
            });
        }

        if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
            globalSelectedRels = [...religions];
            localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
            triggerCloudSync();
        }

        setTimeout(() => {
            setupGestures();
            setupWheelListeners();

            function dismissLoadingAndShowApp() {
                const loadingScreen = document.getElementById('loading');
                if (!loadingScreen || loadingScreen.style.display === 'none') {
                    document.body.classList.add('app-ready');
                    appLoaded = true;
                    return;
                }
                // App is ready and static underneath immediately
                document.body.classList.add('app-ready');
                appLoaded = true;

                // Smoothly swipe up the loading screen curtain
                loadingScreen.classList.add('loaded');
                
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 950);
            }

            // Safety Watchdog: Guarantee loading overlay is dismissed even on slowest devices
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading');
                if (loadingScreen && loadingScreen.style.display !== 'none') {
                    console.log('Safety watchdog dismissing loading overlay');
                    dismissLoadingAndShowApp();
                }
            }, 3000);

            // Load data and show loading overlay until verses and layout are fully ready and responsive
            loadSelectedData().then(async () => {
                initializeVerseFeed();
                goTo('verse-feed');
                // Ensure browser finishes layout and initial DOM painting
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                dismissLoadingAndShowApp();
            }).catch(async err => {
                console.error("Data load error:", err);
                initializeVerseFeed();
                goTo('verse-feed');
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                dismissLoadingAndShowApp();
            });
        }, 10);


    } catch (error) {
        console.error('Initialization error:', error);
    }
}
let lastAppliedStatusBarTheme = true;
function updateDarkModeIcon(isDark) {
    if (lastAppliedStatusBarTheme !== isDark && window.AppSigner && typeof window.AppSigner.setStatusBarTheme === 'function') {
        lastAppliedStatusBarTheme = isDark;
        try { window.AppSigner.setStatusBarTheme(Boolean(isDark)); } catch (e) {}
    }
    const btn = document.getElementById('dark-mode-toggle');
    if (!btn) return;
    if (isDark) {
        btn.innerHTML = '<svg id="dark-mode-icon-svg" style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    } else {
        btn.innerHTML = '<svg id="dark-mode-icon-svg" style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    }
}
let lastSwipeTime = 0;

let touchStartTarget = null;

function setupGestures() {
    document.addEventListener('touchstart', e => {
        if (e.changedTouches && e.changedTouches[0]) {
            touchStartTarget = e.target;
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }
    }, { passive: true });
    document.addEventListener('touchend', e => {
        if (e.changedTouches && e.changedTouches[0]) {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleGesture();
        }
    }, { passive: true });
    const feedStage = document.getElementById('feed-stage');
    feedStage.addEventListener('click', (e) => {
        if (!appLoaded) return;
        if (Date.now() - lastSwipeTime < 500) return; // Prevent phantom clicks after a swipe
        
        if (e.target.closest('.bookmark-btn') || e.target.closest('.speak-btn') || e.target.closest('.card-peek-left') || e.target.closest('.card-peek-right')) return;
        const width = window.innerWidth;
        const clickX = e.clientX;
        
        const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
        if (!isFeed) return;
        
        // 30% Left side: Prev Verse only
        if (clickX < width * 0.3) {
            prevCard();
            return;
        }
        // 30% Right side: Next Verse only
        if (clickX > width * 0.7) {
            nextCard();
            return;
        }

        // Middle 40% area: Select verse if clicked on card, else deselect
        const cardClicked = e.target.closest('.verse-card.card-center');
        if (cardClicked) {
            const currentVerse = getVerseAtIndex(currentVerseIndex.general);
            if (currentVerse) {
                selectVerse({ ...currentVerse, isManual: true }, 'feed', null);
            }
        } else {
            deselectVerse();
        }
    });
}
function handleGesture() {
    if (!appLoaded) return;
    const activeModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (activeModal) return;
    if (touchStartTarget && touchStartTarget.closest && (touchStartTarget.closest('.modal-overlay') || touchStartTarget.closest('[id*="wheel"]'))) return;

    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        lastSwipeTime = Date.now();
        if (diffX > 0) {
            if (isFeed) {
                prevCard();
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

let voiceDownloadToastTimeout = null;
function showVoiceInstallingToast(msg = "Installing voice...", percent = null) {
    const toast = document.getElementById('global-toast');
    const msgEl = document.getElementById('toast-message');
    const actionBtn = document.getElementById('toast-action-btn');
    const progressEl = document.getElementById('toast-progress');
    if (!toast || !msgEl) return;
    
    msgEl.textContent = msg;
    if (actionBtn) actionBtn.style.display = 'none';
    
    if (progressEl) {
        if (typeof percent === 'number') {
            progressEl.style.transition = 'transform 0.2s ease-out';
            const frac = Math.max(0, Math.min(1, percent / 100));
            progressEl.style.transform = `scaleX(${frac})`;
        } else {
            progressEl.style.transition = 'none';
            progressEl.style.transform = 'scaleX(0)';
            requestAnimationFrame(() => {
                progressEl.style.transition = 'transform 2500ms cubic-bezier(0.1, 0.5, 0.1, 1)';
                progressEl.style.transform = 'scaleX(0.9)';
            });
        }
    }
    
    toast.classList.add('show');
    clearTimeout(toastHideTimeout);
    clearTimeout(voiceDownloadToastTimeout);
    
    if (percent !== null && percent >= 100) {
        if (progressEl) {
            progressEl.style.transition = 'transform 0.15s ease-out';
            progressEl.style.transform = 'scaleX(1)';
        }
        voiceDownloadToastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            if (progressEl) {
                setTimeout(() => {
                    progressEl.style.transition = 'none';
                    progressEl.style.transform = 'scaleX(0)';
                }, 200);
            }
        }, 500);
    }
}

function hideVoiceToast() {
    const toast = document.getElementById('global-toast');
    if (toast) toast.classList.remove('show');
    clearTimeout(voiceDownloadToastTimeout);
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
            const isInstalled = localStorage.getItem('piper_voice_installed_' + voiceId);
            const wasmBase = new URL('libs/piper/', window.location.href).href;
            const newSession = await tts.TtsSession.create({
                voiceId: voiceId,
                wasmPaths: {
                    onnxWasm: wasmBase,
                    piperData: wasmBase + "piper_phonemize.data",
                    piperWasm: wasmBase + "piper_phonemize.wasm"
                },
                progress: (p) => {
                    if (p && p.total && p.loaded) {
                        const pct = Math.round((p.loaded / p.total) * 100);
                        if (!isInstalled) {
                            showVoiceInstallingToast("Installing voice...", pct);
                        }
                    }
                }
            });
            localStorage.setItem('piper_voice_installed_' + voiceId, 'true');
            hideVoiceToast();
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
    if (!isPremiumUser) {
        const slider = document.getElementById('music-volume-slider');
        if (slider && audio) {
            slider.value = audio.volume;
        }
        openPremiumModal();
        return;
    }
    const slider = document.getElementById('music-volume-slider');
    const audioEl = document.getElementById('audio');
    if (slider && audioEl) {
        const val = parseFloat(slider.value);
        audioEl.volume = val;
        localStorage.setItem('musicVolume', slider.value);
        const pct = Math.round(val * 100);
        slider.setAttribute('data-tooltip', 'Music Volume (' + pct + '%): Adjust the background music volume.');
        slider.title = pct + '%';
        triggerCloudSync();
    }
}

function toggleTTSSource() {
    if (!isPremiumUser) {
        openPremiumModal();
        return;
    }
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    ttsAnnounceSource = !ttsAnnounceSource;
    localStorage.setItem('ttsAnnounceSource', ttsAnnounceSource);
    updateTogglesUI();
}

function toggleTTSRandom() {
    if (!isPremiumUser) {
        openPremiumModal();
        return;
    }
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    ttsRandomVoice = !ttsRandomVoice;
    localStorage.setItem('ttsRandomVoice', ttsRandomVoice);
    updateTogglesUI();
}

function updateTogglesUI() {
    const srcBtn = document.getElementById('tts-source-toggle');
    const rndBtn = document.getElementById('tts-random-toggle');
    const allowPremiumToggles = isPremiumUser && (typeof getActiveProfileId === 'function' ? getActiveProfileId() !== 'guest' : false);
    if (srcBtn) {
        if (ttsAnnounceSource && allowPremiumToggles) srcBtn.classList.add('active');
        else srcBtn.classList.remove('active');
        
        srcBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 9.5 C7 6 9 3 12 3 C15 3 17 6 17 9.5 C17 13 15 16 12 16 H11 C11 19 13 21 15 21 V23.5 C10 23.5 7 20 7 9.5 Z" /></svg>';
    }
    if (rndBtn) {
        if (ttsRandomVoice && allowPremiumToggles) rndBtn.classList.add('active');
        else rndBtn.classList.remove('active');
    }
}



// --- Audio Handling Functions ---
let currentGenerationId = 0;
let audioChunkQueue = [];
let playingQueueIndex = 0;

function stopAudio(preserveAutoMode = false, keepVisualizer = false, isTransitioning = false) {
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
    audioChunkQueue = [];
    playingQueueIndex = 0;
    currentAudioBuffer = null;
    currentAudioPausedAt = 0;
    
    if (!isTransitioning) {
        isSpeaking = false;
        isPaused = false;
        isGenerating = false;
        isQueueGenerating = false;
        if (!preserveAutoMode) {
            autoMode = false;
            autoNextBook = false;
        }
        if (!keepVisualizer && !preserveAutoMode && !autoMode && !autoNextBook) {
            stopWaveformVisualizer(true);
        }
        updateSpeakIcons();
        const btn = document.getElementById('speak-general');
        if (btn) btn.classList.remove('loading');
    }
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
    // Stop any current audio with transition flag so UI remains in continuous generating/playing state
    stopAudio(true, true, true);
    // NOW capture the new generationId (after stop bumped it)
    const generationId = currentGenerationId;

    // Clean text for TTS pronunciation
    text = text.replace(/son\(s\)/gi, 'sons')
               .replace(/god's/gi, 'gods')
               .replace(/god 's/gi, 'gods')
               .replace(/\(l\d+\)/gi, '')
               .replace(/\[l\d+\]/gi, '')
               .replace(/-/g, ' ');

    // Immediately enter generating state with opacity pulse animation on play button
    isGenerating = true;
    isSpeaking = true;
    isPaused = false;
    currentAudioContextType = context;
    updateSpeakButton('speak-general');

    // Load the right voice
    if (ttsRandomVoice) {
        const available = voicesList.filter(v => v.value !== lastRandomVoiceId);
        const pool = available.length > 0 ? available : voicesList;
        const randomVoice = pool[Math.floor(Math.random() * pool.length)].value;
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
        isGenerating = false;
        isSpeaking = false;
        updateSpeakButton('speak-general');
        return;
    }

    // Check if still valid after async initPiper
    if (generationId !== currentGenerationId) {
        isGenerating = false;
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

    // Convert all-caps words (like GOD, LORD, ALLAH, HEAVEN) to Titlecase so phonemizer reads them as words instead of spelling out acronym letters (e.g. G-O-D)
    sanitizedText = sanitizedText.replace(/\b[A-Z]{2,}\b/g, (match) => {
        return match.charAt(0) + match.slice(1).toLowerCase();
    });

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
            const wasAutoMode = autoMode;
            const currentContext = currentAudioContextType;
            const isAutoContinuing = (currentContext === 'feed' && wasAutoMode) ||
                                     (currentContext === 'book' && autoNextBook) ||
                                     (currentContext === 'saved' && wasAutoMode) ||
                                     (currentContext === 'search' && wasAutoMode);

            if (!isAutoContinuing) {
                isSpeaking = false;
                updateSpeakButton('speak-general');
                stopWaveformVisualizer(true);
            }

            clearTimeout(autoNextTimeout);
            autoNextTimeout = setTimeout(() => {
                if (currentContext === 'feed' && wasAutoMode) nextCard(true);
                else if (currentContext === 'book' && autoNextBook) advanceBookVerse();
                else if (currentContext === 'saved' && wasAutoMode) advanceSavedVerse();
                else if (currentContext === 'search' && wasAutoMode) advanceSearchVerse();
                else {
                    if (!isSpeaking) stopWaveformVisualizer(true);
                }
            }, 400);
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
    }, 20);
}

async function processAudioQueue(chunks, generationId, fallbackTTS) {
    let hasStartedPlayback = false;

    for (let i = 0; i < chunks.length; i++) {
        if (generationId !== currentGenerationId) break;
        
        // Yield cleanly to browser animation frame loop to ensure 60fps rendering
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 8)));
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
            
            // Immediate Pipelined Playback: Start playing chunk 0 instantly while subsequent chunks synthesize in background
            if (!hasStartedPlayback && audioChunkQueue.length > 0 && generationId === currentGenerationId) {
                hasStartedPlayback = true;
                isGenerating = false;
                const btn = document.getElementById('speak-general');
                if (btn) btn.classList.remove('loading');
                updateSpeakButton('speak-general');
                startWaveformVisualizer();
                startAudioPlayback(0, generationId);
            }
            
        } catch (err) {
            console.error("Piper generation error on chunk " + i, err);
            if (i === 0 && generationId === currentGenerationId) fallbackTTS();
            break;
        }
    }
    
    isQueueGenerating = false;
    if (generationId === currentGenerationId && !hasStartedPlayback && audioChunkQueue.length > 0) {
        hasStartedPlayback = true;
        isGenerating = false;
        const btn = document.getElementById('speak-general');
        if (btn) btn.classList.remove('loading');
        updateSpeakButton('speak-general');
        startWaveformVisualizer();
        startAudioPlayback(0, generationId);
    }
}

function startAudioPlayback(offset, generationId) {
    if (generationId !== currentGenerationId) return;
    const btn = document.getElementById('speak-general');
    if (btn) btn.classList.remove('loading');

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(e => console.error("AudioContext resume failed:", e));
    }

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
            isPaused = false;
            isGenerating = false;
            currentAudioPausedAt = 0;

            const isAutoContinuing = (currentAudioContextType === 'feed' && autoMode) ||
                                     (currentAudioContextType === 'book' && autoNextBook) ||
                                     (currentAudioContextType === 'saved' && autoMode) ||
                                     (currentAudioContextType === 'search' && autoMode);

            if (!isAutoContinuing) {
                isSpeaking = false;
                updateSpeakButton('speak-general');
                stopWaveformVisualizer(true);
            }

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
                } else {
                    if (!isSpeaking) stopWaveformVisualizer(true);
                }
            }, 300);
            return;
        }
    }

    currentAudioBuffer = audioChunkQueue[playingQueueIndex];
    if (!currentAudioBuffer || isPaused) return;

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
    const btn = document.getElementById(buttonId || 'speak-general');
    if (!btn) return;
    if (isGenerating) {
        btn.classList.add('generating');
        btn.classList.add('loading');
        // During generation/buffering, show the Pause icon with breathing pulse animation so there is zero icon flipping
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" class="speak-svg"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    } else {
        btn.classList.remove('generating');
        btn.classList.remove('loading');
        btn.innerHTML = (isSpeaking && !isPaused) ? '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" class="speak-svg"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" class="speak-svg"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
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
            }
            stopWaveformVisualizer(true);
            updateSpeakIcons();
            return;
        } else {
            isPaused = false;
            startWaveformVisualizer();
            startAudioPlayback(0, currentGenerationId);
            updateSpeakIcons();
            return;
        }
    } else {
        if (isBookSection) {
            const info = globalVerseMap[bookVoiceCurrentVerse];
            if (info) {
                playBookVerse(bookVoiceCurrentVerse);
                autoNextBook = true;
            }
        } else if (isFeedSection) {
            const curVerse = getVerseAtIndex(currentVerseIndex.general);
            if (curVerse) {
                if (curVerse.isAd) {
                    if (!curVerse.funnyLine) {
                        curVerse.funnyLine = getNextFunnyLine();
                    }
                    const adSpokenText = "VerseFeed Premium. " + curVerse.funnyLine;
                    playText(adSpokenText, 'feed');
                    autoMode = true;
                } else {
                    let spokenText = curVerse.spoken_text || curVerse.text || '';
                    if (spokenText) {
                        if (!spokenText.endsWith('.')) spokenText += '.';
                        if (ttsAnnounceSource && curVerse.book) {
                            spokenText += '. ' + curVerse.book + '.';
                        }
                        playText(spokenText, 'feed');
                        autoMode = true;
                    }
                }
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
            if (responses[1]) processHinduBooks(responses[1]);
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
    await loadActiveRankings();
    if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
        globalSelectedRels = [...religions];
    }
    await Promise.all(globalSelectedRels.map(rel => loadReligionData(rel)));
    
    // Defer unselected background loading so initial feed animations and gestures are silky smooth
    setTimeout(() => {
        loadUnselectedDataInBackground();
    }, 2500);
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
    let book = (v.book || '').trim();
    
    // Remove redundant Part/Chapter strings from book name
    book = book.replace(/\s+(part|chapter|section)\s+\d+$/i, '').trim();

    // Standardize & shorten source format
    const bLower = book.toLowerCase();
    if (bLower.includes('quran')) {
        book = 'Quran';
    } else if (bLower.includes('dhammapada')) {
        book = 'Dhammapada';
    } else if (bLower.includes('guru granth') || bLower.includes('granth sahib')) {
        book = 'Granth Sahib';
    } else if (bLower.includes('bhagavad gita') || bLower.includes('gita')) {
        book = 'Bhagavad Gita';
    } else if (bLower.includes('philosophical')) {
        book = book.replace(/philosophical/i, 'Phil.');
    } else if (bLower.includes('psychological')) {
        book = book.replace(/psychological/i, 'Psych.');
    }
    
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
            chap = parseInt(match[0], 10);
        } else {
            chap = v.chapter.replace(/^(part|chapter|sec|section)\s*/i, '').trim();
        }
    }
    
    let verse = '';
    if (v.verseNum !== undefined && v.verseNum !== null && v.verseNum !== '') {
        verse = v.verseNum;
    } else if (v.verseIndex !== undefined && v.verseIndex !== null && v.verseIndex !== '') {
        verse = v.verseIndex;
    } else if (typeof v.verse === 'number') {
        verse = v.verse;
    } else if (typeof v.verse === 'string') {
        const match = v.verse.match(/\d+/);
        if (match) {
            verse = parseInt(match[0], 10);
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
    
    // Standardize all forms of Islamic honorifics strictly to (pbuh) with single brackets
    text = text.replace(/[\(\[\{]*\s*(?:may\s+)?peace\s+(?:be\s+)?upon\s+(?:him|them|her)\s*[\)\]\}]*/gi, ' (pbuh) ')
               .replace(/[\(\[\{]*\s*pbuh\s*[\)\]\}]*/gi, ' (pbuh) ')
               .replace(/[\(\[\{]*\s*s\.a\.w\.?\s*[\)\]\}]*/gi, ' (pbuh) ')
               .replace(/[\(\[\{]*\s*saw\s*[\)\]\}]*/gi, ' (pbuh) ')
               .replace(/ﷺ|\ufdfa/g, ' (pbuh) ');
    
    text = text.replace(/[{}[\]\@#*_+=~0-9]/g, '')
               .replace(/\s+/g, ' ')
               .replace(/^[\s\-.,:;]+/, '')
               .trim();

    // Standardize all double/nested brackets to single (pbuh)
    while (text.includes('((pbuh))')) text = text.replace('((pbuh))', '(pbuh)');
    while (text.includes('( (pbuh) )')) text = text.replace('( (pbuh) )', '(pbuh)');
    while (text.includes('(( pbuh ))')) text = text.replace('(( pbuh ))', '(pbuh)');
    while (text.includes('((pbuh)')) text = text.replace('((pbuh)', '(pbuh)');
    while (text.includes('(pbuh))')) text = text.replace('(pbuh))', '(pbuh)');
    text = text.replace(/\(\s*pbuh\s*\)/gi, '(pbuh)').replace(/\s+/g, ' ').trim();

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
                    christianVerses.push({
                        id: `christianity_${bookName}_${chapNum}_${verseNum}`.toLowerCase().replace(/ /g, '_'),
                        book: bookName,
                        chapter: chapNum,
                        verse: verseNum,
                        text: cleanText(verses[verseNum]),
                        religion: 'Christianity'
                    });
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
            const cleaned = cleanText(v.translation);
            verses[v.id] = cleaned;
            islamVerses.push({
                id: `islam_quran_${surah.id}_${v.id}`.toLowerCase().replace(/ /g, '_'),
                book: 'Quran',
                chapter: surah.id,
                verse: v.id,
                text: cleaned,
                religion: 'Islam'
            });
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
                "this dispatched hadith has been",
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

            const cleanedText = cleanText(text);
            hadithCollections[collection].chapters[chapter][verseStr] = cleanedText;
            islamVerses.push({
                id: `islam_${collection}_${chapter}_${verseStr}`.toLowerCase().replace(/ /g, '_'),
                book: collection,
                chapter: chapter,
                verse: verseStr,
                text: cleanedText,
                religion: 'Islam'
            });
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
            id: `hinduism_bhagavad_gita_${currentChapter}_${verseInChapter}`.toLowerCase().replace(/ /g, '_'),
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
                        id: `hinduism_${bookName}_${chapName}_${vKey}`.toLowerCase().replace(/ /g, '_'),
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
                            id: `judaism_${bookName}_${chap}_${verseNum}`.toLowerCase().replace(/ /g, '_'),
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
                        id: `sikhism_${book.name}_${chapNameStr}_${k}`.toLowerCase().replace(/ /g, '_'),
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
                        'footnote', 'indemnity', 'trademark', 'heavens of the middle ages',
                        'illuminated manuscript', 'astrologia', 'liber floridus'
                    ];
                    if (badPhrases.some(phrase => lowerText.includes(phrase))) return;
                    
                    verses.push({
                        id: `buddhism_${bookName}_${chapNum}_${verseNum}`.toLowerCase().replace(/ /g, '_'),
                        book: 'Dhammapada',
                        chapter: chapNum,
                        verse: verseNum,
                        text: cleanText(rawText),
                        religion: 'Buddhism'
                    });
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
    suppressFlash(() => {
        applyRandomPremiumAngle();
        if (!isPremiumUser || !globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
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
    });
}
async function toggleGlobalReligion(rel) {
    if (!isPremiumUser) {
        openPremiumModal();
        return;
    }
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
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
    versesSinceLastAd = 0;
    nextAdGap = getNextAdGap();
    const stage = document.getElementById('feed-stage');
    if (stage) stage.innerHTML = '';
    initializeVerseFeed();
}
function pushVersesWithAdCheck(newBatch) {
    for (let verse of newBatch) {
        if (!isPremiumUser) {
            if (versesSinceLastAd === nextAdGap) {
                verseBatches.general.push({ isAd: true });
                versesSinceLastAd = 0;
                nextAdGap = getNextAdGap();
            }
            versesSinceLastAd++;
        }
        verseBatches.general.push(verse);
    }
}
function initializeVerseFeed(forceRefresh) {
    const stage = document.getElementById('feed-stage');
    const emptyState = document.getElementById('feed-empty-state');

    if (!globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
        globalSelectedRels = [...religions];
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    if (!forceRefresh && verseBatches.general.length > 0) {
        if (stage && !stage.querySelector('.card-center')) {
            renderFeedCard(currentVerseIndex.general);
        }
        return;
    }
    const newBatch = generateBatch('general', []);
    if (newBatch.length === 0) {
        return;
    }
    pushVersesWithAdCheck(newBatch);
    renderFeedCard(0);
}
const negativeWords = ['smite', 'kill', 'destroy', 'wrath', 'blood', 'sword', 'curse', 'hell', 'fire', 'punish', 'death', 'die', 'slay', 'enemy', 'evil', 'wicked', 'sin', 'weep', 'wail', 'gnash', 'vengeance', 'terror', 'fear', 'plague', 'famine', 'perish', 'slaughter', 'condemn', 'abomination', 'hate', 'despise', 'anger', 'fury', 'saliva', 'spit', 'vomit', 'urine', 'defecate', 'excrement', 'menstruation', 'menses', 'camel', 'slave', 'sexual', 'intercourse', 'naked', 'breast', 'suck', 'suckling', 'semen', 'sperm', 'genital'];
const positiveWords = ['love', 'peace', 'joy', 'hope', 'faith', 'light', 'grace', 'mercy', 'compassion', 'kindness', 'bless', 'heal', 'forgive', 'comfort', 'strength', 'wisdom', 'truth', 'spirit', 'heart', 'soul', 'heaven', 'glory', 'righteous', 'holy', 'pure', 'good', 'rejoice', 'glad', 'praise', 'worship', 'save', 'deliver', 'guide', 'protect'];
const filteredPoolCache = {};

function getFilteredPool(rel) {
    if (filteredPoolCache[rel]) return filteredPoolCache[rel];
    const fullPool = religionVerses[rel] || [];
    if (fullPool.length === 0) return [];
    
    // Check if activeRankings has scored verses for this religion
    const hasRankings = Object.keys(activeRankings).length > 0;
    if (hasRankings) {
        const rankedPool = fullPool.filter(v => {
            if (!v || !v.id || !v.text) return false;
            const textLen = v.text.trim().length;
            if (textLen < MIN_CHAR_LIMIT || textLen > maxCharLimit) return false;
            return activeRankings[v.id] !== undefined && activeRankings[v.id] >= 70;
        });
        if (rankedPool.length > 0) {
            filteredPoolCache[rel] = rankedPool;
            return rankedPool;
        }
    }
    
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
    
    const shuffledForExtra = [...rels].sort(() => Math.random() - 0.5);
    shuffledForExtra.forEach((r, i) => {
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
        
        let availablePool = pool.filter(v => v && v.text && !seenVersesSet.has(getVerseSig(v)));
        if (availablePool.length === 0) {
            const poolSigs = new Set(pool.map(v => getVerseSig(v)));
            seenVersesList = seenVersesList.filter(sig => !poolSigs.has(sig));
            seenVersesSet = new Set(seenVersesList);
            saveSeenVerses();
            availablePool = pool;
        }
        
        const selectedVerse = availablePool[Math.floor(Math.random() * availablePool.length)];
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
        pushVersesWithAdCheck(newBatch);
    }
    return verseBatches.general[index];
}

const premiumFunnyLines = [
    "Buy Premium and the developer will literally do a happy dance.",
    "Spiritual peace, but make it 100% ad-free.",
    "Ads in your zen zone? Absolutely not. Go Premium.",
    "One small tap for you, one giant leap for an indie developer.",
    "Elevate your vibe to total ad-free tranquility.",
    "Feed your soul, not the advertising algorithms.",
    "Unlock all natural HD voices and relax forever.",
    "Upgrade to Premium: Zero ads, maximum cozy vibes.",
    "Your daily dose of wisdom, now with zero commercial breaks.",
    "Give your eyes a vacation with clean, ad-free reading.",
    "Treat yourself to Premium like you treat yourself to snacks.",
    "Legend says Premium makes holy verses sound 10x more majestic.",
    "Keep the spiritual flow going with zero interruptions.",
    "Uninterrupted peace of mind is just one tap away.",
    "Support indie apps and keep the good vibes flowing.",
    "Less distraction, more reflection. Get Premium.",
    "Keep your feed pure, clean, and beautifully minimal.",
    "Your attention is sacred. Protect it with VerseFeed Premium.",
    "All HD voices, unlimited folders, and pure tranquility.",
    "A cozy, distraction-free sanctuary for your daily verses."
];

let funnyLinesBag = [];
function getNextFunnyLine() {
    if (funnyLinesBag.length === 0) {
        funnyLinesBag = [...premiumFunnyLines];
        // Shuffle bag
        for (let i = funnyLinesBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [funnyLinesBag[i], funnyLinesBag[j]] = [funnyLinesBag[j], funnyLinesBag[i]];
        }
    }
    return funnyLinesBag.pop();
}

function createFeedCardDOM(verse, initialPositionClass = 'card-center') {
    const card = document.createElement('div');
    card.classList.add('verse-card', initialPositionClass);

    if (verse.isAd) {
        // Persist ad data on this specific verse object so scrolling back retains the same ad!
        if (!verse.nativeAdData && !verse.funnyLine) {
            let nativeAdData = null;
            try {
                if (window.AppSigner && typeof window.AppSigner.getNextNativeAd === 'function') {
                    const res = window.AppSigner.getNextNativeAd();
                    if (res) {
                        const parsed = JSON.parse(res);
                        if (parsed && parsed.hasAd) {
                            nativeAdData = parsed;
                        }
                    }
                }
            } catch(e) {}

            if (nativeAdData) {
                verse.nativeAdData = nativeAdData;
            } else {
                verse.funnyLine = getNextFunnyLine();
            }
        }

        card.classList.add('premium-ad-card');

        // Middle Content Container
        const textEl = document.createElement('div');
        textEl.classList.add('verse-text');
        textEl.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; flex-grow: 1; padding: 12px 6px; width: 100%; box-sizing: border-box;';
        
        if (verse.nativeAdData) {
            const nativeAd = verse.nativeAdData;

            let iconHtml = '';
            if (nativeAd.icon) {
                iconHtml = `<img src="${nativeAd.icon}" alt="App Icon" style="width: 54px; height: 54px; border-radius: 16px; object-fit: cover; box-shadow: 0 6px 16px rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); flex-shrink: 0;" />`;
            }

            let ratingHtml = '';
            if (nativeAd.rating) {
                const rounded = Math.round(Number(nativeAd.rating) || 5);
                const stars = '★'.repeat(Math.min(5, Math.max(1, rounded)));
                ratingHtml = `<span style="font-size: 0.85rem; color: #f59e0b; letter-spacing: 1.5px; margin-right: 6px;">${stars}</span> <span style="font-size: 0.82rem; opacity: 0.7; color: var(--text-color); font-weight: 600;">${Number(nativeAd.rating).toFixed(1)}</span>`;
            } else if (nativeAd.advertiser) {
                ratingHtml = `<span style="font-size: 0.82rem; opacity: 0.7; color: var(--text-color); font-weight: 500;">${nativeAd.advertiser}</span>`;
            }

            const ctaText = nativeAd.callToAction || 'Install Now';

            textEl.innerHTML = `
                <div id="native-ad-interactive-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; width: 100%; max-width: 92%; background: rgba(255, 255, 255, 0.035); border: 1px solid var(--glass-border); border-radius: 22px; padding: 22px 18px; box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08), 0 8px 28px rgba(0, 0, 0, 0.25); cursor: pointer; transition: transform 0.2s ease;">
                    <div style="display: flex; align-items: center; gap: 14px; text-align: left; width: 100%; justify-content: center;">
                        ${iconHtml}
                        <div style="display: flex; flex-direction: column; min-width: 0;">
                            <div style="font-size: clamp(1.15rem, 4vw, 1.45rem); font-weight: 700; color: var(--text-color); font-family: var(--font-main); line-height: 1.3;">
                                ${nativeAd.headline || ''}
                            </div>
                            ${ratingHtml ? `<div style="margin-top: 4px; display: flex; align-items: center;">${ratingHtml}</div>` : ''}
                        </div>
                    </div>
                    ${nativeAd.body ? `
                        <div style="font-size: clamp(0.95rem, 3.2vw, 1.12rem); font-weight: 400; color: var(--text-color); opacity: 0.88; font-family: var(--font-main); line-height: 1.55; text-align: center; margin-top: 2px;">
                            ${nativeAd.body}
                        </div>
                    ` : ''}
                    <div style="margin-top: 4px;">
                        <div style="display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, rgba(212, 175, 55, 0.22), rgba(212, 175, 55, 0.08)); color: var(--text-color); border: 1px solid rgba(212, 175, 55, 0.45); padding: 11px 28px; border-radius: 22px; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.8px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); text-transform: uppercase;">
                            <span>${ctaText}</span>
                            <span style="font-size: 0.9rem; color: #f59e0b;">↗</span>
                        </div>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const adBox = card.querySelector('#native-ad-interactive-card');
                if (adBox) {
                    adBox.onclick = (e) => {
                        if (e) e.stopPropagation();
                        if (window.AppSigner && typeof window.AppSigner.performNativeAdClick === 'function') {
                            window.AppSigner.performNativeAdClick();
                        }
                    };
                }
            }, 0);
        } else {
            textEl.innerHTML = `<div style="font-size: clamp(1.2rem, 4.2vw, 1.65rem); font-weight: 600; color: var(--text-color); font-family: var(--font-main); line-height: 1.5;">${verse.funnyLine}</div>`;
        }
        card.appendChild(textEl);

        // Bottom-Middle Remove Ads Button (Direct child of card, centered at bottom)
        const footer = document.createElement('div');
        footer.style.cssText = 'width: 100%; display: flex; justify-content: center; padding-bottom: 8px; flex-shrink: 0;';
        const removeAdsBtn = document.createElement('button');
        removeAdsBtn.style.cssText = 'background: var(--card-bg); color: var(--text-color); border: 1px solid var(--glass-border); padding: 12px 36px; border-radius: 24px; font-size: 0.95rem; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: var(--glass-shadow); transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); letter-spacing: 0.3px;';
        removeAdsBtn.textContent = 'Remove Ads';
        removeAdsBtn.onclick = () => openPremiumModal();
        footer.appendChild(removeAdsBtn);
        card.appendChild(footer);

        return card;
    }

    const textEl = document.createElement('div');
    textEl.classList.add('verse-text');
    textEl.textContent = verse.text || '';

    const footer = document.createElement('div');
    footer.classList.add('card-footer');
    const refEl = document.createElement('div');
    refEl.classList.add('verse-ref');
    refEl.textContent = formatVerseRef(verse) || '';
    footer.appendChild(refEl);

    card.appendChild(textEl);
    card.appendChild(footer);
    return card;
}

let seenDwellTimeout = null;
function trackVerseDwellTime(verse) {
    clearTimeout(seenDwellTimeout);
    if (!verse || verse.isAd || !verse.text) return;
    const sig = getVerseSig(verse);
    if (!sig) return;
    seenDwellTimeout = setTimeout(() => {
        if (!seenVersesSet.has(sig)) {
            seenVersesSet.add(sig);
            seenVersesList.push(sig);
            if (seenVersesList.length > 3000) {
                const removed = seenVersesList.shift();
                seenVersesSet.delete(removed);
            }
            saveSeenVerses();
        }
    }, 2000);
}

function renderFeedCard(index, direction = 'none') {
    const stage = document.getElementById('feed-stage');
    if (!stage) return;
    const verse = getVerseAtIndex(index);
    if (!verse) return;

    trackVerseDwellTime(verse);

    let card = null;
    if (direction === 'next') card = createFeedCardDOM(verse, 'card-right');
    else if (direction === 'prev') card = createFeedCardDOM(verse, 'card-left');
    else card = createFeedCardDOM(verse, 'card-center');

    card.id = 'feed-card-' + index;

    if (direction !== 'none') {
        const oldCard = stage.querySelector('.card-center');
        card.classList.add('animating');
        stage.appendChild(card);
        void card.offsetWidth;
        if (oldCard) {
            oldCard.classList.add('animating');
            oldCard.classList.remove('card-center');
            if (direction === 'next') oldCard.classList.add('card-left');
            else oldCard.classList.add('card-right');
            setTimeout(() => oldCard.remove(), 400);
        }
        card.classList.remove('card-right', 'card-left');
        card.classList.add('card-center');
        setTimeout(() => {
            if (card) card.classList.remove('animating');
        }, 400);
    } else {
        stage.innerHTML = '';
        card.classList.remove('animating');
        card.classList.add('card-center');
        stage.appendChild(card);
    }
}

function nextCard(isAuto = false) {
    const wasPlaying = (isSpeaking && !isPaused) || isGenerating;
    if (wasPlaying || isAuto) {
        stopAudio(true, true, true);
        isGenerating = true;
        isSpeaking = true;
        isPaused = false;
        updateSpeakButton('speak-general');
    } else {
        stopAudio();
    }

    currentVerseIndex.general++;
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    renderFeedCard(currentVerseIndex.general, 'next');

    const newVerse = getVerseAtIndex(currentVerseIndex.general);

    if (isAuto || wasPlaying) {
        if (newVerse && !newVerse.isAd) {
            let spokenText = newVerse.spoken_text || newVerse.text;
            if (!spokenText.endsWith('.')) spokenText += '.';
            
            if (ttsAnnounceSource) {
                spokenText += '. ' + newVerse.book + '.';
            }

            setTimeout(() => {
                playText(spokenText, 'feed');
                autoMode = true;
            }, 300); // Allow card animation to finish
        } else if (newVerse && newVerse.isAd) {
            if (!newVerse.funnyLine) {
                newVerse.funnyLine = getNextFunnyLine();
            }
            const adSpokenText = "VerseFeed Premium. " + newVerse.funnyLine;
            setTimeout(() => {
                playText(adSpokenText, 'feed');
                autoMode = true;
            }, 300);
        }
    } else {
        deselectVerse();
    }
}

function prevCard() {
    const wasPlaying = (isSpeaking && !isPaused) || isGenerating;
    if (wasPlaying) {
        stopAudio(true, true, true);
        isGenerating = true;
        isSpeaking = true;
        isPaused = false;
        updateSpeakButton('speak-general');
    } else {
        stopAudio();
    }

    if (currentVerseIndex.general > 0) {
        currentVerseIndex.general--;
        if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
        renderFeedCard(currentVerseIndex.general, 'prev');
        const newVerse = getVerseAtIndex(currentVerseIndex.general);
        if (wasPlaying && newVerse && !newVerse.isAd) {
            let spokenText = newVerse.spoken_text || newVerse.text;
            if (!spokenText.endsWith('.')) spokenText += '.';
            
            if (ttsAnnounceSource) {
                spokenText += '. ' + newVerse.book + '.';
            }

            playText(spokenText, 'feed');
            autoMode = true;
        } else if (wasPlaying && newVerse && newVerse.isAd) {
            if (!newVerse.funnyLine) {
                newVerse.funnyLine = getNextFunnyLine();
            }
            const adSpokenText = "VerseFeed Premium. " + newVerse.funnyLine;
            playText(adSpokenText, 'feed');
            autoMode = true;
        } else {
            deselectVerse();
        }
    }
}
function goTo(section) {
    if (!appLoaded && section !== 'verse-feed') return;
    const targetEl = document.getElementById(section);
    if (!targetEl) return;
    const isAlreadyActive = targetEl.classList.contains('active-section');
    if (!isAlreadyActive) {
        if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    }

    if (selectedVerse && selectedVerse.type === 'book') {
        lastSelectedBookVerse = selectedVerse;
    }
    
    stopAudio();
    suppressFlash(() => {
    if (!isAlreadyActive) {
        document.querySelectorAll('.app-section').forEach(s => {
            if (s !== targetEl) s.classList.remove('active-section');
        });
        targetEl.classList.add('active-section');
    }

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
        if (isAlreadyActive && selectedSavedAlbum) {
            selectedSavedAlbum = null;
        } else if (!isAlreadyActive) {
            selectedSavedAlbum = null;
        }
        deselectVerse();
        showSavedVerses(true);
    }
    if (section === 'settings') {
        const n = document.getElementById('nav-settings'); if (n) n.classList.add('active-nav');
        const t = document.querySelector('.tab-btn[data-target="settings"]'); if (t) t.classList.add('active');
        deselectVerse();
        buildSettings();
        renderVoiceSettings();
        updateTogglesUI();
    }
    }); // end suppressFlash
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
        if (name && name !== 'Default' && name !== 'All') {
            if (!albums[name]) albums[name] = [];
        }
    });
    savedVerses.forEach((v, i) => {
        if (!v) return;
        if (v.album && v.album !== 'Default' && v.album !== 'All') {
            if (!albums[v.album]) albums[v.album] = [];
            albums[v.album].push({v, i});
        }
    });
    return albums;
}

function transformAddBtnToDustbin(isDustbin) {
    const addBtn = document.getElementById('add-folder-btn');
    if (!addBtn) return;
    if (isDustbin) {
        addBtn.classList.add('is-dustbin-target');
        addBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" style="width: 32px; height: 32px; margin: auto;" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    } else {
        addBtn.classList.remove('is-dustbin-target', 'dustbin-hover');
        addBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" style="width: 32px; height: 32px; opacity: 0.5; margin: auto;" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    }
}

function showSavedVerses(rebuildFolders = true) {
    suppressFlash(() => _showSavedVersesImpl(rebuildFolders));
}
function _showSavedVersesImpl(rebuildFolders = true) {
    const list = document.getElementById('saved-list');
    if (!list) return;
    
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
        // Build in a fragment first, then swap atomically to avoid blank-frame flash
        const frag = document.createDocumentFragment();
        const grid = document.createElement('div');
        grid.className = 'folders-grid-container';
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
        addFolder.id = 'add-folder-btn';
        addFolder.style.width = 'calc(33.333% - 8px)';
        addFolder.style.aspectRatio = '1';
        addFolder.style.height = 'auto';
        addFolder.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" style="width: 32px; height: 32px; opacity: 0.5; margin: auto;" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        addFolder.onclick = () => {
            if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
            openCreateBookmarkModal();
        };
        grid.appendChild(addFolder);
        
        const albumKeys = Object.keys(albums);
        albumKeys.forEach((albumName, folderIdx) => {
            const folder = document.createElement('button');
            folder.className = 'album-square-btn album-folder-btn';
            folder.id = 'album-folder-' + folderIdx;
            folder.dataset.albumName = albumName;
            folder.dataset.albumIndex = folderIdx;
            folder.style.width = 'calc(33.333% - 8px)';
            folder.style.aspectRatio = '1';
            folder.style.height = 'auto';
            folder.style.position = 'relative';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'album-name';
            nameSpan.textContent = albumName;
            folder.appendChild(nameSpan);
            
            const isSelected = (selectedVerse && selectedVerse.type === 'folder' && selectedVerse.name === albumName) || selectedSavedAlbum === albumName;
            if (isSelected) {
                folder.classList.add('active');
            }
            
            folder.onclick = (e) => {
                if (e) e.stopPropagation();
                if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(err){}
                if (selectedSavedAlbum === albumName) {
                    selectedSavedAlbum = null;
                    selectedVerse = { type: 'folder', name: albumName, elementId: folder.id };
                    deselectVerse();
                    showSavedVerses(true);
                } else {
                    selectedSavedAlbum = albumName;
                    selectVerse({ name: albumName }, 'folder', folder.id, true);
                    showSavedVerses(true);
                }
            };
            
            grid.appendChild(folder);
        });
        frag.appendChild(grid);
        // Atomic swap: replaces all children at once, no blank frame
        foldersContainer.replaceChildren(frag);
    }
    
    // Rebuild verses list using a fragment for atomic swap
    const versesFrag = document.createDocumentFragment();
    // Show folder header bar: If a custom folder is open, show its name (editable); if viewing all, show "All" (static title)
    const header = document.createElement('div');
    header.className = 'selected-folder-header-bar';
    
    const titleWrap = document.createElement('div');
    titleWrap.className = 'folder-title-center-wrap';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'selected-folder-title';
    titleSpan.id = 'selected-folder-title';
    titleSpan.textContent = selectedSavedAlbum || 'All';
    
    titleWrap.appendChild(titleSpan);
    
    if (selectedSavedAlbum && selectedSavedAlbum !== 'All') {
        titleWrap.title = 'Click to rename';
        titleWrap.onclick = (e) => {
            e.stopPropagation();
            startFolderInlineRename(selectedSavedAlbum, header);
        };
    } else {
        titleWrap.style.cursor = 'default';
    }
    
    header.appendChild(titleWrap);

    // Minus button on the right side of the section header under the divider
    if (selectedSavedAlbum && selectedSavedAlbum !== 'All' && selectedSavedAlbum !== 'Default') {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-folder-btn-sleek';
        deleteBtn.setAttribute('aria-label', `Delete folder ${selectedSavedAlbum}`);
        deleteBtn.setAttribute('title', 'Delete Folder');
        deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(err){}
            handleFolderDelete(e, selectedSavedAlbum);
        };
        header.appendChild(deleteBtn);
    }

    versesFrag.appendChild(header);
    
    let versesToRender = validVerses;
    if (selectedSavedAlbum && selectedSavedAlbum !== 'All') {
        versesToRender = albums[selectedSavedAlbum] || [];
    }
    
    window.currentSavedVersesRendered = versesToRender;
    
    if (versesToRender.length > 0) {
        renderVersesList(versesToRender, versesFrag);
    } else {
        if (selectedSavedAlbum) {
            const placeholder = document.createElement('div');
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.height = '30vh';
            placeholder.style.opacity = '0.6';
            placeholder.style.fontSize = '1.1rem';
            placeholder.innerText = 'No verses in this folder';
            versesFrag.appendChild(placeholder);
        }
    }
    
    // Atomic swap: replaces all children at once, no blank frame
    versesContainer.replaceChildren(versesFrag);
    
    if (selectedVerse) {
        highlightSelectedVerseElement(true);
    }
}

function startFolderInlineRename(oldName, headerEl) {
    if (!headerEl) return;
    
    headerEl.innerHTML = '';
    headerEl.className = 'selected-folder-header-bar editing-mode';
    
    const titleWrap = document.createElement('div');
    titleWrap.className = 'folder-title-center-wrap';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = (typeof isPremiumUser !== 'undefined' && isPremiumUser) ? 30 : 10;
    input.className = 'selected-folder-input-underline';
    input.value = oldName;
    titleWrap.appendChild(input);
    headerEl.appendChild(titleWrap);
    
    let finished = false;
    
    const finishRename = () => {
        if (finished) return;
        finished = true;
        const newRaw = input.value.trim();
        const newName = sanitizeFolderName(newRaw);
        if (newName && newName !== oldName) {
            const idx = createdAlbums.indexOf(oldName);
            if (idx > -1) {
                createdAlbums[idx] = newName;
            } else if (!createdAlbums.includes(newName)) {
                createdAlbums.push(newName);
            }
            localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
            
            savedVerses.forEach(s => {
                if (s && s.album === oldName) s.album = newName;
            });
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            
            selectedSavedAlbum = newName;
            if (selectedVerse && selectedVerse.type === 'folder') {
                selectedVerse.name = newName;
            }
            triggerCloudSync();
            showSavedVerses(true);
            showToast('Folder renamed to "' + newName + '"');
        } else {
            showSavedVerses(false);
        }
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            finished = true;
            showSavedVerses(false);
        }
    };
    
    input.onblur = finishRename;
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
}

function renderVersesList(versesArray, listElement) {
    versesArray.forEach(({v, i}) => {
        const container = document.createElement('div');
        container.classList.add('saved-verse-container');
        const div = document.createElement('div');
        div.id = 'saved-verse-' + i;
        div.classList.add('saved-verse');
        div.style.borderRadius = '16px';
        
        const text = document.createElement('div');
        text.classList.add('verse-text');
        let displayVerse = v.text;
        displayVerse = displayVerse.replace(/<span class='author-attr'>.*?<\/span>/gm, '');
        displayVerse = displayVerse.replace(/<[^>]*>?/gm, '');
        text.innerText = displayVerse;
        
        const footer = document.createElement('div');
        footer.classList.add('saved-verse-footer');
        footer.style.display = 'flex';
        footer.style.justifyContent = 'space-between';
        footer.style.alignItems = 'center';
        footer.style.marginTop = '12px';
        
        const ref = document.createElement('div');
        ref.classList.add('verse-ref');
        ref.innerText = formatVerseRef(v);
        
        footer.appendChild(ref);
        div.appendChild(text);
        div.appendChild(footer);
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
            const actions = createActionIconsElement(selectedVerse, 'saved');
            if (actions) footer.appendChild(actions);
        }

        div.onclick = (e) => {
            selectVerse(v, 'saved', div.id, false);
        };

        listElement.appendChild(container);
    });
}

const topicAudiobooks = {
    'Philosophy': [
        { title: "The Daily Stoic", author: "Ryan Holiday", asin: "0735211736" },
        { title: "Atomic Habits", author: "James Clear", asin: "0735211299" },
        { title: "Man's Search for Meaning", author: "Viktor E. Frankl", asin: "0807014273" },
        { title: "The Obstacle Is the Way", author: "Ryan Holiday", asin: "1591846358" },
        { title: "Letters from a Stoic", author: "Seneca", asin: "0140442103" },
        { title: "The Courage to Be Disliked", author: "Ichiro Kishimi", asin: "1501197274" },
        { title: "Ego Is the Enemy", author: "Ryan Holiday", asin: "1591847818" },
        { title: "Meditations", author: "Marcus Aurelius", asin: "0140449336" },
        { title: "Discourses and Selected Writings", author: "Epictetus", asin: "0140449468" },
        { title: "Deep Work", author: "Cal Newport", asin: "1455586692" },
        { title: "The 48 Laws of Power", author: "Robert Greene", asin: "0140280197" },
        { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", asin: "0374533555" },
        { title: "The Antidote", author: "Oliver Burkeman", asin: "0865478015" },
        { title: "A Guide to the Good Life", author: "William B. Irvine", asin: "0195374617" }
    ],
    'Buddhism': [
        { title: "The Power of Now", author: "Eckhart Tolle", asin: "1577314808" },
        { title: "The Miracle of Mindfulness", author: "Thich Nhat Hanh", asin: "0807012394" },
        { title: "Zen Mind, Beginner's Mind", author: "Shunryu Suzuki", asin: "1590308492" },
        { title: "Radical Acceptance", author: "Tara Brach", asin: "0553380990" },
        { title: "Wherever You Go, There You Are", author: "Jon Kabat-Zinn", asin: "1401307787" },
        { title: "No Mud, No Lotus", author: "Thich Nhat Hanh", asin: "1937006859" },
        { title: "Peace Is Every Step", author: "Thich Nhat Hanh", asin: "0553351397" },
        { title: "When Things Fall Apart", author: "Pema Chodron", asin: "1611803438" },
        { title: "The Art of Happiness", author: "Dalai Lama", asin: "1573221112" },
        { title: "The Heart of the Buddha's Teaching", author: "Thich Nhat Hanh", asin: "0767903692" },
        { title: "Eight Mindful Steps to Happiness", author: "Bhante Henepola Gunaratana", asin: "0861711769" },
        { title: "Start Where You Are", author: "Pema Chodron", asin: "1570628394" }
    ],
    'Islam': [
        { title: "Secrets of Divine Love", author: "A. Helwa", asin: "1734231203" },
        { title: "Reclaim Your Heart", author: "Yasmin Mogahed", asin: "0990387682" },
        { title: "Revive Your Heart", author: "Nouman Ali Khan", asin: "1847741014" },
        { title: "Don't Be Sad", author: "Dr. Aid al-Qarni", asin: "9960850447" },
        { title: "In the Footsteps of the Prophet", author: "Tariq Ramadan", asin: "0195374765" },
        { title: "Healing and Peace in Islam", author: "A. Helwa", asin: "173423122X" },
        { title: "Muhammad: His Life Based on the Earliest Sources", author: "Martin Lings", asin: "1594771537" },
        { title: "Purification of the Heart", author: "Hamza Yusuf", asin: "193334315X" },
        { title: "The Sealed Nectar", author: "Safiur Rahman Mubarakpuri", asin: "B094459MSS" },
        { title: "Timeless Seeds of Advice", author: "B.B. Abdulla", asin: "1916186205" },
        { title: "Prayers of the Pious", author: "Omar Suleiman", asin: "1847741294" }
    ],
    'Christianity': [
        { title: "Mere Christianity", author: "C.S. Lewis", asin: "0060652926" },
        { title: "The Purpose Driven Life", author: "Rick Warren", asin: "031033750X" },
        { title: "The Practice of the Presence of God", author: "Brother Lawrence", asin: "1603865610" },
        { title: "The Screwtape Letters", author: "C.S. Lewis", asin: "0060652934" },
        { title: "Celebration of Discipline", author: "Richard J. Foster", asin: "0062803883" },
        { title: "The Great Divorce", author: "C.S. Lewis", asin: "0060652950" },
        { title: "The Cost of Discipleship", author: "Dietrich Bonhoeffer", asin: "0684815001" },
        { title: "Orthodoxy", author: "G.K. Chesterton", asin: "0801032547" },
        { title: "The Imitation of Christ", author: "Thomas a Kempis", asin: "0486431851" },
        { title: "Life Together", author: "Dietrich Bonhoeffer", asin: "0060608528" },
        { title: "Crazy Love", author: "Francis Chan", asin: "1434705943" }
    ],
    'Hinduism': [
        { title: "Autobiography of a Yogi", author: "Paramahansa Yogananda", asin: "0876120834" },
        { title: "Inner Engineering: A Yogi's Guide to Joy", author: "Sadhguru", asin: "0143428845" },
        { title: "The Journey Home", author: "Radhanath Swami", asin: "1601090565" },
        { title: "Karma: A Yogi's Guide to Crafting Your Destiny", author: "Sadhguru", asin: "0593232014" },
        { title: "Living with the Himalayan Masters", author: "Swami Rama", asin: "0893891568" },
        { title: "Apprenticed to a Himalayan Master", author: "Sri M", asin: "8186219934" },
        { title: "Death: An Inside Story", author: "Sadhguru", asin: "0143450832" },
        { title: "Raja Yoga", author: "Swami Vivekananda", asin: "091120623X" },
        { title: "Jnana Yoga", author: "Swami Vivekananda", asin: "0911206213" },
        { title: "The Gospel of Sri Ramakrishna", author: "Mahendranath Gupta", asin: "0911206019" }
    ],
    'Judaism': [
        { title: "When Bad Things Happen to Good People", author: "Harold S. Kushner", asin: "1400034728" },
        { title: "The Sabbath", author: "Abraham Joshua Heschel", asin: "0374529752" },
        { title: "To Pray as a Jew", author: "Hayim Halevy Donin", asin: "0465086330" },
        { title: "Man's Search for Meaning", author: "Viktor E. Frankl", asin: "0807014273" },
        { title: "God in Search of Man", author: "Abraham Joshua Heschel", asin: "0374513317" },
        { title: "Man Is Not Alone", author: "Abraham Joshua Heschel", asin: "0374513929" },
        { title: "The Lonely Man of Faith", author: "Joseph B. Soloveitchik", asin: "0385483147" },
        { title: "This Is My God", author: "Herman Wouk", asin: "0316955140" }
    ],
    'Sikhism': [
        { title: "The Singing Guru", author: "Kamla K. Kapur", asin: "8184006126" },
        { title: "The Sikhs", author: "Patwant Singh", asin: "0385502060" },
        { title: "Sikhism: A Very Short Introduction", author: "Eleanor Nesbitt", asin: "0198745578" },
        { title: "A History of the Sikhs", author: "Khushwant Singh", asin: "0195673085" },
        { title: "The Japji: The Sikh Morning Prayer", author: "Khushwant Singh", asin: "0140292438" },
        { title: "Guru Nanak and the Sikh Religion", author: "W.H. McLeod", asin: "0195637356" }
    ]
};

function getDailyAudiobook(rel) {
    const list = topicAudiobooks[rel] || topicAudiobooks['Philosophy'];
    if (!list || list.length === 0) return null;
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const index = dayOfYear % list.length;
    return list[index];
}

function openAudibleAudiobook(title, author) {
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    const query = encodeURIComponent(`${title} ${author}`);
    const affiliateUrl = `https://www.amazon.com/s?k=${query}&tag=versefeed-20`;
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        window.open(affiliateUrl, '_system');
    } else {
        window.open(affiliateUrl, '_blank', 'noopener,noreferrer');
    }
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
        
        html += `<div class="saved-verse-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;"><div class="verse-ref" style="font-size: 0.8em; opacity: 0.6; text-align: left;">${refStr}</div></div>`;
        
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

    // Render Daily Curated Audiobook at Top (Hidden if user is premium)
    const isUserPremium = (typeof isPremiumUser !== 'undefined' && isPremiumUser) || localStorage.getItem('isPremiumUser') === 'true';
    const dailyBook = getDailyAudiobook(rel);
    if (dailyBook && !isUserPremium) {
        const adBtn = document.createElement('button');
        adBtn.className = 'audiobook-minimal-btn';
        adBtn.innerHTML = `
            <span class="audiobook-ad-tag">Ad</span>
            <span class="audiobook-min-title">${dailyBook.title}</span>
            <span class="audiobook-min-author">by ${dailyBook.author}</span>
        `;
        adBtn.onclick = () => openAudibleAudiobook(dailyBook.title, dailyBook.author);
        list.appendChild(adBtn);
    }

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
    // Mouse wheel scrolling for home feed verse cards disabled per user request
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
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
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
    if (!isPremiumUser) {
        openPremiumModal();
        return;
    }
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    currentTrack = getRandomMusicTrackIndex(currentTrack);
    localStorage.setItem('currentMusicTrack', currentTrack);
    triggerCloudSync();
    audio.src = musicTracks[currentTrack];
    audio.load();
    if (document.getElementById('music-toggle').classList.contains('active')) {
        audio.play().catch(e => console.log("Audio play error:", e));
    }
}
function prevTrack() {
    if (!isPremiumUser) {
        openPremiumModal();
        return;
    }
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    currentTrack = (currentTrack - 1 + musicTracks.length) % musicTracks.length;
    localStorage.setItem('currentMusicTrack', currentTrack);
    triggerCloudSync();
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
    if (!isPremiumUser && val !== 'en_GB-alan-medium') {
        openPremiumModal();
        const wheel = document.getElementById('voice-scroll-wheel');
        if (wheel) {
            const alanDiv = Array.from(wheel.querySelectorAll('.voice-wheel-item')).find(d => d.dataset.val === 'en_GB-alan-medium');
            if (alanDiv) {
                const targetScroll = alanDiv.offsetTop + alanDiv.offsetHeight / 2 - wheel.clientHeight / 2;
                wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
            }
        }
        return;
    }

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
    if (!wheel || wheel.clientHeight === 0) return;
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
    openModal(document.getElementById('credits-modal'));
}

function closeCreditsModal(event) {
    if (event && event.type === 'click' && event.target !== event.currentTarget) return;
    closeModal(document.getElementById('credits-modal'));
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

let toastHideTimeout = null;

function isToastAllowed(msg) {
    if (!msg) return false;
    return true; // Allow all toasts so the user always gets clear visual feedback
}

function showToast(msg, duration = 2200) {
    if (!isToastAllowed(msg)) return;

    const toast = document.getElementById('global-toast');
    const msgEl = document.getElementById('toast-message');
    const actionBtn = document.getElementById('toast-action-btn');
    const progressEl = document.getElementById('toast-progress');
    if (!toast || !msgEl) return;
    
    msgEl.textContent = msg;
    if (actionBtn) actionBtn.style.display = 'none';
    
    if (progressEl) {
        progressEl.style.transition = 'none';
        progressEl.style.transform = 'scaleX(0)';
        requestAnimationFrame(() => {
            progressEl.style.transition = `transform ${duration}ms linear`;
            progressEl.style.transform = 'scaleX(1)';
        });
    }
    
    toast.classList.add('show');
    clearTimeout(toastHideTimeout);
    toastHideTimeout = setTimeout(() => {
        toast.classList.remove('show');
        if (progressEl) {
            setTimeout(() => {
                progressEl.style.transition = 'none';
                progressEl.style.transform = 'scaleX(0)';
            }, 200);
        }
    }, duration);
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

function initVisualizerWorker() {
    resizeWaveformCanvas();
}

function updateVisualizerThemeCache() {}

function resizeWaveformCanvas() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    visualizerLogicalWidth = window.innerWidth;
    visualizerLogicalHeight = 380;
    const targetWidth = Math.floor(visualizerLogicalWidth * dpr);
    const targetHeight = Math.floor(visualizerLogicalHeight * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = visualizerLogicalWidth + 'px';
        canvas.style.height = visualizerLogicalHeight + 'px';
    }
    waveformCanvasCtx = canvas.getContext('2d', { alpha: true });
    if (waveformCanvasCtx) {
        waveformCanvasCtx.setTransform(1, 0, 0, 1, 0, 0);
        waveformCanvasCtx.scale(dpr, dpr);
    }
}
window.addEventListener('resize', resizeWaveformCanvas, { passive: true });

function startWaveformVisualizer() {
    clearTimeout(visualizerFadeTimeout);
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    resizeWaveformCanvas();
    canvas.style.display = 'block';
    canvas.classList.add('active');

    if (waveformAnimFrame) return;
    const ctx = waveformCanvasCtx || canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    
    const bufferLength = (audioAnalyser && audioAnalyser.frequencyBinCount) || 64;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        if (!canvas) return;
        const isActive = canvas.classList.contains('active');
        if (!isActive && (!isSpeaking || isPaused)) {
            if (waveformAnimFrame) {
                cancelAnimationFrame(waveformAnimFrame);
                waveformAnimFrame = null;
            }
            if (ctx) ctx.clearRect(0, 0, visualizerLogicalWidth, visualizerLogicalHeight);
            canvas.style.display = 'none';
            return;
        }

        waveformAnimFrame = requestAnimationFrame(draw);

        let sum = 0;
        if (audioAnalyser && isSpeaking && !isPaused) {
            audioAnalyser.getByteFrequencyData(dataArray);
            const len = dataArray.length;
            for (let i = 0; i < len; i++) sum += dataArray[i];
            const avgVolume = sum / len / 255.0;
            visualizerSmoothedVol += (avgVolume - visualizerSmoothedVol) * 0.14;
        } else {
            visualizerSmoothedVol *= 0.88;
        }

        ctx.clearRect(0, 0, visualizerLogicalWidth, visualizerLogicalHeight);

        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const rootStyle = getComputedStyle(document.body);
        const defaultRgb = isDark ? '238, 204, 180' : '48, 40, 34';
        const rgbStr = (rootStyle && rootStyle.getPropertyValue('--visualizer-rgb').trim()) || defaultRgb;

        const time = Date.now() * 0.001;
        const numPoints = Math.max(120, Math.floor(visualizerLogicalWidth / 4));
        const sliceWidth = visualizerLogicalWidth / (numPoints - 1);

        const drawLayer = (speed, frequency, amplitudeBase, audioMult, alpha) => {
            ctx.beginPath();
            ctx.moveTo(0, visualizerLogicalHeight);
            for (let i = 0; i < numPoints; i++) {
                const x = i * sliceWidth;
                const wave1 = Math.sin(x * frequency + time * speed);
                const wave2 = Math.sin(x * frequency * 1.5 - time * speed * 0.8);
                const height = amplitudeBase + (wave1 * 12) + (wave2 * 8) + (visualizerSmoothedVol * audioMult);
                const y = visualizerLogicalHeight - Math.max(4, height);
                ctx.lineTo(x, y);
            }
            ctx.lineTo(visualizerLogicalWidth, visualizerLogicalHeight);
            ctx.closePath();

            const grad = ctx.createLinearGradient(0, visualizerLogicalHeight, 0, visualizerLogicalHeight - 120);
            const layerAlpha = isDark ? Math.min(1.0, alpha * 1.35) : alpha;
            grad.addColorStop(0, `rgba(${rgbStr}, ${layerAlpha})`);
            grad.addColorStop(0.6, `rgba(${rgbStr}, ${layerAlpha * 0.4})`);
            grad.addColorStop(1, `rgba(${rgbStr}, 0.0)`);

            ctx.fillStyle = grad;
            ctx.fill();
        };

        drawLayer(1.5, 0.005, 10, 60, 0.3);
        drawLayer(1.8, 0.007, 15, 80, 0.55);
        drawLayer(2.2, 0.009, 20, 110, 0.85);
    }

    draw();
}

function stopWaveformVisualizer(forceHide = false) {
    const canvas = document.getElementById('waveform-canvas');
    if (canvas) {
        canvas.classList.remove('active');
        clearTimeout(visualizerFadeTimeout);
        visualizerFadeTimeout = setTimeout(() => {
            if (!canvas.classList.contains('active')) {
                if (waveformAnimFrame) {
                    cancelAnimationFrame(waveformAnimFrame);
                    waveformAnimFrame = null;
                }
                if (waveformCanvasCtx) {
                    try { waveformCanvasCtx.clearRect(0, 0, visualizerLogicalWidth, visualizerLogicalHeight); } catch(e) {}
                }
                canvas.style.display = 'none';
            }
        }, 500);
    }
}

function applyRandomPremiumAngle() {
    if (sessionUserPremiumAngle === null) {
        // 60% straight (0deg), 40% angled randomly between -3deg and +3deg
        const isAngled = Math.random() > 0.60;
        if (isAngled) {
            const sign = Math.random() > 0.5 ? 1 : -1;
            const mag = (Math.random() * 1.8 + 1.2); // between 1.2deg and 3.0deg
            sessionUserPremiumAngle = (sign * mag).toFixed(1);
        } else {
            sessionUserPremiumAngle = '0';
        }
    }

    const btn = document.getElementById('user-premium-btn');
    if (btn) {
        btn.style.setProperty('--prem-angle', `${sessionUserPremiumAngle}deg`);
        btn.style.transform = `rotate(${sessionUserPremiumAngle}deg)`;
        btn.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
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
    populateAlbumWheel();
    openModal(modal);
}

function closeAlbumModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('album-modal'));
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
    // Don't deselect verse in book section — keep the verse selected after bookmarking
    const isBookSection = document.getElementById('read-books') && document.getElementById('read-books').classList.contains('active-section');
    if (!isBookSection) {
        deselectVerse();
    }
    if (document.getElementById('saved-verses').classList.contains('active-section')) {
        showSavedVerses(true);
    }
    updatePillUI();
}

function getAlbumWheelItems() { return []; }
function getActiveAlbumWheelItem() { return null; }
function setupAlbumWheelListeners() {}

function populateAlbumWheel() {
    const grid = document.getElementById('album-grid');
    if (!grid) return false;
    
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
        if (existing && existing.album && existing.album !== 'Default' && existing.album !== 'All') {
            currentAlbum = existing.album;
        } else if (pendingBookmarkVerse.album && pendingBookmarkVerse.album !== 'Default' && pendingBookmarkVerse.album !== 'All') {
            currentAlbum = pendingBookmarkVerse.album;
        }
    }

    const albums = new Set();
    createdAlbums.forEach(name => {
        if (name && name !== 'Default' && name !== 'All') albums.add(name);
    });
    savedVerses.forEach(v => {
        if (v && v.album && v.album !== 'Default' && v.album !== 'All') albums.add(v.album);
    });
    
    let albumList = Array.from(albums);
    
    // Exclude currentAlbum if verse is already in that folder
    if (currentAlbum) {
        albumList = albumList.filter(name => name !== currentAlbum);
    }
    
    grid.innerHTML = '';
    
    // Show 'All' option if currently in a custom folder
    if (currentAlbum) {
        const allBtn = document.createElement('button');
        allBtn.className = 'album-create-btn';
        allBtn.style.width = '100%';
        allBtn.style.fontSize = '0.95rem';
        allBtn.innerText = 'All';
        allBtn.onclick = () => saveToAlbum('All');
        grid.appendChild(allBtn);
    }

    albumList.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'album-create-btn';
        btn.style.width = '100%';
        btn.style.fontSize = '0.95rem';
        btn.innerText = name;
        btn.onclick = () => saveToAlbum(name);
        grid.appendChild(btn);
    });
    
    return true;
}

function updateAlbumWheelActiveStyle() {}

function updateSpeakIcons() {
    updateSpeakButton('speak-general');
}

/* --- Create Bookmark / Album Modal --- */
function openCreateBookmarkModal() {
    if (createdAlbums.length >= 3 && !isPremiumUser) {
        showToast("Upgrade to Premium for unlimited folders");
        openPremiumModal();
        return;
    }
    const modal = document.getElementById('create-bookmark-modal');
    if (!modal) return;
    const input = document.getElementById('create-album-name');
    if (input) input.value = '';
    openModal(modal);
    setTimeout(() => { if (input) input.focus(); }, 50);
}

function closeCreateBookmarkModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('create-bookmark-modal'));
}

let lastDeletedItem = null;
let undoTimeout = null;

function showDeleteToast(msg, undoCallback) {
    const toast = document.getElementById('global-toast');
    const msgEl = document.getElementById('toast-message');
    const actionBtn = document.getElementById('toast-action-btn');
    const progressEl = document.getElementById('toast-progress');
    if (!toast || !msgEl) return;
    
    msgEl.textContent = msg;
    if (actionBtn) {
        actionBtn.style.display = 'inline-block';
        actionBtn.innerText = 'Undo';
        actionBtn.onclick = () => {
            clearTimeout(undoTimeout);
            toast.classList.remove('show');
            if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
            if (undoCallback) undoCallback();
        };
    }
    
    const duration = 4000;
    if (progressEl) {
        progressEl.style.transition = 'none';
        progressEl.style.transform = 'scaleX(0)';
        requestAnimationFrame(() => {
            progressEl.style.transition = `transform ${duration}ms linear`;
            progressEl.style.transform = 'scaleX(1)';
        });
    }
    
    toast.classList.add('show');
    clearTimeout(toastHideTimeout);
    clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
        toast.classList.remove('show');
        if (progressEl) {
            setTimeout(() => {
                progressEl.style.transition = 'none';
                progressEl.style.transform = 'scaleX(0)';
            }, 200);
        }
        lastDeletedItem = null;
    }, duration);
}

function toRomanNumeral(num, max = 20) {
    if (num < 1 || num > max) return '';
    const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
        while (num >= vals[i]) {
            result += syms[i];
            num -= vals[i];
        }
    }
    return result;
}

function sanitizeFolderName(raw) {
    const maxNum = (typeof isPremiumUser !== 'undefined' && isPremiumUser) ? 49 : 9;
    const maxChars = (typeof isPremiumUser !== 'undefined' && isPremiumUser) ? 30 : 10;
    
    // Convert numbers to Roman numerals (1-9 for free, 1-49 for premium)
    let name = raw.replace(/\d+/g, (match) => {
        const num = parseInt(match, 10);
        if (num < 1 || num > maxNum) return '';
        return toRomanNumeral(num, maxNum);
    });
    // Trim and limit to max characters
    name = name.trim().substring(0, maxChars);
    return name;
}

function submitCreateAlbum() {
    const input = document.getElementById('create-album-name');
    if (!input) return;
    let name = sanitizeFolderName(input.value);
    if (!name) return;
    
    // Premium Lock: Max 3 albums for free users
    if (createdAlbums.length >= 3 && !isPremiumUser) {
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
    showToast('Folder "' + name + '" created');
}


function handleFolderDelete(e, albumName) {
    if (e) e.stopPropagation();
    const name = albumName || (selectedVerse && selectedVerse.name) || selectedSavedAlbum;
    if (!name) return;
    
    const idx = createdAlbums.indexOf(name);
    const deletedVerses = savedVerses.filter(s => s && s.album === name);
    
    if (idx > -1) {
        createdAlbums.splice(idx, 1);
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
    }
    savedVerses = savedVerses.filter(s => s && s.album !== name);
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    selectedSavedAlbum = null;
    deselectVerse();
    showSavedVerses(true);
    
    showDeleteToast('Folder deleted', () => {
        if (!createdAlbums.includes(name)) {
            createdAlbums.splice(idx > -1 ? idx : createdAlbums.length, 0, name);
            localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
        }
        deletedVerses.forEach(v => savedVerses.unshift(v));
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        showSavedVerses(true);
        showToast('Folder restored');
    });
}

function handlePillMoveFolder(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    openAlbumModal(selectedVerse);
}

function handlePillDeleteVerse(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(err){}
    
    const index = savedVerses.findIndex(s => {
        if (s.id && selectedVerse.id) return s.id === selectedVerse.id;
        return s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse);
    });
    if (index > -1) {
        const deletedVerse = { ...savedVerses[index] };
        const deletedIndex = index;
        savedVerses.splice(index, 1);
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        if (isSpeaking && !isPaused) stopAudio(true);
        deselectVerse();
        showSavedVerses(false);
        
        showDeleteToast('Verse deleted', () => {
            savedVerses.splice(deletedIndex, 0, deletedVerse);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            showSavedVerses(false);
            showToast('Verse restored');
        });
    }
}

function deselectVerse() {
    if (!isSpeaking || isPaused) {
        stopWaveformVisualizer(true);
    }
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

function getVerseFolderState(verseObj) {
    if (!verseObj) return { isSaved: false, label: '', album: null };
    const v = verseObj.v || verseObj;
    const index = savedVerses.findIndex(s => {
        if (s.id && v.id) return s.id === v.id;
        return s.book === v.book && String(s.chapter) === String(v.chapter) && String(s.verse) === String(v.verse);
    });
    if (index === -1) {
        return { isSaved: false, label: '', album: null };
    }
    const album = savedVerses[index].album || 'All';
    if (album === 'All' || album === 'Default') {
        return { isSaved: true, label: 'A', album: 'All' };
    }
    const customFolders = createdAlbums.filter(n => n && n !== 'Default' && n !== 'All');
    const fIdx = customFolders.indexOf(album);
    const roman = fIdx > -1 ? toRomanNumeral(fIdx + 1) : 'I';
    return { isSaved: true, label: roman || 'I', album: album };
}

function createActionIconsElement(verseObj, type) {
    const isFolder = type === 'folder' || (verseObj && verseObj.type === 'folder');
    if (isFolder) return null;

    const container = document.createElement('div');
    container.className = 'verse-actions';

    const vState = getVerseFolderState(verseObj);
    let cycleIconHtml = '';
    if (!vState.isSaved) {
        cycleIconHtml = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
    } else {
        cycleIconHtml = `<span class="folder-cycle-badge">${vState.label}</span>`;
    }

    if (type === 'saved') {
        const isInsideCustomFolder = selectedSavedAlbum && selectedSavedAlbum !== 'All';
        const cycleBtnHtml = isInsideCustomFolder ? '' : `
            <button class="va-btn va-cycle-btn" onclick="cycleVerseFolder(selectedVerse, event)" aria-label="Change Folder" title="Change Folder">
                ${cycleIconHtml}
            </button>
        `;
        container.innerHTML = `
            ${cycleBtnHtml}
            <button class="va-btn" onclick="handlePillShare(event)" aria-label="Share" title="Share">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
            </button>
            <button class="va-btn" onclick="handlePillDeleteVerse(event)" aria-label="Delete Bookmark" title="Delete Bookmark">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
        `;
        return container;
    }

    // Default for Feed, Book, Search
    container.innerHTML = `
        <button class="va-btn va-cycle-btn" onclick="cycleVerseFolder(selectedVerse, event)" aria-label="Save or Change Folder" title="Save / Change Folder">
            ${cycleIconHtml}
        </button>
        <button class="va-btn" onclick="handlePillShare(event)" aria-label="Share" title="Share">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
        </button>
    `;
    return container;
}

function deactivatePillUI() {
    document.querySelectorAll('.verse-card .verse-actions, .saved-verse .verse-actions, .saved-verse-container .verse-actions, .book-verse .verse-actions, .album-square-btn .verse-actions').forEach(el => el.remove());
    document.querySelectorAll('.selected-verse-active').forEach(el => el.classList.remove('selected-verse-active'));
}

function highlightSelectedVerseElement(active) {
    deactivatePillUI();
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
                
                const footer = el.querySelector('.saved-verse-footer') || el;
                const actions = createActionIconsElement(selectedVerse, selectedVerse.type);
                if (actions) footer.appendChild(actions);
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
                const actions = createActionIconsElement(selectedVerse, 'book');
                if (actions) el.appendChild(actions);
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
                if (f) {
                    f.style.color = 'var(--bg-grad-1)';
                    const actions = createActionIconsElement(selectedVerse, 'feed');
                    if (actions) f.appendChild(actions);
                }
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

function updateVerseActions() {
    updateSpeakButton('speak-general');
}

function updatePillUI() {
    updateVerseActions();
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
        if (isSpeaking && !isPaused) return; // Don't deselect while voice is actively playing
        deselectVerse();
        return;
    }

    highlightSelectedVerseElement(false);
    selectedVerse = { ...verseObj, type, elementId };
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    highlightSelectedVerseElement(true);

    // Immediate play on selection ONLY if actively playing (isSpeaking is true AND isPaused is false)
    if (isSpeaking && !isPaused && isDifferentVerse && !forceSelect) {
        let isSameAsCurrentlyPlaying = false;
        if (type === 'feed' && verseBatches.general && verseBatches.general[currentVerseIndex.general]) {
            const curPlaying = verseBatches.general[currentVerseIndex.general];
            if (curPlaying.id && verseObj.id && curPlaying.id === verseObj.id) isSameAsCurrentlyPlaying = true;
            else if (curPlaying.text && verseObj.text && curPlaying.text === verseObj.text) isSameAsCurrentlyPlaying = true;
        } else if (type === 'book' && verseObj.globalIndex !== undefined && verseObj.globalIndex === bookVoiceCurrentVerse) {
            isSameAsCurrentlyPlaying = true;
        }

        if (!isSameAsCurrentlyPlaying) {
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
        
        selectedSavedAlbum = null;
        deselectVerse();
        showSavedVerses(true);
        
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
            
            deselectVerse();
            activeSavedVerse = null;
            showSavedVerses(false);
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

    if (isGenerating) {
        console.log("Audio generating, ignoring extra clicks...");
        return;
    }

    if (isSpeaking) {
        const btn = document.getElementById('speak-general');
        if (btn) btn.classList.remove('loading');
        if (!isPaused) {
            isPaused = true;
            if (currentAudioNode) {
                try {
                    currentAudioNode.onended = null;
                    currentAudioNode.stop();
                } catch (err) { }
            }
            stopWaveformVisualizer(true);
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
                    if (currentVerseObj.isAd) {
                        if (!currentVerseObj.funnyLine) {
                            currentVerseObj.funnyLine = getNextFunnyLine();
                        }
                        const adSpokenText = "VerseFeed Premium. " + currentVerseObj.funnyLine;
                        playText(adSpokenText, 'feed');
                        autoMode = true;
                    } else {
                        let spokenText = currentVerseObj.spoken_text || currentVerseObj.text || '';
                        if (spokenText) {
                            if (!spokenText.endsWith('.')) spokenText += '.';
                            if (ttsAnnounceSource && currentVerseObj.book) {
                                spokenText += '. ' + currentVerseObj.book + '.';
                            }
                            playText(spokenText, 'feed');
                            autoMode = true; // Auto advance to next verse
                        }
                    }
                }
            } else if (isBookSection) {
                playBookVerse(bookVoiceCurrentVerse || 0);
                autoNextBook = true;
            }
        }
        updatePillUI();
    }
}

function cycleVerseFolder(verseObj, e) {
    if (e) e.stopPropagation();
    const v = verseObj ? (verseObj.v || verseObj) : (selectedVerse ? (selectedVerse.v || selectedVerse) : getCurrentActiveVerse() || getVerseAtIndex(currentVerseIndex.general));
    if (!v) return;

    if (typeof playScrollSound === 'function') {
        try { playScrollSound(); } catch(err){}
    } else if (typeof playTapSound === 'function') {
        try { playTapSound(); } catch(err){}
    }

    const isSavedSection = (verseObj && verseObj.type === 'saved') || (selectedVerse && selectedVerse.type === 'saved') || (document.getElementById('saved-verses') && document.getElementById('saved-verses').classList.contains('active-section'));

    const customFolders = createdAlbums.filter(n => n && n !== 'Default' && n !== 'All');
    const index = savedVerses.findIndex(s => {
        if (s.id && v.id) return s.id === v.id;
        return s.book === v.book && String(s.chapter) === String(v.chapter) && String(s.verse) === String(v.verse);
    });

    if (index === -1) {
        // Currently unsaved -> Save to 'All'
        const newSaved = {
            book: v.book,
            chapter: v.chapter,
            verse: v.verse,
            text: v.text,
            translation: v.translation || '',
            album: 'All',
            timestamp: Date.now(),
            id: v.id || `${v.book}_${v.chapter}_${v.verse}_${Date.now()}`
        };
        savedVerses.unshift(newSaved);
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        triggerCloudSync();
        showToast('Saved to Bookmarks (All)');
    } else {
        const currentAlbum = savedVerses[index].album || 'All';
        if (currentAlbum === 'All' || currentAlbum === 'Default') {
            if (customFolders.length > 0) {
                // Move to 1st custom folder (Roman I)
                const nextFolder = customFolders[0];
                savedVerses[index].album = nextFolder;
                localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                triggerCloudSync();
                showToast(`Moved to ${nextFolder} (I)`);
            } else {
                if (isSavedSection) {
                    showToast('In Bookmarks (All)');
                } else {
                    // Loop back to unsaved in Feed/Book/Search
                    savedVerses.splice(index, 1);
                    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                    triggerCloudSync();
                    showToast('Bookmark removed');
                }
            }
        } else {
            const curFolderIdx = customFolders.indexOf(currentAlbum);
            if (curFolderIdx > -1 && curFolderIdx + 1 < customFolders.length) {
                // Move to next custom folder (II, III...)
                const nextFolder = customFolders[curFolderIdx + 1];
                savedVerses[index].album = nextFolder;
                localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                triggerCloudSync();
                showToast(`Moved to ${nextFolder} (${toRomanNumeral(curFolderIdx + 2)})`);
            } else {
                if (isSavedSection) {
                    // In Bookmark section: Loop back to 'All'
                    savedVerses[index].album = 'All';
                    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                    triggerCloudSync();
                    showToast('Moved to Bookmarks (All)');
                } else {
                    // In Feed/Book/Search: Loop back to unsaved
                    savedVerses.splice(index, 1);
                    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                    triggerCloudSync();
                    showToast('Bookmark removed');
                }
            }
        }
    }

    if (typeof showSavedVerses === 'function') showSavedVerses(false);
    updatePillUI();
    if (selectedVerse) highlightSelectedVerseElement(true);
}

function handlePillBookmark(e) {
    cycleVerseFolder(selectedVerse, e);
}

function handlePillShare(e) {
    if (e) e.stopPropagation();
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(err){}
    const verseToShare = selectedVerse || getCurrentActiveVerse() || getVerseAtIndex(currentVerseIndex.general);
    if (!verseToShare) return;
    
    if (verseToShare.type === 'folder') {
        const input = document.getElementById('rename-album-input');
        if (input) input.value = verseToShare.name || '';
        const modal = document.getElementById('rename-modal');
        if (modal) {
            openModal(modal);
            if (input) {
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 50);
            }
        }
        return;
    }
    
    generateAndShareImage(verseToShare, verseToShare.elementId);
}

function formatVerseForShare(verseObj) {
    if (!verseObj) return '';
    const text = (verseObj.text || '').replace(/<[^>]*>?/gm, '').trim();
    let ref = formatVerseRef(verseObj);
    ref = ref.replace(/^[\[\(]/, '').replace(/[\]\)]$/, '').replace(/^- /, '').trim();
    return `${text}\n\n${ref}\n\nVerseFeed`;
}

async function shareTextFallback(text) {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
            try {
                await window.Capacitor.Plugins.Share.share({ title: 'VerseFeed', text: text, dialogTitle: 'Share Verse' });
            } catch (shareErr) {
                if (shareErr && (shareErr.message || '').toLowerCase().includes('cancel')) return;
                if (shareErr && (shareErr.message || '').toLowerCase().includes('dismiss')) return;
                throw shareErr;
            }
            return;
        }
        if (navigator.share) {
            await navigator.share({ title: 'VerseFeed', text: text });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showToast('Verse copied');
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Verse copied');
        }
    } catch (e) {
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (msg.includes('cancel') || msg.includes('dismiss') || msg.includes('abort')) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                showToast('Verse copied');
            }
        } catch (e2) {
            showToast('Could not share');
        }
    }
}

function drawVersePosterToCanvas(verseObj, isDark) {
    const canvas = document.createElement('canvas');
    const width = 1080;
    const height = 1080;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Background gradient (clean borderless poster)
    const grad = ctx.createLinearGradient(0, 0, width, height);
    if (isDark) {
        grad.addColorStop(0, '#1F1D1B');
        grad.addColorStop(1, '#141210');
    } else {
        grad.addColorStop(0, '#C8B8A6');
        grad.addColorStop(1, '#A99684');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    
    // Verse Text
    let rawText = verseObj.text || '';
    rawText = rawText.replace(/<span class='author-attr'>.*?<\/span>/gm, '');
    rawText = rawText.replace(/<[^>]*>?/gm, '').trim();
    
    ctx.fillStyle = isDark ? '#f7e7ce' : '#1E1D1B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let fontSize = rawText.length > 200 ? 36 : (rawText.length > 120 ? 44 : (rawText.length > 60 ? 52 : 58));
    ctx.font = `600 ${fontSize}px "Times New Roman", serif`;
    
    const maxWidth = 880;
    const words = rawText.split(' ');
    let lines = [];
    let currentLine = '';
    
    for (let word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    
    const lineHeight = fontSize * 1.48;
    const totalTextHeight = lines.length * lineHeight;
    let startY = (height / 2) - (totalTextHeight / 2) - 40;
    
    lines.forEach((line, idx) => {
        ctx.fillText(line, width / 2, startY + (idx * lineHeight));
    });
    
    // Source Reference (No brackets)
    let ref = formatVerseRef(verseObj);
    ref = ref.replace(/^[\[\(]/, '').replace(/[\]\)]$/, '').replace(/^- /, '').trim();
    ctx.font = `400 32px "Times New Roman", serif`;
    ctx.fillStyle = isDark ? 'rgba(247, 231, 206, 0.85)' : 'rgba(30, 29, 27, 0.85)';
    ctx.fillText(ref, width / 2, startY + totalTextHeight + 50);
    
    // Branding with clean space
    ctx.font = `500 24px "Times New Roman", serif`;
    ctx.fillStyle = isDark ? 'rgba(247, 231, 206, 0.45)' : 'rgba(30, 29, 27, 0.45)';
    ctx.fillText('VerseFeed', width / 2, startY + totalTextHeight + 110);
    
    return canvas;
}

async function generateAndShareImage(verseObj, elementId) {
    if (!verseObj) return;
    
    try {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const canvas = drawVersePosterToCanvas(verseObj, isDark);
        const text = formatVerseForShare(verseObj);
        
        // 1. Native Capacitor with @capacitor/filesystem and @capacitor/share
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
        if (isNative && window.Capacitor.Plugins) {
            const { Filesystem, Share } = window.Capacitor.Plugins;
            if (Filesystem && Share) {
                try {
                    const dataUrl = canvas.toDataURL('image/png');
                    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
                    const fileName = `verse_${Date.now()}.png`;
                    
                    await Filesystem.writeFile({
                        path: fileName,
                        data: base64Data,
                        directory: 'CACHE'
                    });
                    
                    const uriRes = await Filesystem.getUri({
                        path: fileName,
                        directory: 'CACHE'
                    });
                    
                    if (uriRes && uriRes.uri) {
                        await Share.share({
                            title: 'VerseFeed',
                            text: text,
                            files: [uriRes.uri],
                            dialogTitle: 'Share Verse'
                        });
                        return;
                    }
                } catch (nativeShareErr) {
                    console.warn('Native Filesystem/Share error:', nativeShareErr);
                }
            }
        }
        
        // 2. Web / Browser Share API with image file
        canvas.toBlob(async (blob) => {
            if (!blob) {
                await shareTextFallback(text);
                return;
            }
            
            try {
                const file = new File([blob], 'versefeed_share.png', { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Daily Verse',
                        text: text
                    });
                    return;
                }
            } catch (fileShareErr) {
                console.warn('Navigator file share error:', fileShareErr);
            }
            
            // 3. Fallback: Direct image download
            try {
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = 'versefeed_share.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast('Image downloaded');
                return;
            } catch (dlErr) {
                console.warn('Download fallback error:', dlErr);
            }
            
            await shareTextFallback(text);
        }, 'image/png');
    } catch (e) {
        console.error('Error generating image poster:', e);
        const text = formatVerseForShare(verseObj);
        await shareTextFallback(text);
    }
}

function closeRenameModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('rename-modal'));
}

let renamingAlbumName = null;

function openRenameAlbumModal(albumName) {
    renamingAlbumName = albumName;
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('rename-album-input');
    if (!modal || !input) return;
    input.value = albumName || '';
    openModal(modal);
    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);
}

function submitRenameAlbum() {
    const input = document.getElementById('rename-album-input');
    const oldName = renamingAlbumName || (selectedVerse && selectedVerse.type === 'folder' ? selectedVerse.name : null);
    if (!input || !oldName) return;
    
    let newName = sanitizeFolderName(input.value);
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
    
    if (selectedSavedAlbum === oldName) selectedSavedAlbum = newName;
    if (selectedVerse && selectedVerse.type === 'folder' && selectedVerse.name === oldName) {
        selectedVerse.name = newName;
    }
    
    closeRenameModal();
    showSavedVerses(true);
    showToast('Folder renamed to "' + newName + '"');
}

function confirmRenameAlbum() { submitRenameAlbum(); }


// ==============================================
// FIREBASE AUTHENTICATION & FIRESTORE CLOUD SYNC
// ==============================================

function applyUserAuthSuccess(user) {
    if (!user) return;
    
    const savedName = localStorage.getItem('nameForSignUp');
    if (savedName && user.updateProfile) {
        user.updateProfile({ displayName: savedName }).then(() => {
            localStorage.removeItem('nameForSignUp');
        }).catch(() => {});
        try { Object.defineProperty(user, 'displayName', { value: savedName, writable: true }); } catch(e){}
    }

    const nameToUse = savedName || user.displayName || user.email || 'User';
    const localAvatar = localStorage.getItem('customUserAvatar_' + user.uid);
    googleUser = {
        name: nameToUse,
        picture: localAvatar || user.photoURL || '',
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
    updateUserUI();
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
        
        // Handle Google Sign-In redirect return
        if (firebase.auth().getRedirectResult) {
            firebase.auth().getRedirectResult().then((result) => {
                if (result && result.user) {
                    showToast("Signed in as " + (result.user.displayName || result.user.email || 'User'));
                    applyUserAuthSuccess(result.user);
                }
            }).catch((error) => {
                if (error && error.code !== 'auth/null-user') {
                    console.error("Redirect auth error:", error);
                }
            });
        }

        // Handle Email Link Verification & Reclaiming Account
        if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
            let email = window.localStorage.getItem('emailForSignIn');
            if (!email) {
                email = window.prompt('Please confirm your email address for verification:');
            }
            if (email) {
                showToast("Verifying email...");
                firebase.auth().signInWithEmailLink(email, window.location.href)
                    .then((result) => {
                        window.localStorage.removeItem('emailForSignIn');
                        const savedName = window.localStorage.getItem('nameForSignUp');
                        const savedPass = window.localStorage.getItem('passwordToSetOnVerify');
                        
                        const tasks = [];
                        if (savedName && result.user && result.user.updateProfile) {
                            tasks.push(result.user.updateProfile({ displayName: savedName }));
                        }
                        if (savedPass && result.user && result.user.updatePassword) {
                            tasks.push(result.user.updatePassword(savedPass));
                        }

                        Promise.all(tasks).finally(() => {
                            window.localStorage.removeItem('nameForSignUp');
                            window.localStorage.removeItem('passwordToSetOnVerify');
                            if (window.history && window.history.replaceState) {
                                window.history.replaceState({}, document.title, window.location.pathname);
                            }
                            showToast("Email verified!");
                            applyUserAuthSuccess(result.user);
                        });
                    })
                    .catch((error) => {
                        console.error("Sign in with email link error:", error);
                        showToast("Link expired or invalid");
                    });
            }
        }

        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                const isPasswordUser = user.providerData && user.providerData.some(p => p.providerId === 'password');
                if (isPasswordUser && !user.emailVerified) {
                    googleUser = null;
                    try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e){}
                    switchProfile('guest');
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
                updateUserUI();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initFirebaseAuth();
});

let resendTimerInterval = null;

function updateResendTimerUI() {
    const btn = document.getElementById('resend-verify-btn');
    if (!btn) return;
    
    const lastResendTime = localStorage.getItem('verification_resend_time');
    if (!lastResendTime) {
        btn.disabled = false;
        btn.innerText = "Resend Email";
        btn.style.opacity = "1";
        return;
    }
    
    const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
    const now = Date.now();
    const elapsed = now - parseInt(lastResendTime);
    
    if (elapsed >= COOLDOWN_MS) {
        localStorage.removeItem('verification_resend_time');
        btn.disabled = false;
        btn.innerText = "Resend Email";
        btn.style.opacity = "1";
        if (resendTimerInterval) {
            clearInterval(resendTimerInterval);
            resendTimerInterval = null;
        }
    } else {
        const remaining = COOLDOWN_MS - elapsed;
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        btn.disabled = true;
        btn.innerText = `Resend Email (${minutes}:${seconds.toString().padStart(2, '0')})`;
        btn.style.opacity = "0.5";
        
        if (!resendTimerInterval) {
            resendTimerInterval = setInterval(updateResendTimerUI, 1000);
        }
    }
}

function showEmailVerifyModal(email) {
    const modal = document.getElementById('email-verify-modal');
    const emailEl = document.getElementById('verify-modal-email');
    if (emailEl) emailEl.innerText = email || '';
    
    // Automatically start 3-minute resend timer when verify email pop-up first appears
    if (!localStorage.getItem('verification_resend_time')) {
        localStorage.setItem('verification_resend_time', Date.now());
    }
    
    if (modal) {
        openModal(modal);
        updateResendTimerUI();
    }
}

function closeEmailVerifyModal() {
    closeModal(document.getElementById('email-verify-modal'));
    if (resendTimerInterval) {
        clearInterval(resendTimerInterval);
        resendTimerInterval = null;
    }
}

function checkEmailVerification() {
    const user = firebase.auth().currentUser;
    const errorEl = document.getElementById('verify-error-msg');
    if (errorEl) errorEl.innerText = "";
    
    if (!user) {
        showToast("Please sign in");
        closeEmailVerifyModal();
        return;
    }
    user.reload().then(() => {
        if (user.emailVerified) {
            showToast("Email verified!");
            applyUserAuthSuccess(user);
        } else {
            if (errorEl) {
                errorEl.innerText = "Email not verified yet. Please check your inbox.";
            } else {
                showToast("Email not verified yet");
            }
        }
    }).catch(err => {
        console.error("Reload user error:", err);
        if (errorEl) {
            errorEl.innerText = "Failed to verify. Please try again.";
        }
    });
}

function resendVerificationEmail() {
    const user = firebase.auth().currentUser;
    const errorEl = document.getElementById('verify-error-msg');
    if (errorEl) errorEl.innerText = "";
    
    if (!user) return;
    
    const btn = document.getElementById('resend-verify-btn');
    if (btn && btn.disabled) return;
    
    showToast("Sending email...");
    
    // Dispatch via zero-spam Gmail SMTP
    sendCustomAuthEmail({
        email: user.email,
        type: 'verify-email',
        name: user.displayName || 'Friend'
    }).catch(() => {});

    user.sendEmailVerification().then(() => {
        showToast("Email sent! Check inbox");
        if (errorEl) errorEl.innerText = "Email sent! Check your inbox.";
        localStorage.setItem('verification_resend_time', Date.now());
        updateResendTimerUI();
    }).catch(err => {
        console.error("Resend verification error:", err);
        let msg = "Failed to send email.";
        if (err && err.code === 'auth/too-many-requests') {
            msg = "Too many requests. Please wait.";
            localStorage.setItem('verification_resend_time', Date.now());
            updateResendTimerUI();
        } else if (err && err.message) {
            msg = err.message;
        }
        if (errorEl) {
            errorEl.innerText = msg;
        } else {
            showToast(msg);
        }
    });
}

function enableNameEditMode() {
    const nameEl = document.getElementById('user-modal-name');
    if (!nameEl || nameEl.isEditing) return;
    
    const currentName = nameEl.innerText.trim();
    nameEl.isEditing = true;
    nameEl.innerHTML = `<input type="text" id="inline-name-input" value="${currentName}" style="font-size: 1.2rem; font-family: var(--font-main); color: var(--text-color); background: rgba(0,0,0,0.1); border: 1px solid var(--accent); border-radius: 6px; padding: 2px 8px; text-align: center; width: 100%; box-sizing: border-box; outline: none;" />`;
    
    const inputEl = document.getElementById('inline-name-input');
    inputEl.focus();
    inputEl.setSelectionRange(0, inputEl.value.length);
    
    const saveFn = () => {
        if (!nameEl.isEditing) return;
        nameEl.isEditing = false;
        
        let newName = inputEl.value.replace(/[^A-Za-z\s]/g, '').trim();
        if (!newName) {
            newName = currentName;
            showToast("Letters only (A-Z)");
        }
        
        nameEl.innerHTML = '';
        nameEl.innerText = newName;
        
        if (newName !== currentName) {
            const user = firebase.auth().currentUser;
            if (user) {
                showToast("Updating name...");
                user.updateProfile({ displayName: newName }).then(() => {
                    applyUserAuthSuccess(user);
                    showToast("Name updated");
                }).catch(err => {
                    console.error("Name update error:", err);
                    showToast("Update failed");
                    nameEl.innerText = currentName;
                });
            }
        }
    };
    
    inputEl.addEventListener('blur', saveFn);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveFn();
        else if (e.key === 'Escape') {
            nameEl.isEditing = false;
            nameEl.innerHTML = '';
            nameEl.innerText = currentName;
        }
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
    openModal(document.getElementById('email-auth-modal'));
}

function closeEmailAuthModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('email-auth-modal'));
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
    const forgotContainer = document.getElementById('auth-forgot-password-container');

    if (mode === 'signin') {
        if (btnSignin) btnSignin.classList.add('active');
        if (btnSignup) btnSignup.classList.remove('active');
        if (nameContainer) nameContainer.style.display = 'none';
        if (confirmContainer) confirmContainer.style.display = 'none';
        if (googleContainer) googleContainer.style.display = 'flex';
        if (forgotContainer) forgotContainer.style.display = 'block';
        if (submitBtn) submitBtn.innerText = 'Sign In';
    } else {
        if (btnSignup) btnSignup.classList.add('active');
        if (btnSignin) btnSignin.classList.remove('active');
        if (nameContainer) nameContainer.style.display = 'flex';
        if (confirmContainer) confirmContainer.style.display = 'flex';
        if (googleContainer) googleContainer.style.display = 'none';
        if (forgotContainer) forgotContainer.style.display = 'none';
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
            return "An account already exists with this email. If this is your email, switch to Sign In & click 'Forgot Password'.";
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
                    showToast("Please verify email");
                } else {
                    applyUserAuthSuccess(result.user);
                    showToast("Signed in");
                }
            }
        })
        .catch((error) => {
            console.error("Email Sign In Error:", error);
            showAuthErrorMsg(formatFirebaseAuthError(error));
        });
}

async function sendCustomAuthEmail(payload) {
    if (window.AppSigner && typeof window.AppSigner.sendAuthEmail === 'function') {
        try {
            window.AppSigner.sendAuthEmail(
                payload.email || '',
                payload.type || '',
                payload.name || '',
                payload.code || '',
                payload.actionUrl || ''
            );
            return { success: true, native: true };
        } catch(nativeErr) {
            console.warn("Native SMTP bridge error:", nativeErr);
        }
    }

    try {
        const response = await fetch('/.netlify/functions/send-auth-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn("Custom email delivery fallback:", e);
    }
    return null;
}

function resetPassword() {
    clearAuthErrorMsg();
    const emailEl = document.getElementById('auth-email');
    const email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
        showAuthErrorMsg("Please enter your email to reset password.");
        return;
    }
    showAuthErrorMsg("Sending reset link...", true);
    
    // Send via custom zero-spam Gmail SMTP if available, with native Firebase fallback
    sendCustomAuthEmail({
        email: email,
        type: 'reset-password'
    }).catch(() => {});

    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            showAuthErrorMsg("Password reset link sent! Check your inbox.", true);
        })
        .catch((error) => {
            console.error("Reset Password Error:", error);
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

    window.localStorage.setItem('emailForSignIn', email);
    if (name) window.localStorage.setItem('nameForSignUp', name);
    if (password) window.localStorage.setItem('passwordToSetOnVerify', password);

    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((result) => {
            if (result && result.user) {
                if (name && result.user.updateProfile) {
                    result.user.updateProfile({ displayName: name }).catch(() => {});
                }
                // Send luxury zero-spam verification email via Gmail SMTP
                sendCustomAuthEmail({
                    email: email,
                    type: 'verify-email',
                    name: name
                }).catch(() => {});

                result.user.sendEmailVerification().then(() => {
                    localStorage.setItem('verification_resend_time', Date.now());
                    closeEmailAuthModal();
                    showEmailVerifyModal(email);
                }).catch((err) => {
                    console.error("Error sending email verification:", err);
                    localStorage.setItem('verification_resend_time', Date.now());
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
    const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (googleUser || user) {
        openUserProfileModal();
    } else {
        openEmailAuthModal('signin');
    }
}

async function signInWithGoogle() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        showToast("Firebase loading, please try again in a moment...");
        return;
    }
    
    const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    
    if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication) {
        const FA = window.Capacitor.Plugins.FirebaseAuthentication;
        
        async function processNativeResult(res) {
            if (!res) return false;
            const idToken = (res.credential && res.credential.idToken) || res.idToken || (res.user && res.user.idToken);
            if (idToken) {
                const cred = firebase.auth.GoogleAuthProvider.credential(idToken);
                const userCred = await firebase.auth().signInWithCredential(cred);
                applyUserAuthSuccess(userCred.user);
            } else if (res.user) {
                applyUserAuthSuccess({
                    uid: res.user.uid,
                    displayName: res.user.displayName || res.user.name,
                    email: res.user.email,
                    photoURL: res.user.photoUrl
                });
            } else {
                return false;
            }
            closeEmailAuthModal();
            showToast("Signed in as " + ((res.user && (res.user.displayName || res.user.name)) || (res.user && res.user.email) || 'User'));
            return true;
        }
        
        function isCancelError(errStr) {
            return errStr.includes('12501') || errStr.includes('cancel') || errStr.includes('dismiss') || errStr.includes('closed');
        }
        
        function isError10(errStr) {
            return errStr.includes('10:') || errStr.includes('developer_error') || errStr.includes('apiexception: 10');
        }
        
        // Attempt 1: Legacy GoogleSignIn (useCredentialManager: false)
        try {
            showToast("Signing in with Google...");
            await FA.signOut().catch(() => {});
            const res = await FA.signInWithGoogle({ useCredentialManager: false, skipNativeAuth: true });
            if (await processNativeResult(res)) return;
        } catch (err1) {
            console.error("Legacy GoogleSignIn Error:", JSON.stringify(err1), err1);
            const errStr1 = (err1 && (err1.message || err1.code || JSON.stringify(err1) || String(err1))).toLowerCase();
            if (isCancelError(errStr1)) return;
            
            if (isError10(errStr1)) {
                // Attempt 2: Credential Manager (useCredentialManager: true)
                try {
                    console.log("Legacy failed with error 10, trying Credential Manager...");
                    const res2 = await FA.signInWithGoogle({ useCredentialManager: true, skipNativeAuth: true });
                    if (await processNativeResult(res2)) return;
                } catch (err2) {
                    console.error("Credential Manager Error:", JSON.stringify(err2), err2);
                    const errStr2 = (err2 && (err2.message || err2.code || JSON.stringify(err2) || String(err2))).toLowerCase();
                    if (isCancelError(errStr2)) return;
                }
                
                showToast("Sign in failed. Please check your internet connection.");
                return;
            }
            
            showToast("Google Login Error: " + (err1.message || "Failed"));
            return;
        }
    }
    
    // Web / Popup Fallback (Only runs if NOT native)
    try {
        isGooglePopupOpen = true;
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await firebase.auth().signInWithPopup(provider);
        if (result && result.user) {
            applyUserAuthSuccess(result.user);
            closeEmailAuthModal();
            showToast("Signed in successfully!");
        }
    } catch (error) {
        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            return;
        }
        console.error("Google Sign In Error:", error);
        showToast("Sign in error: " + (error ? (error.message || "Failed") : "Failed"));
    } finally {
        isGooglePopupOpen = false;
    }
}

function sanitizeForFirestore(obj) {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(sanitizeForFirestore).filter(v => v !== undefined);
    }
    const cleaned = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val !== undefined) {
            cleaned[key] = sanitizeForFirestore(val);
        }
    }
    return cleaned;
}

function getLocalState() {
    const rawSaved = JSON.parse(localStorage.getItem('savedVerses') || '[]');
    const compactSaved = rawSaved.map(s => {
        if (!s) return null;
        const item = {
            book: s.book || '',
            chapter: s.chapter !== undefined && s.chapter !== null ? s.chapter : '',
            verse: s.verse !== undefined && s.verse !== null ? s.verse : '',
            religion: s.religion || '',
            album: s.album || 'All',
            text: s.text || ''
        };
        if (s.id) item.id = s.id;
        if (s.author) item.author = s.author;
        if (s.translation) item.translation = s.translation;
        if (s.time) item.time = s.time;
        return item;
    }).filter(Boolean);

    const state = {
        savedVerses: compactSaved,
        createdAlbums: JSON.parse(localStorage.getItem('createdAlbums') || '[]'),
        bookMarkedVerse: JSON.parse(localStorage.getItem('bookMarkedVerse') || '{}'),
        selectedVoice: localStorage.getItem('selectedVoice') || 'en_GB-alan-medium',
        ttsAnnounceSource: localStorage.getItem('ttsAnnounceSource') === 'true',
        ttsRandomVoice: localStorage.getItem('ttsRandomVoice') === 'true',
        updatedAt: Date.now()
    };

    // Only save custom topic selection if user is premium
    if (typeof isPremiumUser !== 'undefined' && isPremiumUser) {
        const customRels = localStorage.getItem('globalSelectedRels');
        if (customRels) {
            try {
                state.globalSelectedRels = JSON.parse(customRels);
            } catch(e){}
        }
    }

    return sanitizeForFirestore(state);
}

let firestoreUnsubscribe = null;
let isSavingToFirestore = false;

function applyRemoteFirestoreData(remoteData) {
    if (!remoteData || typeof remoteData !== 'object') return;
    if (isBookmarkEcho(remoteData)) return;

    const prevRestoring = isRestoringState;
    isRestoringState = true;

    try {
        let needSavedRefresh = false;
        let needSettingsRefresh = false;

        // 1. Sync savedVerses from cloud
        if (Array.isArray(remoteData.savedVerses)) {
            const incoming = remoteData.savedVerses.filter(v => v && v.text);
            if (getBookmarkSnapshotFromData({ savedVerses: incoming, createdAlbums: createdAlbums }) !== getLocalBookmarkSnapshot()) {
                savedVerses = incoming;
                localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                needSavedRefresh = true;
            }
        }

        // 2. Sync createdAlbums from cloud
        if (Array.isArray(remoteData.createdAlbums)) {
            const incomingAlbums = remoteData.createdAlbums.filter(a => typeof a === 'string' && a.trim());
            if (getBookmarkSnapshotFromData({ savedVerses: savedVerses, createdAlbums: incomingAlbums }) !== getLocalBookmarkSnapshot()) {
                createdAlbums = incomingAlbums;
                localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
                needSavedRefresh = true;
            }
        }

        // 3. Sync bookmarks directly from cloud
        if (remoteData.bookMarkedVerse && typeof remoteData.bookMarkedVerse === 'object') {
            if (JSON.stringify(bookMarkedVerse) !== JSON.stringify(remoteData.bookMarkedVerse)) {
                bookMarkedVerse = remoteData.bookMarkedVerse;
                localStorage.setItem('bookMarkedVerse', JSON.stringify(bookMarkedVerse));
            }
        }

        // 4. Update seenVersesHistory
        if (Array.isArray(remoteData.seenVersesHistory)) {
            seenVersesList = remoteData.seenVersesHistory.slice(-1000);
            seenVersesSet = new Set(seenVersesList);
            localStorage.setItem('seenVersesHistory', JSON.stringify(seenVersesList));
        }

        // 5. Preferences
        if (Array.isArray(remoteData.globalSelectedRels) && remoteData.globalSelectedRels.length > 0) {
            const incomingRels = remoteData.globalSelectedRels.filter(r => ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'].includes(r));
            if (JSON.stringify(globalSelectedRels) !== JSON.stringify(incomingRels)) {
                globalSelectedRels = incomingRels;
                localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
                needSettingsRefresh = true;
            }
        }
        
        if (remoteData.selectedVoice && selectedVoice !== remoteData.selectedVoice) {
            selectedVoice = remoteData.selectedVoice;
            localStorage.setItem('selectedVoice', selectedVoice);
            if (typeof syncVoiceWheelToCurrent === 'function') syncVoiceWheelToCurrent();
        }
        if (typeof remoteData.currentMusicTrack !== 'undefined') {
            localStorage.setItem('currentMusicTrack', remoteData.currentMusicTrack);
        }
        if (typeof remoteData.musicVolume !== 'undefined') {
            localStorage.setItem('musicVolume', remoteData.musicVolume);
            if (typeof audio !== 'undefined' && audio) {
                audio.volume = parseFloat(remoteData.musicVolume);
            }
            const slider = document.getElementById('music-volume-slider');
            if (slider) slider.value = remoteData.musicVolume;
        }
        
        updateTogglesUI();
        if (needSettingsRefresh && typeof buildSettings === 'function') {
            const isSettingsActive = document.getElementById('settings') && document.getElementById('settings').classList.contains('active-section');
            if (isSettingsActive) buildSettings();
        }
        if (needSavedRefresh && typeof showSavedVerses === 'function') {
            const isSavedActive = document.getElementById('saved-verses') && document.getElementById('saved-verses').classList.contains('active-section');
            if (isSavedActive) suppressFlash(() => showSavedVerses(true));
        }
    } finally {
        isRestoringState = prevRestoring;
    }
}

function setupFirestoreRealtimeSync(uid) {
    if (!db || !uid) return;
    if (firestoreUnsubscribe) {
        try { firestoreUnsubscribe(); } catch(e){}
        firestoreUnsubscribe = null;
    }
    try {
        const docRef = db.collection('users').doc(uid);
        firestoreUnsubscribe = docRef.onSnapshot((doc) => {
            if (!doc.exists) return;
            if (doc.metadata && doc.metadata.hasPendingWrites) return;
            const remoteData = doc.data();
            if (isBookmarkEcho(remoteData)) return;
            if (isSavingToFirestore) return;
            applyRemoteFirestoreData(remoteData);
        }, (err) => {
            console.warn("Firestore onSnapshot error:", err);
        });
    } catch(err) {
        console.warn("Setup Firestore realtime sync failed:", err);
    }
}

async function saveUserDataToFirestore(uid) {
    if (!db || !uid || uid === 'guest') return;
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && typeof firebase.auth === 'function') {
            const curUser = firebase.auth().currentUser;
            if (!curUser) return;
        }
        isSavingToFirestore = true;
        markLocalBookmarkMutation();
        const payloadToSave = getLocalState();
        await db.collection('users').doc(uid).set(payloadToSave, { merge: true });
    } catch(err) {
        console.warn("Firestore sync paused (offline or unauthenticated):", err.message || err);
    } finally {
        setTimeout(() => {
            isSavingToFirestore = false;
        }, 3000);
    }
}

async function loadUserDataFromFirestore(uid) {
    if (!db || !uid || uid === 'guest') return;
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && typeof firebase.auth === 'function') {
            const curUser = firebase.auth().currentUser;
            if (!curUser) return;
        }
        const docRef = db.collection('users').doc(uid);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const remoteData = doc.data();
            applyRemoteFirestoreData(remoteData);
        } else {
            saveUserDataToFirestore(uid);
        }
        setupFirestoreRealtimeSync(uid);
    } catch(err) {
        console.warn("Firestore load note:", err.message || err);
    }
}



function openUserProfileModal() {
    const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (!googleUser && !user) {
        openEmailAuthModal('signin');
        return;
    }
    if (typeof cancelNameEditMode === 'function') cancelNameEditMode();
    const modal = document.getElementById('user-profile-modal');
    const nameEl = document.getElementById('user-modal-name');
    const emailEl = document.getElementById('user-modal-email');
    const imgEl = document.getElementById('user-modal-avatar-img');
    const txtEl = document.getElementById('user-modal-avatar-text');
    
    const name = (googleUser && googleUser.name) || (user && (user.displayName || user.email)) || 'User';
    const email = (googleUser && googleUser.email) || (user && user.email) || '';
    const picture = (googleUser && googleUser.picture) || (user && user.photoURL) || localStorage.getItem('customUserAvatar') || '';

    if (nameEl) nameEl.innerText = name;
    if (emailEl) emailEl.innerText = email;
    
    if (imgEl && txtEl) {
        if (picture) {
            imgEl.src = picture;
            imgEl.style.display = 'block';
            txtEl.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            txtEl.style.display = 'inline';
            txtEl.innerText = name ? name.charAt(0).toUpperCase() : 'U';
        }
    }
    
    openModal(modal);
}

function closeUserProfileModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('user-profile-modal'));
}

function confirmSignOut() {
    if (firestoreUnsubscribe) {
        try { firestoreUnsubscribe(); } catch(e){}
        firestoreUnsubscribe = null;
    }
    const doCleanup = () => {
        googleUser = null;
        try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e){}
        googleAccessToken = null;
        switchProfile('guest');
        closeUserProfileModal();
        updateUserUI();
        if (typeof showSavedVerses === 'function') {
            showSavedVerses(true);
        }
    };

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication) {
        try { window.Capacitor.Plugins.FirebaseAuthentication.signOut(); } catch(e){}
    }

    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        firebase.auth().signOut().then(doCleanup).catch((err) => {
            console.error("Firebase SignOut Error:", err);
            doCleanup();
        });
    } else {
        doCleanup();
    }
}

let lastDeleteProfileTapTime = 0;
let deleteProfileToastTimer = null;

function handleDeleteProfileBtnClick() {
    const now = Date.now();
    if (now - lastDeleteProfileTapTime < 300) {
        lastDeleteProfileTapTime = 0;
        clearTimeout(deleteProfileToastTimer);
        clearTimeout(toastHideTimeout);
        const toast = document.getElementById('global-toast');
        if (toast) toast.classList.remove('show');
        openDeleteAccountModal();
    } else {
        lastDeleteProfileTapTime = now;
        clearTimeout(deleteProfileToastTimer);
        deleteProfileToastTimer = setTimeout(() => {
            showToast("Double-tap to Delete", 1500);
        }, 300);
    }
}

let lastDeleteConfirmTapTime = 0;
let deleteConfirmToastTimer = null;

function handleDeleteConfirmBtnClick() {
    const now = Date.now();
    if (now - lastDeleteConfirmTapTime < 300) {
        lastDeleteConfirmTapTime = 0;
        clearTimeout(deleteConfirmToastTimer);
        clearTimeout(toastHideTimeout);
        const toast = document.getElementById('global-toast');
        if (toast) toast.classList.remove('show');
        executeDeleteAccount();
    } else {
        lastDeleteConfirmTapTime = now;
        clearTimeout(deleteConfirmToastTimer);
        deleteConfirmToastTimer = setTimeout(() => {
            showToast("Double-tap to Delete", 1500);
        }, 300);
    }
}

function openDeleteAccountModal() {
    openModal(document.getElementById('delete-account-confirm-modal'));
}

function closeDeleteAccountModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('delete-account-confirm-modal'));
}

function executeDeleteAccount() {
    if (!googleUser) return;
    closeDeleteAccountModal();

    const userSub = googleUser.sub;
    const profileKey = 'account_' + userSub;

    const finalizeDeletion = () => {
        // Clear all account-specific keys from localStorage
        STATE_KEYS.forEach(k => {
            try { originalRemoveItem.call(localStorage, `pf_${profileKey}_${k}`); } catch(e) {}
        });
        googleUser = null;
        try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e) {}
        googleAccessToken = null;
        switchProfile('guest');
        closeUserProfileModal();
        updateUserUI();
        if (typeof showSavedVerses === 'function') {
            showSavedVerses(true);
        }
        showToast('Account deleted');
    };

    // 1. Delete from Firestore if available
    let dbPromise = Promise.resolve();
    if (typeof firebase !== 'undefined' && firebase.firestore && userSub) {
        try {
            const db = firebase.firestore();
            dbPromise = db.collection('users').doc(userSub).delete().catch(err => {
                console.warn("Firestore user deletion warning:", err);
            });
        } catch(e) {}
    }

    dbPromise.then(() => {
        // 2. Delete Firebase Auth user if authenticated
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
            firebase.auth().currentUser.delete().then(() => {
                finalizeDeletion();
            }).catch(err => {
                console.warn("Firebase Auth deletion warning:", err);
                firebase.auth().signOut().catch(() => {});
                finalizeDeletion();
            });
        } else {
            finalizeDeletion();
        }
    });
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
var isPremiumUser = false;
var rcPackages = [];
var selectedPlanType = 'annual'; // 'monthly' or 'annual'
var isPurchasingInProgress = false;

async function initRevenueCat() {
    try {
        const Purchases = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || window.Purchases;
        if (Purchases) {
            await Purchases.configure({ apiKey: 'goog_oaXBzDwHBvBaJzSuIZbFuuvwkLM' });
            
            // Check existing customer info
            try {
                const customerInfo = await Purchases.getCustomerInfo();
                const hasActive = customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && Object.keys(customerInfo.entitlements.active).length > 0;
                if (hasActive) {
                    isPremiumUser = true;
                    localStorage.setItem('isPremiumUser', 'true');
                }
            } catch (custErr) {
                console.warn("CustomerInfo check error:", custErr);
            }
            
            // Fetch offerings in background
            try {
                const offerings = await Purchases.getOfferings();
                if (offerings && offerings.current && offerings.current.availablePackages) {
                    rcPackages = offerings.current.availablePackages;
                    if (document.getElementById('premium-packages')) {
                        renderPremiumPackages();
                    }
                }
            } catch (offErr) {
                console.warn("Offerings fetch error:", offErr);
            }
        }
    } catch (e) {
        console.error("RevenueCat Init Error:", e);
    }
}



let _premiumModalLastOpened = 0;
async function openPremiumModal() {
    const now = Date.now();
    if (now - _premiumModalLastOpened < 1500) return; // Cooldown: prevent double-open
    _premiumModalLastOpened = now;
    const modal = document.getElementById('premium-modal');
    if (modal) {
        isPurchasingInProgress = false; // Reset stuck state
        openModal(modal);
        renderPremiumPackages();
        
        // Fetch fresh offerings if empty
        const Purchases = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || window.Purchases;
        if (Purchases && (!rcPackages || rcPackages.length === 0)) {
            try {
                const offerings = await Purchases.getOfferings();
                if (offerings && offerings.current && offerings.current.availablePackages) {
                    rcPackages = offerings.current.availablePackages;
                    renderPremiumPackages();
                }
            } catch (e) {
                console.warn("Modal offerings fetch notice:", e);
            }
        }
    }
}


function closePremiumModal(e) {
    if (e && e.target && e.currentTarget && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('premium-modal'));
}

function selectPremiumPlan(planType) {
    selectedPlanType = planType;
    renderPremiumPackages();
}

function renderPremiumPackages() {
    const container = document.getElementById('premium-packages');
    if (!container) return;

    const annualPrice = "$29.99";
    const annualPerMonth = "$2.50";
    const monthlyPrice = "$2.99";

    container.innerHTML = `
        <div class="premium-plans-grid">
            <div class="premium-plan-card ${selectedPlanType === 'annual' ? 'selected' : ''}" onclick="selectPremiumPlan('annual')">
                <span class="plan-badge">Save 17%</span>
                <span class="plan-name">Annual</span>
                <span class="plan-price">${annualPrice}</span>
                <span class="plan-subtext">${annualPerMonth}/mo billed yearly</span>
            </div>
            <div class="premium-plan-card ${selectedPlanType === 'monthly' ? 'selected' : ''}" onclick="selectPremiumPlan('monthly')">
                <span class="plan-name">Monthly</span>
                <span class="plan-price">${monthlyPrice}</span>
                <span class="plan-subtext">/ month</span>
            </div>
        </div>
    `;

    const buyBtnText = document.querySelector('.premium-buy-pill-text');
    if (buyBtnText && !isPurchasingInProgress) {
        if (selectedPlanType === 'annual') {
            buyBtnText.innerText = `Get Annual — ${annualPrice}/yr`;
        } else {
            buyBtnText.innerText = `Get Monthly — ${monthlyPrice}/mo`;
        }
    }
}

async function handlePremiumSubscribeClick(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.preventDefault) e.preventDefault();
    const activeProfile = getActiveProfileId();
    const currentUid = getFirebaseCurrentUid();
    if (!currentUid || activeProfile === 'guest') {
        closePremiumModal();
        openEmailAuthModal('signin');
        showToast("Sign in for Premium");
        return;
    }
    if (isPurchasingInProgress) {
        return;
    }
    isPurchasingInProgress = true;
    
    const buyBtnText = document.querySelector('.premium-buy-pill-text');
    if (buyBtnText) buyBtnText.innerText = "Opening Google Play...";

    try {
        const Purchases = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || window.Purchases;
        if (Purchases) {
            // Ensure configured
            try {
                await Purchases.configure({ apiKey: 'goog_oaXBzDwHBvBaJzSuIZbFuuvwkLM' });
            } catch (cfgErr) {}

            // Try fetching offerings if not yet cached
            if (!rcPackages || rcPackages.length === 0) {
                try {
                    const offerings = await Purchases.getOfferings();
                    if (offerings && offerings.current && offerings.current.availablePackages) {
                        rcPackages = offerings.current.availablePackages;
                    } else if (offerings && offerings.all) {
                        const allKeys = Object.keys(offerings.all);
                        if (allKeys.length > 0 && offerings.all[allKeys[0]].availablePackages) {
                            rcPackages = offerings.all[allKeys[0]].availablePackages;
                        }
                    }
                } catch (fetchErr) {
                    console.warn("Offerings fetch on click warning:", fetchErr);
                }
            }

            if (rcPackages && rcPackages.length > 0) {
                let targetPkg = null;
                if (selectedPlanType === 'annual') {
                    targetPkg = rcPackages.find(p => p.packageType === 'ANNUAL' || (p.identifier && (p.identifier.toLowerCase().includes('annual') || p.identifier.toLowerCase().includes('yearly')))) || rcPackages[0];
                } else {
                    targetPkg = rcPackages.find(p => p.packageType === 'MONTHLY' || (p.identifier && p.identifier.toLowerCase().includes('monthly'))) || rcPackages[0];
                }

                if (targetPkg) {
                    const doPurchase = async () => {
                        try {
                            return await Purchases.purchasePackage({ aPackage: targetPkg });
                        } catch (pkgErr) {
                            console.warn("purchasePackage error, trying subscriptionOption:", pkgErr);
                            const opt = (targetPkg.product && (targetPkg.product.defaultOption || (targetPkg.product.subscriptionOptions && targetPkg.product.subscriptionOptions[0]))) || targetPkg.subscriptionOption;
                            if (opt) {
                                return await Purchases.purchaseSubscriptionOption({ subscriptionOption: opt });
                            }
                            throw pkgErr;
                        }
                    };

                    const result = await doPurchase();
                    const customerInfo = result && (result.customerInfo || result);
                    if (customerInfo) {
                        isPremiumUser = true;
                        localStorage.setItem('isPremiumUser', 'true');
                        closePremiumModal();
                        updateTogglesUI();
                        buildSettings();
                        return;
                    }
                }
            }
        }
    } catch (e) {
        if (e && (e.userCancelled || (e.message && e.message.toLowerCase().includes('cancel')))) {
            // User cancelled — do nothing silently
        } else {
            console.error("Purchase error:", e);
        }
    } finally {
        isPurchasingInProgress = false;
        renderPremiumPackages();
    }
}

async function restorePurchases() {
    try {
        const Purchases = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || window.Purchases;
        if (Purchases) {
            const customerInfo = await Purchases.restorePurchases();
            const hasActiveEntitlement = customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && Object.keys(customerInfo.entitlements.active).length > 0;
            if (hasActiveEntitlement) {
                isPremiumUser = true;
                localStorage.setItem('isPremiumUser', 'true');
                closePremiumModal();
                updateTogglesUI();
                buildSettings();
            }
        }
    } catch (e) {
        console.error("Restore purchases error:", e);
    }
}

window.addEventListener('load', async () => {
    await initRevenueCat();
});


// --- Direct Google Drive Redirect & Offline Auto Guest ---

// Auto Guest login when offline
window.addEventListener('offline', () => {
    if (googleUser) {
        saveStateToProfile('account_' + googleUser.sub);
        googleUser = null;
        loadStateFromProfile('guest');
        updateUserUI();
        showToast('Offline: Guest mode');
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

// PC (Ctrl+C) and Mac (Cmd+C) Shortcut: Copy current active verse card to clipboard
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selection = window.getSelection() ? window.getSelection().toString() : '';
        if (selection && selection.trim().length > 0) return;
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
        
        let curVerse = null;
        if (typeof verseBatches !== 'undefined' && verseBatches.general && verseBatches.general[currentVerseIndex.general]) {
            curVerse = verseBatches.general[currentVerseIndex.general];
        }
        if (curVerse) {
            const formatted = formatVerseForShare(curVerse);
            navigator.clipboard.writeText(formatted).then(() => {
                showToast('Verse copied to clipboard!');
            }).catch(console.error);
        }
    }
});
