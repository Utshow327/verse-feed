
// Eradicate corrupted machine-translation cache
try {
    const keysToPurge = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('vtr_') || k.startsWith('verse_trans_'))) {
            keysToPurge.push(k);
        }
    }
    keysToPurge.forEach(k => localStorage.removeItem(k));
} catch(e) {}

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

// --- Canonical Religions & i18n Translation System ---
const CANONICAL_RELIGIONS = ['Christianity', 'Islam', 'Hinduism', 'Sikhism', 'Buddhism', 'Judaism', 'Philosophy'];

const supportedLanguages = [
    {
        "code": "en_US",
        "name": "English",
        "native": "English",
        "hasVoice": true,
        "isBundled": true
    },
    {
        "code": "bn",
        "name": "Bangla",
        "native": "বাংলা",
        "hasVoice": false,
        "isBundled": true
    },
    {
        "code": "es",
        "name": "Spanish",
        "native": "Español",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "fr",
        "name": "French",
        "native": "Français",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ar",
        "name": "Arabic",
        "native": "العربية",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "hi",
        "name": "Hindi",
        "native": "हिन्दी",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "pt",
        "name": "Portuguese",
        "native": "Português",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ru",
        "name": "Russian",
        "native": "Русский",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ja",
        "name": "Japanese",
        "native": "日本語",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "de",
        "name": "German",
        "native": "Deutsch",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "zh",
        "name": "Chinese (Simplified)",
        "native": "简体中文",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "zh_TW",
        "name": "Chinese (Traditional)",
        "native": "繁體中文",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ko",
        "name": "Korean",
        "native": "한국어",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "it",
        "name": "Italian",
        "native": "Italiano",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "tr",
        "name": "Turkish",
        "native": "Türkçe",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "vi",
        "name": "Vietnamese",
        "native": "Tiếng Việt",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "pl",
        "name": "Polish",
        "native": "Polski",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "uk",
        "name": "Ukrainian",
        "native": "Українська",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "nl",
        "name": "Dutch",
        "native": "Nederlands",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "fa",
        "name": "Persian",
        "native": "فارسی",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "id",
        "name": "Indonesian",
        "native": "Bahasa Indonesia",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ms",
        "name": "Malay",
        "native": "Bahasa Melayu",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "th",
        "name": "Thai",
        "native": "ไทย",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ur",
        "name": "Urdu",
        "native": "اردو",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "pa",
        "name": "Punjabi",
        "native": "ਪੰਜਾਬੀ",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ta",
        "name": "Tamil",
        "native": "தமிழ்",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "te",
        "name": "Telugu",
        "native": "తెలుగు",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "mr",
        "name": "Marathi",
        "native": "मराठी",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "gu",
        "name": "Gujarati",
        "native": "ગુજરાતી",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "kn",
        "name": "Kannada",
        "native": "ಕನ್ನಡ",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ml",
        "name": "Malayalam",
        "native": "മലയാളം",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "my",
        "name": "Burmese",
        "native": "မြန်မာဘာသာ",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ne",
        "name": "Nepali",
        "native": "नेपाली",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "si",
        "name": "Sinhala",
        "native": "සිංහල",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "km",
        "name": "Khmer",
        "native": "ភាសាខ្មែរ",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "lo",
        "name": "Lao",
        "native": "ພາສາລາວ",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "fil",
        "name": "Filipino",
        "native": "Filipino (Tagalog)",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "jv",
        "name": "Javanese",
        "native": "Basa Jawa",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "su",
        "name": "Sundanese",
        "native": "Basa Sunda",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ceb",
        "name": "Cebuano",
        "native": "Sinugboanon",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sv",
        "name": "Swedish",
        "native": "Svenska",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "no",
        "name": "Norwegian",
        "native": "Norsk",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "da",
        "name": "Danish",
        "native": "Dansk",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "fi",
        "name": "Finnish",
        "native": "Suomi",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "el",
        "name": "Greek",
        "native": "Ελληνικά",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "he",
        "name": "Hebrew",
        "native": "עברית",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ro",
        "name": "Romanian",
        "native": "Română",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "cs",
        "name": "Czech",
        "native": "Čeština",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "hu",
        "name": "Hungarian",
        "native": "Magyar",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sk",
        "name": "Slovak",
        "native": "Slovenčina",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "bg",
        "name": "Bulgarian",
        "native": "Български",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "hr",
        "name": "Croatian",
        "native": "Hrvatski",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sr",
        "name": "Serbian",
        "native": "Српски",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "bs",
        "name": "Bosnian",
        "native": "Bosanski",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sl",
        "name": "Slovenian",
        "native": "Slovenščina",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "lt",
        "name": "Lithuanian",
        "native": "Lietuvių",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "lv",
        "name": "Latvian",
        "native": "Latviešu",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "et",
        "name": "Estonian",
        "native": "Eesti",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sq",
        "name": "Albanian",
        "native": "Shqip",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "mk",
        "name": "Macedonian",
        "native": "Македонски",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "be",
        "name": "Belarusian",
        "native": "Беларуская",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ka",
        "name": "Georgian",
        "native": "ქართული",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "hy",
        "name": "Armenian",
        "native": "Հայերեն",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "az",
        "name": "Azerbaijani",
        "native": "Azərbaycan",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "kk",
        "name": "Kazakh",
        "native": "Қазақ тілі",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "uz",
        "name": "Uzbek",
        "native": "Oʻzbekcha",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ky",
        "name": "Kyrgyz",
        "native": "Кыргызча",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "tg",
        "name": "Tajik",
        "native": "Тоҷикӣ",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "tk",
        "name": "Turkmen",
        "native": "Türkmençe",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "mn",
        "name": "Mongolian",
        "native": "Монгол",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sw",
        "name": "Swahili",
        "native": "Kiswahili",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "am",
        "name": "Amharic",
        "native": "አማርኛ",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "yo",
        "name": "Yoruba",
        "native": "Èdè Yorùbá",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ig",
        "name": "Igbo",
        "native": "Asụsụ Igbo",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ha",
        "name": "Hausa",
        "native": "Harshen Hausa",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "zu",
        "name": "Zulu",
        "native": "isiZulu",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "xh",
        "name": "Xhosa",
        "native": "isiXhosa",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "af",
        "name": "Afrikaans",
        "native": "Afrikaans",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "so",
        "name": "Somali",
        "native": "Soomaaliga",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "mg",
        "name": "Malagasy",
        "native": "Fiteny Malagasy",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sn",
        "name": "Shona",
        "native": "chiShona",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ny",
        "name": "Chichewa",
        "native": "ChiCheŵa",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "rw",
        "name": "Kinyarwanda",
        "native": "Ikinyarwanda",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "st",
        "name": "Sesotho",
        "native": "Sesotho",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "is",
        "name": "Icelandic",
        "native": "Íslenska",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ga",
        "name": "Irish",
        "native": "Gaeilge",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "cy",
        "name": "Welsh",
        "native": "Cymraeg",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "gd",
        "name": "Scottish Gaelic",
        "native": "Gàidhlig",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "mt",
        "name": "Maltese",
        "native": "Malti",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "eu",
        "name": "Basque",
        "native": "Euskara",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ca",
        "name": "Catalan",
        "native": "Català",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "gl",
        "name": "Galician",
        "native": "Galego",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "la",
        "name": "Latin",
        "native": "Latina",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "eo",
        "name": "Esperanto",
        "native": "Esperanto",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "haw",
        "name": "Hawaiian",
        "native": "ʻŌlelo Hawaiʻi",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "mi",
        "name": "Maori",
        "native": "Te Reo Māori",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sm",
        "name": "Samoan",
        "native": "Gagana Sāmoa",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ps",
        "name": "Pashto",
        "native": "پښتو",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ku",
        "name": "Kurdish",
        "native": "Kurdî (کوردی)",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "sd",
        "name": "Sindhi",
        "native": "سنڌي",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "or",
        "name": "Odia",
        "native": "ଓଡ଼ିଆ",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "as",
        "name": "Assamese",
        "native": "অসমীয়া",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "ug",
        "name": "Uyghur",
        "native": "ئۇيغۇرچە",
        "hasVoice": false,
        "isBundled": false
    },
    {
        "code": "yi",
        "name": "Yiddish",
        "native": "ייִדיש",
        "hasVoice": false,
        "isBundled": false
    }
];

const i18nDict = {
    "Ad": {
        "ar": "إعلان",
        "bn": "বিজ্ঞাপন",
        "hi": "विज्ञापन",
        "es": "Anuncio",
        "fr": "Publicité",
        "it": "Pubblicità",
        "de": "Anzeige",
        "ru": "Реклама",
        "ja": "広告",
        "pt": "Anúncio",
        "tr": "Reklam",
        "he": "מוֹדָעָה",
        "zh": "广告",
        "ko": "광고",
        "id": "Iklan",
        "ur": "اشتہار",
        "fa": "آگهی"
    },
    "by": {
        "ar": "بقلم",
        "bn": "রচয়িতা",
        "hi": "द्वारा",
        "es": "por",
        "fr": "par",
        "it": "di",
        "de": "von",
        "ru": "автор",
        "ja": "著者",
        "pt": "por",
        "tr": "tarafından",
        "he": "עַל יְדֵי",
        "zh": "经过",
        "ko": "~에 의해",
        "id": "oleh",
        "ur": "کی طرف سے",
        "fa": "توسط"
    },
    "Guru Granth Sahib": {
        "ar": "جورو جرانث صاحب",
        "bn": "গুরু গ্রন্থ সাহিব",
        "hi": "गुरु ग्रंथ साहिब",
        "es": "Gurú Granth Sahib",
        "fr": "Guru Granth Sahib",
        "it": "Guru Granth Sahib",
        "de": "Guru Granth Sahib",
        "ru": "Гуру Грантх Сахиб",
        "pa": "ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ",
        "he": "גורו גרנת' סאהיב",
        "ja": "グル・グランス・サーヒブ",
        "zh": "古鲁·格兰特·萨希布",
        "ko": "전문가 그란스 사히브",
        "pt": "Guru Granth Sahib",
        "tr": "Guru Granth Sahib",
        "id": "Guru Granth Sahib",
        "ur": "گرو گرنتھ صاحب",
        "fa": "گورو گرانت صاحب",
        "nl": "Goeroe Granth Sahib",
        "pl": "Guru Granth Sahiba",
        "uk": "Гуру Грант Сахіб",
        "vi": "Đạo sư Granth Sahib",
        "af": "Guru Granth Sahib",
        "am": "ጉሩ ግራንት ሳሂብ",
        "as": "গুৰু গ্ৰন্থ চাহিব",
        "az": "Guru Granth Sahib",
        "be": "Гуру Грант Сахіб",
        "bg": "Гуру Грант Сахиб",
        "bs": "Guru Granth Sahib",
        "ca": "Guru Granth Sahib",
        "ceb": "Guru Granth Sahib",
        "cs": "Guru Granth Sahib",
        "cy": "Guru Granth Sahib",
        "da": "Guru Granth Sahib",
        "el": "Γκουρού Γκραντ Σαχίμπ",
        "eo": "Guruo Granth Sahib",
        "et": "Guru Granth Sahib",
        "eu": "Guru Granth Sahib",
        "fi": "Guru Granth Sahib",
        "fil": "Guru Granth Sahib",
        "ga": "Gúrú Granth Sahib",
        "gd": "Guru Granth Sahib",
        "gl": "Guru Granth Sahib",
        "gu": "ગુરુ ગ્રંથ સાહિબ",
        "ha": "Guru Granth Sahib",
        "haw": "ʻO Guru Granth Sahib",
        "hr": "Guru Granth Sahib",
        "hu": "Granth Sahib guru",
        "hy": "Գուրու Գրանթ Սահիբ",
        "ig": "Guru Granth Sahib",
        "is": "Sérfræðingur Granth Sahib",
        "jv": "Guru Granth Sahib",
        "ka": "გურუ გრანტ საჰიბი",
        "kk": "Гуру Грант Сахиб",
        "km": "លោក Guru Granth Sahib",
        "kn": "ಗುರು ಗ್ರಂಥ ಸಾಹಿಬ್",
        "ku": "Guru Granth Sahib",
        "ky": "Гуру Грант Сахиб",
        "la": "Guru Granth Sahib",
        "lo": "Guru Granth Sahib",
        "lt": "Guru Granthas Sahibas",
        "lv": "Guru Grants Sahibs",
        "mg": "Guru Granth Sahib",
        "mi": "Guru Granth Sahib",
        "mk": "Гуру Грант Сахиб",
        "ml": "ഗുരു ഗ്രന്ഥ സാഹിബ്",
        "mn": "Гуру Грант Сахиб",
        "mr": "गुरु ग्रंथ साहिब",
        "ms": "Guru Granth Sahib",
        "mt": "Guru Granth Sahib",
        "my": "Guru Granth Sahib",
        "ne": "गुरु ग्रन्थ साहिब",
        "no": "Guru Granth Sahib",
        "ny": "Guru Granth Sahib",
        "or": "ଗୁରୁ ଗ୍ରନ୍ଥ ସାହେବ |",
        "ps": "گرو گران صاحب",
        "ro": "Guru Granth Sahib",
        "rw": "Guru Granth Sahib",
        "sd": "گرو گرنٿ صاحب",
        "si": "ගුරු ග්‍රන්ත සාහිබ්",
        "sk": "Guru Granth Sahib",
        "sl": "Guru Granth Sahib",
        "sm": "Guru Granth Sahib",
        "sn": "Guru Granth Sahib",
        "so": "Guru Granth Sahib",
        "sq": "Guru Granth Sahib",
        "sr": "Гуру Грантх Сахиб",
        "st": "Guru Granth Sahib",
        "su": "Guru Granth Sahib",
        "sv": "Guru Granth Sahib",
        "sw": "Guru Granth Sahib",
        "ta": "குரு கிரந்த் சாஹிப்",
        "te": "గురు గ్రంథ్ సాహిబ్",
        "tg": "Гуру Грант Соҳиб",
        "th": "คุรุแกรนธ์ซาฮิบ",
        "tk": "Guru Granth Sahib",
        "ug": "Guru Granth Sahib",
        "uz": "Guru Granth Sahib",
        "xh": "Guru Granth Sahib",
        "yi": "גורו גראַנטה סאַהיב",
        "yo": "Guru Granth Sahib",
        "zu": "Guru Granth Sahib"
    },
    "Guru Nanak and the Sikh Religion": {
        "ar": "غورو ناناك والديانة السيخية",
        "bn": "গুরু নানক ও শিখ ধর্ম",
        "hi": "गुरु नानक और सिख धर्म",
        "es": "Guru Nanak y la religión sij",
        "fr": "Guru Nanak et la religion sikhe",
        "it": "Guru Nanak e la religione sikh",
        "de": "Guru Nanak und die Sikh-Religion",
        "ru": "Гуру Нанак и религия сикхов",
        "he": "גורו ננק והדת הסיקית",
        "ja": "グル・ナナクとシーク教",
        "zh": "古鲁纳纳克和锡克教",
        "ko": "구루 나낙과 시크교",
        "pt": "Guru Nanak e a religião Sikh",
        "tr": "Guru Nanak ve Sih Dini",
        "id": "Guru Nanak dan Agama Sikh",
        "ur": "گرو نانک اور سکھ مذہب",
        "fa": "گورو ناناک و مذهب سیک"
    },
    "Existentialism": {
        "ar": "الوجودية",
        "bn": "অস্তিত্ববাদ",
        "hi": "अस्तित्ववाद",
        "es": "Existencialismo",
        "fr": "Existentialisme",
        "it": "Esistenzialismo",
        "de": "Existenzialismus",
        "ru": "Экзистенциализм",
        "ja": "実存主義",
        "pt": "Existencialismo",
        "tr": "Varoluşçuluk",
        "he": "אקזיסטנציאליזם",
        "zh": "存在主义",
        "ko": "실존주의",
        "id": "Eksistensialisme",
        "ur": "وجودیت",
        "fa": "اگزیستانسیالیسم",
        "nl": "Existentialisme",
        "pl": "Egzystencjalizm",
        "uk": "Екзистенціалізм",
        "vi": "Chủ nghĩa hiện sinh",
        "af": "Eksistensialisme",
        "am": "ህላዌነት",
        "as": "অস্তিত্ববাদ",
        "az": "Ekzistensializm",
        "be": "Экзістэнцыялізм",
        "bg": "Екзистенциализъм",
        "bs": "Egzistencijalizam",
        "ca": "Existencialisme",
        "ceb": "Eksistensyalismo",
        "cs": "existencialismus",
        "cy": "dirfodaeth",
        "da": "Eksistentialisme",
        "el": "Υπαρξισμός",
        "eo": "Ekzistadismo",
        "et": "Eksistentsialism",
        "eu": "Existentzialismoa",
        "fi": "Eksistentialismi",
        "fil": "Eksistensyalismo",
        "ga": "Existentialism",
        "gd": "Existentialism",
        "gl": "Existencialismo",
        "gu": "અસ્તિત્વવાદ",
        "ha": "Halin wanzuwa",
        "haw": "ʻO ka manaʻo kūʻokoʻa",
        "hr": "egzistencijalizam",
        "hu": "Az egzisztencializmus",
        "hy": "Էկզիստենցիալիզմ",
        "ig": "Existentialism",
        "is": "Tilvistarhyggja",
        "jv": "Eksistensialisme",
        "ka": "ეგზისტენციალიზმი",
        "kk": "Экзистенциализм",
        "km": "អត្ថិភាពនិយម",
        "kn": "ಅಸ್ತಿತ್ವವಾದ",
        "ku": "Existentialism",
        "ky": "Экзистенциализм",
        "la": "Exsistentialismus",
        "lo": "ຄວາມເປັນຢູ່",
        "lt": "Egzistencializmas",
        "lv": "Eksistenciālisms",
        "mg": "Existentialism",
        "mi": "Ko te oranga oranga",
        "mk": "Егзистенцијализам",
        "ml": "അസ്തിത്വവാദം",
        "mn": "Экзистенциализм",
        "mr": "अस्तित्ववाद",
        "ms": "Eksistensialisme",
        "mt": "Eżistenzjaliżmu",
        "my": "ဖြစ်တည်မှုဝါဒ",
        "ne": "अस्तित्ववाद",
        "no": "Eksistensialisme",
        "ny": "Kukhalapo",
        "or": "ବିଦ୍ୟମାନତା |",
        "pa": "ਹੋਂਦਵਾਦ",
        "ps": "وجودیزم",
        "ro": "Existențialismul",
        "rw": "Kubaho",
        "sd": "وجوديت",
        "si": "පැවැත්මවාදය",
        "sk": "existencializmus",
        "sl": "Eksistencializem",
        "sm": "Fa'aolaola",
        "sn": "Existentialism",
        "so": "Jiritaanka",
        "sq": "Ekzistencializmi",
        "sr": "Егзистенцијализам",
        "st": "Existentialism",
        "su": "Eksistensialisme",
        "sv": "Existentialism",
        "sw": "Udhanaishi",
        "ta": "இருத்தலியல்",
        "te": "అస్తిత్వవాదం",
        "tg": "Экзистенциализм",
        "th": "อัตถิภาวนิยม",
        "tk": "Ekzistensializm",
        "ug": "Existentialism",
        "uz": "Ekzistensializm",
        "xh": "Ubukho bobukho",
        "yi": "עקסיסטענטיאַליזם",
        "yo": "Àṣàyé",
        "zu": "I-Existentialism"
    },
    "Stoicism": {
        "ar": "الرواقية",
        "bn": "স্টোয়িক দর্শন",
        "hi": "वैराग्यवाद",
        "es": "Estoicismo",
        "fr": "Stoïcisme",
        "it": "Stoicismo",
        "de": "Stoizismus",
        "ru": "Стоицизм",
        "ja": "ストア派",
        "pt": "Estoicismo",
        "tr": "Stoacılık",
        "he": "סטואיות",
        "zh": "斯多葛主义",
        "ko": "극기",
        "id": "Sikap tabah",
        "ur": "Stoicism",
        "fa": "رواقی گری",
        "nl": "Stoïcisme",
        "pl": "Stoicyzm",
        "uk": "Стоїцизм",
        "vi": "chủ nghĩa khắc kỷ",
        "af": "Stoïsisme",
        "am": "ስቶይሲዝም",
        "as": "ষ্ট’ইচিজম",
        "az": "Stoisizm",
        "be": "стаіцызм",
        "bg": "Стоицизъм",
        "bs": "Stoicizam",
        "ca": "Estoicisme",
        "ceb": "Stoicism",
        "cs": "Stoicismus",
        "cy": "Stoiciaeth",
        "da": "stoicisme",
        "el": "στωικισμός",
        "eo": "Stoikismo",
        "et": "Stoitsism",
        "eu": "Estoizismoa",
        "fi": "Stoalaisuus",
        "fil": "Stoicism",
        "ga": "Stoicism",
        "gd": "Stoicism",
        "gl": "Estoicismo",
        "gu": "સ્ટૉઇકિઝમ",
        "ha": "Stoicism",
        "haw": "ʻO ka Stoicism",
        "hr": "stoicizam",
        "hu": "Sztoicizmus",
        "hy": "Ստոիցիզմ",
        "ig": "Stoicism",
        "is": "Stóuspeki",
        "jv": "Stoicism",
        "ka": "სტოიციზმი",
        "kk": "Стоицизм",
        "km": "លទ្ធិនិយម",
        "kn": "ಸ್ಟೊಯಿಸಂ",
        "ku": "Stoaparêzî",
        "ky": "стоицизм",
        "la": "Stoicismo",
        "lo": "Stoicism",
        "lt": "Stoicizmas",
        "lv": "Stoicisms",
        "mg": "Stoicism",
        "mi": "Stoicism",
        "mk": "стоицизам",
        "ml": "സ്റ്റോയിസിസം",
        "mn": "Стоицизм",
        "mr": "स्टॉईसिझम",
        "ms": "Stoicisme",
        "mt": "Stoicism",
        "my": "အယူဝါဒ",
        "ne": "Stoicism",
        "no": "stoisisme",
        "ny": "Stoicism",
        "or": "ଷ୍ଟୋଇସିଜିମ୍ |",
        "pa": "ਸਟੋਇਸਿਜ਼ਮ",
        "ps": "Stoicism",
        "ro": "Stoicismul",
        "rw": "Stoicism",
        "sd": "اسٽائيڪ ازم",
        "si": "ස්ටොයික්වාදය",
        "sk": "Stoicizmus",
        "sl": "Stoicizem",
        "sm": "Totoi",
        "sn": "Stoicism",
        "so": "Stoicism",
        "sq": "Stoicizmi",
        "sr": "стоицизам",
        "st": "Bo-Stoicism",
        "su": "Stoicism",
        "sv": "stoicism",
        "sw": "Ustoa",
        "ta": "ஸ்டோயிசம்",
        "te": "స్టోయిసిజం",
        "tg": "Стоицизм",
        "th": "ลัทธิสโตอิกนิยม",
        "tk": "Stoizm",
        "ug": "Stoicism",
        "uz": "Stoitsizm",
        "xh": "UbuStoyike",
        "yi": "סטאָיציזם",
        "yo": "Stoicism",
        "zu": "I-Stoicism"
    },
    "Absurdism": {
        "ar": "العبثية",
        "bn": "অ্যাবসার্ডিজম",
        "hi": "विसंगततावाद",
        "es": "Absurdismo",
        "fr": "Absurdisme",
        "it": "Assurdismo",
        "de": "Absurdismus",
        "ru": "Абсурдизм",
        "ja": "不条理主義",
        "pt": "Absurdismo",
        "tr": "Absürdizm",
        "he": "אבסורדיזם",
        "zh": "荒诞主义",
        "ko": "부조리주의",
        "id": "Absurdisme",
        "ur": "بیہودہ پن",
        "fa": "پوچ گرایی"
    },
    "Nihilism": {
        "ar": "العدمية",
        "bn": "শূন্যতাবাদ",
        "hi": "शून्यवाद",
        "es": "Nihilismo",
        "fr": "Nihilisme",
        "it": "Nichilismo",
        "de": "Nihilismus",
        "ru": "Нигилизм",
        "ja": "虚無主義",
        "pt": "Niilismo",
        "tr": "Nihilizm",
        "he": "ניהיליזם",
        "zh": "虚无主义",
        "ko": "허무주의",
        "id": "Nihilisme",
        "ur": "نحیل ازم",
        "fa": "نیهیلیسم"
    },
    "Taoism": {
        "ar": "الطاوية",
        "bn": "তাওধর্ম",
        "hi": "ताओ धर्म",
        "es": "Taoísmo",
        "fr": "Taoïsme",
        "it": "Taoismo",
        "de": "Taoismus",
        "ru": "Даосизм",
        "ja": "道教",
        "pt": "Taoísmo",
        "tr": "Taoizm",
        "he": "טאואיזם",
        "zh": "道教",
        "ko": "도교",
        "id": "Taoisme",
        "ur": "تاؤ ازم",
        "fa": "تائوئیسم"
    },
    "Confucianism": {
        "ar": "الكونفوشيوسية",
        "bn": "কনফুসীয় ধর্ম",
        "hi": "कन्फ्यूशियस धर्म",
        "es": "Confucianismo",
        "fr": "Confucianisme",
        "it": "Confucianesimo",
        "de": "Konfuzianismus",
        "ru": "Конфуцианство",
        "ja": "儒教",
        "pt": "Confucionismo",
        "tr": "Konfüçyüsçülük",
        "he": "קונפוציאניזם",
        "zh": "儒",
        "ko": "유도",
        "id": "Konfusianisme",
        "ur": "کنفیوشس ازم",
        "fa": "کنفوسیوسیسم"
    },
    "Philosophy": {
        "ar": "الفلسفة",
        "bn": "দর্শন",
        "hi": "दर्शन",
        "es": "Filosofía",
        "fr": "Philosophie",
        "it": "Filosofia",
        "de": "Philosophie",
        "ru": "Философия",
        "ja": "哲学",
        "pt": "Filosofia",
        "tr": "Felsefe",
        "id": "Filsafat",
        "ur": "فلسفہ",
        "zh": "哲学",
        "ko": "철학",
        "fa": "فلسفه",
        "he": "פילוסופיה",
        "nl": "Filosofie",
        "pl": "Filozofia",
        "uk": "Філософія",
        "vi": "Triết học",
        "af": "Filosofie",
        "am": "ፍልስፍና",
        "as": "দৰ্শন",
        "az": "Fəlsəfə",
        "be": "Філасофія",
        "bg": "Философия",
        "bs": "Filozofija",
        "ca": "Filosofia",
        "ceb": "Pilosopiya",
        "cs": "Filosofie",
        "cy": "Athroniaeth",
        "da": "Filosofi",
        "el": "Φιλοσοφία",
        "eo": "Filozofio",
        "et": "Filosoofia",
        "eu": "Filosofia",
        "fi": "Filosofia",
        "fil": "Pilosopiya",
        "ga": "Fealsúnacht",
        "gd": "Feallsanachd",
        "gl": "Filosofía",
        "gu": "તત્વજ્ઞાન",
        "ha": "Falsafa",
        "haw": "Pilikino",
        "hr": "Filozofija",
        "hu": "Filozófia",
        "hy": "Փիլիսոփայություն",
        "ig": "Nkà ihe ọmụma",
        "is": "Heimspeki",
        "jv": "Filsafat",
        "ka": "ფილოსოფია",
        "kk": "Философия",
        "km": "ទស្សនវិជ្ជា",
        "kn": "ತತ್ವಶಾಸ್ತ್ರ",
        "ku": "Felsefe",
        "ky": "Философия",
        "la": "Philosophia",
        "lo": "ປັດຊະຍາ",
        "lt": "Filosofija",
        "lv": "Filozofija",
        "mg": "Filozofia",
        "mi": "Te whakaaro whakaaro",
        "mk": "Филозофија",
        "ml": "തത്വശാസ്ത്രം",
        "mn": "Философи",
        "mr": "तत्वज्ञान",
        "ms": "Falsafah",
        "mt": "Filosofija",
        "my": "ဒဿန",
        "ne": "दर्शन",
        "no": "Filosofi",
        "ny": "Nzeru",
        "or": "ଦର୍ଶନ",
        "pa": "ਫਿਲਾਸਫੀ",
        "ps": "فلسفه",
        "ro": "Filosofie",
        "rw": "Filozofiya",
        "sd": "فلسفو",
        "si": "දර්ශනය",
        "sk": "filozofia",
        "sl": "Filozofija",
        "sm": "filosofia",
        "sn": "Uzivi",
        "so": "Falsafadda",
        "sq": "Filozofia",
        "sr": "филозофија",
        "st": "Filosofi",
        "su": "Filsafat",
        "sv": "Filosofi",
        "sw": "Falsafa",
        "ta": "தத்துவம்",
        "te": "తత్వశాస్త్రం",
        "tg": "Фалсафа",
        "th": "ปรัชญา",
        "tk": "Filosofiýa",
        "ug": "پەلسەپە",
        "uz": "Falsafa",
        "xh": "Ifilosofi",
        "yi": "פילאָסאָפיע",
        "yo": "Imoye",
        "zu": "Ifilosofi"
    },
    "Psychology": {
        "ar": "علم النفس",
        "bn": "মনোবিজ্ঞান",
        "hi": "मनोविज्ञान",
        "es": "Psicología",
        "fr": "Psychologie",
        "it": "Psicologia",
        "de": "Psychologie",
        "ru": "Психология",
        "ja": "心理学",
        "pt": "Psicologia",
        "tr": "Psikoloji",
        "he": "פְּסִיכוֹלוֹגִיָה",
        "zh": "心理学",
        "ko": "심리학",
        "id": "Psikologi",
        "ur": "نفسیات",
        "fa": "روانشناسی"
    },
    "Folder deleted": {
        "bn": "ফোল্ডার মুছে ফেলা হয়েছে",
        "hi": "फ़ोल्डर हटा दिया गया",
        "ar": "تم حذف المجلد",
        "es": "Carpeta eliminada",
        "fr": "Dossier supprimé",
        "it": "Cartella eliminata",
        "de": "Ordner gelöscht",
        "ru": "Папка удалена",
        "ja": "フォルダを削除しました",
        "pt": "Pasta excluída",
        "tr": "Klasör silindi",
        "id": "Folder dihapus",
        "ur": "فولڈر حذف کر دیا گیا",
        "zh": "文件夹已删除",
        "ko": "폴더 삭제됨",
        "fa": "پوشه حذف شد",
        "he": "התיקיה נמחקה"
    },
    "Verse deleted": {
        "bn": "আয়াত মুছে ফেলা হয়েছে",
        "hi": "श्लोक हटा दिया गया",
        "ar": "تم حذف الآية",
        "es": "Versículo eliminado",
        "fr": "Verset supprimé",
        "it": "Versetto eliminato",
        "de": "Vers gelöscht",
        "ru": "Стих удален",
        "ja": "詩を削除しました",
        "pt": "Versículo excluído",
        "tr": "Ayet silindi",
        "id": "Ayat dihapus",
        "ur": "آیت حذف کر دی گئی",
        "zh": "经文已删除",
        "ko": "구절 삭제됨",
        "fa": "آیه حذف شد",
        "he": "הפסוק נמחק"
    },
    "Folder restored": {
        "bn": "ফোল্ডার পুনরুদ্ধার করা হয়েছে",
        "hi": "फ़ोल्डर पुनर्स्थापित किया गया",
        "ar": "تمت استعادة المجلد",
        "es": "Carpeta restaurada",
        "fr": "Dossier restauré",
        "it": "Cartella ripristinata",
        "de": "Ordner wiederhergestellt",
        "ru": "Папка восстановлена",
        "ja": "フォルダを復元しました",
        "pt": "Pasta restaurada",
        "tr": "Klasör geri yüklendi",
        "id": "Folder dipulihkan",
        "ur": "فولڈر بحال کر دیا گیا",
        "zh": "文件夹已恢复",
        "ko": "폴더 복원됨",
        "fa": "پوشه بازیابی شد",
        "he": "התיקיה שוחזרה"
    },
    "Verse restored": {
        "bn": "আয়াত পুনরুদ্ধার করা হয়েছে",
        "hi": "श्लोक पुनर्स्थापित किया गया",
        "ar": "تمت استعادة الآية",
        "es": "Versículo restaurado",
        "fr": "Verset restauré",
        "it": "Versetto ripristinato",
        "de": "Vers wiederhergestellt",
        "ru": "Стих восстановлен",
        "ja": "詩を復元しました",
        "pt": "Versículo restaurado",
        "tr": "Ayet geri yüklendi",
        "id": "Ayat dipulihkan",
        "ur": "آیت بحال کر دی گئی",
        "zh": "经文已恢复",
        "ko": "구절 복원됨",
        "fa": "آیه بازیابی شد",
        "he": "הפסוק שוחזר"
    },
    "Verse copied": {
        "bn": "আয়াত কপি করা হয়েছে",
        "hi": "श्लोक कॉपी किया गया",
        "ar": "تم نسخ الآية",
        "es": "Versículo copiado",
        "fr": "Verset copié",
        "it": "Versetto copiato",
        "de": "Vers kopiert",
        "ru": "Стих скопирован",
        "ja": "詩をコピーしました",
        "pt": "Versículo copiado",
        "tr": "Ayet kopyalandı",
        "he": "הפסוק הועתק",
        "zh": "复制的诗句",
        "ko": "복사된 구절",
        "id": "Ayat disalin",
        "ur": "آیت نقل کی گئی۔",
        "fa": "آیه کپی شده"
    },
    "Bookmark removed": {
        "bn": "বুকমার্ক সরানো হয়েছে",
        "hi": "बुकमार्क हटाया गया",
        "ar": "تمت إزالة الإشارة المرجعية",
        "es": "Marcador eliminado",
        "fr": "Signet supprimé",
        "it": "Segnalibro rimosso",
        "de": "Lesezeichen entfernt",
        "ru": "Закладка удалена",
        "ja": "ブックマークを削除しました",
        "pt": "Marcador removido",
        "tr": "Yer işareti kaldırıldı",
        "he": "הסימניה הוסרה",
        "zh": "书签已删除",
        "ko": "북마크가 삭제되었습니다.",
        "id": "Penanda dihapus",
        "ur": "بک مارک ہٹا دیا گیا۔",
        "fa": "نشانک حذف شد"
    },
    "Saved to Bookmarks (All)": {
        "bn": "বুকমার্কে সংরক্ষিত",
        "hi": "बुकमार्क में सहेजा गया",
        "ar": "تم الحفظ في الإشارات المرجعية",
        "es": "Guardado en Marcadores",
        "fr": "Enregistré dans les signets",
        "it": "Salvato nei Preferiti",
        "de": "In Lesezeichen gespeichert",
        "ru": "Сохранено в закладки",
        "ja": "ブックマークに保存しました",
        "pt": "Salvo nos Favoritos",
        "tr": "Yer İşaretlerine Kaydedildi",
        "he": "נשמר בסימניות (הכל)",
        "zh": "保存到书签（全部）",
        "ko": "북마크에 저장됨(전체)",
        "id": "Disimpan ke Bookmark (Semua)",
        "ur": "بک مارکس میں محفوظ کیا گیا (تمام)",
        "fa": "ذخیره شده در نشانک ها (همه)"
    },
    "Undo": {
        "bn": "পূর্বাবস্থায় ফেরত",
        "hi": "पूर्ववत करें",
        "ar": "تراجع",
        "es": "Deshacer",
        "fr": "Annuler",
        "it": "Annulla",
        "de": "Rückgängig",
        "ru": "Отменить",
        "ja": "元に戻す",
        "pt": "Desfazer",
        "tr": "Geri Al",
        "id": "Urungkan",
        "ur": "واپس",
        "zh": "撤销",
        "ko": "실행 취소",
        "fa": "واگرد",
        "he": "לְבַטֵל"
    },
    "Meditations": {
        "bn": "মেডিটেশনস",
        "hi": "मेडिटेशन",
        "es": "Meditaciones",
        "he": "מדיטציות",
        "ar": "تأملات",
        "ja": "瞑想",
        "zh": "沉思",
        "ko": "명상",
        "fr": "Méditations",
        "de": "Meditationen",
        "ru": "Медитации",
        "it": "Meditazioni",
        "pt": "Meditações",
        "tr": "Meditasyonlar",
        "id": "Meditasi",
        "ur": "مراقبہ",
        "fa": "مدیتیشن ها"
    },
    "Talmud": {
        "bn": "তালমুদ",
        "hi": "तालमुद",
        "ar": "التلمود",
        "he": "תלמוד",
        "es": "Talmud",
        "ja": "タルムード",
        "zh": "塔木德",
        "ko": "탈무드",
        "fr": "Talmud",
        "de": "Talmud",
        "ru": "Талмуд",
        "it": "Talmud",
        "pt": "Talmude",
        "tr": "Talmud",
        "id": "Talmud",
        "ur": "تلمود",
        "fa": "تلمود"
    },
    "Tanakh": {
        "bn": "তানাক",
        "hi": "तनाख",
        "ar": "التناخ",
        "he": "תנ\"ך",
        "es": "Tanaj",
        "ja": "タナク",
        "zh": "塔纳赫",
        "ko": "타나크",
        "fr": "Tanakh",
        "de": "Tanach",
        "ru": "Танах",
        "it": "Tanakh",
        "pt": "Tanakh",
        "tr": "Tanah",
        "id": "Tanakh",
        "ur": "تنخ",
        "fa": "تناخ"
    },
    "Torah": {
        "bn": "তোরাহ",
        "hi": "तोराह",
        "ar": "التوراة",
        "he": "תורה",
        "es": "Torá",
        "ja": "トーラー",
        "zh": "妥拉",
        "ko": "토라",
        "fr": "Torah",
        "de": "Thora",
        "ru": "Тора",
        "it": "Torah",
        "pt": "Torá",
        "tr": "Tevrat",
        "id": "Torah",
        "ur": "تورات",
        "fa": "تورات"
    },
    "Proverbs": {
        "bn": "হিতোপদেশ",
        "hi": "नीतिवचन",
        "ar": "الأمثال",
        "es": "Proverbios",
        "fr": "Proverbes",
        "it": "Proverbi",
        "de": "Sprüche",
        "ru": "Притчи",
        "he": "משלי",
        "ja": "ことわざ",
        "zh": "箴言",
        "ko": "잠언",
        "pt": "Provérbios",
        "tr": "Atasözleri",
        "id": "Amsal",
        "ur": "کہاوتیں",
        "fa": "ضرب المثل ها",
        "nl": "Spreuken",
        "pl": "Przysłowia",
        "uk": "Прислів'я",
        "vi": "Tục ngữ",
        "af": "Spreuke",
        "am": "ምሳሌ",
        "as": "হিতোপদেশ",
        "az": "atalar sözləri",
        "be": "Прыказкі",
        "bg": "Притчи",
        "bs": "Izreke",
        "ca": "Proverbis",
        "ceb": "Mga Proverbio",
        "cs": "Přísloví",
        "cy": "Diarhebion",
        "da": "Ordsprog",
        "el": "Παροιμίες",
        "eo": "Proverboj",
        "et": "Vanasõnad",
        "eu": "Atsotitzak",
        "fi": "Sananlaskut",
        "fil": "Kawikaan",
        "ga": "Seanfhocal",
        "gd": "Seanfhacail",
        "gl": "Proverbios",
        "gu": "કહેવતો",
        "ha": "Karin Magana",
        "haw": "ʻŌlelo ʻōlelo",
        "hr": "Izreke",
        "hu": "Példabeszédek",
        "hy": "Առակներ",
        "ig": "Ilu",
        "is": "Orðskviðir",
        "jv": "Paribasan",
        "ka": "ანდაზები",
        "kk": "Мақал-мәтелдер",
        "km": "សុភាសិត",
        "kn": "ಗಾದೆಗಳು",
        "ku": "Proverbs",
        "ky": "Накыл сөздөр",
        "la": "Proverbia",
        "lo": "ສຸພາສິດ",
        "lt": "Patarlės",
        "lv": "Sakāmvārdi",
        "mg": "Ohabolana",
        "mi": "Whakatauki",
        "mk": "Поговорки",
        "ml": "സദൃശവാക്യങ്ങൾ",
        "mn": "Сургаалт үгс",
        "mr": "सुविचार",
        "ms": "Peribahasa",
        "mt": "Proverbji",
        "my": "သု",
        "ne": "हितोपदेश",
        "no": "Ordspråk",
        "ny": "Miyambi",
        "or": "ହିତୋପଦେଶ",
        "pa": "ਕਹਾਵਤਾਂ",
        "ps": "متلونه",
        "ro": "Proverbe",
        "rw": "Imigani",
        "sd": "امثال",
        "si": "හිතෝපදේශ",
        "sk": "Príslovia",
        "sl": "Pregovori",
        "sm": "Faataoto",
        "sn": "Zvirevo",
        "so": "Maahmaahyo",
        "sq": "Fjalët e urta",
        "sr": "пословице",
        "st": "Liproverbia",
        "su": "Paribasa",
        "sv": "Ordspråk",
        "sw": "Methali",
        "ta": "பழமொழிகள்",
        "te": "సామెతలు",
        "tg": "Масалҳо",
        "th": "สุภาษิต",
        "tk": "Süleýmanyň pähimleri",
        "ug": "ماقال-تەمسىللەر",
        "uz": "Hikmatlar",
        "xh": "IMizekeliso",
        "yi": "משלי",
        "yo": "Òwe",
        "zu": "Izaga"
    },
    "Psalms": {
        "bn": "গীতসংহিতা",
        "hi": "भजन संहिता",
        "ar": "المزامير",
        "es": "Salmos",
        "fr": "Psaumes",
        "it": "Salmi",
        "de": "Psalmen",
        "ru": "Псалтирь",
        "he": "תהילים",
        "ja": "詩篇",
        "zh": "诗篇",
        "ko": "시편",
        "pt": "Salmos",
        "tr": "Mezmurlar",
        "id": "Mazmur",
        "ur": "زبور",
        "fa": "مزامیر",
        "nl": "Psalmen",
        "pl": "Psalmy",
        "uk": "Псалми",
        "vi": "Thánh vịnh",
        "af": "Psalms",
        "am": "መዝሙራት",
        "as": "গীতমালা",
        "az": "Zəbur",
        "be": "Псалтыр",
        "bg": "Псалми",
        "bs": "Psalmi",
        "ca": "Salms",
        "ceb": "Mga Salmo",
        "cs": "žalmy",
        "cy": "Salmau",
        "da": "Salmer",
        "el": "Ψαλμοί",
        "eo": "Psalmoj",
        "et": "Psalmid",
        "eu": "Salmoak",
        "fi": "Psalmit",
        "fil": "Mga Awit",
        "ga": "Sailm",
        "gd": "Sailm",
        "gl": "Salmos",
        "gu": "ગીતશાસ્ત્ર",
        "ha": "Zabura",
        "haw": "Halelu",
        "hr": "Psalmi",
        "hu": "Zsoltárok",
        "hy": "Սաղմոսներ",
        "ig": "Abụ Ọma",
        "is": "Sálmar",
        "jv": "Masmur",
        "ka": "ფსალმუნები",
        "kk": "Забур жырлары",
        "km": "ទំនុកតម្កើង",
        "kn": "ಕೀರ್ತನೆಗಳು",
        "ku": "Zebûr",
        "ky": "Забур",
        "la": "Psalmi",
        "lo": "ເພງສັນລະເສີນ",
        "lt": "Psalmės",
        "lv": "Psalmi",
        "mg": "Salamo",
        "mi": "Waiata",
        "mk": "Псалми",
        "ml": "സങ്കീർത്തനങ്ങൾ",
        "mn": "Дуулал",
        "mr": "स्तोत्र",
        "ms": "Mazmur",
        "mt": "Salmi",
        "my": "ဆာလံ",
        "ne": "भजन",
        "no": "Salmer",
        "ny": "Masalmo",
        "or": "ଗୀତସଂହିତା",
        "pa": "ਜ਼ਬੂਰ",
        "ps": "زبور",
        "ro": "Psalmii",
        "rw": "Zaburi",
        "sd": "زبور",
        "si": "ගීතාවලිය",
        "sk": "žalmy",
        "sl": "Psalmi",
        "sm": "Salamo",
        "sn": "Mapisarema",
        "so": "Sabuurrada",
        "sq": "Psalmet",
        "sr": "Псалми",
        "st": "Lipesaleme",
        "su": "Jabur",
        "sv": "Psalmer",
        "sw": "Zaburi",
        "ta": "சங்கீதம்",
        "te": "కీర్తనలు",
        "tg": "Забур",
        "th": "สดุดี",
        "tk": "Zebur",
        "ug": "زەبۇر",
        "uz": "Zabur",
        "xh": "Iindumiso",
        "yi": "תהלים",
        "yo": "Psalmu",
        "zu": "Amahubo"
    },
    "John": {
        "bn": "যোহন",
        "hi": "यूहन्ना",
        "ar": "يوحنا",
        "es": "Juan",
        "fr": "Jean",
        "it": "Giovanni",
        "de": "Johannes",
        "ru": "Иоанн",
        "he": "יוחנן",
        "ja": "ジョン",
        "zh": "约翰",
        "ko": "남자",
        "pt": "John",
        "tr": "John",
        "id": "Yohanes",
        "ur": "جان",
        "fa": "جان",
        "nl": "Johannes",
        "pl": "Jan",
        "uk": "Джон",
        "vi": "John",
        "af": "John",
        "am": "ዮሐንስ",
        "as": "জন",
        "az": "John",
        "be": "Джон",
        "bg": "Джон",
        "bs": "John",
        "ca": "Joan",
        "ceb": "Juan",
        "cs": "Johne",
        "cy": "loan",
        "da": "John",
        "el": "John",
        "eo": "Johano",
        "et": "John",
        "eu": "Joan",
        "fi": "John",
        "fil": "John",
        "ga": "Eoin",
        "gd": "Iain",
        "gl": "Xoán",
        "gu": "જ્હોન",
        "ha": "John",
        "haw": "John",
        "hr": "Ivana",
        "hu": "John",
        "hy": "Ջոն",
        "ig": "Jọn",
        "is": "Jóhannes",
        "jv": "John",
        "ka": "იოანე",
        "kk": "Джон",
        "km": "ចន",
        "kn": "ಜಾನ್",
        "ku": "John",
        "ky": "Жон",
        "la": "John",
        "lo": "ຈອນ",
        "lt": "Jonas",
        "lv": "Džons",
        "mg": "Jaona",
        "mi": "Hone",
        "mk": "Џон",
        "ml": "ജോൺ",
        "mn": "Жон",
        "mr": "जॉन",
        "ms": "John",
        "mt": "John",
        "my": "ယော",
        "ne": "जोन",
        "no": "John",
        "ny": "Yohane",
        "or": "ଜନ୍",
        "pa": "ਜੌਨ",
        "ps": "جان",
        "ro": "Ioane",
        "rw": "Yohana",
        "sd": "جان",
        "si": "ජෝන්",
        "sk": "John",
        "sl": "Janez",
        "sm": "Ioane",
        "sn": "Johani",
        "so": "John",
        "sq": "Gjoni",
        "sr": "Јохн",
        "st": "Johanne",
        "su": "John",
        "sv": "John",
        "sw": "Yohana",
        "ta": "ஜான்",
        "te": "జాన్",
        "tg": "Ҷон",
        "th": "จอห์น",
        "tk": "Jon",
        "ug": "John",
        "uz": "Jon",
        "xh": "UYohane",
        "yi": "יוחנן",
        "yo": "John",
        "zu": "UJohane"
    },
    "Luke": {
        "bn": "লূক",
        "hi": "लूका",
        "ar": "لوقا",
        "es": "Lucas",
        "fr": "Luc",
        "it": "Luca",
        "de": "Lukas",
        "ru": "Лука",
        "he": "לוקאס",
        "ja": "ルーク",
        "zh": "卢克",
        "ko": "루크",
        "pt": "Lucas",
        "tr": "Luka",
        "id": "Lukas",
        "ur": "لیوک",
        "fa": "لوک",
        "nl": "Lucas",
        "pl": "Łukasz",
        "uk": "Люк",
        "vi": "Luke",
        "af": "Lukas",
        "am": "ሉቃ",
        "as": "লুক",
        "az": "Luka",
        "be": "Лука",
        "bg": "Лука",
        "bs": "Luke",
        "ca": "Luke",
        "ceb": "Lucas",
        "cs": "Luke",
        "cy": "Luc",
        "da": "Luke",
        "el": "Λουκ",
        "eo": "Luko",
        "et": "Luke",
        "eu": "Luke",
        "fi": "Luke",
        "fil": "Luke",
        "ga": "Lúcás",
        "gd": "Lucas",
        "gl": "Lucas",
        "gu": "લ્યુક",
        "ha": "Luka",
        "haw": "Luke",
        "hr": "Luke",
        "hu": "Luke",
        "hy": "Ղուկաս",
        "ig": "Luk",
        "is": "Lúkas",
        "jv": "Lukas",
        "ka": "ლუკა",
        "kk": "Лұқа",
        "km": "លូកា",
        "kn": "ಲ್ಯೂಕ್",
        "ku": "Luke",
        "ky": "Лука",
        "la": "Luc",
        "lo": "ລູກາ",
        "lt": "Lukas",
        "lv": "Lūks",
        "mg": "Lioka",
        "mi": "Ruka",
        "mk": "Лука",
        "ml": "ലൂക്കോസ്",
        "mn": "Лук",
        "mr": "ल्यूक",
        "ms": "Lukas",
        "mt": "Luqa",
        "my": "လု",
        "ne": "लुक",
        "no": "Luke",
        "ny": "Luka",
        "or": "ଲୁକ",
        "pa": "ਲੂਕਾ",
        "ps": "لوک",
        "ro": "Luke",
        "rw": "Luka",
        "sd": "لوڪ",
        "si": "ලූක්",
        "sk": "Luke",
        "sl": "Luka",
        "sm": "Luka",
        "sn": "Ruka",
        "so": "Luukos",
        "sq": "Luka",
        "sr": "Луке",
        "st": "Luka",
        "su": "Lukas",
        "sv": "Luke",
        "sw": "Luka",
        "ta": "லூக்கா",
        "te": "లూకా",
        "tg": "Луқо",
        "th": "ลุค",
        "tk": "Luka",
        "ug": "لۇقا",
        "uz": "Luqo",
        "xh": "ULuka",
        "yi": "לוק",
        "yo": "Luku",
        "zu": "Luka"
    },
    "Mark": {
        "bn": "মার্ক",
        "hi": "मरकुस",
        "ar": "مرقس",
        "es": "Marcos",
        "fr": "Marc",
        "it": "Marco",
        "de": "Markus",
        "ru": "Марк",
        "he": "מרקוס",
        "ja": "マーク",
        "zh": "标记",
        "ko": "표시",
        "pt": "Marca",
        "tr": "İşaret",
        "id": "Tanda",
        "ur": "نشان",
        "fa": "علامت گذاری کنید",
        "nl": "Markeer",
        "pl": "Marek",
        "uk": "Марк",
        "vi": "Đánh dấu",
        "af": "Merk",
        "am": "ምልክት ያድርጉ",
        "as": "মাৰ্ক",
        "az": "Mark",
        "be": "Марк",
        "bg": "Марк",
        "bs": "Mark",
        "ca": "Marc",
        "ceb": "Mark",
        "cs": "Mark",
        "cy": "Marc",
        "da": "Mark",
        "el": "Mark",
        "eo": "Mark",
        "et": "Mark",
        "eu": "Markatu",
        "fi": "Mark",
        "fil": "Mark",
        "ga": "Marcáil",
        "gd": "Marc",
        "gl": "Marcos",
        "gu": "માર્ક",
        "ha": "Alama",
        "haw": "Maka",
        "hr": "Marko",
        "hu": "Mark",
        "hy": "Մարկ",
        "ig": "Mark",
        "is": "Mark",
        "jv": "Tandhani",
        "ka": "მარკო",
        "kk": "Белгілеу",
        "km": "ម៉ាក",
        "kn": "ಮಾರ್ಕ್",
        "ku": "Mark",
        "ky": "Марк",
        "la": "Mark",
        "lo": "ມາກ",
        "lt": "Pažymėti",
        "lv": "Atzīmēt",
        "mg": "Mark",
        "mi": "Mark",
        "mk": "Означи",
        "ml": "അടയാളപ്പെടുത്തുക",
        "mn": "Марк",
        "mr": "खूण करा",
        "ms": "Mark",
        "mt": "Mark",
        "my": "မှတ်သားပါ။",
        "ne": "मार्क",
        "no": "Mark",
        "ny": "Mark",
        "or": "ମାର୍କ",
        "pa": "ਮਾਰਕ",
        "ps": "مارک",
        "ro": "Mark",
        "rw": "Ikimenyetso",
        "sd": "نشان",
        "si": "ලකුණු කරන්න",
        "sk": "Marka",
        "sl": "Mark",
        "sm": "Mareko",
        "sn": "Mark",
        "so": "Calaamadee",
        "sq": "Mark",
        "sr": "Марк",
        "st": "Tšoaea",
        "su": "Tandaan",
        "sv": "Mark",
        "sw": "Weka alama",
        "ta": "குறி",
        "te": "మార్క్",
        "tg": "Марк",
        "th": "มาร์ค",
        "tk": "Bellik",
        "ug": "Mark",
        "uz": "Mark",
        "xh": "Phawula",
        "yi": "מארק",
        "yo": "Samisi",
        "zu": "Maka"
    },
    "Matthew": {
        "bn": "মথি",
        "hi": "मत्ती",
        "ar": "متى",
        "es": "Mateo",
        "fr": "Matthieu",
        "it": "Matteo",
        "de": "Matthäus",
        "ru": "Матфей",
        "he": "מתי",
        "ja": "マシュー",
        "zh": "马修",
        "ko": "매튜",
        "pt": "Mateus",
        "tr": "Matta",
        "id": "Matius",
        "ur": "میتھیو",
        "fa": "متیو",
        "nl": "Mattheüs",
        "pl": "Mateusz",
        "uk": "Матвій",
        "vi": "Matthew",
        "af": "Matteus",
        "am": "ማቴዎስ",
        "as": "মেথিউ",
        "az": "Metyu",
        "be": "Мацей",
        "bg": "Матей",
        "bs": "Matthew",
        "ca": "Mateu",
        "ceb": "Mateo",
        "cs": "Matthew",
        "cy": "Mathew",
        "da": "Matthew",
        "el": "Ματθαίος",
        "eo": "Mateo",
        "et": "Matthew",
        "eu": "Mateo",
        "fi": "Matthew",
        "fil": "Mateo",
        "ga": "Matha",
        "gd": "Mata",
        "gl": "Mateo",
        "gu": "મેથ્યુ",
        "ha": "Matiyu",
        "haw": "Mataio",
        "hr": "Matej",
        "hu": "Matthew",
        "hy": "Մեթյու",
        "ig": "Matiu",
        "is": "Matthías",
        "jv": "Matius",
        "ka": "მათე",
        "kk": "Матай",
        "km": "ម៉ាថាយ",
        "kn": "ಮ್ಯಾಥ್ಯೂ",
        "ku": "Matthew",
        "ky": "Матай",
        "la": "Matthaeus",
        "lo": "ມັດທາຍ",
        "lt": "Motiejus",
        "lv": "Metjū",
        "mg": "Matio",
        "mi": "Matiu",
        "mk": "Метју",
        "ml": "മത്തായി",
        "mn": "Матай",
        "mr": "मॅथ्यू",
        "ms": "Matthew",
        "mt": "Mattew",
        "my": "မက်သယူး",
        "ne": "म्याथ्यू",
        "no": "Matthew",
        "ny": "Mateyu",
        "or": "ମାଥିଉ",
        "pa": "ਮੈਥਿਊ",
        "ps": "میتیو",
        "ro": "Matei",
        "rw": "Matayo",
        "sd": "ميٿيو",
        "si": "මැතිව්",
        "sk": "Matúš",
        "sl": "Matej",
        "sm": "Mataio",
        "sn": "Mateu",
        "so": "Matthew",
        "sq": "Mateu",
        "sr": "Маттхев",
        "st": "Mattheu",
        "su": "Mateus",
        "sv": "Matthew",
        "sw": "Mathayo",
        "ta": "மத்தேயு",
        "te": "మాథ్యూ",
        "tg": "Матто",
        "th": "แมทธิว",
        "tk": "Matta",
        "ug": "مەتتا",
        "uz": "Metyu",
        "xh": "UMateyu",
        "yi": "מתיא",
        "yo": "Matteu",
        "zu": "Mathewu"
    },
    "Deuteronomy": {
        "bn": "দ্বিতীয় বিবরণ",
        "hi": "व्यवस्थाविवरण",
        "ar": "التثنية",
        "es": "Deuteronomio",
        "fr": "Deutéronome",
        "it": "Deuteronomio",
        "de": "Deuteronomium",
        "ru": "Второзаконие",
        "he": "דברים",
        "ja": "申命記",
        "zh": "申命记",
        "ko": "신명기",
        "pt": "Deuteronômio",
        "tr": "Tesniye",
        "id": "Ulangan",
        "ur": "Deuteronomy",
        "fa": "تثنیه",
        "nl": "Deuteronomium",
        "pl": "Powtórzonego Prawa",
        "uk": "Повторення Закону",
        "vi": "Phục truyền luật lệ ký",
        "af": "Deuteronomium",
        "am": "ዘዳግም",
        "as": "দ্বিতীয় বিবৰণ",
        "az": "Qanunun təkrarı",
        "be": "Другазаконне",
        "bg": "Второзаконие",
        "bs": "Deuteronomy",
        "ca": "Deuteronomi",
        "ceb": "Deuteronomio",
        "cs": "Deuteronomium",
        "cy": "Deuteronomium",
        "da": "Femte Mosebog",
        "el": "Δευτερονόμιο",
        "eo": "Readmono",
        "et": "Deuteronoomia",
        "eu": "Deuteronomioa",
        "fi": "Deuteronomy",
        "fil": "Deuteronomio",
        "ga": "Deotranaimí",
        "gd": "Deuteronomi",
        "gl": "Deuteronomio",
        "gu": "પુનર્નિયમ",
        "ha": "Kubawar Shari'a",
        "haw": "Deuteronomy",
        "hr": "Ponovljeni zakon",
        "hu": "Deuteronomium",
        "hy": "Երկրորդ Օրինաց",
        "ig": "Deuterọnọmi",
        "is": "5. Mósebók",
        "jv": "Pangandharing Toret",
        "ka": "მეორე კანონი",
        "kk": "Заңды қайталау",
        "km": "ចោទិយកថា",
        "kn": "ಧರ್ಮೋಪದೇಶಕಾಂಡ",
        "ku": "Deuteronomy",
        "ky": "Мыйзамды кайталоо",
        "la": "Deuteronomium",
        "lo": "ພຣະບັນຍັດສອງ",
        "lt": "Deuteronomija",
        "lv": "5. Mozus",
        "mg": "Deoteronomia",
        "mi": "Tiuteronomi",
        "mk": "Второзаконие",
        "ml": "നിയമാവർത്തനം",
        "mn": "Дэд хууль",
        "mr": "व्याख्या",
        "ms": "Ulangan",
        "mt": "Dewteronomju",
        "my": "တရားဟောရာ၊",
        "ne": "Deuteronomy",
        "no": "Femte Mosebok",
        "ny": "Deuteronomo",
        "or": "ଦ୍ୱିତୀୟ ବିବରଣ",
        "pa": "ਬਿਵਸਥਾ ਸਾਰ",
        "ps": "Deuteronomy",
        "ro": "Deuteronomul",
        "rw": "Gutegeka kwa kabiri",
        "sd": "Deuteronomy",
        "si": "ද්විතීය කථාව",
        "sk": "Deuteronómiu",
        "sl": "Deuteronomy",
        "sm": "Teuteronome",
        "sn": "Dhuteronomi",
        "so": "Sharciga Kunoqoshadiisa",
        "sq": "Ligji i Përtërirë",
        "sr": "Деутерономи",
        "st": "Deuteronoma",
        "su": "Ulangan",
        "sv": "Femte Mosebok",
        "sw": "Kumbukumbu la Torati",
        "ta": "உபாகமம்",
        "te": "ద్వితీయోపదేశకాండము",
        "tg": "Такрори Шариат",
        "th": "เฉลยธรรมบัญญัติ",
        "tk": "Kanun taglymaty",
        "ug": "تەۋرات قانۇنى",
        "uz": "Qonunlar",
        "xh": "iDuteronomi",
        "yi": "דעוטעראנאמיע",
        "yo": "Deuteronomi",
        "zu": "Duteronomi"
    },
    "Numbers": {
        "bn": "গণনা পুস্তক",
        "hi": "गिनती",
        "ar": "العدد",
        "es": "Números",
        "fr": "Nombres",
        "it": "Numeri",
        "de": "Numeri",
        "ru": "Числа",
        "he": "במדבר",
        "ja": "数字",
        "zh": "数字",
        "ko": "숫자",
        "pt": "Números",
        "tr": "Sayılar",
        "id": "Angka",
        "ur": "نمبرز",
        "fa": "اعداد",
        "nl": "Nummers",
        "pl": "Liczby",
        "uk": "Числа",
        "vi": "số",
        "af": "Getalle",
        "am": "ቁጥሮች",
        "as": "সংখ্যা",
        "az": "Nömrələr",
        "be": "Лічбы",
        "bg": "Числа",
        "bs": "Brojevi",
        "ca": "Nombres",
        "ceb": "Mga Numero",
        "cs": "Čísla",
        "cy": "Rhifau",
        "da": "Tal",
        "el": "Αριθμοί",
        "eo": "Nombroj",
        "et": "Numbrid",
        "eu": "Zenbakiak",
        "fi": "Numerot",
        "fil": "Mga numero",
        "ga": "Uimhreacha",
        "gd": "Àireamhan",
        "gl": "Números",
        "gu": "સંખ્યાઓ",
        "ha": "Lambobi",
        "haw": "Heluhelu",
        "hr": "Brojke",
        "hu": "Számok",
        "hy": "Թվեր",
        "ig": "Ọnụọgụ",
        "is": "Tölur",
        "jv": "Angka",
        "ka": "ნომრები",
        "kk": "Сандар",
        "km": "លេខ",
        "kn": "ಸಂಖ್ಯೆಗಳು",
        "ku": "Numbers",
        "ky": "Сандар",
        "la": "Numeri",
        "lo": "ຕົວເລກ",
        "lt": "Skaičiai",
        "lv": "Skaitļi",
        "mg": "Nomery",
        "mi": "Tau",
        "mk": "Броеви",
        "ml": "നമ്പറുകൾ",
        "mn": "Тоонууд",
        "mr": "संख्या",
        "ms": "Nombor",
        "mt": "Numri",
        "my": "နံပါတ်များ",
        "ne": "नम्बरहरू",
        "no": "Tall",
        "ny": "Nambala",
        "or": "ସଂଖ୍ୟାଗୁଡିକ",
        "pa": "ਨੰਬਰ",
        "ps": "شمېرې",
        "ro": "Numerele",
        "rw": "Imibare",
        "sd": "نمبر",
        "si": "අංක",
        "sk": "čísla",
        "sl": "Številke",
        "sm": "Numera",
        "sn": "Numeri",
        "so": "Tirooyinka",
        "sq": "Numrat",
        "sr": "Бројеви",
        "st": "Lipalo",
        "su": "Angka",
        "sv": "Siffror",
        "sw": "Nambari",
        "ta": "எண்கள்",
        "te": "సంఖ్యలు",
        "tg": "Рақамҳо",
        "th": "ตัวเลข",
        "tk": "Sanlar",
        "ug": "سان",
        "uz": "Raqamlar",
        "xh": "Amanani",
        "yi": "נומערן",
        "yo": "Awọn nọmba",
        "zu": "Izinombolo"
    },
    "Leviticus": {
        "bn": "লেবীয় পুস্তক",
        "hi": "लैव्यव्यवस्था",
        "ar": "اللاويين",
        "es": "Levítico",
        "fr": "Lévitique",
        "it": "Levitico",
        "de": "Levitikus",
        "ru": "Левит",
        "he": "ויקרא",
        "ja": "レビ記",
        "zh": "利未记",
        "ko": "레위기",
        "pt": "Levítico",
        "tr": "Levililer",
        "id": "Imamat",
        "ur": "Leviticus",
        "fa": "لاویان",
        "nl": "Leviticus",
        "pl": "Księga Kapłańska",
        "uk": "Левіт",
        "vi": "Lê-vi Ký",
        "af": "Levitikus",
        "am": "ዘሌዋውያን",
        "as": "লেবীয়া পুস্তক",
        "az": "Levililər",
        "be": "Левіт",
        "bg": "Левит",
        "bs": "Leviticus",
        "ca": "Levític",
        "ceb": "Levitico",
        "cs": "Leviticus",
        "cy": "Lefiticus",
        "da": "Tredje Mosebog",
        "el": "Λευιτικό",
        "eo": "Levitiko",
        "et": "Leviticus",
        "eu": "Lebitikoa",
        "fi": "Leviticus",
        "fil": "Levitico",
        "ga": "Léivíteas",
        "gd": "Lebhiticus",
        "gl": "Levítico",
        "gu": "લેવીટીકસ",
        "ha": "Leviticus",
        "haw": "Levitiko",
        "hr": "Levitski zakonik",
        "hu": "Leviticus",
        "hy": "Ղևտական",
        "ig": "Levitikọs",
        "is": "3. Mósebók",
        "jv": "Imamat",
        "ka": "ლევიანები",
        "kk": "Леуіліктер",
        "km": "លេវីវិន័យ",
        "kn": "ಲೆವಿಟಿಕಸ್",
        "ku": "Leviticus",
        "ky": "Лебилер",
        "la": "Leviticus",
        "lo": "ເລວີ",
        "lt": "Leviticus",
        "lv": "Leviticus",
        "mg": "Levitikosy",
        "mi": "Levitiko",
        "mk": "Левит",
        "ml": "ലേവ്യപുസ്തകം",
        "mn": "Левитүүд",
        "mr": "लेविटिकस",
        "ms": "Imamat",
        "mt": "Levitiku",
        "my": "ဝတ်ပြုရာကျမ်း",
        "ne": "लेविटिकस",
        "no": "Tredje Mosebok",
        "ny": "Levitiko",
        "or": "ଲେବୀୟ ପୁସ୍ତକ",
        "pa": "ਲੇਵੀਟਿਕਸ",
        "ps": "Leviticus",
        "ro": "Leviticul",
        "rw": "Abalewi",
        "sd": "Leviticus",
        "si": "ලෙවී කථාව",
        "sk": "Levitikus",
        "sl": "Leviticus",
        "sm": "Levitiko",
        "sn": "Revhitiko",
        "so": "Laawiyiintii",
        "sq": "Levitiku",
        "sr": "Левитицус",
        "st": "Levitike",
        "su": "Leviticus",
        "sv": "Tredje Mosebok",
        "sw": "Mambo ya Walawi",
        "ta": "லேவிடிகஸ்",
        "te": "లేవిటికస్",
        "tg": "левизодагон",
        "th": "เลวีนิติ",
        "tk": "Lewiler",
        "ug": "لاۋىيلار",
        "uz": "Levilar",
        "xh": "ILevitikus",
        "yi": "לעװיטיק",
        "yo": "Lefitiku",
        "zu": "Levitikusi"
    },
    "Exodus": {
        "bn": "যাত্রাপুস্তক",
        "hi": "निर्गमन",
        "ar": "الخروج",
        "es": "Éxodo",
        "fr": "Exode",
        "it": "Esodo",
        "de": "Exodus",
        "ru": "Исход",
        "he": "שמות",
        "ja": "出エジプト記",
        "zh": "出埃及记",
        "ko": "이동",
        "pt": "Êxodo",
        "tr": "Çıkış",
        "id": "Keluaran",
        "ur": "خروج",
        "fa": "خروج",
        "nl": "Uittocht",
        "pl": "Wyjście",
        "uk": "Вихід",
        "vi": "Cuộc di cư",
        "af": "Eksodus",
        "am": "ዘፀአት",
        "as": "যাত্ৰাপুস্তক",
        "az": "Çıxış",
        "be": "Зыход",
        "bg": "Изход",
        "bs": "Exodus",
        "ca": "Èxode",
        "ceb": "Exodo",
        "cs": "Exodus",
        "cy": "Ecsodus",
        "da": "Exodus",
        "el": "Έξοδος",
        "eo": "Eliro",
        "et": "Exodus",
        "eu": "Irteera",
        "fi": "Exodus",
        "fil": "Exodo",
        "ga": "Eaxodus",
        "gd": "Ecsodus",
        "gl": "Éxodo",
        "gu": "નિર્ગમન",
        "ha": "Fitowa",
        "haw": "Exodus",
        "hr": "Egzodus",
        "hu": "Exodus",
        "hy": "Ելք",
        "ig": "Ọpụpụ",
        "is": "Brottför",
        "jv": "Pangentasan",
        "ka": "გამოსვლა",
        "kk": "Мысырдан шығу",
        "km": "និក្ខមនំ",
        "kn": "ನಿರ್ಗಮನ",
        "ku": "Derketin",
        "ky": "Чыгуу",
        "la": "Exodus",
        "lo": "ອົບພະຍົບ",
        "lt": "Išėjimas",
        "lv": "Izceļošana",
        "mg": "Eksodosy",
        "mi": "Exodus",
        "mk": "Егзодус",
        "ml": "പുറപ്പാട്",
        "mn": "Египетээс гарсан",
        "mr": "निर्गमन",
        "ms": "Keluaran",
        "mt": "Eżodu",
        "my": "ထွက်မြောက်ရာ၊",
        "ne": "प्रस्थान",
        "no": "Exodus",
        "ny": "Eksodo",
        "or": "ଯାତ୍ରା",
        "pa": "ਕੂਚ",
        "ps": "خروج",
        "ro": "Exodul",
        "rw": "Kuva",
        "sd": "نڪتل",
        "si": "නික්මයාම",
        "sk": "Exodus",
        "sl": "Eksodus",
        "sm": "Esoto",
        "sn": "Ekisodho",
        "so": "Baxniintii",
        "sq": "Eksodi",
        "sr": "Екодус",
        "st": "Exoda",
        "su": "Budalan",
        "sv": "Exodus",
        "sw": "Kutoka",
        "ta": "வெளியேற்றம்",
        "te": "ఎక్సోడస్",
        "tg": "Хуруҷ",
        "th": "อพยพ",
        "tk": "Çykyş",
        "ug": "چىقىش",
        "uz": "Chiqish",
        "xh": "iEksodus",
        "yi": "עקסאָדוס",
        "yo": "Eksodu",
        "zu": "Eksodusi"
    },
    "Genesis": {
        "bn": "আদিপুস্তক",
        "hi": "उत्पत्ति",
        "ar": "التكوين",
        "es": "Génesis",
        "fr": "Genèse",
        "it": "Genesi",
        "de": "Genesis",
        "ru": "Бытие",
        "he": "בראשית",
        "ja": "創世記",
        "zh": "创世纪",
        "ko": "창세기",
        "pt": "Gênese",
        "tr": "Yaratılış",
        "id": "Asal",
        "ur": "پیدائش",
        "fa": "پیدایش",
        "nl": "Genesis",
        "pl": "Geneza",
        "uk": "Буття",
        "vi": "Sáng Thế Ký",
        "af": "Genesis",
        "am": "ኦሪት ዘፍጥረት",
        "as": "আদিপুস্তক",
        "az": "Yaradılış",
        "be": "Быццё",
        "bg": "Битие",
        "bs": "Genesis",
        "ca": "Gènesi",
        "ceb": "Genesis",
        "cs": "Genesis",
        "cy": "Genesis",
        "da": "Genesis",
        "el": "Γένεση",
        "eo": "Genezo",
        "et": "Genesis",
        "eu": "Genesia",
        "fi": "Genesis",
        "fil": "Genesis",
        "ga": "Geineasas",
        "gd": "Gheineas",
        "gl": "Xénese",
        "gu": "ઉત્પત્તિ",
        "ha": "Farawa",
        "haw": "Genesis",
        "hr": "Postanak",
        "hu": "Genesis",
        "hy": "Ծննդոց",
        "ig": "Jenesis",
        "is": "Mósebók",
        "jv": "Purwaning Dumadi",
        "ka": "გენეზისი",
        "kk": "Жаратылыс",
        "km": "លោកុប្បត្តិ",
        "kn": "ಜೆನೆಸಿಸ್",
        "ku": "Genesis",
        "ky": "Башталыш",
        "la": "Genesis",
        "lo": "ປະຖົມມະການ",
        "lt": "Genesis",
        "lv": "Genesis",
        "mg": "Genesisy",
        "mi": "Genesis",
        "mk": "Битие",
        "ml": "ഉല്പത്തി",
        "mn": "Эхлэл",
        "mr": "उत्पत्ती",
        "ms": "Kejadian",
        "mt": "Ġenesi",
        "my": "ကမ္ဘာဦး",
        "ne": "उत्पत्ति",
        "no": "Genesis",
        "ny": "Genesis",
        "or": "ଆଦିପୁସ୍ତକ",
        "pa": "ਉਤਪਤ",
        "ps": "پیدایښت",
        "ro": "Geneza",
        "rw": "Itangiriro",
        "sd": "پيدائش",
        "si": "උත්පත්ති",
        "sk": "Genesis",
        "sl": "Geneza",
        "sm": "Kenese",
        "sn": "Genesis",
        "so": "Bilowgii",
        "sq": "Zanafilla",
        "sr": "Генесис",
        "st": "Genese",
        "su": "Kajadian",
        "sv": "Genesis",
        "sw": "Mwanzo",
        "ta": "ஆதியாகமம்",
        "te": "ఆదికాండము",
        "tg": "Ҳастӣ",
        "th": "ปฐมกาล",
        "tk": "Gelip çykyş",
        "ug": "يارىتىلىش",
        "uz": "Ibtido",
        "xh": "IGenesis",
        "yi": "בראשית",
        "yo": "Genesisi",
        "zu": "Genesis"
    },
    "New Testament": {
        "bn": "নতুন নিয়ম",
        "hi": "नया नियम",
        "ar": "العهد الجديد",
        "es": "Nuevo Testamento",
        "he": "בְּרִית חֲדָשָׁה",
        "ja": "新約聖書",
        "zh": "新约",
        "ko": "신약 성서",
        "fr": "le Nouveau Testament",
        "de": "Neues Testament",
        "ru": "Новый Завет",
        "it": "Nuovo Testamento",
        "pt": "Novo Testamento",
        "tr": "Yeni Ahit",
        "id": "Perjanjian Baru",
        "ur": "نیا عہد نامہ",
        "fa": "عهد جدید"
    },
    "Old Testament": {
        "bn": "পুরাতন নিয়ম",
        "hi": "पुराना नियम",
        "ar": "العهد القديم",
        "es": "Antiguo Testamento",
        "he": "הברית הישנה",
        "ja": "旧約聖書",
        "zh": "旧约",
        "ko": "구약 성서",
        "fr": "Ancien Testament",
        "de": "Altes Testament",
        "ru": "Ветхий Завет",
        "it": "Antico Testamento",
        "pt": "Antigo Testamento",
        "tr": "Eski Ahit",
        "id": "Perjanjian Lama",
        "ur": "عہد نامہ قدیم",
        "fa": "عهد عتیق"
    },
    "Granth Sahib": {
        "bn": "গ্রন্থ সাহিব",
        "hi": "ग्रंथ साहिब",
        "pa": "ਗ੍ਰੰਥ ਸਾਹਿਬ",
        "he": "גרנת' סאהיב",
        "ar": "جرانث صاحب",
        "ja": "グラント・サーヒブ",
        "zh": "格兰斯·萨希布",
        "ko": "그란스 사히브",
        "es": "Granth Sahib",
        "fr": "Granth Sahib",
        "de": "Granth Sahib",
        "ru": "Грант Сахиб",
        "it": "Granth Sahib",
        "pt": "Granth Sahib",
        "tr": "Granth Sahib",
        "id": "Granth Sahib",
        "ur": "گرنتھ صاحب",
        "fa": "گرانت صاحب"
    },
    "Dhammapada": {
        "bn": "ধম্মপদ",
        "hi": "धम्मपद",
        "es": "Dhammapada",
        "he": "דהמפדה",
        "ar": "دهامابادا",
        "ja": "ダンマパダ",
        "zh": "法句经",
        "ko": "담마파다",
        "fr": "Dhammapada",
        "de": "Dhammapada",
        "ru": "Дхаммапада",
        "it": "Dhammapada",
        "pt": "Dhammapada",
        "tr": "Dhammapada",
        "id": "Dhammapada",
        "ur": "دھماپادا",
        "fa": "داماپادا",
        "nl": "Dhammapada",
        "pl": "Dhammapada",
        "uk": "Дхаммапада",
        "vi": "Kinh Pháp Cú",
        "af": "Dhammapada",
        "am": "ዳማፓዳ",
        "as": "ধম্মাপদ",
        "az": "Dhammapada",
        "be": "Дхамапада",
        "bg": "Даммапада",
        "bs": "Dhammapada",
        "ca": "Dhammapada",
        "ceb": "Dhammapada",
        "cs": "Dhammapada",
        "cy": "Dhammapada",
        "da": "Dhammapada",
        "el": "Dhammapada",
        "eo": "Dhammapada",
        "et": "Dhammapada",
        "eu": "Dhammapada",
        "fi": "Dhammapada",
        "fil": "Dhammapada",
        "ga": "Dhammapada",
        "gd": "Dhammapada",
        "gl": "Dhammapada",
        "gu": "ધમ્મપદ",
        "ha": "Dhammapada",
        "haw": "ʻO Dhammapada",
        "hr": "Dhammapada",
        "hu": "Dhammapada",
        "hy": "Dhammapada",
        "ig": "Dhammapada",
        "is": "Dhammapada",
        "jv": "Dhammapada",
        "ka": "დამაპადა",
        "kk": "Дхаммапада",
        "km": "ព្រះធម៌ទេសនា",
        "kn": "ಧಮ್ಮಪದ",
        "ku": "Dhammapada",
        "ky": "Dhammapada",
        "la": "Dhammapada",
        "lo": "ທັມມະ",
        "lt": "Dhammapada",
        "lv": "Dhammapada",
        "mg": "Dhammapada",
        "mi": "Dhammapada",
        "mk": "Дамапада",
        "ml": "ധമ്മപദം",
        "mn": "Даммапада",
        "mr": "धम्मपद",
        "ms": "Dhammapada",
        "mt": "Dhammapada",
        "my": "ဓမ္မပဒ",
        "ne": "धम्मपद",
        "no": "Dhammapada",
        "ny": "Dhammapada",
        "or": "ଧାମପଡା",
        "pa": "ਧੰਮਪਦਾ",
        "ps": "Dhammapada",
        "ro": "Dhammapada",
        "rw": "Dhammapada",
        "sd": "ڌماپا",
        "si": "ධම්මපදය",
        "sk": "Dhammapada",
        "sl": "Dhammapada",
        "sm": "Dhammapada",
        "sn": "Dhammapada",
        "so": "Dhammapada",
        "sq": "Dhammapada",
        "sr": "Дхаммапада",
        "st": "Dhammapada",
        "su": "Dhammapada",
        "sv": "Dhammapada",
        "sw": "Dhammapada",
        "ta": "தம்மபதம்",
        "te": "దమ్మపద",
        "tg": "Дхаммапада",
        "th": "ธัมมาปาทะ",
        "tk": "Dhammapada",
        "ug": "Dhammapada",
        "uz": "Dhammapada",
        "xh": "I-Dhammapada",
        "yi": "דאַממאַפּאַדאַ",
        "yo": "Dhammapada",
        "zu": "I-Dhammapada"
    },
    "Bhagavad Gita": {
        "bn": "শ্রীমদ্ভগবদ্গীতা",
        "hi": "श्रीमद्भगवद्गीता",
        "es": "Bhagavad Gita",
        "ar": "بهاغافاد غيتا",
        "sa": "श्रीमद्भगवद्गीता",
        "fr": "Bhagavad-Gita",
        "it": "Bhagavad Gita",
        "de": "Bhagavad Gita",
        "ru": "Бхагавад-гита",
        "he": "בהגוואד גיטה",
        "ja": "バガヴァッド・ギーター",
        "zh": "薄伽梵歌",
        "ko": "바가바드 기타",
        "pt": "Bhagavad Gita",
        "tr": "Bhagavad Gita",
        "id": "Bhagavad Gita",
        "ur": "بھگواد گیتا",
        "fa": "باگاواد گیتا",
        "nl": "Bhagavad Gita",
        "pl": "Bhagawadgita",
        "uk": "Бхагавад Гіта",
        "vi": "Bhagavad Gita",
        "af": "Bhagavad Gita",
        "am": "ብሃጋቫድ ጊታ",
        "as": "ভাগৱত গীতা",
        "az": "Bhaqavad Gita",
        "be": "Бхагавад Гіта",
        "bg": "Бхагавад Гита",
        "bs": "Bhagavad Gita",
        "ca": "Bhagavad Gita",
        "ceb": "Bhagavad Gita",
        "cs": "Bhagavadgíta",
        "cy": "Bhagavad Gita",
        "da": "Bhagavad Gita",
        "el": "Μπαγκαβάντ Γκίτα",
        "eo": "Bhagavad Gita",
        "et": "Bhagavad Gita",
        "eu": "Bhagavad Gita",
        "fi": "Bhagavad Gita",
        "fil": "Bhagavad Gita",
        "ga": "Bhagavad Gita",
        "gd": "Bhagavad Gita",
        "gl": "Bhagavad Gita",
        "gu": "ભગવદ ગીતા",
        "ha": "Bhagavad Gita",
        "haw": "Bhagavad Gita",
        "hr": "Bhagavad Gita",
        "hu": "Bhagavad Gita",
        "hy": "Բհագավադ Գիտա",
        "ig": "Bhagavad Gita",
        "is": "Bhagavad Gita",
        "jv": "Bhagawad Gita",
        "ka": "ბჰაგავად გიტა",
        "kk": "Бхагавад Гита",
        "km": "Bhagavad Gita",
        "kn": "ಭಗವದ್ಗೀತೆ",
        "ku": "Bhagavad Gita",
        "ky": "Бхагавад Гита",
        "la": "Bhagavad Gita",
        "lo": "Bhagavad Gita",
        "lt": "Bhagavad Gita",
        "lv": "Bhagavadgīta",
        "mg": "Bhagavad Gita",
        "mi": "Bhagavad Gita",
        "mk": "Бхагавад Гита",
        "ml": "ഭഗവദ്ഗീത",
        "mn": "Бхагавад Гита",
        "mr": "भगवद्गीता",
        "ms": "Bhagavad Gita",
        "mt": "Bhagavad Gita",
        "my": "Bhagavad Gita",
        "ne": "भगवद् गीता",
        "no": "Bhagavad Gita",
        "ny": "Bhagavad Gita",
        "or": "ଭଗବଦ୍ ଗୀତା",
        "pa": "ਭਗਵਦ ਗੀਤਾ",
        "ps": "Bhagavad Gita",
        "ro": "Bhagavad Gita",
        "rw": "Bhagavad Gita",
        "sd": "ڀگواد گيتا",
        "si": "භගවත් ගීතා",
        "sk": "Bhagavadgíta",
        "sl": "Bhagavad Gita",
        "sm": "Bhagavad Gita",
        "sn": "Bhagavad Gita",
        "so": "Bhagavad Gita",
        "sq": "Bhagavad Gita",
        "sr": "Бхагавад Гита",
        "st": "Bhagavad Gita",
        "su": "Bhagawad Gita",
        "sv": "Bhagavad Gita",
        "sw": "Bhagavad Gita",
        "ta": "பகவத் கீதை",
        "te": "భగవద్గీత",
        "tg": "Бхагавад Гита",
        "th": "ภควัทคีตา",
        "tk": "Bhagavad Gita",
        "ug": "Bhagavad Gita",
        "uz": "Bhagavad Gita",
        "xh": "Bhagavad Gita",
        "yi": "בהגוואד גיטא",
        "yo": "Bhagavad Gita",
        "zu": "Bhagavad Gita"
    },
    "Sunan Ibn Majah": {
        "bn": "সুনান ইবনে মাজাহ",
        "hi": "सुनन इब्न माजाह",
        "ar": "سنن ابن ماجه",
        "ur": "سنن ابن ماجہ",
        "he": "סונאן אבן מאג'ה",
        "es": "Sunan Ibn Majah",
        "fr": "Sunan Ibn Majah",
        "fa": "سنن ابن ماجه",
        "ja": "スナン・イブン・マジャ",
        "zh": "苏南·伊本·马贾",
        "ko": "수난 이븐 마자",
        "de": "Sunan Ibn Majah",
        "ru": "Сунан Ибн Маджа",
        "it": "Sunan Ibn Majah",
        "pt": "Sunan Ibn Majah",
        "tr": "Sünen İbn Mâce",
        "id": "Sunan Ibn Majah",
        "nl": "Sunan Ibn Majah",
        "pl": "Sunana Ibn Majaha",
        "uk": "Сунан Ібн Маджа",
        "vi": "Sunan Ibn Majah",
        "af": "Sunan Ibn Majah",
        "am": "ሱናን ኢብን ማጃህ",
        "as": "চুনান ইবনে মাজাহ",
        "az": "Sünən İbn Macə",
        "be": "Сунан ібн Маджа",
        "bg": "Сунан Ибн Маджа",
        "bs": "Sunan Ibn Majah",
        "ca": "Sunan Ibn Majah",
        "ceb": "Sunan Ibn Majah",
        "cs": "Sunan Ibn Majah",
        "cy": "Sunan Ibn Majah",
        "da": "Sunan Ibn Majah",
        "el": "Sunan Ibn Majah",
        "eo": "Sunan Ibn Majah",
        "et": "Sunan Ibn Majah",
        "eu": "Sunan Ibn Majah",
        "fi": "Sunan Ibn Majah",
        "fil": "Sunan Ibn Majah",
        "ga": "Sunan Ibn Majah",
        "gd": "Sunan Ibn Majah",
        "gl": "Sunan Ibn Majah",
        "gu": "સુનાન ઇબ્ને માજાહ",
        "ha": "Sunan Ibn Majah",
        "haw": "Sunan Ibn Majah",
        "hr": "Sunen Ibn Madže",
        "hu": "Szunan Ibn Majah",
        "hy": "Սունան Իբն Մաջա",
        "ig": "Sunan Ibn Majah",
        "is": "Sunan Ibn Majah",
        "jv": "Sunan Ibnu Majah",
        "ka": "სუნან იბნ მაჯა",
        "kk": "Сунан Ибн Мажа",
        "km": "Sunan Ibn Majah",
        "kn": "ಸುನನ್ ಇಬ್ನ್ ಮಾಜಾ",
        "ku": "Sunan Ibn Macah",
        "ky": "Сунан Ибн Мажа",
        "la": "Sunan Ibn Majah",
        "lo": "Sunan Ibn Majah",
        "lt": "Sunanas Ibn Majah",
        "lv": "Sunans Ibn Majahs",
        "mg": "Sunan Ibn Majah",
        "mi": "Ko Sunan Ibn Majah",
        "mk": "Сунан Ибн Маџа",
        "ml": "സുനൻ ഇബ്നു മാജ",
        "mn": "Сунан Ибн Мажа",
        "mr": "सुनन इब्न माजा",
        "ms": "Sunan Ibnu Majah",
        "mt": "Sunan Ibn Majah",
        "my": "Sunan Ibn Majah",
        "ne": "सुनन इब्न माजा",
        "no": "Sunan Ibn Majah",
        "ny": "Sunan Ibn Majah",
        "or": "ସୁନାନ୍ ଇବନ୍ ମାଜା |",
        "pa": "ਸੁਨਾਨ ਇਬਨ ਮਾਜਾ",
        "ps": "سنن ابن ماجه",
        "ro": "Sunan Ibn Majah",
        "rw": "Sunan Ibin Majah",
        "sd": "سنن ابن ماجه",
        "si": "සුනන් ඉබ්නු මාජා",
        "sk": "Sunan Ibn Majah",
        "sl": "Sunan Ibn Majah",
        "sm": "Sunan Ibn Majah",
        "sn": "Sunan Ibn Majah",
        "so": "Sunan Ibnu Maajah",
        "sq": "Sunen Ibn Maxhe",
        "sr": "Сунан Ибн Мајах",
        "st": "Sunan Ibn Majah",
        "su": "Sunan Ibnu Majah",
        "sv": "Sunan Ibn Majah",
        "sw": "Sunan Ibn Majah",
        "ta": "சுனன் இப்னு மாஜா",
        "te": "సునన్ ఇబ్న్ మాజా",
        "tg": "Сунан ибни Моҷа",
        "th": "สุนัน อิบนุ มาญะฮ์",
        "tk": "Sunan Ibn Majah",
        "ug": "سۇنان ئىبنى ماجە",
        "uz": "Sunan Ibn Moja",
        "xh": "Sunan Ibn Majah",
        "yi": "Sunan Ibn Majah",
        "yo": "Sunan Ibn Majah",
        "zu": "Sunan Ibn Majah"
    },
    "Sunan an-Nasai": {
        "bn": "সুনান আন-নাসায়ী",
        "hi": "सुनन अन-नसाई",
        "ar": "سنن النسائي",
        "ur": "سنن نسائی",
        "he": "קוראים לו אנ-נסאי",
        "ja": "彼の名前はアン・ナサイです",
        "zh": "他的名字叫安纳赛",
        "ko": "그의 이름은 안-나사이(An-Nasai)입니다",
        "es": "Su nombre es An-Nasai.",
        "fr": "Son nom est An-Nasai",
        "de": "Sein Name ist An-Nasai",
        "ru": "Его зовут Ан-Насаи.",
        "it": "Il suo nome è An-Nasai",
        "pt": "Seu nome é An-Nasai",
        "tr": "Onun adı An-Nesai",
        "id": "Namanya An-Nasai",
        "fa": "نام او نسایی است",
        "nl": "Sunan an-Nasai",
        "pl": "Sunan an-Nasai",
        "uk": "Сунан ан-Насаї",
        "vi": "Sunan an-Nasai",
        "af": "Sunan an-Nasai",
        "am": "ሱናን አን-ናሳይ",
        "as": "সুনান আন-নাছাই",
        "az": "Sünən ən-Nəsai",
        "be": "Сунан ан-Насаі",
        "bg": "Сунан ан-Насаи",
        "bs": "Sunan an-Nasai",
        "ca": "Sunan an-Nasai",
        "ceb": "Sunan an-Nasai",
        "cs": "Sunan an-Nasai",
        "cy": "Sunan an-Nasai",
        "da": "Sunan an-Nasai",
        "el": "Σουνάν αν-Νασάι",
        "eo": "Sunan an-Nasai",
        "et": "Sunan an-Nasai",
        "eu": "Sunan an-Nasai",
        "fi": "Sunan an-Nasai",
        "fil": "Sunan an-Nasai",
        "ga": "Sunan an-Nasai",
        "gd": "Sunan an-Nasai",
        "gl": "Sunan an-Nasai",
        "gu": "સુનાન એન-નાસાઇ",
        "ha": "Sunan an-Nasai",
        "haw": "Sunan an-Nasai",
        "hr": "Sunan an-Nasai",
        "hu": "Sunan an-Nasai",
        "hy": "Սունան ան-Նասայ",
        "ig": "Sunan an-Nasai",
        "is": "Sunan an-Nasai",
        "jv": "Sunan an-Nasai",
        "ka": "სუნან ან-ნასაი",
        "kk": "Сунан ән-Насаи",
        "km": "ស៊ុនណាន់-ណាស៊ី",
        "kn": "ಸುನನ್ ಆನ್-ನಸೈ",
        "ku": "Sunan en-Nesaî",
        "ky": "Сунан ан-Насаи",
        "la": "Sunan an-Nasai",
        "lo": "ສຸນັນ ອານ-ນາໄຊ",
        "lt": "Sunan an-Nasai",
        "lv": "Sunans an-Nasai",
        "mg": "Sunan an-Nasai",
        "mi": "Sunan an-Nasai",
        "mk": "Сунан ан-Насаи",
        "ml": "സുനൻ അൻ-നസായ്",
        "mn": "Сунан ан-Насаи",
        "mr": "सुनन अन नसाई",
        "ms": "Sunan an-Nasai",
        "mt": "Sunan an-Nasai",
        "my": "Sunan an-Nasai",
        "ne": "सुनन नसाई",
        "no": "Sunan an-Nasai",
        "ny": "Sunan an-Nasai",
        "or": "ସୁନାନ୍ ଅନ-ନାସାଇ |",
        "pa": "ਸੁਨਾਨ ਅਨ-ਨਸਾਈ",
        "ps": "سنن نسائی",
        "ro": "Sunan an-Nasai",
        "rw": "Sunan an-Nasai",
        "sd": "سنن نسائي",
        "si": "සුනන් අන්-නසායි",
        "sk": "Sunan an-Nasai",
        "sl": "Sunan an-Nasai",
        "sm": "Sunan an-Nasai",
        "sn": "Sunan an-Nasai",
        "so": "Sunan an-Nasai",
        "sq": "Sunen en-Nesai",
        "sr": "Сунан ан-Насаи",
        "st": "Sunan an-Nasai",
        "su": "Sunan an-Nasai",
        "sv": "Sunan an-Nasai",
        "sw": "Sunan an-Nasai",
        "ta": "சுனன் அன்-நசாய்",
        "te": "సునన్ అన్-నసై",
        "tg": "Сунан ан-Насоий",
        "th": "สุนันท์ อันนาไซ",
        "tk": "Sunan an-Nasaý",
        "ug": "Sunan an-Nasai",
        "uz": "Sunan an-Nasoiy",
        "xh": "Sunan an-Nasai",
        "yi": "סונאַן אַ נאַסאַי",
        "yo": "Sunan an-Nasai",
        "zu": "I-Sunan an-Nasai"
    },
    "Jami At Tirmidhi": {
        "bn": "জামে তিরমিযী",
        "hi": "जामी अत-तिर्मिज़ी",
        "ar": "جامع الترمذي",
        "ur": "جامع ترمذی",
        "he": "ג'מי בטירמידי",
        "ja": "ジャミ・アット・ティルミディ",
        "zh": "贾米在提尔米济",
        "ko": "자미 앳 티르미디",
        "es": "Jami At Tirmidhi",
        "fr": "Jami à Tirmidhi",
        "de": "Jami in Tirmidhi",
        "ru": "Джами Ат-Тирмизи",
        "it": "Jami a Tirmidhi",
        "pt": "Jami em Tirmidhi",
        "tr": "Cami At Tirmizi",
        "id": "Jami At Tirmidzi",
        "fa": "جامی در ترمذی",
        "nl": "Jami in Tirmidhi",
        "pl": "Jami W Tirmidhi",
        "uk": "Джамі ат Тірмізі",
        "vi": "Jami tại Tirmidhi",
        "af": "Jami by Tirmidhi",
        "am": "ጃሚ አት ቲርሚዚ",
        "as": "জামি এট তিৰমিধি",
        "az": "Cami at Tirmizi",
        "be": "Джамі ат Цірмізі",
        "bg": "Джами Ат Тирмизи",
        "bs": "Jami At Tirmidhi",
        "ca": "Jami a Tirmidhi",
        "ceb": "Jami At Tirmidhi",
        "cs": "Jami v Tirmidhi",
        "cy": "Jami Yn Tirmidi",
        "da": "Jami i Tirmidhi",
        "el": "Jami At Tirmidhi",
        "eo": "Jami Ĉe Tirmidhi",
        "et": "Jami Tirmidhis",
        "eu": "Jami At Tirmidhi",
        "fi": "Jami Tirmidhissä",
        "fil": "Jami At Tirmidhi",
        "ga": "Jami Ag Tirmidi",
        "gd": "Jami aig Tirmidi",
        "gl": "Jami en Tirmidhi",
        "gu": "જામી અત તિર્મિધી",
        "ha": "Jami At Tirmizi",
        "haw": "Jami At Tirmidhi",
        "hr": "Džami Et Tirmizi",
        "hu": "Jami At Tirmidhi",
        "hy": "Jami At Tirmidhi",
        "ig": "Jami na Tirmidhi",
        "is": "Jami í Tirmidhi",
        "jv": "Jami At Tirmidzi",
        "ka": "ჯამი ტირმიდში",
        "kk": "Джами ат Тирмизи",
        "km": "Jami នៅ Tirmidhi",
        "kn": "ಜಾಮಿ ಅತ್ ತಿರ್ಮಿದಿ",
        "ku": "Jami At Tirmidhi",
        "ky": "Жами Ат Тирмизи",
        "la": "Jami At Tirmidhi",
        "lo": "Jami ຢູ່ Tirmidhi",
        "lt": "Jami At Tirmidhi",
        "lv": "Jami At Tirmidhi",
        "mg": "Jami At Tirmidhi",
        "mi": "Jami At Tirmidhi",
        "mk": "Џами во Тирмиди",
        "ml": "തിർമിദിയിൽ ജാമി",
        "mn": "Жами Ат Тирмизи",
        "mr": "जामी एट तिरमिधी",
        "ms": "Jami At Tirmidzi",
        "mt": "Jami At Tirmidhi",
        "my": "Tirmidhi တွင် Jami",
        "ne": "जामी एट तिरमिधि",
        "no": "Jami i Tirmidhi",
        "ny": "Jami At Tirmidhi",
        "or": "ତିରିମିଡିରେ ଜାମି |",
        "pa": "ਜਾਮਿ ਤੇ ਤਿਰਮਿਧਿ",
        "ps": "جامع ترمذي",
        "ro": "Jami La Tirmidhi",
        "rw": "Jami Kuri Tirmidhi",
        "sd": "جامع ترمذي",
        "si": "Jami At Tirmidhi",
        "sk": "Jami v Tirmidhi",
        "sl": "Jami At Tirmidhi",
        "sm": "Jami I Tirmidhi",
        "sn": "Jami At Tirmidhi",
        "so": "Jami At Tirmidi",
        "sq": "Jami At Tirmidhi",
        "sr": "Џами Ат Тирмизи",
        "st": "Jami At Tirmidhi",
        "su": "Jami At Tirmidzi",
        "sv": "Jami i Tirmidhi",
        "sw": "Jami Katika Tirmidhi",
        "ta": "திர்மிதியில் ஜாமி",
        "te": "తిర్మిధి వద్ద జామీ",
        "tg": "Ҷоми ат Тирмизӣ",
        "th": "จามีที่ติรมีซี",
        "tk": "Tirmizi",
        "ug": "Jami At Tirmidhi",
        "uz": "Jomiy at Termiziy",
        "xh": "UJami eTirmidhi",
        "yi": "דזשאַמי אין טירמידהי",
        "yo": "Jami At Tirmidhi",
        "zu": "Jami At Tirmidhi"
    },
    "Sunan Abu Dawud": {
        "bn": "সুনান আবু দাউদ",
        "hi": "सुनन अबू दाऊद",
        "ar": "سنن أبي داود",
        "ur": "سنن ابو داؤد",
        "he": "שמו של אבו דאוד",
        "ja": "アブ・ダウドの名前",
        "zh": "阿布达乌德的名字",
        "ko": "아부 다우드의 이름",
        "es": "El nombre de Abu Dawud",
        "fr": "Le nom d'Abou Dawud",
        "de": "Der Name Abu Dawud",
        "ru": "Имя Абу Дауда",
        "it": "Il nome di Abu Dawud",
        "pt": "O nome de Abu Dawud",
        "tr": "Ebu Davud'un adı",
        "id": "Nama Abu Dawud",
        "fa": "نام ابوداود",
        "nl": "Sunan Aboe Dawud",
        "pl": "Sunana Abu Dawuda",
        "uk": "Сунан Абу Дауд",
        "vi": "Sunan Abu Dawud",
        "af": "Sunan Abu Dawud",
        "am": "ሱናን አቡ ዳውድ",
        "as": "সুনান আবু দাউদ",
        "az": "Sünəni Əbu Davud",
        "be": "Сунан Абу Дауд",
        "bg": "Сунан Абу Дауд",
        "bs": "Sunan Abu Dawud",
        "ca": "Sunan Abu Dawud",
        "ceb": "Sunan Abu Dawud",
        "cs": "Sunan Abu Dawud",
        "cy": "Sunan Abu Dawud",
        "da": "Sunan Abu Dawud",
        "el": "Sunan Abu Dawud",
        "eo": "Sunan Abu Dawud",
        "et": "Sunan Abu Dawud",
        "eu": "Sunan Abu Dawud",
        "fi": "Sunan Abu Dawud",
        "fil": "Sunan Abu Dawud",
        "ga": "Sunán Abu Dawud",
        "gd": "Sunan Abu Dawud",
        "gl": "Sunan Abu Dawud",
        "gu": "સુનાન અબુ દાઉદ",
        "ha": "Sunan Abu Dawud",
        "haw": "Sunan Abu Dawud",
        "hr": "Sunen Ebu Davud",
        "hu": "Sunan Abu Dawud",
        "hy": "Սունան Աբու Դաուդ",
        "ig": "Sunan Abu Dawud",
        "is": "Sunan Abu Dawud",
        "jv": "Sunan Abu Dawud",
        "ka": "სუნანი აბუ დაუდი",
        "kk": "Сүнан Әбу Дәуіт",
        "km": "ស៊ូណាន អាប៊ូ ដាវុដ",
        "kn": "ಸುನನ್ ಅಬು ದಾವುದ್",
        "ku": "Sunan Ebû Dawûd",
        "ky": "Сунан Абу Давуд",
        "la": "Sunan Abu Dawud",
        "lo": "Sunan Abu Dawud",
        "lt": "Sunan Abu Dawud",
        "lv": "Sunans Abū Davuds",
        "mg": "Sunan Abu Dawud",
        "mi": "Sunan Abu Dawud",
        "mk": "Сунан Абу Давуд",
        "ml": "സുനൻ അബു ദാവൂദ്",
        "mn": "Сунан Абу Давуд",
        "mr": "सुनन अबू दाऊद",
        "ms": "Sunan Abu Dawud",
        "mt": "Sunan Abu Dawud",
        "my": "Sunan Abu Dawud",
        "ne": "सुनन अबु दाउद",
        "no": "Sunan Abu Dawud",
        "ny": "Sunan Abu Dawud",
        "or": "ସୁନାନ ଆବୁ ଦ ud ଦ",
        "pa": "ਸੁਨਾਨ ਅਬੂ ਦਾਊਦ",
        "ps": "سنن ابوداود",
        "ro": "Sunan Abu Dawud",
        "rw": "Sunan Abu Dawud",
        "sd": "سنن ابوداؤد",
        "si": "සුනන් අබු ඩවුඩ්",
        "sk": "Sunan Abu Dawud",
        "sl": "Sunan Abu Dawud",
        "sm": "Sunan Abu Dawud",
        "sn": "Sunan Abu Dawud",
        "so": "Sunan Abuu Daawuud",
        "sq": "Sunen Ebu Davud",
        "sr": "Сунан Абу Давуд",
        "st": "Sunan Abu Dawud",
        "su": "Sunan Abu Dawud",
        "sv": "Sunan Abu Dawud",
        "sw": "Sunan Abu Dawud",
        "ta": "சுனன் அபு தாவூத்",
        "te": "సునన్ అబూ దావూద్",
        "tg": "Сунан Абу Довуд",
        "th": "สุนัน อบู ดาวูด",
        "tk": "Sunan Abu Dawud",
        "ug": "سۇنان ئەبۇ داۋۇد",
        "uz": "Sunan Abu Dovud",
        "xh": "Sunan Abu Dawud",
        "yi": "סונן אבו דאוד",
        "yo": "Sunan Abu Dawud",
        "zu": "Sunan Abu Dawud"
    },
    "Sahih Muslim": {
        "bn": "সহীহ মুসলিম",
        "hi": "सहीह मुस्लिम",
        "ar": "صحيح مسلم",
        "ur": "صحیح مسلم",
        "he": "סחיח מוסלם",
        "es": "Sahih Muslim",
        "fr": "Sahih Muslim",
        "de": "Sahih Muslim",
        "ru": "Сахих Муслим",
        "it": "Sahih Muslim",
        "tr": "Sahih-i Müslim",
        "fa": "صحیح مسلم",
        "ja": "サヒフ・ムスリム",
        "zh": "穆斯林圣训",
        "ko": "사히 무슬림",
        "pt": "Sahih muçulmano",
        "id": "Sahih Muslim",
        "nl": "Sahih moslim",
        "pl": "Sahih Muzułmanin",
        "uk": "Сахіх Муслім",
        "vi": "Sahih Hồi giáo",
        "af": "Sahih Moslem",
        "am": "ሳሂህ ሙስሊም",
        "as": "ছহীহ মুছলিম",
        "az": "Səhih Müslim",
        "be": "Сахіх Муслім",
        "bg": "Сахих мюсюлманин",
        "bs": "Sahih Muslim",
        "ca": "Sahih Muslim",
        "ceb": "Sahih Muslim",
        "cs": "Sahih muslim",
        "cy": "Sahih Mwslimaidd",
        "da": "Sahih muslim",
        "el": "Sahih Muslim",
        "eo": "Sahih islamano",
        "et": "Sahih moslem",
        "eu": "Sahih musulmana",
        "fi": "Sahih muslimi",
        "fil": "Sahih Muslim",
        "ga": "Sahih Moslamach",
        "gd": "Sahih Muslamach",
        "gl": "Sahih musulmán",
        "gu": "સહીહ મુસ્લિમ",
        "ha": "Sahih Muslim",
        "haw": "Sahih Muslim",
        "hr": "Sahih Muslim",
        "hu": "Sahih muszlim",
        "hy": "Սահիհ Մուսլիմ",
        "ig": "Sahih Muslim",
        "is": "Sahih múslimi",
        "jv": "Sahih Muslim",
        "ka": "საჰიჰ მუსლიმი",
        "kk": "Сахих Муслим",
        "km": "សាហ៊ីមូស្លីម",
        "kn": "ಸಹಿಹ್ ಮುಸ್ಲಿಂ",
        "ku": "Sahih Muslim",
        "ky": "Сахих Муслим",
        "la": "Sahih Muslim",
        "lo": "Sahih Muslim",
        "lt": "Sahih musulmonas",
        "lv": "Sahih musulmanis",
        "mg": "Sahih Muslim",
        "mi": "Sahih Muslim",
        "mk": "Сахих Муслим",
        "ml": "സഹീഹ് മുസ്ലിം",
        "mn": "Сахих Муслим",
        "mr": "सहिह मुस्लिम",
        "ms": "Sahih Muslim",
        "mt": "Sahih Musulman",
        "my": "Sahih မွတ်စလင်",
        "ne": "सहि मुस्लिम",
        "no": "Sahih muslim",
        "ny": "Sahih Muslim",
        "or": "ସାହି ମୁସଲମାନ |",
        "pa": "ਸਾਹੀਹ ਮੁਸਲਮਾਨ",
        "ps": "صحیح مسلم",
        "ro": "Sahih Muslim",
        "rw": "Sahih Muslim",
        "sd": "صحيح مسلم",
        "si": "සහීහ් මුස්ලිම්",
        "sk": "Sahih moslim",
        "sl": "Sahih Muslim",
        "sm": "Sahih Muslim",
        "sn": "Sahih Muslim",
        "so": "Saxiix Muslim",
        "sq": "Sahih Muslim",
        "sr": "Сахих Муслим",
        "st": "Sahih Muslim",
        "su": "Sahih Muslim",
        "sv": "Sahih muslim",
        "sw": "Sahih Muslim",
        "ta": "சாஹிஹ் முஸ்லிம்",
        "te": "సాహిహ్ ముస్లిం",
        "tg": "Сахихи Муслим",
        "th": "เศาะฮีห์มุสลิม",
        "tk": "Sahih Musulman",
        "ug": "سەھىھ مۇسلىم",
        "uz": "Sahihi Muslim",
        "xh": "Sahih Muslim",
        "yi": "סאַהה מוסלים",
        "yo": "Sahih Musulumi",
        "zu": "Sahih Muslim"
    },
    "Sahih Bukhari": {
        "bn": "সহীহ বুখারী",
        "hi": "सहीह बुखारी",
        "ar": "صحيح البخاري",
        "ur": "صحیح بخاری",
        "he": "סחיח אל-בוח'ארי",
        "es": "Sahih al-Bujari",
        "fr": "Sahih al-Bukhari",
        "de": "Sahih al-Bukhari",
        "ru": "Сахих аль-Бухари",
        "it": "Sahih al-Bukhari",
        "tr": "Sahih-i Buhari",
        "fa": "صحیح بخاری",
        "ja": "サヒ・ブハリ",
        "zh": "布哈里圣训",
        "ko": "사히 부카리",
        "pt": "Sahih Bukhari",
        "id": "Shahih Bukhari",
        "nl": "Sahih Bukhari",
        "pl": "Sahih Bukhari",
        "uk": "Сахіх Бухарі",
        "vi": "Sahih Bukhari",
        "af": "Sahih Bukhari",
        "am": "ሳሂህ ቡኻሪ",
        "as": "ছহীহ বুখাৰী",
        "az": "Səhih Buxari",
        "be": "Сахіх Бухары",
        "bg": "Сахих Бухари",
        "bs": "Sahih Bukhari",
        "ca": "Sahih Bukhari",
        "ceb": "Sahih Bukhari",
        "cs": "Sahih Bukhari",
        "cy": "Sahih Bukhari",
        "da": "Sahih Bukhari",
        "el": "Σαχίχ Μπουχάρι",
        "eo": "Sahih Bukhari",
        "et": "Sahih Bukhari",
        "eu": "Sahih Bukhari",
        "fi": "Sahih Bukhari",
        "fil": "Sahih Bukhari",
        "ga": "Sahih Bukhari",
        "gd": "Sahih Bukhari",
        "gl": "Sahih Bukhari",
        "gu": "સહીહ બુખારી",
        "ha": "Sahihul Bukhari",
        "haw": "Sahih Bukhari",
        "hr": "Sahih Buhari",
        "hu": "Sahih Bukhari",
        "hy": "Սահիհ Բուխարի",
        "ig": "Sahih Bukhari",
        "is": "Sahih Bukhari",
        "jv": "Sahih Bukhari",
        "ka": "საჰიჰ ბუხარი",
        "kk": "Сахих Бухари",
        "km": "Sahih Bukhari",
        "kn": "ಸಹಿಹ್ ಬುಖಾರಿ",
        "ku": "Sahih Buxarî",
        "ky": "Сахих Бухари",
        "la": "Sahih Bukhari",
        "lo": "Sahih Bukhari",
        "lt": "Sahih Bukhari",
        "lv": "Sahih Bukhari",
        "mg": "Sahih Bukhari",
        "mi": "Sahih Bukhari",
        "mk": "Сахих Бухари",
        "ml": "സ്വഹീഹ് ബുഖാരി",
        "mn": "Сахих Бухари",
        "mr": "सहिह बुखारी",
        "ms": "Sahih Bukhari",
        "mt": "Sahih Bukhari",
        "my": "Sahih Bukhari",
        "ne": "सहिह बुखारी",
        "no": "Sahih Bukhari",
        "ny": "Sahih Bukhari",
        "or": "ସାହି ବୁଖାରୀ |",
        "pa": "ਸਾਹੀਹ ਬੁਖਾਰੀ",
        "ps": "صحیح بخاری",
        "ro": "Sahih Bukhari",
        "rw": "Sahih Bukhari",
        "sd": "صحيح بخاري",
        "si": "සහීහ් බුහාරි",
        "sk": "Sahih Bukhari",
        "sl": "Sahih Bukhari",
        "sm": "Sahih Bukhari",
        "sn": "Sahih Bukhari",
        "so": "Saxiix Bukhaari",
        "sq": "Sahih Buhariu",
        "sr": "Сахих Букхари",
        "st": "Sahih Bukhari",
        "su": "Sahih Bukhari",
        "sv": "Sahih Bukhari",
        "sw": "Sahih Bukhari",
        "ta": "ஸஹீஹ் புகாரி",
        "te": "సహీహ్ బుఖారీ",
        "tg": "Саҳеҳи Бухори",
        "th": "ซาฮีห์ บุคอรี",
        "tk": "Sahih Buhari",
        "ug": "سەھىھ بۇخارى",
        "uz": "Sahihi Buxoriy",
        "xh": "Sahih Bukhari",
        "yi": "סאַהה בוכאַרי",
        "yo": "Sahih Bukhari",
        "zu": "Sahih Bukhari"
    },
    "Quran": {
        "bn": "কোরআন",
        "hi": "क़ुरआन",
        "ar": "القرآن",
        "ur": "قرآن",
        "he": "קוראן",
        "es": "Corán",
        "fr": "Coran",
        "de": "Koran",
        "ru": "Коран",
        "it": "Corano",
        "ja": "コーラン",
        "pt": "Alcorão",
        "tr": "Kuran",
        "zh": "古兰经",
        "fa": "قرآن",
        "ko": "꾸란",
        "id": "Alquran",
        "nl": "Koran",
        "pl": "Koran",
        "uk": "Коран",
        "vi": "Kinh Qur'an",
        "af": "Koran",
        "am": "ቁርኣን",
        "as": "কোৰআন",
        "az": "Quran",
        "be": "Каран",
        "bg": "Коран",
        "bs": "Kur'an",
        "ca": "Alcorà",
        "ceb": "Quran",
        "cs": "Korán",
        "cy": "Quran",
        "da": "Koranen",
        "el": "Κοράνι",
        "eo": "Korano",
        "et": "Koraan",
        "eu": "Korana",
        "fi": "Koraani",
        "fil": "Quran",
        "ga": "Quran",
        "gd": "Quran",
        "gl": "Corán",
        "gu": "કુરાન",
        "ha": "Alqur'ani",
        "haw": "Quran",
        "hr": "Kuran",
        "hu": "Korán",
        "hy": "Ղուրան",
        "ig": "Quran",
        "is": "Kóraninn",
        "jv": "Quran",
        "ka": "ყურანი",
        "kk": "Құран",
        "km": "គម្ពីគូរ៉ា",
        "kn": "ಕುರಾನ್",
        "ku": "Quran",
        "ky": "Куран",
        "la": "Quran",
        "lo": "Quran",
        "lt": "Koranas",
        "lv": "Korāns",
        "mg": "CORAN",
        "mi": "Quran",
        "mk": "Куранот",
        "ml": "ഖുർആൻ",
        "mn": "Коран",
        "mr": "कुराण",
        "ms": "Quran",
        "mt": "Quran",
        "my": "ကုရ်အာန်",
        "ne": "कुरान",
        "no": "Koranen",
        "ny": "Korani",
        "or": "କୁରାନ",
        "pa": "ਕੁਰਾਨ",
        "ps": "قرآن",
        "ro": "Coranul",
        "rw": "Qor'an",
        "sd": "قرآن",
        "si": "කුරානය",
        "sk": "Korán",
        "sl": "Koran",
        "sm": "Quran",
        "sn": "Quran",
        "so": "Quraanka",
        "sq": "Kurani",
        "sr": "Куран",
        "st": "Quran",
        "su": "Quran",
        "sv": "Koranen",
        "sw": "Quran",
        "ta": "குர்ஆன்",
        "te": "ఖురాన్",
        "tg": "Қуръон",
        "th": "อัลกุรอาน",
        "tk": "Kuran",
        "ug": "قۇرئان",
        "uz": "Qur'on",
        "xh": "Quran",
        "yi": "קווראַן",
        "yo": "Al-Qur’an",
        "zu": "Quran"
    },
    "Christianity": {
        "bn": "খ্রিস্টধর্ম",
        "hi": "ईसाई धर्म",
        "ar": "المسيحية",
        "es": "Cristianismo",
        "fr": "Christianisme",
        "de": "Christentum",
        "ja": "キリスト教",
        "tr": "Hristiyanlık",
        "ru": "Христианство",
        "pt": "Cristianismo",
        "id": "Kristen",
        "ur": "عیسائیت",
        "it": "Cristianesimo",
        "zh": "基督教",
        "ko": "기독교",
        "fa": "مسیحیت",
        "he": "נצרות",
        "nl": "Christendom",
        "pl": "Chrześcijaństwo",
        "uk": "християнство",
        "vi": "Kitô giáo",
        "af": "Christenskap",
        "am": "ክርስትና",
        "as": "খ্ৰীষ্টান ধৰ্ম",
        "az": "xristianlıq",
        "be": "хрысціянства",
        "bg": "християнството",
        "bs": "Hrišćanstvo",
        "ca": "cristianisme",
        "ceb": "Kristiyanismo",
        "cs": "křesťanství",
        "cy": "Cristionogaeth",
        "da": "Kristendom",
        "el": "Χριστιανισμός",
        "eo": "kristanismo",
        "et": "kristlus",
        "eu": "kristautasuna",
        "fi": "kristinusko",
        "fil": "Kristiyanismo",
        "ga": "Chríostaíocht",
        "gd": "Criosduidh",
        "gl": "cristianismo",
        "gu": "ખ્રિસ્તી ધર્મ",
        "ha": "Kiristanci",
        "haw": "Kalikiano",
        "hr": "kršćanstvo",
        "hu": "kereszténység",
        "hy": "Քրիստոնեություն",
        "ig": "Iso Ụzọ Kraịst",
        "is": "Kristni",
        "jv": "kekristenan",
        "ka": "ქრისტიანობა",
        "kk": "христиандық",
        "km": "គ្រិស្តសាសនា",
        "kn": "ಕ್ರಿಶ್ಚಿಯನ್ ಧರ್ಮ",
        "ku": "Xirîstiyanî",
        "ky": "Христиандык",
        "la": "Christianitas",
        "lo": "ຄຣິສຕຽນ",
        "lt": "krikščionybė",
        "lv": "kristietība",
        "mg": "Kristianisma",
        "mi": "Karaitiana",
        "mk": "христијанството",
        "ml": "ക്രിസ്തുമതം",
        "mn": "Христийн шашин",
        "mr": "ख्रिश्चन धर्म",
        "ms": "agama Kristian",
        "mt": "Kristjaneżmu",
        "my": "ခရစ်ယာန်ဘာသာ",
        "ne": "ईसाई धर्म",
        "no": "Kristendommen",
        "ny": "Chikhristu",
        "or": "ଖ୍ରୀଷ୍ଟିଆନ ଧର୍ମ",
        "pa": "ਈਸਾਈ",
        "ps": "مسیحیت",
        "ro": "creştinismul",
        "rw": "Ubukristo",
        "sd": "عيسائيت",
        "si": "ක්රිස්තියානි ධර්මය",
        "sk": "kresťanstvo",
        "sl": "krščanstvo",
        "sm": "FaaKerisiano",
        "sn": "Chikristu",
        "so": "Masiixiyadda",
        "sq": "krishterimi",
        "sr": "хришћанство",
        "st": "Bokreste",
        "su": "Kristen",
        "sv": "Kristendomen",
        "sw": "Ukristo",
        "ta": "கிறிஸ்தவம்",
        "te": "క్రైస్తవం",
        "tg": "масеҳият",
        "th": "ศาสนาคริสต์",
        "tk": "Hristiançylyk",
        "ug": "خىرىستىئان دىنى",
        "uz": "Xristianlik",
        "xh": "UbuKristu",
        "yi": "קריסטנטום",
        "yo": "Kristiẹniti",
        "zu": "UbuKristu"
    },
    "Islam": {
        "bn": "ইসলাম",
        "hi": "इस्लाम",
        "ar": "الإسلام",
        "es": "Islam",
        "fr": "Islam",
        "de": "Islam",
        "ja": "イスラム教",
        "tr": "İslam",
        "ru": "Ислам",
        "pt": "Islã",
        "id": "Islam",
        "ur": "اسلام",
        "it": "Islam",
        "zh": "伊斯兰教",
        "ko": "이슬람교",
        "fa": "اسلام",
        "he": "אסלאם",
        "nl": "Islam",
        "pl": "Islam",
        "uk": "Іслам",
        "vi": "Hồi giáo",
        "af": "Islam",
        "am": "እስልምና",
        "as": "ইছলাম",
        "az": "İslam",
        "be": "Іслам",
        "bg": "ислям",
        "bs": "Islam",
        "ca": "Islam",
        "ceb": "Islam",
        "cs": "islám",
        "cy": "Islam",
        "da": "Islam",
        "el": "Ισλάμ",
        "eo": "Islamo",
        "et": "islam",
        "eu": "Islama",
        "fi": "Islam",
        "fil": "Islam",
        "ga": "Ioslam",
        "gd": "Islam",
        "gl": "Islam",
        "gu": "ઇસ્લામ",
        "ha": "Musulunci",
        "haw": "Islama",
        "hr": "islam",
        "hu": "iszlám",
        "hy": "իսլամ",
        "ig": "Islam",
        "is": "Íslam",
        "jv": "Islam",
        "ka": "ისლამი",
        "kk": "Ислам",
        "km": "ឥស្លាម",
        "kn": "ಇಸ್ಲಾಂ",
        "ku": "Îslam",
        "ky": "Ислам",
        "la": "Islam",
        "lo": "ອິດສະລາມ",
        "lt": "Islamas",
        "lv": "Islāms",
        "mg": "Islam",
        "mi": "Ihirama",
        "mk": "исламот",
        "ml": "ഇസ്ലാം",
        "mn": "Ислам",
        "mr": "इस्लाम",
        "ms": "Islam",
        "mt": "Iżlam",
        "my": "ကျုပ်က",
        "ne": "इस्लाम",
        "no": "Islam",
        "ny": "Chisilamu",
        "or": "ଇସଲାମ",
        "pa": "ਇਸਲਾਮ",
        "ps": "اسلام",
        "ro": "Islamul",
        "rw": "Islamu",
        "sd": "اسلام",
        "si": "ඉස්ලාම්",
        "sk": "islam",
        "sl": "islam",
        "sm": "Isalama",
        "sn": "Islam",
        "so": "Islaamka",
        "sq": "Islami",
        "sr": "Ислам",
        "st": "Islam",
        "su": "Islam",
        "sv": "Islam",
        "sw": "Uislamu",
        "ta": "இஸ்லாம்",
        "te": "ఇస్లాం",
        "tg": "Ислом",
        "th": "อิสลาม",
        "tk": "Yslam",
        "ug": "ئىسلام",
        "uz": "Islom",
        "xh": "UbuSilamsi",
        "yi": "איסלאם",
        "yo": "Islam",
        "zu": "Islam"
    },
    "Hinduism": {
        "bn": "হিন্দুধর্ম",
        "hi": "हिन्दू धर्म",
        "ar": "الهندوسية",
        "es": "Hinduismo",
        "fr": "Hindouisme",
        "de": "Hinduismus",
        "ja": "ヒンドゥー教",
        "tr": "Hinduizm",
        "ru": "Индуизм",
        "pt": "Hinduismo",
        "id": "Hindu",
        "ur": "ہندومت",
        "it": "Induismo",
        "zh": "印度教",
        "ko": "힌두교",
        "fa": "هندوئیسم",
        "he": "הינדואיזם",
        "nl": "Hindoeïsme",
        "pl": "Hinduizm",
        "uk": "індуїзм",
        "vi": "Ấn Độ giáo",
        "af": "Hindoeïsme",
        "am": "ሂንዱይዝም",
        "as": "হিন্দু ধৰ্ম",
        "az": "hinduizm",
        "be": "індуізм",
        "bg": "индуизъм",
        "bs": "hinduizam",
        "ca": "hinduisme",
        "ceb": "Hinduismo",
        "cs": "hinduismus",
        "cy": "Hindwaeth",
        "da": "hinduisme",
        "el": "Ινδουισμός",
        "eo": "Hinduismo",
        "et": "Hinduism",
        "eu": "Hinduismoa",
        "fi": "hindulaisuus",
        "fil": "Hinduismo",
        "ga": "Hiondúchas",
        "gd": "Hinduism",
        "gl": "Hinduismo",
        "gu": "હિંદુ ધર્મ",
        "ha": "Hindu",
        "haw": "Hinedu",
        "hr": "Hinduizam",
        "hu": "hinduizmus",
        "hy": "Հինդուիզմ",
        "ig": "Okpukpe Hindu",
        "is": "Hindúatrú",
        "jv": "agama Hindu",
        "ka": "ინდუიზმი",
        "kk": "индуизм",
        "km": "ព្រហ្មញ្ញសាសនា",
        "kn": "ಹಿಂದೂ ಧರ್ಮ",
        "ku": "Hinduîzm",
        "ky": "индуизм",
        "la": "Hinduismus",
        "lo": "ຮິນດູ",
        "lt": "induizmas",
        "lv": "Hinduisms",
        "mg": "Hindoisma",
        "mi": "Hindu",
        "mk": "хиндуизам",
        "ml": "ഹിന്ദുമതം",
        "mn": "Хинду шашин",
        "mr": "हिंदू धर्म",
        "ms": "agama Hindu",
        "mt": "Induiżmu",
        "my": "ဟိန္ဒူဘာသာ",
        "ne": "हिन्दू धर्म",
        "no": "Hinduisme",
        "ny": "Chihindu",
        "or": "ହିନ୍ଦୁ ଧର୍ମ",
        "pa": "ਹਿੰਦੂ ਧਰਮ",
        "ps": "هندویزم",
        "ro": "hinduism",
        "rw": "Umuhindu",
        "sd": "هندو ڌرم",
        "si": "හින්දු ආගම",
        "sk": "hinduizmus",
        "sl": "Hinduizem",
        "sm": "Lotu Hindu",
        "sn": "ChiHindu",
        "so": "Hinduism",
        "sq": "hinduizmi",
        "sr": "хиндуизам",
        "st": "Bohindu",
        "su": "Hindu",
        "sv": "hinduism",
        "sw": "Uhindu",
        "ta": "இந்து மதம்",
        "te": "హిందూమతం",
        "tg": "ҳиндуизм",
        "th": "ศาสนาฮินดู",
        "tk": "Hindiizm",
        "ug": "ھىندى دىنى",
        "uz": "Hinduizm",
        "xh": "UbuHindu",
        "yi": "הינדויסם",
        "yo": "Hinduism",
        "zu": "UbuHindu"
    },
    "Sikhism": {
        "bn": "শিখধর্ম",
        "hi": "सिख धर्म",
        "ar": "السيخية",
        "es": "Sijismo",
        "fr": "Sikhisme",
        "de": "Sikhismus",
        "ja": "シーク教",
        "tr": "Sihizm",
        "ru": "Сикхизм",
        "pt": "Sikhismo",
        "id": "Sikhisme",
        "ur": "سکھ مت",
        "it": "Sikhismo",
        "zh": "锡克教",
        "ko": "시크교",
        "fa": "সیکیسم",
        "he": "סיקיזם",
        "nl": "Sikhisme",
        "pl": "sikhizm",
        "uk": "сикхізм",
        "vi": "đạo Sikh",
        "af": "Sikhisme",
        "am": "ሲክሂዝም",
        "as": "শিখ ধৰ্ম",
        "az": "siqhizm",
        "be": "сікхізм",
        "bg": "сикхизъм",
        "bs": "Sikhizam",
        "ca": "Sikhisme",
        "ceb": "Sikhismo",
        "cs": "sikhismus",
        "cy": "Sikhaeth",
        "da": "Sikhisme",
        "el": "Σιχισμός",
        "eo": "Sikhismo",
        "et": "sikhism",
        "eu": "Sikhismoa",
        "fi": "sikhalaisuus",
        "fil": "Sikhismo",
        "ga": "Sikhism",
        "gd": "Sikhism",
        "gl": "Sikhismo",
        "gu": "શીખ ધર્મ",
        "ha": "Sikhism",
        "haw": "Sikhism",
        "hr": "sikhizam",
        "hu": "szikhizmus",
        "hy": "Սիկհիզմ",
        "ig": "Sikhism",
        "is": "Sikhismi",
        "jv": "Sikhisme",
        "ka": "სიქიზმი",
        "kk": "Сикхизм",
        "km": "សាសនាស៊ីក",
        "kn": "ಸಿಖ್ ಧರ್ಮ",
        "ku": "Sikhism",
        "ky": "сикхизм",
        "la": "Sikhism",
        "lo": "ສາສະໜາຊິກ",
        "lt": "Sikizmas",
        "lv": "Sikhisms",
        "mg": "Sikhism",
        "mi": "Sikhism",
        "mk": "Сикизмот",
        "ml": "സിഖ് മതം",
        "mn": "Сикхизм",
        "mr": "शीख धर्म",
        "ms": "Sikhisme",
        "mt": "Sikhism",
        "my": "ဆစ်ခ်ဘာသာ",
        "ne": "सिख धर्म",
        "no": "Sikhisme",
        "ny": "Chisikhism",
        "or": "ଶିଖ ଧର୍ମ",
        "pa": "ਸਿੱਖ ਧਰਮ",
        "ps": "سکهیت",
        "ro": "Sikhismul",
        "rw": "Abasikisimu",
        "sd": "سِکيا",
        "si": "සික් ආගම",
        "sk": "sikhizmus",
        "sl": "Sikhizem",
        "sm": "Sikhism",
        "sn": "ChiSikhism",
        "so": "Sikhism",
        "sq": "Sikizmi",
        "sr": "сикхизам",
        "st": "Bosikhism",
        "su": "Sikhisme",
        "sv": "Sikhism",
        "sw": "Kalasinga",
        "ta": "சீக்கிய மதம்",
        "te": "సిక్కు మతం",
        "tg": "сикхизм",
        "th": "ศาสนาซิกข์",
        "tk": "Syhizm",
        "ug": "سىخىزم",
        "uz": "sikxizm",
        "xh": "UbuSikhism",
        "yi": "סיכיסם",
        "yo": "Sikhism",
        "zu": "UbuSikh"
    },
    "Buddhism": {
        "bn": "বৌদ্ধধর্ম",
        "hi": "बौद्ध धर्म",
        "ar": "البوذية",
        "es": "Budismo",
        "fr": "Bouddhisme",
        "de": "Buddhismus",
        "ja": "仏教",
        "tr": "Budizm",
        "ru": "Буддизм",
        "pt": "Budismo",
        "id": "Buddha",
        "ur": "بدھ مت",
        "it": "Buddismo",
        "zh": "佛教",
        "ko": "불교",
        "fa": "بودیسم",
        "he": "בודהיזם",
        "nl": "Boeddhisme",
        "pl": "Buddyzm",
        "uk": "буддизм",
        "vi": "Phật giáo",
        "af": "Boeddhisme",
        "am": "ቡዲዝም",
        "as": "বৌদ্ধ ধৰ্ম",
        "az": "Buddizm",
        "be": "будызм",
        "bg": "будизъм",
        "bs": "Budizam",
        "ca": "budisme",
        "ceb": "Budhismo",
        "cs": "buddhismus",
        "cy": "Bwdhaeth",
        "da": "Buddhisme",
        "el": "βουδισμός",
        "eo": "Budhismo",
        "et": "budism",
        "eu": "Budismoa",
        "fi": "buddhalaisuus",
        "fil": "Budismo",
        "ga": "Búdachas",
        "gd": "Buddhism",
        "gl": "Budismo",
        "gu": "બૌદ્ધ ધર્મ",
        "ha": "addinin Buddha",
        "haw": "Buddhism",
        "hr": "Budizam",
        "hu": "buddhizmus",
        "hy": "բուդդիզմ",
        "ig": "Okpukpe Buddha",
        "is": "Búddismi",
        "jv": "Budha",
        "ka": "ბუდიზმი",
        "kk": "буддизм",
        "km": "ពុទ្ធសាសនា",
        "kn": "ಬೌದ್ಧಧರ್ಮ",
        "ku": "Budîzm",
        "ky": "буддизм",
        "la": "Buddhismus",
        "lo": "ພຸດທະສາສະໜາ",
        "lt": "budizmas",
        "lv": "budisms",
        "mg": "Bodisma",
        "mi": "Buddhism",
        "mk": "будизмот",
        "ml": "ബുദ്ധമതം",
        "mn": "Буддизм",
        "mr": "बौद्ध धर्म",
        "ms": "agama Buddha",
        "mt": "Buddiżmu",
        "my": "ဗုဒ္ဓဘာသာ",
        "ne": "बुद्ध धर्म",
        "no": "Buddhisme",
        "ny": "Chibuda",
        "or": "ବ h ଦ୍ଧ ଧର୍ମ",
        "pa": "ਬੁੱਧ ਧਰਮ",
        "ps": "بودیزم",
        "ro": "budism",
        "rw": "Budisime",
        "sd": "ٻڌ ڌرم",
        "si": "බුද්ධාගම",
        "sk": "budhizmus",
        "sl": "Budizem",
        "sm": "lotu Puta",
        "sn": "Buddhism",
        "so": "Budhiismka",
        "sq": "budizmi",
        "sr": "будизам",
        "st": "Bobuddha",
        "su": "Budha",
        "sv": "Buddhism",
        "sw": "Ubudha",
        "ta": "பௌத்தம்",
        "te": "బౌద్ధమతం",
        "tg": "буддизм",
        "th": "พระพุทธศาสนา",
        "tk": "Buddizm",
        "ug": "بۇددىزم",
        "uz": "Buddizm",
        "xh": "UbuBhuda",
        "yi": "בודדהיסם",
        "yo": "Buddhism",
        "zu": "UbuBuddha"
    },
    "Judaism": {
        "bn": "ইহুদিধর্ম",
        "hi": "यहूदी धर्म",
        "ar": "اليهودية",
        "es": "Judaísmo",
        "fr": "Judaïsme",
        "de": "Judentum",
        "ja": "ユダヤ教",
        "tr": "Musevilik",
        "ru": "Иудаизм",
        "pt": "Judaísmo",
        "id": "Yudaisme",
        "ur": "یہودیت",
        "it": "Ebraismo",
        "zh": "犹太教",
        "ko": "유대교",
        "fa": "یهودیت",
        "he": "יהדות",
        "nl": "Jodendom",
        "pl": "Judaizm",
        "uk": "іудаїзм",
        "vi": "đạo Do Thái",
        "af": "Judaïsme",
        "am": "ይሁዲነት",
        "as": "ইহুদী ধৰ্ম",
        "az": "yəhudilik",
        "be": "Іудаізм",
        "bg": "юдаизъм",
        "bs": "Judaizam",
        "ca": "El judaisme",
        "ceb": "Judaismo",
        "cs": "judaismus",
        "cy": "Iddewiaeth",
        "da": "Jødedommen",
        "el": "Ιουδαϊσμός",
        "eo": "judismo",
        "et": "judaism",
        "eu": "judaismoa",
        "fi": "juutalaisuus",
        "fil": "Hudaismo",
        "ga": "Giúdachas",
        "gd": "Iùdhachas",
        "gl": "o xudaísmo",
        "gu": "યહુદી ધર્મ",
        "ha": "Yahudanci",
        "haw": "ka hoomana Iudaio",
        "hr": "judaizam",
        "hu": "judaizmus",
        "hy": "հուդայականություն",
        "ig": "Okpukpe ndị Juu",
        "is": "Gyðingdómur",
        "jv": "Yudaisme",
        "ka": "იუდაიზმი",
        "kk": "иудаизм",
        "km": "សាសនាយូដា",
        "kn": "ಜುದಾಯಿಸಂ",
        "ku": "Cihûtî",
        "ky": "иудаизм",
        "la": "Judaism",
        "lo": "ສາສະໜາຢິວ",
        "lt": "judaizmas",
        "lv": "jūdaisms",
        "mg": "Jodaisma",
        "mi": "Huria",
        "mk": "јудаизмот",
        "ml": "യഹൂദമതം",
        "mn": "Иудаизм",
        "mr": "यहुदी धर्म",
        "ms": "agama Yahudi",
        "mt": "Ġudaiżmu",
        "my": "ဂျူးဘာသာ",
        "ne": "यहूदी धर्म",
        "no": "Jødedommen",
        "ny": "Chiyuda",
        "or": "ଯିହୁଦୀ ଧର୍ମ |",
        "pa": "ਯਹੂਦੀ ਧਰਮ",
        "ps": "یهودیت",
        "ro": "iudaismul",
        "rw": "Idini rya Kiyahudi",
        "sd": "يهوديت",
        "si": "යුදෙව් ආගම",
        "sk": "judaizmus",
        "sl": "Judovstvo",
        "sm": "faa-Iutaia",
        "sn": "ChiJudha",
        "so": "Yuhuuda",
        "sq": "Judaizmin",
        "sr": "јудаизам",
        "st": "Bolumeli ba Sejuda",
        "su": "Yahudi",
        "sv": "judendom",
        "sw": "Uyahudi",
        "ta": "யூத மதம்",
        "te": "జుడాయిజం",
        "tg": "яҳудӣ",
        "th": "ศาสนายิว",
        "tk": "Iudaizm",
        "ug": "يەھۇدىي دىنى",
        "uz": "yahudiylik",
        "xh": "UbuYuda",
        "yi": "אידישקייט",
        "yo": "Ẹsin Juu",
        "zu": "UbuJuda"
    },
    "Feed": {
        "bn": "ফিড",
        "hi": "फ़ीड",
        "ar": "الرئيسية",
        "es": "Inicio",
        "fr": "Flux",
        "de": "Feed",
        "ja": "フィード",
        "tr": "Akış",
        "ru": "Лента",
        "pt": "Feed",
        "id": "Feed",
        "ur": "فیڈ",
        "it": "Feed",
        "zh": "信息流",
        "ko": "피드",
        "fa": "فید",
        "he": "לְהַאֲכִיל"
    },
    "Books": {
        "bn": "গ্রন্থসমূহ",
        "hi": "पुस्तकें",
        "ar": "الكتب",
        "es": "Libros",
        "fr": "Livres",
        "de": "Bücher",
        "ja": "書籍",
        "tr": "Kitaplar",
        "ru": "Книги",
        "pt": "Livros",
        "id": "Buku",
        "ur": "کتب",
        "it": "Libri",
        "zh": "经书",
        "ko": "서적",
        "fa": "کتاب‌ها",
        "he": "ספרים"
    },
    "Saved": {
        "bn": "সংরক্ষিত",
        "hi": "सहेजे गए",
        "ar": "المحفوظات",
        "es": "Guardados",
        "fr": "Enregistrés",
        "de": "Gespeichert",
        "ja": "保存済み",
        "tr": "Kaydedilenler",
        "ru": "Сохраненные",
        "pt": "Salvos",
        "id": "Tersimpan",
        "ur": "محفوظ",
        "it": "Salvati",
        "zh": "已收藏",
        "ko": "저장됨",
        "fa": "ذخیره شده",
        "he": "נשמר"
    },
    "Settings": {
        "bn": "সেটিংস",
        "hi": "सेटिंग्स",
        "ar": "الإعدادات",
        "es": "Ajustes",
        "fr": "Paramètres",
        "de": "Einstellungen",
        "ja": "設定",
        "tr": "Ayarlar",
        "ru": "Настройки",
        "pt": "Configurações",
        "id": "Pengaturan",
        "ur": "ترتیبات",
        "it": "Impostazioni",
        "zh": "设置",
        "ko": "설정",
        "fa": "تنظیمات",
        "he": "הגדרות"
    },
    "Spiritual Wisdom": {
        "bn": "আধ্যাত্মিক জ্ঞান",
        "hi": "आध्यात्मिक ज्ञान",
        "ar": "الحكمة الروحية",
        "es": "Sabiduría Espiritual",
        "fr": "Sagesse Spirituelle",
        "de": "Spirituelle Weisheit",
        "ja": "精神の知恵",
        "tr": "Manevi Bilgelik",
        "ru": "Духовная Мудрость",
        "pt": "Sabedoria Espiritual",
        "id": "Kebijaksanaan Spiritual",
        "ur": "روحانی حکمت",
        "it": "Saggezza Spirituale",
        "zh": "心灵智慧",
        "ko": "영적 지혜",
        "fa": "حکمت معنوی",
        "he": "חוכמה רוחנית"
    },
    "Access scriptures, curated ambient tracks, and personalized daily verses.": {
        "bn": "ধর্মগ্রন্থ, মননশীল সুর এবং প্রতিদিনের অনুপ্রেরণামূলক বাণী উপভোগ করুন।",
        "hi": "धर्मग्रंथों, परिवेशी धुनों और दैनिक श्लोकों का अनुभव करें।",
        "ar": "استمتع بالكتب المقدسة، والمقاطع الهادئة، والآيات اليومية المخصصة.",
        "es": "Accede a escrituras, pistas ambientales y versos diarios personalizados.",
        "fr": "Accédez aux écritures, morceaux d'ambiance et versets quotidiens personnalisés.",
        "de": "Greifen Sie auf Schriften, Ambient-Tracks und tägliche Verse zu.",
        "ja": "聖典、厳選されたアンビエント音楽、パーソナライズされた聖句にアクセス。",
        "tr": "Kutsal metinlere, huzurlu müziklere ve günlük ayetlere erişin.",
        "ru": "Читайте священные тексты, слушайте медитативную музыку и стихи на каждый день.",
        "pt": "Acesse escrituras, faixas ambientes e versículos diários personalizados.",
        "id": "Akses kitab suci, musik latar yang menenangkan, dan ayat harian pilihan.",
        "ur": "مقدس کتب، پرسکون موسیقی اور روزانہ کی آیات تک رسائی حاصل کریں۔",
        "it": "Accedi alle scritture, tracce ambientali e versetti giornalieri personalizzati.",
        "zh": "探索神圣经典、精选环境音效和每日个性化经文。",
        "ko": "경전, 엄선된 명상 음악, 맞춤형 일일 구절을 만나보세요.",
        "fa": "به متون مقدس، آهنگ‌های آرامش‌بخش و آیات روزانه دسترسی پیدا کنید.",
        "he": "גישה לכתבי קודש, רצועות אווירה שנאספו ופסוקים יומיומיים מותאמים אישית."
    },
    "Remove Ads": {
        "bn": "বিজ্ঞাপন সরান",
        "hi": "विज्ञापन हटाएं",
        "ar": "إزالة الإعلانات",
        "es": "Quitar anuncios",
        "fr": "Supprimer les pubs",
        "de": "Werbung entfernen",
        "ja": "広告を非表示",
        "tr": "Reklamları Kaldır",
        "ru": "Убрать рекламу",
        "pt": "Remover Anúncios",
        "id": "Hapus Iklan",
        "ur": "اشتہارات ہٹائیں",
        "it": "Rimuovi Annunci",
        "zh": "去除广告",
        "ko": "광고 제거",
        "fa": "حذف تبلیغات",
        "he": "הסר מודעות"
    },
    "Sponsored": {
        "bn": "স্পনসরড",
        "hi": "प्रायोजित",
        "ar": "برعاية",
        "es": "Patrocinado",
        "fr": "Sponsorisé",
        "de": "Gesponsert",
        "ja": "スポンサー",
        "tr": "Sponsorlu",
        "ru": "Реклама",
        "pt": "Patrocinado",
        "id": "Disponsori",
        "ur": "اسپانسر شدہ",
        "it": "Sponsorizzato",
        "zh": "赞助",
        "ko": "스폰서",
        "fa": "حمایت شده",
        "he": "ממומן"
    },
    "Premium": {
        "bn": "প্রিমিয়াম",
        "hi": "प्रीमियम",
        "ar": "بريميوم",
        "es": "Premium",
        "fr": "Premium",
        "de": "Premium",
        "ja": "プレミアム",
        "tr": "Premium",
        "ru": "Премиум",
        "pt": "Premium",
        "id": "Premium",
        "ur": "پریمیم",
        "it": "Premium",
        "zh": "高级版",
        "ko": "프리미엄",
        "fa": "ویژه",
        "he": "פּרֶמיָה"
    },
    "Language": {
        "bn": "ভাষা",
        "hi": "भाषा",
        "ar": "اللغة",
        "es": "Idioma",
        "fr": "Langue",
        "de": "Sprache",
        "ja": "言語",
        "tr": "Dil",
        "ru": "Язык",
        "pt": "Idioma",
        "id": "Bahasa",
        "ur": "زبان",
        "it": "Lingua",
        "zh": "语言",
        "ko": "언어",
        "fa": "زبان",
        "he": "שָׂפָה"
    },
    "Choose Language": {
        "bn": "ভাষা নির্বাচন করুন",
        "hi": "भाषा चुनें",
        "ar": "اختر اللغة",
        "es": "Elegir idioma",
        "fr": "Choisir la langue",
        "de": "Sprache wählen",
        "ja": "言語を選択",
        "tr": "Dil Seçin",
        "ru": "Выберите язык",
        "pt": "Escolher Idioma",
        "id": "Pilih Bahasa",
        "ur": "زبان منتخب کریں",
        "it": "Scegli la lingua",
        "zh": "选择语言",
        "ko": "언어 선택",
        "fa": "انتخاب زبان",
        "he": "בחר שפה"
    },
    "Search language...": {
        "bn": "ভাষা খুঁজুন...",
        "hi": "भाषा खोजें...",
        "ar": "ابحث عن لغة...",
        "es": "Buscar idioma...",
        "fr": "Rechercher une langue...",
        "de": "Sprache suchen...",
        "ja": "言語を検索...",
        "tr": "Dil ara...",
        "ru": "Поиск языка...",
        "pt": "Buscar idioma...",
        "id": "Cari bahasa...",
        "ur": "زبان تلاش کریں...",
        "it": "Cerca lingua...",
        "zh": "搜索语言...",
        "ko": "언어 검색...",
        "fa": "جستجوی زبان...",
        "he": "שפת חיפוש..."
    },
    "Privacy Policy": {
        "bn": "গোপনীয়তা নীতি",
        "hi": "गोपनीयता नीति",
        "ar": "سياسة الخصوصية",
        "es": "Política de privacidad",
        "fr": "Politique de confidentialité",
        "de": "Datenschutz",
        "ja": "プライバシーポリシー",
        "tr": "Gizlilik Politikası",
        "ru": "Политика конфиденциальности",
        "pt": "Política de Privacidade",
        "id": "Kebijakan Privasi",
        "ur": "رازداری کی پالیسی",
        "it": "Informativa sulla privacy",
        "zh": "隐私政策",
        "ko": "개인정보처리방침",
        "fa": "سیاست حفظ حریم خصوصی",
        "he": "מדיניות פרטיות"
    },
    "Terms of Service": {
        "bn": "ব্যবহারের শর্তাবলী",
        "hi": "सेवा की शर्तें",
        "ar": "شروط الخدمة",
        "es": "Términos del servicio",
        "fr": "Conditions d'utilisation",
        "de": "Nutzungsbedingungen",
        "ja": "利用規約",
        "tr": "Kullanım Koşulları",
        "ru": "Условия использования",
        "pt": "Termos de Serviço",
        "id": "Ketentuan Layanan",
        "ur": "خدمات کی شرائط",
        "it": "Termini di servizio",
        "zh": "服务条款",
        "ko": "이용약관",
        "fa": "شرایط خدمات",
        "he": "תנאים והגבלות"
    },
    "Credits": {
        "bn": "স্বীকৃতি ও কৃতজ্ঞতা",
        "hi": "आभार एवं श्रेय",
        "ar": "المصادر والاعتمادات",
        "es": "Créditos",
        "fr": "Crédits",
        "de": "Credits",
        "ja": "クレジット",
        "tr": "Katkıda Bulunanlar",
        "ru": "Благодарности",
        "pt": "Créditos",
        "id": "Kredit",
        "ur": "کریڈٹس",
        "it": "Crediti",
        "zh": "致谢",
        "ko": "크레딧",
        "fa": "اعتبارات",
        "he": "קרדיטים"
    },
    "Continue as Guest": {
        "bn": "অতিথি হিসেবে চালান",
        "hi": "अतिथि के रूप में जारी रखें",
        "ar": "المتابعة كضيف",
        "es": "Continuar como invitado",
        "fr": "Continuer en tant qu'invité",
        "de": "Als Gast fortfahren",
        "ja": "ゲストとして続行",
        "tr": "Misafir Olarak Devam Et",
        "ru": "Продолжить как гость",
        "pt": "Continuar como Convidado",
        "id": "Lanjutkan হিসেবে Tamu",
        "ur": "بطور مہمان جاری رکھیں",
        "it": "Continua come ospite",
        "zh": "以访客身份继续",
        "ko": "게스트로 계속",
        "fa": "ادامه به عنوان مهمان",
        "he": "המשך כאורח"
    },
    "Sign in with Google": {
        "bn": "Google দিয়ে সাইন ইন",
        "hi": "Google से साइन इन करें",
        "ar": "تسجيل الدخول باستخدام Google",
        "es": "Iniciar sesión con Google",
        "fr": "Se connecter avec Google",
        "de": "Mit Google anmelden",
        "ja": "Googleでログイン",
        "tr": "Google ile Giriş Yap",
        "ru": "Войти через Google",
        "pt": "Entrar com o Google",
        "id": "Masuk dengan Google",
        "ur": "گوگل کے ساتھ سائن ان کریں",
        "it": "Accedi con Google",
        "zh": "使用 Google 登录",
        "ko": "Google로 로그인",
        "fa": "ورود با Google",
        "he": "היכנס באמצעות גוגל"
    },
    "Search verses or authors...": {
        "bn": "আয়াত বা গ্রন্থ খুঁজুন...",
        "hi": "श्लोक या लेखक खोजें...",
        "ar": "ابحث عن الآيات أو الكتب...",
        "es": "Buscar versos o libros...",
        "fr": "Rechercher des versets...",
        "de": "Verse oder Bücher suchen...",
        "ja": "詩句や本を検索...",
        "tr": "Ayet veya kitap ara...",
        "ru": "Поиск стихов или книг...",
        "pt": "Buscar versículos...",
        "id": "Cari ayat বা buku...",
        "ur": "آیات یا کتب تلاش کریں...",
        "it": "Cerca versetti o libri...",
        "zh": "搜索经文或书籍...",
        "ko": "구절 또는 책 검색...",
        "fa": "جستجوی آیات یا کتاب‌ها...",
        "he": "חפש פסוקים או מחברים..."
    },
    "All": {
        "bn": "সকল",
        "hi": "सभी",
        "ar": "الكل",
        "es": "Todos",
        "fr": "Tous",
        "de": "Alle",
        "ja": "すべて",
        "tr": "Tümü",
        "ru": "Все",
        "pt": "Todos",
        "id": "Semua",
        "ur": "تمام",
        "it": "Tutti",
        "zh": "全部",
        "ko": "전체",
        "fa": "همه",
        "he": "כֹּל"
    },
    "Default": {
        "bn": "ডিফল্ট",
        "hi": "डिफ़ॉल्ट",
        "ar": "الافتراضي",
        "es": "Predeterminado",
        "fr": "Par défaut",
        "de": "Standard",
        "ja": "デフォルト",
        "tr": "Varsayılan",
        "ru": "По умолчанию",
        "pt": "Padrão",
        "id": "Default",
        "ur": "ڈیفالٹ",
        "it": "Predefinito",
        "zh": "默认",
        "ko": "기본",
        "fa": "پیش‌فرض",
        "he": "בְּרִירַת מֶחדָל"
    },
    "Chapter": {
        "bn": "অধ্যায়",
        "hi": "अध्याय",
        "ar": "الفصل",
        "es": "Capítulo",
        "fr": "Chapitre",
        "de": "Kapitel",
        "ja": "章",
        "tr": "Bölüm",
        "ru": "Глава",
        "pt": "Capítulo",
        "id": "Bab",
        "ur": "باب",
        "it": "Capitolo",
        "zh": "章",
        "ko": "장",
        "fa": "فصل",
        "he": "פֶּרֶק",
        "nl": "Hoofdstuk",
        "pl": "Rozdział",
        "uk": "Розділ",
        "vi": "chương",
        "af": "Hoofstuk",
        "am": "ምዕራፍ",
        "as": "অধ্যায়",
        "az": "Fəsil",
        "be": "Кіраўнік",
        "bg": "Глава",
        "bs": "Poglavlje",
        "ca": "Capítol",
        "ceb": "Kapitulo",
        "cs": "kapitola",
        "cy": "Pennod",
        "da": "Kapitel",
        "el": "Κεφάλαιο",
        "eo": "Ĉapitro",
        "et": "Peatükk",
        "eu": "kapitulua",
        "fi": "Luku",
        "fil": "Kabanata",
        "ga": "Caibidil",
        "gd": "Caibideil",
        "gl": "Capítulo",
        "gu": "પ્રકરણ",
        "ha": "Babi",
        "haw": "Mokuna",
        "hr": "poglavlje",
        "hu": "fejezet",
        "hy": "Գլուխ",
        "ig": "Isi",
        "is": "kafli",
        "jv": "Bab",
        "ka": "თავი",
        "kk": "тарау",
        "km": "ជំពូក",
        "kn": "Chapter",
        "ku": "Chapter",
        "ky": "бөлүм",
        "la": "Caput",
        "lo": "ບົດ",
        "lt": "skyrius",
        "lv": "nodaļa",
        "mg": "Toko",
        "mi": "Upoko",
        "mk": "Поглавје",
        "ml": "അധ്യായം",
        "mn": "Бүлэг",
        "mr": "धडा",
        "ms": "Bab",
        "mt": "Kapitlu",
        "my": "အခန်း",
        "ne": "अध्याय",
        "no": "Kapittel",
        "ny": "Mutu",
        "or": "ଅଧ୍ୟାୟ",
        "pa": "ਅਧਿਆਇ",
        "ps": "څپرکی",
        "ro": "Capitolul",
        "rw": "Umutwe",
        "sd": "باب",
        "si": "පරිච්ඡේදය",
        "sk": "kapitola",
        "sl": "poglavje",
        "sm": "Mataupu",
        "sn": "Chitsauko",
        "so": "Cutubka",
        "sq": "Kapitulli",
        "sr": "Поглавље",
        "st": "Khaolo",
        "su": "Bab",
        "sv": "Kapitel",
        "sw": "Sura",
        "ta": "அத்தியாயம்",
        "te": "అధ్యాయం",
        "tg": "Боб",
        "th": "บทที่",
        "tk": "Bap",
        "ug": "باب",
        "uz": "Bob",
        "xh": "Isahluko",
        "yi": "קאַפּיטל",
        "yo": "Abala",
        "zu": "Isahluko"
    },
    "Verse": {
        "bn": "আয়াত",
        "hi": "श्लोक",
        "ar": "الآية",
        "es": "Verso",
        "fr": "Verset",
        "de": "Vers",
        "ja": "節",
        "tr": "Ayet",
        "ru": "Стих",
        "pt": "Versículo",
        "id": "Ayat",
        "ur": "آیت",
        "it": "Versetto",
        "zh": "节",
        "ko": "절",
        "fa": "آیه",
        "he": "פָּסוּק"
    },
    "Back": {
        "bn": "পেছনে",
        "hi": "वापस",
        "ar": "رجوع",
        "es": "Volver",
        "fr": "Retour",
        "de": "Zurück",
        "ja": "戻る",
        "tr": "Geri",
        "ru": "Назад",
        "pt": "Voltar",
        "id": "Kembali",
        "ur": "پیچھے",
        "it": "Indietro",
        "zh": "返回",
        "ko": "뒤로",
        "fa": "بازگشت",
        "he": "בְּחֲזָרָה"
    },
    "No verses in this folder": {
        "bn": "এই ফোল্ডারে কোনো সংরক্ষিত আয়াত নেই",
        "hi": "इस फ़ोल्डर में कोई श्लोक नहीं है",
        "ar": "لا توجد آيات في هذا المجلد",
        "es": "No hay versos en esta carpeta",
        "fr": "Aucun verset dans ce dossier",
        "de": "Keine Verse in diesem Ordner",
        "ja": "このフォルダには詩句がありません",
        "tr": "Bu klasörde ayet yok",
        "ru": "В этой папке нет стихов",
        "pt": "Nenhum versículo nesta pasta",
        "id": "Tidak ada ayat di folder ini",
        "ur": "اس فولڈر میں کوئی آیت نہیں ہے",
        "it": "Nessun versetto in questa cartella",
        "zh": "此文件夹中没有经文",
        "ko": "이 폴더에 구절이 없습니다",
        "fa": "هیچ آیه‌ای در این پوشه نیست",
        "he": "אין פסוקים בתיקייה זו"
    },
    "Create Folder": {
        "bn": "নতুন ফোল্ডার",
        "hi": "फ़ोल्डर बनाएं",
        "ar": "إنشاء مجلد",
        "es": "Crear carpeta",
        "fr": "Créer un dossier",
        "de": "Ordner erstellen",
        "ja": "フォルダを作成",
        "tr": "Klasör Oluştur",
        "ru": "Создать папку",
        "pt": "Criar Pasta",
        "id": "Buat Folder",
        "ur": "فولڈر بنائیں",
        "it": "Crea cartella",
        "zh": "创建文件夹",
        "ko": "폴더 생성",
        "fa": "ایجاد پوشه",
        "he": "צור תיקיה"
    },
    "Folder Name": {
        "bn": "ফোল্ডারের নাম",
        "hi": "फ़ोल्डर का नाम",
        "ar": "اسم المجلد",
        "es": "Nombre de carpeta",
        "fr": "Nom du dossier",
        "de": "Ordnername",
        "ja": "フォルダ名",
        "tr": "Klasör Adı",
        "ru": "Имя папки",
        "pt": "Nome da Pasta",
        "id": "Nama Folder",
        "ur": "فولڈر کا نام",
        "it": "Nome cartella",
        "zh": "文件夹名称",
        "ko": "폴더 이름",
        "fa": "نام پوشه",
        "he": "שם התיקיה"
    },
    "New Name": {
        "bn": "নতুন নাম",
        "hi": "नया नाम",
        "ar": "الاسم الجديد",
        "es": "Nuevo nombre",
        "fr": "Nouveau nom",
        "de": "Neuer Name",
        "ja": "新しい名前",
        "tr": "Yeni Ad",
        "ru": "Новое имя",
        "pt": "Novo Nome",
        "id": "Nama Baru",
        "ur": "نیا نام",
        "it": "Nuovo nome",
        "zh": "新名称",
        "ko": "새 이름",
        "fa": "نام جدید",
        "he": "שם חדש"
    },
    "Rename": {
        "bn": "নাম পরিবর্তন",
        "hi": "নাম बदलें",
        "ar": "إعادة تسمية",
        "es": "Renombrar",
        "fr": "Renommer",
        "de": "Umbenennen",
        "ja": "名前変更",
        "tr": "Yeniden Adlandır",
        "ru": "Переименовать",
        "pt": "Renomear",
        "id": "Ubah Nama",
        "ur": "نام تبدیل کریں",
        "it": "Rinomina",
        "zh": "重命名",
        "ko": "이름 변경",
        "fa": "تغییر نام",
        "he": "שנה שם"
    },
    "Delete Account": {
        "bn": "অ্যাকাউন্ট মুছুন",
        "hi": "खाता हटाएं",
        "ar": "حذف الحساب",
        "es": "Eliminar cuenta",
        "fr": "Supprimer le compte",
        "de": "Konto löschen",
        "ja": "アカウント削除",
        "tr": "Hesabı Sil",
        "ru": "Удалить аккаунт",
        "pt": "Excluir Conta",
        "id": "Hapus Akun",
        "ur": "اکاؤنٹ حذف کریں",
        "it": "Elimina account",
        "zh": "删除账户",
        "ko": "계정 삭제",
        "fa": "حذف حساب",
        "he": "מחק חשבון"
    },
    "Sign Out": {
        "bn": "সাইন আউট",
        "hi": "साइन आउट",
        "ar": "تسجيل الخروج",
        "es": "Cerrar sesión",
        "fr": "Se déconnecter",
        "de": "Abmelden",
        "ja": "サインアウト",
        "tr": "Çıkış Yap",
        "ru": "Выйти",
        "pt": "Sair",
        "id": "Keluar",
        "ur": "سائن آؤٹ",
        "it": "Esci",
        "zh": "退出登录",
        "ko": "로그아웃",
        "fa": "خروج",
        "he": "צא"
    },
    "Cancel": {
        "bn": "বাতিল",
        "hi": "रद्द करें",
        "ar": "إلغاء",
        "es": "Cancelar",
        "fr": "Annuler",
        "de": "Abbrechen",
        "ja": "キャンセル",
        "tr": "İptal",
        "ru": "Отмена",
        "pt": "Cancelar",
        "id": "Batal",
        "ur": "منسوخ",
        "it": "Annulla",
        "zh": "取消",
        "ko": "취소",
        "fa": "لغو",
        "he": "לְבַטֵל"
    },
    "AD Free": {
        "bn": "বিজ্ঞাপনমুক্ত অভিজ্ঞতা",
        "hi": "विज्ञापन मुक्त",
        "ar": "خالٍ من الإعلانات",
        "es": "Sin anuncios",
        "fr": "Sans publicité",
        "de": "Werbefrei",
        "ja": "広告なし",
        "tr": "Reklamsız",
        "ru": "Без рекламы",
        "pt": "Sem anúncios",
        "id": "Bebas Iklan",
        "ur": "اشتہارات سے پاک",
        "it": "Senza pubblicità",
        "zh": "无广告体验",
        "ko": "광고 없음",
        "fa": "بدون تبلیغات",
        "he": "ללא פרסומות"
    },
    "All HD Offline Voices": {
        "bn": "সকল এইচডি অফলাইন ভয়েস",
        "hi": "सभी एचडी ऑफ़लाइन आवाज़ें",
        "ar": "جميع الأصوات فائقة الجودة بدون إنترنت",
        "es": "Todas las voces HD sin conexión",
        "fr": "Toutes les voix HD hors ligne",
        "de": "Alle HD-Offline-Stimmen",
        "ja": "すべてのHDオフライン音声",
        "tr": "Tüm HD Çevrimdışı Sesler",
        "ru": "Все HD голоса офлайн",
        "pt": "Todas as vozes HD offline",
        "id": "Semua Suara HD Offline",
        "ur": "تمام ایچ ڈی آف لائن آوازیں",
        "it": "Tutte le voci HD offline",
        "zh": "所有高清离线语音",
        "ko": "모든 HD 오프라인 음성",
        "fa": "تمام صداهای HD آفلاین",
        "he": "כל הקולות HD לא מקוונים"
    },
    "Unlimited Folders 30 Char": {
        "bn": "সীমাহীন বুকমার্ক ফোল্ডার",
        "hi": "असीमित फ़ोल्डर",
        "ar": "مجلدات غير محدودة",
        "es": "Carpetas ilimitadas",
        "fr": "Dossiers illimités",
        "de": "Unbegrenzte Ordner",
        "ja": "無制限のフォルダ",
        "tr": "Sınırsız Klasör",
        "ru": "Неограниченное количество папок",
        "pt": "Pastas ilimitadas",
        "id": "Folder Tanpa Batas",
        "ur": "لامحدود فولڈرز",
        "it": "Cartelle illimitate",
        "zh": "无限收藏文件夹",
        "ko": "무제한 폴더",
        "fa": "پوشه‌های نامحدود",
        "he": "תיקיות ללא הגבלה 30 Char"
    },
    "Custom Topic Filters": {
        "bn": "কাস্টম টপিক ফিল্টার",
        "hi": "कस्टम विषय फ़िल्टर",
        "ar": "فلاتر مخصصة للمواضيع",
        "es": "Filtros de temas personalizados",
        "fr": "Filtres de sujets personnalisés",
        "de": "Benutzerdefinierte Themenfilter",
        "ja": "カスタムトピックフィルター",
        "tr": "Özel Konu Filtreleri",
        "ru": "Фильтры по темам",
        "pt": "Filtros de tópicos personalizados",
        "id": "Filter Topik Kustom",
        "ur": "اپنی مرضی کے موضوعاتی فلٹرز",
        "it": "Filtri tematici personalizzati",
        "zh": "自定义主题筛选",
        "ko": "맞춤형 주제 필터",
        "fa": "فیلترهای موضوعی سفارشی",
        "he": "מסנני נושאים מותאמים אישית"
    },
    "Source Narration": {
        "bn": "গ্রন্থের নামসহ পাঠ",
        "hi": "स्रोत का उच्चारण",
        "ar": "قراءة اسم المصدر",
        "es": "Narración de la fuente",
        "fr": "Narration de la source",
        "de": "Quellenangabe-Sprachausgabe",
        "ja": "出典名の読み上げ",
        "tr": "Kaynak Seslendirmesi",
        "ru": "Озвучивание источника",
        "pt": "Narração da fonte",
        "id": "Pengucapan Sumber",
        "ur": "ماخذ کی آواز",
        "it": "Narrazione della fonte",
        "zh": "来源播报",
        "ko": "출처 음성 안내",
        "fa": "اعلام منبع",
        "he": "קריינות מקור"
    },
    "Ambient Audio Controls": {
        "bn": "মননশীল ব্যাকগ্রাউন্ড সুর নিয়ন্ত্রণ",
        "hi": "परिवेशी ऑडियो नियंत्रण",
        "ar": "التحكم بالصوت الهادئ",
        "es": "Controles de audio ambiental",
        "fr": "Contrôles audio d'ambiance",
        "de": "Ambient-Audio-Steuerung",
        "ja": "アンビエント音響コントロール",
        "tr": "Ortam Sesi Kontrolleri",
        "ru": "Управление фоновым звуком",
        "pt": "Controles de áudio ambiente",
        "id": "Kontrol Audio Ambience",
        "ur": "پرسکون آواز کے کنٹرول",
        "it": "Controlli audio ambiente",
        "zh": "环境背景音调节",
        "ko": "배경음 조절",
        "fa": "کنترل صدای محیط",
        "he": "בקרות אודיו סביבתיות"
    },
    "Random Voice Rotation": {
        "bn": "স্বয়ংক্রিয় ভয়েস পরিবর্তন",
        "hi": "रैंडम वॉयस रोटेशन",
        "ar": "تبديل عشوائي للأصوات",
        "es": "Rotación aleatoria de voces",
        "fr": "Rotation aléatoire des voix",
        "de": "Zufällige Stimmenrotation",
        "ja": "ランダム音声ローテーション",
        "tr": "Rastgele Ses Döndürme",
        "ru": "Случайная смена голосов",
        "pt": "Rotação aleatória de vozes",
        "id": "Rotasi Suara Acak",
        "ur": "خودکار آواز کی تبدیلی",
        "it": "Rotazione casuale delle voci",
        "zh": "随机声音轮换",
        "ko": "랜덤 음성 순환",
        "fa": "چرخش تصادفی صدا",
        "he": "סיבוב קול אקראי"
    },
    "Get Annual": {
        "bn": "বার্ষিক প্ল্যান নিন",
        "hi": "वार्षिक प्लान लें",
        "ar": "احصل على الخطة السنوية",
        "es": "Obtener Anual",
        "fr": "Prendre l'annuel",
        "de": "Jährlich holen",
        "ja": "年間プランを取得",
        "tr": "Yıllık Al",
        "ru": "Годовая подписка",
        "pt": "Obter Anual",
        "id": "Ambil Tahunan",
        "ur": "سالانہ پلان لیں",
        "it": "Ottieni Annuale",
        "zh": "获取年度订阅",
        "ko": "연간 플랜 선택",
        "fa": "دریافت اشتراک سالانه",
        "he": "קבל שנתי"
    },
    "Get Monthly": {
        "bn": "মাসিক প্ল্যান নিন",
        "hi": "मासिक प्लान लें",
        "ar": "احصل على الخطة الشهرية",
        "es": "Obtener Mensual",
        "fr": "Prendre le mensuel",
        "de": "Monatlich holen",
        "ja": "月間プランを取得",
        "tr": "Aylık Al",
        "ru": "Месячная подписка",
        "pt": "Obter Mensal",
        "id": "Ambil Bulanan",
        "ur": "ماہانہ پلان لیں",
        "it": "Ottieni Mensile",
        "zh": "获取月度订阅",
        "ko": "월간 플랜 선택",
        "fa": "دریافت اشتراک ماهانه",
        "he": "קבל חודשי"
    },
    "Get Lifetime": {
        "bn": "আজীবন প্ল্যান নিন",
        "hi": "लाइफटाइम प्लान लें",
        "ar": "احصل على مدى الحياة",
        "es": "Obtener de por vida",
        "fr": "Accès à vie",
        "de": "Lebenslang holen",
        "ja": "買い切りプランを取得",
        "tr": "Ömür Boyu Al",
        "ru": "Навсегда",
        "pt": "Acesso Vitalício",
        "id": "Akses Seumur Hidup",
        "ur": "تامر پلان لیں",
        "it": "Ottieni a vita",
        "zh": "永久买断",
        "ko": "평생 이용권 선택",
        "fa": "دسترسی مادام‌العمر",
        "he": "קבל Lifetime"
    },
    "Sign In": {
        "bn": "সাইন ইন",
        "hi": "साइन इन",
        "ar": "تسجيل الدخول",
        "es": "Iniciar sesión",
        "fr": "Connexion",
        "de": "Anmelden",
        "ja": "サインイン",
        "tr": "Giriş Yap",
        "ru": "Войти",
        "pt": "Entrar",
        "id": "Masuk",
        "ur": "سائن ان",
        "it": "Accedi",
        "zh": "登录",
        "ko": "로그인",
        "fa": "ورود",
        "he": "היכנס"
    },
    "Sign Up": {
        "bn": "নিবন্ধন",
        "hi": "साइन अप",
        "ar": "إنشاء حساب",
        "es": "Registrarse",
        "fr": "Inscription",
        "de": "Registrieren",
        "ja": "新規登録",
        "tr": "Kayıt Ol",
        "ru": "Регистрация",
        "pt": "Cadastrar-se",
        "id": "Daftar",
        "ur": "سائن اپ",
        "it": "Registrati",
        "zh": "注册",
        "ko": "회원가입",
        "fa": "ثبت نام",
        "he": "הירשם"
    },
    "Full Name": {
        "bn": "পুরো নাম",
        "hi": "पूरा नाम",
        "ar": "الاسم الكامل",
        "es": "Nombre completo",
        "fr": "Nom complet",
        "de": "Vollständiger Name",
        "ja": "氏名",
        "tr": "Tam Ad",
        "ru": "Полное имя",
        "pt": "Nome Completo",
        "id": "Nama Lengkap",
        "ur": "پورا نام",
        "it": "Nome completo",
        "zh": "全名",
        "ko": "성명",
        "fa": "نام کامل",
        "he": "שם מלא"
    },
    "Email Address": {
        "bn": "ইমেইল ঠিকানা",
        "hi": "ईमेल पता",
        "ar": "البريد الإلكتروني",
        "es": "Correo electrónico",
        "fr": "Adresse e-mail",
        "de": "E-Mail-Adresse",
        "ja": "メールアドレス",
        "tr": "E-posta Adresi",
        "ru": "Адрес эл. почты",
        "pt": "Endereço de E-mail",
        "id": "Alamat Email",
        "ur": "ای میل پتہ",
        "it": "Indirizzo email",
        "zh": "电子邮件地址",
        "ko": "이메일 주소",
        "fa": "آدرس ایمیل",
        "he": "כתובת אימייל"
    },
    "Password": {
        "bn": "পাসওয়ার্ড",
        "hi": "पासवर्ड",
        "ar": "كلمة المرور",
        "es": "Contraseña",
        "fr": "Mot de passe",
        "de": "Passwort",
        "ja": "パスワード",
        "tr": "Şifre",
        "ru": "Пароль",
        "pt": "Senha",
        "id": "Kata Sandi",
        "ur": "پاس ورڈ",
        "it": "Password",
        "zh": "密码",
        "ko": "비밀번호",
        "fa": "رمز عبور",
        "he": "סִיסמָה"
    },
    "Confirm Password": {
        "bn": "পাসওয়ার্ড নিশ্চিত করুন",
        "hi": "पासवर्ड की पुष्टि करें",
        "ar": "تأكيد كلمة المرور",
        "es": "Confirmar contraseña",
        "fr": "Confirmer le mot de passe",
        "de": "Passwort bestätigen",
        "ja": "パスワード確認",
        "tr": "Şifreyi Onayla",
        "ru": "Подтвердите пароль",
        "pt": "Confirmar Senha",
        "id": "Konfirmasi Kata Sandi",
        "ur": "پاس ورڈ کی تصدیق کریں",
        "it": "Conferma password",
        "zh": "确认密码",
        "ko": "비밀번호 확인",
        "fa": "تأیید رمز عبور",
        "he": "אשר את הסיסמה"
    },
    "Forgot Password?": {
        "bn": "পাসওয়ার্ড ভুলে গেছেন?",
        "hi": "पासवर्ड भूल गए?",
        "ar": "نسيت كلمة المرور؟",
        "es": "¿Olvidaste tu contraseña?",
        "fr": "Mot de passe oublié ?",
        "de": "Passwort vergessen?",
        "ja": "パスワードをお忘れですか？",
        "tr": "Şifrenizi mi unuttunuz?",
        "ru": "Забыли пароль?",
        "pt": "Esqueceu a senha?",
        "id": "Lupa Kata Sandi?",
        "ur": "پاس ورڈ بھول گئے؟",
        "it": "Password dimenticata?",
        "zh": "忘记密码？",
        "ko": "비밀번호를 잊으셨나요?",
        "fa": "رمز عبور را فراموش کرده‌اید؟",
        "he": "שכחת סיסמא?"
    },
    "Continue with Google": {
        "bn": "Google দিয়ে চালিয়ে যান",
        "hi": "Google के साथ जारी रखें",
        "ar": "المتابعة باستخدام Google",
        "es": "Continuar con Google",
        "fr": "Continuer avec Google",
        "de": "Weiter mit Google",
        "ja": "Googleで続行",
        "tr": "Google ile Devam Et",
        "ru": "Продолжить с Google",
        "pt": "Continuar com o Google",
        "id": "Lanjutkan dengan Google",
        "ur": "گوگل کے ساتھ جاری رکھیں",
        "it": "Continua con Google",
        "zh": "使用 Google 继续",
        "ko": "Google로 계속하기",
        "fa": "ادامه با Google",
        "he": "המשך עם גוגל"
    },
    "Sutras": {
        "bn": "সূত্র",
        "hi": "सूत्र",
        "es": "Sutras",
        "he": "סוטרות",
        "ar": "سوترا",
        "ja": "お経",
        "zh": "佛经",
        "ko": "경전",
        "fr": "Soutras",
        "de": "Sutras",
        "ru": "Сутры",
        "it": "Sutra",
        "pt": "Sutras",
        "tr": "Sutralar",
        "id": "Sutra",
        "ur": "ستراس",
        "fa": "سوتراها",
        "nl": "Sutra's",
        "pl": "Sutry",
        "uk": "Сутри",
        "vi": "Kinh",
        "af": "Sutras",
        "am": "ሱትራስ",
        "as": "সূত্ৰ",
        "az": "Sutralar",
        "be": "Сутры",
        "bg": "Сутри",
        "bs": "Sutre",
        "ca": "Sutres",
        "ceb": "Sutras",
        "cs": "sútry",
        "cy": "Sutras",
        "da": "Sutraer",
        "el": "Σούτρα",
        "eo": "Sutroj",
        "et": "Sutrad",
        "eu": "Sutrak",
        "fi": "Sutrat",
        "fil": "Mga Sutra",
        "ga": "Sutras",
        "gd": "Sutras",
        "gl": "Sutras",
        "gu": "સૂત્રો",
        "ha": "Sutras",
        "haw": "Nā Sutras",
        "hr": "Sutre",
        "hu": "Szútrák",
        "hy": "Սուտրաներ",
        "ig": "Sutras",
        "is": "Sútra",
        "jv": "Sutras",
        "ka": "სუტრები",
        "kk": "Сутралар",
        "km": "ព្រះសូត្រ",
        "kn": "Sutras",
        "ku": "Sutras",
        "ky": "Сутралар",
        "la": "Sutras",
        "lo": "ສຸຕຣາ",
        "lt": "Sutros",
        "lv": "Sutras",
        "mg": "Sutras",
        "mi": "Sutras",
        "mk": "Сутри",
        "ml": "സൂത്രങ്ങൾ",
        "mn": "Билгүүн",
        "mr": "सूत्रे",
        "ms": "Sutra",
        "mt": "Sutras",
        "my": "သုတ္တန်",
        "ne": "सूत्रहरू",
        "no": "Sutraer",
        "ny": "Sutras",
        "or": "ସୂତ୍ର",
        "pa": "ਸੂਤਰ",
        "ps": "سوترا",
        "ro": "Sutre",
        "rw": "Sutras",
        "sd": "سوتر",
        "si": "සූත්ර",
        "sk": "Sútry",
        "sl": "Sutre",
        "sm": "Sutras",
        "sn": "Sutras",
        "so": "Sutras",
        "sq": "Sutra",
        "sr": "Сутре",
        "st": "Sutras",
        "su": "Sutras",
        "sv": "Sutras",
        "sw": "Sutras",
        "ta": "சூத்திரங்கள்",
        "te": "సూత్రాలు",
        "tg": "Сутраҳо",
        "th": "พระสูตร",
        "tk": "Sutralar",
        "ug": "Sutras",
        "uz": "Sutralar",
        "xh": "Sutras",
        "yi": "סוטראַס",
        "yo": "Sutras",
        "zu": "Sutras"
    },
    "SUTRAS": {
        "bn": "সূত্র",
        "hi": "सूत्र",
        "es": "Sutras",
        "he": "SUTRAS",
        "ar": "سوترا",
        "ja": "お経",
        "zh": "佛经",
        "ko": "경전",
        "fr": "SUTRAS",
        "de": "SUTRAS",
        "ru": "СУТРА",
        "it": "SUTRA",
        "pt": "SUTRAS",
        "tr": "SUTRALAR",
        "id": "SUTRA",
        "ur": "سوتر",
        "fa": "سوتراها"
    },
    "sutras": {
        "bn": "সূত্র",
        "hi": "सूत्र",
        "es": "Sutras",
        "he": "סוטרות",
        "ar": "سوترا",
        "ja": "お経",
        "zh": "佛经",
        "ko": "경전",
        "fr": "sutras",
        "de": "Sutras",
        "ru": "сутры",
        "it": "sutra",
        "pt": "sutras",
        "tr": "vecizeler",
        "id": "sutra",
        "ur": "ستراس",
        "fa": "سوتراها"
    },
    "Zen": {
        "bn": "জেন",
        "hi": "ज़ेन",
        "es": "Zen",
        "he": "זן",
        "ar": "زين",
        "ja": "禅",
        "zh": "禅",
        "ko": "선",
        "fr": "Zen",
        "de": "Zen",
        "ru": "Дзен",
        "it": "zen",
        "pt": "zen",
        "tr": "Zen",
        "id": "Zen",
        "ur": "زین",
        "fa": "ذن",
        "nl": "Juni",
        "pl": "Czerwiec",
        "uk": "червень",
        "vi": "tháng sáu",
        "af": "Junie",
        "am": "ሰኔ",
        "as": "জুন মাহত",
        "az": "iyun",
        "be": "Чэрвень",
        "bg": "юни",
        "bs": "juna",
        "ca": "juny",
        "ceb": "Hunyo",
        "cs": "června",
        "cy": "Mehefin",
        "da": "juni",
        "el": "Ιούνιος",
        "eo": "junio",
        "et": "juunini",
        "eu": "ekaina",
        "fi": "kesäkuuta",
        "fil": "Hunyo",
        "ga": "Meitheamh",
        "gd": "Ògmhios",
        "gl": "Xuño",
        "gu": "જૂન",
        "ha": "Yuni",
        "haw": "Iune",
        "hr": "lipnja",
        "hu": "június",
        "hy": "հունիս",
        "ig": "June",
        "is": "júní",
        "jv": "Juni",
        "ka": "ივნისი",
        "kk": "маусым",
        "km": "ខែមិថុនា",
        "kn": "ಜೂನ್",
        "ku": "June",
        "ky": "июнь",
        "la": "mensis Iunii",
        "lo": "ເດືອນມິຖຸນາ",
        "lt": "birželio mėn",
        "lv": "jūnijā",
        "mg": "Jona",
        "mi": "Hune",
        "mk": "јуни",
        "ml": "ജൂൺ",
        "mn": "Зургадугаар сар",
        "mr": "जून",
        "ms": "Jun",
        "mt": "Ġunju",
        "my": "ဇွန်လ",
        "ne": "जुन",
        "no": "juni",
        "ny": "June",
        "or": "ଜୁନ୍ |",
        "pa": "ਜੂਨ",
        "ps": "جون",
        "ro": "iunie",
        "rw": "Kamena",
        "sd": "جون",
        "si": "ජූනි",
        "sk": "júna",
        "sl": "junija",
        "sm": "Iuni",
        "sn": "June",
        "so": "Juun",
        "sq": "qershor",
        "sr": "јуна",
        "st": "Phuptjane",
        "su": "Juni",
        "sv": "juni",
        "sw": "Juni",
        "ta": "ஜூன்",
        "te": "జూన్",
        "tg": "июн",
        "th": "มิถุนายน",
        "tk": "Iýun",
        "ug": "ئىيۇن",
        "uz": "iyun",
        "xh": "Juni",
        "yi": "יוני",
        "yo": "Oṣu Kẹfa",
        "zu": "Juni"
    },
    "Jatakas & Legends": {
        "bn": "জাতক ও পৌরাণিক কাহিনী",
        "hi": "जातक और पौराणिक कथाएं",
        "es": "Jatakas y Leyendas",
        "he": "ג'טאקות ואגדות",
        "ar": "جاتاكاس والأساطير",
        "fr": "Jâtakas et Légendes",
        "de": "Jatakas und Legenden",
        "ja": "ジャータカと伝説",
        "zh": "本生经与传说",
        "ko": "자타카와 전설",
        "ru": "Джатаки и легенды",
        "it": "Jataka e leggende",
        "pt": "Jatakas e lendas",
        "tr": "Jatakalar ve Efsaneler",
        "id": "Jataka & Legenda",
        "ur": "جاتک اور لیجنڈز",
        "fa": "جاتاکاها و افسانه ها",
        "nl": "Jataka's en legendes",
        "pl": "Jataki i legendy",
        "uk": "Джатаки та легенди",
        "vi": "Jataka & Truyền thuyết",
        "af": "Jatakas en legendes",
        "am": "Jatakas & Legends",
        "as": "জাতক আৰু কিংবদন্তি",
        "az": "Jatakalar və Əfsanələr",
        "be": "Джатакі і легенды",
        "bg": "Джатаки и легенди",
        "bs": "Jatakas & Legends",
        "ca": "Jatakas i llegendes",
        "ceb": "Jatakas & Legends",
        "cs": "Jataky a legendy",
        "cy": "Jatakas a Chwedlau",
        "da": "Jatakas og legender",
        "el": "Jatakas & Legends",
        "eo": "Jatakas & Legendoj",
        "et": "Jatakas ja legendid",
        "eu": "Jatakas & Legends",
        "fi": "Jatakas & Legends",
        "fil": "Jatakas & Legends",
        "ga": "Jatakas & Finscéalta",
        "gd": "Jatakas & uirsgeulan",
        "gl": "Jatakas e Lendas",
        "gu": "જાતક અને દંતકથાઓ",
        "ha": "Jatakas & Legends",
        "haw": "Jatakas & Legends",
        "hr": "Jataka i legende",
        "hu": "Jatakas & Legends",
        "hy": "Jatakas & Legends",
        "ig": "Jatakas & Akụkọ mgbe ochie",
        "is": "Jatakas & Legends",
        "jv": "Jatakas & Legenda",
        "ka": "ჯატაკა და ლეგენდები",
        "kk": "Жатакалар және аңыздар",
        "km": "ចាតក និង រឿងព្រេង",
        "kn": "ಜಾತಕಗಳು ಮತ್ತು ದಂತಕಥೆಗಳು",
        "ku": "Jatakas & Legends",
        "ky": "Jatakas & Legends",
        "la": "Jatakas & Fabulae",
        "lo": "Jatakas & ນິທານ",
        "lt": "Jatakas ir legendos",
        "lv": "Jatakas un leģendas",
        "mg": "Jatakas & Legends",
        "mi": "Jatakas & Legends",
        "mk": "Јатака и легенди",
        "ml": "ജാതകങ്ങളും ഐതിഹ്യങ്ങളും",
        "mn": "Жатакас ба домог",
        "mr": "जातक आणि दंतकथा",
        "ms": "Jatakas & Legends",
        "mt": "Jatakas & Leġġendi",
        "my": "ဇာတ်တော်နှင့် ဒဏ္ဍာရီများ",
        "ne": "जातक र महापुरुष",
        "no": "Jatakas og legender",
        "ny": "Jatakas & Legends",
        "or": "ଜଟାକସ୍ ଏବଂ କିମ୍ବଦନ୍ତୀ |",
        "pa": "ਜਾਤਕ ਅਤੇ ਦੰਤਕਥਾਵਾਂ",
        "ps": "جاتکونه او افسانې",
        "ro": "Jatakas & Legends",
        "rw": "Jatakas & Umugani",
        "sd": "جتڪ ۽ افسانا",
        "si": "ජාතක සහ ජනප්‍රවාද",
        "sk": "Jataky a legendy",
        "sl": "Jataka in legende",
        "sm": "Jatakas & Talatuu",
        "sn": "Jatakas & Ngano",
        "so": "Jatakas & Halyeeyada",
        "sq": "Jatakas & Legjendat",
        "sr": "Јатакас & Легендс",
        "st": "Jatakas le Litšōmo",
        "su": "Jatakas & Legenda",
        "sv": "Jatakas och legender",
        "sw": "Jatakas & Legends",
        "ta": "ஜாதகங்கள் & புராணங்கள்",
        "te": "జాతకాలు & పురాణాలు",
        "tg": "Jatakas & Legends",
        "th": "ชาดกและตำนาน",
        "tk": "Jatakas we Rowaýatlar",
        "ug": "Jatakas & Legends",
        "uz": "Jatakalar va afsonalar",
        "xh": "IiJatakas & Iintsomi",
        "yi": "דזשאַטאַקאַס & לעגענדס",
        "yo": "Jatakas & Legends",
        "zu": "Ama-Jatakas & Izinganekwane"
    },
    "Ancient Greek": {
        "bn": "প্রাচীন গ্রিক দর্শন",
        "hi": "प्राचीन यूनानी दर्शन",
        "es": "Griego Antiguo",
        "he": "יוונית עתיקה",
        "ar": "اليونانية القديمة",
        "ja": "古代ギリシャ語",
        "zh": "古希腊语",
        "ko": "고대 그리스",
        "fr": "Grec ancien",
        "de": "Altgriechisch",
        "ru": "Древнегреческий",
        "it": "Greco antico",
        "pt": "Grego antigo",
        "tr": "Antik Yunan",
        "id": "Yunani Kuno",
        "ur": "قدیم یونانی۔",
        "fa": "یونان باستان",
        "nl": "Oud Grieks",
        "pl": "Starożytny grecki",
        "uk": "старогрецька",
        "vi": "Hy Lạp cổ đại",
        "af": "Antieke Grieks",
        "am": "የጥንት ግሪክ",
        "as": "প্ৰাচীন গ্ৰীক",
        "az": "Qədim yunan",
        "be": "старажытнагрэчаская",
        "bg": "старогръцки",
        "bs": "Starogrčki",
        "ca": "Grec antic",
        "ceb": "Karaang Grego",
        "cs": "starověká řečtina",
        "cy": "Groeg hynafol",
        "da": "oldgræsk",
        "el": "Αρχαία Ελληνικά",
        "eo": "Malnovgreka",
        "et": "Vana-Kreeka",
        "eu": "Antzinako greziera",
        "fi": "antiikin kreikkalainen",
        "fil": "Sinaunang Griyego",
        "ga": "Sean-Ghréigis",
        "gd": "Seann Ghreugais",
        "gl": "grego antigo",
        "gu": "પ્રાચીન ગ્રીક",
        "ha": "Tsohon Girkanci",
        "haw": "Helene kahiko",
        "hr": "starogrčki",
        "hu": "ókori görög",
        "hy": "Հին հունարեն",
        "ig": "Greek oge ochie",
        "is": "Forngrískur",
        "jv": "Yunani kuna",
        "ka": "ძველი ბერძნული",
        "kk": "Ежелгі грек",
        "km": "ក្រិកបុរាណ",
        "kn": "ಪ್ರಾಚೀನ ಗ್ರೀಕ್",
        "ku": "Yewnaniya kevnar",
        "ky": "Байыркы грек",
        "la": "Ancient Greek",
        "lo": "ກຣີກບູຮານ",
        "lt": "Senovės graikų",
        "lv": "Sengrieķu",
        "mg": "Grika fahiny",
        "mi": "Kariki tawhito",
        "mk": "старогрчки",
        "ml": "പുരാതന ഗ്രീക്ക്",
        "mn": "Эртний Грек",
        "mr": "प्राचीन ग्रीक",
        "ms": "Yunani Kuno",
        "mt": "Grieg antik",
        "my": "ရှေးဂရိ",
        "ne": "प्राचीन ग्रीक",
        "no": "eldgammel gresk",
        "ny": "Chigiriki chakale",
        "or": "ପ୍ରାଚୀନ ଗ୍ରୀକ୍",
        "pa": "ਪ੍ਰਾਚੀਨ ਯੂਨਾਨੀ",
        "ps": "لرغونی یونان",
        "ro": "Greaca veche",
        "rw": "Ikigereki cya kera",
        "sd": "قديم يوناني",
        "si": "පුරාණ ග්රීක",
        "sk": "Starogréčtina",
        "sl": "starogrški",
        "sm": "Eleni anamua",
        "sn": "ChiGiriki chekare",
        "so": "Giriigii hore",
        "sq": "greqishtja e lashtë",
        "sr": "старогрчки",
        "st": "Segerike sa boholo-holo",
        "su": "Yunani kuna",
        "sv": "Forntida grekiska",
        "sw": "Kigiriki cha Kale",
        "ta": "பண்டைய கிரேக்கம்",
        "te": "ప్రాచీన గ్రీకు",
        "tg": "Юнони қадим",
        "th": "กรีกโบราณ",
        "tk": "Gadymy grek",
        "ug": "قەدىمكى يۇنان",
        "uz": "Qadimgi yunon",
        "xh": "IsiGrike samandulo",
        "yi": "אלטע גריכיש",
        "yo": "Giriki atijọ",
        "zu": "IsiGreki sasendulo"
    },
    "Rationalism": {
        "bn": "যুক্তিবাদ",
        "hi": "तर्कवाद",
        "es": "Racionalismo",
        "he": "רציונליזם",
        "ar": "العقلانية",
        "ja": "合理主義",
        "zh": "理性主义",
        "ko": "이성론",
        "fr": "Rationalisme",
        "de": "Rationalismus",
        "ru": "Рационализм",
        "it": "Razionalismo",
        "pt": "Racionalismo",
        "tr": "Rasyonalizm",
        "id": "Rasionalisme",
        "ur": "عقلیت پسندی",
        "fa": "عقل گرایی",
        "nl": "Rationalisme",
        "pl": "Racjonalizm",
        "uk": "Раціоналізм",
        "vi": "Chủ nghĩa duy lý",
        "af": "Rasionalisme",
        "am": "ምክንያታዊነት",
        "as": "যুক্তিবাদ",
        "az": "Rasionalizm",
        "be": "Рацыяналізм",
        "bg": "Рационализъм",
        "bs": "Racionalizam",
        "ca": "Racionalisme",
        "ceb": "Rasyonalismo",
        "cs": "Racionalismus",
        "cy": "Rhesymeg",
        "da": "Rationalisme",
        "el": "Ο ορθολογισμός",
        "eo": "Raciismo",
        "et": "Ratsionalism",
        "eu": "Arrazionalismoa",
        "fi": "Rationalismi",
        "fil": "Rasyonalismo",
        "ga": "Réasúnachas",
        "gd": "Feallsanachd",
        "gl": "Racionalismo",
        "gu": "બુદ્ધિવાદ",
        "ha": "Rationalism",
        "haw": "Ka manaʻo hoʻopono",
        "hr": "Racionalizam",
        "hu": "Racionalizmus",
        "hy": "Ռացիոնալիզմ",
        "ig": "Rationalism",
        "is": "Rökhyggja",
        "jv": "Rasionalisme",
        "ka": "რაციონალიზმი",
        "kk": "Рационализм",
        "km": "សនិទាននិយម",
        "kn": "ವೈಚಾರಿಕತೆ",
        "ku": "Rationalism",
        "ky": "Рационализм",
        "la": "Rationalismus",
        "lo": "ເຫດຜົນ",
        "lt": "Racionalizmas",
        "lv": "Racionālisms",
        "mg": "Rationalisme",
        "mi": "Te whakaaro whakaaro",
        "mk": "Рационализам",
        "ml": "യുക്തിവാദം",
        "mn": "Рационализм",
        "mr": "बुद्धिवाद",
        "ms": "Rasionalisme",
        "mt": "Razzjonaliżmu",
        "my": "ဆင်ခြင်တုံတရား",
        "ne": "तर्कवाद",
        "no": "Rasjonalisme",
        "ny": "Zolingalira",
        "or": "ଯୁକ୍ତିଯୁକ୍ତତା |",
        "pa": "ਤਰਕਸ਼ੀਲਤਾ",
        "ps": "استقلالیت",
        "ro": "Raționalism",
        "rw": "Gushyira mu gaciro",
        "sd": "عقليت پسندي",
        "si": "තාර්කිකවාදය",
        "sk": "Racionalizmus",
        "sl": "Racionalizem",
        "sm": "Fa'aituau",
        "sn": "Rationalism",
        "so": "Caqli-galnimada",
        "sq": "Racionalizmi",
        "sr": "Рационализам",
        "st": "Rationalism",
        "su": "Rasionalisme",
        "sv": "Rationalism",
        "sw": "Rationalism",
        "ta": "பகுத்தறிவுவாதம்",
        "te": "హేతువాదం",
        "tg": "Рационализм",
        "th": "เหตุผลนิยม",
        "tk": "Rasionalizm",
        "ug": "Rationalism",
        "uz": "Ratsionalizm",
        "xh": "Ukuba nengqiqo",
        "yi": "ראציאנאליזם",
        "yo": "Rationalism",
        "zu": "Ukucabangela"
    },
    "Empiricism": {
        "bn": "অভিজ্ঞতাবাদ",
        "hi": "अनुभववाद",
        "es": "Empirismo",
        "he": "אמפיריציזם",
        "ar": "التجريبية",
        "ja": "経験主義",
        "zh": "经验主义",
        "ko": "경험주의",
        "fr": "Empirisme",
        "de": "Empirismus",
        "ru": "Эмпиризм",
        "it": "Empirismo",
        "pt": "Empirismo",
        "tr": "deneycilik",
        "id": "Empirisme",
        "ur": "تجربہ پسندی",
        "fa": "تجربه گرایی",
        "nl": "Empirisme",
        "pl": "Empiryzm",
        "uk": "Емпіризм",
        "vi": "Chủ nghĩa kinh nghiệm",
        "af": "Empirisme",
        "am": "ኢምፔሪዝም",
        "as": "অভিজ্ঞতাবাদ",
        "az": "Empirizm",
        "be": "Эмпірызм",
        "bg": "Емпиризъм",
        "bs": "Empirizam",
        "ca": "Empirisme",
        "ceb": "Empirismo",
        "cs": "Empirismus",
        "cy": "Empiriaeth",
        "da": "Empiri",
        "el": "Εμπειρισμός",
        "eo": "Empiriismo",
        "et": "Empirism",
        "eu": "Enpirismoa",
        "fi": "Empirismi",
        "fil": "Empirismo",
        "ga": "eimpíreach",
        "gd": "Empireachd",
        "gl": "Empirismo",
        "gu": "અનુભવવાદ",
        "ha": "Empiricism",
        "haw": "ʻO ka manaʻo hoʻokalakupua",
        "hr": "Empirizam",
        "hu": "Empirizmus",
        "hy": "Էմպիրիզմ",
        "ig": "Empiricism",
        "is": "Empiricism",
        "jv": "Empirisme",
        "ka": "ემპირიზმი",
        "kk": "Эмпиризм",
        "km": "លទ្ធិនិយម",
        "kn": "ಅನುಭವವಾದ",
        "ku": "Empirîzm",
        "ky": "Эмпиризм",
        "la": "Empiricismus",
        "lo": "ນິຍົມ",
        "lt": "Empirizmas",
        "lv": "Empīrisms",
        "mg": "Empirisme",
        "mi": "Empiricism",
        "mk": "Емпиризам",
        "ml": "അനുഭവവാദം",
        "mn": "Эмпиризм",
        "mr": "अनुभववाद",
        "ms": "Empirisme",
        "mt": "Empiriżmu",
        "my": "Empiricism",
        "ne": "अनुभववाद",
        "no": "Empiri",
        "ny": "Empiricism",
        "or": "ପରୀକ୍ଷାମୂଳକତା |",
        "pa": "ਅਨੁਭਵਵਾਦ",
        "ps": "تجربه",
        "ro": "Empirism",
        "rw": "Kwishyira ukizana",
        "sd": "تجربيڪاري",
        "si": "අනුභූතිවාදය",
        "sk": "Empirizmus",
        "sl": "Empirizem",
        "sm": "Empiricism",
        "sn": "Empiricism",
        "so": "Empiricism",
        "sq": "Empirizmi",
        "sr": "Емпиризам",
        "st": "Empiricism",
        "su": "Émpirisme",
        "sv": "Empiri",
        "sw": "Empiricism",
        "ta": "அனுபவவாதம்",
        "te": "అనుభవవాదం",
        "tg": "Эмпиризм",
        "th": "ประจักษ์นิยม",
        "tk": "Empirizm",
        "ug": "Empiricism",
        "uz": "Empirizm",
        "xh": "Empiricism",
        "yi": "עמפּיריזם",
        "yo": "Empiricism",
        "zu": "I-Empiricism"
    },
    "Enlightenment": {
        "bn": "আলোকায়ন",
        "hi": "प्रबोधन",
        "es": "Ilustración",
        "he": "הֶאָרָה",
        "ar": "التنوير",
        "ja": "啓発",
        "zh": "启示",
        "ko": "계발",
        "fr": "Éclaircissement",
        "de": "Aufklärung",
        "ru": "Просвещение",
        "it": "Illuminismo",
        "pt": "Iluminação",
        "tr": "Aydınlanma",
        "id": "Pencerahan",
        "ur": "روشن خیالی",
        "fa": "روشنگری",
        "nl": "Verlichting",
        "pl": "Oświecenie",
        "uk": "Просвітництво",
        "vi": "Khai sáng",
        "af": "Verligting",
        "am": "መገለጽ",
        "as": "জ্ঞানলাভ",
        "az": "Maarifləndirmə",
        "be": "Асветніцтва",
        "bg": "Просветление",
        "bs": "Prosvetljenje",
        "ca": "Il·lustració",
        "ceb": "Kalamdagan",
        "cs": "Osvícení",
        "cy": "Goleuedigaeth",
        "da": "Oplysning",
        "el": "Διαφωτισμός",
        "eo": "Klerismo",
        "et": "Valgustus",
        "eu": "Ilustrazioa",
        "fi": "Valaistuminen",
        "fil": "Enlightenment",
        "ga": "Enlightenment",
        "gd": "Soillseachadh",
        "gl": "Ilustración",
        "gu": "બોધ",
        "ha": "Fadakarwa",
        "haw": "Ka malamalama",
        "hr": "Prosvjetiteljstvo",
        "hu": "Megvilágosodás",
        "hy": "լուսավորություն",
        "ig": "Nkụzi",
        "is": "Uppljómun",
        "jv": "pencerahan",
        "ka": "განმანათლებლობა",
        "kk": "Ағарту",
        "km": "ការត្រាស់ដឹង",
        "kn": "ಜ್ಞಾನೋದಯ",
        "ku": "Ronakbîrî",
        "ky": "агартуу",
        "la": "Illuminatio",
        "lo": "ຄວາມສະຫວ່າງ",
        "lt": "Nušvitimas",
        "lv": "Apgaismība",
        "mg": "Fahazavana",
        "mi": "Maramatanga",
        "mk": "просветлување",
        "ml": "ജ്ഞാനോദയം",
        "mn": "Гэгээрэл",
        "mr": "आत्मज्ञान",
        "ms": "Pencerahan",
        "mt": "Kjarifika",
        "my": "ဉာဏ်အလင်း",
        "ne": "प्रबुद्धता",
        "no": "Opplysning",
        "ny": "Chidziwitso",
        "or": "ଜ୍ଞାନବୋଧ",
        "pa": "ਗਿਆਨ",
        "ps": "افلاطون",
        "ro": "Iluminarea",
        "rw": "Kumurikirwa",
        "sd": "روشن خيالي",
        "si": "බුද්ධත්වය",
        "sk": "osvietenie",
        "sl": "Razsvetljenje",
        "sm": "Malamalama",
        "sn": "Enlightenment",
        "so": "Iftiimin",
        "sq": "iluminizmi",
        "sr": "Просветљење",
        "st": "Tsebisoa",
        "su": "Pencerahan",
        "sv": "Upplysning",
        "sw": "Kuelimika",
        "ta": "அறிவொளி",
        "te": "జ్ఞానోదయం",
        "tg": "Маърифат",
        "th": "การตรัสรู้",
        "tk": "Aňlatma",
        "ug": "مەرىپەت",
        "uz": "Ma'rifat",
        "xh": "Ukhanyiselo",
        "yi": "השכלה",
        "yo": "Imọlẹ",
        "zu": "Ukukhanyiselwa"
    },
    "Analytic": {
        "bn": "বিশ্লেষণমূলক দর্শন",
        "hi": "विश्लेषणात्मक",
        "es": "Analítica",
        "he": "אֲנַאלִיטִי",
        "ar": "تحليلية",
        "ja": "分析的",
        "zh": "分析型",
        "ko": "분석적",
        "fr": "Analytique",
        "de": "Analytisch",
        "ru": "Аналитический",
        "it": "Analitico",
        "pt": "Analítico",
        "tr": "Analitik",
        "id": "Analitik",
        "ur": "تجزیاتی",
        "fa": "تحلیلی",
        "nl": "Analytisch",
        "pl": "Analityczny",
        "uk": "Аналітичний",
        "vi": "phân tích",
        "af": "Analities",
        "am": "ትንታኔ",
        "as": "বিশ্লেষণাত্মক",
        "az": "Analitik",
        "be": "Аналітычны",
        "bg": "Аналитичен",
        "bs": "Analytic",
        "ca": "Analític",
        "ceb": "Analitiko",
        "cs": "Analytické",
        "cy": "Dadansoddol",
        "da": "Analytisk",
        "el": "Αναλυτική",
        "eo": "Analiza",
        "et": "Analüütiline",
        "eu": "Analitikoa",
        "fi": "Analyyttinen",
        "fil": "Analitiko",
        "ga": "Anailíseach",
        "gd": "Anailitigeach",
        "gl": "Analítica",
        "gu": "વિશ્લેષણાત્મક",
        "ha": "Analytic",
        "haw": "ʻIkepili",
        "hr": "analitički",
        "hu": "Analitikus",
        "hy": "Վերլուծական",
        "ig": "Nyocha",
        "is": "Greinandi",
        "jv": "Analitik",
        "ka": "ანალიტიკური",
        "kk": "Аналитикалық",
        "km": "វិភាគ",
        "kn": "ವಿಶ್ಲೇಷಣಾತ್ಮಕ",
        "ku": "Analîtîk",
        "ky": "Аналитикалык",
        "la": "Analytic",
        "lo": "ການວິເຄາະ",
        "lt": "Analitinė",
        "lv": "Analītisks",
        "mg": "Mandalina",
        "mi": "Tātari",
        "mk": "Аналитички",
        "ml": "അനലിറ്റിക്",
        "mn": "Аналитик",
        "mr": "विश्लेषणात्मक",
        "ms": "Analitik",
        "mt": "Analitiku",
        "my": "သရုပ်ခွဲသည်။",
        "ne": "विश्लेषणात्मक",
        "no": "Analytisk",
        "ny": "Analytics",
        "or": "ଆନାଲିଟିକ୍ |",
        "pa": "ਵਿਸ਼ਲੇਸ਼ਣਾਤਮਕ",
        "ps": "تحلیلي",
        "ro": "Analitic",
        "rw": "Isesengura",
        "sd": "تجزياتي",
        "si": "විශ්ලේෂණාත්මක",
        "sk": "Analytický",
        "sl": "Analitično",
        "sm": "Iloiloga",
        "sn": "Analytic",
        "so": "Analytic",
        "sq": "Analitike",
        "sr": "Аналитиц",
        "st": "Tlhahlobo",
        "su": "Analitik",
        "sv": "Analytisk",
        "sw": "Uchambuzi",
        "ta": "பகுப்பாய்வு",
        "te": "విశ్లేషణాత్మక",
        "tg": "Таҳлилӣ",
        "th": "วิเคราะห์",
        "tk": "Analitik",
        "ug": "Analytic",
        "uz": "Analitik",
        "xh": "Uhlalutyo",
        "yi": "אַנאַליטיש",
        "yo": "Atupalẹ",
        "zu": "Ukuhlaziya"
    },
    "Pragmatism": {
        "bn": "প্রয়োগবাদ",
        "hi": "व्यावहारिकतावाद",
        "es": "Pragmatismo",
        "he": "פרגמטיזם",
        "ar": "البراغماتية",
        "ja": "プラグマティズム",
        "zh": "实用主义",
        "ko": "참견",
        "fr": "Pragmatisme",
        "de": "Pragmatismus",
        "ru": "Прагматизм",
        "it": "Pragmatismo",
        "pt": "Pragmatismo",
        "tr": "Pragmatizm",
        "id": "Pragmatisme",
        "ur": "عملیت پسندی",
        "fa": "پراگماتیسم",
        "nl": "Pragmatisme",
        "pl": "Pragmatyzm",
        "uk": "Прагматизм",
        "vi": "chủ nghĩa thực dụng",
        "af": "Pragmatisme",
        "am": "ፕራግማቲዝም",
        "as": "প্ৰাগমেটিজম",
        "az": "Praqmatizm",
        "be": "Прагматызм",
        "bg": "Прагматизъм",
        "bs": "Pragmatizam",
        "ca": "Pragmatisme",
        "ceb": "Pragmatismo",
        "cs": "Pragmatismus",
        "cy": "Pragmatiaeth",
        "da": "Pragmatisme",
        "el": "Πραγματισμός",
        "eo": "Pragmatismo",
        "et": "Pragmatism",
        "eu": "Pragmatismoa",
        "fi": "Pragmatismi",
        "fil": "Pragmatismo",
        "ga": "Pragmatachas",
        "gd": "Pragmatachd",
        "gl": "Pragmatismo",
        "gu": "વ્યવહારવાદ",
        "ha": "Pragmatism",
        "haw": "ʻO ka Pragmatism",
        "hr": "Pragmatizam",
        "hu": "Pragmatizmus",
        "hy": "Պրագմատիզմ",
        "ig": "Pragmatism",
        "is": "Raunsæi",
        "jv": "Pragmatisme",
        "ka": "პრაგმატიზმი",
        "kk": "Прагматизм",
        "km": "ព្រហ្មញ្ញសាសនា",
        "kn": "ವ್ಯಾವಹಾರಿಕವಾದ",
        "ku": "Pragmatîzm",
        "ky": "Прагматизм",
        "la": "Pragmatismum",
        "lo": "Pragmatism",
        "lt": "Pragmatizmas",
        "lv": "Pragmatisms",
        "mg": "pragmatisma",
        "mi": "Pragmatism",
        "mk": "Прагматизам",
        "ml": "പ്രായോഗികത",
        "mn": "Прагматизм",
        "mr": "व्यावहारिकता",
        "ms": "Pragmatisme",
        "mt": "Pragmatiżmu",
        "my": "လက်တွေ့ကျကျ",
        "ne": "व्यावहारिकता",
        "no": "Pragmatisme",
        "ny": "Pragmatism",
        "or": "ପ୍ରଗତିବାଦ |",
        "pa": "ਵਿਵਹਾਰਕਤਾ",
        "ps": "پراګماتزم",
        "ro": "Pragmatism",
        "rw": "Pragmatism",
        "sd": "پرچارڪ",
        "si": "ප්රායෝගිකවාදය",
        "sk": "Pragmatizmus",
        "sl": "Pragmatizem",
        "sm": "Pragmatism",
        "sn": "Pragmatism",
        "so": "Pragmatism",
        "sq": "Pragmatizmi",
        "sr": "Прагматизам",
        "st": "Pragmatism",
        "su": "Pragmatisme",
        "sv": "Pragmatism",
        "sw": "Pragmatism",
        "ta": "நடைமுறைவாதம்",
        "te": "వ్యావహారికసత్తావాదం",
        "tg": "Прагматизм",
        "th": "ลัทธิปฏิบัตินิยม",
        "tk": "Pragmatizm",
        "ug": "Pragmatism",
        "uz": "Pragmatizm",
        "xh": "Pragmatism",
        "yi": "פּראַגמאַטיזאַם",
        "yo": "Pragmatism",
        "zu": "I-Pragmatism"
    },
    "Letters from a Stoic": {
        "bn": "এক স্টোয়িকের পত্রাবলী",
        "hi": "एक स्टोइक के पत्र",
        "es": "Cartas de un Estoico",
        "he": "מכתבים מאת סטואי",
        "ar": "رسائل من الرواقي",
        "ja": "ストイックからの手紙",
        "zh": "斯多葛派的来信",
        "ko": "금욕주의자의 편지",
        "fr": "Lettres d'un stoïcien",
        "de": "Briefe eines Stoikers",
        "ru": "Письма стоика",
        "it": "Lettere di uno stoico",
        "pt": "Cartas de um estóico",
        "tr": "Bir Stoacıdan Mektuplar",
        "id": "Surat dari seorang Stoa",
        "ur": "ایک Stoic سے خطوط",
        "fa": "نامه هایی از یک رواقیون"
    },
    "Enchiridion": {
        "bn": "এনকিরিডিয়ন",
        "hi": "एनचिरिडियन",
        "es": "Manual de Vida",
        "he": "מַדרִיך",
        "ar": "كتيب",
        "ja": "ハンドブック",
        "zh": "手册",
        "ko": "안내서",
        "fr": "Manuel",
        "de": "Handbuch",
        "ru": "Справочник",
        "it": "Manuale",
        "pt": "Manual",
        "tr": "El Kitabı",
        "id": "Buku Pegangan",
        "ur": "ہینڈ بک",
        "fa": "کتاب راهنما"
    },
    "Discourses": {
        "bn": "প্রবচন",
        "hi": "प्रवचन",
        "es": "Discursos",
        "he": "שיחות",
        "ar": "الخطابات",
        "ja": "談話",
        "zh": "话语",
        "ko": "담론",
        "fr": "Discours",
        "de": "Diskurse",
        "ru": "Дискурсы",
        "it": "Discorsi",
        "pt": "Discursos",
        "tr": "Söylemler",
        "id": "wacana",
        "ur": "مکالمے",
        "fa": "گفتمان ها"
    },
    "Republic": {
        "bn": "প্রজাতন্ত্র (রিপাবলিক)",
        "hi": "गणतंत्र",
        "es": "La República",
        "he": "רֶפּוּבּלִיקָה",
        "ar": "جمهورية",
        "ja": "共和国",
        "zh": "共和国",
        "ko": "공화국",
        "fr": "République",
        "de": "Republik",
        "ru": "Республика",
        "it": "Repubblica",
        "pt": "República",
        "tr": "Cumhuriyet",
        "id": "Republik",
        "ur": "جمہوریہ",
        "fa": "جمهوری"
    },
    "Nicomachean Ethics": {
        "bn": "নিকোমেকিয়ান নীতিবিদ্যা",
        "hi": "नीतिशास्त्र",
        "es": "Ética a Nicómaco",
        "he": "אתיקה ניקומכאית",
        "ar": "الأخلاق النيقوماخية",
        "ja": "ニコマコス倫理",
        "zh": "尼各马可伦理学",
        "ko": "니코마코스 윤리",
        "fr": "L'éthique à Nicomaque",
        "de": "Nikomachische Ethik",
        "ru": "Никомахова этика",
        "it": "Etica Nicomachea",
        "pt": "Ética a Nicômaco",
        "tr": "Nikomakhos Etiği",
        "id": "Etika Nikomakea",
        "ur": "نیکوماشین اخلاقیات",
        "fa": "اخلاق نیکوماخوس"
    },
    "Beyond Good and Evil": {
        "bn": "ভালো ও মন্দের ওপারে",
        "hi": "अच्छाई और बुराई से परे",
        "es": "Más allá del bien y del mal",
        "he": "מעבר לטוב ולרע",
        "ar": "أبعد من الخير والشر",
        "ja": "善と悪を超えて",
        "zh": "超越善恶",
        "ko": "선과 악을 넘어",
        "fr": "Au-delà du Bien et du Mal",
        "de": "Jenseits von Gut und Böse",
        "ru": "За пределами добра и зла",
        "it": "Al di là del bene e del male",
        "pt": "Além do Bem e do Mal",
        "tr": "İyinin ve Kötünün Ötesinde",
        "id": "Melampaui Kebaikan dan Kejahatan",
        "ur": "نیکی اور بدی سے آگے",
        "fa": "فراتر از خیر و شر"
    },
    "Gurbani": {
        "bn": "গুরবাণী",
        "hi": "गुरबाणी",
        "pa": "ਗੁਰਬਾਣੀ",
        "he": "גורבני",
        "ar": "قرباني",
        "ja": "グルバーニ",
        "zh": "古尔巴尼",
        "ko": "구르바니",
        "es": "Gurbaní",
        "fr": "Gurbani",
        "de": "Gurbani",
        "ru": "Гурбани",
        "it": "Gurbani",
        "pt": "Gurbani",
        "tr": "Gurbani",
        "id": "Gurbani",
        "ur": "گربانی۔",
        "fa": "قربانی"
    },
    "Japji Sahib": {
        "bn": "জপজী সাহিব",
        "hi": "जपजी साहिब",
        "pa": "ਜਪੁਜੀ ਸਾਹਿਬ",
        "he": "Japji Sahib",
        "ar": "جابجي صاحب",
        "ja": "ジャプジ・サーヒブ",
        "zh": "贾普吉·萨希卜",
        "ko": "잡지 사히브",
        "es": "Japji Sahib",
        "fr": "Japji Sahib",
        "de": "Japji Sahib",
        "ru": "Джапджи Сахиб",
        "it": "Japji Sahib",
        "pt": "Japji sahib",
        "tr": "Japji Sahib",
        "id": "Japji Sahib",
        "ur": "جپجی صاحب",
        "fa": "جاپجی صاحب"
    },
    "Mishnah": {
        "bn": "মিশনাহ",
        "hi": "मिशनाह",
        "es": "Mishná",
        "he": "משנה",
        "ar": "مشناه",
        "ja": "ミシュナ",
        "zh": "米西那",
        "ko": "미슈나",
        "fr": "Mishna",
        "de": "Mischna",
        "ru": "Мишна",
        "it": "Mishnah",
        "pt": "Mishná",
        "tr": "Mişna",
        "id": "Misnah",
        "ur": "مسنہ",
        "fa": "میشنا"
    },
    "Midrash": {
        "bn": "মিদ্রাশ",
        "hi": "मिद्रश",
        "es": "Midrash",
        "he": "מדרש",
        "ar": "مدراش",
        "ja": "ミドラーシュ",
        "zh": "米德拉什",
        "ko": "미드라쉬",
        "fr": "Midrash",
        "de": "Midrasch",
        "ru": "Мидраш",
        "it": "Midrash",
        "pt": "Midrash",
        "tr": "Midraş",
        "id": "Midrash",
        "ur": "مڈراش",
        "fa": "میدراش"
    },
    "Halakhah": {
        "bn": "হালাখা",
        "hi": "हालाखा",
        "es": "Halajá",
        "he": "הלכה",
        "ar": "هالاخاه",
        "ja": "ハラカー",
        "zh": "哈拉卡",
        "ko": "할라카",
        "fr": "Halakhah",
        "de": "Halacha",
        "ru": "Галаха",
        "it": "Halakhah",
        "pt": "Halakhá",
        "tr": "Halakhah",
        "id": "Halakha",
        "ur": "حلخہ",
        "fa": "هالاخواه"
    },
    "Kabbalah": {
        "bn": "কাব্বালাহ",
        "hi": "कब्बालाह",
        "es": "Cábala",
        "he": "קַבָּלָה",
        "ar": "الكابالا",
        "ja": "カバラ",
        "zh": "卡巴拉",
        "ko": "밀교",
        "fr": "Cabale",
        "de": "Kabbala",
        "ru": "Каббала",
        "it": "Cabala",
        "pt": "Cabala",
        "tr": "Kabala",
        "id": "Kabbalah",
        "ur": "قبالہ",
        "fa": "کابالا"
    },
    "Jewish Thought": {
        "bn": "ইহুদি দর্শন",
        "hi": "यहूदी विचार",
        "es": "Pensamiento Judío",
        "he": "מחשבה יהודית",
        "ar": "الفكر اليهودي",
        "ja": "ユダヤ人の思想",
        "zh": "犹太思想",
        "ko": "유대인 사상",
        "fr": "Pensée juive",
        "de": "Jüdisches Denken",
        "ru": "Еврейская мысль",
        "it": "Pensiero ebraico",
        "pt": "Pensamento Judaico",
        "tr": "Yahudi Düşüncesi",
        "id": "Pemikiran Yahudi",
        "ur": "یہودی سوچ",
        "fa": "اندیشه یهودی"
    },
    "Gita": {
        "bn": "গীতা",
        "hi": "गीता",
        "es": "Gita",
        "he": "גיטה",
        "ar": "جيتا",
        "ja": "ギータ",
        "zh": "吉塔",
        "ko": "기타",
        "fr": "Gita",
        "de": "Gita",
        "ru": "Гита",
        "it": "Gita",
        "pt": "Gita",
        "tr": "Gita",
        "id": "Gita",
        "ur": "گیتا",
        "fa": "گیتا"
    },
    "Rigveda": {
        "bn": "ঋগ্বেদ",
        "hi": "ऋग्वेद",
        "es": "Rigveda",
        "he": "ריגוודה",
        "ar": "ريجفيدا",
        "ja": "リグヴェーダ",
        "zh": "梨俱吠陀",
        "ko": "리그베다",
        "fr": "Rigvéda",
        "de": "Rigveda",
        "ru": "Ригведа",
        "it": "Rigveda",
        "pt": "Rig Veda",
        "tr": "Rigveda",
        "id": "Regveda",
        "ur": "رگ وید",
        "fa": "ریگودا",
        "nl": "Rigveda",
        "pl": "Rygweda",
        "uk": "Рігведа",
        "vi": "Rigveda",
        "af": "Rigveda",
        "am": "ሪግቬዳ",
        "as": "ঋগবেদ",
        "az": "Riqveda",
        "be": "Рыгведа",
        "bg": "Ригведа",
        "bs": "Rigveda",
        "ca": "Rigveda",
        "ceb": "Rigveda",
        "cs": "Rigveda",
        "cy": "Rigveda",
        "da": "Rigveda",
        "el": "Ριγκβέδα",
        "eo": "Rigvedo",
        "et": "Rigveda",
        "eu": "Rigveda",
        "fi": "Rigveda",
        "fil": "Rigveda",
        "ga": "Rigveda",
        "gd": "Rigveda",
        "gl": "Rigveda",
        "gu": "ઋગ્વેદ",
        "ha": "Rigveda",
        "haw": "Rigveda",
        "hr": "Rigveda",
        "hu": "Rigveda",
        "hy": "Ռիգվեդա",
        "ig": "Rigveda",
        "is": "Rigveda",
        "jv": "Rigveda",
        "ka": "რიგვედა",
        "kk": "Ригведа",
        "km": "រីហ្គីដា",
        "kn": "ಋಗ್ವೇದ",
        "ku": "Rigveda",
        "ky": "Ригведа",
        "la": "Rigveda",
        "lo": "ຣິກເວດາ",
        "lt": "Rigveda",
        "lv": "Rigvēda",
        "mg": "Rigveda",
        "mi": "Rigveda",
        "mk": "Ригведа",
        "ml": "ഋഗ്വേദം",
        "mn": "Ригведа",
        "mr": "ऋग्वेद",
        "ms": "Rigveda",
        "mt": "Rigveda",
        "my": "ရက္ခဝေဒ",
        "ne": "ऋग्वेद",
        "no": "Rigveda",
        "ny": "Rigveda",
        "or": "Ig ଗ୍ବେଦା",
        "pa": "ਰਿਗਵੇਦ",
        "ps": "رګویدا",
        "ro": "Rigveda",
        "rw": "Rigveda",
        "sd": "رگ ويد",
        "si": "ඍග්වේදය",
        "sk": "Rigveda",
        "sl": "Rigveda",
        "sm": "Rigveda",
        "sn": "Rigveda",
        "so": "Rigveda",
        "sq": "Rigveda",
        "sr": "Ригведа",
        "st": "Rigveda",
        "su": "Rigveda",
        "sv": "Rigveda",
        "sw": "Rigveda",
        "ta": "ரிக்வேதம்",
        "te": "ఋగ్వేదం",
        "tg": "Ригведа",
        "th": "ฤคเวท",
        "tk": "Rigveda",
        "ug": "Rigveda",
        "uz": "Rigveda",
        "xh": "Rigveda",
        "yi": "ריגוועדאַ",
        "yo": "Rigveda",
        "zu": "I-Rigveda"
    },
    "AtharvaVeda": {
        "bn": "অথর্ববেদ",
        "hi": "अथर्ववेद",
        "es": "Atharvaveda",
        "he": "אתרבה וודה",
        "ar": "اثارفا فيدا",
        "ja": "アタルヴァ ヴェーダ",
        "zh": "阿闼婆吠陀",
        "ko": "아타르바 베다",
        "fr": "Atharva Véda",
        "de": "Atharva Veda",
        "ru": "Атхарва Веда",
        "it": "Atharva Veda",
        "pt": "Atharva Veda",
        "tr": "Atharva Veda",
        "id": "Atharwa Weda",
        "ur": "اتھرو وید",
        "fa": "آثاروا ودا",
        "nl": "AtharvaVeda",
        "pl": "Atharwaweda",
        "uk": "АтхарваВеда",
        "vi": "AtharvaVeda",
        "af": "AtharvaVeda",
        "am": "አትርቫቬዳ",
        "as": "অথৰ্ববেদ",
        "az": "AtharvaVeda",
        "be": "АтхарваВеда",
        "bg": "Атхарваведа",
        "bs": "AtharvaVeda",
        "ca": "AtharvaVeda",
        "ceb": "AtharvaVeda",
        "cs": "AtharvaVeda",
        "cy": "AthrvaVeda",
        "da": "AtharvaVeda",
        "el": "AtharvaVeda",
        "eo": "AtharvaVeda",
        "et": "AtharvaVeda",
        "eu": "AtharvaVeda",
        "fi": "AtharvaVeda",
        "fil": "AtharvaVeda",
        "ga": "AtharvaVeda",
        "gd": "AthrabhaVeda",
        "gl": "AtharvaVeda",
        "gu": "અથર્વવેદ",
        "ha": "AtharvaVeda",
        "haw": "AtharvaVeda",
        "hr": "AtharvaVeda",
        "hu": "AtharvaVeda",
        "hy": "AtharvaVeda",
        "ig": "AtharvaVeda",
        "is": "AtharvaVeda",
        "jv": "AtharvaVeda",
        "ka": "ათარვავედა",
        "kk": "АтхарваВеда",
        "km": "អាថាវវេដា",
        "kn": "ಅಥರ್ವವೇದ",
        "ku": "AtharvaVeda",
        "ky": "AtharvaVeda",
        "la": "AtharvaVeda",
        "lo": "AtharvaVeda",
        "lt": "AtharvaVeda",
        "lv": "AtharvaVeda",
        "mg": "AtharvaVeda",
        "mi": "AtharvaVeda",
        "mk": "АтарваВеда",
        "ml": "അഥർവവേദം",
        "mn": "АтхарваВеда",
        "mr": "अथर्ववेद",
        "ms": "AtharvaVeda",
        "mt": "AtharvaVeda",
        "my": "AtharvaVeda",
        "ne": "अथर्ववेद",
        "no": "AtharvaVeda",
        "ny": "AtharvaVeda",
        "or": "AtharvaVeda",
        "pa": "ਅਥਰਵਵੇਦ",
        "ps": "اتھاروا ویدا",
        "ro": "AtharvaVeda",
        "rw": "AtharvaVeda",
        "sd": "اٿاروا ويد",
        "si": "අථර්වවේදය",
        "sk": "AtharvaVeda",
        "sl": "AtharvaVeda",
        "sm": "AtharvaVeda",
        "sn": "AtharvaVeda",
        "so": "AtharvaVeda",
        "sq": "AtharvaVeda",
        "sr": "АтхарваВеда",
        "st": "AtharvaVeda",
        "su": "AtharvaVeda",
        "sv": "AtharvaVeda",
        "sw": "AtharvaVeda",
        "ta": "அதர்வவேதம்",
        "te": "అథర్వవేదం",
        "tg": "АтхарваВеда",
        "th": "อาถรวาเวท",
        "tk": "AtharvaWeda",
        "ug": "AtharvaVeda",
        "uz": "AtharvaVeda",
        "xh": "I-AtharvaVeda",
        "yi": "AtharvaVeda",
        "yo": "AtharvaVeda",
        "zu": "I-AtharvaVeda"
    },
    "Yajurveda": {
        "bn": "যজুর্বেদ",
        "hi": "यजुर्वेद",
        "es": "Yajurveda",
        "he": "יאגורוודה",
        "ar": "ياجورفيدا",
        "ja": "ヤジュルヴェーダ",
        "zh": "夜柔吠陀",
        "ko": "야주르베다",
        "fr": "Yajurvéda",
        "de": "Yajurveda",
        "ru": "Яджурведа",
        "it": "Yajurveda",
        "pt": "Yajurvéda",
        "tr": "Yajurveda",
        "id": "Yajurveda",
        "ur": "یجروید",
        "fa": "یاجورودا",
        "nl": "Yajurveda",
        "pl": "Jadźurweda",
        "uk": "Яджурведа",
        "vi": "Yajurveda",
        "af": "Yajurveda",
        "am": "ያጁርቬዳ",
        "as": "যজুৰ্বেদ",
        "az": "Yajurveda",
        "be": "Яджурведа",
        "bg": "Яджурведа",
        "bs": "Yajurveda",
        "ca": "Yajurveda",
        "ceb": "Yajurveda",
        "cs": "Yajurveda",
        "cy": "Yajurveda",
        "da": "Yajurveda",
        "el": "Γιατζουρβέδα",
        "eo": "Yajurveda",
        "et": "Yajurveda",
        "eu": "Yajurveda",
        "fi": "Yajurveda",
        "fil": "Yajurveda",
        "ga": "Yajurveda",
        "gd": "Iajurveda",
        "gl": "Yajurveda",
        "gu": "યજુર્વેદ",
        "ha": "Yajurveda",
        "haw": "ʻO Yajurveda",
        "hr": "Yajurveda",
        "hu": "Yajurveda",
        "hy": "Յաջուրվեդա",
        "ig": "Yajurveda",
        "is": "Yajurveda",
        "jv": "Yajurveda",
        "ka": "იაჯურვედა",
        "kk": "Яжурведа",
        "km": "យ៉ាហ្រវេដា",
        "kn": "ಯಜುರ್ವೇದ",
        "ku": "Yajurveda",
        "ky": "Yajurveda",
        "la": "Yajurveda",
        "lo": "ຢາຈູເວດາ",
        "lt": "Yajurveda",
        "lv": "Jajurvēda",
        "mg": "Yajurveda",
        "mi": "Yajurveda",
        "mk": "Јајурведа",
        "ml": "യജുർവേദം",
        "mn": "Яжурведа",
        "mr": "यजुर्वेद",
        "ms": "Yajurveda",
        "mt": "Yajurveda",
        "my": "Yaurveda",
        "ne": "यजुर्वेद",
        "no": "Yajurveda",
        "ny": "Yajurveda",
        "or": "ଯଜୁର୍ବେଦ",
        "pa": "ਯਜੁਰਵੇਦ",
        "ps": "یاجوروید",
        "ro": "Yajurveda",
        "rw": "Yajurveda",
        "sd": "يجوردو",
        "si": "යජුර්වේදය",
        "sk": "Yajurveda",
        "sl": "Yajurveda",
        "sm": "Yajurveda",
        "sn": "Yajurveda",
        "so": "Yajurveda",
        "sq": "Yajurveda",
        "sr": "Иајурведа",
        "st": "Yajurveda",
        "su": "Yajurveda",
        "sv": "Yajurveda",
        "sw": "Yajurveda",
        "ta": "யஜுர்வேதம்",
        "te": "యజుర్వేదం",
        "tg": "Яжурведа",
        "th": "ยาชุรเวช",
        "tk": "Ajajurveda",
        "ug": "Yajurveda",
        "uz": "Yajurveda",
        "xh": "Yajurveda",
        "yi": "יאַדזשורוועדאַ",
        "yo": "Yajurveda",
        "zu": "Yajurveda"
    },
    "Ramayana": {
        "bn": "রামায়ণ",
        "hi": "रामायण",
        "es": "Ramayana",
        "he": "רמאיאנה",
        "ar": "رامايانا",
        "ja": "ラーマーヤナ",
        "zh": "罗摩衍那",
        "ko": "라마야나",
        "fr": "Ramayana",
        "de": "Ramayana",
        "ru": "Рамаяна",
        "it": "Ramayana",
        "pt": "Ramayana",
        "tr": "Ramayana",
        "id": "Ramayana",
        "ur": "رامائن",
        "fa": "رامایانا",
        "nl": "Ramayana",
        "pl": "Ramajana",
        "uk": "Рамаяна",
        "vi": "Ramayana",
        "af": "Ramayana",
        "am": "ራማያና",
        "as": "ৰামায়ণ",
        "az": "Ramayana",
        "be": "Рамаяна",
        "bg": "Рамаяна",
        "bs": "Ramayana",
        "ca": "Ramayana",
        "ceb": "Ramayana",
        "cs": "Rámajána",
        "cy": "Ramayana",
        "da": "Ramayana",
        "el": "Ραμαγιάνα",
        "eo": "Ramajano",
        "et": "Ramayana",
        "eu": "Ramayana",
        "fi": "Ramayana",
        "fil": "Ramayana",
        "ga": "Ramayana",
        "gd": "Ramayana",
        "gl": "Ramayana",
        "gu": "રામાયણ",
        "ha": "Ramayana",
        "haw": "Ramayana",
        "hr": "Ramayana",
        "hu": "Rámájana",
        "hy": "Ռամայանա",
        "ig": "Ramayana",
        "is": "Ramayana",
        "jv": "Ramayana",
        "ka": "რამაიანა",
        "kk": "Рамаяна",
        "km": "រ៉ាម៉ាយាន",
        "kn": "ರಾಮಾಯಣ",
        "ku": "Ramayana",
        "ky": "Рамаяна",
        "la": "Ramayana",
        "lo": "ຣາມາຢານາ",
        "lt": "Ramajana",
        "lv": "Rāmajana",
        "mg": "Ramayana",
        "mi": "Ramayana",
        "mk": "Рамајана",
        "ml": "രാമായണം",
        "mn": "Рамаяна",
        "mr": "रामायण",
        "ms": "Ramayana",
        "mt": "Ramayana",
        "my": "ရာမယန",
        "ne": "रामायण",
        "no": "Ramayana",
        "ny": "Ramayana",
        "or": "ରାମାୟଣ |",
        "pa": "ਰਾਮਾਇਣ",
        "ps": "راماینا",
        "ro": "Ramayana",
        "rw": "Ramayana",
        "sd": "رامائن",
        "si": "රාමායනය",
        "sk": "Rámajána",
        "sl": "Ramajana",
        "sm": "Ramayana",
        "sn": "Ramayana",
        "so": "Ramayana",
        "sq": "Ramayana",
        "sr": "Рамаиана",
        "st": "Ramayana",
        "su": "Ramayana",
        "sv": "Ramayana",
        "sw": "Ramayana",
        "ta": "ராமாயணம்",
        "te": "రామాయణం",
        "tg": "Рамаяна",
        "th": "รามเกียรติ์",
        "tk": "Ramaýana",
        "ug": "Ramayana",
        "uz": "Ramayana",
        "xh": "Ramayana",
        "yi": "ראַמייַאַנאַ",
        "yo": "Ramayana",
        "zu": "Ramayana"
    },
    "Mahabharata": {
        "bn": "মহাভারত",
        "hi": "महाभारत",
        "es": "Mahabharata",
        "he": "מהאבהארטה",
        "ar": "مهابهاراتا",
        "ja": "マハーバーラタ",
        "zh": "摩诃婆罗多",
        "ko": "마하바라타",
        "fr": "Mahabharata",
        "de": "Mahabharata",
        "ru": "Махабхарата",
        "it": "Mahabharata",
        "pt": "Mahabharata",
        "tr": "Mahabharata",
        "id": "Mahabharata",
        "ur": "مہابھارت",
        "fa": "مهابهاراتا",
        "nl": "Mahabharata",
        "pl": "Mahabharata",
        "uk": "Махабхарата",
        "vi": "Mahabharata",
        "af": "Mahabharata",
        "am": "ማሃባራታ",
        "as": "মহাভাৰত",
        "az": "Mahabharata",
        "be": "Махабхарата",
        "bg": "Махабхарата",
        "bs": "Mahabharata",
        "ca": "Mahabharata",
        "ceb": "Mahabharata",
        "cs": "Mahábhárata",
        "cy": "Mahabharata",
        "da": "Mahabharata",
        "el": "Μαχαμπαράτα",
        "eo": "Mahabharato",
        "et": "Mahabharata",
        "eu": "Mahabharata",
        "fi": "Mahabharata",
        "fil": "Mahabharata",
        "ga": "Mahabharata",
        "gd": "Mahabharata",
        "gl": "Mahabharata",
        "gu": "મહાભારત",
        "ha": "Mahabharata",
        "haw": "Mahabharata",
        "hr": "Mahabharata",
        "hu": "Mahábhárata",
        "hy": "Մահաբհարատա",
        "ig": "Mahabharata",
        "is": "Mahabharata",
        "jv": "Mahabharata",
        "ka": "მაჰაბჰარატა",
        "kk": "Махабхарата",
        "km": "មហាបារ៉ាតា",
        "kn": "ಮಹಾಭಾರತ",
        "ku": "Mahabharata",
        "ky": "Махабхарата",
        "la": "Mahabharata",
        "lo": "ມະຫາບາຣະຕາ",
        "lt": "Mahabharata",
        "lv": "Mahābhārata",
        "mg": "Mahabharata",
        "mi": "Mahabharata",
        "mk": "Махабхарата",
        "ml": "മഹാഭാരതം",
        "mn": "Махабхарата",
        "mr": "महाभारत",
        "ms": "Mahabharata",
        "mt": "Mahabharata",
        "my": "မဟာဘာရတ",
        "ne": "महाभारत",
        "no": "Mahabharata",
        "ny": "Mahabharata",
        "or": "ମହାଭାରତ",
        "pa": "ਮਹਾਭਾਰਤ",
        "ps": "مهابارت",
        "ro": "Mahabharata",
        "rw": "Mahabharata",
        "sd": "مهاڀارت",
        "si": "මහා භාරතය",
        "sk": "Mahábhárata",
        "sl": "Mahabharata",
        "sm": "Mahabharata",
        "sn": "Mahabharata",
        "so": "Mahabharata",
        "sq": "Mahabharata",
        "sr": "Махабхарата",
        "st": "Mahabharata",
        "su": "Mahabarata",
        "sv": "Mahabharata",
        "sw": "Mahabharata",
        "ta": "மகாபாரதம்",
        "te": "మహాభారతం",
        "tg": "Махабхарата",
        "th": "มหาภารตะ",
        "tk": "Mahabharata",
        "ug": "Mahabharata",
        "uz": "Mahabharata",
        "xh": "Mahabharata",
        "yi": "מאַהאַבהאַראַטאַ",
        "yo": "Mahabharata",
        "zu": "Mahabharata"
    },
    "Ramcharitmanas": {
        "bn": "রামচরিতমানস",
        "hi": "रामचरितमानस",
        "es": "Ramcharitmanas",
        "he": "רמחריטמנאס",
        "ar": "رامشاريتماناس",
        "ja": "ラムチャリトマナス",
        "zh": "拉姆查里特玛纳斯",
        "ko": "람차리트마나스",
        "fr": "Ramcharitmanas",
        "de": "Ramcharitmanas",
        "ru": "Рамчаритманас",
        "it": "Ramcharitmanas",
        "pt": "Ramcharitmanas",
        "tr": "Ramcharitmanas",
        "id": "Ramcharitmanas",
        "ur": "رامچرتماناس",
        "fa": "رامچاریتماناس",
        "nl": "Ramcharitmanas",
        "pl": "Ramcharitmanas",
        "uk": "Рамчарітманас",
        "vi": "Ramcharitmanas",
        "af": "Ramcharitmanas",
        "am": "ራምቻሪትማናስ",
        "as": "ৰামচৰিতমানস",
        "az": "Ramcharitmanas",
        "be": "Рамчарытманас",
        "bg": "Рамчаритманас",
        "bs": "Ramcharitmanas",
        "ca": "Ramcharitmanas",
        "ceb": "Ramcharitmanas",
        "cs": "Ramcharitmanas",
        "cy": "Ramcharitmanas",
        "da": "Ramcharitmanas",
        "el": "Ραμχαριτμάνας",
        "eo": "Ramcharitmanas",
        "et": "Ramcharitmanas",
        "eu": "Ramcharitmanas",
        "fi": "Ramcharitmanas",
        "fil": "Ramcharitmanas",
        "ga": "Ramcharitmanas",
        "gd": "Ramcharitmanas",
        "gl": "Ramcharitmanas",
        "gu": "રામચરિતમાનસ",
        "ha": "Ramcharitmanas",
        "haw": "Ramcharitmanas",
        "hr": "Ramcharitmanas",
        "hu": "Ramcharitmanas",
        "hy": "Ռամչարիտմանաս",
        "ig": "Ramcharitmanas",
        "is": "Ramcharitmanas",
        "jv": "Ramcharitmanas",
        "ka": "რამჩარიტმანასი",
        "kk": "Рамчаритманас",
        "km": "រ៉ាមឆារីតម៉ាណាស",
        "kn": "ರಾಮಚರಿತಮಾನಸ್",
        "ku": "Ramcharitmanas",
        "ky": "Ramcharitmanas",
        "la": "Ramcharitmanas",
        "lo": "ຣາມຊາຣິຕມານາສ",
        "lt": "Ramcharitmanas",
        "lv": "Ramcharitmanas",
        "mg": "Ramcharitmanas",
        "mi": "Ramcharitmanas",
        "mk": "Рамчаритманас",
        "ml": "രാമചരിതമനസ്",
        "mn": "Рамчаритманас",
        "mr": "रामचरितमानस",
        "ms": "Ramcharitmanas",
        "mt": "Ramcharitmanas",
        "my": "Ramcharitmanas",
        "ne": "रामचरितमानस",
        "no": "Ramcharitmanas",
        "ny": "Ramcharitmanas",
        "or": "ରାମଚରିତମାନସ୍ |",
        "pa": "ਰਾਮਚਰਿਤਮਾਨਸ",
        "ps": "رامچاریتماناس",
        "ro": "Ramcharitmanas",
        "rw": "Ramcharitmanas",
        "sd": "رامچارتمانس",
        "si": "රාම්චරිත්මනස්",
        "sk": "Ramcharitmanas",
        "sl": "Ramcharitmanas",
        "sm": "Ramcharitmanas",
        "sn": "Ramcharitmanas",
        "so": "Ramcharitmanas",
        "sq": "Ramcharitmanas",
        "sr": "Рамцхаритманас",
        "st": "Ramcharitmanas",
        "su": "Ramcharitmanas",
        "sv": "Ramcharitmanas",
        "sw": "Ramcharitmanas",
        "ta": "ராம்சரித்மனாஸ்",
        "te": "రామచరితమానస్",
        "tg": "Рамчаритманас",
        "th": "รามจริตมนัส",
        "tk": "Ramcharitmanas",
        "ug": "Ramcharitmanas",
        "uz": "Ramcharitmanas",
        "xh": "Ramcharitmanas",
        "yi": "ראַכאַריטמאַנאַס",
        "yo": "Ramcharitmanas",
        "zu": "I-Ramcharitmanas"
    },
    "Upanishads": {
        "bn": "উপনিষদ",
        "hi": "उपनिषद",
        "es": "Upanishads",
        "he": "אופנישדות",
        "ar": "الأوبانيشاد",
        "ja": "ウパニシャッド",
        "zh": "奥义书",
        "ko": "우파니샤드",
        "fr": "Upanishads",
        "de": "Upanishaden",
        "ru": "Упанишады",
        "it": "Upanishad",
        "pt": "Upanishads",
        "tr": "Upanişadlar",
        "id": "Upanishad",
        "ur": "اپنشد",
        "fa": "اوپانیشادها",
        "nl": "Upanishads",
        "pl": "Upaniszady",
        "uk": "Упанішади",
        "vi": "Upanishad",
        "af": "Upanishads",
        "am": "ኡፓኒሻድስ",
        "as": "উপনিষদ",
        "az": "Upanişadlar",
        "be": "Упанішады",
        "bg": "Упанишади",
        "bs": "Upanišade",
        "ca": "Upanishads",
        "ceb": "Mga Upanishad",
        "cs": "Upanišady",
        "cy": "Upanishads",
        "da": "Upanishads",
        "el": "Ουπανισάδες",
        "eo": "Upanishads",
        "et": "Upanišadid",
        "eu": "Upanishadak",
        "fi": "Upanishadit",
        "fil": "Mga Upanishad",
        "ga": "Upanishads",
        "gd": "Upanishads",
        "gl": "Upanishads",
        "gu": "ઉપનિષદ",
        "ha": "Upanishads",
        "haw": "Upanishads",
        "hr": "Upanišade",
        "hu": "Upanisadok",
        "hy": "Ուպանիշադներ",
        "ig": "Upanishads",
        "is": "Upanishads",
        "jv": "Upanishad",
        "ka": "უპანიშადები",
        "kk": "Упанишадтар",
        "km": "Upanishads",
        "kn": "ಉಪನಿಷತ್ತುಗಳು",
        "ku": "Upanishads",
        "ky": "Упанишаддар",
        "la": "Upanishads",
        "lo": "Upanishads",
        "lt": "Upanišados",
        "lv": "Upanišadas",
        "mg": "Upanishads",
        "mi": "Upanishads",
        "mk": "Упанишади",
        "ml": "ഉപനിഷത്തുകൾ",
        "mn": "Упанишадууд",
        "mr": "उपनिषद",
        "ms": "Upanishad",
        "mt": "Upanishads",
        "my": "Upanishads",
        "ne": "उपनिषद",
        "no": "Upanishads",
        "ny": "Upanishads",
        "or": "ଉପନିଷଦ |",
        "pa": "ਉਪਨਿਸ਼ਦ",
        "ps": "اپنشدونه",
        "ro": "Upanishads",
        "rw": "Upanishad",
        "sd": "اپنشد",
        "si": "උපනිෂද්",
        "sk": "Upanišády",
        "sl": "Upanišade",
        "sm": "Upanishads",
        "sn": "Upanishads",
        "so": "Upanishads",
        "sq": "Upanishadet",
        "sr": "Упанишаде",
        "st": "Upanishads",
        "su": "Upanishads",
        "sv": "Upanishads",
        "sw": "Upanishads",
        "ta": "உபநிடதங்கள்",
        "te": "ఉపనిషత్తులు",
        "tg": "Упанишадҳо",
        "th": "อุปนิษัท",
        "tk": "Upanishad",
        "ug": "Upanishad",
        "uz": "Upanishadlar",
        "xh": "Upanishads",
        "yi": "Upanishads",
        "yo": "Upanishads",
        "zu": "I-Upanishads"
    },
    "Sahih al-Bukhari": {
        "bn": "সহীহ বুখারী",
        "hi": "सहीह बुखारी",
        "ar": "صحيح البخاري",
        "he": "סחיח אל-בוכרי",
        "ja": "サヒ・アル・ブハーリ",
        "zh": "布哈里圣训实录",
        "ko": "사히 알 부카리",
        "es": "Sahih al-Bujari",
        "fr": "Sahih al-Boukhari",
        "de": "Sahih al-Bukhari",
        "ru": "Сахих аль-Бухари",
        "it": "Sahih al-Bukhari",
        "pt": "Sahih al-Bukhari",
        "tr": "Sahih el-Buhari",
        "id": "Shahih al-Bukhari",
        "ur": "صحیح البخاری",
        "fa": "صحیح البخاری"
    },
    "Sunan Abi Dawud": {
        "bn": "সুনান আবু দাউদ",
        "hi": "सुनन अबू दाऊद",
        "ar": "سنن أبي داود",
        "he": "סונאן אבו דאוד",
        "es": "Sunan Abi Dawud",
        "fr": "Sunan Abi Dawud",
        "ur": "سنن ابی داؤد",
        "fa": "سنن ابوداود",
        "ja": "彼の名前はアビ・ダウドです",
        "zh": "他的名字叫阿比·达乌德",
        "ko": "이름이 아비 다우드인 사람",
        "de": "Sein Name ist Abi Dawud",
        "ru": "Его зовут Аби Дауд.",
        "it": "Il suo nome è Abi Dawud",
        "pt": "O nome dele é Abi Dawud",
        "tr": "Adı Ebu Davud",
        "id": "Namanya Abi Dawud"
    },
    "Jami at-Tirmidhi": {
        "bn": "জামে তিরমিযী",
        "hi": "जामी अत-तिर्मिज़ी",
        "ar": "جامع الترمذي",
        "he": "ג'מי אט-טירמידי",
        "ja": "ジャミ・アット・ティルミディ",
        "zh": "贾米·提尔米济",
        "ko": "자미 앗-티르미디",
        "es": "Jami at-Tirmidhi",
        "fr": "Jami at-Tirmidhi",
        "de": "Jami at-Tirmidhi",
        "ru": "Джами ат-Тирмизи",
        "it": "Jami at-Tirmidhi",
        "pt": "Jami at-Tirmidhi",
        "tr": "Cami et-Tirmizi",
        "id": "Jami at-Tirmidzi",
        "ur": "جامع ترمذی ۔",
        "fa": "جامی ترمذی"
    },
    "Sunan an-Nasa'i": {
        "bn": "সুনান আন-নাসায়ী",
        "hi": "सुनन अन-नसाई",
        "ar": "سنن النسائي",
        "he": "סונאן א-נסאאי",
        "es": "Sunan an-Nasa'i",
        "fr": "Sunan an-Nasa'i",
        "ur": "سنن نسائی",
        "fa": "سنن نسائی",
        "ja": "彼の名前はアン・ナサイです",
        "zh": "他的名字叫安纳萨伊",
        "ko": "그의 이름은 안-나사이(An-Nasa'i)입니다.",
        "de": "Sein Name ist An-Nasa'i",
        "ru": "Его зовут Ан-Насаи.",
        "it": "Il suo nome è An-Nasa'i",
        "pt": "Seu nome é An-Nasa'i",
        "tr": "Adı An-Nesa'i",
        "id": "Namanya An-Nasa'i",
        "nl": "Sunan an-Nasa'i",
        "pl": "Sunan an-Nasa'i",
        "uk": "Сунан ан-Насаї",
        "vi": "Sunan an-Nasa'i",
        "af": "Sunan an-Nasa'i",
        "am": "ሱናን አን-ናሳይ",
        "as": "সুনান আন-নাছাই",
        "az": "Sünəni ən-Nəsai",
        "be": "Сунан ан-Насаі",
        "bg": "Сунан ан-Насаи",
        "bs": "Sunan an-Nasa'i",
        "ca": "Sunan an-Nasa'i",
        "ceb": "Sunan an-Nasa'i",
        "cs": "Sunan an-Nasa'i",
        "cy": "Sunan an-Nasa'i",
        "da": "Sunan an-Nasa'i",
        "el": "Σουνάν αν-Νασάι",
        "eo": "Sunan an-Nasa'i",
        "et": "Sunan an-Nasa'i",
        "eu": "Sunan an-Nasa'i",
        "fi": "Sunan an-Nasa'i",
        "fil": "Sunan an-Nasa'i",
        "ga": "Sunan an-Nasa'i",
        "gd": "Sunan an-Nasa'i",
        "gl": "Sunan an-Nasa'i",
        "gu": "સુનાન અન-નાસાઇ",
        "ha": "Sunan an-Nasa'i",
        "haw": "Sunan an-Nasaʻi",
        "hr": "Sunen en-Nasa'i",
        "hu": "Sunan an-Nasa'i",
        "hy": "Սունան ան-Նասայի",
        "ig": "Sunan an-Nasai",
        "is": "Sunan an-Nasa'i",
        "jv": "Sunan an-Nasa'i",
        "ka": "სუნანი ან-ნასაი",
        "kk": "Сунан ән-Насаи",
        "km": "ស៊ុនណាន់-ណាសាអ៊ី",
        "kn": "ಸುನನ್ ಆನ್-ನಾಸಾಯಿ",
        "ku": "Sunen en-Nesaî",
        "ky": "Сунан ан-Насаи",
        "la": "Sunan an-Nasa'i",
        "lo": "Sunan an-Nasa'i",
        "lt": "Sunan an-Nasa'i",
        "lv": "Sunan an-Nasa'i",
        "mg": "Sunan an-Nasa'i",
        "mi": "Sunan an-Nasa'i",
        "mk": "Сунан ан-Насаи",
        "ml": "സുനൻ അൻ-നസാഇ",
        "mn": "Сунан ан-Насаи",
        "mr": "सुनन अन-नासाई",
        "ms": "Sunan an-Nasa'i",
        "mt": "Sunan an-Nasa'i",
        "my": "Sunan an-Nas'i",
        "ne": "सुनन अन-नासाई",
        "no": "Sunan an-Nasa'i",
        "ny": "Sunan an-Nasa'i",
        "or": "ସୁନାନ୍ ଅନ-ନାସା",
        "pa": "ਸੁਨਾਨ ਅਨ-ਨਸਾਈ",
        "ps": "سنن نسايي",
        "ro": "Sunan an-Nasa'i",
        "rw": "Sunan an-Nasa'i",
        "sd": "سنن نسائي",
        "si": "සුනන් අන්-නාසායි",
        "sk": "Sunan an-Nasa'i",
        "sl": "Sunan an-Nasa'i",
        "sm": "Sunan an-Nasa'i",
        "sn": "Sunan an-Nasa'i",
        "so": "Sunan an-Nasaa'i",
        "sq": "Sunen en-Nesa'i",
        "sr": "Сунан ан-Наса'и",
        "st": "Sunan an-Nasa'i",
        "su": "Sunan an-Nasa'i",
        "sv": "Sunan an-Nasa'i",
        "sw": "Sunan an-Nasa'i",
        "ta": "சுனன் அந்-நஸாயி",
        "te": "సునన్ అన్-నసాయి",
        "tg": "Сунан ан-Насоий",
        "th": "สุนันอัน-นาซาอี",
        "tk": "Sunan an-Nasa'i",
        "ug": "Sunan an-Nasa'i",
        "uz": "Sunan an-Nasoiy",
        "xh": "Sunan an-Nasa'i",
        "yi": "סונאַן אַן-נאַסאַי",
        "yo": "Sunan an-Nasai",
        "zu": "I-Sunan an-Nasa'i"
    },
    "Muwatta Malik": {
        "bn": "মুওয়াত্তা মালিক",
        "hi": "मुवत्ता मालिक",
        "ar": "موطأ مالك",
        "he": "מוואטה מאליק",
        "ja": "ムワッタ・マリク",
        "zh": "穆瓦塔·马利克",
        "ko": "무와타 말리크",
        "es": "Malik Muwatta",
        "fr": "Muwatta Malik",
        "de": "Muwatta Malik",
        "ru": "Муватта Малик",
        "it": "Muwatta Malik",
        "pt": "Muwatta Malik",
        "tr": "Muwatta Malik",
        "id": "Muwatta Malik",
        "ur": "موطا ملک",
        "fa": "مواته مالک",
        "nl": "Muwatta Malik",
        "pl": "Muwatty Malika",
        "uk": "Муватта Малік",
        "vi": "Muwatta Malik",
        "af": "Muwatta Malik",
        "am": "ሙዋት ማሊክ",
        "as": "মুৱাত্তা মালিক",
        "az": "Muvatta Malik",
        "be": "Муватта Малік",
        "bg": "Мувата Малик",
        "bs": "Muwatta Malik",
        "ca": "Muwatta Malik",
        "ceb": "Muwatta Malik",
        "cs": "Muwatta Malik",
        "cy": "Muwatta Malik",
        "da": "Muwatta Malik",
        "el": "Μουβάτα Μάλικ",
        "eo": "Muwatta Malik",
        "et": "Muwatta Malik",
        "eu": "Muwatta Malik",
        "fi": "Muwatta Malik",
        "fil": "Muwatta Malik",
        "ga": "Muwatta Malik",
        "gd": "Muwatta Malik",
        "gl": "Muwatta Malik",
        "gu": "મુવત્તા મલિક",
        "ha": "Muwatta Malik",
        "haw": "Muwatta Malik",
        "hr": "Muwatta Malik",
        "hu": "Muwatta Malik",
        "hy": "Մուվատա Մալիկ",
        "ig": "Muwatta Malik",
        "is": "Muwatta Malik",
        "jv": "Muwatta Malik",
        "ka": "მუვატა მალიკი",
        "kk": "Муватта Малик",
        "km": "Muwatta Malik",
        "kn": "ಮುವತ್ತ ಮಲಿಕ್",
        "ku": "Muwatta Malik",
        "ky": "Муватта Малик",
        "la": "Muwatta Malik",
        "lo": "ມັທທາ ມາລິກ",
        "lt": "Muwatta Malik",
        "lv": "Muvata Malik",
        "mg": "Muwatta Malik",
        "mi": "Muwatta Malik",
        "mk": "Мувата Малик",
        "ml": "മുവത്ത മാലിക്",
        "mn": "Муватта Малик",
        "mr": "मुवाट्टा मलिक",
        "ms": "Muwatta Malik",
        "mt": "Muwatta Malik",
        "my": "မူဝါတာမာလစ်",
        "ne": "मुवाता मलिक",
        "no": "Muwatta Malik",
        "ny": "Muwatta Malik",
        "or": "ମୁୱାଟା ମଲିକ୍ |",
        "pa": "ਮੁਵੱਤਾ ਮਲਿਕ",
        "ps": "مفته ملک",
        "ro": "Muwatta Malik",
        "rw": "Muwatta Malik",
        "sd": "موطا ملڪ",
        "si": "මුවත්ත මලික්",
        "sk": "Muwatta Malik",
        "sl": "Muwatta Malik",
        "sm": "Muwatta Malik",
        "sn": "Muwatta Malik",
        "so": "Muwatta Malik",
        "sq": "Muwatta Malik",
        "sr": "Муватта Малик",
        "st": "Muwatta Malik",
        "su": "Muwatta Malik",
        "sv": "Muwatta Malik",
        "sw": "Muwatta Malik",
        "ta": "முவத்தா மாலிக்",
        "te": "మువత్తా మాలిక్",
        "tg": "Муватта Малик",
        "th": "มูวัตต้า มาลิก",
        "tk": "Muwatta Malik",
        "ug": "Muwatta Malik",
        "uz": "Muvatta Malik",
        "xh": "Muwatta Malik",
        "yi": "מוואטטא מאליק",
        "yo": "Muwatta Malik",
        "zu": "Muwatta Malik"
    },
    "Musnad Ahmad": {
        "bn": "মুসনাদ আহমাদ",
        "hi": "मुसनद अहमद",
        "ar": "مسند أحمد",
        "he": "מוסנאד אחמד",
        "ja": "ムスナド・アハマド",
        "zh": "穆斯纳德·艾哈迈德",
        "ko": "무스나드 아마드",
        "es": "Musnad Ahmad",
        "fr": "Musnad Ahmad",
        "de": "Musnad Ahmad",
        "ru": "Муснад Ахмад",
        "it": "Musnad Ahmad",
        "pt": "Musnad Ahmad",
        "tr": "Müsned Ahmed",
        "id": "Musnad Ahmad",
        "ur": "مسند احمد",
        "fa": "مسند احمد"
    },
    "Joshua": {
        "bn": "যিহোশূয়",
        "hi": "यहोशू",
        "es": "Josué",
        "ar": "يشوع",
        "fr": "Josué",
        "it": "Giosuè",
        "de": "Josua",
        "ru": "Иисус Навин",
        "he": "יהושע",
        "ja": "ジョシュア",
        "zh": "Joshua",
        "ko": "여호수아",
        "pt": "Josué",
        "tr": "Joshua",
        "id": "Yosua",
        "ur": "جوشوا",
        "fa": "جاشوا",
        "nl": "Jozua",
        "pl": "Jozue",
        "uk": "Джошуа",
        "vi": "Joshua",
        "af": "Josua",
        "am": "ኢያሱ",
        "as": "যিহোচূৱা",
        "az": "Joshua",
        "be": "Джошуа",
        "bg": "Джошуа",
        "bs": "Joshua",
        "ca": "Josuè",
        "ceb": "Joshua",
        "cs": "Joshua",
        "cy": "Josua",
        "da": "Joshua",
        "el": "Ο Τζόσουα",
        "eo": "Josuo",
        "et": "Joshua",
        "eu": "Josu",
        "fi": "Joshua",
        "fil": "Joshua",
        "ga": "Iósua",
        "gd": "Iosua",
        "gl": "Xosué",
        "gu": "જોશુઆ",
        "ha": "Joshua",
        "haw": "Joshua",
        "hr": "Joshua",
        "hu": "Joshua",
        "hy": "Ջոշուա",
        "ig": "Joshua",
        "is": "Jósúa",
        "jv": "Joshua",
        "ka": "ჯოშუა",
        "kk": "Джошуа",
        "km": "យ៉ូស្វេ",
        "kn": "ಜೋಶುವಾ",
        "ku": "Joshua",
        "ky": "Жашыя",
        "la": "Iosue",
        "lo": "ໂຢຊວຍ",
        "lt": "Joshua",
        "lv": "Džošua",
        "mg": "Josoa",
        "mi": "Joshua",
        "mk": "Џошуа",
        "ml": "ജോഷ്വ",
        "mn": "Жошуа",
        "mr": "जोशुआ",
        "ms": "Joshua",
        "mt": "Ġożwè",
        "my": "ယောရှု",
        "ne": "जोशुआ",
        "no": "Joshua",
        "ny": "Yoswa",
        "or": "ଯିହୋଶୂୟ |",
        "pa": "ਜੋਸ਼ੁਆ",
        "ps": "جوشوا",
        "ro": "Iosua",
        "rw": "Yozuwe",
        "sd": "جوشوا",
        "si": "ජෝෂුවා",
        "sk": "Joshua",
        "sl": "Joshua",
        "sm": "Iosua",
        "sn": "Joshua",
        "so": "Yashuuca",
        "sq": "Joshua",
        "sr": "Јосхуа",
        "st": "Joshua",
        "su": "Joshua",
        "sv": "Joshua",
        "sw": "Yoshua",
        "ta": "யோசுவா",
        "te": "జాషువా",
        "tg": "Еҳушаъ",
        "th": "โจชัว",
        "tk": "Joshuaeşuwa",
        "ug": "يوشۇۋا",
        "uz": "Yoshua",
        "xh": "UYoshuwa",
        "yi": "יאשא",
        "yo": "Jóṣúà",
        "zu": "UJoshuwa"
    },
    "Judges": {
        "bn": "বিচারকর্ত্তৃগণ",
        "hi": "न्यायियों",
        "es": "Jueces",
        "ar": "القضاة",
        "fr": "Juges",
        "it": "Giudici",
        "de": "Richter",
        "ru": "Судьи",
        "he": "שופטים",
        "ja": "裁判官",
        "zh": "法官",
        "ko": "판사",
        "pt": "Juízes",
        "tr": "Hakimler",
        "id": "Hakim",
        "ur": "ججز",
        "fa": "داوران",
        "nl": "Rechters",
        "pl": "Sędziowie",
        "uk": "Судді",
        "vi": "Thẩm phán",
        "af": "Regters",
        "am": "ዳኞች",
        "as": "বিচাৰকসকল",
        "az": "Hakimlər",
        "be": "суддзі",
        "bg": "Съдии",
        "bs": "Sudije",
        "ca": "Jutges",
        "ceb": "Mga maghuhukom",
        "cs": "soudci",
        "cy": "Beirniaid",
        "da": "Dommere",
        "el": "δικαστές",
        "eo": "Juĝistoj",
        "et": "Kohtunikud",
        "eu": "Epaileak",
        "fi": "Tuomarit",
        "fil": "Mga hukom",
        "ga": "Breithiúna",
        "gd": "Britheamhan",
        "gl": "Xuíces",
        "gu": "ન્યાયાધીશો",
        "ha": "Alƙalai",
        "haw": "Na Lunakanawai",
        "hr": "suci",
        "hu": "bírák",
        "hy": "Դատավորներ",
        "ig": "Ndị ikpe",
        "is": "Dómarar",
        "jv": "hakim",
        "ka": "მოსამართლეები",
        "kk": "Төрешілер",
        "km": "ចៅក្រម",
        "kn": "ನ್ಯಾಯಾಧೀಶರು",
        "ku": "Dadweran",
        "ky": "Соттор",
        "la": "Iudices",
        "lo": "ຜູ້ພິພາກສາ",
        "lt": "Teisėjai",
        "lv": "Tiesneši",
        "mg": "Mpitsara",
        "mi": "Nga Kai-whakawa",
        "mk": "Судиите",
        "ml": "ജഡ്ജിമാർ",
        "mn": "Шүүгчид",
        "mr": "न्यायाधीश",
        "ms": "Hakim",
        "mt": "Imħallfin",
        "my": "တရားသူကြီးများ",
        "ne": "न्यायाधीशहरू",
        "no": "Dommere",
        "ny": "Oweruza",
        "or": "ବିଚାରପତିମାନେ",
        "pa": "ਜੱਜਾਂ",
        "ps": "قاضیان",
        "ro": "Judecătorii",
        "rw": "Abacamanza",
        "sd": "ججن",
        "si": "විනිසුරුවරුන්",
        "sk": "sudcovia",
        "sl": "Sodniki",
        "sm": "Faamasino",
        "sn": "Vatongi",
        "so": "Garsoorayaal",
        "sq": "Gjyqtarët",
        "sr": "Судије",
        "st": "Baahloli",
        "su": "hakim",
        "sv": "Domare",
        "sw": "Waamuzi",
        "ta": "நீதிபதிகள்",
        "te": "న్యాయమూర్తులు",
        "tg": "Доварон",
        "th": "ผู้พิพากษา",
        "tk": "Kazylar",
        "ug": "سوتچىلار",
        "uz": "Hakamlar",
        "xh": "Abagwebi",
        "yi": "ריכטער",
        "yo": "Awọn onidajọ",
        "zu": "Abahluleli"
    },
    "Ruth": {
        "bn": "রূথ",
        "hi": "रूत",
        "es": "Rut",
        "ar": "راعوث",
        "fr": "Ruth",
        "it": "Rut",
        "de": "Rut",
        "ru": "Руфь",
        "he": "רות",
        "ja": "ルース",
        "zh": "露丝",
        "ko": "룻",
        "pt": "Rute",
        "tr": "Ruth",
        "id": "Rut",
        "ur": "روتھ",
        "fa": "روت",
        "nl": "Rutte",
        "pl": "Rut",
        "uk": "Рут",
        "vi": "Ru-tơ",
        "af": "Rut",
        "am": "ሩት",
        "as": "ৰুথ",
        "az": "Rut",
        "be": "Рут",
        "bg": "Рут",
        "bs": "Ruth",
        "ca": "Ruth",
        "ceb": "Ruth",
        "cs": "Ruth",
        "cy": "Ruth",
        "da": "Ruth",
        "el": "Ρουθ",
        "eo": "Ruth",
        "et": "Ruth",
        "eu": "Ruth",
        "fi": "Ruth",
        "fil": "si Ruth",
        "ga": "Rút",
        "gd": "Rut",
        "gl": "Ruth",
        "gu": "રૂથ",
        "ha": "Ruth",
        "haw": "ʻO Ruta",
        "hr": "Ruth",
        "hu": "Ruth",
        "hy": "Ռութ",
        "ig": "Rut",
        "is": "Rut",
        "jv": "Ruth",
        "ka": "რუთი",
        "kk": "Рут",
        "km": "រូធ",
        "kn": "ರೂತ್",
        "ku": "Ruth",
        "ky": "Рут",
        "la": "Ruth",
        "lo": "Ruth",
        "lt": "Rūta",
        "lv": "Rūta",
        "mg": "Ruth",
        "mi": "Ruta",
        "mk": "Рут",
        "ml": "റൂത്ത്",
        "mn": "Рут",
        "mr": "रुथ",
        "ms": "Ruth",
        "mt": "Ruth",
        "my": "ရုသ",
        "ne": "रुथ",
        "no": "Ruth",
        "ny": "Rute",
        "or": "ରୁଥ",
        "pa": "ਰੂਥ",
        "ps": "روت",
        "ro": "Ruth",
        "rw": "Rusi",
        "sd": "روٿ",
        "si": "රූත්",
        "sk": "Ruth",
        "sl": "Ruth",
        "sm": "Ruta",
        "sn": "Rute",
        "so": "Ruth",
        "sq": "Rutha",
        "sr": "Рутх",
        "st": "Ruthe",
        "su": "Ruth",
        "sv": "Ruth",
        "sw": "Ruthu",
        "ta": "ரூத்",
        "te": "రూత్",
        "tg": "Рут",
        "th": "รูธ",
        "tk": "Rut",
        "ug": "رۇت",
        "uz": "Rut",
        "xh": "URute",
        "yi": "רות",
        "yo": "Rutu",
        "zu": "URuthe"
    },
    "1 Samuel": {
        "bn": "১ শমূয়েল",
        "hi": "1 शमूएल",
        "es": "1 Samuel",
        "ar": "صموئيل الأول",
        "fr": "1 Samuel",
        "it": "1 Samuele",
        "de": "1. Samuel",
        "ru": "1 Царств",
        "he": "שמואל א'",
        "ja": "1 サムエル",
        "zh": "1 撒母耳",
        "ko": "사무엘상 1장",
        "pt": "1Samuel",
        "tr": "1 Samuel",
        "id": "1 Samuel",
        "ur": "1 سموئیل",
        "fa": "1 ساموئل",
        "nl": "1 Samuël",
        "pl": "1 Samuela",
        "uk": "1 Самуїла",
        "vi": "1 Sa-mu-ên",
        "af": "1 Samuel",
        "am": "1 ሳሙኤል",
        "as": "১ চমূৱেল",
        "az": "1 Şamuel",
        "be": "1 Самуіл",
        "bg": "1 Царе",
        "bs": "1 Samuel",
        "ca": "1 Samuel",
        "ceb": "1 Samuel",
        "cs": "1 Samuel",
        "cy": "1 Samuel",
        "da": "1 Samuel",
        "el": "1 Σαμουήλ",
        "eo": "1 Samuelo",
        "et": "1 Saamuel",
        "eu": "1 Samuel",
        "fi": "1 Samuel",
        "fil": "1 Samuel",
        "ga": "1 Samúéil",
        "gd": "1 Samuel",
        "gl": "1 Samuel",
        "gu": "1 સેમ્યુઅલ",
        "ha": "1 Sama'ila",
        "haw": "1 Samuela",
        "hr": "1. Samuelova",
        "hu": "1 Sámuel",
        "hy": "1 Սամուել",
        "ig": "1 Samuel",
        "is": "1 Samúel",
        "jv": "1 Samuel",
        "ka": "1 სამუელი",
        "kk": "1 Самуил",
        "km": "១ សាំយូអែល",
        "kn": "1 ಸ್ಯಾಮ್ಯುಯೆಲ್",
        "ku": "1 Samûyêl",
        "ky": "1 Шемуел",
        "la": "1 Samuel",
        "lo": "1 ຊາມູເອນ",
        "lt": "1 Samuelis",
        "lv": "1. Samuēls",
        "mg": "1 Samoela",
        "mi": "1 Hamuera",
        "mk": "1 Самоил",
        "ml": "1 സാമുവൽ",
        "mn": "1 Самуел",
        "mr": "1 सॅम्युअल",
        "ms": "1 Samuel",
        "mt": "1 Samwel",
        "my": "၁ရှမွေလ",
        "ne": "१ शमूएल",
        "no": "1 Samuel",
        "ny": "1 Samueli",
        "or": "1 ଶାମୁୟେଲ |",
        "pa": "1 ਸਮੂਏਲ",
        "ps": "1 سموئیل",
        "ro": "1 Samuel",
        "rw": "1 Samweli",
        "sd": "1 سموئيل",
        "si": "1 සැමුවෙල්",
        "sk": "1 Samuel",
        "sl": "1 Samuel",
        "sm": "1 Samuelu",
        "sn": "1 Samueri",
        "so": "1 Samuu'eel",
        "sq": "1 Samuel",
        "sr": "1 Самуел",
        "st": "1 Samuele",
        "su": "1 Samuel",
        "sv": "1 Samuel",
        "sw": "1 Samweli",
        "ta": "1 சாமுவேல்",
        "te": "1 శామ్యూల్",
        "tg": "1 Самуил",
        "th": "1 ซามูเอล",
        "tk": "1 Şamuwel",
        "ug": "1 سامۇئىل",
        "uz": "1 Shomuil",
        "xh": "Eyoku-1 kaSamuweli",
        "yi": "1 שמואל",
        "yo": "1 Samueli",
        "zu": "1 Samuweli"
    },
    "2 Samuel": {
        "bn": "২ শমূয়েল",
        "hi": "2 शमूएल",
        "es": "2 Samuel",
        "ar": "صموئيل الثاني",
        "fr": "2 Samuel",
        "it": "2 Samuele",
        "de": "2. Samuel",
        "ru": "2 Царств",
        "he": "שמואל ב'",
        "ja": "2 サムエル",
        "zh": "2 撒母耳",
        "ko": "사무엘하",
        "pt": "2Samuel",
        "tr": "2 Samuel",
        "id": "2 Samuel",
        "ur": "2 سموئیل",
        "fa": "2 ساموئل",
        "nl": "2 Samuël",
        "pl": "2 Samuela",
        "uk": "2 Самуїла",
        "vi": "2 Sa-mu-ên",
        "af": "2 Samuel",
        "am": "2 ሳሙኤል",
        "as": "২ চমূৱেল",
        "az": "2 Şamuel",
        "be": "2 Самуіла",
        "bg": "2 Царе",
        "bs": "2 Samuel",
        "ca": "2 Samuel",
        "ceb": "2 Samuel",
        "cs": "2 Samuel",
        "cy": "2 Samuel",
        "da": "2 Samuel",
        "el": "2 Σαμουήλ",
        "eo": "2 Samuelo",
        "et": "2 Saamuel",
        "eu": "2 Samuel",
        "fi": "2 Samuel",
        "fil": "2 Samuel",
        "ga": "2 Samúéil",
        "gd": "2 Samuel",
        "gl": "2 Samuel",
        "gu": "2 સેમ્યુઅલ",
        "ha": "2 Sama'ila",
        "haw": "2 Samuela",
        "hr": "2 Samuelova",
        "hu": "2 Sámuel",
        "hy": "2 Սամուել",
        "ig": "2 Samuel",
        "is": "2 Samúel",
        "jv": "2 Samuel",
        "ka": "2 სამუელი",
        "kk": "2 Самуил",
        "km": "២ សាំយូអែល",
        "kn": "2 ಸ್ಯಾಮ್ಯುಯೆಲ್",
        "ku": "2 Samûyêl",
        "ky": "2 Шемуел",
        "la": "2 Samuel",
        "lo": "2 ຊາມູເອນ",
        "lt": "2 Samuelis",
        "lv": "2 Samuēls",
        "mg": "2 Samoela",
        "mi": "2 Hamuera",
        "mk": "2 Самоил",
        "ml": "2 സാമുവൽ",
        "mn": "2 Самуел",
        "mr": "2 सॅम्युअल",
        "ms": "2 Samuel",
        "mt": "2 Samwel",
        "my": "၂ရှမွေလ",
        "ne": "२ शमूएल",
        "no": "2 Samuel",
        "ny": "2 Samueli",
        "or": "2 ଶାମୁୟେଲ",
        "pa": "੨ ਸਮੂਏਲ",
        "ps": "2 سموئیل",
        "ro": "2 Samuel",
        "rw": "2 Samweli",
        "sd": "2 سموئيل",
        "si": "2 සැමුවෙල්",
        "sk": "2 Samuel",
        "sl": "2 Samuel",
        "sm": "2 Samuelu",
        "sn": "2 Samueri",
        "so": "2 Samuu'eel",
        "sq": "2 Samuel",
        "sr": "2 Самуел",
        "st": "2 Samuele",
        "su": "2 Samuel",
        "sv": "2 Samuel",
        "sw": "2 Samweli",
        "ta": "2 சாமுவேல்",
        "te": "2 శామ్యూల్",
        "tg": "2 Самуил",
        "th": "2 ซามูเอล",
        "tk": "2 Şamuwel",
        "ug": "2 سامۇئىل",
        "uz": "2 Shomuil",
        "xh": "Eyesi-2 kaSamuweli",
        "yi": "2 שמואל",
        "yo": "2 Samueli",
        "zu": "2 Samuweli"
    },
    "1 Kings": {
        "bn": "১ রাজাবলি",
        "hi": "1 राजा",
        "es": "1 Reyes",
        "ar": "الملوك الأول",
        "fr": "1 Rois",
        "it": "1 Re",
        "de": "1. Könige",
        "ru": "3 Царств",
        "he": "מלכים א'",
        "ja": "1 キングス",
        "zh": "1 国王",
        "ko": "열왕기상",
        "pt": "1 Reis",
        "tr": "1 Kral",
        "id": "1 Raja",
        "ur": "1 بادشاہ",
        "fa": "1 پادشاهان",
        "nl": "1 Koningen",
        "pl": "1 Królowie",
        "uk": "1 царів",
        "vi": "1 vị vua",
        "af": "1 Konings",
        "am": "1 ነገሥት",
        "as": "১ ৰজাসকল",
        "az": "1 Krallar",
        "be": "1 Каралёў",
        "bg": "1 Царе",
        "bs": "1 Kings",
        "ca": "1 Reis",
        "ceb": "1 Mga Hari",
        "cs": "1 králů",
        "cy": "1 Brenhinoedd",
        "da": "1 Konger",
        "el": "1 Βασιλείς",
        "eo": "1 Reĝoj",
        "et": "1 Kuningad",
        "eu": "1 Erregeak",
        "fi": "1 Kuninkaat",
        "fil": "1 Mga Hari",
        "ga": "1 Ríthe",
        "gd": "1 Righrean",
        "gl": "1 Reis",
        "gu": "1 રાજાઓ",
        "ha": "1 Sarakuna",
        "haw": "1 Na'lii",
        "hr": "1 Kraljevi",
        "hu": "1 Királyok",
        "hy": "1 Թագավորներ",
        "ig": "1 Ndị Eze",
        "is": "1 Konungar",
        "jv": "1 Raja-raja",
        "ka": "1 მეფეები",
        "kk": "1 Патшалар",
        "km": "1 ស្តេច",
        "kn": "1 ರಾಜರು",
        "ku": "1 Kings",
        "ky": "1 Падышалар",
        "la": "1 Kings",
        "lo": "1 ກະສັດ",
        "lt": "1 Karaliai",
        "lv": "1 karaļi",
        "mg": "1 Mpanjaka",
        "mi": "1 Kingi",
        "mk": "1 Кралеви",
        "ml": "1 രാജാക്കന്മാർ",
        "mn": "1 Хаад",
        "mr": "१ राजे",
        "ms": "1 Raja-raja",
        "mt": "1 Slaten",
        "my": "ဘုရင်များ ၁",
        "ne": "१ राजाहरू",
        "no": "1 konger",
        "ny": "1 Mafumu",
        "or": "1 ରାଜା",
        "pa": "੧ਰਾਜੇ",
        "ps": "۱ـ پاچاهان",
        "ro": "1 Regi",
        "rw": "1 Abami",
        "sd": "1 بادشاهن",
        "si": "1 රජවරු",
        "sk": "1 Kráľov",
        "sl": "1 Kralji",
        "sm": "1 Tupu",
        "sn": "1 Madzimambo",
        "so": "1 Boqor",
        "sq": "1 Mbretër",
        "sr": "1 Кингс",
        "st": "1 Marena",
        "su": "1 Raja-raja",
        "sv": "1 kungar",
        "sw": "1 Wafalme",
        "ta": "1 அரசர்கள்",
        "te": "1 రాజులు",
        "tg": "1 Подшоҳон",
        "th": "1 กษัตริย์",
        "tk": "1 Patyşa",
        "ug": "1 پادىشاھ",
        "uz": "1 Shohlar",
        "xh": "Eyoku-1 yooKumkani",
        "yi": "1 מלכים",
        "yo": "1 Ọba",
        "zu": "1 Amakhosi"
    },
    "2 Kings": {
        "bn": "২ রাজাবলি",
        "hi": "2 राजा",
        "es": "2 Reyes",
        "ar": "الملوك الثاني",
        "fr": "2 Rois",
        "it": "2 Re",
        "de": "2. Könige",
        "ru": "4 Царств",
        "he": "מלכים ב'",
        "ja": "2 キングス",
        "zh": "2 国王",
        "ko": "열왕기하",
        "pt": "2 Reis",
        "tr": "2 Kral",
        "id": "2 Raja",
        "ur": "2 بادشاہ",
        "fa": "2 پادشاه",
        "nl": "2 koningen",
        "pl": "2 Królowie",
        "uk": "2 Царів",
        "vi": "2 vị vua",
        "af": "2 Konings",
        "am": "2 ነገሥት",
        "as": "২ ৰজাসকল",
        "az": "2 Kral",
        "be": "2 Каралёў",
        "bg": "2 Царе",
        "bs": "2 Kings",
        "ca": "2 Reis",
        "ceb": "2 Mga Hari",
        "cs": "2 králové",
        "cy": "2 Brenhin",
        "da": "2 Konger",
        "el": "2 Βασιλιάδες",
        "eo": "2 Reĝoj",
        "et": "2 kuningat",
        "eu": "2 Erregeak",
        "fi": "2 kuningasta",
        "fil": "2 Hari",
        "ga": "2 Ríthe",
        "gd": "2 Righ",
        "gl": "2 Reis",
        "gu": "2 રાજાઓ",
        "ha": "2 Sarakuna",
        "haw": "2 Na'lii",
        "hr": "2 Kralja",
        "hu": "2 király",
        "hy": "2 Թագավորներ",
        "ig": "2 Ndị eze",
        "is": "2 konungar",
        "jv": "2 Raja",
        "ka": "2 მეფე",
        "kk": "2 патша",
        "km": "2 ស្តេច",
        "kn": "2 ರಾಜರು",
        "ku": "2 Padîşah",
        "ky": "2 Падышалар",
        "la": "2 Kings",
        "lo": "2 ກະສັດ",
        "lt": "2 karaliai",
        "lv": "2 karaļi",
        "mg": "2 Mpanjaka",
        "mi": "2 Kingi",
        "mk": "2 Кралеви",
        "ml": "2 രാജാക്കന്മാർ",
        "mn": "2 Хаад",
        "mr": "2 राजे",
        "ms": "2 Raja-raja",
        "mt": "2 Slaten",
        "my": "၂ ဘုရင်များ",
        "ne": "२ राजाहरू",
        "no": "2 konger",
        "ny": "2 Mafumu",
        "or": "2 ରାଜା",
        "pa": "੨ਰਾਜੇ",
        "ps": "۲ـ پاچاهان",
        "ro": "2 Regi",
        "rw": "2 Abami",
        "sd": "2 بادشاهن",
        "si": "2 රජවරු",
        "sk": "2 králi",
        "sl": "2 kralja",
        "sm": "2 Tupu",
        "sn": "2 Madzimambo",
        "so": "2 Boqor",
        "sq": "2 Mbretër",
        "sr": "2 Кингс",
        "st": "2 Marena",
        "su": "2 Raja-raja",
        "sv": "2 kungar",
        "sw": "2 Wafalme",
        "ta": "2 அரசர்கள்",
        "te": "2 రాజులు",
        "tg": "2 Подшоҳон",
        "th": "2 กษัตริย์",
        "tk": "2 Patyşa",
        "ug": "2 پادىشاھ",
        "uz": "2 Shoh",
        "xh": "Eyesi-2 yooKumkani",
        "yi": "2 מלכים",
        "yo": "2 Ọba",
        "zu": "2 Amakhosi"
    },
    "1 Chronicles": {
        "bn": "১ বংশাবলি",
        "hi": "1 इतिहास",
        "es": "1 Crónicas",
        "ar": "أخبار الأيام الأول",
        "fr": "1 Chroniques",
        "it": "1 Cronache",
        "de": "1. Chronik",
        "ru": "1 Паралипоменон",
        "he": "דברי הימים א'",
        "ja": "1 年代記",
        "zh": "1 编年史",
        "ko": "역대상",
        "pt": "1 Crônicas",
        "tr": "1 Günlük",
        "id": "1 Tawarikh",
        "ur": "1 تواریخ",
        "fa": "1 تواریخ",
        "nl": "1 Kronieken",
        "pl": "1 Kroniki",
        "uk": "1 Хроніки",
        "vi": "1 Biên niên sử",
        "af": "1 Kronieke",
        "am": "1ኛ ዜና መዋዕል",
        "as": "১ বংশাৱলী",
        "az": "1 Salnamələr",
        "be": "1 хронікі",
        "bg": "1 Летописи",
        "bs": "1 Chronicles",
        "ca": "1 Cròniques",
        "ceb": "1 Cronicas",
        "cs": "1 Kroniky",
        "cy": "1 Cronicl",
        "da": "1 Krøniker",
        "el": "1 Χρονικά",
        "eo": "1 Kronikoj",
        "et": "1 Kroonika",
        "eu": "1 Kronikak",
        "fi": "1 Chronicles",
        "fil": "1 Cronica",
        "ga": "1 Chronicles",
        "gd": "1 Eachdraidh",
        "gl": "1 Crónicas",
        "gu": "1 ક્રોનિકલ્સ",
        "ha": "1 Labari",
        "haw": "1 Nalii",
        "hr": "1 Ljetopisa",
        "hu": "1 Krónikák",
        "hy": "1 Տարեգրություններ",
        "ig": "1 Ihe E Mere",
        "is": "1 Annáll",
        "jv": "1 Babad",
        "ka": "1 ქრონიკები",
        "kk": "1 Шежірелер",
        "km": "១ របាក្សត្រ",
        "kn": "1 ಕ್ರಾನಿಕಲ್ಸ್",
        "ku": "1 Dîrok",
        "ky": "1 Жылнаама",
        "la": "1 Chronicles",
        "lo": "1 ພົງສາວະດານ",
        "lt": "1 Kronikos",
        "lv": "1 Hronikas",
        "mg": "1 Tantara",
        "mi": "1 Chronicles",
        "mk": "1 Летописи",
        "ml": "1 ദിനവൃത്താന്തങ്ങൾ",
        "mn": "1 Шастир",
        "mr": "1 इतिहास",
        "ms": "1 Tawarikh",
        "mt": "1 Kronaki",
        "my": "ရာဇဝင်ချုပ် ၁",
        "ne": "१ इतिहास",
        "no": "1 Krøniker",
        "ny": "1 Mbiri",
        "or": "1 ଇତିହାସ",
        "pa": "1 ਇਤਹਾਸ",
        "ps": "1 تاریخونه",
        "ro": "1 Cronici",
        "rw": "1 Ngoma",
        "sd": "1 تاريخ",
        "si": "1 වංශකථා",
        "sk": "1 Kroniky",
        "sl": "1 Kronike",
        "sm": "1 Nofoaiga a Tupu",
        "sn": "1 Makoronike",
        "so": "1 Taariikhdii",
        "sq": "1 Kronikat",
        "sr": "1 Цхроницлес",
        "st": "1 Likronike",
        "su": "1 Babad",
        "sv": "1 Krönika",
        "sw": "1 Mambo ya Nyakati",
        "ta": "1 நாளாகமம்",
        "te": "1 క్రానికల్స్",
        "tg": "1 Вақоеънома",
        "th": "1 พงศาวดาร",
        "tk": "1 Chroniclesazgylar",
        "ug": "1 Chronicles",
        "uz": "1 Solnomalar",
        "xh": "Eyoku-1 yeziKronike",
        "yi": "1 טשראָניקלעס",
        "yo": "1 Kronika",
        "zu": "1 IziKronike"
    },
    "2 Chronicles": {
        "bn": "২ বংশাবলি",
        "hi": "2 इतिहास",
        "es": "2 Crónicas",
        "ar": "أخبار الأيام الثاني",
        "fr": "2 Chroniques",
        "it": "2 Cronache",
        "de": "2. Chronik",
        "ru": "2 Паралипоменон",
        "he": "דברי הימים ב'",
        "ja": "2 クロニクル",
        "zh": "2 编年史",
        "ko": "역대하",
        "pt": "2 Crônicas",
        "tr": "2 Günlük",
        "id": "2 Tawarikh",
        "ur": "2 تواریخ",
        "fa": "2 تواریخ",
        "nl": "2 Kronieken",
        "pl": "2 Kroniki",
        "uk": "2 Хроніки",
        "vi": "2 Biên niên sử",
        "af": "2 Kronieke",
        "am": "2ኛ ዜና መዋዕል",
        "as": "২ বংশাৱলি",
        "az": "2 Salnamələr",
        "be": "2 хронікі",
        "bg": "2 Летописи",
        "bs": "2 Chronicles",
        "ca": "2 Cròniques",
        "ceb": "2 Cronicas",
        "cs": "2 kroniky",
        "cy": "2 Cronicl",
        "da": "2 Krøniker",
        "el": "2 Χρονικά",
        "eo": "2 Kronikoj",
        "et": "2 kroonikat",
        "eu": "2 Kronikak",
        "fi": "2 Chronicles",
        "fil": "2 Cronica",
        "ga": "2 Chronicles",
        "gd": "2 Eachdraidh",
        "gl": "2 Crónicas",
        "gu": "2 ક્રોનિકલ્સ",
        "ha": "2 Labari",
        "haw": "2 Nalii",
        "hr": "2 Ljetopisa",
        "hu": "2 Krónikák",
        "hy": "2 Տարեգրություններ",
        "ig": "2 Ihe E Mere",
        "is": "2 Annáll",
        "jv": "2 Babad",
        "ka": "2 ქრონიკები",
        "kk": "2 Шежірелер",
        "km": "2 របាក្សត្រ",
        "kn": "2 ಕ್ರಾನಿಕಲ್ಸ್",
        "ku": "2 Dîrok",
        "ky": "2 Жылнаама",
        "la": "II Paralipomenon",
        "lo": "2 ພົງສາວະດານ",
        "lt": "2 kronikos",
        "lv": "2 hronikas",
        "mg": "2 Tantara",
        "mi": "2 Paraleipomeno",
        "mk": "2 Летописи",
        "ml": "2 ദിനവൃത്താന്തങ്ങൾ",
        "mn": "2 Шастир",
        "mr": "2 इतिहास",
        "ms": "2 Tawarikh",
        "mt": "2 Kronaki",
        "my": "၂ ရာဇဝင်ချုပ်",
        "ne": "२ इतिहास",
        "no": "2 Krøniker",
        "ny": "2 Mbiri",
        "or": "2 ଇତିହାସ",
        "pa": "੨ ਇਤਹਾਸ",
        "ps": "2 تاریخونه",
        "ro": "2 Cronici",
        "rw": "2 Ngoma",
        "sd": "2 تاريخون",
        "si": "2 වංශකථා",
        "sk": "2 Kroniky",
        "sl": "2 Kronike",
        "sm": "2 Nofoaiga a Tupu",
        "sn": "2 Makoronike",
        "so": "2 Taariikhdii",
        "sq": "2 Kronika",
        "sr": "2 Цхроницлес",
        "st": "2 Likronike",
        "su": "2 Babad",
        "sv": "2 Krönikor",
        "sw": "2 Mambo ya Nyakati",
        "ta": "2 நாளாகமம்",
        "te": "2 క్రానికల్స్",
        "tg": "2 Вақоеънома",
        "th": "2 พงศาวดาร",
        "tk": "2 Chroniclesazgylar",
        "ug": "2 Chronicles",
        "uz": "2 Solnomalar",
        "xh": "Eyesi-2 yeziKronike",
        "yi": "2 טשראָניקלעס",
        "yo": "2 Kíróníkà",
        "zu": "2 IziKronike"
    },
    "Ezra": {
        "bn": "ইষ্রা",
        "hi": "एज्रा",
        "es": "Esdras",
        "ar": "عزرا",
        "fr": "Esdras",
        "it": "Esdra",
        "de": "Esra",
        "ru": "Ездра",
        "he": "עזרא",
        "ja": "エズラ",
        "zh": "以斯拉",
        "ko": "에스라",
        "pt": "Esdras",
        "tr": "Ezra",
        "id": "Ezra",
        "ur": "عذرا",
        "fa": "عزرا",
        "nl": "Esra",
        "pl": "Ezra",
        "uk": "Езра",
        "vi": "Ezra",
        "af": "Esra",
        "am": "ዕዝራ",
        "as": "এজ্ৰা",
        "az": "Ezra",
        "be": "Эзра",
        "bg": "Езра",
        "bs": "Ezra",
        "ca": "Esdras",
        "ceb": "Esdras",
        "cs": "Ezra",
        "cy": "Esra",
        "da": "Ezra",
        "el": "Έζρα",
        "eo": "Ezra",
        "et": "Esra",
        "eu": "Esdras",
        "fi": "Ezra",
        "fil": "Ezra",
        "ga": "Ezra",
        "gd": "Ezra",
        "gl": "Esdras",
        "gu": "એઝરા",
        "ha": "Ezra",
        "haw": "Ezera",
        "hr": "Ezra",
        "hu": "Ezra",
        "hy": "Եզրաս",
        "ig": "Ezra",
        "is": "Esra",
        "jv": "Ezra",
        "ka": "ეზრა",
        "kk": "Эзра",
        "km": "អែសរ៉ា",
        "kn": "ಎಜ್ರಾ",
        "ku": "Ezraîl",
        "ky": "Эзра",
        "la": "Esdrae",
        "lo": "ເອຊະຣາ",
        "lt": "Ezra",
        "lv": "Ezra",
        "mg": "Ezra",
        "mi": "Etera",
        "mk": "Езра",
        "ml": "എസ്ര",
        "mn": "Эзра",
        "mr": "एज्रा",
        "ms": "Ezra",
        "mt": "Esdra",
        "my": "ဧဇရ",
        "ne": "एज्रा",
        "no": "Ezra",
        "ny": "Ezara",
        "or": "ଏଜ୍ରା",
        "pa": "ਅਜ਼ਰਾ",
        "ps": "عزرا",
        "ro": "Ezra",
        "rw": "Ezira",
        "sd": "عزرا",
        "si": "එස්රා",
        "sk": "Ezra",
        "sl": "Ezra",
        "sm": "Esera",
        "sn": "Ezra",
        "so": "Cesraa",
        "sq": "Ezdra",
        "sr": "Езра",
        "st": "Esdrase",
        "su": "Ezra",
        "sv": "Ezra",
        "sw": "Ezra",
        "ta": "எஸ்ரா",
        "te": "ఎజ్రా",
        "tg": "Эзра",
        "th": "เอซรา",
        "tk": "Ezra",
        "ug": "ئەزرا",
        "uz": "Ezra",
        "xh": "Ezra",
        "yi": "עזרא",
        "yo": "Esra",
        "zu": "Ezra"
    },
    "Nehemiah": {
        "bn": "নহিমিয়",
        "hi": "नहेमायाह",
        "es": "Nehemías",
        "ar": "نحميا",
        "fr": "Néhémie",
        "it": "Neemia",
        "de": "Nehemia",
        "ru": "Неемия",
        "he": "נחמיה",
        "ja": "ネヘミヤ",
        "zh": "尼希米记",
        "ko": "느헤미야",
        "pt": "Neemias",
        "tr": "Nehemya",
        "id": "Nehemia",
        "ur": "نحمیاہ",
        "fa": "نحمیا",
        "nl": "Nehemia",
        "pl": "Nehemiasz",
        "uk": "Неемія",
        "vi": "Nê-hê-mi",
        "af": "Nehemia",
        "am": "ነህምያ",
        "as": "নহিমিয়া",
        "az": "Nehemya",
        "be": "Нээмія",
        "bg": "Неемия",
        "bs": "Nehemija",
        "ca": "Nehemies",
        "ceb": "Nehemias",
        "cs": "Nehemiáš",
        "cy": "Nehemeia",
        "da": "Nehemias",
        "el": "Ο Νεεμίας",
        "eo": "Neĥemja",
        "et": "Nehemja",
        "eu": "Nehemias",
        "fi": "Nehemia",
        "fil": "Nehemias",
        "ga": "Nehemiah",
        "gd": "Nehemiah",
        "gl": "Nehemías",
        "gu": "નહેમ્યાહ",
        "ha": "Nehemiah",
        "haw": "Nehemia",
        "hr": "Nehemija",
        "hu": "Nehémiás",
        "hy": "Նեեմիա",
        "ig": "Nehemaịa",
        "is": "Nehemía",
        "jv": "Nehemiah",
        "ka": "ნეემია",
        "kk": "Нехемия",
        "km": "នេហេមា",
        "kn": "ನೆಹೆಮಿಯಾ",
        "ku": "Nehemiah",
        "ky": "Некемия",
        "la": "Nehemiah",
        "lo": "ເນເຫມີຢາ",
        "lt": "Nehemijas",
        "lv": "Nehemija",
        "mg": "Nehemia",
        "mi": "Nehemia",
        "mk": "Неемија",
        "ml": "നെഹെമിയ",
        "mn": "Нехемиа",
        "mr": "नेहेम्या",
        "ms": "Nehemia",
        "mt": "Neħemija",
        "my": "နေဟမိ",
        "ne": "नेहेम्याह",
        "no": "Nehemja",
        "ny": "Nehemiya",
        "or": "ନିହିମିୟା",
        "pa": "ਨਹਮਯਾਹ",
        "ps": "نحمیا",
        "ro": "Neemia",
        "rw": "Nehemiya",
        "sd": "نحميا",
        "si": "නෙහෙමියා",
        "sk": "Nehemiáš",
        "sl": "Nehemija",
        "sm": "Neemia",
        "sn": "Nehemia",
        "so": "Nexemyaah",
        "sq": "Nehemia",
        "sr": "Нехемија",
        "st": "Nehemia",
        "su": "Nehemiah",
        "sv": "Nehemja",
        "sw": "Nehemia",
        "ta": "நெகேமியா",
        "te": "నెహెమ్యా",
        "tg": "Наҳемё",
        "th": "เนหะมีย์",
        "tk": "Nehemýa",
        "ug": "Nehemiah",
        "uz": "Naximiyo",
        "xh": "UNehemiya",
        "yi": "נחמיה",
        "yo": "Nehemáyà",
        "zu": "UNehemiya"
    },
    "Esther": {
        "bn": "ইষ্টের",
        "hi": "एस्तेर",
        "es": "Ester",
        "ar": "أستير",
        "fr": "Esther",
        "it": "Ester",
        "de": "Ester",
        "ru": "Есфирь",
        "he": "אסתר",
        "ja": "エスター",
        "zh": "以斯帖",
        "ko": "에스더",
        "pt": "Ester",
        "tr": "Ester",
        "id": "Ester",
        "ur": "ایسٹر",
        "fa": "استر",
        "nl": "Ester",
        "pl": "Estera",
        "uk": "Естер",
        "vi": "Esther",
        "af": "Ester",
        "am": "አስቴር",
        "as": "এষ্টাৰ",
        "az": "Ester",
        "be": "Эстэр",
        "bg": "Естер",
        "bs": "Esther",
        "ca": "Esther",
        "ceb": "Si Ester",
        "cs": "Esther",
        "cy": "Esther",
        "da": "Esther",
        "el": "Εσθήρ",
        "eo": "Ester",
        "et": "Esther",
        "eu": "Esther",
        "fi": "Esther",
        "fil": "Esther",
        "ga": "Eistir",
        "gd": "Ester",
        "gl": "Esther",
        "gu": "એસ્થર",
        "ha": "Esther",
        "haw": "ʻo ʻEsetera",
        "hr": "Esther",
        "hu": "Eszter",
        "hy": "Եսթեր",
        "ig": "Esta",
        "is": "Esther",
        "jv": "Ester",
        "ka": "ესთერი",
        "kk": "Естер",
        "km": "អេសធើរ",
        "kn": "ಎಸ್ತರ್",
        "ku": "Esther",
        "ky": "Эстер",
        "la": "Esther",
        "lo": "ເອສເທີ",
        "lt": "Estera",
        "lv": "Estere",
        "mg": "Estera",
        "mi": "Ehetere",
        "mk": "Естер",
        "ml": "എസ്തർ",
        "mn": "Эстер",
        "mr": "एस्तेर",
        "ms": "Ester",
        "mt": "Esther",
        "my": "ဧသတာ",
        "ne": "एस्तर",
        "no": "Esther",
        "ny": "Esther",
        "or": "ଏଷ୍ଟର",
        "pa": "ਅਸਤਰ",
        "ps": "ایستر",
        "ro": "Esther",
        "rw": "Esiteri",
        "sd": "ايستر",
        "si": "එස්තර්",
        "sk": "Esther",
        "sl": "Esther",
        "sm": "Eseta",
        "sn": "Esther",
        "so": "Esther",
        "sq": "Estera",
        "sr": "Естхер",
        "st": "Esthere",
        "su": "Éster",
        "sv": "Esther",
        "sw": "Esta",
        "ta": "எஸ்தர்",
        "te": "ఎస్తేర్",
        "tg": "Эстер",
        "th": "เอสเธอร์",
        "tk": "Ester",
        "ug": "ئەستىر",
        "uz": "Ester",
        "xh": "UEstere",
        "yi": "אסתר",
        "yo": "Esteri",
        "zu": "Esteri"
    },
    "Job": {
        "bn": "ইয়োব",
        "hi": "अय्यूब",
        "es": "Job",
        "ar": "أيوب",
        "fr": "Job",
        "it": "Giobbe",
        "de": "Hiob",
        "ru": "Иов",
        "he": "איוב",
        "ja": "仕事",
        "zh": "工作",
        "ko": "직업",
        "pt": "Trabalho",
        "tr": "İş",
        "id": "Pekerjaan",
        "ur": "جاب",
        "fa": "شغل",
        "nl": "Baan",
        "pl": "Praca",
        "uk": "Робота",
        "vi": "Công việc",
        "af": "Job",
        "am": "ኢዮብ",
        "as": "চাকৰি",
        "az": "İş",
        "be": "Праца",
        "bg": "работа",
        "bs": "Posao",
        "ca": "Treball",
        "ceb": "Job",
        "cs": "práce",
        "cy": "Job",
        "da": "Job",
        "el": "Εργασία",
        "eo": "Ijob",
        "et": "Töö",
        "eu": "Lanpostua",
        "fi": "Työ",
        "fil": "Trabaho",
        "ga": "Jab",
        "gd": "Iob",
        "gl": "Traballo",
        "gu": "જોબ",
        "ha": "Ayuba",
        "haw": "Job",
        "hr": "posao",
        "hu": "Job",
        "hy": "Աշխատանք",
        "ig": "Job",
        "is": "Job",
        "jv": "Ayub",
        "ka": "სამსახური",
        "kk": "Жұмыс",
        "km": "ការងារ",
        "kn": "ಉದ್ಯೋಗ",
        "ku": "Job",
        "ky": "Job",
        "la": "Job",
        "lo": "ວຽກ",
        "lt": "Darbas",
        "lv": "Darbs",
        "mg": "Job",
        "mi": "Hopa",
        "mk": "Работа",
        "ml": "ജോലി",
        "mn": "Ажил",
        "mr": "नोकरी",
        "ms": "Kerja",
        "mt": "Job",
        "my": "အလုပ်",
        "ne": "जागिर",
        "no": "Job",
        "ny": "Job",
        "or": "ଚାକିରି",
        "pa": "ਨੌਕਰੀ",
        "ps": "دنده",
        "ro": "Iov",
        "rw": "Akazi",
        "sd": "نوڪري",
        "si": "රැකියාව",
        "sk": "Job",
        "sl": "delo",
        "sm": "Iopu",
        "sn": "Job",
        "so": "Ayuub",
        "sq": "Punë",
        "sr": "Јоб",
        "st": "Mosebetsi",
        "su": "Pakasaban",
        "sv": "Jobb",
        "sw": "Kazi",
        "ta": "வேலை",
        "te": "ఉద్యోగం",
        "tg": "Кор",
        "th": "งาน",
        "tk": "Iş",
        "ug": "Job",
        "uz": "Ish",
        "xh": "Umsebenzi",
        "yi": "אַרבעט",
        "yo": "Job",
        "zu": "Umsebenzi"
    },
    "Ecclesiastes": {
        "bn": "উপদেশক",
        "hi": "सभोपदेशक",
        "es": "Eclesiastés",
        "ar": "الجامعة",
        "fr": "Ecclésiaste",
        "it": "Ecclesiaste",
        "de": "Prediger",
        "ru": "Екклесиаст",
        "he": "קהלת",
        "ja": "伝道者の書",
        "zh": "传道书",
        "ko": "전도서",
        "pt": "Eclesiastes",
        "tr": "Vaizler",
        "id": "Pengkhotbah",
        "ur": "واعظ",
        "fa": "جامعه",
        "nl": "Prediker",
        "pl": "Kaznodziei",
        "uk": "Еклезіаст",
        "vi": "truyền đạo",
        "af": "Prediker",
        "am": "መክብብ",
        "as": "উপদেশক",
        "az": "Vaiz",
        "be": "Эклезіяст",
        "bg": "Еклисиаст",
        "bs": "Ecclesiastes",
        "ca": "Eclesiastés",
        "ceb": "Ecclesiastes",
        "cs": "Kazatel",
        "cy": "Pregethwr",
        "da": "Prædikeren",
        "el": "Εκκλησιαστής",
        "eo": "Eklezio",
        "et": "Koguja",
        "eu": "Eklesiastes",
        "fi": "Ecclesiastes",
        "fil": "Eclesiastes",
        "ga": "Eaglasta",
        "gd": "Ecclesiastes",
        "gl": "Eclesiastés",
        "gu": "સભાશિક્ષક",
        "ha": "Mai-Wa’azi",
        "haw": "Eclesiastes",
        "hr": "Propovjednik",
        "hu": "Prédikátor",
        "hy": "Ժողովող",
        "ig": "Eklisiastis",
        "is": "Prédikarinn",
        "jv": "Kohelet",
        "ka": "ეკლესიასტე",
        "kk": "Екклесиаст",
        "km": "សាស្ដា",
        "kn": "ಪ್ರಸಂಗಿ",
        "ku": "Ecclesiastes",
        "ky": "Насаатчы",
        "la": "Ecclesiastes",
        "lo": "ສາດສະດາ",
        "lt": "Ekleziastas",
        "lv": "Mācītājs",
        "mg": "Mpitoriteny",
        "mi": "Koheleta",
        "mk": "Проповедник",
        "ml": "സഭാപ്രസംഗി",
        "mn": "Номлогч",
        "mr": "उपदेशक",
        "ms": "Pengkhotbah",
        "mt": "Ekkleżjasti",
        "my": "ဒေသနာ",
        "ne": "उपदेशक",
        "no": "Predikeren",
        "ny": "Mlaliki",
        "or": "ଉପଦେଶକ",
        "pa": "ਉਪਦੇਸ਼ਕ",
        "ps": "اکسوس",
        "ro": "Eclesiastul",
        "rw": "Umubwiriza",
        "sd": "اُچارڻ",
        "si": "දේශනාකාරයා",
        "sk": "Kazateľ",
        "sl": "Pridigar",
        "sm": "Failauga",
        "sn": "Muparidzi",
        "so": "Wacdiyayaal",
        "sq": "Eklisiastiu",
        "sr": "Еццлесиастес",
        "st": "Moeklesia",
        "su": "Pandita",
        "sv": "Predikaren",
        "sw": "Mhubiri",
        "ta": "பிரசங்கம்",
        "te": "ప్రసంగీకులు",
        "tg": "Воиз",
        "th": "ปัญญาจารย์",
        "tk": "Wagyz kitaby",
        "ug": "Ecclesiastes",
        "uz": "Voizlar",
        "xh": "INtshumayeli",
        "yi": "קהלת",
        "yo": "Oniwasu",
        "zu": "UmShumayeli"
    },
    "Song of Solomon": {
        "bn": "পরমগীত",
        "hi": "श्रेष्ठगीत",
        "es": "Cantares",
        "ar": "نشيد الأنشاد",
        "fr": "Cantique des Cantiques",
        "it": "Cantico dei Cantici",
        "de": "Hohelied",
        "ru": "Песнь Песней",
        "he": "שיר השירים",
        "ja": "ソロモンの歌",
        "zh": "所罗门之歌",
        "ko": "솔로몬의 노래",
        "pt": "Cântico de Salomão",
        "tr": "Süleyman'ın Şarkısı",
        "id": "Nyanyian Sulaiman",
        "ur": "سلیمان کا گانا",
        "fa": "آهنگ سلیمان",
        "nl": "Lied van Salomon",
        "pl": "Pieśń Salomona",
        "uk": "Пісня Соломона",
        "vi": "Bài hát của Solomon",
        "af": "Lied van Salomo",
        "am": "መኃልየ መኃልይ ዘሰሎሞን",
        "as": "চলোমনৰ গীত",
        "az": "Süleymanın mahnısı",
        "be": "Песня Саламона",
        "bg": "Песен на Соломон",
        "bs": "Solomonova pjesma",
        "ca": "Càntic de Salomó",
        "ceb": "Awit ni Solomon",
        "cs": "Píseň Šalomounova",
        "cy": "Caniad Solomon",
        "da": "Salomons sang",
        "el": "Το τραγούδι του Σολομώντα",
        "eo": "Kanto de Salomono",
        "et": "Saalomoni laul",
        "eu": "Salomonen Kantua",
        "fi": "Salomon laulu",
        "fil": "Awit ni Solomon",
        "ga": "Amhrán Sholamón",
        "gd": "Òran Sholaimh",
        "gl": "Cantar de Salomón",
        "gu": "સોલોમનનું ગીત",
        "ha": "Waƙar Sulemanu",
        "haw": "Mele a Solomona",
        "hr": "Salomonova pjesma",
        "hu": "Salamon éneke",
        "hy": "Սողոմոնի երգը",
        "ig": "Abụ Sọlọmọn",
        "is": "Söngur Salómons",
        "jv": "Kidung Suleman",
        "ka": "სოლომონის სიმღერა",
        "kk": "Сүлейменнің әні",
        "km": "ចម្រៀងសាឡូម៉ូន",
        "kn": "ಸೊಲೊಮನ್ ಹಾಡು",
        "ku": "Strana Silêman",
        "ky": "Сулаймандын ыры",
        "la": "Canticum Salomonis",
        "lo": "ເພງຂອງຊາໂລໂມນ",
        "lt": "Saliamono giesmė",
        "lv": "Zālamana dziesma",
        "mg": "Tonon-kiran’i Solomona",
        "mi": "Waiata a Horomona",
        "mk": "Соломонска песна",
        "ml": "സോളമൻ്റെ ഗാനം",
        "mn": "Соломоны дуу",
        "mr": "सॉलोमनचे गाणे",
        "ms": "Nyanyian Sulaiman",
        "mt": "L-Għanja ta’ Salamun",
        "my": "ရှောလမုန်သီချင်း",
        "ne": "सोलोमनको गीत",
        "no": "Salomos sang",
        "ny": "Nyimbo ya Solomo",
        "or": "ଶଲୋମନଙ୍କ ଗୀତ",
        "pa": "ਸੁਲੇਮਾਨ ਦਾ ਗੀਤ",
        "ps": "د سلیمان سندره",
        "ro": "Cântarea lui Solomon",
        "rw": "Indirimbo ya Salomo",
        "sd": "سليمان جو گيت",
        "si": "සලමොන්ගේ ගීතය",
        "sk": "Pieseň Šalamúnova",
        "sl": "Salomonova pesem",
        "sm": "Pese a Solomona",
        "sn": "Rwiyo rwaSoromoni",
        "so": "Gabaygii Sulaymaan",
        "sq": "Kënga e Solomonit",
        "sr": "Песма Соломонова",
        "st": "Sefela sa Lifela",
        "su": "Song of Solomon",
        "sv": "Salomos sång",
        "sw": "Wimbo wa Sulemani",
        "ta": "சாலமன் பாடல்",
        "te": "సోలమన్ పాట",
        "tg": "Суруди Сулаймон",
        "th": "บทเพลงของโซโลมอน",
        "tk": "Süleýmanyň aýdymy",
        "ug": "سۇلايماننىڭ ناخشىسى",
        "uz": "Sulaymon qo'shig'i",
        "xh": "INgoma yazo iiNgoma",
        "yi": "געזאַנג פון שלמה",
        "yo": "Orin Solomoni",
        "zu": "Isihlabelelo Sezihlabelelo"
    },
    "Isaiah": {
        "bn": "যিশাইয়",
        "hi": "यशायाह",
        "es": "Isaías",
        "ar": "إشعياء",
        "fr": "Ésaïe",
        "it": "Isaia",
        "de": "Jesaja",
        "ru": "Исаия",
        "he": "ישעיהו",
        "ja": "イザヤ書",
        "zh": "以赛亚",
        "ko": "이사야",
        "pt": "Isaías",
        "tr": "İşaya",
        "id": "Yesaya",
        "ur": "یسعیاہ",
        "fa": "اشعیا",
        "nl": "Jesaja",
        "pl": "Izajasz",
        "uk": "Ісая",
        "vi": "Ê-sai",
        "af": "Jesaja",
        "am": "ኢሳያስ",
        "as": "যিচয়া",
        "az": "Yeşaya",
        "be": "Ісая",
        "bg": "Исая",
        "bs": "Isaiah",
        "ca": "Isaïes",
        "ceb": "Isaias",
        "cs": "Izajáš",
        "cy": "Eseia",
        "da": "Esajas",
        "el": "Ο Ησαΐας",
        "eo": "Jesaja",
        "et": "Jesaja",
        "eu": "Isaias",
        "fi": "Isaiah",
        "fil": "Isaiah",
        "ga": "Íseáia",
        "gd": "Isaiah",
        "gl": "Isaías",
        "gu": "યશાયાહ",
        "ha": "Ishaya",
        "haw": "Isaia",
        "hr": "Izaije",
        "hu": "Isaiah",
        "hy": "Եսայիա",
        "ig": "Aisaia",
        "is": "Jesaja",
        "jv": "Yesaya",
        "ka": "ესაია",
        "kk": "Исайя",
        "km": "អេសាយ",
        "kn": "ಯೆಶಾಯ",
        "ku": "Îşaya",
        "ky": "Исайа",
        "la": "Isaias",
        "lo": "ເອຊາຢາ",
        "lt": "Izaijas",
        "lv": "Jesaja",
        "mg": "Isaia",
        "mi": "Ihaia",
        "mk": "Исаија",
        "ml": "യെശയ്യാവ്",
        "mn": "Исаиа",
        "mr": "यशया",
        "ms": "Yesaya",
        "mt": "Isaija",
        "my": "ဟေရှာယ",
        "ne": "यशैया",
        "no": "Jesaja",
        "ny": "Yesaya",
        "or": "ଯିଶାଇୟ |",
        "pa": "ਯਸਾਯਾਹ",
        "ps": "عیسا",
        "ro": "Isaia",
        "rw": "Yesaya",
        "sd": "يسعياه",
        "si": "යෙසායා",
        "sk": "Izaiáš",
        "sl": "Izaija",
        "sm": "Isaia",
        "sn": "Isaya",
        "so": "Ishacyaah",
        "sq": "Isaia",
        "sr": "Исаија",
        "st": "Esaia",
        "su": "Yesaya",
        "sv": "Jesaja",
        "sw": "Isaya",
        "ta": "ஏசாயா",
        "te": "యేసయ్యా",
        "tg": "Ишаъё",
        "th": "อิสยาห์",
        "tk": "Işaýa",
        "ug": "يەشايا",
        "uz": "Ishayo",
        "xh": "uIsaya",
        "yi": "ישעיהו",
        "yo": "Isaiah",
        "zu": "Isaya"
    },
    "Jeremiah": {
        "bn": "যিরমিয়",
        "hi": "यिर्मयाह",
        "es": "Jeremías",
        "ar": "إرميا",
        "fr": "Jérémie",
        "it": "Geremia",
        "de": "Jeremia",
        "ru": "Иеремия",
        "he": "ירמיהו",
        "ja": "エレミヤ",
        "zh": "耶利米",
        "ko": "예레미야",
        "pt": "Jeremias",
        "tr": "Yeremya",
        "id": "Yeremia",
        "ur": "یرمیاہ",
        "fa": "ارمیا",
        "nl": "Jeremia",
        "pl": "Jeremiasz",
        "uk": "Єремія",
        "vi": "Giê-rê-mi",
        "af": "Jeremia",
        "am": "ኤርምያስ",
        "as": "যিৰিমিয়া",
        "az": "Yeremya",
        "be": "Ерамія",
        "bg": "Еремия",
        "bs": "Jeremiah",
        "ca": "Jeremies",
        "ceb": "Jeremias",
        "cs": "Jeremiáš",
        "cy": "Jeremeia",
        "da": "Jeremias",
        "el": "Ιερεμίας",
        "eo": "Jeremia",
        "et": "Jeremija",
        "eu": "Jeremias",
        "fi": "Jeremiah",
        "fil": "Jeremiah",
        "ga": "Ieremiah",
        "gd": "Ieremiah",
        "gl": "Xeremías",
        "gu": "યર્મિયા",
        "ha": "Irmiya",
        "haw": "Ieremia",
        "hr": "Jeremija",
        "hu": "Jeremiás",
        "hy": "Երեմիա",
        "ig": "Jeremaya",
        "is": "Jeremía",
        "jv": "Yeremia",
        "ka": "იერემია",
        "kk": "Еремия",
        "km": "យេរេមា",
        "kn": "ಜೆರೆಮಿಯಾ",
        "ku": "Jeremiah",
        "ky": "Жеремия",
        "la": "Jeremias",
        "lo": "ເຢເຣມີຢາ",
        "lt": "Jeremijas",
        "lv": "Jeremija",
        "mg": "Jeremia",
        "mi": "Heremaia",
        "mk": "Еремија",
        "ml": "ജെറമിയ",
        "mn": "Иеремиа",
        "mr": "यिर्मया",
        "ms": "Yeremia",
        "mt": "Ġeremija",
        "my": "ယေရမိ",
        "ne": "यर्मिया",
        "no": "Jeremia",
        "ny": "Yeremiya",
        "or": "ଯିରିମିୟ",
        "pa": "ਯਿਰਮਿਯਾਹ",
        "ps": "یرمیاه",
        "ro": "Ieremia",
        "rw": "Yeremiya",
        "sd": "يرمياه",
        "si": "ජෙරමියා",
        "sk": "Jeremiáš",
        "sl": "Jeremija",
        "sm": "Ieremia",
        "sn": "Jeremia",
        "so": "Yeremyaah",
        "sq": "Jeremia",
        "sr": "Јеремија",
        "st": "Jeremia",
        "su": "Yermia",
        "sv": "Jeremia",
        "sw": "Yeremia",
        "ta": "எரேமியா",
        "te": "జెర్మియా",
        "tg": "Ирмиё",
        "th": "เยเรมีย์",
        "tk": "Jeremiahermeýa",
        "ug": "يەرەمىيا",
        "uz": "Yeremiyo",
        "xh": "UYeremiya",
        "yi": "ירמיהו",
        "yo": "Jeremiah",
        "zu": "Jeremiya"
    },
    "Lamentations": {
        "bn": "বিলাপ",
        "hi": "विलापगीत",
        "es": "Lamentaciones",
        "ar": "مراثي إرميا",
        "fr": "Lamentations",
        "it": "Lamentazioni",
        "de": "Klagelieder",
        "ru": "Плач Иеремии",
        "he": "איכה",
        "ja": "哀歌",
        "zh": "哀歌",
        "ko": "예레미야 애가",
        "pt": "Lamentações",
        "tr": "Ağıtlar",
        "id": "Ratapan",
        "ur": "نوحہ خوانی",
        "fa": "نوحه ها",
        "nl": "Klaagliederen",
        "pl": "Lamenty",
        "uk": "Плачі",
        "vi": "Lời than thở",
        "af": "Klaagliedere",
        "am": "ሰቆቃዎቿ",
        "as": "বিলাপ",
        "az": "Mərsiyələr",
        "be": "Галашэньні",
        "bg": "Оплаквания",
        "bs": "Lamentations",
        "ca": "Lamentacions",
        "ceb": "Lamentaciones",
        "cs": "Nářky",
        "cy": "Galarnad",
        "da": "Klagesange",
        "el": "Θρήνοι",
        "eo": "Lamentoj",
        "et": "Nutulaulud",
        "eu": "Lamentuak",
        "fi": "Valitukset",
        "fil": "Panaghoy",
        "ga": "Lamentations",
        "gd": "Caoineadh",
        "gl": "Lamentacións",
        "gu": "વિલાપ",
        "ha": "Makoki",
        "haw": "Kanikau",
        "hr": "Tužaljke",
        "hu": "Siralmak",
        "hy": "Ողբներ",
        "ig": "Abụ-akwa",
        "is": "Harmar",
        "jv": "Lamentations",
        "ka": "გოდება",
        "kk": "Жоқтаулар",
        "km": "ការទួញសោក",
        "kn": "ಪ್ರಲಾಪಗಳು",
        "ku": "Lamentations",
        "ky": "Жоктоо",
        "la": "Lamentationes",
        "lo": "ຈົ່ມ",
        "lt": "Raudos",
        "lv": "Žēlabas",
        "mg": "Fitomaniana",
        "mi": "Nga tangi",
        "mk": "Оплакувања",
        "ml": "വിലാപങ്ങൾ",
        "mn": "Гашуудал",
        "mr": "विलाप",
        "ms": "Ratapan",
        "mt": "Lamentazzjonijiet",
        "my": "မြည်တမ်းခြင်း။",
        "ne": "विलाप",
        "no": "Klagesang",
        "ny": "Maliro",
        "or": "ବିଳାପ",
        "pa": "ਵਿਰਲਾਪ",
        "ps": "ژړاګانې",
        "ro": "Lamentări",
        "rw": "Icyunamo",
        "sd": "ماتم",
        "si": "විලාප ගී",
        "sk": "Náreky",
        "sl": "Objokovanja",
        "sm": "Auega",
        "sn": "Mariro",
        "so": "Baroorta",
        "sq": "Vajtimet",
        "sr": "Ламентатионс",
        "st": "Lillo Tsa Jeremia",
        "su": "Lamentations",
        "sv": "Klagosånger",
        "sw": "Maombolezo",
        "ta": "புலம்பல்கள்",
        "te": "విలాపములు",
        "tg": "Марсияҳо",
        "th": "คร่ำครวญ",
        "tk": "Aglama",
        "ug": "ماتەم",
        "uz": "Marosimlar",
        "xh": "Izililo",
        "yi": "קלאָגן",
        "yo": "Àròyé",
        "zu": "Isililo"
    },
    "Ezekiel": {
        "bn": "যিহিষ্কেল",
        "hi": "यहेजकेल",
        "es": "Ezequiel",
        "ar": "حزقيال",
        "fr": "Ézéchiel",
        "it": "Ezechiele",
        "de": "Hesekiel",
        "ru": "Иезекииль",
        "he": "יחזקאל",
        "ja": "エゼキエル",
        "zh": "以西结",
        "ko": "에스겔",
        "pt": "Ezequiel",
        "tr": "Ezekiel",
        "id": "Yehezkiel",
        "ur": "حزقیل",
        "fa": "حزقیال",
        "nl": "Ezechiël",
        "pl": "Ezechiel",
        "uk": "Єзекіїль",
        "vi": "Ê-xê-chi-ên",
        "af": "Esegiël",
        "am": "ሕዝቅኤል",
        "as": "যিহিষ্কেল",
        "az": "Ezekel",
        "be": "Езэкііль",
        "bg": "Езекиел",
        "bs": "Ezekiel",
        "ca": "Ezequiel",
        "ceb": "Ezequiel",
        "cs": "Ezechiel",
        "cy": "Eseciel",
        "da": "Ezekiel",
        "el": "Ιεζεκιήλ",
        "eo": "Ezekiel",
        "et": "Hesekiel",
        "eu": "Ezekiel",
        "fi": "Hesekiel",
        "fil": "Ezekiel",
        "ga": "Ezekiel",
        "gd": "Eseciel",
        "gl": "Ezequiel",
        "gu": "એઝેકીલ",
        "ha": "Ezekiyel",
        "haw": "Ezekiela",
        "hr": "Ezekiel",
        "hu": "Ezékiel",
        "hy": "Եզեկիել",
        "ig": "Ezikiel",
        "is": "Esekíel",
        "jv": "Yeheskiel",
        "ka": "ეზეკიელი",
        "kk": "Езекиел",
        "km": "អេសេគាល។",
        "kn": "ಎಝೆಕಿಯೆಲ್",
        "ku": "Ezekiel",
        "ky": "Жезекиел",
        "la": "Ezechiel",
        "lo": "ເອເຊກຽນ",
        "lt": "Ezekielis",
        "lv": "Ecēhiēls",
        "mg": "Ezekiela",
        "mi": "Ezekiela",
        "mk": "Езекиел",
        "ml": "എസെക്കിയേൽ",
        "mn": "Езекиел",
        "mr": "यहेज्केल",
        "ms": "Yehezkiel",
        "mt": "Eżekjel",
        "my": "ယေဇကျေလ",
        "ne": "इजकिएल",
        "no": "Esekiel",
        "ny": "Ezekieli",
        "or": "ଯିହିଜିକଲ",
        "pa": "ਹਿਜ਼ਕੀਏਲ",
        "ps": "ایزکیل",
        "ro": "Ezechiel",
        "rw": "Ezekiyeli",
        "sd": "ايزيڪيل",
        "si": "එසකියෙල්",
        "sk": "Ezechiel",
        "sl": "Ezekiel",
        "sm": "Esekielu",
        "sn": "Ezekieri",
        "so": "Yexesqeel",
        "sq": "Ezekieli",
        "sr": "Језекиљ",
        "st": "Ezekiele",
        "su": "Ezekiel",
        "sv": "Hesekiel",
        "sw": "Ezekieli",
        "ta": "எசேக்கியேல்",
        "te": "యెహెజ్కేలు",
        "tg": "Ҳизқиёл",
        "th": "เอเสเคียล",
        "tk": "Ezekiýel",
        "ug": "Ezekiýel",
        "uz": "Hizqiyo",
        "xh": "UHezekile",
        "yi": "יחזקאל",
        "yo": "Esekieli",
        "zu": "UHezekeli"
    },
    "Daniel": {
        "bn": "দানিয়েল",
        "hi": "दानिय्येल",
        "es": "Daniel",
        "ar": "دانيال",
        "fr": "Daniel",
        "it": "Daniele",
        "de": "Daniel",
        "ru": "Даниил",
        "he": "דניאל",
        "ja": "ダニエル",
        "zh": "丹尼尔",
        "ko": "다니엘",
        "pt": "Danilo",
        "tr": "Daniel",
        "id": "Daniel",
        "ur": "دانیال",
        "fa": "دانیال",
        "nl": "Daniël",
        "pl": "Daniela",
        "uk": "Даніель",
        "vi": "Daniel",
        "af": "Daniël",
        "am": "ዳንኤል",
        "as": "ডেনিয়েল",
        "az": "Daniel",
        "be": "Данііл",
        "bg": "Даниел",
        "bs": "Daniel",
        "ca": "Daniel",
        "ceb": "Daniel",
        "cs": "Daniel",
        "cy": "Daniel",
        "da": "Daniel",
        "el": "Δανιήλ",
        "eo": "Danielo",
        "et": "Daniel",
        "eu": "Daniel",
        "fi": "Daniel",
        "fil": "Daniel",
        "ga": "Daniel",
        "gd": "Daniel",
        "gl": "Daniel",
        "gu": "ડેનિયલ",
        "ha": "Daniyel",
        "haw": "Daniela",
        "hr": "Daniel",
        "hu": "Daniel",
        "hy": "Դանիել",
        "ig": "Daniel",
        "is": "Daníel",
        "jv": "Daniel",
        "ka": "დანიელ",
        "kk": "Даниел",
        "km": "ដានីយ៉ែល",
        "kn": "ಡೇನಿಯಲ್",
        "ku": "Daniel",
        "ky": "Даниел",
        "la": "Daniel",
        "lo": "ດານີເອນ",
        "lt": "Danielius",
        "lv": "Daniels",
        "mg": "Daniela",
        "mi": "Raniera",
        "mk": "Даниел",
        "ml": "ഡാനിയേൽ",
        "mn": "Даниел",
        "mr": "डॅनियल",
        "ms": "Daniel",
        "mt": "Daniel",
        "my": "ဒံယေလ",
        "ne": "डेनियल",
        "no": "Daniel",
        "ny": "Danieli",
        "or": "ଦାନିୟେଲ |",
        "pa": "ਡੈਨੀਅਲ",
        "ps": "ډینیل",
        "ro": "Daniel",
        "rw": "Daniel",
        "sd": "دانيال",
        "si": "ඩැනියෙල්",
        "sk": "Daniel",
        "sl": "Daniel",
        "sm": "Tanielu",
        "sn": "Dhanieri",
        "so": "Daniel",
        "sq": "Danieli",
        "sr": "Даниел",
        "st": "Daniele",
        "su": "Daniel",
        "sv": "Daniel",
        "sw": "Daniel",
        "ta": "டேனியல்",
        "te": "డేనియల్",
        "tg": "Даниел",
        "th": "แดเนียล",
        "tk": "Daniel",
        "ug": "دانىيال",
        "uz": "Daniel",
        "xh": "UDaniyeli",
        "yi": "דניאל",
        "yo": "Danieli",
        "zu": "UDaniyeli"
    },
    "Hosea": {
        "bn": "হোশেয়",
        "hi": "होशे",
        "es": "Oseas",
        "ar": "هوشع",
        "fr": "Osée",
        "it": "Osea",
        "de": "Hosea",
        "ru": "Осия",
        "he": "הושע",
        "ja": "ホセア",
        "zh": "何西阿",
        "ko": "호세아",
        "pt": "Oséias",
        "tr": "Hoşea",
        "id": "Hosea",
        "ur": "ہوسیا۔",
        "fa": "هوسی",
        "nl": "Hosea",
        "pl": "Ozeasz",
        "uk": "Осія",
        "vi": "Ô-sê",
        "af": "Hosea",
        "am": "ሆሴዕ",
        "as": "হোচেয়া",
        "az": "Huşə",
        "be": "Асія",
        "bg": "Осия",
        "bs": "Hosea",
        "ca": "Osees",
        "ceb": "Oseas",
        "cs": "Hosea",
        "cy": "Hosea",
        "da": "Hosea",
        "el": "Osea",
        "eo": "Hosea",
        "et": "Hosea",
        "eu": "Oseas",
        "fi": "Hosea",
        "fil": "Hosea",
        "ga": "Hosea",
        "gd": "Hosea",
        "gl": "Oseas",
        "gu": "હોસીઆ",
        "ha": "Yusha'u",
        "haw": "Hosea",
        "hr": "Hošea",
        "hu": "Hosea",
        "hy": "Օսեա",
        "ig": "Hosia",
        "is": "Hósea",
        "jv": "Hosea",
        "ka": "ოსია",
        "kk": "Ошия",
        "km": "ហូសេ",
        "kn": "ಹೋಸಿಯಾ",
        "ku": "Hosea",
        "ky": "Ошуя",
        "la": "Osee",
        "lo": "ໂຮເຊອາ",
        "lt": "Hosea",
        "lv": "Hosea",
        "mg": "Hosea",
        "mi": "Hosea",
        "mk": "Осија",
        "ml": "ഹോസിയ",
        "mn": "Хосеа",
        "mr": "होसे",
        "ms": "Hosea",
        "mt": "Hosea",
        "my": "ဟောရှေ",
        "ne": "होसिया",
        "no": "Hosea",
        "ny": "Hoseya",
        "or": "ହୋଶେୟ",
        "pa": "ਹੋਸੀਆ",
        "ps": "هوسۍ",
        "ro": "Osea",
        "rw": "Hoseya",
        "sd": "هوس",
        "si": "හොසියා",
        "sk": "Ozeáš",
        "sl": "Ozej",
        "sm": "Hosea",
        "sn": "Hosiya",
        "so": "Hoosheeca",
        "sq": "Osea",
        "sr": "Осија",
        "st": "Hosea",
        "su": "Hosea",
        "sv": "Hosea",
        "sw": "Hosea",
        "ta": "ஹோசியா",
        "te": "హోసియా",
        "tg": "Ҳушаъ",
        "th": "โฮเชยา",
        "tk": "Hoşeýa",
        "ug": "Hosea",
        "uz": "Xo'sheya",
        "xh": "uHoseya",
        "yi": "הושע",
        "yo": "Hosea",
        "zu": "Hoseya"
    },
    "Joel": {
        "bn": "যোয়েল",
        "hi": "योएल",
        "es": "Joel",
        "ar": "يوئيل",
        "fr": "Joël",
        "it": "Gioele",
        "de": "Joel",
        "ru": "Иоиль",
        "he": "יואל",
        "ja": "ジョエル",
        "zh": "乔尔",
        "ko": "조엘",
        "pt": "Joel",
        "tr": "Joel",
        "id": "Joel",
        "ur": "جوئل",
        "fa": "جوئل",
        "nl": "Joël",
        "pl": "Joel",
        "uk": "Джоел",
        "vi": "Joel",
        "af": "Joël",
        "am": "ኢዩኤል",
        "as": "জোৱেল",
        "az": "Joel",
        "be": "Джоэл",
        "bg": "Джоел",
        "bs": "Joel",
        "ca": "Joel",
        "ceb": "Joel",
        "cs": "Joel",
        "cy": "Joel",
        "da": "Joel",
        "el": "Τζόελ",
        "eo": "Joel",
        "et": "Joel",
        "eu": "Joel",
        "fi": "Joel",
        "fil": "Joel",
        "ga": "Joel",
        "gd": "Joel",
        "gl": "Xoel",
        "gu": "જોએલ",
        "ha": "Joel",
        "haw": "Joel",
        "hr": "Joel",
        "hu": "Joel",
        "hy": "Ջոել",
        "ig": "Joel",
        "is": "Jóel",
        "jv": "Joel",
        "ka": "ჯოელი",
        "kk": "Джоэл",
        "km": "ចូអេល",
        "kn": "ಜೋಯಲ್",
        "ku": "Joel",
        "ky": "Joel",
        "la": "Ioel",
        "lo": "ໂຢເອນ",
        "lt": "Joelis",
        "lv": "Džoels",
        "mg": "Joel",
        "mi": "Hoera",
        "mk": "Џоел",
        "ml": "ജോയൽ",
        "mn": "Жоел",
        "mr": "जोएल",
        "ms": "Joel",
        "mt": "Joel",
        "my": "ယောလ",
        "ne": "जोएल",
        "no": "Joel",
        "ny": "Yoweli",
        "or": "ଜୁଏଲ",
        "pa": "ਜੋਏਲ",
        "ps": "جویل",
        "ro": "Joel",
        "rw": "Joel",
        "sd": "جويل",
        "si": "ජොයෙල්",
        "sk": "Joel",
        "sl": "Joel",
        "sm": "Ioelu",
        "sn": "Joeri",
        "so": "Joel",
        "sq": "Joel",
        "sr": "Јоел",
        "st": "Joele",
        "su": "Joel",
        "sv": "Joel",
        "sw": "Yoeli",
        "ta": "ஜோயல்",
        "te": "జోయెల్",
        "tg": "Ҷоэл",
        "th": "โจเอล",
        "tk": "Joel",
        "ug": "Joel",
        "uz": "Joel",
        "xh": "Yoweli",
        "yi": "יואל",
        "yo": "Joeli",
        "zu": "UJoweli"
    },
    "Amos": {
        "bn": "আমোষ",
        "hi": "आमोस",
        "es": "Amós",
        "ar": "عاموس",
        "fr": "Amos",
        "it": "Amos",
        "de": "Amos",
        "ru": "Амос",
        "he": "עמוס",
        "ja": "アモス",
        "zh": "阿莫斯",
        "ko": "아모스",
        "pt": "Amós",
        "tr": "Amos",
        "id": "Amos",
        "ur": "آموس",
        "fa": "آموس",
        "nl": "Amos",
        "pl": "Amosa",
        "uk": "Амос",
        "vi": "A-mốt",
        "af": "Amos",
        "am": "አሞጽ",
        "as": "আমোচ",
        "az": "Amos",
        "be": "Амос",
        "bg": "Амос",
        "bs": "Amos",
        "ca": "Amos",
        "ceb": "Amos",
        "cs": "Amos",
        "cy": "Amos",
        "da": "Amos",
        "el": "Amos",
        "eo": "Amos",
        "et": "Amos",
        "eu": "Amos",
        "fi": "Amos",
        "fil": "Amos",
        "ga": "Amos",
        "gd": "Amos",
        "gl": "Amos",
        "gu": "એમોસ",
        "ha": "Amos",
        "haw": "Amosa",
        "hr": "Amos",
        "hu": "Amos",
        "hy": "Ամոս",
        "ig": "Emọs",
        "is": "Amos",
        "jv": "Amos",
        "ka": "ამოსი",
        "kk": "Амос",
        "km": "អាម៉ុស",
        "kn": "ಅಮೋಸ್",
        "ku": "Amos",
        "ky": "Амос",
        "la": "Amos",
        "lo": "ອາໂມດ",
        "lt": "Amos",
        "lv": "Amos",
        "mg": "Amosa",
        "mi": "Amoho",
        "mk": "Амос",
        "ml": "ആമോസ്",
        "mn": "Амос",
        "mr": "आमोस",
        "ms": "Amos",
        "mt": "Amos",
        "my": "အာမုတ်",
        "ne": "आमोस",
        "no": "Amos",
        "ny": "Amosi",
        "or": "ଆମୋସ୍",
        "pa": "ਆਮੋਸ",
        "ps": "اموس",
        "ro": "Amos",
        "rw": "Amosi",
        "sd": "اموس",
        "si": "ආමොස්",
        "sk": "Amos",
        "sl": "Amos",
        "sm": "Amosa",
        "sn": "Amosi",
        "so": "Caamoos",
        "sq": "Amos",
        "sr": "Амос",
        "st": "Amose",
        "su": "Amos",
        "sv": "Amos",
        "sw": "Amosi",
        "ta": "ஆமோஸ்",
        "te": "అమోస్",
        "tg": "Амос",
        "th": "อามอส",
        "tk": "Amos",
        "ug": "ئاموس",
        "uz": "Amos",
        "xh": "UAmosi",
        "yi": "עמוס",
        "yo": "Amosi",
        "zu": "u-Amose"
    },
    "Obadiah": {
        "bn": "ওবদিয়",
        "hi": "ओबद्याह",
        "es": "Abdías",
        "ar": "عوبديا",
        "fr": "Abdias",
        "it": "Abdia",
        "de": "Obadja",
        "ru": "Авдий",
        "he": "עובדיה",
        "ja": "オバデヤ",
        "zh": "俄巴底亚",
        "ko": "오바댜",
        "pt": "Obadias",
        "tr": "Obadiah",
        "id": "Obaja",
        "ur": "عبادیہ",
        "fa": "عبدیه",
        "nl": "Obadja",
        "pl": "Obadiasz",
        "uk": "Овдій",
        "vi": "Ápđia",
        "af": "Obadja",
        "am": "አብድዩ",
        "as": "ওবদিয়া",
        "az": "Obadiah",
        "be": "Аўдзій",
        "bg": "Обадия",
        "bs": "Obadija",
        "ca": "Obadies",
        "ceb": "Abdias",
        "cs": "Abdiáš",
        "cy": "Obadeia",
        "da": "Obadja",
        "el": "Ο Obadiah",
        "eo": "Obadja",
        "et": "Obadja",
        "eu": "Obadias",
        "fi": "Obadja",
        "fil": "Obadiah",
        "ga": "Obadiah",
        "gd": "Obadiah",
        "gl": "Abdías",
        "gu": "ઓબાદ્યા",
        "ha": "Obadiya",
        "haw": "Obadia",
        "hr": "Obadija",
        "hu": "Abdiah",
        "hy": "Աբդիա",
        "ig": "Obadia",
        "is": "Óbadía",
        "jv": "Obaja",
        "ka": "ობადია",
        "kk": "Абадия",
        "km": "អូបាឌី",
        "kn": "ಓಬಾದಯ್ಯ",
        "ku": "Obadiah",
        "ky": "Обадия",
        "la": "Abdias",
        "lo": "ໂອບາດີຢາ",
        "lt": "Obadijas",
        "lv": "Obadja",
        "mg": "Obadia",
        "mi": "Oparia",
        "mk": "Обадија",
        "ml": "ഒബാദിയ",
        "mn": "Обадиа",
        "mr": "ओबद्या",
        "ms": "Obadiah",
        "mt": "Abdja",
        "my": "သြဗဒိ",
        "ne": "ओबदिया",
        "no": "Obadja",
        "ny": "Obadiya",
        "or": "ଓବାଡିଆ |",
        "pa": "ਓਬਦਿਆਹ",
        "ps": "عبادیه",
        "ro": "Obadiah",
        "rw": "Obadiya",
        "sd": "عباديه",
        "si": "ඔබදියා",
        "sk": "Obadiah",
        "sl": "Obadiah",
        "sm": "Opetaia",
        "sn": "Obhadhiya",
        "so": "Cobadyaah",
        "sq": "Obadiah",
        "sr": "Авдија",
        "st": "Obadia",
        "su": "Obaja",
        "sv": "Obadja",
        "sw": "Obadia",
        "ta": "ஒபதியா",
        "te": "ఓబడియా",
        "tg": "Абадиё",
        "th": "โอบาดีห์",
        "tk": "Obadýa",
        "ug": "Obadiah",
        "uz": "Obodiyo",
        "xh": "uObhadiya",
        "yi": "עובדיה",
        "yo": "Obadiah",
        "zu": "Obadiya"
    },
    "Jonah": {
        "bn": "যোনা",
        "hi": "योना",
        "es": "Jonás",
        "ar": "يونان",
        "fr": "Jonas",
        "it": "Giona",
        "de": "Jona",
        "ru": "Иона",
        "he": "יונה",
        "ja": "ヨナ",
        "zh": "约拿",
        "ko": "요나",
        "pt": "Jonas",
        "tr": "Yunus",
        "id": "Yunus",
        "ur": "یونس",
        "fa": "یونس",
        "nl": "Jona",
        "pl": "Jonasz",
        "uk": "Йона",
        "vi": "Giô-na",
        "af": "Jona",
        "am": "ዮናስ",
        "as": "যোনা",
        "az": "Yunus",
        "be": "Ёна",
        "bg": "Йона",
        "bs": "Jonah",
        "ca": "Jonàs",
        "ceb": "Jonas",
        "cs": "Jonah",
        "cy": "Jona",
        "da": "Jonas",
        "el": "Ο Ιωνάς",
        "eo": "Jona",
        "et": "Joona",
        "eu": "Jonas",
        "fi": "Jonah",
        "fil": "Jonah",
        "ga": "Ióna",
        "gd": "Ionah",
        "gl": "Xonás",
        "gu": "જોનાહ",
        "ha": "Yunusa",
        "haw": "Iona",
        "hr": "Jonah",
        "hu": "Jonah",
        "hy": "Հովնան",
        "ig": "Jona",
        "is": "Jónas",
        "jv": "Yunus",
        "ka": "იონა",
        "kk": "Жүніс",
        "km": "យ៉ូណាស",
        "kn": "ಜೋನ್ನಾ",
        "ku": "Jonah",
        "ky": "Жунус",
        "la": "Jonas",
        "lo": "ໂຢນາ",
        "lt": "Jonas",
        "lv": "Jona",
        "mg": "Jona",
        "mi": "Hona",
        "mk": "Јона",
        "ml": "യോനാ",
        "mn": "Иона",
        "mr": "योना",
        "ms": "Yunus",
        "mt": "Ġona",
        "my": "ယောန",
        "ne": "जोनाह",
        "no": "Jonas",
        "ny": "Yona",
        "or": "ଯୂନସ",
        "pa": "ਯੂਨਾਹ",
        "ps": "یونس",
        "ro": "Iona",
        "rw": "Yona",
        "sd": "يونس",
        "si": "ජෝනා",
        "sk": "Jonáš",
        "sl": "Jonah",
        "sm": "Iona",
        "sn": "Jona",
        "so": "Yoonis",
        "sq": "Jonah",
        "sr": "Јонах",
        "st": "Jonase",
        "su": "Yunus",
        "sv": "Jonas",
        "sw": "Yona",
        "ta": "ஜோனா",
        "te": "జోనా",
        "tg": "Юнус",
        "th": "โยนาห์",
        "tk": "Ahunus",
        "ug": "يۇنۇس",
        "uz": "Yunus",
        "xh": "uYona",
        "yi": "יונה",
        "yo": "Jona",
        "zu": "uJona"
    },
    "Micah": {
        "bn": "মীখা",
        "hi": "मीका",
        "es": "Miqueas",
        "ar": "ميخا",
        "fr": "Michée",
        "it": "Michea",
        "de": "Micha",
        "ru": "Михей",
        "he": "מיכה",
        "ja": "ミカ",
        "zh": "弥迦",
        "ko": "미가",
        "pt": "Miquéias",
        "tr": "Mika",
        "id": "Mikha",
        "ur": "میکاہ",
        "fa": "میکاه",
        "nl": "Micha",
        "pl": "Micheasz",
        "uk": "Міхей",
        "vi": "Micah",
        "af": "Miga",
        "am": "ሚክያስ",
        "as": "মীকা",
        "az": "Mika",
        "be": "Міхась",
        "bg": "Мика",
        "bs": "Micah",
        "ca": "Micah",
        "ceb": "Micah",
        "cs": "Micah",
        "cy": "Micah",
        "da": "Micah",
        "el": "Ο Μίχας",
        "eo": "Miĥa",
        "et": "Micah",
        "eu": "Mikea",
        "fi": "Micah",
        "fil": "Micah",
        "ga": "Micah",
        "gd": "Micah",
        "gl": "Miqueas",
        "gu": "મીકાહ",
        "ha": "Mika",
        "haw": "Mika",
        "hr": "Micah",
        "hu": "Micah",
        "hy": "Միքիա",
        "ig": "Maịka",
        "is": "Micah",
        "jv": "Mikha",
        "ka": "მიხა",
        "kk": "Мика",
        "km": "មីកា",
        "kn": "ಮಿಕಾಹ್",
        "ku": "Micah",
        "ky": "Михей",
        "la": "Mich",
        "lo": "ມີກາ",
        "lt": "Micah",
        "lv": "Micah",
        "mg": "Mika",
        "mi": "Ko Mika",
        "mk": "Михеј",
        "ml": "മീഖാ",
        "mn": "Мика",
        "mr": "मीका",
        "ms": "Mikha",
        "mt": "Mikea",
        "my": "ခာ",
        "ne": "मीका",
        "no": "Micah",
        "ny": "Mika",
        "or": "ମୀଖା",
        "pa": "ਮੀਕਾਹ",
        "ps": "مایکه",
        "ro": "Mica",
        "rw": "Mika",
        "sd": "ميڪا",
        "si": "මයිකා",
        "sk": "Micah",
        "sl": "Miha",
        "sm": "Mika",
        "sn": "Mika",
        "so": "Miikaah",
        "sq": "Mikea",
        "sr": "Мицах",
        "st": "Mikea",
        "su": "Mika",
        "sv": "Micah",
        "sw": "Mika",
        "ta": "மைக்கா",
        "te": "మీకా",
        "tg": "Мико",
        "th": "ไมก้า",
        "tk": "Mika",
        "ug": "مىكا",
        "uz": "Mixa",
        "xh": "UMika",
        "yi": "מיכה",
        "yo": "Mika",
        "zu": "UMika"
    },
    "Nahum": {
        "bn": "নহূম",
        "hi": "नहूम",
        "es": "Nahúm",
        "ar": "ناحوم",
        "fr": "Nahum",
        "it": "Naum",
        "de": "Nahum",
        "ru": "Наум",
        "he": "נחום",
        "ja": "ナホム",
        "zh": "那厄姆",
        "ko": "나훔",
        "pt": "Naum",
        "tr": "Nahum",
        "id": "Nahum",
        "ur": "نہم",
        "fa": "ناهوم",
        "nl": "Nahum",
        "pl": "Nie",
        "uk": "Наум",
        "vi": "Na-hum",
        "af": "Nahum",
        "am": "ናሆም",
        "as": "নাহুম",
        "az": "Nahum",
        "be": "Навум",
        "bg": "Наум",
        "bs": "Nahum",
        "ca": "Nahum",
        "ceb": "Nahum",
        "cs": "Nahum",
        "cy": "Nahum",
        "da": "Nahum",
        "el": "Ναούμ",
        "eo": "Nahum",
        "et": "Nahum",
        "eu": "Nahum",
        "fi": "Nahum",
        "fil": "Nahum",
        "ga": "Nahum",
        "gd": "Nahum",
        "gl": "Nahum",
        "gu": "નહુમ",
        "ha": "Nahum",
        "haw": "Nahuma",
        "hr": "Nahum",
        "hu": "Nahum",
        "hy": "Նաում",
        "ig": "Nehọm",
        "is": "Nahum",
        "jv": "Nahum",
        "ka": "ნაუმი",
        "kk": "Нахум",
        "km": "ណាហ៊ូម",
        "kn": "ನಹೂಮ್",
        "ku": "Nahum",
        "ky": "Нахум",
        "la": "Nahum",
        "lo": "ນາຮູມ",
        "lt": "Nahum",
        "lv": "Nahum",
        "mg": "Nahoma",
        "mi": "Nahumu",
        "mk": "Наум",
        "ml": "നഹൂം",
        "mn": "Нахум",
        "mr": "नहूम",
        "ms": "Nahum",
        "mt": "Nahum",
        "my": "နာဟုံ",
        "ne": "नहुम",
        "no": "Nahum",
        "ny": "Nahumu",
        "or": "ନାହମ୍ |",
        "pa": "ਨਹੂਮ",
        "ps": "نهم",
        "ro": "Nahum",
        "rw": "Nahum",
        "sd": "نهم",
        "si": "නාහුම්",
        "sk": "Nahum",
        "sl": "Nahum",
        "sm": "Nauma",
        "sn": "Nahumi",
        "so": "Nahum",
        "sq": "Nahumi",
        "sr": "Наум",
        "st": "Nahume",
        "su": "Nahum",
        "sv": "Nahum",
        "sw": "Nahumu",
        "ta": "நஹும்",
        "te": "నహూమ్",
        "tg": "Наҳум",
        "th": "นาฮูม",
        "tk": "Nahum",
        "ug": "Nahum",
        "uz": "Nahum",
        "xh": "UNahum",
        "yi": "נחום",
        "yo": "Náhúmù",
        "zu": "uNahume"
    },
    "Habakkuk": {
        "bn": "হবক্‌কূক",
        "hi": "हबक्कूक",
        "es": "Habacuc",
        "ar": "حبقوق",
        "fr": "Habacuc",
        "it": "Abacuc",
        "de": "Habakuk",
        "ru": "Аввакум",
        "he": "חבקוק",
        "ja": "彼らは躊躇します",
        "zh": "他们犹豫不决",
        "ko": "그들은 주저한다",
        "pt": "Eles hesitam",
        "tr": "Tereddüt ediyorlar",
        "id": "Mereka ragu-ragu",
        "ur": "وہ ہچکچاتے ہیں۔",
        "fa": "تردید می کنند",
        "nl": "Habakuk",
        "pl": "Habakuk",
        "uk": "Авакум",
        "vi": "Ha-ba-cúc",
        "af": "Habakuk",
        "am": "ዕንባቆም",
        "as": "হবক্কুক",
        "az": "Habakkuk",
        "be": "Авакум",
        "bg": "Авакум",
        "bs": "Habakuk",
        "ca": "Habacuc",
        "ceb": "Habakuk",
        "cs": "Habakukové",
        "cy": "Habacuc",
        "da": "Habakkuk",
        "el": "Αββακούμ",
        "eo": "Habakkuk",
        "et": "Habakuk",
        "eu": "Habakuk",
        "fi": "Habakuk",
        "fil": "Habakuk",
        "ga": "Habacuc",
        "gd": "Habacuc",
        "gl": "Habacuc",
        "gu": "હબક્કુક",
        "ha": "Habakkuk",
        "haw": "Habakuka",
        "hr": "Habakuk",
        "hu": "Habakuk",
        "hy": "Ամբակում",
        "ig": "Habakuk",
        "is": "Habakkuk",
        "jv": "Habakuk",
        "ka": "აბაკუმი",
        "kk": "Аввакум",
        "km": "ហាបាគុក",
        "kn": "ಹಬಕ್ಕುಕ್",
        "ku": "Hebaqûk",
        "ky": "Аввакум",
        "la": "Habacuc",
        "lo": "ຮາບາກຸກ",
        "lt": "Habakukas",
        "lv": "Habakuks",
        "mg": "Habakoka",
        "mi": "Hapakuku",
        "mk": "Авакум",
        "ml": "ഹബക്കുക്ക്",
        "mn": "Хабаккук",
        "mr": "हबक्कुक",
        "ms": "Habakuk",
        "mt": "Ħabakkuk",
        "my": "ဟဗက္ကုတ်",
        "ne": "हबकुक",
        "no": "Habakkuk",
        "ny": "Habakuku",
        "or": "ହବକ୍କୁକ୍ |",
        "pa": "ਹਬੱਕੂਕ",
        "ps": "هبکوک",
        "ro": "Habacuc",
        "rw": "Habakuki",
        "sd": "حبڪوڪ",
        "si": "හබක්කුක්",
        "sk": "Habakuky",
        "sl": "Habakuk",
        "sm": "Sapakuka",
        "sn": "Habhakuki",
        "so": "Xabaquuq",
        "sq": "Habakuku",
        "sr": "Авакум",
        "st": "Habakuke",
        "su": "Habakuk",
        "sv": "Habakuk",
        "sw": "Habakuki",
        "ta": "ஹபக்குக்",
        "te": "హబక్కుక్",
        "tg": "Ҳабаққук",
        "th": "ฮาบากุก",
        "tk": "Habakuk",
        "ug": "Habakkuk",
        "uz": "Xabakkuk",
        "xh": "UHabhakuki",
        "yi": "חבקוק",
        "yo": "Habakuku",
        "zu": "UHabakuki"
    },
    "Zephaniah": {
        "bn": "সফনিয়",
        "hi": "सपन्याह",
        "es": "Sofonías",
        "ar": "صفنيا",
        "fr": "Sophonie",
        "it": "Sofonia",
        "de": "Zefanja",
        "ru": "Софония",
        "he": "צפניה",
        "ja": "ゼパニヤ",
        "zh": "西番雅",
        "ko": "스바냐",
        "pt": "Sofonias",
        "tr": "Zefanya",
        "id": "Zefanya",
        "ur": "صفنیاہ",
        "fa": "صفونیا",
        "nl": "Zefanja",
        "pl": "Sofoniasz",
        "uk": "Софонія",
        "vi": "Sô-phô-ni",
        "af": "Sefanja",
        "am": "ሶፎንያስ",
        "as": "চফনিয়া",
        "az": "Sefanya",
        "be": "Сафонія",
        "bg": "Софония",
        "bs": "Zephaniah",
        "ca": "Sofonies",
        "ceb": "Sofonias",
        "cs": "Sofoniáš",
        "cy": "Seffaneia",
        "da": "Zefanias",
        "el": "Σοφονία",
        "eo": "Cephaniah",
        "et": "Sefanja",
        "eu": "Sofonias",
        "fi": "Sefanja",
        "fil": "Zephaniah",
        "ga": "Zephaniah",
        "gd": "Sephaniah",
        "gl": "Sofonías",
        "gu": "સફાન્યા",
        "ha": "Zafaniya",
        "haw": "Zepania",
        "hr": "Sefanija",
        "hu": "Zephaniah",
        "hy": "Սոփոնիա",
        "ig": "Zefanaya",
        "is": "Sefanía",
        "jv": "Zefanya",
        "ka": "სოფონია",
        "kk": "Софония",
        "km": "សេផានា",
        "kn": "ಜೆಫನಿಯಾ",
        "ku": "Sophaniah",
        "ky": "Сепания",
        "la": "Zephaniah",
        "lo": "ເຊຟານີຢາ",
        "lt": "Zefanija",
        "lv": "Cefanja",
        "mg": "Zefania",
        "mi": "Ko Tepania",
        "mk": "Софонија",
        "ml": "സെഫാനിയ",
        "mn": "Зефаниа",
        "mr": "सफन्या",
        "ms": "Zefania",
        "mt": "Sofonija",
        "my": "ဇေဖနိ",
        "ne": "सफन्याह",
        "no": "Sefanja",
        "ny": "Zefaniya",
        "or": "ସିଫାନିଆ",
        "pa": "ਸਫ਼ਨਯਾਹ",
        "ps": "زفانيه",
        "ro": "Sofonia",
        "rw": "Zefaniya",
        "sd": "صفيه",
        "si": "ශෙපනියා",
        "sk": "Sofoniáš",
        "sl": "Zefanija",
        "sm": "Sefanaia",
        "sn": "Zefaniya",
        "so": "Sefanyaah",
        "sq": "Sofonia",
        "sr": "Софонија",
        "st": "Sofonia",
        "su": "Zepania",
        "sv": "Sefanja",
        "sw": "Sefania",
        "ta": "செபனியா",
        "te": "జెఫన్యా",
        "tg": "Сафанё",
        "th": "เซฟาเนีย",
        "tk": "Sefaniýa",
        "ug": "زېفانىيا",
        "uz": "Zafaniyo",
        "xh": "uZefaniya",
        "yi": "זעפניע",
        "yo": "Sefaniah",
        "zu": "uZefaniya"
    },
    "Haggai": {
        "bn": "হগয়",
        "hi": "हाग्गै",
        "es": "Hageo",
        "ar": "حجي",
        "fr": "Aggée",
        "it": "Aggeo",
        "de": "Haggai",
        "ru": "Аггей",
        "he": "חגי",
        "ja": "ハガイ",
        "zh": "哈该",
        "ko": "학개",
        "pt": "Ageu",
        "tr": "Haggai",
        "id": "Hagai",
        "ur": "ہاگئی",
        "fa": "هاگی",
        "nl": "Haggaï",
        "pl": "Aggeusz",
        "uk": "Агей",
        "vi": "Haggai",
        "af": "Haggai",
        "am": "ሃጌ",
        "as": "হাগাই",
        "az": "Haggai",
        "be": "Агей",
        "bg": "Агей",
        "bs": "Hagej",
        "ca": "Hageu",
        "ceb": "Haggeo",
        "cs": "Haggai",
        "cy": "Haggai",
        "da": "Haggai",
        "el": "Ο Χαγγαίος",
        "eo": "Hagajo",
        "et": "Haggai",
        "eu": "Hageo",
        "fi": "Haggai",
        "fil": "Hagai",
        "ga": "Hagaí",
        "gd": "Hagai",
        "gl": "Hageo",
        "gu": "હગ્ગાય",
        "ha": "Haggai",
        "haw": "Hagai",
        "hr": "Hagaj",
        "hu": "Haggai",
        "hy": "Հագայ",
        "ig": "Hagaị",
        "is": "Haggaí",
        "jv": "Hagai",
        "ka": "ჰაგაი",
        "kk": "Хаггай",
        "km": "ហាកៃ",
        "kn": "ಹಗ್ಗೈ",
        "ku": "Haggai",
        "ky": "Хаггай",
        "la": "Aggaeus",
        "lo": "ແຮກກີ",
        "lt": "Haggai",
        "lv": "Haggai",
        "mg": "Hagay",
        "mi": "Ko Hakai",
        "mk": "Агеј",
        "ml": "ഹഗ്ഗായി",
        "mn": "Хаггай",
        "mr": "हग्गय",
        "ms": "Hagai",
        "mt": "Ħaggaj",
        "my": "ဟဂ္ဂဲ",
        "ne": "हाग्गाई",
        "no": "Haggai",
        "ny": "Hagai",
        "or": "ହାଗାଇ |",
        "pa": "ਹੱਗਈ",
        "ps": "هګی",
        "ro": "Hagai",
        "rw": "Hagayi",
        "sd": "هگائي",
        "si": "හග්ගයි",
        "sk": "Haggai",
        "sl": "Hagaj",
        "sm": "Hakai",
        "sn": "Hagai",
        "so": "Haggai",
        "sq": "Hagai",
        "sr": "Агеј",
        "st": "Hagai",
        "su": "Hagai",
        "sv": "Haggai",
        "sw": "Hagai",
        "ta": "ஹாகாய்",
        "te": "హగ్గై",
        "tg": "Хаггай",
        "th": "ฮักไก",
        "tk": "Hagaý",
        "ug": "Haggai",
        "uz": "Xaggay",
        "xh": "uHagayi",
        "yi": "חגי",
        "yo": "Hagai",
        "zu": "Hagayi"
    },
    "Zechariah": {
        "bn": "সখরিয়",
        "hi": "जकर्याह",
        "es": "Zacarías",
        "ar": "زكريا",
        "fr": "Zacharie",
        "it": "Zaccaria",
        "de": "Sacharja",
        "ru": "Захария",
        "he": "זכריה",
        "ja": "ゼカリヤ",
        "zh": "撒迦利亚书",
        "ko": "스가랴",
        "pt": "Zacarias",
        "tr": "Zekeriya",
        "id": "Zakharia",
        "ur": "زکریا",
        "fa": "زکریا",
        "nl": "Zacharias",
        "pl": "Zachariasz",
        "uk": "Захарія",
        "vi": "Xa-cha-ri",
        "af": "Sagaria",
        "am": "ዘካርያስ",
        "as": "জখৰিয়া",
        "az": "Zəkəriyyə",
        "be": "Захарыя",
        "bg": "Захария",
        "bs": "Zaharija",
        "ca": "Zacaries",
        "ceb": "Zacarias",
        "cs": "Zachariáše",
        "cy": "Sechareia",
        "da": "Zakarias",
        "el": "ο Ζαχαρίας",
        "eo": "Zeĥarja",
        "et": "Sakarias",
        "eu": "Zakarias",
        "fi": "Sakariah",
        "fil": "Zacarias",
        "ga": "Zechariah",
        "gd": "Sechariah",
        "gl": "Zacarías",
        "gu": "ઝખાર્યા",
        "ha": "Zakariyya",
        "haw": "Zekaria",
        "hr": "Zaharija",
        "hu": "Zakariás",
        "hy": "Զաքարիա",
        "ig": "Zekaraya",
        "is": "Sakaría",
        "jv": "Zakharia",
        "ka": "ზაქარია",
        "kk": "Зәкәрия",
        "km": "សាការី",
        "kn": "ಜೆಕರಿಯಾ",
        "ku": "Zekerya",
        "ky": "Закарыя",
        "la": "Zacharias",
        "lo": "ຊາກາຣີຢາ",
        "lt": "Zacharijas",
        "lv": "Cakarija",
        "mg": "Zakaria",
        "mi": "Hakaraia",
        "mk": "Захарија",
        "ml": "സക്കറിയ",
        "mn": "Зехариа",
        "mr": "जखऱ्या",
        "ms": "Zakaria",
        "mt": "Żakkarija",
        "my": "ဇာခရိ",
        "ne": "जकरिया",
        "no": "Sakarja",
        "ny": "Zekariya",
        "or": "ଜିଖରିୟ",
        "pa": "ਜ਼ਕਰਯਾਹ",
        "ps": "زکریا",
        "ro": "Zaharia",
        "rw": "Zekariya",
        "sd": "زڪريا",
        "si": "සෙකරියා",
        "sk": "Zachariáša",
        "sl": "Zaharija",
        "sm": "Sakaria",
        "sn": "Zekaria",
        "so": "Sakariyas",
        "sq": "Zakaria",
        "sr": "Захарија",
        "st": "Zakaria",
        "su": "Jakaria",
        "sv": "Sakarja",
        "sw": "Zekaria",
        "ta": "சகரியா",
        "te": "జెకర్యా",
        "tg": "Закариё",
        "th": "เศคาริยาห์",
        "tk": "Zakarýa",
        "ug": "زەكەرىيا",
        "uz": "Zakariyo",
        "xh": "uZekariya",
        "yi": "זכריה",
        "yo": "Sekariah",
        "zu": "uZakariya"
    },
    "Malachi": {
        "bn": "মালাখি",
        "hi": "मलाकी",
        "es": "Malaquías",
        "ar": "ملاخي",
        "fr": "Malachie",
        "it": "Malachia",
        "de": "Maleachi",
        "ru": "Малахия",
        "he": "מלאכי",
        "ja": "マラキ語",
        "zh": "玛拉基",
        "ko": "말라기",
        "pt": "Malaquias",
        "tr": "Malaki",
        "id": "Maleakhi",
        "ur": "ملاکی",
        "fa": "ملاشی",
        "nl": "Maleachi",
        "pl": "Malachiasz",
        "uk": "Малахій",
        "vi": "Malachi",
        "af": "Maleagi",
        "am": "ሚልክያስ",
        "as": "মলাখী",
        "az": "Malaki",
        "be": "Малахій",
        "bg": "Малахия",
        "bs": "Malachi",
        "ca": "Malaquies",
        "ceb": "Malaquias",
        "cs": "Malachi",
        "cy": "Malachi",
        "da": "Malachi",
        "el": "Μαλαχίας",
        "eo": "Malaĥi",
        "et": "Malachi",
        "eu": "Malakia",
        "fi": "Malachi",
        "fil": "Malakias",
        "ga": "Malachi",
        "gd": "Malachi",
        "gl": "Malaquías",
        "gu": "માલાચી",
        "ha": "Malachi",
        "haw": "Malaki",
        "hr": "Malahije",
        "hu": "Malachi",
        "hy": "Մաղաքիա",
        "ig": "Malakaị",
        "is": "Malakí",
        "jv": "Malachi",
        "ka": "მალაქია",
        "kk": "Малахи",
        "km": "ម៉ាឡាគី",
        "kn": "ಮಲಾಚಿ",
        "ku": "Malachi",
        "ky": "Малахи",
        "la": "Malachias",
        "lo": "ມາລາກີ",
        "lt": "Malači",
        "lv": "malači",
        "mg": "Malakia",
        "mi": "Maraki",
        "mk": "Малахија",
        "ml": "മലാഖി",
        "mn": "Малахи",
        "mr": "मलाची",
        "ms": "Maleakhi",
        "mt": "Malakija",
        "my": "မာလခိ",
        "ne": "मलाकी",
        "no": "Malakias",
        "ny": "Malaki",
        "or": "ମାଲାଚି",
        "pa": "ਮਲਾਕੀ",
        "ps": "ملاچي",
        "ro": "Maleahi",
        "rw": "Malaki",
        "sd": "ملاڪي",
        "si": "මලාකි",
        "sk": "Malachiáš",
        "sl": "Malachi",
        "sm": "Malaki",
        "sn": "Maraki",
        "so": "Malaakii",
        "sq": "Malakia",
        "sr": "Малахија",
        "st": "Malakia",
        "su": "Malachi",
        "sv": "Malaki",
        "sw": "Malaki",
        "ta": "மலாச்சி",
        "te": "మలాకీ",
        "tg": "Малокӣ",
        "th": "มาลาคี",
        "tk": "Malaki",
        "ug": "Malachi",
        "uz": "Malakiy",
        "xh": "uMalaki",
        "yi": "מלאכי",
        "yo": "Malaki",
        "zu": "UMalaki"
    },
    "Acts": {
        "bn": "প্রেরিতদের কার্য",
        "hi": "प्रेरितों के काम",
        "es": "Hechos",
        "ar": "أعمال الرسل",
        "fr": "Actes",
        "it": "Atti",
        "de": "Apostelgeschichte",
        "ru": "Деяния",
        "he": "מעשי השליחים",
        "ja": "行為",
        "zh": "使徒行传",
        "ko": "사도행전",
        "pt": "Atos",
        "tr": "Elçilerin İşleri",
        "id": "Kisah Para Rasul",
        "ur": "اعمال",
        "fa": "اعمال",
        "nl": "Handelingen",
        "pl": "Dzieje",
        "uk": "Акти",
        "vi": "hành vi",
        "af": "Handelinge",
        "am": "የሐዋርያት ሥራ",
        "as": "কাৰ্য্য",
        "az": "Hərəkətlər",
        "be": "акты",
        "bg": "действа",
        "bs": "Djela",
        "ca": "Actes",
        "ceb": "Mga Buhat",
        "cs": "Acts",
        "cy": "Actau",
        "da": "Handlinger",
        "el": "Πράξεις",
        "eo": "Agoj",
        "et": "Tegutseb",
        "eu": "Aktak",
        "fi": "toimii",
        "fil": "Mga Gawa",
        "ga": "Achtanna",
        "gd": "Achdan",
        "gl": "Actos",
        "gu": "કૃત્યો",
        "ha": "Ayyukan Manzanni",
        "haw": "Hana",
        "hr": "djela",
        "hu": "csel",
        "hy": "Գործք",
        "ig": "Ọrụ Ndị Ozi",
        "is": "Gerðir",
        "jv": "Tumindak",
        "ka": "აქტები",
        "kk": "Әрекеттер",
        "km": "សកម្មភាព",
        "kn": "ಕಾಯಿದೆಗಳು",
        "ku": "Karên Şandiyan",
        "ky": "Acts",
        "la": "Actus Apostolorum",
        "lo": "ກິດຈະການ",
        "lt": "Aktai",
        "lv": "akti",
        "mg": "Asa",
        "mi": "Nga Mahi",
        "mk": "Дела",
        "ml": "പ്രവൃത്തികൾ",
        "mn": "Үйлс",
        "mr": "कृत्ये",
        "ms": "Perbuatan",
        "mt": "Atti",
        "my": "တမန်တော်",
        "ne": "कर्म",
        "no": "Handlinger",
        "ny": "Machitidwe",
        "or": "କାର୍ଯ୍ୟଗୁଡ଼ିକ",
        "pa": "ਐਕਟ",
        "ps": "اعمال",
        "ro": "Acte",
        "rw": "Ibyakozwe",
        "sd": "عمل",
        "si": "ක්රියා කරයි",
        "sk": "aktov",
        "sl": "akti",
        "sm": "Galuega",
        "sn": "Mabasa Avapostori",
        "so": "Falimaha Rasuullada",
        "sq": "Veprat",
        "sr": "Дела",
        "st": "Liketso",
        "su": "Lalakon",
        "sv": "Handlingar",
        "sw": "Matendo",
        "ta": "செயல்கள்",
        "te": "చట్టాలు",
        "tg": "Амалҳо",
        "th": "พระราชบัญญัติ",
        "tk": "Resullaryň Işleri",
        "ug": "ئەلچىلەر",
        "uz": "Amallar",
        "xh": "IZenzo",
        "yi": "אקטן",
        "yo": "Iṣe",
        "zu": "IzEnzo"
    },
    "Romans": {
        "bn": "রোমীয়",
        "hi": "रोमियों",
        "es": "Romanos",
        "ar": "رومية",
        "fr": "Romains",
        "it": "Romani",
        "de": "Römer",
        "ru": "Римлянам",
        "he": "אל הרומים",
        "ja": "ローマ人",
        "zh": "罗马书",
        "ko": "로마서",
        "pt": "Romanos",
        "tr": "Romalılar",
        "id": "Roma",
        "ur": "رومیوں",
        "fa": "رومی ها",
        "nl": "Romeinen",
        "pl": "Rzymianie",
        "uk": "римляни",
        "vi": "người La Mã",
        "af": "Romeine",
        "am": "ሮማውያን",
        "as": "ৰোমীয়াসকল",
        "az": "Romalılar",
        "be": "рымляне",
        "bg": "римляни",
        "bs": "Rimljanima",
        "ca": "romans",
        "ceb": "Mga Romano",
        "cs": "Římanům",
        "cy": "Rhufeiniaid",
        "da": "romere",
        "el": "Ρωμαίους",
        "eo": "romianoj",
        "et": "roomlased",
        "eu": "Erromatarrak",
        "fi": "roomalaiset",
        "fil": "mga Romano",
        "ga": "Rómhánaigh",
        "gd": "Ròmanaich",
        "gl": "romanos",
        "gu": "રોમનો",
        "ha": "Romawa",
        "haw": "Roma",
        "hr": "Rimljani",
        "hu": "rómaiak",
        "hy": "Հռոմեացիներ",
        "ig": "Ndị Rom",
        "is": "Rómverjar",
        "jv": "wong Romawi",
        "ka": "რომაელები",
        "kk": "Римдіктер",
        "km": "រ៉ូម៉ាំង",
        "kn": "ರೋಮನ್ನರು",
        "ku": "Romans",
        "ky": "Римдиктер",
        "la": "Romani",
        "lo": "ໂຣມັນ",
        "lt": "romėnai",
        "lv": "romieši",
        "mg": "Romana",
        "mi": "Roma",
        "mk": "Римјаните",
        "ml": "റോമാക്കാർ",
        "mn": "Ромчууд",
        "mr": "रोमन्स",
        "ms": "orang Rom",
        "mt": "Rumani",
        "my": "ရောမ",
        "ne": "रोमीहरू",
        "no": "romerne",
        "ny": "Aroma",
        "or": "ରୋମୀୟ",
        "pa": "ਰੋਮੀ",
        "ps": "روميانو",
        "ro": "romani",
        "rw": "Abaroma",
        "sd": "روميون",
        "si": "රෝමවරුන්",
        "sk": "Rimanom",
        "sl": "Rimljani",
        "sm": "Roma",
        "sn": "vaRoma",
        "so": "Roomaanka",
        "sq": "romakët",
        "sr": "Римљанима",
        "st": "Baroma",
        "su": "Urang Romawi",
        "sv": "romare",
        "sw": "Warumi",
        "ta": "ரோமர்கள்",
        "te": "రోమన్లు",
        "tg": "Румиён",
        "th": "ชาวโรมัน",
        "tk": "Rimliler",
        "ug": "رىملىقلار",
        "uz": "Rimliklar",
        "xh": "AmaRoma",
        "yi": "רוימער",
        "yo": "Romu",
        "zu": "AmaRoma"
    },
    "1 Corinthians": {
        "bn": "১ করিন্থীয়",
        "hi": "1 कुरिन्थियों",
        "es": "1 Corintios",
        "ar": "كورنثوس الأولى",
        "fr": "1 Corinthiens",
        "it": "1 Corinzi",
        "de": "1. Korinther",
        "ru": "1 Коринфянам",
        "he": "הראשונה לקורינתים",
        "ja": "1 コリント人への手紙",
        "zh": "1 哥林多前书",
        "ko": "고린도전서",
        "pt": "1 Coríntios",
        "tr": "1 Korintliler",
        "id": "1 Korintus",
        "ur": "1 کرنتھیوں",
        "fa": "1 قرنتیان",
        "nl": "1 Korintiërs",
        "pl": "1 Koryntian",
        "uk": "1 Коринтян",
        "vi": "1 Cô-rinh-tô",
        "af": "1 Korintiërs",
        "am": "1ኛ ቆሮንቶስ",
        "as": "১ কৰিন্থীয়া",
        "az": "1 Korinflilərə",
        "be": "1 Карынфянаў",
        "bg": "1 Коринтяни",
        "bs": "1. Korinćanima",
        "ca": "1 Corintis",
        "ceb": "1 Mga Taga-Corinto",
        "cs": "1 Korinťanům",
        "cy": "1 Corinthiaid",
        "da": "1 Korintherbrev",
        "el": "1 Κορινθίους",
        "eo": "1 Korintanoj",
        "et": "1 korintlastele",
        "eu": "1 Korintoarrei",
        "fi": "1 Korinttilaisille",
        "fil": "1 Corinto",
        "ga": "1 Corantaigh",
        "gd": "1 Corintianaich",
        "gl": "1 Corintios",
        "gu": "1 કોરીંથી",
        "ha": "1 Korinthiyawa",
        "haw": "1 Korineto",
        "hr": "1 Korinćanima",
        "hu": "1 Korinthusi levél",
        "hy": "1 Կորնթացիներ",
        "ig": "1 Ndị Kọrịnt",
        "is": "1 Korintubréf",
        "jv": "1 Korinta",
        "ka": "1 კორინთელები",
        "kk": "1 Қорынттықтар",
        "km": "១ កូរិនថូស",
        "kn": "1 ಕೊರಿಂಥಿಯಾನ್ಸ್",
        "ku": "1 Korîntî",
        "ky": "1 Корунттуктар",
        "la": "1 Corinthians",
        "lo": "1 ໂກລິນໂທ",
        "lt": "1 Korintiečiams",
        "lv": "1 korintiešiem",
        "mg": "1 Korintiana",
        "mi": "1 Koriniti",
        "mk": "1 Коринтјаните",
        "ml": "1 കൊരിന്ത്യർ",
        "mn": "1 Коринт",
        "mr": "1 करिंथकर",
        "ms": "1 Korintus",
        "mt": "1 Korintin",
        "my": "၁ ကောရိန္သု",
        "ne": "१ कोरिन्थी",
        "no": "1 Korinterbrev",
        "ny": "1 Akorinto",
        "or": "୧ କରିନ୍ଥୀୟ",
        "pa": "1 ਕੁਰਿੰਥੀਆਂ",
        "ps": "۱ـ کورنتیانو",
        "ro": "1 Corinteni",
        "rw": "1 Abakorinto",
        "sd": "1 ڪرنٿين",
        "si": "1 කොරින්ති",
        "sk": "1 Korinťanom",
        "sl": "1 Korinčanom",
        "sm": "1 Korinito",
        "sn": "1 VaKorinte",
        "so": "1 Korintos",
        "sq": "1 Korintasve",
        "sr": "1. Коринћанима",
        "st": "1 Bakorinthe",
        "su": "1 Korinta",
        "sv": "1 Korintierbrevet",
        "sw": "1 Wakorintho",
        "ta": "1 கொரிந்தியர்",
        "te": "1 కొరింథీయులు",
        "tg": "1 Қӯринтиён",
        "th": "1 โครินธ์",
        "tk": "1 Korintoslylar",
        "ug": "كورىنتلىقلارغا 1 - خەت",
        "uz": "1 Korinfliklarga",
        "xh": "Eyoku-1 kwabaseKorinte",
        "yi": "1 קאָרינטהיאַנס",
        "yo": "1 Kọ́ríńtì",
        "zu": "1 Korinte"
    },
    "2 Corinthians": {
        "bn": "২ করিন্থীয়",
        "hi": "2 कुरिन्थियों",
        "es": "2 Corintios",
        "ar": "كورنثوس الثانية",
        "fr": "2 Corinthiens",
        "it": "2 Corinzi",
        "de": "2. Korinther",
        "ru": "2 Коринфянам",
        "he": "השנייה לקורינתים",
        "ja": "2 コリント人への手紙",
        "zh": "2 哥林多前书",
        "ko": "고린도후서",
        "pt": "2 Coríntios",
        "tr": "2 Korintliler",
        "id": "2 Korintus",
        "ur": "2 کرنتھیوں",
        "fa": "2 قرنتیان",
        "nl": "2 Korintiërs",
        "pl": "2 Koryntian",
        "uk": "2 Коринтян",
        "vi": "2 Cô-rinh-tô",
        "af": "2 Korintiërs",
        "am": "2ኛ ቆሮንቶስ",
        "as": "২ কৰিন্থীয়া",
        "az": "2 Korinflilər",
        "be": "2 Карынфянаў",
        "bg": "2 Коринтяни",
        "bs": "2 Korinćanima",
        "ca": "2 Corintis",
        "ceb": "2 Corinto",
        "cs": "2 Korintským",
        "cy": "2 Corinthiaid",
        "da": "2 Korintherbrev",
        "el": "Β' Κορινθίους",
        "eo": "2 Korintanoj",
        "et": "2 korintlastele",
        "eu": "2 Korintoarrei",
        "fi": "2 korinttilaisille",
        "fil": "2 Corinto",
        "ga": "2 Corantaigh",
        "gd": "2 Corintianaich",
        "gl": "2 Corintios",
        "gu": "2 કોરીંથી",
        "ha": "2 Korintiyawa",
        "haw": "2 Korineto",
        "hr": "2 Korinćanima",
        "hu": "2 Korinthusi levél",
        "hy": "2 Կորնթացիներ",
        "ig": "2 Ndị Kọrịnt",
        "is": "2. Korintubréf",
        "jv": "2 Korinta",
        "ka": "2 კორინთელები",
        "kk": "2 Қорынттықтар",
        "km": "២ កូរិនថូស",
        "kn": "2 ಕೊರಿಂಥಿಯಾನ್ಸ್",
        "ku": "2 Korîntî",
        "ky": "2 Корунттуктар",
        "la": "2 Corinthians",
        "lo": "2 ໂກລິນໂທ",
        "lt": "2 korintiečiams",
        "lv": "2 korintiešiem",
        "mg": "2 Korintiana",
        "mi": "2 Koriniti",
        "mk": "2 Коринтјани",
        "ml": "2 കൊരിന്ത്യർ",
        "mn": "2 Коринт",
        "mr": "2 करिंथकर",
        "ms": "2 Korintus",
        "mt": "2 Korintin",
        "my": "၂ ကောရိန္သု",
        "ne": "२ कोरिन्थी",
        "no": "2 Korinterbrev",
        "ny": "2 Akorinto",
        "or": "୨ କରିନ୍ଥୀୟ",
        "pa": "2 ਕੁਰਿੰਥੀਆਂ",
        "ps": "2 کورنتیان",
        "ro": "2 Corinteni",
        "rw": "2 Abakorinto",
        "sd": "2 ڪرنٿين",
        "si": "2 කොරින්ති",
        "sk": "2 Korinťanom",
        "sl": "2 Korinčanom",
        "sm": "2 Korinito",
        "sn": "2 VaKorinte",
        "so": "2 Korintos",
        "sq": "2 Korintasve",
        "sr": "2. Коринћанима",
        "st": "2 Bakorinthe",
        "su": "2 Korinta",
        "sv": "2 Korintierbrevet",
        "sw": "2 Wakorintho",
        "ta": "2 கொரிந்தியர்",
        "te": "2 కొరింథీయులు",
        "tg": "2 Қӯринтиён",
        "th": "2 โครินธ์",
        "tk": "2 Korintoslylar",
        "ug": "2 كورىنتلىقلار",
        "uz": "2 Korinfliklarga",
        "xh": "Eyesi-2 kwabaseKorinte",
        "yi": "2 קאָרינטהיאַנס",
        "yo": "2 Kọ́ríńtì",
        "zu": "2 Korinte"
    },
    "Galatians": {
        "bn": "গালাতীয়",
        "hi": "गलातियों",
        "es": "Gálatas",
        "ar": "غلاطية",
        "fr": "Galates",
        "it": "Galati",
        "de": "Galater",
        "ru": "Галатам",
        "he": "אל הגלטים",
        "ja": "ガラテヤ人への手紙",
        "zh": "加拉太书",
        "ko": "갈라디아서",
        "pt": "Gálatas",
        "tr": "Galatyalılar",
        "id": "Galatia",
        "ur": "گلیاتیوں",
        "fa": "گالاتیان",
        "nl": "Galaten",
        "pl": "Galatów",
        "uk": "до Галатів",
        "vi": "người Ga-la-ti",
        "af": "Galasiërs",
        "am": "ገላትያ",
        "as": "গালাতীয়া",
        "az": "Qalatiyalılar",
        "be": "да галатаў",
        "bg": "Галатяни",
        "bs": "Galatians",
        "ca": "Gàlates",
        "ceb": "Mga taga-Galacia",
        "cs": "Galatským",
        "cy": "Galatiaid",
        "da": "Galaterne",
        "el": "Γαλάτες",
        "eo": "Galatoj",
        "et": "galaatlased",
        "eu": "Galatiarrak",
        "fi": "Galatians",
        "fil": "Mga taga-Galacia",
        "ga": "Galataigh",
        "gd": "Galatianaich",
        "gl": "Gálatas",
        "gu": "ગલાતીઓ",
        "ha": "Galatiyawa",
        "haw": "Galatia",
        "hr": "Galaćanima",
        "hu": "Galata levél",
        "hy": "Գաղատացիներ",
        "ig": "Ndị Galetia",
        "is": "Galatabúar",
        "jv": "Galatia",
        "ka": "გალატელები",
        "kk": "Галатиялықтар",
        "km": "កាឡាទី",
        "kn": "ಗಲಾಟಿಯನ್ಸ್",
        "ku": "Galatî",
        "ky": "Галатиялыктар",
        "la": "Galatians",
        "lo": "ຄາລາເຕຍ",
        "lt": "galatai",
        "lv": "galatieši",
        "mg": "Galatianina",
        "mi": "Karatia",
        "mk": "Галатјаните",
        "ml": "ഗലാത്യർ",
        "mn": "Галатчууд",
        "mr": "गॅलेशियन्स",
        "ms": "Galatia",
        "mt": "Galatin",
        "my": "ဂလာတိ",
        "ne": "गलाटियनहरू",
        "no": "Galaterne",
        "ny": "Agalatiya",
        "or": "ଗାଲାତୀୟମାନେ |",
        "pa": "ਗਲਾਟੀਆਂ",
        "ps": "ګالاتیان",
        "ro": "Galateni",
        "rw": "Abagalatiya",
        "sd": "گلتين",
        "si": "ගලාතියන්",
        "sk": "Galaťanom",
        "sl": "Galačanom",
        "sm": "Kalatia",
        "sn": "vaGaratia",
        "so": "Galatiya",
        "sq": "Galatasve",
        "sr": "Галатима",
        "st": "Bagalata",
        "su": "Galata",
        "sv": "Galaterbrevet",
        "sw": "Wagalatia",
        "ta": "கலாத்தியர்கள்",
        "te": "గలతీయులు",
        "tg": "галатиён",
        "th": "ชาวกาลาเทีย",
        "tk": "Galatýalylar",
        "ug": "گالاتىيالىقلار",
        "uz": "Galatiyaliklar",
        "xh": "kwabaseGalati",
        "yi": "גאַלאַטיאַנס",
        "yo": "Galatia",
        "zu": "KwabaseGalathiya"
    },
    "Ephesians": {
        "bn": "ইফিষীয়",
        "hi": "इफिसियों",
        "es": "Efesios",
        "ar": "أفسس",
        "fr": "Éphésiens",
        "it": "Efesini",
        "de": "Epheser",
        "ru": "Ефесянам",
        "he": "אל האפסים",
        "ja": "エペソ人への手紙",
        "zh": "以弗所书",
        "ko": "에베소서",
        "pt": "Efésios",
        "tr": "Efesliler",
        "id": "Efesus",
        "ur": "افسیوں",
        "fa": "افسسیان",
        "nl": "Efeziërs",
        "pl": "Efezjan",
        "uk": "Ефесянам",
        "vi": "Ê-phê-sô",
        "af": "Efesiërs",
        "am": "ኤፌሶን",
        "as": "ইফিচীয়া",
        "az": "Efeslilər",
        "be": "да Эфесянаў",
        "bg": "Ефесяни",
        "bs": "Efescima",
        "ca": "Efesis",
        "ceb": "Mga Taga-Efeso",
        "cs": "Efezským",
        "cy": "Ephesiaid",
        "da": "Efeserne",
        "el": "Εφεσίους",
        "eo": "Efesanoj",
        "et": "Efeslased",
        "eu": "Efesoarrak",
        "fi": "efesolaisille",
        "fil": "Mga Taga-Efeso",
        "ga": "Eifisigh",
        "gd": "Ephesianaich",
        "gl": "Efesios",
        "gu": "એફેસિઅન્સ",
        "ha": "Afisawa",
        "haw": "Epeso",
        "hr": "Efežanima",
        "hu": "Efézusi levél",
        "hy": "Եփեսացիներ",
        "ig": "Ndị Efesọs",
        "is": "Efesusbréfið",
        "jv": "Efesus",
        "ka": "ეფესოელები",
        "kk": "Ефестіктерге",
        "km": "អេភេសូរ",
        "kn": "ಎಫೆಸಿಯನ್ಸ್",
        "ku": "Efesî",
        "ky": "Эфестиктерге",
        "la": "Ephesii",
        "lo": "ເອເຟໂຊ",
        "lt": "Efeziečiams",
        "lv": "Efeziešiem",
        "mg": "Efesianina",
        "mi": "Epeha",
        "mk": "Ефесјаните",
        "ml": "എഫേസിയക്കാർ",
        "mn": "Ефесчүүд",
        "mr": "इफिशियन्स",
        "ms": "Efesus",
        "mt": "Efesin",
        "my": "ဧဖက်",
        "ne": "एफिसीहरू",
        "no": "Efeserne",
        "ny": "Aefeso",
        "or": "ଏଫିସୀୟ",
        "pa": "ਅਫ਼ਸੀਆਂ",
        "ps": "افسان",
        "ro": "Efeseni",
        "rw": "Abefeso",
        "sd": "افسيون",
        "si": "එපීසියානුවන්",
        "sk": "Efezanom",
        "sl": "Efežanom",
        "sm": "Efeso",
        "sn": "vaEfeso",
        "so": "Efesos",
        "sq": "Efesianëve",
        "sr": "Ефесцима",
        "st": "Baefese",
        "su": "Urang Epesus",
        "sv": "Efesierbrevet",
        "sw": "Waefeso",
        "ta": "எபேசியர்கள்",
        "te": "ఎఫెసియన్స్",
        "tg": "Эфсӯсиён",
        "th": "เอเฟซัส",
        "tk": "Efesliler",
        "ug": "ئەفەسلىكلەر",
        "uz": "Efesliklar",
        "xh": "Kwabase-Efese",
        "yi": "עפעזער",
        "yo": "Efesu",
        "zu": "Kwabase-Efesu"
    },
    "Philippians": {
        "bn": "ফিলিপীয়",
        "hi": "फिलिप्पियों",
        "es": "Filipenses",
        "ar": "فيلبي",
        "fr": "Philippiens",
        "it": "Filippesi",
        "de": "Philipper",
        "ru": "Филиппийцам",
        "he": "אל הפיליפים",
        "ja": "ピリピ人への手紙",
        "zh": "腓立比书",
        "ko": "빌립보서",
        "pt": "Filipenses",
        "tr": "Filipililer",
        "id": "Filipi",
        "ur": "فلپیئنز",
        "fa": "فیلیپیایی ها",
        "nl": "Filippenzen",
        "pl": "Filipian",
        "uk": "Філіппійцям",
        "vi": "người Phi-líp",
        "af": "Filippense",
        "am": "ፊልጵስዩስ",
        "as": "ফিলিপীয়া",
        "az": "Filippililər",
        "be": "Піліпянаў",
        "bg": "Филипяни",
        "bs": "Filipljanima",
        "ca": "Filipenses",
        "ceb": "Mga taga-Filipos",
        "cs": "Filipským",
        "cy": "Philipiaid",
        "da": "Filipperne",
        "el": "Φιλίππους",
        "eo": "Filipianoj",
        "et": "Filiplased",
        "eu": "filipiarrak",
        "fi": "filippiläiset",
        "fil": "Mga Pilipino",
        "ga": "Filipigh",
        "gd": "Philipianaich",
        "gl": "Filipenses",
        "gu": "ફિલિપિયન્સ",
        "ha": "Filibiyawa",
        "haw": "Pilipi",
        "hr": "Filipljanima",
        "hu": "Filippiek",
        "hy": "Փիլիպպեցիներ",
        "ig": "Ndị Filipaị",
        "is": "Filippíbúar",
        "jv": "wong Filipi",
        "ka": "ფილიპელები",
        "kk": "Филиппиялықтар",
        "km": "ភីលីព",
        "kn": "ಫಿಲಿಪ್ಪಿಯನ್ನರು",
        "ku": "Filîpî",
        "ky": "Филиппиялыктар",
        "la": "Philippians",
        "lo": "ຟີລິບປອຍ",
        "lt": "Filipiečiai",
        "lv": "filipieši",
        "mg": "Filipiana",
        "mi": "Piripi",
        "mk": "Филипјаните",
        "ml": "ഫിലിപ്പിയക്കാർ",
        "mn": "Филиппичүүд",
        "mr": "फिलिप्पियन",
        "ms": "Filipi",
        "mt": "Filippin",
        "my": "ဖိလိပ္ပိ",
        "ne": "फिलिपिन्स",
        "no": "Filipperne",
        "ny": "Afilipi",
        "or": "ଫିଲିପ୍ପୀୟମାନେ",
        "pa": "ਫਿਲੀਪੀਆਈ",
        "ps": "فیلیپین",
        "ro": "Filipeni",
        "rw": "Abafilipi",
        "sd": "فلپين",
        "si": "පිලිප්පියන්",
        "sk": "Filipským",
        "sl": "Filipljanom",
        "sm": "Filipi",
        "sn": "vaFiripi",
        "so": "Filibiin",
        "sq": "Filipianëve",
        "sr": "Филипљанима",
        "st": "Bafilipi",
        "su": "urang Pilipi",
        "sv": "Filipperna",
        "sw": "Wafilipi",
        "ta": "பிலிப்பியர்கள்",
        "te": "ఫిలిప్పీయులు",
        "tg": "Филиппиён",
        "th": "ฟิลิปปี",
        "tk": "Filipililer",
        "ug": "فىلىپىلىكلەر",
        "uz": "Filippiliklar",
        "xh": "KwabaseFilipi",
        "yi": "פיליפינען",
        "yo": "Fílípì",
        "zu": "AbaseFilipi"
    },
    "Colossians": {
        "bn": "কলসীয়",
        "hi": "कुलुस्सियों",
        "es": "Colosenses",
        "ar": "كولوسي",
        "fr": "Colossiens",
        "it": "Colossesi",
        "de": "Kolosser",
        "ru": "Колоссянам",
        "he": "אל הקולוסים",
        "ja": "コロサイ人への手紙",
        "zh": "歌罗西书",
        "ko": "골로새서",
        "pt": "Colossenses",
        "tr": "Koloseliler",
        "id": "Kolose",
        "ur": "کولسیوں",
        "fa": "کولوسیان",
        "nl": "Kolossenzen",
        "pl": "Kolosan",
        "uk": "Колосян",
        "vi": "Cô-lô-se",
        "af": "Kolossense",
        "am": "ቆላስይስ",
        "as": "কলচীয়া",
        "az": "Koloslular",
        "be": "Коласаў",
        "bg": "Колосяни",
        "bs": "Kološanima",
        "ca": "Colossencs",
        "ceb": "Mga taga-Colosas",
        "cs": "Kolosané",
        "cy": "Colosiaid",
        "da": "Kolosserne",
        "el": "Κολοσσαείς",
        "eo": "Kolosanoj",
        "et": "koloslased",
        "eu": "Kolosarrak",
        "fi": "kolossalaiset",
        "fil": "Mga taga-Colosas",
        "ga": "Colosaigh",
        "gd": "Colosianaich",
        "gl": "Colosenses",
        "gu": "કોલોસીયન",
        "ha": "Kolosiyawa",
        "haw": "Kolosa",
        "hr": "Kološanima",
        "hu": "kolossziaiak",
        "hy": "Կողոսացիներ",
        "ig": "Ndị Kọlọsi",
        "is": "Kólossubúar",
        "jv": "Kolose",
        "ka": "კოლოსელები",
        "kk": "Колостықтар",
        "km": "កូល៉ុស",
        "kn": "ಕೊಲೊಸ್ಸಿಯನ್ನರು",
        "ku": "Kolosî",
        "ky": "Колоссалыктар",
        "la": "Colossenses",
        "lo": "ໂຄໂລຊາຍ",
        "lt": "Kolosiečiai",
        "lv": "Kolosieši",
        "mg": "Kolosiana",
        "mi": "Kolosa",
        "mk": "Колосјаните",
        "ml": "കൊലോസിയക്കാർ",
        "mn": "Колоссайчууд",
        "mr": "Colossians",
        "ms": "Kolose",
        "mt": "Kolossin",
        "my": "ကောလောသဲမြို့",
        "ne": "कोलोसियनहरू",
        "no": "Kolosserne",
        "ny": "Akolose",
        "or": "କଲସୀୟ",
        "pa": "ਕੁਲਸੀਆਂ",
        "ps": "کولسیان",
        "ro": "Coloseni",
        "rw": "Abakolosayi",
        "sd": "ڪولوسين",
        "si": "කොලොස්සියන්",
        "sk": "Kolosanov",
        "sl": "Kološanom",
        "sm": "Kolose",
        "sn": "VaKorose",
        "so": "Kolosay",
        "sq": "kolosianëve",
        "sr": "Колошанима",
        "st": "Bakolose",
        "su": "Kolosa",
        "sv": "Kolosserna",
        "sw": "Wakolosai",
        "ta": "கோலோச்சியர்கள்",
        "te": "కొలొస్సియన్లు",
        "tg": "Колосаиён",
        "th": "โคโลสี",
        "tk": "Koloseliler",
        "ug": "كولوسىلىقلار",
        "uz": "Kolosaliklar",
        "xh": "KwabaseKolose",
        "yi": "קאָלאָססיאַנס",
        "yo": "Kolosse",
        "zu": "AbaseKolose"
    },
    "1 Thessalonians": {
        "bn": "১ থিষলনীকীয়",
        "hi": "1 थिस्सलुनीकियों",
        "es": "1 Tesalonicenses",
        "ar": "تسالونيكي الأولى",
        "fr": "1 Thessaloniciens",
        "it": "1 Tessalonicesi",
        "de": "1. Thessalonicher",
        "ru": "1 Фессалоникийцам",
        "he": "הראשונה לתסלוניקים",
        "ja": "1 テサロニケ人への手紙",
        "zh": "1 帖撒罗尼迦前书",
        "ko": "데살로니가전서",
        "pt": "1 Tessalonicenses",
        "tr": "1 Selanikliler",
        "id": "1 Tesalonika",
        "ur": "1 تھیسالونیکی",
        "fa": "1 تسالونیکیان",
        "nl": "1 Thessalonicenzen",
        "pl": "1 Tesaloniczan",
        "uk": "1 Фессалонікійців",
        "vi": "1 người Tê-sa-lô-ni-ca",
        "af": "1 Tessalonisense",
        "am": "1 ተሰሎንቄ",
        "as": "১ থিচলনীকীয়া",
        "az": "1 Saloniklilər",
        "be": "1 Фесаланікійцаў",
        "bg": "1 Солунци",
        "bs": "1. Solunjanima",
        "ca": "1 Tessalonicencs",
        "ceb": "1 Tesalonica",
        "cs": "1 Soluňským",
        "cy": "1 Thesaloniaid",
        "da": "1 Thessaloniker",
        "el": "1 Θεσσαλονικείς",
        "eo": "1 Tesalonikanoj",
        "et": "1 Tessalooniklastele",
        "eu": "1 Tesalonikarrei",
        "fi": "1 tessalonikalaisille",
        "fil": "1 Tesalonica",
        "ga": "1 Teasalónaigh",
        "gd": "1 Tesalònianaich",
        "gl": "1 Tesalonicenses",
        "gu": "1 થેસ્સાલોનીકો",
        "ha": "1 Tassalunikawa",
        "haw": "1 Tesalonike",
        "hr": "1 Solunjanima",
        "hu": "1 Thessalonika",
        "hy": "1 Թեսաղոնիկեցիներ",
        "ig": "1 Ndị Tesalonaịka",
        "is": "1 Þessaloníkubréf",
        "jv": "1 Tesalonika",
        "ka": "1 თესალონიკელები",
        "kk": "1 Салоникалықтар",
        "km": "១ ថែស្សាឡូនីច",
        "kn": "1 ಥೆಸಲೊನೀಕದವರು",
        "ku": "1 Selanîkî",
        "ky": "1 Тесалоникалыктар",
        "la": "1 Thessalonians",
        "lo": "1 ເທຊະໂລນີກ",
        "lt": "1 Tesalonikiečiams",
        "lv": "1 Tesaloniķiešiem",
        "mg": "1 Tesaloniana",
        "mi": "1 Teharonika",
        "mk": "1 Солунјаните",
        "ml": "1 തെസ്സലൊനീക്യർ",
        "mn": "1 Тесалоникчууд",
        "mr": "1 थेस्सलनीकाकर",
        "ms": "1 Tesalonika",
        "mt": "1 Tessalonikin",
        "my": "သက်သာလောနိတ် ၁",
        "ne": "१ थेसलोनिकी",
        "no": "1 Tessalonikerbrev",
        "ny": "1 Atesalonika",
        "or": "1 ଥେସଲନୀକୀୟ",
        "pa": "1 ਥੱਸਲੁਨੀਕੀਆਂ",
        "ps": "۱ـ تیسالونیان",
        "ro": "1 Tesaloniceni",
        "rw": "1 Abatesalonike",
        "sd": "1 ٿيسلونيڪين",
        "si": "1 තෙසලෝනික",
        "sk": "1 Tesaloničanom",
        "sl": "1 Tesaloničanom",
        "sm": "1 Tesalonia",
        "sn": "1 VaTesaronika",
        "so": "1 Tesaloniika",
        "sq": "1 Thesalonikasve",
        "sr": "1. Солуњанима",
        "st": "1 Bathesalonika",
        "su": "1 Tesalonika",
        "sv": "1 Tessalonikerbrevet",
        "sw": "1 Wathesalonike",
        "ta": "1 தெசலோனிக்கேயர்",
        "te": "1 థెస్సలొనీకయులు",
        "tg": "1 Таслӯникиён",
        "th": "1 เธสะโลนิกา",
        "tk": "1 Selanikliler",
        "ug": "1 سالونىكالىقلارغا",
        "uz": "1 Salonikaliklar",
        "xh": "Eyoku-1 kwabaseTesalonika",
        "yi": "1 טהעססאַלאָניאַנס",
        "yo": "1 Tẹsalóníkà",
        "zu": "1 Thesalonika"
    },
    "2 Thessalonians": {
        "bn": "২ থিষলনীকীয়",
        "hi": "2 थिस्सलुनीकियों",
        "es": "2 Tesalonicenses",
        "ar": "تسالونيكي الثانية",
        "fr": "2 Thessaloniciens",
        "it": "2 Tessalonicesi",
        "de": "2. Thessalonicher",
        "ru": "2 Фессалоникийцам",
        "he": "השנייה לתסלוניקים",
        "ja": "2 テサロニケ人への手紙",
        "zh": "2 帖撒罗尼迦前书",
        "ko": "데살로니가후서",
        "pt": "2 Tessalonicenses",
        "tr": "2 Selanikli",
        "id": "2 Tesalonika",
        "ur": "2 تھیسالونیکی",
        "fa": "2 تسالونیکیان",
        "nl": "2 Thessalonicenzen",
        "pl": "2 Tesaloniczan",
        "uk": "2 Фессалонікійців",
        "vi": "2 người Tê-sa-lô-ni-ca",
        "af": "2 Tessalonisense",
        "am": "2 ተሰሎንቄ",
        "as": "২ থিচলনীকীয়া",
        "az": "2 Saloniklilər",
        "be": "2 Фесаланікійцаў",
        "bg": "2 Солунци",
        "bs": "2 Solunjanima",
        "ca": "2 Tessalonicencs",
        "ceb": "2 Tesalonica",
        "cs": "2 Thessalonians",
        "cy": "2 Thesaloniaid",
        "da": "2 Thessaloniker",
        "el": "2 Θεσσαλονικείς",
        "eo": "2 Tesalonikanoj",
        "et": "2 Tessalooniklastele",
        "eu": "2 Tesalonikarrei",
        "fi": "2 tessalonikalaisille",
        "fil": "2 Tesalonica",
        "ga": "2 Teasalónaigh",
        "gd": "2 Tesalònianaich",
        "gl": "2 Tesalonicenses",
        "gu": "2 થેસ્સાલોનીકો",
        "ha": "2 Tassalunikawa",
        "haw": "2 Tesalonike",
        "hr": "2 Solunjanima",
        "hu": "2 Thesszalonikai levél",
        "hy": "2 Թեսաղոնիկեցիներ",
        "ig": "2 Ndị Tesalonaịka",
        "is": "2 Þessaloníkubréf",
        "jv": "2 Tesalonika",
        "ka": "2 თესალონიკელები",
        "kk": "2 Салоникалықтар",
        "km": "២ ថែស្សាឡូនីច",
        "kn": "2 ಥೆಸಲೊನೀಕದವರು",
        "ku": "2 Selanîkî",
        "ky": "2 Тесалоникалыктар",
        "la": "2 Thessalonians",
        "lo": "2 ເທຊະໂລນີກ",
        "lt": "2 Tesalonikiečiams",
        "lv": "2 tesaloniķiešiem",
        "mg": "2 Tesaloniana",
        "mi": "2 Teharonika",
        "mk": "2 Солунјани",
        "ml": "2 തെസ്സലൊനീക്യർ",
        "mn": "2 Тесалоникчууд",
        "mr": "2 थेस्सलनी",
        "ms": "2 Tesalonika",
        "mt": "2 Tessalonikin",
        "my": "သက်သာလောနိတ် ၂",
        "ne": "२ थेसलोनिकी",
        "no": "2 Tessalonikerbrev",
        "ny": "2 Atesalonika",
        "or": "2 ଥେସଲନୀକୀୟ",
        "pa": "2 ਥੱਸਲੁਨੀਕੀਆਂ",
        "ps": "2 Thessalonians",
        "ro": "2 Tesaloniceni",
        "rw": "2 Abatesalonike",
        "sd": "2 ٿيسلونيڪين",
        "si": "2 තෙසලෝනික",
        "sk": "2 Tesaloničanom",
        "sl": "2 Tesaloničanom",
        "sm": "2 Tesalonia",
        "sn": "2 VaTesaronika",
        "so": "2 Tesaloniika",
        "sq": "2 Thesalonikasve",
        "sr": "2 Солуњанима",
        "st": "2 Bathesalonika",
        "su": "2 Tesalonika",
        "sv": "2 Tessalonikerbrevet",
        "sw": "2 Wathesalonike",
        "ta": "2 தெசலோனிக்கேயர்",
        "te": "2 థెస్సలొనీకయులు",
        "tg": "2 Таслӯникиён",
        "th": "2 เธสะโลนิกา",
        "tk": "2 Selanikliler",
        "ug": "2 سالونىكالىقلارغا",
        "uz": "2 Salonikaliklarga",
        "xh": "Eyesi-2 kwabaseTesalonika",
        "yi": "2 טהעססאַלאָניאַנס",
        "yo": "2 Tẹsalóníkà",
        "zu": "2 Thesalonika"
    },
    "1 Timothy": {
        "bn": "১ তীমথিয়",
        "hi": "1 तीमुथियुस",
        "es": "1 Timoteo",
        "ar": "تيموثاوس الأولى",
        "fr": "1 Timothée",
        "it": "1 Timoteo",
        "de": "1. Timotheus",
        "ru": "1 Тимофею",
        "he": "הראשונה לטימותיוס",
        "ja": "1 テモテ",
        "zh": "1 提摩太",
        "ko": "디모데전서",
        "pt": "1 Timóteo",
        "tr": "1 Timoteos",
        "id": "1 Timotius",
        "ur": "1 تیمتھیس",
        "fa": "1 تیموتائوس",
        "nl": "1 Timotheüs",
        "pl": "1 Tymoteusz",
        "uk": "1 Тимофію",
        "vi": "1 Ti-mô-thê",
        "af": "1 Timoteus",
        "am": "1 ጢሞቴዎስ",
        "as": "১ তীমথিয়",
        "az": "1 Timotey",
        "be": "1 Цімафею",
        "bg": "1 Тимотей",
        "bs": "1. Timothy",
        "ca": "1 Timoteu",
        "ceb": "1 Timoteo",
        "cs": "1 Timothy",
        "cy": "1 Timotheus",
        "da": "1 Timoteus",
        "el": "1 Τιμόθεος",
        "eo": "1 Timoteo",
        "et": "1 Timoteos",
        "eu": "1 Timoteo",
        "fi": "1 Timoteus",
        "fil": "1 Timoteo",
        "ga": "1 Tiomóid",
        "gd": "1 Timoteus",
        "gl": "1 Timoteo",
        "gu": "1 ટીમોથી",
        "ha": "1 Timothawus",
        "haw": "1 Timoteo",
        "hr": "1. Timoteju",
        "hu": "1 Timóteus",
        "hy": "1 Տիմոթեոս",
        "ig": "1 Timoti",
        "is": "1 Tímóteus",
        "jv": "1 Timotius",
        "ka": "1 ტიმოთე",
        "kk": "1 Тімоте",
        "km": "១ ធីម៉ូថេ",
        "kn": "1 ತಿಮೋತಿ",
        "ku": "1 Tîmotêyos",
        "ky": "1 Тиметей",
        "la": "1 Timothy",
        "lo": "1 ຕີໂມເຕ",
        "lt": "1 Timotiejus",
        "lv": "1 Timotejs",
        "mg": "1 Timoty",
        "mi": "1 Timoti",
        "mk": "1 Тимотеј",
        "ml": "1 തിമോത്തി",
        "mn": "1 Тимот",
        "mr": "1 तीमथ्य",
        "ms": "1 Timotius",
        "mt": "1 Timotju",
        "my": "၁ တိမောသေ",
        "ne": "1 तिमोथी",
        "no": "1 Timoteus",
        "ny": "1 Timoteyo",
        "or": "1 ତୀମଥି |",
        "pa": "1 ਤਿਮੋਥਿਉਸ",
        "ps": "1 تیموتیس",
        "ro": "1 Timotei",
        "rw": "1 Timoteyo",
        "sd": "1 تيمٿيس",
        "si": "1 තිමෝති",
        "sk": "1 Timotejovi",
        "sl": "1 Timoteju",
        "sm": "1 Timoteo",
        "sn": "1 Timotio",
        "so": "1 Timoteyos",
        "sq": "1 Timoteut",
        "sr": "1. Тимотеју",
        "st": "1 Timothea",
        "su": "1 Timoteus",
        "sv": "1 Timoteus",
        "sw": "1 Timotheo",
        "ta": "1 தீமோத்தேயு",
        "te": "1 తిమోతి",
        "tg": "1 Тимотиюс",
        "th": "1 ทิโมธี",
        "tk": "1 Timoteos",
        "ug": "1 تىموتىي",
        "uz": "1 Timo'tiy",
        "xh": "Eyoku-1 kuTimoti",
        "yi": "1 טימאטעאוס",
        "yo": "1 Timoteu",
        "zu": "1 Thimothewu"
    },
    "2 Timothy": {
        "bn": "২ তীমথিয়",
        "hi": "2 तीमुथियुस",
        "es": "2 Timoteo",
        "ar": "تيموثاوس الثانية",
        "fr": "2 Timothée",
        "it": "2 Timoteo",
        "de": "2. Timotheus",
        "ru": "2 Тимофею",
        "he": "השנייה לטימותיוס",
        "ja": "2 テモテ",
        "zh": "2 提摩太",
        "ko": "디모데후서",
        "pt": "2 Timóteo",
        "tr": "2 Timoteos",
        "id": "2 Timotius",
        "ur": "2 تیمتھیس",
        "fa": "2 تیموتائوس",
        "nl": "2 Timotheüs",
        "pl": "2 Tymoteusz",
        "uk": "2 Тимофію",
        "vi": "2 Ti-mô-thê",
        "af": "2 Timoteus",
        "am": "2 ጢሞቴዎስ",
        "as": "২ তীমথিয়",
        "az": "2 Timotey",
        "be": "2 Цімафею",
        "bg": "2 Тимотей",
        "bs": "2 Timothy",
        "ca": "2 Timoteu",
        "ceb": "2 Timoteo",
        "cs": "2 Timothy",
        "cy": "2 Timotheus",
        "da": "2 Timothy",
        "el": "2 Τιμόθεος",
        "eo": "2 Timoteo",
        "et": "2 Timoteos",
        "eu": "2 Timoteo",
        "fi": "2 Timoteus",
        "fil": "2 Timoteo",
        "ga": "2 Tiomóid",
        "gd": "2 Timoteus",
        "gl": "2 Timoteo",
        "gu": "2 ટીમોથી",
        "ha": "2 Timothawus",
        "haw": "2 Timoteo",
        "hr": "2 Timoteju",
        "hu": "2 Timóteus",
        "hy": "2 Տիմոթեոս",
        "ig": "2 Timoti",
        "is": "2 Tímóteus",
        "jv": "2 Timotius",
        "ka": "2 ტიმოთე",
        "kk": "2 Тімоте",
        "km": "២ ធីម៉ូថេ",
        "kn": "2 ತಿಮೋತಿ",
        "ku": "2 Tîmotêyos",
        "ky": "2 Тиметей",
        "la": "2 Timothy",
        "lo": "2 ຕີໂມເຕ",
        "lt": "2 Timotiejus",
        "lv": "2 Timotejs",
        "mg": "2 Timoty",
        "mi": "2 Timoti",
        "mk": "2 Тимотеј",
        "ml": "2 തിമോത്തി",
        "mn": "2 Тимот",
        "mr": "2 तीमथ्य",
        "ms": "2 Timotius",
        "mt": "2 Timotju",
        "my": "၂ တိမောသေ",
        "ne": "२ तिमोथी",
        "no": "2 Timoteus",
        "ny": "2 Timoteyo",
        "or": "୨ ତୀମଥି",
        "pa": "2 ਤਿਮੋਥਿਉਸ",
        "ps": "2 تیموتیس",
        "ro": "2 Timotei",
        "rw": "2 Timoteyo",
        "sd": "2 تيمٿيس",
        "si": "2 තිමෝති",
        "sk": "2 Timotejovi",
        "sl": "2 Timoteju",
        "sm": "2 Timoteo",
        "sn": "2 Timotio",
        "so": "2 Timoteyos",
        "sq": "2 Timoteut",
        "sr": "2 Тимотеју",
        "st": "2 Timothea",
        "su": "2 Timoteus",
        "sv": "2 Timothy",
        "sw": "2 Timotheo",
        "ta": "2 தீமோத்தேயு",
        "te": "2 తిమోతి",
        "tg": "2 Тимотиюс",
        "th": "2 ทิโมธี",
        "tk": "2 Timoteos",
        "ug": "2 تىموتىي",
        "uz": "2 Timo'tiy",
        "xh": "Eyesi-2 kuTimoti",
        "yi": "2 טימאטעאוס",
        "yo": "2 Timoteu",
        "zu": "2 KuThimothi"
    },
    "Titus": {
        "bn": "তীত",
        "hi": "तीतुस",
        "es": "Tito",
        "ar": "تيطس",
        "fr": "Tite",
        "it": "Tito",
        "de": "Titus",
        "ru": "Титу",
        "he": "אל טיטוס",
        "ja": "タイタス",
        "zh": "提图斯",
        "ko": "디도",
        "pt": "Tito",
        "tr": "Titus",
        "id": "Titus",
        "ur": "ٹائٹس",
        "fa": "تیتوس",
        "nl": "Titus",
        "pl": "Tytus",
        "uk": "Тит",
        "vi": "Tít",
        "af": "Titus",
        "am": "ቲቶ",
        "as": "টাইটাছ",
        "az": "Titus",
        "be": "Ціт",
        "bg": "Тит",
        "bs": "Titus",
        "ca": "Titus",
        "ceb": "Titus",
        "cs": "Titus",
        "cy": "Titus",
        "da": "Titus",
        "el": "Τίτου",
        "eo": "Tito",
        "et": "Tiitus",
        "eu": "Tito",
        "fi": "Titus",
        "fil": "Titus",
        "ga": "Titus",
        "gd": "Titus",
        "gl": "Tito",
        "gu": "ટાઇટસ",
        "ha": "Titus",
        "haw": "Tito",
        "hr": "Tite",
        "hu": "Titusz",
        "hy": "Տիտոս",
        "ig": "Taịtọs",
        "is": "Titus",
        "jv": "Titus",
        "ka": "ტიტუს",
        "kk": "Тит",
        "km": "ទីតុស",
        "kn": "ಟೈಟಸ್",
        "ku": "Titus",
        "ky": "Тит",
        "la": "Titus",
        "lo": "ຕີໂຕ",
        "lt": "Titas",
        "lv": "Tituss",
        "mg": "Titus",
        "mi": "Taituha",
        "mk": "Титус",
        "ml": "ടൈറ്റസ്",
        "mn": "Тит",
        "mr": "तीत",
        "ms": "Titus",
        "mt": "Titu",
        "my": "တိတု",
        "ne": "टाइटस",
        "no": "Titus",
        "ny": "Tito",
        "or": "ଟିଟସ୍ |",
        "pa": "ਟਾਈਟਸ",
        "ps": "ټایټس",
        "ro": "Titus",
        "rw": "Tito",
        "sd": "ٽائيٽس",
        "si": "ටයිටස්",
        "sk": "Titus",
        "sl": "Titus",
        "sm": "Tito",
        "sn": "Tito",
        "so": "Tiitos",
        "sq": "Titit",
        "sr": "Титус",
        "st": "Tite",
        "su": "Titus",
        "sv": "Titus",
        "sw": "Tito",
        "ta": "டைட்டஸ்",
        "te": "టైటస్",
        "tg": "Титус",
        "th": "ติตัส",
        "tk": "Tit",
        "ug": "Titus",
        "uz": "Titus",
        "xh": "uTito",
        "yi": "טיטוס",
        "yo": "Titu",
        "zu": "Thithu"
    },
    "Philemon": {
        "bn": "ফিলীমন",
        "hi": "फिलेमोन",
        "es": "Filemón",
        "ar": "فليمون",
        "fr": "Philémon",
        "it": "Filemone",
        "de": "Philemon",
        "ru": "Филимону",
        "he": "אל פילימון",
        "ja": "フィレモン",
        "zh": "腓利门",
        "ko": "빌레몬",
        "pt": "Filemom",
        "tr": "Filomon",
        "id": "Filemon",
        "ur": "فلیمون",
        "fa": "فیلیمون",
        "nl": "Filemon",
        "pl": "Filemon",
        "uk": "Филимон",
        "vi": "Phi-lê-môn",
        "af": "Filemon",
        "am": "ፊልሞን",
        "as": "ফিলিমন",
        "az": "Filimon",
        "be": "Філімон",
        "bg": "Филимон",
        "bs": "Philemon",
        "ca": "Filemó",
        "ceb": "Filemon",
        "cs": "Filemon",
        "cy": "Philemon",
        "da": "Filemon",
        "el": "Φιλήμων",
        "eo": "Filemono",
        "et": "Philemon",
        "eu": "Filemon",
        "fi": "Philemon",
        "fil": "Filemon",
        "ga": "Philemon",
        "gd": "Philemon",
        "gl": "Filemón",
        "gu": "ફિલેમોન",
        "ha": "Filemon",
        "haw": "Pilemona",
        "hr": "Filemon",
        "hu": "Philemon",
        "hy": "Փիլիմոն",
        "ig": "Faịlimọn",
        "is": "Fílemon",
        "jv": "Filemon",
        "ka": "ფილიმონი",
        "kk": "Филемон",
        "km": "ភីលេម៉ូន",
        "kn": "ಫಿಲೆಮನ್",
        "ku": "Philemon",
        "ky": "Филемон",
        "la": "Philemon",
        "lo": "ຟີເລໂມນ",
        "lt": "Filemonas",
        "lv": "Filemons",
        "mg": "Filemona",
        "mi": "Ko Pirimona",
        "mk": "Филимон",
        "ml": "ഫിലേമോൻ",
        "mn": "Филемон",
        "mr": "फिलेमोन",
        "ms": "Filemon",
        "mt": "Filemon",
        "my": "ဖိလေမုန်",
        "ne": "फिलेमोन",
        "no": "Filemon",
        "ny": "Filemoni",
        "or": "ଫିଲିମନ୍ |",
        "pa": "ਫਿਲੇਮੋਨ",
        "ps": "فیلیمون",
        "ro": "Filemon",
        "rw": "Filemoni",
        "sd": "فليمون",
        "si": "ෆිලෙමොන්",
        "sk": "Filemon",
        "sl": "Filemon",
        "sm": "Filemoni",
        "sn": "Firimoni",
        "so": "Filemon",
        "sq": "Filemon",
        "sr": "Пхилемон",
        "st": "Filemone",
        "su": "Filemon",
        "sv": "Filemon",
        "sw": "Filemoni",
        "ta": "பிலிமோன்",
        "te": "ఫిలేమోన్",
        "tg": "Филемӯн",
        "th": "ฟิเลโมน",
        "tk": "Filemon",
        "ug": "Filemon",
        "uz": "Filimon",
        "xh": "Filemon",
        "yi": "פילעמאָן",
        "yo": "Filemoni",
        "zu": "uFilemoni"
    },
    "Hebrews": {
        "bn": "ইব্রীয়",
        "hi": "इब्रानियों",
        "es": "Hebreos",
        "ar": "العبرانيين",
        "fr": "Hébreux",
        "it": "Ebrei",
        "de": "Hebräer",
        "ru": "Евреям",
        "he": "אל העברים",
        "ja": "ヘブライ人への手紙",
        "zh": "希伯来书",
        "ko": "히브리서",
        "pt": "Hebreus",
        "tr": "İbraniler",
        "id": "Ibrani",
        "ur": "عبرانیوں",
        "fa": "عبرانیان",
        "nl": "Hebreeën",
        "pl": "Hebrajczyków",
        "uk": "Євреям",
        "vi": "tiếng Do Thái",
        "af": "Hebreërs",
        "am": "ዕብራውያን",
        "as": "ইব্ৰীসকল",
        "az": "İbranilər",
        "be": "Габрэі",
        "bg": "Евреи",
        "bs": "Hebrejima",
        "ca": "hebreus",
        "ceb": "Mga Hebreohanon",
        "cs": "Hebrejci",
        "cy": "Hebreaid",
        "da": "hebræere",
        "el": "Εβραίους",
        "eo": "hebreoj",
        "et": "heebrealased",
        "eu": "hebrearrak",
        "fi": "heprealaiset",
        "fil": "Mga Hebreo",
        "ga": "Eabhraigh",
        "gd": "Eabhruidhich",
        "gl": "hebreos",
        "gu": "હીબ્રુઓ",
        "ha": "Ibraniyawa",
        "haw": "Hebera",
        "hr": "Hebrejima",
        "hu": "héberek",
        "hy": "Եբրայեցիները",
        "ig": "Ndị Hibru",
        "is": "Hebrear",
        "jv": "wong Ibrani",
        "ka": "ებრაელები",
        "kk": "Еврейлер",
        "km": "ហេព្រើរ",
        "kn": "ಹೀಬ್ರೂಗಳು",
        "ku": "Îbranî",
        "ky": "еврейлер",
        "la": "Hebrews",
        "lo": "ເຮັບເຣີ",
        "lt": "hebrajų",
        "lv": "ebreji",
        "mg": "Hebreo",
        "mi": "Hiperu",
        "mk": "Евреите",
        "ml": "എബ്രായർ",
        "mn": "Еврейчүүд",
        "mr": "हिब्रू",
        "ms": "Ibrani",
        "mt": "Lhud",
        "my": "ဟီး",
        "ne": "हिब्रूहरू",
        "no": "hebreerne",
        "ny": "Ahebri",
        "or": "ଏବ୍ରୀ",
        "pa": "ਇਬਰਾਨੀ",
        "ps": "عبراني",
        "ro": "evrei",
        "rw": "Abaheburayo",
        "sd": "عبراني",
        "si": "හෙබ්රෙව් ජාතිකයන්",
        "sk": "Hebrejci",
        "sl": "Hebrejcem",
        "sm": "Eperu",
        "sn": "VaHebheru",
        "so": "Cibraaniyada",
        "sq": "hebrenjve",
        "sr": "Јеврејима",
        "st": "Baheberu",
        "su": "urang Ibrani",
        "sv": "hebréer",
        "sw": "Waebrania",
        "ta": "எபிரேயர்கள்",
        "te": "హెబ్రీయులు",
        "tg": "ибриён",
        "th": "ชาวฮีบรู",
        "tk": "Hebrewsewreýler",
        "ug": "ئىبرانىيلار",
        "uz": "ibroniylar",
        "xh": "Hebhere",
        "yi": "עברים",
        "yo": "Heberu",
        "zu": "amaHebheru"
    },
    "James": {
        "bn": "যাকোব",
        "hi": "याकूब",
        "es": "Santiago",
        "ar": "يعقوب",
        "fr": "Jacques",
        "it": "Giacomo",
        "de": "Jakobus",
        "ru": "Иакова",
        "he": "איגרת יעקב",
        "ja": "ジェームス",
        "zh": "詹姆斯",
        "ko": "제임스",
        "pt": "James",
        "tr": "James",
        "id": "Yakobus",
        "ur": "جیمز",
        "fa": "جیمز",
        "nl": "Jakobus",
        "pl": "Jamesa",
        "uk": "Джеймс",
        "vi": "James",
        "af": "James",
        "am": "ጄምስ",
        "as": "জেমছ",
        "az": "James",
        "be": "Джэймс",
        "bg": "Джеймс",
        "bs": "James",
        "ca": "Jaume",
        "ceb": "James",
        "cs": "Jamesi",
        "cy": "Iago",
        "da": "James",
        "el": "Τζέιμς",
        "eo": "Jakobo",
        "et": "James",
        "eu": "James",
        "fi": "James",
        "fil": "James",
        "ga": "Séamas",
        "gd": "Seumas",
        "gl": "Xaime",
        "gu": "જેમ્સ",
        "ha": "James",
        "haw": "James",
        "hr": "James",
        "hu": "James",
        "hy": "Ջեյմս",
        "ig": "James",
        "is": "James",
        "jv": "James",
        "ka": "ჯეიმსი",
        "kk": "Джеймс",
        "km": "លោក James",
        "kn": "ಜೇಮ್ಸ್",
        "ku": "James",
        "ky": "Джеймс",
        "la": "Iacobus",
        "lo": "James",
        "lt": "Džeimsas",
        "lv": "Džeimss",
        "mg": "James",
        "mi": "Hemi",
        "mk": "Џејмс",
        "ml": "ജെയിംസ്",
        "mn": "Жеймс",
        "mr": "जेम्स",
        "ms": "James",
        "mt": "Ġakbu",
        "my": "ဂျိမ်း",
        "ne": "जेम्स",
        "no": "James",
        "ny": "James",
        "or": "ଯାଦବ |",
        "pa": "ਜੇਮਸ",
        "ps": "جیمز",
        "ro": "James",
        "rw": "James",
        "sd": "جيمس",
        "si": "ජේම්ස්",
        "sk": "James",
        "sl": "James",
        "sm": "Iakopo",
        "sn": "James",
        "so": "James",
        "sq": "James",
        "sr": "Јамес",
        "st": "James",
        "su": "James",
        "sv": "James",
        "sw": "James",
        "ta": "ஜேம்ஸ்",
        "te": "జేమ్స్",
        "tg": "Ҷеймс",
        "th": "เจมส์",
        "tk": "Jeýms",
        "ug": "James",
        "uz": "Jeyms",
        "xh": "UJames",
        "yi": "יעקב",
        "yo": "James",
        "zu": "UJames"
    },
    "1 Peter": {
        "bn": "১ পিতর",
        "hi": "1 पतरस",
        "es": "1 Pedro",
        "ar": "بطرس الأولى",
        "fr": "1 Pierre",
        "it": "1 Pietro",
        "de": "1. Petrus",
        "ru": "1 Петра",
        "he": "איגרת פטרוס הראשונה",
        "ja": "1 ピーター",
        "zh": "1 彼得",
        "ko": "베드로 1서",
        "pt": "1 Pedro",
        "tr": "1 Peter",
        "id": "1 Petrus",
        "ur": "1 پیٹر",
        "fa": "1 پیتر",
        "nl": "1 Petrus",
        "pl": "1 Piotra",
        "uk": "1 Петра",
        "vi": "1 Phi-e-rơ",
        "af": "1 Petrus",
        "am": "1 ጴጥሮስ",
        "as": "১ পিতৰ",
        "az": "1 Peter",
        "be": "1 Пятра",
        "bg": "1 Петрово",
        "bs": "1 Peter",
        "ca": "1 Pere",
        "ceb": "1 Pedro",
        "cs": "1 Petr",
        "cy": "1 Pedr",
        "da": "1 Peter",
        "el": "1 Πέτρος",
        "eo": "1 Petro",
        "et": "1 Peeter",
        "eu": "1 Pedro",
        "fi": "1 Pietari",
        "fil": "1 Pedro",
        "ga": "1 Peadar",
        "gd": "1 Peadar",
        "gl": "1 Pedro",
        "gu": "1 પીટર",
        "ha": "1 Bitrus",
        "haw": "1 Petero",
        "hr": "1 Petrova",
        "hu": "1 Péter",
        "hy": "1 Պետրոս",
        "ig": "1 Pita",
        "is": "1 Pétur",
        "jv": "1 Pétrus",
        "ka": "1 პეტრე",
        "kk": "1 Петір",
        "km": "1 ពេត្រុស",
        "kn": "1 ಪೀಟರ್",
        "ku": "1 Petrûs",
        "ky": "1 Петир",
        "la": "1 Peter",
        "lo": "1 ເປໂຕ",
        "lt": "1 Petras",
        "lv": "1 Pēteris",
        "mg": "1 Petera",
        "mi": "1 Pita",
        "mk": "1 Петар",
        "ml": "1 പത്രോസ്",
        "mn": "1 Петр",
        "mr": "1 पीटर",
        "ms": "1 Petrus",
        "mt": "1 Pietru",
        "my": "၁ ပေ",
        "ne": "१ पत्रुस",
        "no": "1 Peter",
        "ny": "1 Petulo",
        "or": "1 ପିତର",
        "pa": "1 ਪੀਟਰ",
        "ps": "1 پیټر",
        "ro": "1 Petru",
        "rw": "1 Petero",
        "sd": "1 پطرس",
        "si": "1 පේතෘස්",
        "sk": "1 Peter",
        "sl": "1 Peter",
        "sm": "1 Peteru",
        "sn": "1 Petro",
        "so": "1 Butros",
        "sq": "1 Pjetri",
        "sr": "1 Петер",
        "st": "1 Petrose",
        "su": "1 Petrus",
        "sv": "1 Peter",
        "sw": "1 Petro",
        "ta": "1 பீட்டர்",
        "te": "1 పీటర్",
        "tg": "1 Петрус",
        "th": "1 เปโตร",
        "tk": "1 Petrus",
        "ug": "1 پېترۇس",
        "uz": "1 Butrus",
        "xh": "Eyoku-1 kaPetros",
        "yi": "1 פעטרוס",
        "yo": "1 Peteru",
        "zu": "1 Petru"
    },
    "2 Peter": {
        "bn": "২ পিতর",
        "hi": "2 पतरस",
        "es": "2 Pedro",
        "ar": "بطرس الثانية",
        "fr": "2 Peter",
        "it": "2 Pietro",
        "de": "2. Petrus",
        "ru": "2 Петра",
        "he": "איגרת פטרוס השנייה",
        "ja": "2 ピーター",
        "zh": "2 彼得",
        "ko": "베드로 2서",
        "pt": "2 Pedro",
        "tr": "2 Peter",
        "id": "2 Petrus",
        "ur": "2 پیٹر",
        "fa": "2 پیتر",
        "nl": "2 Petrus",
        "pl": "2 Piotr",
        "uk": "2 Петра",
        "vi": "2 Phi-e-rơ",
        "af": "2 Petrus",
        "am": "2 ጴጥሮስ",
        "as": "২ পিতৰ",
        "az": "2 Peter",
        "be": "2 Пятра",
        "bg": "2 Петър",
        "bs": "2 Peter",
        "ca": "2 Pere",
        "ceb": "2 Pedro",
        "cs": "2 Petr",
        "cy": "2 Pedr",
        "da": "2 Peter",
        "el": "2 Πέτρος",
        "eo": "2 Petro",
        "et": "2 Peeter",
        "eu": "2 Pedro",
        "fi": "2 Pietari",
        "fil": "2 Pedro",
        "ga": "2 Peadar",
        "gd": "2 Peadar",
        "gl": "2 Pedro",
        "gu": "2 પીટર",
        "ha": "2 Bitrus",
        "haw": "2 Petero",
        "hr": "2 Petrova",
        "hu": "2 Péter",
        "hy": "2 Պետրոս",
        "ig": "2 Pita",
        "is": "2 Pétur",
        "jv": "2 Pétrus",
        "ka": "2 პეტრე",
        "kk": "2 Петір",
        "km": "2 ពេត្រុស",
        "kn": "2 ಪೀಟರ್",
        "ku": "2 Petrûs",
        "ky": "2 Петир",
        "la": "2 Peter",
        "lo": "2 ເປໂຕ",
        "lt": "2 Petras",
        "lv": "2 Pēteris",
        "mg": "2 Petera",
        "mi": "2 Pita",
        "mk": "2 Петар",
        "ml": "2 പത്രോസ്",
        "mn": "2 Петр",
        "mr": "2 पीटर",
        "ms": "2 Petrus",
        "mt": "2 Pietru",
        "my": "2 ပေတရု",
        "ne": "२ पत्रुस",
        "no": "2 Peter",
        "ny": "2 Petulo",
        "or": "2 ପିତର",
        "pa": "2 ਪੀਟਰ",
        "ps": "2 پیټر",
        "ro": "2 Petru",
        "rw": "2 Petero",
        "sd": "2 پطرس",
        "si": "2 පේතෘස්",
        "sk": "2 Peter",
        "sl": "2 Peter",
        "sm": "2 Peteru",
        "sn": "2 Petro",
        "so": "2 Butros",
        "sq": "2 Pjetri",
        "sr": "2 Петер",
        "st": "2 Petrose",
        "su": "2 Petrus",
        "sv": "2 Peter",
        "sw": "2 Petro",
        "ta": "2 பீட்டர்",
        "te": "2 పీటర్",
        "tg": "2 Петрус",
        "th": "2 เปโตร",
        "tk": "2 Petrus",
        "ug": "2 پېترۇس",
        "uz": "2 Butrus",
        "xh": "Eyesi-2 kaPetros",
        "yi": "2 פעטרוס",
        "yo": "2 Peteru",
        "zu": "2 Petru"
    },
    "1 John": {
        "bn": "১ যোহন",
        "hi": "1 यूहन्ना",
        "es": "1 Juan",
        "ar": "يوحنا الأولى",
        "fr": "1 Jean",
        "it": "1 Giovanni",
        "de": "1. Johannes",
        "ru": "1 Иоанна",
        "he": "איגרת יוחנן הראשונה",
        "ja": "1 ジョン",
        "zh": "约翰一书",
        "ko": "요한 1서",
        "pt": "1 João",
        "tr": "1 John",
        "id": "1 Yohanes",
        "ur": "1 جان",
        "fa": "1 جان",
        "nl": "1 Johannes",
        "pl": "1 Jan",
        "uk": "1 Івана",
        "vi": "1 Giăng",
        "af": "1 Johannes",
        "am": "1 ዮሐንስ",
        "as": "১ যোহন",
        "az": "1 Yəhya",
        "be": "1 Яна",
        "bg": "1 Йоан",
        "bs": "1 John",
        "ca": "1 Joan",
        "ceb": "1 Juan",
        "cs": "1 John",
        "cy": "1 loan",
        "da": "1 John",
        "el": "1 Ιωάννης",
        "eo": "1 Johano",
        "et": "1 Johannes",
        "eu": "1 Joan",
        "fi": "1 Johannes",
        "fil": "1 Juan",
        "ga": "1 Eoin",
        "gd": "1 Eoin",
        "gl": "1 Xoán",
        "gu": "1 જ્હોન",
        "ha": "1 Yahaya",
        "haw": "1 loane",
        "hr": "1 Ivanova",
        "hu": "1 János",
        "hy": "1 Հովհաննես",
        "ig": "1 Jọn",
        "is": "1 Jón",
        "jv": "1 Yokanan",
        "ka": "1 იოანე",
        "kk": "1 Жохан",
        "km": "១ យ៉ូហាន",
        "kn": "1 ಜಾನ್",
        "ku": "1 Yûhenna",
        "ky": "1 Жакан",
        "la": "1 John",
        "lo": "1 ໂຢຮັນ",
        "lt": "1 Jonas",
        "lv": "1 Jānis",
        "mg": "1 Jaona",
        "mi": "1 Hoani",
        "mk": "1 Јован",
        "ml": "1 ജോൺ",
        "mn": "1 Жон",
        "mr": "१ जॉन",
        "ms": "1 Yohanes",
        "mt": "1 Ġwanni",
        "my": "၁ ယော",
        "ne": "१ जोन",
        "no": "1 John",
        "ny": "1 Yohane",
        "or": "1 ଯୋହନ",
        "pa": "1 ਯੂਹੰਨਾ",
        "ps": "۱ جان",
        "ro": "1 Ioan",
        "rw": "1 Yohana",
        "sd": "1 جان",
        "si": "1 ජෝන්",
        "sk": "1 Ján",
        "sl": "1 Janezovo pismo",
        "sm": "1 Ioane",
        "sn": "1 Johani",
        "so": "1 Yooxanaa",
        "sq": "1 Gjoni",
        "sr": "1. Јован",
        "st": "1 Johanne",
        "su": "1 Yohanes",
        "sv": "1 John",
        "sw": "1 Yohana",
        "ta": "1 ஜான்",
        "te": "1 జాన్",
        "tg": "1 Юҳанно",
        "th": "1 จอห์น",
        "tk": "1 Johnahýa",
        "ug": "1 يۇھاننا",
        "uz": "1 Yuhanno",
        "xh": "Eyoku-1 kaYohane",
        "yi": "1 יוחנן",
        "yo": "1 Johannu",
        "zu": "1 Johane"
    },
    "2 John": {
        "bn": "২ যোহন",
        "hi": "2 यूहन्ना",
        "es": "2 Juan",
        "ar": "يوحنا الثانية",
        "fr": "2 Jean",
        "it": "2 Giovanni",
        "de": "2. Johannes",
        "ru": "2 Иоанна",
        "he": "איגרת יוחנן השנייה",
        "ja": "2 ジョン",
        "zh": "约翰二书",
        "ko": "요한 2서",
        "pt": "2 João",
        "tr": "2 John",
        "id": "2 Yohanes",
        "ur": "2 جان",
        "fa": "2 جان",
        "nl": "2 Johannes",
        "pl": "2 Jan",
        "uk": "2 Івана",
        "vi": "2 Giăng",
        "af": "2 Johannes",
        "am": "2 ዮሐ",
        "as": "২ যোহন",
        "az": "2 Yəhya",
        "be": "2 Яна",
        "bg": "2 Йоан",
        "bs": "2 John",
        "ca": "2 Joan",
        "ceb": "2 Juan",
        "cs": "2 John",
        "cy": "2 Ioan",
        "da": "2 John",
        "el": "2 Ιωάννης",
        "eo": "2 Johano",
        "et": "2 Johannes",
        "eu": "2 Joan",
        "fi": "2 Johannes",
        "fil": "2 Juan",
        "ga": "2 Eoin",
        "gd": "2 Eoin",
        "gl": "2 Xoán",
        "gu": "2 જ્હોન",
        "ha": "2 Yahaya",
        "haw": "2 loane",
        "hr": "2 Ivanova",
        "hu": "2 János",
        "hy": "2 Հովհաննես",
        "ig": "2 Jọn",
        "is": "2 Jón",
        "jv": "2 Yohanes",
        "ka": "2 იოანე",
        "kk": "2 Жохан",
        "km": "២ យ៉ូហាន",
        "kn": "2 ಜಾನ್",
        "ku": "2 Yûhenna",
        "ky": "2 Жакан",
        "la": "2 John",
        "lo": "2 ໂຢຮັນ",
        "lt": "2 Jonas",
        "lv": "2 Jānis",
        "mg": "2 Jaona",
        "mi": "2 Hoani",
        "mk": "2 Јован",
        "ml": "2 ജോൺ",
        "mn": "2 Жон",
        "mr": "2 जॉन",
        "ms": "2 Yohanes",
        "mt": "2 Ġwanni",
        "my": "၂ ယော",
        "ne": "२ जोन",
        "no": "2 John",
        "ny": "2 Yohane",
        "or": "2 ଯୋହନ",
        "pa": "2 ਯੂਹੰਨਾ",
        "ps": "۲ جان",
        "ro": "2 Ioan",
        "rw": "2 Yohana",
        "sd": "2 جان",
        "si": "2 ජෝන්",
        "sk": "2 Ján",
        "sl": "2 Janez",
        "sm": "2 Ioane",
        "sn": "2 Johani",
        "so": "2 Yooxanaa",
        "sq": "2 Gjoni",
        "sr": "2 Јован",
        "st": "2 Johanne",
        "su": "2 Yohanes",
        "sv": "2 John",
        "sw": "2 Yohana",
        "ta": "2 ஜான்",
        "te": "2 జాన్",
        "tg": "2 Юҳанно",
        "th": "2 จอห์น",
        "tk": "2 Johnahýa",
        "ug": "2 يۇھاننا",
        "uz": "2 Yuhanno",
        "xh": "Eyesi-2 kaYohane",
        "yi": "2 יוחנן",
        "yo": "2 Johannu",
        "zu": "2 Johane"
    },
    "3 John": {
        "bn": "৩ যোহন",
        "hi": "3 यूहन्ना",
        "es": "3 Juan",
        "ar": "يوحنا الثالثة",
        "fr": "3 Jean",
        "it": "3 Giovanni",
        "de": "3. Johannes",
        "ru": "3 Иоанна",
        "he": "איגרת יוחנן השלישית",
        "ja": "3 ジョン",
        "zh": "约翰三书",
        "ko": "요한 3서",
        "pt": "3 João",
        "tr": "3 John",
        "id": "3 Yohanes",
        "ur": "3 جان",
        "fa": "3 جان",
        "nl": "3 Johannes",
        "pl": "3 Jan",
        "uk": "3 Івана",
        "vi": "3 Giăng",
        "af": "3 Johannes",
        "am": "3 ዮሃንስ",
        "as": "৩ যোহন",
        "az": "3 Yəhya",
        "be": "3 Яна",
        "bg": "3 Йоан",
        "bs": "3 John",
        "ca": "3 Joan",
        "ceb": "3 Juan",
        "cs": "3 John",
        "cy": "3 Ioan",
        "da": "3 John",
        "el": "3 Ιωάννης",
        "eo": "3 Johano",
        "et": "3 Johannes",
        "eu": "3 Joan",
        "fi": "3 Johannes",
        "fil": "3 Juan",
        "ga": "3 Eoin",
        "gd": "3 Eoin",
        "gl": "3 Xoán",
        "gu": "3 જ્હોન",
        "ha": "3 Yahaya",
        "haw": "3 loane",
        "hr": "3 Ivanova",
        "hu": "3 János",
        "hy": "3 Հովհաննես",
        "ig": "3 Jọn",
        "is": "3 Jón",
        "jv": "3 Yohanes",
        "ka": "3 იოანე",
        "kk": "3 Жохан",
        "km": "៣ យ៉ូហាន",
        "kn": "3 ಜಾನ್",
        "ku": "3 Yûhenna",
        "ky": "3 Жакан",
        "la": "3 John",
        "lo": "3 ໂຢຮັນ",
        "lt": "3 Jonas",
        "lv": "3 Jānis",
        "mg": "3 Jaona",
        "mi": "3 Hoani",
        "mk": "3 Јован",
        "ml": "3 ജോൺ",
        "mn": "3 Жон",
        "mr": "3 जॉन",
        "ms": "3 Yohanes",
        "mt": "3 Ġwanni",
        "my": "၃ ယော",
        "ne": "३ जोन",
        "no": "3 John",
        "ny": "3 Yohane",
        "or": "3 ଯୋହନ",
        "pa": "3 ਯੂਹੰਨਾ",
        "ps": "۳ جان",
        "ro": "3 Ioan",
        "rw": "3 Yohana",
        "sd": "3 جان",
        "si": "3 ජෝන්",
        "sk": "3 Ján",
        "sl": "3 Janez",
        "sm": "3 Ioane",
        "sn": "3 Johani",
        "so": "3 Yooxanaa",
        "sq": "3 Gjoni",
        "sr": "3 Јован",
        "st": "3 Johanne",
        "su": "3 Yohanes",
        "sv": "3 John",
        "sw": "3 Yohana",
        "ta": "3 ஜான்",
        "te": "3 జాన్",
        "tg": "3 Юҳанно",
        "th": "3 จอห์น",
        "tk": "3 Johnahýa",
        "ug": "3 يۇھاننا",
        "uz": "3 Yuhanno",
        "xh": "3 kaYohane",
        "yi": "3 יוחנן",
        "yo": "3 Johannu",
        "zu": "3 Johane"
    },
    "Jude": {
        "bn": "যিহূদা",
        "hi": "यहूदा",
        "es": "Judas",
        "ar": "يهوذا",
        "fr": "Jude",
        "it": "Giuda",
        "de": "Judas",
        "ru": "Иуды",
        "he": "איגרת יהודה",
        "ja": "ジュード",
        "zh": "裘德",
        "ko": "주드",
        "pt": "Judas",
        "tr": "Jude",
        "id": "Yudas",
        "ur": "جوڈ",
        "fa": "جود",
        "nl": "Judas",
        "pl": "Juda",
        "uk": "Джуд",
        "vi": "Giuđa",
        "af": "Jude",
        "am": "ይሁዳ",
        "as": "জুড",
        "az": "Jude",
        "be": "Джуд",
        "bg": "Джуд",
        "bs": "Jude",
        "ca": "Jude",
        "ceb": "Jude",
        "cs": "Jude",
        "cy": "Jwdas",
        "da": "Jude",
        "el": "Jude",
        "eo": "Jude",
        "et": "Jude",
        "eu": "Jude",
        "fi": "Jude",
        "fil": "Jude",
        "ga": "Iúdá",
        "gd": "Iùdais",
        "gl": "Xudas",
        "gu": "જુડ",
        "ha": "Yahuda",
        "haw": "Iuda",
        "hr": "Jude",
        "hu": "Jude",
        "hy": "Ջուդա",
        "ig": "Jud",
        "is": "Júda",
        "jv": "Yudha",
        "ka": "ჯუდა",
        "kk": "Яһуда",
        "km": "យូដាស",
        "kn": "ಜೂಡ್",
        "ku": "Jude",
        "ky": "Жүйүт",
        "la": "Iudas",
        "lo": "ຢູດາ",
        "lt": "Judas",
        "lv": "Džūda",
        "mg": "Joda",
        "mi": "Hura",
        "mk": "Џуд",
        "ml": "ജൂഡ്",
        "mn": "Жүд",
        "mr": "ज्युड",
        "ms": "Jude",
        "mt": "Jude",
        "my": "ယု",
        "ne": "जुड",
        "no": "Jude",
        "ny": "Yuda",
        "or": "ଯିହୁଦା |",
        "pa": "ਯਹੂਦਾ",
        "ps": "جوډ",
        "ro": "Jude",
        "rw": "Yuda",
        "sd": "جوڙو",
        "si": "ජූඩ්",
        "sk": "Jude",
        "sl": "Jude",
        "sm": "Iuta",
        "sn": "Judhasi",
        "so": "Yuudas",
        "sq": "Jude",
        "sr": "Јуде",
        "st": "Juda",
        "su": "Yuda",
        "sv": "Jude",
        "sw": "Yuda",
        "ta": "ஜூட்",
        "te": "జూడ్",
        "tg": "Яҳудо",
        "th": "จู๊ด",
        "tk": "Udeahuda",
        "ug": "يەھۇدا",
        "uz": "Yahudo",
        "xh": "Yude",
        "yi": "דזשוד",
        "yo": "Juda",
        "zu": "Jude"
    },
    "Revelation": {
        "bn": "প্রকাশিত বাক্য",
        "hi": "प्रकाशितवाक्य",
        "es": "Apocalipsis",
        "ar": "الرؤيا",
        "fr": "Apocalypse",
        "it": "Apocalisse",
        "de": "Offenbarung",
        "ru": "Откровение",
        "he": "חזון יוחנן",
        "ja": "啓示",
        "zh": "启示",
        "ko": "시현",
        "pt": "Revelação",
        "tr": "Vahiy",
        "id": "Wahyu",
        "ur": "وحی",
        "fa": "مکاشفه",
        "nl": "Openbaring",
        "pl": "Objawienie",
        "uk": "Одкровення",
        "vi": "Khải Huyền",
        "af": "Openbaring",
        "am": "ራዕይ",
        "as": "প্ৰকাশিত বাক্য",
        "az": "Vəhy",
        "be": "Адкрыццё",
        "bg": "Откровение",
        "bs": "Otkrivenje",
        "ca": "Revelació",
        "ceb": "Pinadayag",
        "cs": "Zjevení",
        "cy": "Datguddiad",
        "da": "Åbenbaring",
        "el": "Αποκάλυψη",
        "eo": "Revelacio",
        "et": "Ilmutus",
        "eu": "Errebelazioa",
        "fi": "Ilmestys",
        "fil": "Pahayag",
        "ga": "Nochtadh",
        "gd": "Taisbeanadh",
        "gl": "Revelación",
        "gu": "સાક્ષાત્કાર",
        "ha": "Wahayi",
        "haw": "Hoikeana",
        "hr": "Otkrivenje",
        "hu": "Kinyilatkoztatás",
        "hy": "Հայտնություն",
        "ig": "Mkpughe",
        "is": "Opinberun",
        "jv": "Wahyu",
        "ka": "გამოცხადება",
        "kk": "Аян",
        "km": "វិវរណៈ",
        "kn": "ಬಹಿರಂಗ",
        "ku": "Revelation",
        "ky": "Аян",
        "la": "Apocalypsis",
        "lo": "ການເປີດເຜີຍ",
        "lt": "Apreiškimas",
        "lv": "Atklāsme",
        "mg": "Apokalypsy",
        "mi": "Whakakitenga",
        "mk": "Откровение",
        "ml": "വെളിപാട്",
        "mn": "Илчлэлт",
        "mr": "प्रकटीकरण",
        "ms": "Wahyu",
        "mt": "Rivelazzjoni",
        "my": "ဗျာ။",
        "ne": "प्रकाश",
        "no": "Åpenbaring",
        "ny": "Chibvumbulutso",
        "or": "ପ୍ରକାଶିତ ବାକ୍ୟ",
        "pa": "ਪਰਕਾਸ਼ ਦੀ ਪੋਥੀ",
        "ps": "وحی",
        "ro": "Apocalipsa",
        "rw": "Ibyahishuwe",
        "sd": "وحي",
        "si": "එළිදරව් කිරීම",
        "sk": "Zjavenie",
        "sl": "Razodetje",
        "sm": "Faaaliga",
        "sn": "Zvakazarurwa",
        "so": "Muujintii",
        "sq": "Zbulesa",
        "sr": "Откровење",
        "st": "Tšenolo",
        "su": "Wahyu",
        "sv": "Uppenbarelse",
        "sw": "Ufunuo",
        "ta": "வெளிப்பாடு",
        "te": "ద్యోతకం",
        "tg": "Ваҳй",
        "th": "วิวรณ์",
        "tk": "Ylham",
        "ug": "ۋەھىي",
        "uz": "Vahiy",
        "xh": "ISityhilelo",
        "yi": "התגלות",
        "yo": "Ifihan",
        "zu": "IsAmbulo"
    },
    "One small tap for you, one giant leap for this starving indie dev.": {
        "bn": "আপনার জন্য একটি ছোট ট্যাপ, এই পরিশ্রমী নির্মাতার জন্য এক বিশাল পদক্ষেপ।",
        "he": "הקשה אחת קטנה בשבילך, קפיצת מדרגה אחת ענקית למפתח האינדי הרעב הזה.",
        "ar": "نقرة واحدة صغيرة لك، وقفزة عملاقة لهذا المطور المستقل الجائع.",
        "hi": "आपके लिए एक छोटा सा टैप, इस भूखे इंडी देव के लिए एक विशाल छलांग।",
        "ja": "あなたにとっては 1 回の小さなタップですが、この飢えたインディーズ開発者にとっては 1 回の大きな飛躍です。",
        "zh": "对你来说轻轻一按，对这个饥饿的独立开发者来说就是一大步。",
        "ko": "당신을 위한 작은 탭 한번, 이 배고픈 인디 개발자를 위한 거대한 도약.",
        "es": "Un pequeño toque para ti, un gran salto para este desarrollador independiente hambriento.",
        "fr": "Un petit clic pour vous, un pas de géant pour ce développeur indépendant affamé.",
        "de": "Ein kleiner Tipp für Sie, ein großer Sprung für diesen hungernden Indie-Entwickler.",
        "ru": "Одно маленькое касание для вас, один гигантский скачок для этого голодающего инди-разработчика.",
        "it": "Un piccolo tocco per te, un passo da gigante per questo sviluppatore indipendente affamato.",
        "pt": "Um pequeno toque para você, um salto gigante para este desenvolvedor indie faminto.",
        "tr": "Sizin için küçük bir dokunuş, açlıktan ölmek üzere olan bu bağımsız geliştirici için dev bir adım.",
        "id": "Satu ketukan kecil untuk Anda, satu lompatan besar untuk pengembang indie yang kelaparan ini.",
        "ur": "آپ کے لیے ایک چھوٹا سا تھپتھپائیں، اس بھوک سے مرنے والے انڈی دیو کے لیے ایک بڑی چھلانگ۔",
        "fa": "یک ضربه کوچک برای شما، یک جهش بزرگ برای این توسعه دهنده مستقل گرسنه."
    },
    "Remove ads and fund the developer's 3 AM coffee addiction.": {
        "bn": "বিজ্ঞাপন সরান এবং নির্মাতাকে রাত ৩টার কফির যোগান দিন।",
        "he": "הסר מודעות וממן את ההתמכרות לקפה של המפתח בשעה 3:00.",
        "ar": "قم بإزالة الإعلانات وقم بتمويل إدمان المطور للقهوة في الساعة 3 صباحًا.",
        "hi": "विज्ञापन हटाएं और डेवलपर की सुबह 3 बजे कॉफी की लत के लिए धन जुटाएं।",
        "ja": "広告を削除して、開発者の午前 3 時のコーヒー中毒に資金を提供します。",
        "zh": "删除广告并资助开发者凌晨 3 点的咖啡瘾。",
        "ko": "광고를 제거하고 개발자의 오전 3시 커피 중독에 자금을 지원하세요.",
        "es": "Elimine los anuncios y financie la adicción al café de las 3 a. m. del desarrollador.",
        "fr": "Supprimez les publicités et financez la dépendance au café du développeur à 3 heures du matin.",
        "de": "Entfernen Sie Werbung und finanzieren Sie die 3-Uhr-Kaffeesucht des Entwicklers.",
        "ru": "Удалите рекламу и профинансируйте зависимость разработчика от кофе в 3 часа ночи.",
        "it": "Rimuovi gli annunci e finanzia la dipendenza dallo sviluppatore dal caffè alle 3 del mattino.",
        "pt": "Remova anúncios e financie o vício do desenvolvedor em café às 3 da manhã.",
        "tr": "Reklamları kaldırın ve geliştiricinin sabah 3 kahve bağımlılığını finanse edin.",
        "id": "Hapus iklan dan danai kecanduan kopi pukul 3 pagi pengembang.",
        "ur": "اشتہارات ہٹائیں اور ڈویلپر کے 3 AM کافی کی لت کو فنڈ دیں۔",
        "fa": "تبلیغات را حذف کنید و هزینه اعتیاد توسعه دهنده به قهوه در ساعت 3 صبح را تامین کنید."
    },
    "Ads keep our servers alive. Premium keeps the developer's sanity alive.": {
        "bn": "বিজ্ঞাপন সার্ভার বাঁচিয়ে রাখে। প্রিমিয়াম নির্মাতাকে বাঁচিয়ে রাখে।",
        "he": "מודעות שומרות על השרתים שלנו בחיים. פרימיום שומרת על שפיות המפתח בחיים.",
        "ar": "الإعلانات تبقي خوادمنا حية. Premium يبقي عقل المطور على قيد الحياة.",
        "hi": "विज्ञापन हमारे सर्वर को सक्रिय रखते हैं। प्रीमियम डेवलपर की समझदारी को जीवित रखता है।",
        "ja": "広告によってサーバーは生き続けます。プレミアムは開発者の正気を保ちます。",
        "zh": "广告让我们的服务器保持活力。高级版可以让开发人员保持理智。",
        "ko": "광고는 서버를 계속 유지합니다. 프리미엄은 개발자의 정신을 생생하게 유지합니다.",
        "es": "Los anuncios mantienen vivos nuestros servidores. Premium mantiene viva la cordura del desarrollador.",
        "fr": "Les publicités maintiennent nos serveurs en vie. Premium maintient la santé mentale du développeur.",
        "de": "Werbung hält unsere Server am Leben. Premium hält die geistige Gesundheit des Entwicklers aufrecht.",
        "ru": "Реклама поддерживает работу наших серверов. Премиум поддерживает здравомыслие разработчика.",
        "it": "Gli annunci mantengono attivi i nostri server. Premium mantiene viva la sanità mentale dello sviluppatore.",
        "pt": "Os anúncios mantêm nossos servidores ativos. Premium mantém viva a sanidade do desenvolvedor.",
        "tr": "Reklamlar sunucularımızı canlı tutar. Premium, geliştiricinin akıl sağlığını canlı tutar.",
        "id": "Iklan menjaga server kami tetap hidup. Premium menjaga kewarasan pengembang tetap hidup.",
        "ur": "اشتہارات ہمارے سرورز کو زندہ رکھتے ہیں۔ پریمیم ڈویلپر کی عقل کو زندہ رکھتا ہے۔",
        "fa": "تبلیغات سرورهای ما را زنده نگه می دارد. Premium عقل توسعه دهنده را زنده نگه می دارد."
    },
    "Look, we both hate ads. Just tap the button and let's never speak of this again.": {
        "bn": "আমরা দুজনই বিজ্ঞাপন অপছন্দ করি। বোতামে চাপ দিন এবং শান্তিতে পড়ুন।",
        "he": "תראה, שנינו שונאים פרסומות. פשוט הקש על הכפתור ובואו לעולם לא נדבר על זה שוב.",
        "ar": "انظر، كلانا يكره الإعلانات. فقط اضغط على الزر ودعنا لا نتحدث عن هذا مرة أخرى.",
        "hi": "देखिए, हम दोनों को विज्ञापनों से नफरत है। बस बटन टैप करें और आइए इसके बारे में फिर कभी बात न करें।",
        "ja": "ほら、私たちは二人とも広告が嫌いです。ボタンをタップするだけで、もうこのことについて話す必要はありません。",
        "zh": "看，我们都讨厌广告。只需点击按钮，我们就不再谈论这件事了。",
        "ko": "보세요, 우리 둘 다 광고를 싫어해요. 버튼을 탭하기만 하면 다시는 이 이야기를 하지 않겠습니다.",
        "es": "Mira, ambos odiamos los anuncios. Simplemente toque el botón y nunca más hablemos de esto.",
        "fr": "Écoutez, nous détestons tous les deux les publicités. Appuyez simplement sur le bouton et n'en parlons plus jamais.",
        "de": "Schauen Sie, wir hassen beide Werbung. Tippen Sie einfach auf die Schaltfläche und lassen Sie uns nie wieder darüber sprechen.",
        "ru": "Слушай, мы оба ненавидим рекламу. Просто нажмите кнопку, и давайте больше никогда об этом не будем говорить.",
        "it": "Senti, entrambi odiamo la pubblicità. Basta toccare il pulsante e non parliamone mai più.",
        "pt": "Olha, nós dois odiamos anúncios. Basta tocar no botão e nunca mais falaremos disso.",
        "tr": "Bak, ikimiz de reklamlardan nefret ediyoruz. Sadece düğmeye dokunun ve bundan bir daha asla bahsetmeyelim.",
        "id": "Dengar, kami berdua benci iklan. Cukup ketuk tombolnya dan jangan pernah membicarakan hal ini lagi.",
        "ur": "دیکھو، ہم دونوں اشتہارات سے نفرت کرتے ہیں۔ بس بٹن کو تھپتھپائیں اور آئیے اس کے بارے میں دوبارہ کبھی بات نہ کریں۔",
        "fa": "ببینید، ما هر دو از تبلیغات متنفریم. فقط روی دکمه ضربه بزنید و اجازه دهید هرگز در مورد این صحبت دوباره."
    },
    "Upgrade to Premium so I can finally afford actual groceries instead of instant noodles.": {
        "bn": "প্রিমিয়ামে আপগ্রেড করুন যাতে এই স্বাধীন ডেভেলপার নুডলসের বদলে ভালো খাবার খেতে পারে।",
        "he": "שדרג לפרימיום כדי שאוכל סוף סוף להרשות לעצמי מצרכים אמיתיים במקום אטריות אינסטנט.",
        "ar": "قم بالترقية إلى Premium حتى أتمكن أخيرًا من شراء البقالة الفعلية بدلاً من المكرونة سريعة التحضير.",
        "hi": "प्रीमियम में अपग्रेड करें ताकि मैं अंततः इंस्टेंट नूडल्स के बजाय वास्तविक किराने का सामान खरीद सकूं।",
        "ja": "プレミアムにアップグレードすると、インスタントラーメンの代わりに実際の食料品を購入できるようになります。",
        "zh": "升级到高级版，这样我终于可以买得起真正的杂货而不是方便面了。",
        "ko": "프리미엄으로 업그레이드하면 마침내 인스턴트 라면 대신 실제 식료품을 구입할 수 있습니다.",
        "es": "Actualíceme a Premium para finalmente poder permitirme comprar alimentos reales en lugar de fideos instantáneos.",
        "fr": "Passez à Premium pour pouvoir enfin me permettre de vraies courses au lieu de nouilles instantanées.",
        "de": "Upgrade auf Premium, damit ich mir endlich echte Lebensmittel statt Instantnudeln leisten kann.",
        "ru": "Перейдите на Премиум, чтобы я наконец мог позволить себе настоящие продукты вместо лапши быстрого приготовления.",
        "it": "Passa a Premium così posso finalmente permettermi la spesa vera e propria invece dei noodles istantanei.",
        "pt": "Atualize para Premium para que eu possa finalmente comprar mantimentos de verdade em vez de macarrão instantâneo.",
        "tr": "Premium'a yükseltin, böylece artık hazır erişte yerine gerçek yiyecek satın alabiliyorum.",
        "id": "Tingkatkan ke Premium sehingga saya akhirnya bisa membeli bahan makanan daripada mie instan.",
        "ur": "Premium میں اپ گریڈ کریں تاکہ میں فوری نوڈلز کے بجائے اصل گروسری کا متحمل ہو سکوں۔",
        "fa": "به Premium ارتقا دهید تا در نهایت بتوانم به جای نودل فوری، خواربار فروشی واقعی بخرم."
    },
    "You're reading ancient wisdom while staring at an ad. Let's fix that.": {
        "bn": "আপনি প্রাচীন প্রজ্ঞা পড়ার মাঝে বিজ্ঞাপন দেখছেন। চলুন এটি দূর করি।",
        "he": "אתה קורא חוכמה עתיקה בזמן שאתה בוהה במודעה. בוא נתקן את זה.",
        "ar": "أنت تقرأ الحكمة القديمة بينما تحدق في أحد الإعلانات. دعونا نصلح ذلك.",
        "hi": "आप किसी विज्ञापन को देखते हुए प्राचीन ज्ञान पढ़ रहे हैं। आइए उसे ठीक करें।",
        "ja": "あなたは広告を見つめながら古代の知恵を読んでいます。それを修正しましょう。",
        "zh": "您正在一边盯着广告一边阅读古老的智慧。让我们解决这个问题。",
        "ko": "당신은 광고를 보면서 고대의 지혜를 읽고 있습니다. 문제를 해결해 보겠습니다.",
        "es": "Estás leyendo sabiduría antigua mientras miras un anuncio. Arreglemos eso.",
        "fr": "Vous lisez une sagesse ancienne en regardant une publicité. Réparons ça.",
        "de": "Sie lesen alte Weisheiten, während Sie auf eine Anzeige starren. Lasst uns das beheben.",
        "ru": "Вы читаете древнюю мудрость, глядя на рекламу. Давайте это исправим.",
        "it": "Stai leggendo un'antica saggezza mentre guardi una pubblicità. Risolviamolo.",
        "pt": "Você está lendo a sabedoria antiga enquanto olha para um anúncio. Vamos consertar isso.",
        "tr": "Bir reklama bakarken eski bilgeliği okuyorsunuz. Bunu düzeltelim.",
        "id": "Anda membaca kebijaksanaan kuno sambil menatap sebuah iklan. Mari kita perbaiki itu.",
        "ur": "آپ ایک اشتہار کو گھورتے ہوئے قدیم حکمت پڑھ رہے ہیں۔ آئیے اسے ٹھیک کرتے ہیں۔",
        "fa": "شما در حال خواندن حکمت باستانی هستید در حالی که به یک آگهی خیره شده اید. بیایید آن را درست کنیم."
    },
    "Tap Remove Ads and an angel will personally bless your WiFi signal.": {
        "bn": "বিজ্ঞাপন সরান বাটনে ট্যাপ করুন এবং প্রশান্তিময় অভিজ্ঞতা উপভোগ করুন।",
        "he": "הקש על הסר מודעות ומלאך יברך באופן אישי את אות ה-WiFi שלך.",
        "ar": "انقر فوق \"إزالة الإعلانات\" وسوف يبارك الملاك شخصيًا إشارة WiFi الخاصة بك.",
        "hi": "विज्ञापन हटाएँ पर टैप करें और एक देवदूत व्यक्तिगत रूप से आपके वाईफाई सिग्नल को आशीर्वाद देगा।",
        "ja": "[広告を削除] をタップすると、天使が個人的に WiFi 信号を祝福してくれます。",
        "zh": "点击“删除广告”，天使将亲自祝福您的 WiFi 信号。",
        "ko": "광고 제거를 탭하면 천사가 개인적으로 Wi-Fi 신호를 축복할 것입니다.",
        "es": "Toca Eliminar anuncios y un ángel bendecirá personalmente tu señal WiFi.",
        "fr": "Appuyez sur Supprimer les publicités et un ange bénira personnellement votre signal WiFi.",
        "de": "Tippen Sie auf „Werbung entfernen“ und ein Engel wird Ihr WLAN-Signal persönlich segnen.",
        "ru": "Нажмите «Удалить рекламу», и ангел лично благословит ваш сигнал Wi-Fi.",
        "it": "Tocca Rimuovi pubblicità e un angelo benedirà personalmente il tuo segnale WiFi.",
        "pt": "Toque em Remover anúncios e um anjo abençoará pessoalmente seu sinal WiFi.",
        "tr": "Reklamları Kaldır'a dokunduğunuzda bir melek WiFi sinyalinizi kişisel olarak kutsayacaktır.",
        "id": "Ketuk Hapus Iklan dan malaikat secara pribadi akan memberkati sinyal WiFi Anda.",
        "ur": "اشتہارات ہٹائیں پر ٹیپ کریں اور ایک فرشتہ ذاتی طور پر آپ کے وائی فائی سگنل کو برکت دے گا۔",
        "fa": "روی Remove Ads ضربه بزنید تا یک فرشته شخصاً سیگنال WiFi شما را برکت دهد."
    },
    "Think of Premium as buying the developer a virtual tea. A very appreciative tea.": {
        "bn": "প্রিমিয়াম নিয়ে নির্মাতাকে এক কাপ প্রশংসার চা উপহার দিন।",
        "he": "תחשוב על פרימיום כקניית למפתח תה וירטואלי. תה מאוד מעורר הערכה.",
        "ar": "فكر في Premium على أنه شراء شاي افتراضي للمطور. شاي موضع تقدير كبير.",
        "hi": "प्रीमियम को डेवलपर के लिए वर्चुअल चाय खरीदने के समान समझें। बहुत सराहनीय चाय.",
        "ja": "プレミアムは、開発者に仮想のお茶を購入するようなものだと考えてください。とてもありがたいお茶です。",
        "zh": "将 Premium 视为为开发者购买一杯虚拟茶。非常值得欣赏的一款茶。",
        "ko": "프리미엄을 개발자에게 가상 차를 구매하는 것으로 생각해보세요. 매우 감사한 차입니다.",
        "es": "Piense en Premium como comprarle al desarrollador un té virtual. Un té muy agradecido.",
        "fr": "Considérez Premium comme l'achat d'un thé virtuel au développeur. Un thé très apprécié.",
        "de": "Stellen Sie sich Premium so vor, als würden Sie dem Entwickler einen virtuellen Tee spendieren. Ein sehr wertschätzender Tee.",
        "ru": "Думайте о Premium как о покупке виртуального чая для разработчика. Очень благодарный чай.",
        "it": "Pensa a Premium come all'acquisto di un tè virtuale allo sviluppatore. Un tè molto apprezzato.",
        "pt": "Pense no Premium como comprar um chá virtual para o desenvolvedor. Um chá muito agradecido.",
        "tr": "Premium'u geliştiriciye sanal bir çay satın almak olarak düşünün. Çok değerli bir çay.",
        "id": "Bayangkan Premium seperti membelikan teh virtual kepada pengembang. Teh yang sangat dihargai.",
        "ur": "ڈویلپر کو ورچوئل چائے خریدنے کے طور پر پریمیم کے بارے میں سوچیں۔ ایک بہت ہی قابل تعریف چائے۔",
        "fa": "Premium را به عنوان خرید یک چای مجازی برای توسعه دهنده در نظر بگیرید. یک چای بسیار قدردانی"
    },
    "No ads, all HD voices, and eternal good karma. Best investment of your week.": {
        "bn": "কোনো বিজ্ঞাপন নেই, সব এইচডি কণ্ঠস্বর এবং নিখুঁত আধ্যাত্মিক প্রশান্তি।",
        "he": "ללא פרסומות, כל קולות HD, וקארמה טובה נצחית. ההשקעה הטובה ביותר של השבוע שלך.",
        "ar": "لا توجد إعلانات، وجميع الأصوات عالية الدقة، والكارما الجيدة الأبدية. أفضل استثمار في أسبوعك.",
        "hi": "कोई विज्ञापन नहीं, सभी एचडी आवाजें, और शाश्वत अच्छे कर्म। आपके सप्ताह का सर्वोत्तम निवेश.",
        "ja": "広告なし、すべて HD 音声、永遠の善のカルマ。今週のベスト投資。",
        "zh": "无广告，全高清语音，善缘永恒。您一周的最佳投资。",
        "ko": "광고가 없고, HD 음성이 모두 제공되며, 영원한 선업이 있습니다. 이번주 최고의 투자.",
        "es": "Sin publicidad, todas las voces en HD y buen karma eterno. La mejor inversión de tu semana.",
        "fr": "Pas de publicité, toutes les voix HD et un bon karma éternel. Meilleur investissement de votre semaine.",
        "de": "Keine Werbung, alle HD-Stimmen und ewig gutes Karma. Beste Investition Ihrer Woche.",
        "ru": "Никакой рекламы, все HD-голоса и вечная добрая карма. Лучшая инвестиция вашей недели.",
        "it": "Nessuna pubblicità, tutte le voci in HD e un karma eterno e positivo. Il miglior investimento della tua settimana.",
        "pt": "Sem anúncios, todas as vozes em HD e um bom carma eterno. Melhor investimento da sua semana.",
        "tr": "Reklam yok, tamamı HD sesler ve sonsuz iyi karma. Haftanızın en iyi yatırımı.",
        "id": "Tanpa iklan, semua suara HD, dan karma baik abadi. Investasi terbaik minggu ini.",
        "ur": "کوئی اشتہار نہیں، تمام HD آوازیں، اور ابدی اچھے کرما۔ آپ کے ہفتے کی بہترین سرمایہ کاری۔",
        "fa": "بدون تبلیغات، تمام صداهای HD، و کارما خوب ابدی. بهترین سرمایه گذاری هفته شما"
    },
    "Your spiritual enlightenment shouldn't have a commercial break.": {
        "bn": "আপনার আধ্যাত্মিক পাঠে কোনো বিজ্ঞাপনের বিরতি থাকা উচিত নয়।",
        "he": "להארה הרוחנית שלך לא אמורה להיות הפסקה מסחרית.",
        "ar": "تنويرك الروحي لا ينبغي أن يكون له استراحة تجارية.",
        "hi": "आपके आध्यात्मिक ज्ञान में व्यावसायिक विराम नहीं होना चाहिए।",
        "ja": "あなたのスピリチュアルな啓発に商業的なブレイクがあってはなりません。",
        "zh": "你的精神启蒙不应该有商业广告。",
        "ko": "당신의 영적 깨달음에는 상업적인 휴식이 있어서는 안 됩니다.",
        "es": "Tu iluminación espiritual no debería tener una pausa comercial.",
        "fr": "Votre illumination spirituelle ne devrait pas avoir de pause publicitaire.",
        "de": "Ihre spirituelle Erleuchtung sollte keine Werbeunterbrechung haben.",
        "ru": "Ваше духовное просветление не должно иметь рекламной паузы.",
        "it": "La tua illuminazione spirituale non dovrebbe avere una pausa pubblicitaria.",
        "pt": "Sua iluminação espiritual não deveria ter intervalo comercial.",
        "tr": "Ruhsal aydınlanmanız ticari bir ara vermemelidir.",
        "id": "Pencerahan spiritual Anda seharusnya tidak memiliki jeda iklan.",
        "ur": "آپ کی روحانی روشن خیالی میں تجارتی وقفہ نہیں ہونا چاہیے۔",
        "fa": "روشنگری معنوی شما نباید وقفه تجاری داشته باشد."
    },
    "100% of Premium buyers report feeling 42% more zen and 100% ad-free.": {
        "bn": "প্রিমিয়াম সদস্যরা উপভোগ করেন ১০০% বিজ্ঞাপনমুক্ত নিরবচ্ছিন্ন অভিজ্ঞতা।",
        "he": "100% מרוכשי פרימיום מדווחים שהם מרגישים 42% יותר זן ו-100% ללא פרסומות.",
        "ar": "أبلغ 100% من المشترين المميزين عن شعورهم بمزيد من الهدوء بنسبة 42% وخلوها من الإعلانات بنسبة 100%.",
        "hi": "100% प्रीमियम खरीदार 42% अधिक ज़ेन और 100% विज्ञापन-मुक्त महसूस करते हैं।",
        "ja": "プレミアム購入者の 100% が、禅感が 42% 向上し、広告が 100% 表示されなくなったと報告しています。",
        "zh": "100% 的高级买家表示感觉更加禅宗 42%，并且 100% 无广告。",
        "ko": "프리미엄 구매자 중 100%는 42% 더 나은 기분을 느끼고 100% 광고가 없는 느낌을 받았다고 보고합니다.",
        "es": "El 100% de los compradores Premium afirman sentirse un 42% más zen y 100% libres de publicidad.",
        "fr": "100 % des acheteurs Premium déclarent se sentir 42 % plus zen et 100 % sans publicité.",
        "de": "100 % der Premium-Käufer berichten, dass sie sich 42 % wohler fühlen und 100 % werbefrei sind.",
        "ru": "100 % покупателей Premium сообщают, что чувствуют себя на 42 % более дружелюбными и на 100 % без рекламы.",
        "it": "Il 100% degli acquirenti Premium dichiara di sentirsi il 42% più zen e il 100% senza pubblicità.",
        "pt": "100% dos compradores Premium relatam sentir-se 42% mais zen e 100% livres de anúncios.",
        "tr": "Premium kullanıcılarının %100'ü %42 daha fazla zen ve %100 reklamsız hissettiklerini bildiriyor.",
        "id": "100% pembeli Premium melaporkan merasa 42% lebih nyaman dan 100% bebas iklan.",
        "ur": "پریمیم خریداروں میں سے 100% 42% زیادہ زین اور 100% اشتہار سے پاک محسوس کرتے ہیں۔",
        "fa": "100٪ از خریداران Premium گزارش می دهند که 42٪ بیشتر احساس می کنند و 100٪ بدون تبلیغات هستند."
    },
    "Help an indie developer survive capitalism. Tap to unlock Premium.": {
        "bn": "একক নির্মাতাকে সমর্থন করুন। প্রিমিয়াম আনলক করতে ট্যাপ করুন।",
        "he": "עזור למפתח אינדי לשרוד את הקפיטליזם. הקש כדי לבטל את הנעילה של Premium.",
        "ar": "ساعد مطورًا مستقلاً على النجاة من الرأسمالية. انقر لفتح Premium.",
        "hi": "एक इंडी डेवलपर को पूंजीवाद से बचे रहने में मदद करें। प्रीमियम अनलॉक करने के लिए टैप करें।",
        "ja": "インディー開発者が資本主義を生き延びられるよう支援します。タップしてプレミアムのロックを解除します。",
        "zh": "帮助独立开发者在资本主义中生存。点击即可解锁高级版。",
        "ko": "인디 개발자가 자본주의에서 살아남을 수 있도록 도와주세요. 프리미엄을 잠금 해제하려면 탭하세요.",
        "es": "Ayuda a un desarrollador independiente a sobrevivir al capitalismo. Toca para desbloquear Premium.",
        "fr": "Aidez un développeur indépendant à survivre au capitalisme. Appuyez pour déverrouiller Premium.",
        "de": "Helfen Sie einem Indie-Entwickler, den Kapitalismus zu überleben. Tippen Sie hier, um Premium freizuschalten.",
        "ru": "Помогите инди-разработчику пережить капитализм. Нажмите, чтобы разблокировать Премиум.",
        "it": "Aiuta uno sviluppatore indipendente a sopravvivere al capitalismo. Tocca per sbloccare Premium.",
        "pt": "Ajude um desenvolvedor independente a sobreviver ao capitalismo. Toque para desbloquear o Premium.",
        "tr": "Bağımsız bir geliştiricinin kapitalizmden kurtulmasına yardımcı olun. Premium'un kilidini açmak için dokunun.",
        "id": "Bantu pengembang indie bertahan dari kapitalisme. Ketuk untuk membuka kunci Premium.",
        "ur": "انڈی ڈویلپر کی سرمایہ داری کو زندہ رہنے میں مدد کریں۔ پریمیم کو غیر مقفل کرنے کے لیے تھپتھپائیں۔",
        "fa": "به یک توسعه دهنده مستقل کمک کنید تا از سرمایه داری جان سالم به در ببرد. برای باز کردن قفل Premium ضربه بزنید."
    },
    "If you buy Premium, I promise to tell my mom someone actually bought my app.": {
        "bn": "প্রিমিয়াম নিলে আমি মাকে গর্ব করে বলতে পারব কেউ আমার অ্যাপ ভালোবেসেছে!",
        "he": "אם אתה קונה פרימיום, אני מבטיח לספר לאמא שלי שמישהו באמת קנה את האפליקציה שלי.",
        "ar": "إذا اشتريت Premium، أعدك أن أخبر أمي أن شخصًا ما اشترى تطبيقي بالفعل.",
        "hi": "यदि आप प्रीमियम खरीदते हैं, तो मैं अपनी माँ को यह बताने का वादा करता हूँ कि किसी ने वास्तव में मेरा ऐप खरीदा है।",
        "ja": "プレミアムを購入したら、誰かが実際に私のアプリを購入したことを母に伝えることを約束します。",
        "zh": "如果您购买高级版，我保证告诉我妈妈有人确实购买了我的应用程序。",
        "ko": "프리미엄을 구매하시면 누군가가 실제로 내 앱을 구매했다고 어머니께 말씀드리겠다고 약속합니다.",
        "es": "Si compras Premium, prometo decirle a mi mamá que alguien realmente compró mi aplicación.",
        "fr": "Si vous achetez Premium, je promets de dire à ma mère que quelqu'un a réellement acheté mon application.",
        "de": "Wenn du Premium kaufst, verspreche ich meiner Mutter zu sagen, dass jemand meine App tatsächlich gekauft hat.",
        "ru": "Если вы купите Premium, я обещаю рассказать маме, что кто-то действительно купил мое приложение.",
        "it": "Se acquisti Premium, prometto di dire a mia madre che qualcuno ha effettivamente acquistato la mia app.",
        "pt": "Se você comprar o Premium, prometo contar à minha mãe que alguém realmente comprou meu aplicativo.",
        "tr": "Premium satın alırsanız anneme birisinin uygulamamı gerçekten satın aldığını söyleyeceğime söz veriyorum.",
        "id": "Jika kamu membeli Premium, aku berjanji akan memberi tahu ibuku bahwa seseorang benar-benar membeli aplikasiku.",
        "ur": "اگر آپ پریمیم خریدتے ہیں، تو میں وعدہ کرتا ہوں کہ اپنی ماں کو بتاؤں گا کہ کسی نے واقعی میری ایپ خریدی ہے۔",
        "fa": "اگر Premium بخرید، قول می‌دهم به مادرم بگویم کسی واقعاً برنامه من را خریده است."
    },
    "Peace, tranquility, and zero banner ads trying to sell you car insurance.": {
        "bn": "শান্তি, স্থিরতা এবং কোনো অবাঞ্ছিত বাণিজ্যিক বিজ্ঞাপন ছাড়া পবিত্র পাঠ।",
        "he": "שלווה, שלווה ואפס מודעות באנר המנסות למכור לך ביטוח רכב.",
        "ar": "السلام والهدوء وعدم وجود إعلانات لافتة تحاول بيع التأمين على السيارات لك.",
        "hi": "शांति, शांति और शून्य बैनर विज्ञापन आपको कार बीमा बेचने की कोशिश कर रहे हैं।",
        "ja": "平和、静けさ、自動車保険の販売を目的としたバナー広告はありません。",
        "zh": "和平、安宁和零横幅广告试图向您推销汽车保险。",
        "ko": "평화, 평온, 그리고 자동차 보험을 판매하려는 배너 광고가 없습니다.",
        "es": "Paz, tranquilidad y cero anuncios publicitarios que intenten venderle un seguro de automóvil.",
        "fr": "Paix, tranquillité et aucune bannière publicitaire essayant de vous vendre une assurance automobile.",
        "de": "Frieden, Ruhe und keine Werbebanner, die versuchen, Ihnen eine Kfz-Versicherung zu verkaufen.",
        "ru": "Мир, спокойствие и отсутствие рекламных баннеров, пытающихся продать вам автострахование.",
        "it": "Pace, tranquillità e zero banner pubblicitari che cercano di venderti l'assicurazione auto.",
        "pt": "Paz, tranquilidade e zero banners tentando vender seguro de carro.",
        "tr": "Huzur, sükunet ve sıfır banner reklamlar size araba sigortası satmaya çalışıyor.",
        "id": "Kedamaian, ketenangan, dan tidak ada iklan banner yang mencoba menjual asuransi mobil kepada Anda.",
        "ur": "امن، سکون، اور صفر بینر اشتہارات جو آپ کو کار انشورنس بیچنے کی کوشش کر رہے ہیں۔",
        "fa": "صلح، آرامش و تبلیغات بنری صفر که سعی در فروش بیمه خودرو به شما دارند."
    },
    "Upgrade to Premium: Your daily verses deserve better than a low-budget ad.": {
        "bn": "প্রিমিয়াম নিন: আপনার দৈনিক বাণীগুলো বিজ্ঞাপনের চেয়ে অনেক বেশি মূল্যবান।",
        "he": "שדרג לפרימיום: לפסוקים היומיים שלך מגיע יותר ממודעה בתקציב נמוך.",
        "ar": "الترقية إلى Premium: آياتك اليومية تستحق أفضل من إعلان منخفض الميزانية.",
        "hi": "प्रीमियम में अपग्रेड करें: आपके दैनिक छंद कम बजट वाले विज्ञापन से बेहतर हैं।",
        "ja": "プレミアムにアップグレード: あなたの毎日の詩は、低予算の広告より価値があります。",
        "zh": "升级到高级版：您的日常诗句值得比低预算广告更好的内容。",
        "ko": "프리미엄으로 업그레이드: 귀하의 일일 구절은 저예산 광고보다 더 가치가 있습니다.",
        "es": "Actualice a Premium: sus versos diarios merecen algo mejor que un anuncio de bajo presupuesto.",
        "fr": "Passez à Premium : vos vers quotidiens méritent mieux qu’une publicité à petit budget.",
        "de": "Upgrade auf Premium: Ihre täglichen Verse verdienen etwas Besseres als eine Low-Budget-Anzeige.",
        "ru": "Перейдите на Премиум: ваши ежедневные стихи заслуживают большего, чем малобюджетная реклама.",
        "it": "Passa a Premium: i tuoi versi quotidiani meritano di meglio di una pubblicità a basso budget.",
        "pt": "Atualize para Premium: seus versículos diários merecem coisa melhor do que um anúncio de baixo orçamento.",
        "tr": "Premium'a yükseltin: Günlük şiirleriniz düşük bütçeli bir reklamdan daha iyisini hak ediyor.",
        "id": "Tingkatkan ke Premium: Ayat harian Anda layak mendapatkan yang lebih baik daripada iklan beranggaran rendah.",
        "ur": "پریمیم میں اپ گریڈ کریں: آپ کی روزانہ کی آیات کم بجٹ والے اشتہار سے بہتر ہیں۔",
        "fa": "ارتقا به Premium: آیات روزانه شما شایسته بهتر از یک تبلیغ کم‌هزینه است."
    },
    "Buy Premium and I'll literally do a celebratory backflip in my room.": {
        "bn": "প্রিমিয়াম নিলে এই ডেভেলপার পরম আনন্দে কৃতজ্ঞ থাকবে!",
        "he": "קנה פרימיום ואני ממש אעשה סיבוב לאחור חגיגי בחדר שלי.",
        "ar": "اشترِ Premium وسأقوم حرفيًا بقلب خلفي احتفالي في غرفتي.",
        "hi": "प्रीमियम खरीदें और मैं सचमुच अपने कमरे में एक जश्न मनाने वाला बैकफ़्लिप करूँगा।",
        "ja": "プレミアムを購入すれば、文字通り自分の部屋でお祝いのバク転をすることになります。",
        "zh": "购买高级版，我真的会在我的房间里做一个庆祝性的后空翻。",
        "ko": "프리미엄을 구매하면 말 그대로 내 방에서 축하 백플립을 할 수 있습니다.",
        "es": "Compra Premium y literalmente haré una voltereta hacia atrás de celebración en mi habitación.",
        "fr": "Achetez Premium et je ferai littéralement un backflip de célébration dans ma chambre.",
        "de": "Wenn ich Premium kaufe, mache ich buchstäblich einen feierlichen Rückwärtssalto in meinem Zimmer.",
        "ru": "Купите Premium, и я буквально сделаю праздничное сальто у себя в комнате.",
        "it": "Acquista Premium e farò letteralmente un salto mortale all'indietro celebrativo nella mia stanza.",
        "pt": "Compre Premium e eu literalmente darei um salto mortal para trás comemorativo no meu quarto.",
        "tr": "Premium satın alın ve odamda kelimenin tam anlamıyla bir kutlama ters takla atacağım.",
        "id": "Beli Premium dan saya akan melakukan backflip perayaan di kamar saya.",
        "ur": "پریمیم خریدیں اور میں لفظی طور پر اپنے کمرے میں جشن منانے کا بیک فلپ کروں گا۔",
        "fa": "Premium را بخرید و من به معنای واقعی کلمه در اتاقم یک تلنگر جشن انجام خواهم داد."
    },
    "Support a solo developer and cleanse your feed of all promotional clutter.": {
        "bn": "একক নির্মাতাকে সমর্থন করুন এবং আপনার ফিড সম্পূর্ণ পরিচ্ছন্ন রাখুন।",
        "he": "תמכו במפתח סולו ותנקו את הפיד שלכם מכל העומס בקידום מכירות.",
        "ar": "ادعم مطورًا منفردًا وقم بتنظيف خلاصتك من كل الفوضى الترويجية.",
        "hi": "एक एकल डेवलपर का समर्थन करें और अपने फ़ीड से सभी प्रचार संबंधी अव्यवस्थाएं साफ़ करें।",
        "ja": "個人開発者をサポートし、フィードから宣伝用の煩雑なものをすべて削除します。",
        "zh": "支持独立开发者并清理您的 Feed 中的所有促销混乱内容。",
        "ko": "1인 개발자를 지원하고 피드에서 모든 프로모션 관련 혼란을 제거하세요.",
        "es": "Apoye a un desarrollador en solitario y limpie su feed de todo el desorden promocional.",
        "fr": "Soutenez un développeur solo et nettoyez votre flux de tout encombrement promotionnel.",
        "de": "Unterstützen Sie einen Einzelentwickler und befreien Sie Ihren Feed von jeglichem Werbemüll.",
        "ru": "Поддержите индивидуального разработчика и очистите свою ленту от всего рекламного мусора.",
        "it": "Supporta uno sviluppatore solista e ripulisci il tuo feed da tutta la confusione promozionale.",
        "pt": "Apoie um desenvolvedor solo e limpe seu feed de toda a confusão promocional.",
        "tr": "Tek başına çalışan bir geliştiriciyi destekleyin ve feed'inizi tüm tanıtım karmaşasından arındırın.",
        "id": "Dukung pengembang tunggal dan bersihkan feed Anda dari semua kekacauan promosi.",
        "ur": "ایک سولو ڈویلپر کو سپورٹ کریں اور اپنی فیڈ کو تمام پروموشنل بے ترتیبی سے صاف کریں۔",
        "fa": "از یک توسعه دهنده انفرادی حمایت کنید و فید خود را از همه درهم و برهمی های تبلیغاتی پاک کنید."
    },
    "Zero ads, maximum cozy vibes, and you save a programmer from despair.": {
        "bn": "শূন্য বিজ্ঞাপন, সর্বোচ্চ প্রশান্তি এবং একটি সুন্দর আধ্যাত্মিক পরিবেশ।",
        "he": "אפס פרסומות, מקסימום אווירה נעימה, ואתה מציל מתכנת מייאוש.",
        "ar": "بدون إعلانات، وأقصى قدر من المشاعر المريحة، ويمكنك إنقاذ المبرمج من اليأس.",
        "hi": "शून्य विज्ञापन, अधिकतम आरामदायक वाइब्स, और आप एक प्रोग्रामर को निराशा से बचाते हैं।",
        "ja": "広告がゼロ、最大限の居心地の良い雰囲気で、プログラマーを絶望から救います。",
        "zh": "零广告，最大程度的舒适氛围，让程序员免于绝望。",
        "ko": "광고가 없고 아늑한 분위기가 극대화되어 프로그래머를 절망에서 구할 수 있습니다.",
        "es": "Cero anuncios, vibraciones máximas y acogedoras y salvas a un programador de la desesperación.",
        "fr": "Zéro publicité, ambiance chaleureuse maximale et vous sauvez un programmeur du désespoir.",
        "de": "Keine Werbung, maximale gemütliche Stimmung und Sie bewahren einen Programmierer vor der Verzweiflung.",
        "ru": "Ноль рекламы, максимум уюта и вы спасете программиста от отчаяния.",
        "it": "Zero pubblicità, massime vibrazioni accoglienti e salvi un programmatore dalla disperazione.",
        "pt": "Zero anúncios, máxima vibração aconchegante e você salva um programador do desespero.",
        "tr": "Sıfır reklam, maksimum rahatlık ve bir programcıyı umutsuzluktan kurtarırsınız.",
        "id": "Tanpa iklan, suasana nyaman maksimal, dan Anda menyelamatkan programmer dari keputusasaan.",
        "ur": "صفر اشتہارات، زیادہ سے زیادہ آرام دہ وائبس، اور آپ ایک پروگرامر کو مایوسی سے بچاتے ہیں۔",
        "fa": "بدون تبلیغات، حداکثر حالات دنج، و شما یک برنامه نویس را از ناامیدی نجات می دهید."
    },
    "Skip the ads, keep the wisdom, and bless an indie creator's day.": {
        "bn": "বিজ্ঞাপন এড়িয়ে চলুন, প্রজ্ঞা ধরে রাখুন এবং নির্মাতাকে উৎসাহিত করুন।",
        "he": "דלג על המודעות, שמור על החוכמה וברוך יום יוצר אינדי.",
        "ar": "تخطي الإعلانات، واحتفظ بالحكمة، وبارك يوم منشئ المحتوى المستقل.",
        "hi": "विज्ञापन छोड़ें, ज्ञान बनाए रखें और इंडी क्रिएटर दिवस को धन्य बनाएं।",
        "ja": "広告をスキップして知恵を蓄え、インディー クリエイターの一日を祝福しましょう。",
        "zh": "跳过广告，保留智慧，祝福独立创作者的一天。",
        "ko": "광고를 건너뛰고 지혜를 지키며 인디 창작자의 하루를 축복하세요.",
        "es": "Evite los anuncios, conserve la sabiduría y bendiga el día de un creador independiente.",
        "fr": "Évitez les publicités, gardez la sagesse et bénissez la journée d'un créateur indépendant.",
        "de": "Überspringen Sie die Werbung, behalten Sie die Weisheit und segnen Sie den Tag eines Indie-Schöpfers.",
        "ru": "Пропустите рекламу, сохраните мудрость и благословите день инди-творца.",
        "it": "Salta la pubblicità, mantieni la saggezza e benedici la giornata di un creatore indipendente.",
        "pt": "Ignore os anúncios, mantenha a sabedoria e abençoe o dia do criador independente.",
        "tr": "Reklamları atlayın, bilgeliğinizi koruyun ve bağımsız yaratıcıların gününü kutlayın.",
        "id": "Lewati iklan, pertahankan kebijaksanaan, dan berkahi hari pencipta indie.",
        "ur": "اشتہارات کو چھوڑیں، حکمت کو برقرار رکھیں، اور انڈی تخلیق کار کے دن کو مبارک کریں۔",
        "fa": "از تبلیغات بگذرید، حکمت را حفظ کنید و روز یک خالق مستقل را برکت دهید."
    },
    "A cozy, distraction-free sanctuary with all HD neural voices unlocked.": {
        "bn": "সব এইচডি কণ্ঠস্বর সহ এক শান্ত, নিরবচ্ছিন্ন পবিত্র অভিজ্ঞতার আশ্রয়।",
        "he": "מקלט נעים ונטול הסחות דעת עם כל הקולות העצביים HD פתוחים.",
        "ar": "ملاذ مريح وخالي من التشتيت مع فتح جميع الأصوات العصبية عالية الدقة.",
        "hi": "सभी एचडी तंत्रिका आवाजों के साथ एक आरामदायक, व्याकुलता-मुक्त अभयारण्य।",
        "ja": "すべての HD ニューラル音声のロックが解除された、居心地の良い、気を散らすことのない聖域。",
        "zh": "一个舒适、无干扰的庇护所，所有高清神经语音均已解锁。",
        "ko": "모든 HD 신경 음성이 잠금 해제된 아늑하고 산만함이 없는 안식처입니다.",
        "es": "Un santuario acogedor y sin distracciones con todas las voces neuronales HD desbloqueadas.",
        "fr": "Un sanctuaire confortable et sans distraction avec toutes les voix neuronales HD débloquées.",
        "de": "Ein gemütlicher, ablenkungsfreier Zufluchtsort, in dem alle neuronalen HD-Stimmen freigeschaltet sind.",
        "ru": "Уютное убежище без отвлекающих факторов, где разблокированы все нейронные голоса HD.",
        "it": "Un rifugio accogliente e privo di distrazioni con tutte le voci neurali HD sbloccate.",
        "pt": "Um santuário aconchegante e sem distrações, com todas as vozes neurais HD desbloqueadas.",
        "tr": "Tüm HD sinir seslerinin kilidinin açık olduğu rahat, dikkat dağıtıcı olmayan bir sığınak.",
        "id": "Tempat perlindungan yang nyaman dan bebas gangguan dengan semua suara saraf HD tidak terkunci.",
        "ur": "تمام HD نیورل آوازوں کے ساتھ ایک آرام دہ، خلفشار سے پاک پناہ گاہ۔",
        "fa": "پناهگاهی دنج و بدون حواس پرتی با تمام صداهای عصبی HD باز شده."
    },
    "Part": {
        "bn": "পর্ব",
        "hi": "भाग",
        "fr": "Partie",
        "es": "Parte",
        "ar": "الجزء",
        "de": "Teil",
        "it": "Parte",
        "pt": "Parte",
        "ru": "Часть",
        "tr": "Bölüm",
        "he": "חֵלֶק",
        "ja": "一部",
        "zh": "部分",
        "ko": "부분",
        "id": "Bagian",
        "ur": "حصہ",
        "fa": "قسمت",
        "nl": "Deel",
        "pl": "Część",
        "uk": "частина",
        "vi": "phần",
        "af": "Deel",
        "am": "ክፍል",
        "as": "অংশ",
        "az": "Hissə",
        "be": "частка",
        "bg": "Част",
        "bs": "Part",
        "ca": "Part",
        "ceb": "Bahin",
        "cs": "Část",
        "cy": "Rhan",
        "da": "Del",
        "el": "Μέρος",
        "eo": "Parto",
        "et": "osa",
        "eu": "zatia",
        "fi": "osa",
        "fil": "Bahagi",
        "ga": "Cuid",
        "gd": "Pàirt",
        "gl": "Parte",
        "gu": "ભાગ",
        "ha": "Sashe",
        "haw": "Māhele",
        "hr": "dio",
        "hu": "rész",
        "hy": "մաս",
        "ig": "Akụkụ",
        "is": "Hluti",
        "jv": "Part",
        "ka": "ნაწილი",
        "kk": "Бөлім",
        "km": "ផ្នែក",
        "kn": "Part",
        "ku": "Part",
        "ky": "Part",
        "la": "Pars",
        "lo": "ສ່ວນ",
        "lt": "dalis",
        "lv": "daļa",
        "mg": "Fizarana",
        "mi": "Wahi",
        "mk": "Дел",
        "ml": "ഭാഗം",
        "mn": "Хэсэг",
        "mr": "भाग",
        "ms": "Bahagian",
        "mt": "Parti",
        "my": "အပိုင်း",
        "ne": "भाग",
        "no": "Del",
        "ny": "Gawo",
        "or": "ଭାଗ",
        "pa": "ਭਾਗ",
        "ps": "برخه",
        "ro": "parte",
        "rw": "Igice",
        "sd": "حصو",
        "si": "කොටස",
        "sk": "Časť",
        "sl": "del",
        "sm": "Vaega",
        "sn": "Chikamu",
        "so": "Qayb",
        "sq": "Pjesë",
        "sr": "Парт",
        "st": "Karolo",
        "su": "Bagian",
        "sv": "Del",
        "sw": "Sehemu",
        "ta": "பகுதி",
        "te": "భాగం",
        "tg": "Қисми",
        "th": "ส่วนหนึ่ง",
        "tk": "Bölüm",
        "ug": "Part",
        "uz": "Qism",
        "xh": "Icandelo",
        "yi": "טייל",
        "yo": "Apakan",
        "zu": "Ingxenye"
    },
    "Book": {
        "bn": "খণ্ড",
        "hi": "किताब",
        "fr": "Livre",
        "es": "Libro",
        "ar": "الكتاب",
        "de": "Buch",
        "it": "Libro",
        "pt": "Livro",
        "ru": "Книга",
        "tr": "Kitap",
        "he": "סֵפֶר",
        "ja": "本",
        "zh": "书",
        "ko": "책",
        "id": "Buku",
        "ur": "کتاب",
        "fa": "کتاب",
        "nl": "Boek",
        "pl": "Książka",
        "uk": "книга",
        "vi": "Sách",
        "af": "Boek",
        "am": "መጽሐፍ",
        "as": "কিতাপ",
        "az": "kitab",
        "be": "Кніга",
        "bg": "книга",
        "bs": "Book",
        "ca": "Llibre",
        "ceb": "Libro",
        "cs": "Kniha",
        "cy": "Llyfr",
        "da": "Bog",
        "el": "Βιβλίο",
        "eo": "Libro",
        "et": "Raamat",
        "eu": "Liburua",
        "fi": "Kirja",
        "fil": "Aklat",
        "ga": "Leabhar",
        "gd": "Leabhar",
        "gl": "Libro",
        "gu": "પુસ્તક",
        "ha": "Littafi",
        "haw": "Buke",
        "hr": "Knjiga",
        "hu": "Könyv",
        "hy": "Գիրք",
        "ig": "Akwụkwọ",
        "is": "Bók",
        "jv": "Buku",
        "ka": "წიგნი",
        "kk": "Кітап",
        "km": "សៀវភៅ",
        "kn": "Book",
        "ku": "Pirtûk",
        "ky": "Китеп",
        "la": "Liber",
        "lo": "ປື້ມບັນທຶກ",
        "lt": "Knyga",
        "lv": "Grāmata",
        "mg": "Boky",
        "mi": "Pukapuka",
        "mk": "Книга",
        "ml": "പുസ്തകം",
        "mn": "Ном",
        "mr": "पुस्तक",
        "ms": "Buku",
        "mt": "Ktieb",
        "my": "စာအုပ်",
        "ne": "पुस्तक",
        "no": "Bok",
        "ny": "Buku",
        "or": "ବୁକ୍ କର |",
        "pa": "ਕਿਤਾਬ",
        "ps": "کتاب",
        "ro": "carte",
        "rw": "Igitabo",
        "sd": "ڪتاب",
        "si": "පොත",
        "sk": "Kniha",
        "sl": "Knjiga",
        "sm": "Tusi",
        "sn": "Book",
        "so": "Buug",
        "sq": "Libër",
        "sr": "Боок",
        "st": "Buka",
        "su": "Buku",
        "sv": "Boka",
        "sw": "Kitabu",
        "ta": "புத்தகம்",
        "te": "పుస్తకం",
        "tg": "Китоб",
        "th": "หนังสือ",
        "tk": "Kitap",
        "ug": "كىتاب",
        "uz": "Kitob",
        "xh": "Incwadi",
        "yi": "ספר",
        "yo": "Iwe",
        "zu": "Bhukha"
    },
    "Section": {
        "bn": "অনুচ্ছেদ",
        "hi": "अनुभाग",
        "fr": "Section",
        "es": "Sección",
        "ar": "القسم",
        "de": "Abschnitt",
        "it": "Sezione",
        "pt": "Seção",
        "ru": "Раздел",
        "tr": "Kısım",
        "he": "סָעִיף",
        "ja": "セクション",
        "zh": "部分",
        "ko": "부분",
        "id": "Bagian",
        "ur": "سیکشن",
        "fa": "بخش"
    },
    "Hymn": {
        "bn": "স্তোত্র",
        "hi": "सूक्त",
        "fr": "Hymne",
        "es": "Himno",
        "ar": "ترنيمة",
        "de": "Hymne",
        "it": "Inno",
        "pt": "Hino",
        "ru": "Гимн",
        "tr": "İlahi",
        "he": "הִמנוֹן",
        "ja": "賛美歌",
        "zh": "圣歌",
        "ko": "찬송가",
        "id": "Nyanyian pujian",
        "ur": "تسبیح",
        "fa": "سرود"
    },
    "Discourse": {
        "bn": "প্রবচন",
        "hi": "प्रवचन",
        "fr": "Discours",
        "es": "Discurso",
        "ar": "خطاب",
        "de": "Diskurs",
        "it": "Discorso",
        "pt": "Discurso",
        "ru": "Беседа",
        "tr": "Söylem",
        "he": "שִׂיחַ",
        "ja": "談話",
        "zh": "话语",
        "ko": "담화",
        "id": "Ceramah",
        "ur": "گفتگو",
        "fa": "گفتمان"
    },
    "Guru Granth": {
        "ar": "جورو جرانث",
        "bn": "গুরু গ্রন্থ",
        "hi": "गुरु ग्रंथ",
        "pa": "ਗੁਰੂ ਗ੍ਰੰਥ",
        "es": "Gurú Granth",
        "fr": "Guru Granth",
        "it": "Guru Granth",
        "de": "Guru Granth",
        "ru": "Гуру Грантх",
        "he": "גורו גרנת'",
        "ja": "グル・グランス",
        "zh": "古鲁·格兰斯",
        "ko": "전문가 그란스",
        "pt": "Guru Granth",
        "tr": "Guru Granth",
        "id": "Guru Granth",
        "ur": "گرو گرنتھ",
        "fa": "گورو گرانت",
        "nl": "Goeroe Granth",
        "pl": "Guru Granth",
        "uk": "Гуру Грант",
        "vi": "Đạo sư Granth",
        "af": "Guru Granth",
        "am": "ጉሩ ግራንት",
        "as": "গুৰু গ্ৰন্থ",
        "az": "Guru Granth",
        "be": "Гуру Грант",
        "bg": "Гуру Грант",
        "bs": "Guru Granth",
        "ca": "Guru Granth",
        "ceb": "Guru Granth",
        "cs": "Guru Granth",
        "cy": "Guru Granth",
        "da": "Guru Granth",
        "el": "Γκουρού Γκραντ",
        "eo": "Guruo Granth",
        "et": "Guru Granth",
        "eu": "Guru Granth",
        "fi": "Guru Granth",
        "fil": "Guru Granth",
        "ga": "Gúrú Granth",
        "gd": "Guru Granth",
        "gl": "Guru Granth",
        "gu": "ગુરુ ગ્રંથ",
        "ha": "Guru Granth",
        "haw": "Guru Granth",
        "hr": "Guru Granth",
        "hu": "Granth guru",
        "hy": "Գուրու Գրանթ",
        "ig": "Guru Granth",
        "is": "Sérfræðingur Granth",
        "jv": "Guru Granth",
        "ka": "გურუ გრანტი",
        "kk": "Гуру Грант",
        "km": "លោក Guru Granth",
        "kn": "ಗುರು ಗ್ರಂಥ",
        "ku": "Guru Granth",
        "ky": "Гуру Грант",
        "la": "Guru Granth",
        "lo": "Guru Granth",
        "lt": "Guru Grantas",
        "lv": "Guru Grants",
        "mg": "Guru Granth",
        "mi": "Guru Granth",
        "mk": "Гуру Грант",
        "ml": "ഗുരു ഗ്രന്ഥം",
        "mn": "Гуру Грант",
        "mr": "गुरु ग्रंथ",
        "ms": "Guru Granth",
        "mt": "Guru Granth",
        "my": "Guru Granth",
        "ne": "गुरु ग्रन्थ",
        "no": "Guru Granth",
        "ny": "Guru Granth",
        "or": "ଗୁରୁ ଗ୍ରନ୍ଥ |",
        "ps": "ګورو ګرانت",
        "ro": "Guru Granth",
        "rw": "Guru Granth",
        "sd": "گرو گرنٿ",
        "si": "ගුරු ග්‍රන්ත",
        "sk": "Guru Granth",
        "sl": "Guru Granth",
        "sm": "Guru Granth",
        "sn": "Guru Granth",
        "so": "Guru Granth",
        "sq": "Guru Granth",
        "sr": "Гуру Грантх",
        "st": "Guru Granth",
        "su": "Guru Granth",
        "sv": "Guru Granth",
        "sw": "Guru Granth",
        "ta": "குரு கிரந்தம்",
        "te": "గురు గ్రంథం",
        "tg": "Гуру Грант",
        "th": "คุรุแกรนธ์",
        "tk": "Guru Granth",
        "ug": "Guru Granth",
        "uz": "Guru Granth",
        "xh": "Guru Granth",
        "yi": "גורו גראַנט",
        "yo": "Guru Granth",
        "zu": "Guru Granth"
    },
    "Chronicles": {
        "ar": "أخبار الأيام",
        "bn": "বংশাবলি",
        "hi": "इतिहास",
        "es": "Crónicas",
        "fr": "Chroniques",
        "it": "Cronache",
        "de": "Chronik",
        "ru": "Паралипоменон",
        "he": "דִברֵי הַיָמִים",
        "ja": "年代記",
        "zh": "编年史",
        "ko": "역대기",
        "pt": "Crônicas",
        "tr": "Günlükler",
        "id": "kronik",
        "ur": "تواریخ",
        "fa": "تواریخ",
        "nl": "Kronieken",
        "pl": "Kroniki",
        "uk": "Хроніки",
        "vi": "Biên niên sử",
        "af": "Kronieke",
        "am": "ዜና መዋዕል",
        "as": "ক্ৰনিকলছ",
        "az": "Salnamələr",
        "be": "Хронікі",
        "bg": "Хроники",
        "bs": "Chronicles",
        "ca": "Cròniques",
        "ceb": "Mga Cronicas",
        "cs": "Kroniky",
        "cy": "Cronicl",
        "da": "Krøniker",
        "el": "Χρονικά",
        "eo": "Kronikoj",
        "et": "Kroonikad",
        "eu": "Kronikak",
        "fi": "Chronicles",
        "fil": "Mga Cronica",
        "ga": "Chronicles",
        "gd": "Chronicles",
        "gl": "Crónicas",
        "gu": "ક્રોનિકલ્સ",
        "ha": "Tarihi",
        "haw": "Moolelo",
        "hr": "Kronike",
        "hu": "Krónikák",
        "hy": "Տարեգրություններ",
        "ig": "Akụkọ ihe mere eme",
        "is": "Annáll",
        "jv": "Babad",
        "ka": "ქრონიკები",
        "kk": "Шежірелер",
        "km": "កាលប្បវត្តិ",
        "kn": "ಕ್ರಾನಿಕಲ್ಸ್",
        "ku": "Chronicles",
        "ky": "Жылнаама",
        "la": "Paralipomenon",
        "lo": "ພົງສາວະດານ",
        "lt": "Kronikos",
        "lv": "Hronikas",
        "mg": "Tantara",
        "mi": "Chronicles",
        "mk": "Летописи",
        "ml": "ക്രോണിക്കിൾസ്",
        "mn": "Шастир",
        "mr": "इतिवृत्त",
        "ms": "Tawarikh",
        "mt": "Kronaki",
        "my": "ရာဇဝင်ချုပ်များ",
        "ne": "इतिहास",
        "no": "Kronikker",
        "ny": "Mbiri",
        "or": "ଇତିହାସ",
        "pa": "ਇਤਹਾਸ",
        "ps": "تاریخونه",
        "ro": "Cronici",
        "rw": "Amateka",
        "sd": "تاريخون",
        "si": "වංශකතා",
        "sk": "Kroniky",
        "sl": "Kronike",
        "sm": "Nofoaiga a Tupu",
        "sn": "Makoronike",
        "so": "Taariikhdii",
        "sq": "Kronikat",
        "sr": "Хронике",
        "st": "Likronike",
        "su": "Babad",
        "sv": "Krönikor",
        "sw": "Mambo ya Nyakati",
        "ta": "நாளாகமம்",
        "te": "క్రానికల్స్",
        "tg": "Хроника",
        "th": "พงศาวดาร",
        "tk": "Chroniclesazgylar",
        "ug": "Chronicles",
        "uz": "Xronikalar",
        "xh": "IziKronike",
        "yi": "טשראָניקלעס",
        "yo": "Kronika",
        "zu": "IziKronike"
    },
    "Kings": {
        "ar": "الملوك",
        "bn": "রাজাবলি",
        "hi": "राजा",
        "es": "Reyes",
        "fr": "Rois",
        "it": "Re",
        "de": "Könige",
        "ru": "Царств",
        "he": "מלכים",
        "ja": "キングス",
        "zh": "国王队",
        "ko": "킹스",
        "pt": "Reis",
        "tr": "Krallar",
        "id": "Raja",
        "ur": "بادشاہ",
        "fa": "پادشاهان",
        "nl": "Koningen",
        "pl": "Królowie",
        "uk": "Королі",
        "vi": "Vua",
        "af": "Konings",
        "am": "ነገሥታት",
        "as": "ৰজাসকল",
        "az": "Krallar",
        "be": "Каралі",
        "bg": "крале",
        "bs": "Kraljevi",
        "ca": "Reis",
        "ceb": "Mga hari",
        "cs": "králové",
        "cy": "Brenhinoedd",
        "da": "Konger",
        "el": "Βασιλιάδες",
        "eo": "Reĝoj",
        "et": "Kuningad",
        "eu": "Erregeak",
        "fi": "Kuninkaat",
        "fil": "Mga hari",
        "ga": "Ríthe",
        "gd": "Righrean",
        "gl": "Reis",
        "gu": "રાજાઓ",
        "ha": "Sarakuna",
        "haw": "Moi",
        "hr": "Kraljevi",
        "hu": "Királyok",
        "hy": "Թագավորներ",
        "ig": "Ndị eze",
        "is": "Konungar",
        "jv": "raja-raja",
        "ka": "მეფეები",
        "kk": "Патшалар",
        "km": "ស្តេច",
        "kn": "ರಾಜರು",
        "ku": "Kings",
        "ky": "Падышалар",
        "la": "Regum",
        "lo": "ກະສັດ",
        "lt": "Karaliai",
        "lv": "Karaļi",
        "mg": "Mpanjaka",
        "mi": "Kingi",
        "mk": "Кралеви",
        "ml": "രാജാക്കന്മാർ",
        "mn": "Хаад",
        "mr": "राजे",
        "ms": "Raja-raja",
        "mt": "Kings",
        "my": "ဘုရင်များ",
        "ne": "राजाहरू",
        "no": "Konger",
        "ny": "Mafumu",
        "or": "ରାଜାମାନେ |",
        "pa": "ਰਾਜੇ",
        "ps": "پاچاهانو",
        "ro": "regi",
        "rw": "Abami",
        "sd": "بادشاهن",
        "si": "රජවරු",
        "sk": "Kings",
        "sl": "Kralji",
        "sm": "Tupu",
        "sn": "Madzimambo",
        "so": "Boqorrada",
        "sq": "Mbretërit",
        "sr": "Краљеви",
        "st": "Marena",
        "su": "Raja-raja",
        "sv": "kungar",
        "sw": "Wafalme",
        "ta": "அரசர்கள்",
        "te": "రాజులు",
        "tg": "Подшоҳон",
        "th": "คิงส์",
        "tk": "Patyşalar",
        "ug": "پادىشاھلار",
        "uz": "Shohlar",
        "xh": "Ookumkani",
        "yi": "מלכים",
        "yo": "Awon Oba",
        "zu": "Amakhosi"
    },
    "Samuel": {
        "ar": "صموئيل",
        "bn": "শমূয়েল",
        "hi": "शमूएल",
        "es": "Samuel",
        "fr": "Samuel",
        "it": "Samuele",
        "de": "Samuel",
        "ru": "Царств",
        "he": "שמואל",
        "ja": "サミュエル",
        "zh": "塞缪尔",
        "ko": "사무엘",
        "pt": "Samuel",
        "tr": "samuel",
        "id": "Samuel",
        "ur": "سموئیل",
        "fa": "ساموئل",
        "nl": "Samuël",
        "pl": "Samuela",
        "uk": "Самуель",
        "vi": "Samuel",
        "af": "Samuel",
        "am": "ሳሙኤል",
        "as": "চেমুৱেল",
        "az": "Samuel",
        "be": "Самуэль",
        "bg": "Самуил",
        "bs": "Samuel",
        "ca": "Samuel",
        "ceb": "Samuel",
        "cs": "Samueli",
        "cy": "Samuel",
        "da": "Samuel",
        "el": "Σαμουήλ",
        "eo": "Samuelo",
        "et": "Samuel",
        "eu": "Samuel",
        "fi": "Samuel",
        "fil": "Samuel",
        "ga": "Samúéil",
        "gd": "Samuel",
        "gl": "Samuel",
        "gu": "સેમ્યુઅલ",
        "ha": "Samuel",
        "haw": "Samuela",
        "hr": "Samuel",
        "hu": "Samuel",
        "hy": "Սամուել",
        "ig": "Samuel",
        "is": "Samúel",
        "jv": "Samuel",
        "ka": "სამუელი",
        "kk": "Самуэль",
        "km": "សាំយូអែល",
        "kn": "ಸ್ಯಾಮ್ಯುಯೆಲ್",
        "ku": "Samuel",
        "ky": "Шемуел",
        "la": "Samuel",
        "lo": "ຊາມູເອນ",
        "lt": "Samuelis",
        "lv": "Samuels",
        "mg": "Samoela",
        "mi": "Hamuera",
        "mk": "Самоил",
        "ml": "സാമുവൽ",
        "mn": "Самуел",
        "mr": "सॅम्युअल",
        "ms": "Samuel",
        "mt": "Samwel",
        "my": "ရှမွေလ",
        "ne": "शमूएल",
        "no": "Samuel",
        "ny": "Samueli",
        "or": "ଶାମୁୟେଲ |",
        "pa": "ਸੈਮੂਅਲ",
        "ps": "سیمالټ",
        "ro": "Samuel",
        "rw": "Samweli",
        "sd": "سموئيل",
        "si": "සැමුවෙල්",
        "sk": "Samuel",
        "sl": "Samuel",
        "sm": "Samuelu",
        "sn": "Samueri",
        "so": "Samuu'eel",
        "sq": "Samueli",
        "sr": "Самуел",
        "st": "Samuele",
        "su": "Samuel",
        "sv": "Samuel",
        "sw": "Samweli",
        "ta": "சாமுவேல்",
        "te": "శామ్యూల్",
        "tg": "Самуил",
        "th": "ซามูเอล",
        "tk": "Şamuwel",
        "ug": "سامۇئىل",
        "uz": "Samuel",
        "xh": "uSamuweli",
        "yi": "שמואל",
        "yo": "Samueli",
        "zu": "Samuweli"
    },
    "Song of Songs": {
        "ar": "نشيد الأنشاد",
        "bn": "পরমগীত",
        "hi": "श्रेष्ठगीत",
        "es": "Cantares",
        "fr": "Cantique des Cantiques",
        "it": "Cantico dei Cantici",
        "de": "Hohelied",
        "ru": "Песнь Песней",
        "he": "שיר השירים",
        "ja": "歌の中の歌",
        "zh": "歌中之歌",
        "ko": "노래의 노래",
        "pt": "Cântico dos Cânticos",
        "tr": "Şarkıların Şarkısı",
        "id": "Lagu Lagu",
        "ur": "گانوں کا گانا",
        "fa": "آهنگ آوازها",
        "nl": "Hooglied",
        "pl": "Pieśń nad pieśniami",
        "uk": "Пісня пісень",
        "vi": "Bài hát của bài hát",
        "af": "Lied van Liedere",
        "am": "መዝሙር",
        "as": "গীতৰ গীত",
        "az": "Mahnı Mahnısı",
        "be": "Песня песень",
        "bg": "Песен на песните",
        "bs": "Pjesma nad pjesmama",
        "ca": "Cançó de Cançons",
        "ceb": "Awit sa mga Awit",
        "cs": "Píseň písní",
        "cy": "Cân y Caneuon",
        "da": "Sange af sange",
        "el": "Τραγούδι των τραγουδιών",
        "eo": "Kanto de Kantoj",
        "et": "Laulude laul",
        "eu": "Kantuen Kanta",
        "fi": "Laulujen laulu",
        "fil": "Awit ng mga Awit",
        "ga": "Amhrán na nAmhrán",
        "gd": "Òran nan Òran",
        "gl": "Canción das Cancións",
        "gu": "ગીતોનું ગીત",
        "ha": "Wakar Wakoki",
        "haw": "Mele o na Mele",
        "hr": "Pjesma nad pjesmama",
        "hu": "Énekek éneke",
        "hy": "Երգ երգոց",
        "ig": "Abụ nke Abụ",
        "is": "Söngur söngva",
        "jv": "Tembang Macapat",
        "ka": "სიმღერების სიმღერა",
        "kk": "Әндер әні",
        "km": "ចម្រៀងចម្រៀង",
        "kn": "ಹಾಡುಗಳ ಹಾಡು",
        "ku": "Song of Songs",
        "ky": "Ырлар ыры",
        "la": "Canticum Canticorum",
        "lo": "ບົດເພງ",
        "lt": "Dainų dainelė",
        "lv": "Dziesmu dziesma",
        "mg": "Tonon-kira",
        "mi": "Waiata Waiata",
        "mk": "Песна на песните",
        "ml": "ഗാനങ്ങളുടെ ഗാനം",
        "mn": "Дууны дуу",
        "mr": "गाण्याचे गाणे",
        "ms": "Lagu Lagu",
        "mt": "Kanzunetta tal-Għanijiet",
        "my": "သီချင်းများ",
        "ne": "गीतको गीत",
        "no": "Song of Songs",
        "ny": "Nyimbo ya Nyimbo",
        "or": "ଗୀତର ଗୀତ",
        "pa": "ਗੀਤਾਂ ਦਾ ਗੀਤ",
        "ps": "د سندرو سندره",
        "ro": "Cântecul Cântărilor",
        "rw": "Indirimbo",
        "sd": "گيت جو گيت",
        "si": "ගීත ගීතය",
        "sk": "Pieseň piesní",
        "sl": "Pesem pesmi",
        "sm": "Pese o Pese",
        "sn": "Rwiyo Rwonziyo",
        "so": "Heesta Heesaha",
        "sq": "Kënga e Këngëve",
        "sr": "Песма над песмама",
        "st": "Sefela sa Difela",
        "su": "Lagu Sunda",
        "sv": "Song of Songs",
        "sw": "Wimbo wa Nyimbo",
        "ta": "பாடல்களின் பாடல்",
        "te": "పాటల పాట",
        "tg": "Суруди Сурудхо",
        "th": "บทเพลงแห่งเพลง",
        "tk": "Aýdym aýdymy",
        "ug": "Song of Songs",
        "uz": "Qo'shiqlar qo'shig'i",
        "xh": "INgoma yazo iiNgoma",
        "yi": "שיר פון לידער",
        "yo": "Orin Orin",
        "zu": "Ingoma Yezingoma"
    },
    "Pirkei Avot": {
        "ar": "أقوال الآباء",
        "bn": "পিরকেই অভোট",
        "hi": "पिरकेई अवोत",
        "he": "פרקי אבות",
        "es": "Pirkei Avot",
        "fr": "Pirkei Avot",
        "it": "Pirkei Avot",
        "de": "Pirke Awot",
        "ru": "Пиркей Авот",
        "ja": "ピルケイ・アボット",
        "zh": "皮尔基·阿沃特",
        "ko": "피르케이 아보트",
        "pt": "Pirkei Avot",
        "tr": "Pirkei Avot",
        "id": "Pirkei Avot",
        "ur": "پیرکی ایوٹ",
        "fa": "پیرکی آووت",
        "nl": "Pirkei Avot",
        "pl": "Pirkei Avot",
        "uk": "Піркей Авот",
        "vi": "Pirkei Avot",
        "af": "Pirkei Avot",
        "am": "ፒርኬ አቮት",
        "as": "পিৰকেই আভোট",
        "az": "Pirkei Avot",
        "be": "Піркей Авот",
        "bg": "Пиркей Авот",
        "bs": "Pirkei Avot",
        "ca": "Pirkei Avot",
        "ceb": "Pirkei Avot",
        "cs": "Pirkei Avot",
        "cy": "Avot Pirkei",
        "da": "Pirkei Avot",
        "el": "Πιρκέι Αβοτ",
        "eo": "Pirkei Avot",
        "et": "Pirkei Avot",
        "eu": "Pirkei Avot",
        "fi": "Pirkei Avot",
        "fil": "Pirkei Avot",
        "ga": "Pirkei Avot",
        "gd": "Avot Pirkei",
        "gl": "Pirkei Avot",
        "gu": "પીરકેઇ એવોટ",
        "ha": "Pirkei Avot",
        "haw": "Pirkei Avot",
        "hr": "Pirkei Avot",
        "hu": "Pirkei Avot",
        "hy": "Պիրկեի Ավոտ",
        "ig": "Pirkei Avot",
        "is": "Pirkei Avot",
        "jv": "Pirkei Avot",
        "ka": "პირკეი ავტ",
        "kk": "Пиркей Авот",
        "km": "ភឺកគី អាវ៉ត",
        "kn": "ಪಿರ್ಕಿ ಅವೋಟ್",
        "ku": "Pirkei Avot",
        "ky": "Пиркей Авот",
        "la": "Pirkei Avot",
        "lo": "Pirkei Avot",
        "lt": "Pirkei Avot",
        "lv": "Pirkei Avot",
        "mg": "Pirkei Avot",
        "mi": "Pirkei Avot",
        "mk": "Пиркеи Авот",
        "ml": "പിർകെയ് അവോട്ട്",
        "mn": "Пиркэй Авот",
        "mr": "पिरकी अवोट",
        "ms": "Pirkei Avot",
        "mt": "Pirkei Avot",
        "my": "Pirkei Avot",
        "ne": "Pirkei Avot",
        "no": "Pirkei Avot",
        "ny": "Pirkei Avot",
        "or": "ପିରକେ ଆଭଟ୍ |",
        "pa": "ਪਿਰਕੀ ਅਵੋਟ",
        "ps": "پیرکي ایوټ",
        "ro": "Pirkei Avot",
        "rw": "Pirkei Avot",
        "sd": "پيرڪي آٽو",
        "si": "Pirkei Avot",
        "sk": "Pirkei Avot",
        "sl": "Pirkei Avot",
        "sm": "Pirkei Avot",
        "sn": "Pirkei Avot",
        "so": "Pirkei Avot",
        "sq": "Pirkei Avot",
        "sr": "Пиркеи Авот",
        "st": "Pirkei Avot",
        "su": "Pirkei Avot",
        "sv": "Pirkei Avot",
        "sw": "Pirkei Avot",
        "ta": "Pirkei Avot",
        "te": "పిర్కీ అవోట్",
        "tg": "Пиркей Авот",
        "th": "ปิร์เคอิ อวอต",
        "tk": "Pirkei Awot",
        "ug": "Pirkei Avot",
        "uz": "Pirkei Avot",
        "xh": "Pirkei Avot",
        "yi": "פרקי אבות",
        "yo": "Pirkei Avot",
        "zu": "I-Pirkei Avot"
    },
    "Berakhot": {
        "ar": "براخوت",
        "bn": "বেরাখত",
        "hi": "बेराखोत",
        "he": "ברכות",
        "es": "Berajot",
        "fr": "Berakhot",
        "it": "Berakhot",
        "de": "Berachot",
        "ru": "Брахот",
        "ja": "ベラコット",
        "zh": "伯拉霍特",
        "ko": "베라호트",
        "pt": "Berakhot",
        "tr": "Berahot",
        "id": "Berakhot",
        "ur": "بیراکھوٹ",
        "fa": "براخوت",
        "nl": "Berakhot",
        "pl": "Berachot",
        "uk": "Берахот",
        "vi": "Berakhot",
        "af": "Berakhot",
        "am": "በራክሆት",
        "as": "বেৰাখোট",
        "az": "Berakhot",
        "be": "Берахот",
        "bg": "Берахот",
        "bs": "Berakhot",
        "ca": "Berakhot",
        "ceb": "Berakhot",
        "cs": "Berachot",
        "cy": "Berakhot",
        "da": "Berakhot",
        "el": "Berakhot",
        "eo": "Berakhot",
        "et": "Berakhot",
        "eu": "Berakhot",
        "fi": "Berakhot",
        "fil": "Berakhot",
        "ga": "Berakhot",
        "gd": "Berakhot",
        "gl": "Berakhot",
        "gu": "બેરાખોટ",
        "ha": "Berakhot",
        "haw": "Berakhot",
        "hr": "Berakhot",
        "hu": "Berakhot",
        "hy": "Բերախոտ",
        "ig": "Berakhot",
        "is": "Berakhot",
        "jv": "Berakhot",
        "ka": "ბერახოტი",
        "kk": "Берахот",
        "km": "Berakhot",
        "kn": "ಬೆರಾಖೋಟ್",
        "ku": "Berakhot",
        "ky": "Берахот",
        "la": "Berakhot",
        "lo": "Berakhot",
        "lt": "Berakhotas",
        "lv": "Berakhots",
        "mg": "Berakhot",
        "mi": "Berakhot",
        "mk": "Беракот",
        "ml": "ബെരാഖോട്ട്",
        "mn": "Берахот",
        "mr": "बेराखोत",
        "ms": "Berakhot",
        "mt": "Berakhot",
        "my": "Berakhot",
        "ne": "बेराखोट",
        "no": "Berakhot",
        "ny": "Berakhot",
        "or": "ବେରାଖୋଟ୍ |",
        "pa": "ਬੇਰਕੋਟ",
        "ps": "برخوت",
        "ro": "Berakhot",
        "rw": "Berakhot",
        "sd": "بيراڪوٽ",
        "si": "බෙරාකොට්",
        "sk": "Berakhot",
        "sl": "Berakhot",
        "sm": "Berakhot",
        "sn": "Berakhot",
        "so": "Berakhot",
        "sq": "Berakhot",
        "sr": "Беракхот",
        "st": "Berakhot",
        "su": "Berakhot",
        "sv": "Berakhot",
        "sw": "Berakhot",
        "ta": "பெராகோட்",
        "te": "బెరాఖోట్",
        "tg": "Берахот",
        "th": "เบราค็อต",
        "tk": "Berakhot",
        "ug": "Berakhot",
        "uz": "Beraxot",
        "xh": "Berakhot",
        "yi": "בערכאָט",
        "yo": "Berakhot",
        "zu": "I-Berakhot"
    },
    "Shabbat": {
        "ar": "شابات",
        "bn": "শাব্বাত",
        "hi": "शब्बात",
        "he": "שבת",
        "es": "Shabat",
        "fr": "Chabbat",
        "it": "Shabbat",
        "de": "Schabbat",
        "ru": "Шаббат",
        "ja": "安息日",
        "zh": "安息日",
        "ko": "안식일",
        "pt": "Shabat",
        "tr": "Şabat",
        "id": "Sabat",
        "ur": "شبت",
        "fa": "شبات",
        "nl": "Sjabbat",
        "pl": "Szabat",
        "uk": "Шабат",
        "vi": "ngày lễ Shabbat",
        "af": "Shabbat",
        "am": "ሻባት",
        "as": "শ্বাব্বাত",
        "az": "Şənbə",
        "be": "Шабат",
        "bg": "Шабат",
        "bs": "Šabat",
        "ca": "Xabat",
        "ceb": "Shabbat",
        "cs": "Šabat",
        "cy": "Shabbat",
        "da": "sabbat",
        "el": "Σαμπάτ",
        "eo": "Ŝabato",
        "et": "Shabbat",
        "eu": "Xabat",
        "fi": "Sapatti",
        "fil": "Shabbat",
        "ga": "Shabbat",
        "gd": "Shabbat",
        "gl": "Shabat",
        "gu": "શબત",
        "ha": "Shabbat",
        "haw": "Sābati",
        "hr": "Šabat",
        "hu": "Sabbat",
        "hy": "Շաբաթ",
        "ig": "Shabbat",
        "is": "Hvíldardagur",
        "jv": "Sabat",
        "ka": "შაბათი",
        "kk": "Демалыс",
        "km": "សាប់បាត",
        "kn": "ಶಬ್ಬತ್",
        "ku": "Shabbat",
        "ky": "Ишемби",
        "la": "sabbatum",
        "lo": "ຊາບາບັດ",
        "lt": "Šabas",
        "lv": "Šabats",
        "mg": "Sabata",
        "mi": "Hapati",
        "mk": "Шабат",
        "ml": "ശബ്ബത്ത്",
        "mn": "Амралтын өдөр",
        "mr": "शब्बत",
        "ms": "Shabbat",
        "mt": "Shabbat",
        "my": "ရှာဘတ်",
        "ne": "शब्बत",
        "no": "sabbat",
        "ny": "Sabata",
        "or": "ଶବ୍ଦ",
        "pa": "ਸ਼ਬਤ",
        "ps": "شبانه",
        "ro": "Shabat",
        "rw": "Isabato",
        "sd": "شببت",
        "si": "ෂබාත්",
        "sk": "Šabat",
        "sl": "Šabat",
        "sm": "Sapati",
        "sn": "Shabbat",
        "so": "Shabbat",
        "sq": "Shabat",
        "sr": "Шабат",
        "st": "Shabbat",
        "su": "Sabat",
        "sv": "Shabbat",
        "sw": "Sabato",
        "ta": "சப்பாத்",
        "te": "షబ్బత్",
        "tg": "шанбе",
        "th": "ถือบวช",
        "tk": "Şenbe",
        "ug": "شابات",
        "uz": "Shabbat",
        "xh": "ISabatha",
        "yi": "שבת",
        "yo": "Shabbat",
        "zu": "ISabatha"
    },
    "Pesachim": {
        "ar": "بيساخيم",
        "bn": "পেসাহিম",
        "hi": "पेसाखिम",
        "he": "פסחים",
        "es": "Pesajim",
        "fr": "Pessahim",
        "it": "Pesachim",
        "de": "Pessachim",
        "ru": "Песахим",
        "ja": "ペサチム",
        "zh": "佩萨金",
        "ko": "페사침",
        "pt": "Pesachim",
        "tr": "Pesachim",
        "id": "Pesachim",
        "ur": "Pesachim",
        "fa": "پساخیم",
        "nl": "Pesachim",
        "pl": "Pesachim",
        "uk": "Песахім",
        "vi": "quả hồ trăn",
        "af": "Pesachim",
        "am": "ፔሳቺም",
        "as": "পেছাচিম",
        "az": "Pesachim",
        "be": "песахім",
        "bg": "Песахим",
        "bs": "Pesachim",
        "ca": "Pesachim",
        "ceb": "Pesachim",
        "cs": "Pesachim",
        "cy": "Pesachim",
        "da": "Pesachim",
        "el": "Πεσαχίμ",
        "eo": "Pezaĥim",
        "et": "Pesachim",
        "eu": "Pesachim",
        "fi": "Pesachim",
        "fil": "Pesachim",
        "ga": "Pesachim",
        "gd": "Pesachim",
        "gl": "Pesachim",
        "gu": "પેસાચીમ",
        "ha": "Pesachim",
        "haw": "Pesakima",
        "hr": "Pesahim",
        "hu": "Pesachim",
        "hy": "Պեսախիմ",
        "ig": "Pesachim",
        "is": "Pesachim",
        "jv": "Pesakhim",
        "ka": "პესაჩიმ",
        "kk": "Песахим",
        "km": "ប៉េសាឈីម",
        "kn": "ಪೆಸಾಚಿಮ್",
        "ku": "Pesachim",
        "ky": "Песахим",
        "la": "Pesachim",
        "lo": "ເປຊາຊິມ",
        "lt": "Pesachimas",
        "lv": "Pesahims",
        "mg": "Pesachim",
        "mi": "Pesakimi",
        "mk": "Песаким",
        "ml": "പെസചിം",
        "mn": "Песахим",
        "mr": "पेसाचिम",
        "ms": "Pesakhim",
        "mt": "Pesachim",
        "my": "Pesachim",
        "ne": "पेसाचिम",
        "no": "Pesachim",
        "ny": "Pesachim",
        "or": "ପେସାଚିମ୍ |",
        "pa": "ਪੇਸਾਚਿਮ",
        "ps": "Pesachim",
        "ro": "Pesachim",
        "rw": "Pesachim",
        "sd": "پساچيم",
        "si": "Pesachim",
        "sk": "Pesachim",
        "sl": "Pesachim",
        "sm": "Pesakim",
        "sn": "Pesachim",
        "so": "Pesachim",
        "sq": "Pesachim",
        "sr": "Песацхим",
        "st": "Pesachim",
        "su": "Pesakhim",
        "sv": "Pesachim",
        "sw": "Pesachim",
        "ta": "பேசாச்சிம்",
        "te": "పెసాచిమ్",
        "tg": "Песахим",
        "th": "เพซาชิม",
        "tk": "Pesahim",
        "ug": "Pesachim",
        "uz": "Pesachim",
        "xh": "Pesachim",
        "yi": "פסחים",
        "yo": "Pesachim",
        "zu": "Pesachim"
    },
    "Yoma": {
        "ar": "يوما",
        "bn": "ইয়োমা",
        "hi": "योमा",
        "he": "יומא",
        "es": "Yomá",
        "fr": "Yoma",
        "it": "Yoma",
        "de": "Joma",
        "ru": "Йома",
        "ja": "枯れる",
        "zh": "干涸",
        "ko": "건조시키다",
        "pt": "Secar",
        "tr": "Kurutmak",
        "id": "Mengering",
        "ur": "سوکھ جانا",
        "fa": "خشک کن",
        "nl": "Joma",
        "pl": "Joma",
        "uk": "Йома",
        "vi": "Yoma",
        "af": "Yoma",
        "am": "ዮማ",
        "as": "যোমা",
        "az": "Yoma",
        "be": "Ёма",
        "bg": "Йома",
        "bs": "Yoma",
        "ca": "Yoma",
        "ceb": "Yoma",
        "cs": "Yoma",
        "cy": "Ioma",
        "da": "Yoma",
        "el": "Γιόμα",
        "eo": "Yoma",
        "et": "Yoma",
        "eu": "Yoma",
        "fi": "Yoma",
        "fil": "Yoma",
        "ga": "Ioma",
        "gd": "Ioma",
        "gl": "Yoma",
        "gu": "યોમા",
        "ha": "Yoma",
        "haw": "ʻO Yoma",
        "hr": "Yoma",
        "hu": "Yoma",
        "hy": "Յոմա",
        "ig": "Yoma",
        "is": "Yoma",
        "jv": "Yoma",
        "ka": "იომა",
        "kk": "Йома",
        "km": "យូម៉ា",
        "kn": "ಯೋಮಾ",
        "ku": "Yoma",
        "ky": "Yoma",
        "la": "Yoma",
        "lo": "ໂຍມາ",
        "lt": "Yoma",
        "lv": "Joma",
        "mg": "Yoma",
        "mi": "Yoma",
        "mk": "Јома",
        "ml": "യോമ",
        "mn": "Йома",
        "mr": "योमा",
        "ms": "Yoma",
        "mt": "Yoma",
        "my": "ရိုးမ",
        "ne": "योमा",
        "no": "Yoma",
        "ny": "Yoma",
        "or": "ୟୋମା",
        "pa": "ਯੋਮਾ",
        "ps": "یوما",
        "ro": "Yoma",
        "rw": "Yoma",
        "sd": "يوما",
        "si": "යෝමා",
        "sk": "Joma",
        "sl": "Yoma",
        "sm": "Yoma",
        "sn": "Yoma",
        "so": "Yoma",
        "sq": "Yoma",
        "sr": "Иома",
        "st": "Yoma",
        "su": "Yoma",
        "sv": "Yoma",
        "sw": "Yoma",
        "ta": "யோமா",
        "te": "యోమా",
        "tg": "Йома",
        "th": "โยมา",
        "tk": "Omaoma",
        "ug": "Yoma",
        "uz": "Yoma",
        "xh": "Yoma",
        "yi": "יאָמאַ",
        "yo": "Yoma",
        "zu": "Yoma"
    },
    "Sukkah": {
        "ar": "سوكاه",
        "bn": "সুক্কাহ",
        "hi": "सुक्काह",
        "he": "סוכה",
        "es": "Sucá",
        "fr": "Soukka",
        "it": "Sukkah",
        "de": "Sukka",
        "ru": "Сукка",
        "ja": "スカ",
        "zh": "住棚",
        "ko": "숙카",
        "pt": "Sucá",
        "tr": "Suka",
        "id": "Sukkah",
        "ur": "سکہ",
        "fa": "سوکا",
        "nl": "Soeka",
        "pl": "Sukka",
        "uk": "сукка",
        "vi": "Sukkah",
        "af": "Sukkah",
        "am": "ሱካህ",
        "as": "চুক্কাহ",
        "az": "Sukkah",
        "be": "Сука",
        "bg": "Сука",
        "bs": "Sukkah",
        "ca": "Sukkah",
        "ceb": "Sukkah",
        "cs": "Sukkah",
        "cy": "Sukkah",
        "da": "Sukkah",
        "el": "Σουκά",
        "eo": "Sukkah",
        "et": "Sukkah",
        "eu": "Suka",
        "fi": "Sukka",
        "fil": "Sukkah",
        "ga": "Sukkah",
        "gd": "Sukkah",
        "gl": "Sucá",
        "gu": "સુક્કા",
        "ha": "Sukkah",
        "haw": "Suka",
        "hr": "suka",
        "hu": "Sukkah",
        "hy": "Սուկկա",
        "ig": "Sukkah",
        "is": "Súkka",
        "jv": "Sukkah",
        "ka": "სუკა",
        "kk": "Сукка",
        "km": "សុខគា",
        "kn": "ಸುಕ್ಕಾಹ್",
        "ku": "Sukkah",
        "ky": "Сукка",
        "la": "Sukkah",
        "lo": "ສຸກກາ",
        "lt": "Suka",
        "lv": "Suka",
        "mg": "Sukkah",
        "mi": "Huka",
        "mk": "Сука",
        "ml": "സുക്ക",
        "mn": "Сукка",
        "mr": "सुक्का",
        "ms": "Sukkah",
        "mt": "Sukkah",
        "my": "Sukkah",
        "ne": "सुक्का",
        "no": "Sukkah",
        "ny": "Sukkah",
        "or": "ସୁକ୍କା",
        "pa": "ਸੁੱਖਾ",
        "ps": "سکه",
        "ro": "Sukkah",
        "rw": "Sukkah",
        "sd": "سُکَ",
        "si": "සුක්කාහ්",
        "sk": "Sukkah",
        "sl": "suka",
        "sm": "Suka",
        "sn": "Sukkah",
        "so": "Sukkah",
        "sq": "Sukkah",
        "sr": "Сукках",
        "st": "Sukkah",
        "su": "Sukkah",
        "sv": "Sukkah",
        "sw": "Sukka",
        "ta": "சுக்கா",
        "te": "సుక్కా",
        "tg": "Сукка",
        "th": "สุขกะ",
        "tk": "Sukkah",
        "ug": "Sukkah",
        "uz": "Sukka",
        "xh": "Sukkah",
        "yi": "סוכה",
        "yo": "Sukkah",
        "zu": "Sukkah"
    },
    "Rosh Hashanah": {
        "ar": "روش هاشاناه",
        "bn": "রোশ হাশানাহ",
        "hi": "रोश हशनाह",
        "he": "ראש השנה",
        "es": "Rosh Hashaná",
        "fr": "Roch Hachana",
        "it": "Rosh Hashanah",
        "de": "Rosch ha-Schana",
        "ru": "Рош ха-Шана",
        "ja": "ロシュ・ハシャナ",
        "zh": "犹太新年",
        "ko": "로쉬 하샤나",
        "pt": "Rosh Hashaná",
        "tr": "Roş Aşana",
        "id": "Rosh Hashanah",
        "ur": "روش ہشناہ",
        "fa": "روش هاشانا",
        "nl": "Rosj Hasjana",
        "pl": "Rosz Haszana",
        "uk": "Рош ха-Шана",
        "vi": "Lễ Rosh Hashanah",
        "af": "Rosh Hashanah",
        "am": "ሮሽ ሃሻናህ",
        "as": "ৰোছ হাছানাহ",
        "az": "Roş Haşana",
        "be": "Рош Ха-Шана",
        "bg": "Рош Хашана",
        "bs": "Rosh Hashanah",
        "ca": "Rosh Hashanà",
        "ceb": "Rosh Hashanah",
        "cs": "Roš hašana",
        "cy": "Rosh Hashanah",
        "da": "Rosh Hashanah",
        "el": "Ρος Χασάνα",
        "eo": "Roŝ Haŝana",
        "et": "Rosh Hashanah",
        "eu": "Rosh Hashanah",
        "fi": "Rosh Hashanah",
        "fil": "Rosh Hashanah",
        "ga": "Rosh Hashanah",
        "gd": "Rois Hashanah",
        "gl": "Rosh Hashaná",
        "gu": "રોશ હશનાહ",
        "ha": "Rosh Hashana",
        "haw": "Rosh Hashanah",
        "hr": "Roš Hašana",
        "hu": "Ros Hásáná",
        "hy": "Ռոշ Հաշանա",
        "ig": "Rosh Hashanah",
        "is": "Rosh Hashanah",
        "jv": "Rosh Hashanah",
        "ka": "როშ ჰაშანა",
        "kk": "Рош Хашана",
        "km": "Rosh Hashanah",
        "kn": "ರೋಶ್ ಹಶಾನಾ",
        "ku": "Rosh Hashanah",
        "ky": "Рош Хашана",
        "la": "Rosh Hashanah",
        "lo": "Rosh Hashanah",
        "lt": "Rosh Hashanah",
        "lv": "Roš Hašāna",
        "mg": "Rosh Hashanah",
        "mi": "Rosh Hashanah",
        "mk": "Рош Хашана",
        "ml": "റോഷ് ഹഷാന",
        "mn": "Рош Хашана",
        "mr": "रोश हशनाह",
        "ms": "Rosh Hashanah",
        "mt": "Rosh Hashanah",
        "my": "Rosh Hashanah",
        "ne": "रोश हसनाह",
        "no": "Rosh Hashanah",
        "ny": "Rosh Hashanah",
        "or": "ରୋଶ୍ ହାଶାନା |",
        "pa": "ਰੋਸ਼ ਹਸ਼ਨਾਹ",
        "ps": "روش هشنه",
        "ro": "Rosh Hashanah",
        "rw": "Rosh Hashanah",
        "sd": "روش هشانا",
        "si": "රොෂ් හෂානා",
        "sk": "Roš Hašana",
        "sl": "Roš Hašana",
        "sm": "Rosh Hashanah",
        "sn": "Rosh Hashanah",
        "so": "Rosh Hashanah",
        "sq": "Rosh Hashanah",
        "sr": "Росх Хасханах",
        "st": "Rosh Hashanah",
        "su": "Rosh Hashanah",
        "sv": "Rosh Hashanah",
        "sw": "Rosh Hashanah",
        "ta": "ரோஷ் ஹஷானா",
        "te": "రోష్ హషానా",
        "tg": "Рош Ҳашана",
        "th": "โรช ฮาชานาห์",
        "tk": "Roş Haşana",
        "ug": "Rosh Hashanah",
        "uz": "Rosh Xashanah",
        "xh": "Rosh Hashanah",
        "yi": "ראש השנה",
        "yo": "Rosh Hashanah",
        "zu": "Rosh Hashanah"
    },
    "Megillah": {
        "ar": "مجيلاه",
        "bn": "মেগিল্লাহ",
        "hi": "मेगिलाह",
        "he": "מגילה",
        "es": "Meguilá",
        "fr": "Meguila",
        "it": "Megillah",
        "de": "Megilla",
        "ru": "Мегила",
        "ja": "メギラ",
        "zh": "梅吉拉",
        "ko": "메길라",
        "pt": "Meguilá",
        "tr": "Megillah",
        "id": "Megillah",
        "ur": "میگلہ",
        "fa": "مگی الله",
        "nl": "Megilla",
        "pl": "Megilla",
        "uk": "Мегілла",
        "vi": "Megillah",
        "af": "Megilla",
        "am": "መጊላህ",
        "as": "মেগিল্লা",
        "az": "Megillah",
        "be": "Мегіла",
        "bg": "Мегила",
        "bs": "Megillah",
        "ca": "Meguila",
        "ceb": "Megillah",
        "cs": "Megillah",
        "cy": "Megillah",
        "da": "Megillah",
        "el": "Μεγκίλλα",
        "eo": "Megilah",
        "et": "Megillah",
        "eu": "Megilah",
        "fi": "Megillah",
        "fil": "Megillah",
        "ga": "Megillah",
        "gd": "Megillah",
        "gl": "Meguila",
        "gu": "મેગીલ્લાહ",
        "ha": "Magillah",
        "haw": "Megillah",
        "hr": "Megillah",
        "hu": "Megillah",
        "hy": "Մեգիլլա",
        "ig": "Megillah",
        "is": "Megilla",
        "jv": "Megillah",
        "ka": "მეგილა",
        "kk": "Мегилла",
        "km": "មេជីឡា",
        "kn": "ಮೆಗಿಲ್ಲಾ",
        "ku": "Megillah",
        "ky": "Мегиллах",
        "la": "Megillah",
        "lo": "ເມກີລາ",
        "lt": "Megillah",
        "lv": "Megillah",
        "mg": "Megillah",
        "mi": "Megillah",
        "mk": "Мегилах",
        "ml": "മെഗില്ല",
        "mn": "Мегилла",
        "mr": "मेगिल्ला",
        "ms": "Megillah",
        "mt": "Megillah",
        "my": "မေဂိလ",
        "ne": "मेगिल्लाह",
        "no": "Megillah",
        "ny": "Megillah",
        "or": "ମେଗିଲା",
        "pa": "ਮੇਗਿਲਾਹ",
        "ps": "مګیله",
        "ro": "Meghila",
        "rw": "Megillah",
        "sd": "ميگله",
        "si": "මෙගිල්ලාහ්",
        "sk": "Megillah",
        "sl": "Megillah",
        "sm": "Megillah",
        "sn": "Megillah",
        "so": "Megillah",
        "sq": "Megillah",
        "sr": "Мегиллах",
        "st": "Megillah",
        "su": "Megillah",
        "sv": "Megillah",
        "sw": "Megillah",
        "ta": "மெகில்லா",
        "te": "మెగిల్లా",
        "tg": "Мегилла",
        "th": "เมกิลลาห์",
        "tk": "Megillah",
        "ug": "Megillah",
        "uz": "Megilla",
        "xh": "Megillah",
        "yi": "מגילה",
        "yo": "Megillah",
        "zu": "I-Megillah"
    },
    "Kiddushin": {
        "ar": "كيدوشين",
        "bn": "কিদ্দুশিন",
        "hi": "किद्दुशिन",
        "he": "קידושין",
        "es": "Kidushín",
        "fr": "Kiddouchin",
        "it": "Kiddushin",
        "de": "Kidduschin",
        "ru": "Кидушин",
        "ja": "キドゥシン",
        "zh": "基德辛",
        "ko": "키두신",
        "pt": "Kiddushin",
        "tr": "Kiduşin",
        "id": "Kiddushin",
        "ur": "کدوشین",
        "fa": "کیدوشین",
        "nl": "Kiddushin",
        "pl": "Kiduszin",
        "uk": "Кідушин",
        "vi": "Kiddushin",
        "af": "Kiddusjin",
        "am": "ኪዱሺን",
        "as": "কিদ্দুছিন",
        "az": "Kiddushin",
        "be": "Кідушын",
        "bg": "Кидушин",
        "bs": "Kidushin",
        "ca": "Kiddushin",
        "ceb": "Kiddushin",
        "cs": "Kiddušin",
        "cy": "Kiddushin",
        "da": "Kiddushin",
        "el": "Κιντουσίν",
        "eo": "Kiduŝin",
        "et": "Kiddushin",
        "eu": "Kiddushin",
        "fi": "Kiddushin",
        "fil": "Kiddushin",
        "ga": "Kiddushin",
        "gd": "Kiddushin",
        "gl": "Kidushin",
        "gu": "કિદુશિન",
        "ha": "Kiddushin",
        "haw": "Kiddushin",
        "hr": "Kidušin",
        "hu": "Kiddushin",
        "hy": "Կիդդուշին",
        "ig": "Kiddushin",
        "is": "Kiddushin",
        "jv": "Kiddushin",
        "ka": "კიდუშინი",
        "kk": "Киддушин",
        "km": "គីដឌូស៊ីន",
        "kn": "ಕಿಡ್ಡುಶಿನ್",
        "ku": "Kiddushin",
        "ky": "Киддушин",
        "la": "Kiddushin",
        "lo": "ຄິດດູຊິນ",
        "lt": "Kiddushin",
        "lv": "Kiddushin",
        "mg": "Kiddushin",
        "mi": "Kiddushin",
        "mk": "Кидушин",
        "ml": "കിദ്ദുഷിൻ",
        "mn": "Киддушин",
        "mr": "किडुशीन",
        "ms": "Kiddushin",
        "mt": "Kiddushin",
        "my": "Kiddushin",
        "ne": "किदुशिन",
        "no": "Kiddushin",
        "ny": "Kiddushin",
        "or": "କିଡ୍ଡୁସିନ୍ |",
        "pa": "ਕਿਡੁਸ਼ਿਨ",
        "ps": "کدوشین",
        "ro": "Kidushin",
        "rw": "Kiddushin",
        "sd": "ڪدوشين",
        "si": "කිඩ්ඩුෂින්",
        "sk": "Kiddušin",
        "sl": "Kidušin",
        "sm": "Kiddushin",
        "sn": "Kiddushin",
        "so": "Kiddushin",
        "sq": "Kiddushin",
        "sr": "Кидушин",
        "st": "Kiddushin",
        "su": "Kiddushin",
        "sv": "Kiddushin",
        "sw": "Kiddushin",
        "ta": "கிடுஷின்",
        "te": "కిద్దుషిన్",
        "tg": "Киддушин",
        "th": "คิดดูชิน",
        "tk": "Kidduşin",
        "ug": "Kiddushin",
        "uz": "Kiddushin",
        "xh": "Kiddushin",
        "yi": "קידושין",
        "yo": "Kiddushin",
        "zu": "Kiddushin"
    },
    "Sotah": {
        "ar": "سوتاه",
        "bn": "সোতাহ",
        "hi": "सोताह",
        "he": "סוטה",
        "es": "Sotá",
        "fr": "Sota",
        "it": "Sotah",
        "de": "Sota",
        "ru": "Сота",
        "ja": "ソータ",
        "zh": "索塔",
        "ko": "소타",
        "pt": "Sotá",
        "tr": "Sota",
        "id": "Sotah",
        "ur": "سوتہ",
        "fa": "سوتا",
        "nl": "Sota",
        "pl": "Sota",
        "uk": "Сота",
        "vi": "sotah",
        "af": "Sotah",
        "am": "ሶታህ",
        "as": "সোতাহ",
        "az": "Sotah",
        "be": "Сота",
        "bg": "Сота",
        "bs": "Sotah",
        "ca": "Sotah",
        "ceb": "Sotah",
        "cs": "Sotah",
        "cy": "Sotah",
        "da": "Sotah",
        "el": "Sotah",
        "eo": "Sotah",
        "et": "Sotah",
        "eu": "Sotah",
        "fi": "Sotah",
        "fil": "Sotah",
        "ga": "Sota",
        "gd": "Sota",
        "gl": "Sotah",
        "gu": "સોટાહ",
        "ha": "Sotah",
        "haw": "Sotah",
        "hr": "Sotah",
        "hu": "Sotah",
        "hy": "Սոթա",
        "ig": "Sotah",
        "is": "Sotah",
        "jv": "Sotah",
        "ka": "სოტა",
        "kk": "Сотах",
        "km": "សុថា",
        "kn": "ಸೋತಃ",
        "ku": "Sotah",
        "ky": "Sotah",
        "la": "Sotah",
        "lo": "ໂຊຕາ",
        "lt": "Sotah",
        "lv": "Sotah",
        "mg": "Sotah",
        "mi": "Sotah",
        "mk": "Сота",
        "ml": "സോതഃ",
        "mn": "Сота",
        "mr": "सोटाह",
        "ms": "Sotah",
        "mt": "Sotah",
        "my": "သာသန",
        "ne": "सोटाह",
        "no": "Sotah",
        "ny": "Sota",
        "or": "ସୋଟା",
        "pa": "ਸੋਤਾਹ",
        "ps": "سوته",
        "ro": "Sotah",
        "rw": "Sotah",
        "sd": "سوٽا",
        "si": "සෝතය",
        "sk": "Sotah",
        "sl": "Sotah",
        "sm": "Sotah",
        "sn": "Sotah",
        "so": "Sootah",
        "sq": "Sotah",
        "sr": "Сотах",
        "st": "Sotah",
        "su": "Sotah",
        "sv": "Sotah",
        "sw": "Sota",
        "ta": "சோட்டா",
        "te": "సోతః",
        "tg": "Сотах",
        "th": "โซตาห์",
        "tk": "Sotah",
        "ug": "Sotah",
        "uz": "Sotah",
        "xh": "Sotah",
        "yi": "סאָטה",
        "yo": "Sotah",
        "zu": "Sotha"
    },
    "Bava Kamma": {
        "ar": "بافا كاما",
        "bn": "বাভা কাম্মা",
        "hi": "बावा कम्मा",
        "he": "בבא קמא",
        "es": "Bava Kama",
        "fr": "Bava Kama",
        "it": "Bava Kamma",
        "de": "Bawa kamma",
        "ru": "Бава Кама",
        "ja": "バーバ・カンマ",
        "zh": "巴瓦业",
        "ko": "바바캄마",
        "pt": "Bava Kamma",
        "tr": "Bava Kamma",
        "id": "Bava Kamma",
        "ur": "باوا کما۔",
        "fa": "باوا کما",
        "nl": "Bava Kamma",
        "pl": "Bawa Kamma",
        "uk": "Бава Камма",
        "vi": "Bava Kamma",
        "af": "Bava Kamma",
        "am": "ባቫ ካማ",
        "as": "বাভা কাম্মা",
        "az": "Bava Kamma",
        "be": "Бава Камма",
        "bg": "Бава Камма",
        "bs": "Bava Kamma",
        "ca": "Bava Kamma",
        "ceb": "Bava Kamma",
        "cs": "Bava Kamma",
        "cy": "Bava Kamma",
        "da": "Bava Kamma",
        "el": "Μπάβα Καμμά",
        "eo": "Bava Kamma",
        "et": "Bava Kamma",
        "eu": "Bava Kamma",
        "fi": "Bava Kamma",
        "fil": "Bava Kamma",
        "ga": "Bava Kamma",
        "gd": "Bava Kamma",
        "gl": "Bava Kamma",
        "gu": "બાવા કામમા",
        "ha": "Bawa Kamma",
        "haw": "Bava Kamma",
        "hr": "Bava Kamma",
        "hu": "Bava Kamma",
        "hy": "Բավա Կամմա",
        "ig": "Bava Kama",
        "is": "Bava Kamma",
        "jv": "Bawa Kamma",
        "ka": "ბავა კამა",
        "kk": "Бава Камма",
        "km": "បាវ៉ាកាម៉ា",
        "kn": "ಬಾವ ಕಮ್ಮ",
        "ku": "Bava Kamma",
        "ky": "Бава Камма",
        "la": "Bava Kamma",
        "lo": "ບາວາ ກັມມະ",
        "lt": "Bava Kamma",
        "lv": "Bava Kamma",
        "mg": "Bava Kamma",
        "mi": "Bava Kamma",
        "mk": "Бава Кама",
        "ml": "ബാവ കമ്മ",
        "mn": "Бава Камма",
        "mr": "बावा कम्मा",
        "ms": "Bava Kamma",
        "mt": "Bava Kamma",
        "my": "ဗဝကံ",
        "ne": "बाव कम्मा",
        "no": "Bava Kamma",
        "ny": "Aba Kama",
        "or": "ବାଭା କାମମା |",
        "pa": "ਬਾਵਾ ਕਾਮਾ",
        "ps": "باوا کامه",
        "ro": "Bava Kamma",
        "rw": "Bava Kamma",
        "sd": "باوا ڪما",
        "si": "බාවා කම්මා",
        "sk": "Bava Kamma",
        "sl": "Bava Kamma",
        "sm": "Bava Kamma",
        "sn": "Baba Kama",
        "so": "Bava Kamma",
        "sq": "Bava Kamma",
        "sr": "Бава Камма",
        "st": "Ba Kamma",
        "su": "Bava Kamma",
        "sv": "Bava Kamma",
        "sw": "Bawa Kama",
        "ta": "பாவா கம்மா",
        "te": "బావ కమ్మ",
        "tg": "Бава Камма",
        "th": "บาวา คัมมา",
        "tk": "Bava Kamma",
        "ug": "Bava Kamma",
        "uz": "Bava Kamma",
        "xh": "Bava Kamma",
        "yi": "באבא קאמא",
        "yo": "Bava Kamma",
        "zu": "Bamba Kamma"
    },
    "Bava Metzia": {
        "ar": "بافا متسيا",
        "bn": "বাভা মেৎসিয়া",
        "hi": "बावा मेत्सिया",
        "he": "בבא מציעא",
        "es": "Bava Metziá",
        "fr": "Bava Metsia",
        "it": "Bava Metzia",
        "de": "Bawa mezia",
        "ru": "Бава Мециа",
        "ja": "バーバ メッツィア",
        "zh": "巴瓦梅齐亚",
        "ko": "바바 메치아",
        "pt": "Bava Metzia",
        "tr": "Bava Metzia",
        "id": "Bava Metzia",
        "ur": "باوا میٹزیا",
        "fa": "باوا متزیا",
        "nl": "Bava Metzia",
        "pl": "Bawa Metzia",
        "uk": "Бава Меція",
        "vi": "Bava Metzia",
        "af": "Bava Metzia",
        "am": "ባቫ ሜቲዚያ",
        "as": "বাভা মেট্জিয়া",
        "az": "Bava Metzia",
        "be": "Бава Мецыя",
        "bg": "Бава Меция",
        "bs": "Bava Metzia",
        "ca": "Bava Metzia",
        "ceb": "Bava Metzia",
        "cs": "Bava Metzia",
        "cy": "Bafa Metzia",
        "da": "Bava Metzia",
        "el": "Μπάβα Μέτζια",
        "eo": "Bava Metzia",
        "et": "Bava Metzia",
        "eu": "Bava Metzia",
        "fi": "Bava Metzia",
        "fil": "Bava Metzia",
        "ga": "Metzia Bhavá",
        "gd": "Metzia Bava",
        "gl": "Bava Metzia",
        "gu": "બાવા મેટ્ઝિયા",
        "ha": "Bawa Metsiya",
        "haw": "Bava Metzia",
        "hr": "Bava Metzia",
        "hu": "Bava Metzia",
        "hy": "Բավա Մեցիա",
        "ig": "Bava Metzia",
        "is": "Bava Metzia",
        "jv": "Bava Metzia",
        "ka": "ბავა მეცია",
        "kk": "Бава Метзия",
        "km": "បាវ៉ាម៉េតហ្សៀ",
        "kn": "ಬಾವಾ ಮೆಟ್ಜಿಯಾ",
        "ku": "Bava Metzia",
        "ky": "Бава Метзия",
        "la": "Bava Metzia",
        "lo": "ບາວາ ເມສເຊຍ",
        "lt": "Bava Metzia",
        "lv": "Bava Metzia",
        "mg": "Bava Metzia",
        "mi": "Bava Metzia",
        "mk": "Бава Мециа",
        "ml": "ബാവ മെറ്റ്‌സിയ",
        "mn": "Бава Мециа",
        "mr": "बावा मेटझिया",
        "ms": "Bava Metzia",
        "mt": "Bava Metzia",
        "my": "Bava Metzia",
        "ne": "Bava Metzia",
        "no": "Bava Metzia",
        "ny": "Bambo Metzia",
        "or": "ବାଭା ମେଟଜିଆ |",
        "pa": "ਬਾਵਾ ਮੇਟਜ਼ੀਆ",
        "ps": "Bava Metzia",
        "ro": "Bava Metzia",
        "rw": "Bava Metzia",
        "sd": "Bava Metzia",
        "si": "බාවා මෙට්සියා",
        "sk": "Bava Metzia",
        "sl": "Bava Metzia",
        "sm": "Bava Metzia",
        "sn": "Bava Metzia",
        "so": "Bava Metsia",
        "sq": "Bava Metzia",
        "sr": "Бава Метзиа",
        "st": "Bava Metzia",
        "su": "Bava Metzia",
        "sv": "Bava Metzia",
        "sw": "Bawa Metzia",
        "ta": "பாவா மெட்சியா",
        "te": "బావ మెట్జియా",
        "tg": "Бава Метзия",
        "th": "บาวา เมตเซีย",
        "tk": "Bava Metzia",
        "ug": "Bava Metzia",
        "uz": "Bava Metzia",
        "xh": "Bava Metzia",
        "yi": "בָּבָא מִצְיָא",
        "yo": "Bava Metzia",
        "zu": "Bava Metzia"
    },
    "Bava Batra": {
        "ar": "بافا باترا",
        "bn": "বাভা বাত্রা",
        "hi": "बावा बात्रा",
        "he": "בבא בתרא",
        "es": "Bava Batra",
        "fr": "Bava Batra",
        "it": "Bava Batra",
        "de": "Bawa batra",
        "ru": "Бава Батра",
        "ja": "バババトラ",
        "zh": "巴瓦巴特拉",
        "ko": "바바 바트라",
        "pt": "Bava Batra",
        "tr": "Bava Batra",
        "id": "Bava Batra",
        "ur": "باوا بترا",
        "fa": "باوا باترا",
        "nl": "Bava Batra",
        "pl": "Bawa Batra",
        "uk": "Бава Батра",
        "vi": "Bava Batra",
        "af": "Bava Batra",
        "am": "ባቫ ባትራ",
        "as": "বাভা বাতৰা",
        "az": "Bava Batra",
        "be": "Бава Батра",
        "bg": "Бава Батра",
        "bs": "Bava Batra",
        "ca": "Bava Batra",
        "ceb": "Bava Batra",
        "cs": "Bava Batra",
        "cy": "Batra Batra",
        "da": "Bava Batra",
        "el": "Μπάβα Μπάτρα",
        "eo": "Bava Batra",
        "et": "Bava Batra",
        "eu": "Bava Batra",
        "fi": "Bava Batra",
        "fil": "Bava Batra",
        "ga": "Batra Batra",
        "gd": "Batra Batra",
        "gl": "Bava Batra",
        "gu": "બાવા બત્રા",
        "ha": "Ba Batra",
        "haw": "Bava Batra",
        "hr": "Bava Batra",
        "hu": "Bava Batra",
        "hy": "Բավա Բաթրա",
        "ig": "Bava Batra",
        "is": "Bava Batra",
        "jv": "Bawa Batra",
        "ka": "ბავა ბატრა",
        "kk": "Бава Батра",
        "km": "បាវ៉ាបាត្រា",
        "kn": "ಬಾವ ಬಾತ್ರಾ",
        "ku": "Bava Batra",
        "ky": "Бава Батра",
        "la": "Bava Batra",
        "lo": "ບາວບາທ",
        "lt": "Bava Batra",
        "lv": "Bava Batra",
        "mg": "Bava Batra",
        "mi": "Bava Batra",
        "mk": "Бава Батра",
        "ml": "ബാവ ബത്ര",
        "mn": "Бава Батра",
        "mr": "बावा बत्रा",
        "ms": "Bava Batra",
        "mt": "Bava Batra",
        "my": "Bava Batra",
        "ne": "बाव बत्रा",
        "no": "Bava Batra",
        "ny": "Aba Batra",
        "or": "ବାଭା ବତ୍ରା |",
        "pa": "ਬਾਵਾ ਬੱਤਰਾ",
        "ps": "باوا باترا",
        "ro": "Bava Batra",
        "rw": "Bava Batra",
        "sd": "باوا بترا",
        "si": "බාවා බත්‍රා",
        "sk": "Bava Batra",
        "sl": "Bava Batra",
        "sm": "Bava Batra",
        "sn": "Bava Batra",
        "so": "Bava Batra",
        "sq": "Bava Batra",
        "sr": "Бава Батра",
        "st": "Baba Batra",
        "su": "Bava Batra",
        "sv": "Bava Batra",
        "sw": "Baba Batra",
        "ta": "பாவா பத்ரா",
        "te": "బావ బాత్రా",
        "tg": "Бава Батра",
        "th": "บาวา บาทรา",
        "tk": "Bava Batra",
        "ug": "Bava Batra",
        "uz": "Bava Batra",
        "xh": "Baba Batra",
        "yi": "בָּבָא בִּתְרָא",
        "yo": "Bava Batra",
        "zu": "Baba Batra"
    },
    "Sanhedrin": {
        "ar": "سنهدرين",
        "bn": "সানহেড্রিন",
        "hi": "सन्हेद्रिन",
        "he": "סנהדרין",
        "es": "Sanedrín",
        "fr": "Sanhédrin",
        "it": "Sinedrio",
        "de": "Sanhedrin",
        "ru": "Сангедрин",
        "ja": "サンヘドリン",
        "zh": "公会",
        "ko": "산헤드린",
        "pt": "Sinédrio",
        "tr": "Sanhedrin",
        "id": "Sanhedrin",
        "ur": "سنہڈرین",
        "fa": "سنهدرین",
        "nl": "Sanhedrin",
        "pl": "Sanhedryn",
        "uk": "Синедріон",
        "vi": "Tòa Công luận",
        "af": "Sanhedrin",
        "am": "ሳንሄድሪን",
        "as": "চেনহেড্ৰিন",
        "az": "Sinedrion",
        "be": "Сінедрыён",
        "bg": "Синедрион",
        "bs": "Sanhedrin",
        "ca": "Sanedrí",
        "ceb": "Sanhedrin",
        "cs": "Sanhedrin",
        "cy": "Sanhedrin",
        "da": "Sanhedrin",
        "el": "Σανχεντρίν",
        "eo": "Sinedrio",
        "et": "Suurkohtu",
        "eu": "Sanedrin",
        "fi": "Sanhedrin",
        "fil": "Sanhedrin",
        "ga": "Sanhedrin",
        "gd": "Sanhedrin",
        "gl": "Sanedrín",
        "gu": "સેન્હેડ્રિન",
        "ha": "Sanhedrin",
        "haw": "Ka Ahaolelo",
        "hr": "Sinedrij",
        "hu": "Szanhedrin",
        "hy": "Սինեդրիոն",
        "ig": "Sanhedrin",
        "is": "Ráðherraráðið",
        "jv": "Sanhedrin",
        "ka": "სინედრიონი",
        "kk": "Жоғарғы кеңес",
        "km": "សានហេរិន",
        "kn": "ಸಂಹೆಡ್ರಿನ್",
        "ku": "Sanhedrin",
        "ky": "Синедрион",
        "la": "Sanhedrin",
        "lo": "Sanhedrin",
        "lt": "Sinedrija",
        "lv": "Sinedrija",
        "mg": "Synedriona",
        "mi": "Sanhedrin",
        "mk": "Синедрион",
        "ml": "സൻഹെഡ്രിൻ",
        "mn": "Санедрин",
        "mr": "महासभा",
        "ms": "Sanhedrin",
        "mt": "Sinedriju",
        "my": "ဆန်ဟီဒရင်",
        "ne": "महासभा",
        "no": "Sanhedrin",
        "ny": "Sanhedrin",
        "or": "ସାନହେଡ୍ରିନ୍ |",
        "pa": "ਮਹਾਸਭਾ",
        "ps": "سنهدرین",
        "ro": "Sinedriul",
        "rw": "Urukiko Rukuru",
        "sd": "سنهڊرين",
        "si": "සැන්හෙඩ්‍රින්",
        "sk": "Sanhedrin",
        "sl": "Sinedrij",
        "sm": "Saneterini",
        "sn": "Sanihedrini",
        "so": "Sanhedrin",
        "sq": "Sinedrin",
        "sr": "Синедрион",
        "st": "Sanhedrine",
        "su": "Sanhedrin",
        "sv": "Sanhedrin",
        "sw": "Sanhedrin",
        "ta": "சன்ஹெட்ரின்",
        "te": "సంహేద్రిన్",
        "tg": "Синедрион",
        "th": "ศาลซันเฮดริน",
        "tk": "Sanhedrin",
        "ug": "Sanhedrin",
        "uz": "Oliy Kengash",
        "xh": "ISanhedrin",
        "yi": "סנהדרין",
        "yo": "Sànhẹ́dírìn",
        "zu": "ISanhedrin"
    },
    "Makkot": {
        "ar": "ماكوت",
        "bn": "মাক্কত",
        "hi": "मक्कोत",
        "he": "מכות",
        "es": "Makot",
        "fr": "Makkot",
        "it": "Makkot",
        "de": "Makkot",
        "ru": "Макот",
        "ja": "マコット",
        "zh": "马科特",
        "ko": "막콧",
        "pt": "Makkot",
        "tr": "Makkot",
        "id": "Makkot",
        "ur": "مککوٹ",
        "fa": "مکوت",
        "nl": "Makkot",
        "pl": "Makkot",
        "uk": "Маккот",
        "vi": "Makkot",
        "af": "Makkot",
        "am": "ማኮት",
        "as": "মাককোট",
        "az": "Makkot",
        "be": "Маккот",
        "bg": "Маккот",
        "bs": "Makkot",
        "ca": "Makkot",
        "ceb": "Makkot",
        "cs": "Makkot",
        "cy": "Makkot",
        "da": "Makkot",
        "el": "Makkot",
        "eo": "Makkot",
        "et": "Makkot",
        "eu": "Makkot",
        "fi": "Makkot",
        "fil": "Makkot",
        "ga": "Mackot",
        "gd": "Maccot",
        "gl": "Makkot",
        "gu": "મકોટ",
        "ha": "Makkot",
        "haw": "Makkot",
        "hr": "Makkot",
        "hu": "Makkot",
        "hy": "Մակկոտ",
        "ig": "Makkot",
        "is": "Makkot",
        "jv": "Makkot",
        "ka": "მაკკოტი",
        "kk": "Маккот",
        "km": "ម៉ាក់កូត",
        "kn": "ಮಕ್ಕೋಟ್",
        "ku": "Makkot",
        "ky": "Маккот",
        "la": "Makkot",
        "lo": "Makkot",
        "lt": "Makkot",
        "lv": "Makkot",
        "mg": "Makkot",
        "mi": "Makkot",
        "mk": "Маккот",
        "ml": "മക്കോട്",
        "mn": "Маккот",
        "mr": "मळकोट",
        "ms": "Makkot",
        "mt": "Makkot",
        "my": "Makkot",
        "ne": "मकोट",
        "no": "Makkot",
        "ny": "Makot",
        "or": "ମକ୍କୋଟ |",
        "pa": "ਮੱਕੋਟ",
        "ps": "مککوټ",
        "ro": "Makkot",
        "rw": "Makkot",
        "sd": "ماکي ڪوٽ",
        "si": "මක්කොට්",
        "sk": "Makkot",
        "sl": "Makkot",
        "sm": "Makkot",
        "sn": "Makkot",
        "so": "Makkot",
        "sq": "Makkot",
        "sr": "Маккот",
        "st": "Makkot",
        "su": "Makkot",
        "sv": "Makkot",
        "sw": "Makkot",
        "ta": "மக்கோட்",
        "te": "మక్కోట్",
        "tg": "Маккот",
        "th": "มะกรูด",
        "tk": "Makkot",
        "ug": "Makkot",
        "uz": "Makkot",
        "xh": "eMakot",
        "yi": "מאַקאָט",
        "yo": "Makkot",
        "zu": "I-Makot"
    },
    "Peah": {
        "ar": "بياه",
        "bn": "পেয়াহ",
        "hi": "पेयाह",
        "he": "פאה",
        "es": "Peah",
        "fr": "Peah",
        "it": "Peah",
        "de": "Pe'ah",
        "ru": "Пеа",
        "ja": "エンドウ豆",
        "zh": "豌豆",
        "ko": "완두콩",
        "pt": "Ervilhas",
        "tr": "Bezelye",
        "id": "Kacang polong",
        "ur": "مٹر",
        "fa": "نخود فرنگی",
        "nl": "Perzik",
        "pl": "Peach",
        "uk": "горох",
        "vi": "đậu",
        "af": "Peah",
        "am": "አተር",
        "as": "পিয়াহ",
        "az": "Peah",
        "be": "Гарох",
        "bg": "прах",
        "bs": "Peah",
        "ca": "Peah",
        "ceb": "Peah",
        "cs": "Peah",
        "cy": "Peah",
        "da": "Peah",
        "el": "Peah",
        "eo": "Pizo",
        "et": "Peah",
        "eu": "Peah",
        "fi": "Peah",
        "fil": "Peah",
        "ga": "péist",
        "gd": "Peah",
        "gl": "Peah",
        "gu": "પીહ",
        "ha": "Peah",
        "haw": "Peah",
        "hr": "Peah",
        "hu": "Peah",
        "hy": "Սիսեռ",
        "ig": "Ee",
        "is": "Peah",
        "jv": "Peah",
        "ka": "ბარდა",
        "kk": "Бұршақ",
        "km": "ប៉េអា",
        "kn": "ಪೀಹ್",
        "ku": "Peah",
        "ky": "Peah",
        "la": "Peah",
        "lo": "Peah",
        "lt": "Peah",
        "lv": "Peah",
        "mg": "Peah",
        "mi": "Peah",
        "mk": "Грашок",
        "ml": "പീ",
        "mn": "Peah",
        "mr": "पेह",
        "ms": "Peah",
        "mt": "Peah",
        "my": "Peah",
        "ne": "पेह",
        "no": "Peah",
        "ny": "Peya",
        "or": "ମଟର",
        "pa": "ਪੀਹ",
        "ps": "پیاه",
        "ro": "Peah",
        "rw": "Peah",
        "sd": "پاڇي",
        "si": "Peah",
        "sk": "Peah",
        "sl": "grah",
        "sm": "Peah",
        "sn": "Peah",
        "so": "Peah",
        "sq": "Peah",
        "sr": "Пеах",
        "st": "Peah",
        "su": "Peah",
        "sv": "Peah",
        "sw": "Pea",
        "ta": "பட்டாணி",
        "te": "బఠానీ",
        "tg": "Пеах",
        "th": "พีช",
        "tk": "Peah",
        "ug": "Peah",
        "uz": "Peah",
        "xh": "Peha",
        "yi": "פּעאַה",
        "yo": "Peah",
        "zu": "Pheha"
    },
    "Balakanda": {
        "he": "באלאקאנדה",
        "ar": "بالاكاندا",
        "bn": "আদিকান্ড",
        "hi": "बालकाण्ड",
        "es": "Balakanda",
        "fr": "Balakanda",
        "ja": "バラカンダ",
        "zh": "巴拉坎达",
        "ko": "발라칸다",
        "de": "Balakanda",
        "ru": "Балаканда",
        "it": "Balakanda",
        "pt": "Balakanda",
        "tr": "Balakanda",
        "id": "Balakanda",
        "ur": "بالاکنڈہ",
        "fa": "بالاکاندا",
        "nl": "Balakanda",
        "pl": "Balakanda",
        "uk": "Балаканда",
        "vi": "Balakanda",
        "af": "Balakanda",
        "am": "ባላካንዳ",
        "as": "বালাকান্দা",
        "az": "Balakəndə",
        "be": "Балаканда",
        "bg": "Балаканда",
        "bs": "Balakanda",
        "ca": "Balakanda",
        "ceb": "Balakanda",
        "cs": "Balakanda",
        "cy": "Balakanda",
        "da": "Balakanda",
        "el": "Μπαλακάντα",
        "eo": "Balakanda",
        "et": "Balakanda",
        "eu": "Balakanda",
        "fi": "Balakanda",
        "fil": "Balakanda",
        "ga": "Balakanda",
        "gd": "Balacanda",
        "gl": "Balakanda",
        "gu": "બાલકાંડ",
        "ha": "Balakanda",
        "haw": "Balakanda",
        "hr": "Balakanda",
        "hu": "Balakanda",
        "hy": "Բալականդա",
        "ig": "Balakanda",
        "is": "Balakanda",
        "jv": "Balakanda",
        "ka": "ბალაკანდა",
        "kk": "Балаканда",
        "km": "បាឡាក់ដា",
        "kn": "Balakanda",
        "ku": "Balakanda",
        "ky": "Балаканда",
        "la": "Balakanda",
        "lo": "Balakanda",
        "lt": "Balakanda",
        "lv": "Balakanda",
        "mg": "Balakanda",
        "mi": "Parakanda",
        "mk": "Балаканда",
        "ml": "ബാലകാണ്ഡം",
        "mn": "Балаканда",
        "mr": "बालकांडा",
        "ms": "Balakanda",
        "mt": "Balakanda",
        "my": "ဗာလကန်ဒါ",
        "ne": "बालकाण्ड",
        "no": "Balakanda",
        "ny": "Balakanda",
        "or": "ବାଲାକାଣ୍ଡା |",
        "pa": "ਬਾਲਕੰਡਾ",
        "ps": "بالاکنډا",
        "ro": "Balakanda",
        "rw": "Balakanda",
        "sd": "بالاڪنڊا",
        "si": "බලකන්ද",
        "sk": "Balakanda",
        "sl": "Balakanda",
        "sm": "Palakana",
        "sn": "Balakanda",
        "so": "Balakanda",
        "sq": "Balakanda",
        "sr": "Балаканда",
        "st": "Balakanda",
        "su": "Balakanda",
        "sv": "Balakanda",
        "sw": "Balakanda",
        "ta": "பாலகாண்டா",
        "te": "బాలకాండ",
        "tg": "Балаканда",
        "th": "บาลากันดา",
        "tk": "Balakanda",
        "ug": "بالاكاندا",
        "uz": "Balakanda",
        "xh": "Balakanda",
        "yi": "Balakanda",
        "yo": "Balakanda",
        "zu": "Balakanda"
    },
    "Ayodhyakanda": {
        "he": "איודיהקאנדה",
        "ar": "أيودياكاندا",
        "bn": "অযোধ্যাকান্ড",
        "hi": "अयोध्याकाण्ड",
        "es": "Ayodhyakanda",
        "fr": "Ayodhyakanda",
        "ja": "アヨーディカンダ",
        "zh": "阿约提亚坎达",
        "ko": "아요디아칸다",
        "de": "Ayodhyakanda",
        "ru": "Айодхьяканда",
        "it": "Ayodhyakanda",
        "pt": "Ayodhyakanda",
        "tr": "Ayodhyakanda",
        "id": "Ayodhyakanda",
        "ur": "ایودھیاکنڈا۔",
        "fa": "آیودیاکاندا",
        "nl": "Ayodhyakanda",
        "pl": "Ajodhjakandę",
        "uk": "Айодх'яканда",
        "vi": "Ayodhyakanda",
        "af": "Ayodhyakanda",
        "am": "አዮዲያካንዳ",
        "as": "অযোধ্যাকাণ্ড",
        "az": "Ayodhyakanda",
        "be": "Аёдх'яканда",
        "bg": "Айодхяканда",
        "bs": "Ayodhyakanda",
        "ca": "Ayodhyakanda",
        "ceb": "Ayodhyakanda",
        "cs": "Ajódhjákanda",
        "cy": "Ayodhyakanda",
        "da": "Ayodhyakanda",
        "el": "Ayodhyakanda",
        "eo": "Ayodhyakanda",
        "et": "Ayodhyakanda",
        "eu": "Ayodhyakanda",
        "fi": "Ayodhyakanda",
        "fil": "Ayodhyakanda",
        "ga": "Aodhyakanda",
        "gd": "Aiodhyakanda",
        "gl": "Ayodhyakanda",
        "gu": "અયોધ્યાકાંડ",
        "ha": "Ayodhyakanda",
        "haw": "Ayodhyakanda",
        "hr": "Ayodhyakanda",
        "hu": "Ayodhyakanda",
        "hy": "Այոդհյականդա",
        "ig": "Ayodhyakanda",
        "is": "Ayodhyakanda",
        "jv": "Ayodhyakanda",
        "ka": "აიოდჰიაკანდა",
        "kk": "Айодхьяканда",
        "km": "អយុធ្យាកានដា",
        "kn": "Ayodhyakanda",
        "ku": "Ayodhyakanda",
        "ky": "Ayodhyakanda",
        "la": "Ayodhyakanda",
        "lo": "ອະໂຍທະຍານ",
        "lt": "Ayodhyakanda",
        "lv": "Ayodhyakanda",
        "mg": "Ayodhyakanda",
        "mi": "Ayodhyakanda",
        "mk": "Ајодјаканда",
        "ml": "അയോധ്യാകാണ്ഡ",
        "mn": "Айодхяканда",
        "mr": "अयोध्याकांड",
        "ms": "Ayodhyakanda",
        "mt": "Ayodhyakanda",
        "my": "အယုဒ္ဓယ",
        "ne": "अयोध्याकाण्ड",
        "no": "Ayodhyakanda",
        "ny": "Ayodhyakanda",
        "or": "ଅଯୋଧ୍ୟାକଣ୍ଡା |",
        "pa": "ਅਯੋਧਿਆਕਾਂਡਾ",
        "ps": "ایودیاکنډ",
        "ro": "Ayodhyakanda",
        "rw": "Ayodhyakanda",
        "sd": "ايوڌيڪنڊا",
        "si": "අයෝධ්‍යාකන්ද",
        "sk": "Ayodhyakanda",
        "sl": "Ayodhyakanda",
        "sm": "Ayodhyakanda",
        "sn": "Ayodhyakanda",
        "so": "Ayodhyakanda",
        "sq": "Ayodhyakanda",
        "sr": "Аиодхиаканда",
        "st": "Ayodhyakanda",
        "su": "Ayodhyakanda",
        "sv": "Ayodhyakanda",
        "sw": "Ayodhyakanda",
        "ta": "அயோத்திகாண்டா",
        "te": "అయోధ్యకాండ",
        "tg": "Айодхяканда",
        "th": "อโยธยากันดา",
        "tk": "Aýodhyakanda",
        "ug": "Ayodhyakanda",
        "uz": "Ayodhyakanda",
        "xh": "Ayodhyakanda",
        "yi": "Ayodhyakanda",
        "yo": "Ayodhyakanda",
        "zu": "Ayodhyakanda"
    },
    "Aranyakanda": {
        "he": "אראניאקאנדה",
        "ar": "أرانياكاندا",
        "bn": "অরণ্যকান্ড",
        "hi": "अरण्यकाण्ड",
        "es": "Aranyakanda",
        "fr": "Aranyakanda",
        "ja": "アランヤカンダ",
        "zh": "阿兰亚坎达",
        "ko": "아라냐칸다",
        "de": "Aranyakanda",
        "ru": "Араньяканда",
        "it": "Aranyakanda",
        "pt": "Aranyakanda",
        "tr": "Aranyakanda",
        "id": "Aranyakanda",
        "ur": "آرنیا کنڈا",
        "fa": "آرانیاکاندا",
        "nl": "Aranyakanda",
        "pl": "Aranyakanda",
        "uk": "Араньяканда",
        "vi": "Aranyakanda",
        "af": "Aranyakanda",
        "am": "Aranyakanda",
        "as": "অৰণ্যকাণ্ড",
        "az": "Aranyakanda",
        "be": "Араньяканда",
        "bg": "Араняканда",
        "bs": "Aranyakanda",
        "ca": "Aranyakanda",
        "ceb": "Aranyakanda",
        "cs": "Aranyakanda",
        "cy": "Aranyakanda",
        "da": "Aranyakanda",
        "el": "Aranyakanda",
        "eo": "Aranyakanda",
        "et": "Aranyakanda",
        "eu": "Aranyakanda",
        "fi": "Aranyakanda",
        "fil": "Aranyakanda",
        "ga": "Aranyakanda",
        "gd": "Aranyakanda",
        "gl": "Aranyakanda",
        "gu": "અરણ્યકાંડ",
        "ha": "Aranyakanda",
        "haw": "Aranyakanda",
        "hr": "Aranyakanda",
        "hu": "Aranyakanda",
        "hy": "Արանյականդա",
        "ig": "Aranyakanda",
        "is": "Aranyakanda",
        "jv": "Aranyakanda",
        "ka": "არანიაკანდა",
        "kk": "Араняканда",
        "km": "អារីយ៉ាកដា",
        "kn": "Aranyakanda",
        "ku": "Aranyakanda",
        "ky": "Aranyakanda",
        "la": "Aranyakanda",
        "lo": "ອາຣັນຍາກອນດາ",
        "lt": "Aranyakanda",
        "lv": "Aranyakanda",
        "mg": "Aranyakanda",
        "mi": "Aranyakanda",
        "mk": "Аранјаканда",
        "ml": "ആരണ്യകാണ്ഡം",
        "mn": "Араняканда",
        "mr": "अरण्यकांड",
        "ms": "Aranyakanda",
        "mt": "Aranyakanda",
        "my": "Aranyakanda ၊",
        "ne": "अरण्यकाण्ड",
        "no": "Aranyakanda",
        "ny": "Aranyakanda",
        "or": "ଆର୍ଯ୍ୟନାକଣ୍ଡା |",
        "pa": "ਅਰਣਯਕੰਡਾ",
        "ps": "اریاناکاندا",
        "ro": "Aranyakanda",
        "rw": "Aranyakanda",
        "sd": "آرانيڪنڊا",
        "si": "ආරණ්‍යකන්ද",
        "sk": "Aranyakanda",
        "sl": "Aranyakanda",
        "sm": "Aranyakanda",
        "sn": "Aranyakanda",
        "so": "Aranyakanda",
        "sq": "Aranyakanda",
        "sr": "Араниаканда",
        "st": "Aranyakanda",
        "su": "Aranyakanda",
        "sv": "Aranyakanda",
        "sw": "Aranyakanda",
        "ta": "ஆரண்யகண்டா",
        "te": "అరణ్యకాండ",
        "tg": "Араняканда",
        "th": "อรัญกันดา",
        "tk": "Aranyakanda",
        "ug": "Aranyakanda",
        "uz": "Aranyakanda",
        "xh": "Aranyakanda",
        "yi": "אַראַניאַקאַנדאַ",
        "yo": "Aranyakanda",
        "zu": "Aranyakanda"
    },
    "Kishkindhakanda": {
        "he": "קישקינדהקאנדה",
        "ar": "كيشكيندهاكاندا",
        "bn": "কিস্কিন্ধাকান্ড",
        "hi": "किष्किन्धाकाण्ड",
        "es": "Kishkindhakanda",
        "fr": "Kishkindhakanda",
        "ja": "キシュキンダカンダ",
        "zh": "基什金达坎达",
        "ko": "키슈킨다칸다",
        "de": "Kishkindhakanda",
        "ru": "Кишкиндхаканда",
        "it": "Kishkindhakanda",
        "pt": "Kishkindhakanda",
        "tr": "Kishkindhakanda",
        "id": "Kishkindhakanda",
        "ur": "کشکندکھنڈا۔",
        "fa": "کیشکیندهاکاندا",
        "nl": "Kiskindhakanda",
        "pl": "Kiszkindhakanda",
        "uk": "Кішкіндаканда",
        "vi": "Kishkindhakanda",
        "af": "Kishkindhakanda",
        "am": "ኪሽኪንዳካንዳ",
        "as": "কিষ্কিন্দকাণ্ড",
        "az": "Kişkindhakanda",
        "be": "Кішкіндхаканда",
        "bg": "Кишкиндаканда",
        "bs": "Kishkindhakanda",
        "ca": "Kishkindhakanda",
        "ceb": "Kishkindhakanda",
        "cs": "Kishkindhakanda",
        "cy": "Kishkindhakanda",
        "da": "Kishkindhakanda",
        "el": "Κισικιντακάντα",
        "eo": "Kishkindhakanda",
        "et": "Kishkindhakanda",
        "eu": "Kishkindhakanda",
        "fi": "Kishkindhakanda",
        "fil": "Kishkindhakanda",
        "ga": "Ciskindhakanda",
        "gd": "Cishkindhakanda",
        "gl": "Kishkindhakanda",
        "gu": "કિષ્કિન્ધાકાંડ",
        "ha": "Kishkindhakanda",
        "haw": "Kishkindhakanda",
        "hr": "Kishkindhakanda",
        "hu": "Kishkindhakanda",
        "hy": "Կիշկինդաքանդա",
        "ig": "Kishkindhakanda",
        "is": "Kishkindhakanda",
        "jv": "Kishkindhakanda",
        "ka": "კიშკინდაკანდა",
        "kk": "Кишкиндхаканда",
        "km": "Kishkindhakanda",
        "kn": "Kishkindhakanda",
        "ku": "Kishkindhakanda",
        "ky": "Кишкиндхаканда",
        "la": "Kishkindhakanda",
        "lo": "Kishkindhakanda",
        "lt": "Kiškindhakanda",
        "lv": "Kiškindhakanda",
        "mg": "Kishkindhakanda",
        "mi": "Kishkindhakanda",
        "mk": "Кишкиндаканда",
        "ml": "കിഷ്കിന്ധാകാണ്ഡം",
        "mn": "Кишкиндхаканда",
        "mr": "किष्किंधकांड",
        "ms": "Kishkindhakanda",
        "mt": "Kishkindhakanda",
        "my": "Kishkindhakanda",
        "ne": "किष्किंधकाण्ड",
        "no": "Kishkindhakanda",
        "ny": "Kishkinkandanda",
        "or": "କିସ୍କିନ୍ଦକନ୍ଦ",
        "pa": "ਕਿਸ਼ਕਿੰਧਾਕੰਡਾ",
        "ps": "کشکنده کنده",
        "ro": "Kishkindhakanda",
        "rw": "Kishkindhakanda",
        "sd": "ڪشنڌڪنڊا",
        "si": "කිෂ්කින්ධාකන්ද",
        "sk": "Kishkindhakanda",
        "sl": "Kishkindhakanda",
        "sm": "Kishkindhakanda",
        "sn": "Kishkinkandanda",
        "so": "Kishkindhakanda",
        "sq": "Kishkindhakanda",
        "sr": "Кисхкиндхаканда",
        "st": "Kishkinkandanda",
        "su": "Kishkindhakanda",
        "sv": "Kishkindhakanda",
        "sw": "Kishkinkandanda",
        "ta": "கிஷ்கிந்தகாண்டா",
        "te": "కిష్కింధాకాండ",
        "tg": "Кишкиндхаканда",
        "th": "กิษกิณฑากันดา",
        "tk": "Kishkindhakanda",
        "ug": "Kishkindhakanda",
        "uz": "Kishkindxakanda",
        "xh": "Kishkinkandanda",
        "yi": "קישקינדאַקאַנדאַ",
        "yo": "Kishkindhakanda",
        "zu": "Kishkinkandanda"
    },
    "Sundarakanda": {
        "he": "סונדאראקאנדה",
        "ar": "سونداراكاندا",
        "bn": "সুন্দরকান্ড",
        "hi": "सुन्दरकाण्ड",
        "es": "Sundarakanda",
        "fr": "Sundarakanda",
        "ja": "スンダラカンダ",
        "zh": "孙达拉坎达",
        "ko": "순다라칸다",
        "de": "Sundarakanda",
        "ru": "Сундараканда",
        "it": "Sundarakanda",
        "pt": "Sundarakanda",
        "tr": "Sundarakanda",
        "id": "Sundarakanda",
        "ur": "سندرکنڈا۔",
        "fa": "سونداراکاندا",
        "nl": "Sundarakanda",
        "pl": "Sundarakanda",
        "uk": "Сундараканда",
        "vi": "Sundarakanda",
        "af": "Sundarakanda",
        "am": "ሰንዳራካንዳ",
        "as": "সুন্দৰকাণ্ড",
        "az": "Sundarakanda",
        "be": "Сундараканда",
        "bg": "Сундараканда",
        "bs": "Sundarakanda",
        "ca": "Sundarakanda",
        "ceb": "Sundarakanda",
        "cs": "Sundarakanda",
        "cy": "Sundarakanda",
        "da": "Sundarakanda",
        "el": "Σουνταρακάντα",
        "eo": "Sundarakanda",
        "et": "Sundarakanda",
        "eu": "Sundarakanda",
        "fi": "Sundarakanda",
        "fil": "Sundarakanda",
        "ga": "Sundarakanda",
        "gd": "Sundarakanda",
        "gl": "Sundarakanda",
        "gu": "સુંદરકાંડ",
        "ha": "Sundarakanda",
        "haw": "Sundarakanda",
        "hr": "Sundarakanda",
        "hu": "Sundarakanda",
        "hy": "Սունդարականդա",
        "ig": "Sundarakanda",
        "is": "Sundarakanda",
        "jv": "Sundarakanda",
        "ka": "სუნდარაკანდა",
        "kk": "Сундараканда",
        "km": "សន ដារ៉ាកាណា",
        "kn": "Sundarakanda",
        "ku": "Sundarakanda",
        "ky": "Sundarakanda",
        "la": "Sundarakanda",
        "lo": "ແສງດາລາຈັນ",
        "lt": "Sundarakanda",
        "lv": "Sundarakanda",
        "mg": "Sundarakanda",
        "mi": "Sundarakanda",
        "mk": "Сундараканда",
        "ml": "സുന്ദരകാണ്ഡം",
        "mn": "Сундараканда",
        "mr": "सुंदरकांड",
        "ms": "Sundarakanda",
        "mt": "Sundarakanda",
        "my": "Sundarakanda",
        "ne": "सुन्दरकाण्ड",
        "no": "Sundarakanda",
        "ny": "Sundarakanda",
        "or": "ସୁନ୍ଦରକଣ୍ଡା |",
        "pa": "ਸੁੰਦਰਕੰਡਾ",
        "ps": "سندرکنډ",
        "ro": "Sundarakanda",
        "rw": "Sundarakanda",
        "sd": "سندرڪنڊا",
        "si": "සුන්දරකන්ද",
        "sk": "Sundarakanda",
        "sl": "Sundarakanda",
        "sm": "Sundarakanda",
        "sn": "Sundarakanda",
        "so": "Sundarakanda",
        "sq": "Sundarakanda",
        "sr": "Сундараканда",
        "st": "Sundarakanda",
        "su": "Sundarakanda",
        "sv": "Sundarakanda",
        "sw": "Sundarakanda",
        "ta": "சுந்தரகாண்டா",
        "te": "సుందరకాండ",
        "tg": "Сундараканда",
        "th": "สุนทรากันดา",
        "tk": "Sundarakanda",
        "ug": "Sundarakanda",
        "uz": "Sundarakanda",
        "xh": "Sundarakanda",
        "yi": "סונדאַראַקאַנדאַ",
        "yo": "Sundarakanda",
        "zu": "Sundarakanda"
    },
    "Yuddhakanda": {
        "he": "יודהקאנדה",
        "ar": "يودهاكاندا",
        "bn": "লঙ্কাকান্ড",
        "hi": "युद्धकाण्ड",
        "es": "Yuddhakanda",
        "fr": "Yuddhakanda",
        "ja": "ユッダカンダ",
        "zh": "尤达坎达",
        "ko": "유다칸다",
        "ru": "Юддхаканда",
        "it": "Yuddhakanda",
        "pt": "Yuddhakanda",
        "tr": "Yuddhakanda",
        "id": "Yudhakanda",
        "ur": "یودکھنڈا۔",
        "fa": "یوداکاندا"
    },
    "Uttarakanda": {
        "he": "אוטאראקאנדה",
        "ar": "أوتاراكاندا",
        "bn": "উত্তরকান্ড",
        "hi": "उत्तरकाण्ड",
        "es": "Uttarakanda",
        "fr": "Uttarakanda",
        "ja": "ウッタラーカンド州",
        "zh": "北阿坎德邦",
        "ko": "우타라칸드",
        "ru": "Уттаракханд",
        "it": "Uttarakhand",
        "pt": "Uttarakhand",
        "tr": "Uttarkand",
        "id": "Uttarakhand",
        "ur": "اتراکھنڈ",
        "fa": "اوتاراکند",
        "de": "Uttarakhand",
        "nl": "Uttarakhand",
        "pl": "Uttarakhand",
        "uk": "Уттаракханд",
        "vi": "Uttarakhand",
        "af": "Uttarakhand",
        "am": "ኡታራክሃንድ",
        "as": "উত্তৰাখণ্ড",
        "az": "Uttarakhand",
        "be": "Утаракханд",
        "bg": "Утаракханд",
        "bs": "Uttarakhand",
        "ca": "Uttarakhand",
        "ceb": "Uttarakhand",
        "cs": "Uttarakhand",
        "cy": "Uttarakhand",
        "da": "Uttarakhand",
        "el": "Ουταραχάντ",
        "eo": "Uttarakhand",
        "et": "Uttarakhand",
        "eu": "Uttarakhand",
        "fi": "Uttarakhand",
        "fil": "Uttarakhand",
        "ga": "Uttarakhand",
        "gd": "Uttarakhand",
        "gl": "Uttarakhand",
        "gu": "ઉત્તરાખંડ",
        "ha": "Uttarakhand",
        "haw": "Uttarakhand",
        "hr": "Uttarakhand",
        "hu": "Uttarakhand",
        "hy": "Ուտտարախանդ",
        "ig": "Uttarakhand",
        "is": "Uttarakhand",
        "jv": "Uttarakhand",
        "ka": "უტარახანდი",
        "kk": "Уттаракханд",
        "km": "អ៊ូតារ៉ាខាន់",
        "kn": "Uttarakanda",
        "ku": "Uttarakhand",
        "ky": "Уттаракханд",
        "la": "Uttarakhand",
        "lo": "ອຸ​ທົກ​ກະ​ທັນ",
        "lt": "Uttarakhandas",
        "lv": "Uttarakhanda",
        "mg": "Uttarakhand",
        "mi": "Uttarakhand",
        "mk": "Утараханд",
        "ml": "ഉത്തരാഖണ്ഡ്",
        "mn": "Уттаракханд",
        "mr": "उत्तराखंड",
        "ms": "Uttarakhand",
        "mt": "Uttarakhand",
        "my": "Uttarakhand",
        "ne": "उत्तराखण्ड",
        "no": "Uttarakhand",
        "ny": "Uttarakhand",
        "or": "ଉତ୍ତରାଖଣ୍ଡ",
        "pa": "ਉਤਰਾਖੰਡ",
        "ps": "اتراکنډ",
        "ro": "Uttarakhand",
        "rw": "Uttarakhand",
        "sd": "اتراڪنڊ",
        "si": "උත්තරකාන්ද්",
        "sk": "Uttarakhand",
        "sl": "Uttarakhand",
        "sm": "Uttarakhand",
        "sn": "Uttarakhand",
        "so": "Uttarakhand",
        "sq": "Uttarakhand",
        "sr": "Уттаракханд",
        "st": "Uttarakhand",
        "su": "Uttarakhand",
        "sv": "Uttarakhand",
        "sw": "Uttarakhand",
        "ta": "உத்தரகாண்ட்",
        "te": "ఉత్తరాఖండ్",
        "tg": "Уттаракханд",
        "th": "อุตตราขั ณ ฑ์",
        "tk": "Uttarakhand",
        "ug": "Uttarakhand",
        "uz": "Uttarakxand",
        "xh": "Uttarakhand",
        "yi": "Uttarakhand",
        "yo": "Uttarakhand",
        "zu": "I-Uttarakhand"
    },
    "Mishna": {
        "he": "משנה",
        "ar": "ميشناه",
        "bn": "মিশনা",
        "hi": "मिशना",
        "es": "Mishná",
        "ja": "ミシュナ",
        "zh": "米什纳",
        "ko": "미슈나",
        "fr": "Michna",
        "de": "Mischna",
        "ru": "Мишна",
        "it": "Mishna",
        "pt": "Mishná",
        "tr": "Mişna",
        "id": "Misna",
        "ur": "میشنا",
        "fa": "میشنا"
    },
    "Zohar": {
        "he": "זוהר",
        "ar": "زوهار",
        "bn": "জোহর",
        "hi": "ज़ोहर",
        "es": "Zohar",
        "ja": "ゾハル",
        "zh": "佐哈尔",
        "ko": "조하르",
        "fr": "Zohar",
        "de": "Sohar",
        "ru": "Зоар",
        "it": "Zohar",
        "pt": "Zohar",
        "tr": "Zohar",
        "id": "Zohar",
        "ur": "ظہر",
        "fa": "زوهر"
    },
    "Humanism": {
        "he": "הומניזם",
        "ar": "الإنسانية",
        "bn": "মানবতাবাদ",
        "hi": "मानवतावाद",
        "es": "Humanismo",
        "ja": "ヒューマニズム",
        "zh": "人道主义",
        "ko": "인문주의",
        "fr": "Humanisme",
        "de": "Humanismus",
        "ru": "Гуманизм",
        "it": "Umanesimo",
        "pt": "Humanismo",
        "tr": "Hümanizm",
        "id": "Humanisme",
        "ur": "ہیومنزم",
        "fa": "اومانیسم"
    },
    "Idealism": {
        "he": "אידיאליזם",
        "ar": "المثالية",
        "bn": "ভাববাদ",
        "hi": "प्रत्ययवाद",
        "es": "Idealismo",
        "ja": "理想主義",
        "zh": "唯心主义",
        "ko": "이상주의",
        "fr": "Idéalisme",
        "de": "Idealismus",
        "ru": "Идеализм",
        "it": "Idealismo",
        "pt": "Idealismo",
        "tr": "İdealizm",
        "id": "Idealisme",
        "ur": "آئیڈیل ازم",
        "fa": "آرمان گرایی"
    },
    "Cynicism": {
        "he": "ציניזם",
        "ar": "الكلبية",
        "bn": "নিন্দাবাদ",
        "hi": "सिनिकवाद",
        "es": "Cinismo",
        "ja": "皮肉",
        "zh": "玩世不恭",
        "ko": "냉소",
        "fr": "Cynisme",
        "de": "Zynismus",
        "ru": "Цинизм",
        "it": "Cinismo",
        "pt": "Cinismo",
        "tr": "Sinizm",
        "id": "Sinisme",
        "ur": "گھٹیا پن",
        "fa": "بدبینی"
    },
    "Epicureanism": {
        "he": "אפיקוריאניזם",
        "ar": "الأبيقورية",
        "bn": "এপিকিউরীয়বাদ",
        "hi": "एपिक्यूरियनवाद",
        "es": "Epicureísmo",
        "ja": "エピクロス主義",
        "zh": "享乐主义",
        "ko": "식도락",
        "fr": "Épicurisme",
        "de": "Epikureismus",
        "ru": "эпикурейство",
        "it": "epicureismo",
        "pt": "epicurismo",
        "tr": "Epikurosçuluk",
        "id": "ajaran Epikur",
        "ur": "Epicureanism",
        "fa": "اپیکوریسم"
    },
    "Hedonism": {
        "he": "הדוניזם",
        "ar": "مذهب المتعة",
        "bn": "আনন্দবাদ",
        "hi": "सुखवाद",
        "es": "Hedonismo",
        "ja": "快楽主義",
        "zh": "享乐主义",
        "ko": "쾌락주의",
        "fr": "Hédonisme",
        "de": "Hedonismus",
        "ru": "Гедонизм",
        "it": "Edonismo",
        "pt": "Hedonismo",
        "tr": "Hedonizm",
        "id": "Hedonisme",
        "ur": "Hedonism",
        "fa": "لذت گرایی"
    },
    "Vedas": {
        "he": "ודות",
        "ar": "الفيدا",
        "bn": "বেদ",
        "hi": "वेद",
        "es": "Vedas",
        "ja": "ヴェーダ",
        "zh": "吠陀经",
        "ko": "베다",
        "fr": "Védas",
        "de": "Veden",
        "ru": "Веды",
        "it": "Veda",
        "pt": "Vedas",
        "tr": "Vedalar",
        "id": "Weda",
        "ur": "وید",
        "fa": "وداها"
    },
    "Jatakas": {
        "he": "ג'טאקות",
        "ar": "جاتاكاس",
        "bn": "জাতক",
        "hi": "जातक",
        "es": "Jatakas",
        "fr": "Jâtakas",
        "ja": "ジャータカス",
        "zh": "本生经",
        "ko": "자타카",
        "de": "Jatakas",
        "ru": "Джатаки",
        "it": "Jataka",
        "pt": "Jatakas",
        "tr": "Jatakalar",
        "id": "Jataka",
        "ur": "جتکاس",
        "fa": "جاتاکاها",
        "nl": "Jatakas",
        "pl": "Jatak",
        "uk": "Джатаки",
        "vi": "Jataka",
        "af": "Jatakas",
        "am": "ጃታካስ",
        "as": "জাতক",
        "az": "Jatakas",
        "be": "Джатакі",
        "bg": "Jatakas",
        "bs": "Jatakas",
        "ca": "Jatakas",
        "ceb": "Jatakas",
        "cs": "Jatakas",
        "cy": "Jatakas",
        "da": "Jatakas",
        "el": "Τζάτακας",
        "eo": "Jatakas",
        "et": "Jatakas",
        "eu": "Jatakas",
        "fi": "Jatakas",
        "fil": "Jatakas",
        "ga": "Iatakas",
        "gd": "Jatakas",
        "gl": "Xatacas",
        "gu": "જાટકો",
        "ha": "Jatakas",
        "haw": "Jatakas",
        "hr": "Jatakas",
        "hu": "Jatakas",
        "hy": "Ջատակաս",
        "ig": "Jatakas",
        "is": "Jatakas",
        "jv": "Jatakas",
        "ka": "ჯატაკასი",
        "kk": "Жатакас",
        "km": "ចាតក",
        "kn": "ಜಾತಕರು",
        "ku": "Jatakas",
        "ky": "Jatakas",
        "la": "Jatakas",
        "lo": "ຊາຕາກ",
        "lt": "Jatakas",
        "lv": "Jatakas",
        "mg": "Jatakas",
        "mi": "Jatakas",
        "mk": "Јатакас",
        "ml": "ജാതകങ്ങൾ",
        "mn": "Жатакас",
        "mr": "जातक",
        "ms": "Jatakas",
        "mt": "Jatakas",
        "my": "ဇာတ်တော်",
        "ne": "जातकहरू",
        "no": "Jatakas",
        "ny": "Jatakas",
        "or": "Jatakas",
        "pa": "ਜਾਤਕਾਂ",
        "ps": "جتکونه",
        "ro": "Jatakas",
        "rw": "Jatakas",
        "sd": "جتڪاس",
        "si": "ජාතක",
        "sk": "Jatakas",
        "sl": "Jatakas",
        "sm": "Jatakas",
        "sn": "Jatakas",
        "so": "Jatakas",
        "sq": "Jatakas",
        "sr": "Јатакас",
        "st": "Jatakas",
        "su": "Jatakas",
        "sv": "Jatakas",
        "sw": "Jatakas",
        "ta": "ஜாதகர்கள்",
        "te": "జాతకములు",
        "tg": "Ҷатакас",
        "th": "ชาดก",
        "tk": "Jatakas",
        "ug": "Jatakas",
        "uz": "Jatakas",
        "xh": "Jatakas",
        "yi": "דזשאַטאַקאַס",
        "yo": "Jatakas",
        "zu": "Jatakas"
    },
    "Hadith": {
        "he": "חדית'",
        "ar": "الحديث",
        "bn": "হাদিস",
        "hi": "हदीस",
        "es": "Hadiz",
        "fr": "Hadith",
        "de": "Hadith",
        "ru": "Хадис",
        "it": "Hadith",
        "ja": "ハディース",
        "pt": "Hadith",
        "tr": "Hadis",
        "zh": "圣训",
        "ur": "حدیث",
        "fa": "حدیث",
        "ko": "하디스",
        "id": "hadis"
    },
    "Jami` at-Tirmidhi": {
        "he": "ג'אמע א-תרמיד'י",
        "ar": "جامع الترمذي",
        "bn": "জামে আত-তিরমিজি",
        "hi": "जामी अत-तिर्मिज़ी",
        "es": "Jami' at-Tirmidhi",
        "fr": "Jami' at-Tirmidhi",
        "ur": "جامع ترمذی",
        "fa": "جامع ترمذی",
        "ja": "ジャミ・アット・ティルミディ",
        "zh": "提尔米济的贾米",
        "ko": "자미` 앳-티르미디",
        "de": "Jami` at-Tirmidhi",
        "ru": "Джами ат-Тирмизи",
        "it": "Jami` at-Tirmidhi",
        "pt": "Jami'at-Tirmidhi",
        "tr": "Cami' et-Tirmizi",
        "id": "Jami` at-Tirmidzi"
    },
    "Bible": {
        "he": "תנ\"ך והברית החדשה",
        "ar": "الكتاب المقدس",
        "bn": "বাইবেল",
        "hi": "बाइबल",
        "es": "Biblia",
        "fr": "Bible",
        "de": "Bibel",
        "ru": "Библия",
        "it": "Bibbia",
        "ja": "聖書",
        "pt": "Bíblia",
        "tr": "Kutsal Kitap",
        "zh": "圣经",
        "ko": "성경",
        "id": "Alkitab",
        "ur": "بائبل",
        "fa": "کتاب مقدس"
    },
    "Samaveda": {
        "ja": "サマヴェダ",
        "ko": "사마베다",
        "zh": "萨马韦达",
        "es": "Samaveda",
        "fr": "Samaveda",
        "de": "Samaveda",
        "ru": "Самаведа",
        "ar": "سامافيدا",
        "bn": "সামবেদ",
        "hi": "Samaveda",
        "he": "סמוודה",
        "pt": "Samavéda",
        "it": "Samaveda",
        "tr": "Samaveda",
        "fa": "سامودا",
        "id": "Samaveda",
        "nl": "Samaveda",
        "pl": "Samaweda",
        "uk": "Самаведа",
        "vi": "Samaveda",
        "af": "Samaveda",
        "am": "ሳማቬዳ",
        "as": "সমবেদ",
        "az": "Samaveda",
        "be": "Самаведа",
        "bg": "Самаведа",
        "bs": "Samaveda",
        "ca": "Samaveda",
        "ceb": "Samaveda",
        "cs": "Samaveda",
        "cy": "Samaveda",
        "da": "Samaveda",
        "el": "Samaveda",
        "eo": "Samaveda",
        "et": "Samaveda",
        "eu": "Samaveda",
        "fi": "Samaveda",
        "fil": "Samaveda",
        "ga": "Samaveda",
        "gd": "Samaveda",
        "gl": "Samaveda",
        "gu": "સામવેદ",
        "ha": "Samaveda",
        "haw": "Samaveda",
        "hr": "Samaveda",
        "hu": "Samaveda",
        "hy": "Սամավեդա",
        "ig": "Samaveda",
        "is": "Samaveda",
        "jv": "Samaveda",
        "ka": "სავედა",
        "kk": "Самаведа",
        "km": "សាម៉ាវដា",
        "kn": "ಸಾಮವೇದ",
        "ku": "Samaveda",
        "ky": "Самаведа",
        "la": "Samaveda",
        "lo": "ຊາມາເວດາ",
        "lt": "Samaveda",
        "lv": "Samavēda",
        "mg": "Samaveda",
        "mi": "Samaveda",
        "mk": "Самаведа",
        "ml": "സാമവേദം",
        "mn": "Самаведа",
        "mr": "सामवेद",
        "ms": "Samaveda",
        "mt": "Samaveda",
        "my": "Samaveda",
        "ne": "सामवेद",
        "no": "Samaveda",
        "ny": "Samaveda",
        "or": "ସମବେଦ",
        "pa": "ਸਾਮਵੇਦ",
        "ps": "سامویدا",
        "ro": "Samaveda",
        "rw": "Samaveda",
        "sd": "سامويد",
        "si": "සාමවේදය",
        "sk": "Samaveda",
        "sl": "Samaveda",
        "sm": "Samaveda",
        "sn": "Samaveda",
        "so": "Samaveda",
        "sq": "Samaveda",
        "sr": "Самаведа",
        "st": "Samaveda",
        "su": "Samaveda",
        "sv": "Samaveda",
        "sw": "Samaveda",
        "ta": "சாமவேதம்",
        "te": "సామవేదం",
        "tg": "Самаведа",
        "th": "สมาเวดา",
        "tk": "Samaveda",
        "ug": "Samaveda",
        "ur": "ساموید",
        "uz": "Samaveda",
        "xh": "Samaveda",
        "yi": "Samaveda",
        "yo": "Samaveda",
        "zu": "Samaveda"
    },
    "Mandala": {
        "ja": "マンダラ",
        "ko": "만다라",
        "zh": "曼陀罗",
        "es": "mandala",
        "fr": "Mandalas",
        "de": "Mandala",
        "ru": "Мандала",
        "ar": "ماندالا",
        "bn": "মান্ডালা",
        "hi": "मंडल",
        "he": "מנדלה",
        "pt": "Mandala",
        "it": "Mandala",
        "tr": "mandala",
        "fa": "ماندالا",
        "id": "Mandala",
        "nl": "Mandala",
        "pl": "Mandala",
        "uk": "Мандала",
        "vi": "Mạn đà la",
        "af": "Mandala",
        "am": "ማንዳላ",
        "as": "মণ্ডলা",
        "az": "Mandala",
        "be": "Мандала",
        "bg": "Мандала",
        "bs": "Mandala",
        "ca": "Mandala",
        "ceb": "Mandala",
        "cs": "Mandala",
        "cy": "Mandala",
        "da": "Mandala",
        "el": "Μάνταλα",
        "eo": "Mandalo",
        "et": "Mandala",
        "eu": "Mandala",
        "fi": "Mandala",
        "fil": "Mandala",
        "ga": "Mandala",
        "gd": "Mandala",
        "gl": "Mandala",
        "gu": "મંડલા",
        "ha": "Mandala",
        "haw": "Mandala",
        "hr": "Mandala",
        "hu": "Mandala",
        "hy": "Մանդալա",
        "ig": "Mandala",
        "is": "Mandala",
        "jv": "Mandala",
        "ka": "მანდალა",
        "kk": "Мандала",
        "km": "ម៉ាន់ដាឡា",
        "kn": "Mandala",
        "ku": "Mandala",
        "ky": "Мандала",
        "la": "Mandala",
        "lo": "ມັນດາລາ",
        "lt": "Mandala",
        "lv": "Mandala",
        "mg": "Mandala",
        "mi": "Mandala",
        "mk": "Мандала",
        "ml": "മണ്ഡല",
        "mn": "Мандала",
        "mr": "मांडला",
        "ms": "Mandala",
        "mt": "Mandala",
        "my": "မန္တလာ",
        "ne": "मण्डला",
        "no": "Mandala",
        "ny": "Mandala",
        "or": "ମଣ୍ଡଳ",
        "pa": "ਮੰਡਲਾ",
        "ps": "منډالا",
        "ro": "Mandala",
        "rw": "Mandala",
        "sd": "منڊيلا",
        "si": "මැන්ඩලා",
        "sk": "Mandala",
        "sl": "Mandala",
        "sm": "Mandala",
        "sn": "Mandala",
        "so": "Mandala",
        "sq": "Mandala",
        "sr": "Мандала",
        "st": "Mandala",
        "su": "Mandala",
        "sv": "Mandala",
        "sw": "Mandala",
        "ta": "மண்டலா",
        "te": "మండల",
        "tg": "Мандала",
        "th": "มันดาลา",
        "tk": "Mandala",
        "ug": "ماندالا",
        "ur": "منڈلا",
        "uz": "Mandala",
        "xh": "UMandala",
        "yi": "מאַנדאַלע",
        "yo": "Mandala",
        "zu": "UMandala"
    },
    "Kaanda": {
        "ja": "善良さ",
        "ko": "선량",
        "zh": "善良",
        "es": "Bondad",
        "fr": "Bonté",
        "de": "Güte",
        "ru": "Доброта",
        "ar": "الخير",
        "bn": "মঙ্গল",
        "hi": "भलाई",
        "he": "טוּב לֵב",
        "pt": "Bondade",
        "it": "Bontà",
        "tr": "iyilik",
        "fa": "کاندا",
        "id": "Kaanda",
        "nl": "Kaanda",
        "pl": "Kaanda",
        "uk": "Каанда",
        "vi": "Kaanda",
        "af": "Kaanda",
        "am": "ካንዳ",
        "as": "কান্দা",
        "az": "Kaanda",
        "be": "Каанда",
        "bg": "Каанда",
        "bs": "Kaanda",
        "ca": "Kaanda",
        "ceb": "Kaanda",
        "cs": "Kaanda",
        "cy": "Kaanda",
        "da": "Kaanda",
        "el": "Kaanda",
        "eo": "Kaanda",
        "et": "Kaanda",
        "eu": "Kaanda",
        "fi": "Kaanda",
        "fil": "Kaanda",
        "ga": "ceanada",
        "gd": "Caanda",
        "gl": "Kaanda",
        "gu": "કાનડા",
        "ha": "Kanda",
        "haw": "Kaanda",
        "hr": "Kaanda",
        "hu": "Kaanda",
        "hy": "Կաանդա",
        "ig": "Kanda",
        "is": "Kaanda",
        "jv": "Kaanda",
        "ka": "კაანდა",
        "kk": "Каанда",
        "km": "កាដា",
        "kn": "Kaanda",
        "ku": "Kaanda",
        "ky": "Каанда",
        "la": "Kaanda",
        "lo": "ຄາດາ",
        "lt": "Kaanda",
        "lv": "Kaanda",
        "mg": "Kaanda",
        "mi": "Kaanda",
        "mk": "Каанда",
        "ml": "കാണ്ഡ",
        "mn": "Каанда",
        "mr": "कांदा",
        "ms": "Kaanda",
        "mt": "Kaanda",
        "my": "Kaanda",
        "ne": "काण्ड",
        "no": "Kaanda",
        "ny": "Kaanda",
        "or": "କାଣ୍ଡା |",
        "pa": "ਕੰਡਾ",
        "ps": "کانډا",
        "ro": "Kaanda",
        "rw": "Kaanda",
        "sd": "ڪانڊا",
        "si": "කඳ",
        "sk": "Kaanda",
        "sl": "Kaanda",
        "sm": "Kaanda",
        "sn": "Kaanda",
        "so": "Kanda",
        "sq": "Kaanda",
        "sr": "Каанда",
        "st": "Kaanda",
        "su": "Kaanda",
        "sv": "Kaanda",
        "sw": "Kaanda",
        "ta": "காண்டா",
        "te": "కాండ",
        "tg": "Каанда",
        "th": "กาอันดา",
        "tk": "Kaanda",
        "ug": "Kaanda",
        "ur": "کانڈا",
        "uz": "Kaanda",
        "xh": "Kaanda",
        "yi": "קאַאַנדאַ",
        "yo": "Kanda",
        "zu": "Kaanda"
    },
    "Sundar Kand": {
        "ja": "サンダー・カンド",
        "ko": "순다르 칸드",
        "zh": "桑达尔康德",
        "es": "Sundar Kand",
        "fr": "Sundar Kand",
        "de": "Sundar Kand",
        "ru": "Сундар Канд",
        "ar": "سوندار كاند",
        "bn": "সুন্দর কান্ড",
        "hi": "Sundar Kand",
        "he": "סונדאר קנד",
        "pt": "Sundar Kand",
        "it": "Sundar Kand",
        "tr": "Sundar Kand",
        "fa": "ساندار کند",
        "id": "Sundar Kand",
        "nl": "Sundar Kand",
        "pl": "Sundara Kanda",
        "uk": "Сундар Канд",
        "vi": "Sundar Kand",
        "af": "Sundar Kand",
        "am": "ሳንዳር ካንድ",
        "as": "সুন্দৰ কাণ্ড",
        "az": "Sundar Kand",
        "be": "Сундар канд",
        "bg": "Сундар Канд",
        "bs": "Sundar Kand",
        "ca": "Sundar Kand",
        "ceb": "Sundar Kand",
        "cs": "Sundar Kand",
        "cy": "Sundar Kand",
        "da": "Sundar Kand",
        "el": "Σούνταρ Καντ",
        "eo": "Sundar Kand",
        "et": "Sundar Kand",
        "eu": "Sundar Kand",
        "fi": "Sundar Kand",
        "fil": "Sundar Kand",
        "ga": "Sundar Kand",
        "gd": "Sundar Kand",
        "gl": "Sundar Kand",
        "gu": "સુંદરકાંડ",
        "ha": "Sundar Kand",
        "haw": "Sundar Kand",
        "hr": "Sundar Kand",
        "hu": "Sundar Kand",
        "hy": "Սունդար Քանդ",
        "ig": "Sundar Kand",
        "is": "Sundar Kand",
        "jv": "Sundar Kand",
        "ka": "სუნდა კანდი",
        "kk": "Сундар Канд",
        "km": "សន ដារ",
        "kn": "Sundar Kand",
        "ku": "Sundar Kand",
        "ky": "Сундар Канд",
        "la": "Sundar Kand",
        "lo": "Sundar Kand",
        "lt": "Sundaras Kandas",
        "lv": "Sundar Kand",
        "mg": "Sundar Kand",
        "mi": "Sundar Kand",
        "mk": "Сундар Канд",
        "ml": "സുന്ദര് കാണ്ട്",
        "mn": "Сундар Канд",
        "mr": "सुंदरकांड",
        "ms": "Sundar Kand",
        "mt": "Sundar Kand",
        "my": "Sundar Kand",
        "ne": "सुन्दर काण्ड",
        "no": "Sundar Kand",
        "ny": "Sundar Kanda",
        "or": "ସୁନ୍ଦର କଣ୍ଡ",
        "pa": "ਸੁੰਦਰ ਕਾਂਡ",
        "ps": "سندر کنډ",
        "ro": "Sundar Kand",
        "rw": "Sundar Kand",
        "sd": "سندر ڪنڊ",
        "si": "සුන්දර් කන්ද",
        "sk": "Sundar Kand",
        "sl": "Sundar Kand",
        "sm": "Sundar Kand",
        "sn": "Sundar Kand",
        "so": "Sundar Kand",
        "sq": "Sundar Kand",
        "sr": "Сундар Канд",
        "st": "Sundar Kand",
        "su": "Sundar Kand",
        "sv": "Sundar Kand",
        "sw": "Sundar Kand",
        "ta": "சுந்தர் காண்ட்",
        "te": "సుందర్ కాండ్",
        "tg": "Сундар Канд",
        "th": "ซุนดาร์ กานด์",
        "tk": "Sundar Kand",
        "ug": "Sundar Kand",
        "ur": "سندر کانڈ",
        "uz": "Sundar Kand",
        "xh": "Sundar Kand",
        "yi": "Sundar Kand",
        "yo": "Sundar Kand",
        "zu": "Sundar Kand"
    },
    "Aranya Kand": {
        "ja": "アランヤ・カンド",
        "ko": "아라냐 칸드",
        "zh": "阿那亚康德",
        "es": "Aranya Kand",
        "fr": "Aranya Kand",
        "de": "Aranya Kand",
        "ru": "Аранья Канд",
        "ar": "أرانيا كاند",
        "bn": "অরণ্য কান্ড",
        "hi": "Aranya Kand",
        "he": "ארניה קנד",
        "pt": "Aranya Kand",
        "it": "Aranya Kand",
        "tr": "Aranya Kand",
        "fa": "آرانیا کاند",
        "id": "Aranya Kand",
        "nl": "Aranya Kand",
        "pl": "Aranya Kand",
        "uk": "Аранья канд",
        "vi": "Aranya Kand",
        "af": "Aranya Kand",
        "am": "Aranya Kand",
        "as": "অৰণ্য কাণ্ড",
        "az": "Aranya Kand",
        "be": "Аранья канд",
        "bg": "Араня канд",
        "bs": "Aranya Kand",
        "ca": "Aranya Kand",
        "ceb": "Aranya Kand",
        "cs": "Aranya Kand",
        "cy": "Aranya Kand",
        "da": "Aranya Kand",
        "el": "Αράνια Καντ",
        "eo": "Aranya Kand",
        "et": "Aranya Kand",
        "eu": "Aranya Kand",
        "fi": "Aranya Kand",
        "fil": "Aranya Kand",
        "ga": "Aranya Kand",
        "gd": "Aranya Kand",
        "gl": "Aranya Kand",
        "gu": "અરણ્ય કાંડ",
        "ha": "Aranya Kand",
        "haw": "Aranya Kand",
        "hr": "Aranya Kand",
        "hu": "Aranya Kand",
        "hy": "Արանյա Կանդ",
        "ig": "Aranya Kand",
        "is": "Aranya Kand",
        "jv": "Aranya Kand",
        "ka": "არანია კანდი",
        "kk": "Араня Канд",
        "km": "អារញ្ញ កន",
        "kn": "Aranya Kand",
        "ku": "Aranya Kand",
        "ky": "Араня Канд",
        "la": "Aranya Kand",
        "lo": "ອາຣັນຍາ ແຄນ",
        "lt": "Aranya Kand",
        "lv": "Arānija Kand",
        "mg": "Aranya Kand",
        "mi": "Aranya Kand",
        "mk": "Арања Канд",
        "ml": "ആരണ്യകാണ്ഡം",
        "mn": "Араня Канд",
        "mr": "अरण्य कांड",
        "ms": "Aranya Kand",
        "mt": "Aranya Kand",
        "my": "Aranya Kand",
        "ne": "अरण्य काण्ड",
        "no": "Aranya Kand",
        "ny": "Aranya Kand",
        "or": "ଆର୍ଯ୍ୟ କାଣ୍ଡ |",
        "pa": "ਅਰਣਿਆ ਕਾਂਡ",
        "ps": "آریانا کنډ",
        "ro": "Aranya Kand",
        "rw": "Aranya Kand",
        "sd": "آريا ڪنڊ",
        "si": "ආරණ්‍ය කන්ද",
        "sk": "Aranya Kand",
        "sl": "Aranya Kand",
        "sm": "Aranya Kand",
        "sn": "Aranya Kand",
        "so": "Aranya Kand",
        "sq": "Aranya Kand",
        "sr": "Араниа Канд",
        "st": "Aranya Kand",
        "su": "Aranya Kand",
        "sv": "Aranya Kand",
        "sw": "Aranya Kand",
        "ta": "ஆரண்ய காண்ட்",
        "te": "అరణ్య కాండ్",
        "tg": "Араня Канд",
        "th": "อรัญญา กันต์",
        "tk": "Aranya Kand",
        "ug": "Aranya Kand",
        "ur": "آرانیہ کاند",
        "uz": "Aranya Kand",
        "xh": "Aranya Kand",
        "yi": "אַראַניאַ קאַנד",
        "yo": "Aranya Kand",
        "zu": "Aranya Kand"
    },
    "Kishkindha Kand": {
        "ja": "キシュキンダ・カンド",
        "ko": "키슈킨다 칸드",
        "zh": "基什金达·坎德",
        "es": "Kishkindha Kand",
        "fr": "Kishkindha Kand",
        "de": "Kishkindha Kand",
        "ru": "Кишкиндха Канд",
        "ar": "كيشكيندا كاند",
        "bn": "কিষ্কিন্ধা কাণ্ড",
        "hi": "Kishkindha Kand",
        "he": "קישקינדה קנד",
        "pt": "Kishkindha Kand",
        "it": "Kishkindha Kand",
        "tr": "Kişkindha Kand",
        "fa": "کیشکیندها کاند",
        "id": "Kishkindha Kand",
        "nl": "Kiskindha Kand",
        "pl": "Kishkindha Kand",
        "uk": "Кішкіндха канд",
        "vi": "Kishkindha Kand",
        "af": "Kishkindha Kand",
        "am": "ኪሽኪንዳ ካንድ",
        "as": "কিষ্কিন্দা কাণ্ড",
        "az": "Kishkindha Kand",
        "be": "Кішкіндха канд",
        "bg": "Kishkindha Kand",
        "bs": "Kishkindha Kand",
        "ca": "Kishkindha Kand",
        "ceb": "Kishkindha Kand",
        "cs": "Kishkindha Kand",
        "cy": "Kishkindha Kand",
        "da": "Kishkindha Kand",
        "el": "Kishkindha Kand",
        "eo": "Kishkindha Kand",
        "et": "Kishkindha Kand",
        "eu": "Kishkindha Kand",
        "fi": "Kishkindha Kand",
        "fil": "Kishkindha Kand",
        "ga": "Kishkindha Kand",
        "gd": "Kishkindha Kand",
        "gl": "Kishkindha Kand",
        "gu": "કિષ્કિન્ધાકાંડ",
        "ha": "Kishkindha Kand",
        "haw": "Kishkindha Kand",
        "hr": "Kishkindha Kand",
        "hu": "Kishkindha Kand",
        "hy": "Կիշկինդա Քանդ",
        "ig": "Kishkindha Kand",
        "is": "Kishkindha Kand",
        "jv": "Kishkindha Kand",
        "ka": "კიშკინდა კანდი",
        "kk": "Кишкиндха Канд",
        "km": "Kishkindha Kand",
        "kn": "Kishkindha Kand",
        "ku": "Kishkindha Kand",
        "ky": "Кишкиндха Канд",
        "la": "Kishkindha Kand",
        "lo": "ຄິສຄິນດາ ແຄນ",
        "lt": "Kishkindha Kand",
        "lv": "Kishkindha Kand",
        "mg": "Kishkindha Kand",
        "mi": "Kishkindha Kand",
        "mk": "Кишкинда Канд",
        "ml": "കിഷ്കിന്ധ കാണ്ട്",
        "mn": "Кишкиндха Канд",
        "mr": "किष्किंधा कांड",
        "ms": "Kishkindha Kand",
        "mt": "Kishkindha Kand",
        "my": "Kishkindha Kand",
        "ne": "किष्किंध काण्ड",
        "no": "Kishkindha Kand",
        "ny": "Kishkindha Kand",
        "or": "କିସ୍କିନ୍ଦ କାଣ୍ଡ |",
        "pa": "ਕਿਸ਼ਕਿੰਧਾ ਕਾਂਡ",
        "ps": "د کشکنده کند",
        "ro": "Kishkindha Kand",
        "rw": "Kishkindha Kand",
        "sd": "ڪشڪندا ڪنڊ",
        "si": "කිෂ්කින්දා කන්ද",
        "sk": "Kishkindha Kand",
        "sl": "Kishkindha Kand",
        "sm": "Kishkindha Kand",
        "sn": "Kishkindha Kand",
        "so": "Kishkindha Kand",
        "sq": "Kishkindha Kand",
        "sr": "Кисхкиндха Канд",
        "st": "Kishkindha Kand",
        "su": "Kishkindha Kand",
        "sv": "Kishkindha Kand",
        "sw": "Kishkindha Kand",
        "ta": "கிஷ்கிந்தா காண்ட்",
        "te": "కిష్కింధ కాండ్",
        "tg": "Кишкиндха Канд",
        "th": "กิษกิณธา กานท์",
        "tk": "Kishkindha Kand",
        "ug": "Kishkindha Kand",
        "ur": "کشکندا کانڈ",
        "uz": "Kishkindha Kand",
        "xh": "Kishkindha Kand",
        "yi": "קישקינדהאַ קאַנד",
        "yo": "Kishkindha Kand",
        "zu": "Kishkindha Kand"
    },
    "Ayodhya Kand": {
        "ja": "アヨーディヤ カンド",
        "ko": "아요디아 칸드",
        "zh": "阿约提亚·康德",
        "es": "Ayodhya Kand",
        "fr": "Ayodhya Kand",
        "de": "Ayodhya Kand",
        "ru": "Айодхья Канд",
        "ar": "ايوديا كاند",
        "bn": "অযোধ্যা কাণ্ড",
        "hi": "Ayodhya Kand",
        "he": "Ayodhya Kand",
        "pt": "Ayodhya Kand",
        "it": "Ayodhya Kand",
        "tr": "Ayodhya Kand",
        "fa": "آیودیا کاند",
        "id": "Ayodhya Kand",
        "nl": "Ayodhya Kand",
        "pl": "Ajodhja Kand",
        "uk": "Айодхя Канд",
        "vi": "Ayodhya Kand",
        "af": "Ayodhya Kand",
        "am": "አዮዲያ ካንድ",
        "as": "অযোধ্যা কাণ্ড",
        "az": "Ayodhya Kand",
        "be": "Аёдх'я канд",
        "bg": "Айодхя Канд",
        "bs": "Ayodhya Kand",
        "ca": "Ayodhya Kand",
        "ceb": "Ayodhya Kand",
        "cs": "Ayodhya Kand",
        "cy": "Ayodhya Kand",
        "da": "Ayodhya Kand",
        "el": "Ayodhya Kand",
        "eo": "Ajodhya Kand",
        "et": "Ayodhya Kand",
        "eu": "Ayodhya Kand",
        "fi": "Ayodhya Kand",
        "fil": "Ayodhya Kand",
        "ga": "Ayodhya Kand",
        "gd": "Ayodhya Kand",
        "gl": "Ayodhya Kand",
        "gu": "અયોધ્યાકાંડ",
        "ha": "Ayodhya Kand",
        "haw": "Ayodhya Kand",
        "hr": "Ayodhya Kand",
        "hu": "Ayodhya Kand",
        "hy": "Այոդյա Կանդ",
        "ig": "Ayodhya Kand",
        "is": "Ayodhya Kand",
        "jv": "Ayodhya Kand",
        "ka": "აიოდია კანდი",
        "kk": "Айодхья Канд",
        "km": "អយុធ្យាកាន",
        "kn": "Ayodhya Kand",
        "ku": "Ayodhya Kand",
        "ky": "Айодхья Канд",
        "la": "Ayodhya Kand",
        "lo": "Ayodhya Kand",
        "lt": "Ayodhya Kand",
        "lv": "Ayodhya Kand",
        "mg": "Ayodhya Kand",
        "mi": "Ayodhya Kand",
        "mk": "Ајодја Канд",
        "ml": "അയോധ്യാകണ്ട്",
        "mn": "Айодхья Канд",
        "mr": "अयोध्या कांड",
        "ms": "Ayodhya Kand",
        "mt": "Ayodhya Kand",
        "my": "Ayodhya Kand ၊",
        "ne": "अयोध्या काण्ड",
        "no": "Ayodhya Kand",
        "ny": "Ayodhya Kand",
        "or": "ଅଯୋଧ୍ୟା କାଣ୍ଡ |",
        "pa": "ਅਯੁੱਧਿਆ ਕਾਂਡ",
        "ps": "د ایودیا کنډ",
        "ro": "Ayodhya Kand",
        "rw": "Ayodhya Kand",
        "sd": "ايوڌيا ڪنڊ",
        "si": "අයෝධ්‍යා කන්ද",
        "sk": "Ayodhya Kand",
        "sl": "Ayodhya Kand",
        "sm": "Ayodhya Kand",
        "sn": "Ayodhya Kand",
        "so": "Ayodhya Kand",
        "sq": "Ayodhya Kand",
        "sr": "Аиодхиа Канд",
        "st": "Ayodhya Kand",
        "su": "Ayodhya Kand",
        "sv": "Ayodhya Kand",
        "sw": "Ayodhya Kand",
        "ta": "அயோத்தி காண்ட்",
        "te": "అయోధ్య కాండ్",
        "tg": "Айодхя Канд",
        "th": "อโยธยากานต์",
        "tk": "Aýodýa Kand",
        "ug": "Ayodhya Kand",
        "ur": "ایودھیا کانڈ",
        "uz": "Ayodhya Kand",
        "xh": "Ayodhya Kand",
        "yi": "Ayodhya Kand",
        "yo": "Ayodhya Kand",
        "zu": "Ayodhya Kand"
    },
    "Lanka Kand": {
        "ja": "ランカ理学士",
        "ko": "랑카 학사학위",
        "zh": "兰卡理学学士",
        "es": "Lanka Licenciatura en Ciencias",
        "fr": "Lanka B.Sc.",
        "de": "Lanka B.Sc",
        "ru": "Ланка Бакалавр наук",
        "ar": "لانكا بكالوريوس العلوم",
        "bn": "লঙ্কা B.Sc",
        "hi": "लंका बी.एससी",
        "he": "לנקה B.Sc",
        "pt": "Lanka B.Sc",
        "it": "Lanka B.Sc",
        "tr": "Lanka B.Sc",
        "fa": "لانکا کاند",
        "id": "Lanka Kand",
        "nl": "Lanka Kand",
        "pl": "Lanka Kand",
        "uk": "Ланка канд",
        "vi": "Lanka Kand",
        "af": "Lanka Kand",
        "am": "ላንካ ካንድ",
        "as": "লংকা কাণ্ড",
        "az": "Lanka Kand",
        "be": "Ланка канд",
        "bg": "Lanka Kand",
        "bs": "Lanka Kand",
        "ca": "Lanka Kand",
        "ceb": "Lanka Kand",
        "cs": "Lanka Kand",
        "cy": "Lanca Kand",
        "da": "Lanka Kand",
        "el": "Λάνκα Καντ",
        "eo": "Lanka Kand",
        "et": "Lanka Kand",
        "eu": "Lanka Kand",
        "fi": "Lanka Kand",
        "fil": "Lanka Kand",
        "ga": "Lanca Kand",
        "gd": "Lanca Kand",
        "gl": "Lanka Kand",
        "gu": "લંકા કાંડ",
        "ha": "Lanka Kand",
        "haw": "ʻO Lanka Kand",
        "hr": "Lanka Kand",
        "hu": "Lanka Kand",
        "hy": "Լանկա Կանդ",
        "ig": "Lanka Kand",
        "is": "Lanka Kand",
        "jv": "Lanka Kand",
        "ka": "ლანკა კანდი",
        "kk": "Ланка Канд",
        "km": "លង្កាកាន",
        "kn": "Lanka Kand",
        "ku": "Lanka Kand",
        "ky": "Ланка Канд",
        "la": "Lanka Kand",
        "lo": "Lanka Kand",
        "lt": "Lanka Kand",
        "lv": "Lanka Kand",
        "mg": "Lanka Kand",
        "mi": "Lanka Kand",
        "mk": "Ланка Канд",
        "ml": "ലങ്ക കാണ്ട്",
        "mn": "Ланка Канд",
        "mr": "लंका कांड",
        "ms": "Lanka Kand",
        "mt": "Lanka Kand",
        "my": "လင်္ကာကံ",
        "ne": "लंका काण्ड",
        "no": "Lanka Kand",
        "ny": "Lanka Kanda",
        "or": "ଲଙ୍କା କାଣ୍ଡ |",
        "pa": "ਲੰਕਾ ਕਾਂਡ",
        "ps": "د لنکا کنډ",
        "ro": "Lanka Kand",
        "rw": "Lanka Kand",
        "sd": "لنڪا ڪنڊ",
        "si": "ලංකා කන්ද",
        "sk": "Lanka Kand",
        "sl": "Lanka Kand",
        "sm": "Lanka Kand",
        "sn": "Lanka Kand",
        "so": "Lanka Kand",
        "sq": "Lanka Kand",
        "sr": "Ланка Канд",
        "st": "Lanka Kand",
        "su": "Lanka Kand",
        "sv": "Lanka Kand",
        "sw": "Lanka Kand",
        "ta": "லங்கா காண்ட்",
        "te": "లంకా కాండ్",
        "tg": "Ланка Канд",
        "th": "ลังกา กานด์",
        "tk": "Lanka Kand",
        "ug": "Lanka Kand",
        "ur": "لنکا کانڈ",
        "uz": "Lanka Kand",
        "xh": "Lanka Kand",
        "yi": "לאַנקאַ קאַנד",
        "yo": "Lanka Kand",
        "zu": "Lanka Kand"
    },
    "Uttar Kand": {
        "ja": "ウッタル・カンド",
        "ko": "우타르 칸드",
        "zh": "北康德",
        "es": "Uttar Kan",
        "fr": "Uttar Kand",
        "de": "Uttar Kand",
        "ru": "Уттар Канд",
        "ar": "اوتار كاند",
        "bn": "উত্তর কাণ্ড",
        "hi": "Uttar Kand",
        "he": "אוטר קנד",
        "pt": "Uttar Kand",
        "it": "Uttar Kand",
        "tr": "Uttar Kand",
        "fa": "اوتاراکند",
        "id": "Uttarakhand",
        "nl": "Uttarakhand",
        "pl": "Uttarakhand",
        "uk": "Уттаракханд",
        "vi": "Uttarakhand",
        "af": "Uttarakhand",
        "am": "ኡታራክሃንድ",
        "as": "উত্তৰাখণ্ড",
        "az": "Uttarakhand",
        "be": "Утаракханд",
        "bg": "Утаракханд",
        "bs": "Uttarakhand",
        "ca": "Uttarakhand",
        "ceb": "Uttarakhand",
        "cs": "Uttarakhand",
        "cy": "Uttarakhand",
        "da": "Uttarakhand",
        "el": "Ουταραχάντ",
        "eo": "Uttarakhand",
        "et": "Uttarakhand",
        "eu": "Uttarakhand",
        "fi": "Uttarakhand",
        "fil": "Uttarakhand",
        "ga": "Uttarakhand",
        "gd": "Uttarakhand",
        "gl": "Uttarakhand",
        "gu": "ઉત્તરાખંડ",
        "ha": "Uttarakhand",
        "haw": "Uttarakhand",
        "hr": "Uttarakhand",
        "hu": "Uttarakhand",
        "hy": "Ուտտարախանդ",
        "ig": "Uttarakhand",
        "is": "Uttarakhand",
        "jv": "Uttarakhand",
        "ka": "უტარახანდი",
        "kk": "Уттаракханд",
        "km": "អ៊ូតារ៉ាខាន់",
        "kn": "Uttar Kand",
        "ku": "Uttarakhand",
        "ky": "Уттаракханд",
        "la": "Uttarakhand",
        "lo": "ອຸ​ທົກ​ກະ​ທັນ",
        "lt": "Uttarakhandas",
        "lv": "Uttarakhanda",
        "mg": "Uttarakhand",
        "mi": "Uttarakhand",
        "mk": "Утараханд",
        "ml": "ഉത്തരാഖണ്ഡ്",
        "mn": "Уттаракханд",
        "mr": "उत्तराखंड",
        "ms": "Uttarakhand",
        "mt": "Uttarakhand",
        "my": "Uttarakhand",
        "ne": "उत्तराखण्ड",
        "no": "Uttarakhand",
        "ny": "Uttarakhand",
        "or": "ଉତ୍ତରାଖଣ୍ଡ",
        "pa": "ਉਤਰਾਖੰਡ",
        "ps": "اتراکنډ",
        "ro": "Uttarakhand",
        "rw": "Uttarakhand",
        "sd": "اتراڪنڊ",
        "si": "උත්තරකාන්ද්",
        "sk": "Uttarakhand",
        "sl": "Uttarakhand",
        "sm": "Uttarakhand",
        "sn": "Uttarakhand",
        "so": "Uttarakhand",
        "sq": "Uttarakhand",
        "sr": "Уттаракханд",
        "st": "Uttarakhand",
        "su": "Uttarakhand",
        "sv": "Uttarakhand",
        "sw": "Uttarakhand",
        "ta": "உத்தரகாண்ட்",
        "te": "ఉత్తరాఖండ్",
        "tg": "Уттаракханд",
        "th": "อุตตราขั ณ ฑ์",
        "tk": "Uttarakhand",
        "ug": "Uttarakhand",
        "ur": "اتراکھنڈ",
        "uz": "Uttarakxand",
        "xh": "Uttarakhand",
        "yi": "Uttarakhand",
        "yo": "Uttarakhand",
        "zu": "I-Uttarakhand"
    },
    "Yudhhakanda": {
        "ja": "ユダカンダ",
        "ko": "유다칸다",
        "zh": "尤达坎达",
        "es": "Yudhhakanda",
        "fr": "Yudhhakanda",
        "de": "Yudhhakanda",
        "ru": "Юдхаканда",
        "ar": "يودهاكاندا",
        "bn": "যুধকাণ্ড",
        "hi": "युद्धकाण्ड",
        "he": "יודהאקנדה",
        "pt": "Yudhakanda",
        "it": "Yudhhakanda",
        "tr": "Yudhakanda",
        "fa": "یودهاکاندا",
        "id": "Yudhhakanda",
        "nl": "Yudhhakanda",
        "pl": "Yudhakanda",
        "uk": "Юдхаканда",
        "vi": "Yudhakanda",
        "af": "Yudhhakanda",
        "am": "ዩድሃካንዳ",
        "as": "যুধকাণ্ড",
        "az": "Yudhhakanda",
        "be": "Юдхаканда",
        "bg": "Юдхаканда",
        "bs": "Yudhhakanda",
        "ca": "Yudhhakanda",
        "ceb": "Yudhhakanda",
        "cs": "Yudhhakanda",
        "cy": "Yudhhakanda",
        "da": "Yudhhakanda",
        "el": "Yudhhakanda",
        "eo": "Yudhhakanda",
        "et": "Yudhhakanda",
        "eu": "Yudhhakanda",
        "fi": "Yudhhakanda",
        "fil": "Yudhhakanda",
        "ga": "Iúdá",
        "gd": "Iùdhaich",
        "gl": "Yudhhakanda",
        "gu": "યુદ્ધકાંડ",
        "ha": "Yudhhakanda",
        "haw": "Yudhhakanda",
        "hr": "Yudhhakanda",
        "hu": "Yudhhakanda",
        "hy": "Յուդհականդա",
        "ig": "Yudhhakanda",
        "is": "Yudhhakanda",
        "jv": "Yudhhakanda",
        "ka": "იუდჰაკანდა",
        "kk": "Юдххаканда",
        "km": "យុត្ថាកា",
        "kn": "Yudhhakanda",
        "ku": "Yudhhakanda",
        "ky": "Yudhhakanda",
        "la": "Yudhhakanda",
        "lo": "ຢູດາ ຄານດາ",
        "lt": "Judhakanda",
        "lv": "Judhakanda",
        "mg": "Yudhhakanda",
        "mi": "Yudhhakanda",
        "mk": "Јудхаканда",
        "ml": "യുദ്ധകാണ്ഡം",
        "mn": "Юдхаканда",
        "mr": "युद्धकांड",
        "ms": "Yudhhakanda",
        "mt": "Yudhhakanda",
        "my": "ယုဒကန္ဒာ",
        "ne": "युद्धकाण्ड",
        "no": "Yudhhakanda",
        "ny": "Yudhhakanda",
        "or": "ଯୁଧିଷ୍ଠିର",
        "pa": "ਯੁਧਕੰਡਾ",
        "ps": "یودحاکنډ",
        "ro": "Yudhhakanda",
        "rw": "Yudhhakanda",
        "sd": "يوڌڪنڊا",
        "si": "යුධකන්ද",
        "sk": "Yudhhakanda",
        "sl": "Yudhhakanda",
        "sm": "Yudhhakanda",
        "sn": "Yudhhakanda",
        "so": "Yudhhakanda",
        "sq": "Yudhhakanda",
        "sr": "Иудххаканда",
        "st": "Yudhhakanda",
        "su": "Yudhhakanda",
        "sv": "Yudhhakanda",
        "sw": "Yudhhakanda",
        "ta": "யுத்தகாண்டா",
        "te": "యుద్ధకాండ",
        "tg": "Юдхаканда",
        "th": "ยุธกานดา",
        "tk": "Ududhakanda",
        "ug": "Yudhhakanda",
        "ur": "یودھاکنڈا۔",
        "uz": "Yudxxakanda",
        "xh": "Yudhhakanda",
        "yi": "יודהאַקאַנדאַ",
        "yo": "Yudhhakanda",
        "zu": "I-Yudhhakanda"
    },
    "Bala Kand": {
        "ja": "バラ・カンド",
        "ko": "발라 칸드",
        "zh": "巴拉康德",
        "es": "Bala Kand",
        "fr": "Bala Kand",
        "de": "Bala Kand",
        "ru": "Бала Канд",
        "ar": "بالا كاند",
        "bn": "বালা কান্ড",
        "hi": "Bala Kand",
        "he": "באלה קנד",
        "pt": "Bala Kand",
        "it": "Bala Kand",
        "tr": "Bala Kand",
        "fa": "بالا کند",
        "id": "Bala Kand",
        "nl": "Bala Kand",
        "pl": "Bala Kanda",
        "uk": "Бала канд",
        "vi": "Bala Kand",
        "af": "Bala Kand",
        "am": "ባላ ካንድ",
        "as": "বালা কাণ্ড",
        "az": "Bala Kənd",
        "be": "Бала канд",
        "bg": "Бала Канд",
        "bs": "Bala Kand",
        "ca": "Bala Kand",
        "ceb": "Bala Kand",
        "cs": "Bala Kand",
        "cy": "Bala Kand",
        "da": "Bala Kand",
        "el": "Μπάλα Καντ",
        "eo": "Bala Kand",
        "et": "Bala Kand",
        "eu": "Bala Kand",
        "fi": "Bala Kand",
        "fil": "Bala Kand",
        "ga": "Bala Kand",
        "gd": "Bala Kand",
        "gl": "Bala Kand",
        "gu": "બાલાકાંડ",
        "ha": "Bala Kand",
        "haw": "Bala Kand",
        "hr": "Bala Kand",
        "hu": "Bala Kand",
        "hy": "Բալա Կանդ",
        "ig": "Bala Kand",
        "is": "Bala Kand",
        "jv": "Bala Kand",
        "ka": "ბალა კანდი",
        "kk": "Бала Канд",
        "km": "បាឡាកន",
        "kn": "Bala Kand",
        "ku": "Bala Kand",
        "ky": "Бала Канд",
        "la": "Bala Kand",
        "lo": "ບາລາຄັນ",
        "lt": "Bala Kand",
        "lv": "Bala Kand",
        "mg": "Bala Kand",
        "mi": "Bala Kand",
        "mk": "Бала Канд",
        "ml": "ബാല കാന്ദ്",
        "mn": "Бала Канд",
        "mr": "बालकांड",
        "ms": "Bala Kand",
        "mt": "Bala Kand",
        "my": "ဗလကန်",
        "ne": "बाला काण्ड",
        "no": "Bala Kand",
        "ny": "Bala Kandi",
        "or": "ବାଲା କାଣ୍ଡ |",
        "pa": "ਬਾਲਾ ਕਾਂਡ",
        "ps": "بالا کند",
        "ro": "Bala Kand",
        "rw": "Bala Kand",
        "sd": "بالا ڪنڊ",
        "si": "බල කන්ද",
        "sk": "Bala Kand",
        "sl": "Bala Kand",
        "sm": "Bala Kand",
        "sn": "Bala Kand",
        "so": "Bala Kand",
        "sq": "Bala Kand",
        "sr": "Бала Канд",
        "st": "Bala Kand",
        "su": "Bala Kand",
        "sv": "Bala Kand",
        "sw": "Bala Kand",
        "ta": "பால காந்த்",
        "te": "బాల కాంద్",
        "tg": "Бала Канд",
        "th": "บาลา คันด์",
        "tk": "Bala Kand",
        "ug": "Bala Kand",
        "ur": "بالا کانڈ",
        "uz": "Bala Kand",
        "xh": "Bala Kand",
        "yi": "באַלאַ קאַנד",
        "yo": "Bala Kand",
        "zu": "Bala Kand"
    }
};;;;;;;







const verseTranslationMemoryCache = {};

function isGarbageTranslation(str, targetLang = currentAppLanguage) {
    if (!str || typeof str !== 'string') return true;
    const trimmed = str.trim();
    if (trimmed.length < 2) return true;
    if (/^[?*\s.,!\-_=+]+$/.test(trimmed)) return true;
    const upper = trimmed.toUpperCase();
    if (upper.includes('MYMEMORY WARNING') || 
        upper.includes('QUERY LENGTH LIMIT') || 
        upper.includes('DAILY LIMIT') ||
        upper.includes('TRANSLATION LIMIT') ||
        upper.includes('TOO MANY REQUESTS')) {
        return true;
    }
    // If target language is non-Latin (Bengali, Arabic, Hindi, Russian, etc.), reject if untranslated English words leaked
    const nonLatinLangs = ['bn', 'ar', 'hi', 'ru', 'ja', 'zh', 'ko', 'fa', 'ur', 'ta', 'te', 'mr', 'gu', 'pa', 'he', 'th', 'el'];
    if (nonLatinLangs.includes(targetLang) && /[a-zA-Z]{3,}/.test(trimmed)) {
        return true;
    }
    return false;
}

function getTranslationCacheKey(text, lang) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return 'vtr_' + lang + '_' + Math.abs(hash);
}

function getCachedVerseTranslation(text, lang) {
    if (!text || !lang || lang === 'en_US' || lang === 'en') return text;
    const key = getTranslationCacheKey(text, lang);
    if (verseTranslationMemoryCache[key]) {
        if (isGarbageTranslation(verseTranslationMemoryCache[key])) {
            delete verseTranslationMemoryCache[key];
            try { localStorage.removeItem(key); } catch(e) {}
            return null;
        }
        return verseTranslationMemoryCache[key];
    }
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            if (isGarbageTranslation(stored)) {
                localStorage.removeItem(key);
                return null;
            }
            verseTranslationMemoryCache[key] = stored;
            return stored;
        }
    } catch(e) {}
    return null;
}

function setCachedVerseTranslation(text, lang, translation) {
    if (!text || !lang || !translation || isGarbageTranslation(translation)) return;
    const key = getTranslationCacheKey(text, lang);
    verseTranslationMemoryCache[key] = translation;
    try {
        localStorage.setItem(key, translation);
    } catch(e) {}
}

function cleanBengaliUnicode(text) {
    if (!text) return '';
    // Strip leftover untranslated english words that leaked into bengali sentences
    let cleaned = text.replace(/\b[a-zA-Z]+\b/g, '').replace(/\s+/g, ' ');
    return cleaned
        .replace(/([\u0980-\u09FF])\s+\u09CD\s+([\u0980-\u09FF])/g, '$1\u09CD$2')
        .replace(/\s+\u09CD\s+/g, '\u09CD')
        .replace(/([\u0980-\u09FF])\s+([\u09BC-\u09CD\u09D7\u09BE-\u09CC])/g, '$1$2')
        .replace(/[\uFFFD\u25CC]/g, '')
        .replace(/\s+([।,;!?])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

const inFlightTranslations = new Map();

async function translateTextAsync(text, targetLang) {
    if (!text || !targetLang || targetLang === 'en_US' || targetLang === 'en') return text;
    
    // Check cache first
    const cached = getCachedVerseTranslation(text, targetLang);
    if (cached && !isGarbageTranslation(cached, targetLang)) return cached;
    
    const shortLang = targetLang.split('_')[0].split('-')[0].toLowerCase();
    const flightKey = `${shortLang}_${text.trim()}`;
    if (inFlightTranslations.has(flightKey)) {
        return inFlightTranslations.get(flightKey);
    }

    const task = (async () => {
        // 1. High-Speed Google Engine (No IP cap, instant response)
        try {
            const gUrl = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' + shortLang + '&q=' + encodeURIComponent(text);
            const gResp = await fetch(gUrl);
            if (gResp.ok) {
                const gData = await gResp.json();
                let gTrans = '';
                if (Array.isArray(gData)) {
                    if (Array.isArray(gData[0])) {
                        gTrans = (gData[0][0] || '').trim();
                    } else if (typeof gData[0] === 'string') {
                        gTrans = gData[0].trim();
                    }
                }
                if (gTrans && !isGarbageTranslation(gTrans, targetLang)) {
                    if (shortLang === 'bn') gTrans = cleanBengaliUnicode(gTrans);
                    setCachedVerseTranslation(text, targetLang, gTrans);
                    return gTrans;
                }
            }
        } catch(e) {}

        // 2. MyMemory Fallback
        try {
            const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|' + shortLang;
            const resp = await fetch(url);
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.responseData && data.responseData.translatedText) {
                    let trans = data.responseData.translatedText.trim();
                    if (!isGarbageTranslation(trans, targetLang)) {
                        if (shortLang === 'bn') trans = cleanBengaliUnicode(trans);
                        setCachedVerseTranslation(text, targetLang, trans);
                        return trans;
                    }
                }
            }
        } catch(e) {}

        return text;
    })().finally(() => {
        inFlightTranslations.delete(flightKey);
    });

    inFlightTranslations.set(flightKey, task);
    return task;
}
function applyDynamicVerseTranslation(domElement, rawText, lang = currentAppLanguage, highlightTerms = null) {
    if (!domElement || !rawText) return;
    
    const applyHighlight = (txt) => {
        if (!highlightTerms || highlightTerms.length === 0) return txt;
        return highlightSearchTerms(txt, highlightTerms);
    };

    const baseLang = getAppBaseLanguage(lang);
    if (baseLang === 'en') {
        const existingActions = domElement.querySelector('.verse-actions');
        domElement.innerHTML = applyHighlight(rawText);
        if (existingActions) domElement.appendChild(existingActions);
        domElement.style.opacity = '1';
        return;
    }
    
    // 1. Instant Dictionary Match
    if (typeof t === 'function') {
        const dictTrans = t(rawText, lang);
        if (dictTrans && dictTrans.toLowerCase() !== rawText.toLowerCase()) {
            const existingActions = domElement.querySelector('.verse-actions');
            domElement.innerHTML = applyHighlight(dictTrans);
            if (existingActions) domElement.appendChild(existingActions);
            domElement.style.opacity = '1';
            return;
        }
    }
    
    // 2. If rawText already contains target language script, render directly
    if ((baseLang === 'bn' && /[\u0980-\u09FF]/.test(rawText)) ||
        (baseLang === 'ar' && /[\u0600-\u06FF]/.test(rawText)) ||
        (baseLang === 'he' && /[\u0590-\u05FF]/.test(rawText))) {
        const existingActions = domElement.querySelector('.verse-actions');
        domElement.innerHTML = applyHighlight(rawText);
        if (existingActions) domElement.appendChild(existingActions);
        domElement.style.opacity = '1';
        return;
    }
    
    // 3. Memory & Disk Cache Lookup
    const cached = getCachedVerseTranslation(rawText, lang) || getCachedVerseTranslation(rawText, baseLang);
    if (cached && !isGarbageTranslation(cached, lang)) {
        const existingActions = domElement.querySelector('.verse-actions');
        domElement.innerHTML = applyHighlight(cached);
        if (existingActions) domElement.appendChild(existingActions);
        domElement.style.opacity = '1';
        return;
    }
    
    // 4. Render text with subtle opacity during background neural translation
    const existingActions = domElement.querySelector('.verse-actions');
    domElement.innerHTML = applyHighlight(rawText);
    if (existingActions) domElement.appendChild(existingActions);
    domElement.style.transition = 'opacity 0.25s ease';
    domElement.style.opacity = '0.7';
    
    translateTextAsync(rawText, lang).then(translated => {
        if (domElement) {
            const finalTxt = (translated && !isGarbageTranslation(translated, lang)) ? translated : rawText;
            const actions = domElement.querySelector('.verse-actions');
            domElement.innerHTML = applyHighlight(finalTxt);
            if (actions) domElement.appendChild(actions);
            domElement.style.opacity = '1';
        }
    }).catch(() => {
        if (domElement) {
            const actions = domElement.querySelector('.verse-actions');
            domElement.innerHTML = applyHighlight(rawText);
            if (actions) domElement.appendChild(actions);
            domElement.style.opacity = '1';
        }
    });
}

let currentAppLanguage = localStorage.getItem('versefeed_user_language') || 'en_US';

function getAppBaseLanguage(lang = currentAppLanguage) {
    if (!lang) return 'en';
    return lang.split('_')[0].split('-')[0].toLowerCase();
}

function t(key, lang = currentAppLanguage) {
    if (!key || typeof key !== 'string') return key || '';
    const baseLang = getAppBaseLanguage(lang);
    if (baseLang === 'en') return key;
    
    // 1. Exact or Base Language Dictionary Match
    if (typeof i18nDict !== 'undefined') {
        const cleanKey = key.trim();
        if (i18nDict[cleanKey]) {
            if (i18nDict[cleanKey][lang]) return i18nDict[cleanKey][lang];
            if (i18nDict[cleanKey][baseLang]) return i18nDict[cleanKey][baseLang];
        }
        // Case-insensitive dictionary lookup
        const lower = cleanKey.toLowerCase();
        for (let k in i18nDict) {
            if (k.toLowerCase() === lower) {
                if (i18nDict[k][lang]) return i18nDict[k][lang];
                if (i18nDict[k][baseLang]) return i18nDict[k][baseLang];
            }
        }
    }
    
    // 2. Cache Lookup
    const cached = getCachedVerseTranslation(key, lang) || getCachedVerseTranslation(key, baseLang);
    if (cached && !isGarbageTranslation(cached, lang)) {
        return cached;
    }
    
    return key;
}

function getCanonicalReligion(str) {
    if (!str) return '';
    const trimmed = str.trim();
    if (CANONICAL_RELIGIONS.includes(trimmed)) return trimmed;
    if (typeof i18nDict !== 'undefined') {
        for (let canon of CANONICAL_RELIGIONS) {
            if (i18nDict[canon]) {
                for (let lang in i18nDict[canon]) {
                    if (i18nDict[canon][lang] === trimmed) return canon;
                }
            }
        }
    }
    return trimmed;
}

function applyLanguageTranslations(langCode = currentAppLanguage) {
    currentAppLanguage = langCode;
    
    // 1. Update Settings Religion Toggle Buttons
    document.querySelectorAll('.global-rel-btn').forEach(btn => {
        if (btn.id === 'dark-mode-toggle' || btn.id === 'language-toggle-btn' || btn.getAttribute('onclick')?.includes('openLanguageModal')) return;
        const canonicalRel = btn.dataset.religion || getCanonicalReligion(btn.textContent);
        if (canonicalRel) {
            btn.dataset.religion = canonicalRel;
            btn.textContent = t(canonicalRel);
        }
    });

    // 2. Update Settings Language Button Label (Display in authentic native script)
    const selectedLangObj = supportedLanguages.find(l => l.code === langCode) || 
                            supportedLanguages.find(l => getAppBaseLanguage(l.code) === getAppBaseLanguage(langCode)) || 
                            supportedLanguages[0];
    const settingsBtn = document.getElementById('language-toggle-btn');
    if (settingsBtn && selectedLangObj) {
        settingsBtn.innerHTML = `<span id="settings-current-lang-label">${selectedLangObj.native || selectedLangObj.name}</span>`;
    }

    // 3. Update Settings Links
    const privLink = document.getElementById('link-privacy-policy');
    if (privLink) privLink.textContent = t('Privacy Policy');
    const termsLink = document.getElementById('link-terms-service');
    if (termsLink) termsLink.textContent = t('Terms of Service');
    const credLink = document.getElementById('link-credits-modal');
    if (credLink) credLink.textContent = t('Credits');

    // 4. Update Premium Buttons & Paywall
    const premBtn = document.getElementById('user-premium-btn');
    if (premBtn) premBtn.textContent = t('Premium');
    
    const paywallTitle = document.querySelector('.premium-title');
    if (paywallTitle) paywallTitle.textContent = t('Premium');
    
    const paywallFeatures = document.querySelectorAll('.premium-feature-row span');
    const featureKeys = ['AD Free', 'All HD Offline Voices', 'Unlimited Folders 30 Char', 'Custom Topic Filters', 'Source Narration', 'Ambient Audio Controls', 'Random Voice Rotation'];
    paywallFeatures.forEach((span, idx) => {
        if (featureKeys[idx]) span.textContent = t(featureKeys[idx]);
    });

    const paywallBuyBtn = document.querySelector('.premium-buy-pill-text');
    if (paywallBuyBtn) paywallBuyBtn.textContent = t('Get Annual');

    // 5. Update Onboarding Screen
    const onboardWelcomeH2 = document.querySelector('#onboard-welcome h2');
    if (onboardWelcomeH2) onboardWelcomeH2.textContent = t('Spiritual Wisdom');
    const onboardWelcomeP = document.querySelector('#onboard-welcome p');
    if (onboardWelcomeP) onboardWelcomeP.textContent = t('Access scriptures, curated ambient tracks, and personalized daily verses.');
    const googleBtnSpan = document.querySelector('#google-signin-btn-container button span');
    if (googleBtnSpan) googleBtnSpan.textContent = t('Sign in with Google');
    const guestBtn = document.querySelector('button[onclick="continueAsGuest()"]');
    if (guestBtn) guestBtn.textContent = t('Continue as Guest');

    // 6. Update Modals (Auth, Folder Creation, Rename, Language)
    const authTabSignin = document.getElementById('auth-tab-signin');
    if (authTabSignin) authTabSignin.textContent = t('Sign In');
    const authTabSignup = document.getElementById('auth-tab-signup');
    if (authTabSignup) authTabSignup.textContent = t('Sign Up');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    if (authSubmitBtn && authSubmitBtn.textContent.includes('Sign')) {
        authSubmitBtn.textContent = t('Sign In');
    }

    const createAlbumInput = document.getElementById('create-album-name');
    if (createAlbumInput) createAlbumInput.placeholder = t('Folder Name');
    const createAlbumBtn = document.querySelector('#create-bookmark-modal .album-create-btn');
    if (createAlbumBtn) createAlbumBtn.textContent = t('Create Folder');

    const renameAlbumInput = document.getElementById('rename-album-input');
    if (renameAlbumInput) renameAlbumInput.placeholder = t('New Name');
    const renameAlbumBtn = document.querySelector('#rename-modal .album-create-btn');
    if (renameAlbumBtn) renameAlbumBtn.textContent = t('Rename');

    const langModalTitle = document.querySelector('#language-modal .modal-content h3');
    if (langModalTitle) langModalTitle.textContent = t('Choose Language');
    const langSearch = document.getElementById('lang-search-input');
    if (langSearch) langSearch.placeholder = t('Search language...');

    // 7. Update Search Placeholder
    const libSearchInput = document.getElementById('lib-search-input');
    if (libSearchInput) {
        libSearchInput.placeholder = t('Search verses or authors...');
    }

    // 8. Re-render Active Feed Card, Library, and Saved Screens in chosen language
    if (typeof renderFeedCard === 'function' && typeof currentVerseIndex !== 'undefined') {
        renderFeedCard(currentVerseIndex.general || 0);
    }
    if (typeof showReligions === 'function' && document.getElementById('library-home') && !document.getElementById('library-home').classList.contains('hidden')) {
        showReligions();
    }
    if (typeof showSavedVerses === 'function' && document.getElementById('saved-verses') && !document.getElementById('saved-verses').classList.contains('hidden')) {
        showSavedVerses(true);
    }
    if (typeof buildSettings === 'function') buildSettings();
    loadedReligions.clear();
    loadSelectedData();
    preloadFunnyLines(langCode);
}

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

    let curVol = parseFloat(localStorage.getItem('musicVolume') || '0.5');
    if (isNaN(curVol)) curVol = 0.5;
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
let cachedVisualizerRgb = '238, 204, 180';
let cachedGradLayers = [];
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
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
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
    try {
        initLanguageSettings();
        initVisualizerWorker();
        checkForAppUpdates();
        updateUserUI();
        switchProfile(getActiveProfileId());
        applyAutoSpeed(selectedVoice);
        applyRandomPremiumAngle();
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
        let initialVol = 0.5;
        let savedVol = localStorage.getItem('musicVolume');
        if (savedVol !== null && savedVol !== '1' && savedVol !== '1.0') {
            initialVol = parseFloat(savedVol);
            if (isNaN(initialVol)) initialVol = 0.5;
        } else {
            initialVol = 0.5;
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
                // Autoplay blocked by WebView policy, will resume on first touch
            });

            const playOnFirstInteraction = () => {
                const ctx = getAudioContext();
                if (ctx && ctx.state === 'suspended') {
                    ctx.resume().catch(() => {});
                }
                if (localStorage.getItem('musicEnabled') !== 'false' && audio) {
                    safePlayAudio(audio).then(() => {
                        const btn = document.getElementById('music-toggle');
                        if (btn) btn.classList.add('active');
                    }).catch(err => {});
                }
                document.removeEventListener('click', playOnFirstInteraction);
                document.removeEventListener('pointerdown', playOnFirstInteraction);
                document.removeEventListener('touchstart', playOnFirstInteraction);
                document.removeEventListener('scroll', playOnFirstInteraction);
            };
            document.addEventListener('click', playOnFirstInteraction, { passive: true });
            document.addEventListener('pointerdown', playOnFirstInteraction, { passive: true });
            document.addEventListener('touchstart', playOnFirstInteraction, { passive: true });
            document.addEventListener('scroll', playOnFirstInteraction, { passive: true });
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
                const stage = document.getElementById('feed-stage');
                if (stage && !stage.querySelector('.card-center')) {
                    initializeVerseFeed(true);
                }
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

                // Voice initializes on-demand when user clicks Speak button to keep startup at 60fps

                try {
                    initLanguageSettings();
                } catch(e) {
                    console.warn("Language settings init:", e);
                }
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

let isDraggingFeed = false;
let feedTouchStartX = 0;
let feedTouchStartY = 0;
let feedCurrentDeltaX = 0;
let feedIsHorizontalGesture = false;

function setupGestures() {
    const feedStage = document.getElementById('feed-stage');
    if (!feedStage) return;

    feedStage.addEventListener('touchstart', e => {
        if (!appLoaded) return;
        const activeModal = document.querySelector('.modal-overlay:not(.hidden)');
        if (activeModal) return;
        if (e.target.closest && (e.target.closest('.bookmark-btn') || e.target.closest('.speak-btn') || e.target.closest('.modal-overlay'))) return;

        if (e.touches && e.touches[0]) {
            isDraggingFeed = true;
            feedIsHorizontalGesture = false;
            feedTouchStartX = e.touches[0].clientX;
            feedTouchStartY = e.touches[0].clientY;
            feedCurrentDeltaX = 0;
            touchStartTarget = e.target;
        }
    }, { passive: true });

    feedStage.addEventListener('touchmove', e => {
        if (!isDraggingFeed || !e.touches || !e.touches[0]) return;
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - feedTouchStartX;
        const diffY = currentY - feedTouchStartY;

        if (!feedIsHorizontalGesture) {
            if (Math.abs(diffX) > 6 && Math.abs(diffX) > Math.abs(diffY)) {
                feedIsHorizontalGesture = true;
            } else if (Math.abs(diffY) > 8) {
                isDraggingFeed = false;
                return;
            }
        }

        if (feedIsHorizontalGesture) {
            feedCurrentDeltaX = diffX;
            const currentCard = feedStage.querySelector('.verse-card.card-center');
            if (currentCard) {
                currentCard.style.transition = 'none';
                const scale = Math.max(0.92, 1 - (Math.abs(diffX) / window.innerWidth) * 0.08);
                currentCard.style.transform = `translateX(${diffX}px) scale(${scale})`;
            }
        }
    }, { passive: true });

    feedStage.addEventListener('touchend', e => {
        if (!isDraggingFeed) return;
        isDraggingFeed = false;

        const currentCard = feedStage.querySelector('.verse-card.card-center');
        if (feedIsHorizontalGesture && currentCard) {
            currentCard.style.transition = 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.28s ease';
            if (feedCurrentDeltaX < -60) {
                lastSwipeTime = Date.now();
                nextCard();
            } else if (feedCurrentDeltaX > 60 && currentVerseIndex.general > 0) {
                lastSwipeTime = Date.now();
                prevCard();
            } else {
                currentCard.style.transform = 'translateX(0) scale(1)';
            }
        }
        feedIsHorizontalGesture = false;
        feedCurrentDeltaX = 0;
    }, { passive: true });

    feedStage.addEventListener('click', (e) => {
        if (!appLoaded) return;
        if (Date.now() - lastSwipeTime < 500) return;
        if (e.target.closest('.bookmark-btn') || e.target.closest('.speak-btn') || e.target.closest('.card-peek-left') || e.target.closest('.card-peek-right')) return;
        
        const width = window.innerWidth;
        const clickX = e.clientX;
        const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
        if (!isFeed) return;
        
        if (clickX < width * 0.3) {
            prevCard();
            return;
        }
        if (clickX > width * 0.7) {
            nextCard();
            return;
        }

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

function handleGesture() {}
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
    
    let displayMsg = "Installing voice...";
    if (typeof percent === 'number' && percent >= 100) {
        displayMsg = "Voice ready";
    } else if (typeof msg === 'string' && msg.toLowerCase().includes('ready')) {
        displayMsg = "Voice ready";
    }
    
    msgEl.textContent = displayMsg;
    if (actionBtn) actionBtn.style.display = 'none';
    
    if (progressEl) {
        if (typeof percent === 'number') {
            progressEl.style.transition = 'transform 0.2s ease-out';
            const frac = Math.max(0.04, Math.min(1, percent / 100));
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
                }, 250);
            }
        }, 1200);
    }
}

function hideVoiceToast() {
    if (piperInitializing) return; // Do not hide toast while actively installing voice
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
    if (piperSession && piperSession.voiceId === voiceId && piperInitPromise) return piperInitPromise;
    
    piperInitPromise = (async () => {
        piperInitializing = true;
        
        try {
            const isInstalled = localStorage.getItem('piper_voice_installed_' + voiceId) === 'true';
            let maxPercent = 5;
            if (!isInstalled) {
                showVoiceInstallingToast("Installing voice...", maxPercent);
            }
            
            const tts = await import("./libs/piper/piper-bundle.js?v=20");
            if (tts.TtsSession._instance) {
                tts.TtsSession._instance = null; // Force reload of ONNX model
            }
            console.log("Loading Piper TTS voice:", voiceId);
            const wasmBase = new URL('libs/piper/', window.location.href).href;
            
            let lastProgressUpdate = 0;
            const newSession = await tts.TtsSession.create({
                voiceId: voiceId,
                wasmPaths: {
                    onnxWasm: wasmBase,
                    piperData: wasmBase + "piper_phonemize.data",
                    piperWasm: wasmBase + "piper_phonemize.wasm"
                },
                progress: (p) => {
                    if (p && p.loaded) {
                        const now = Date.now();
                        if (now - lastProgressUpdate < 500) return; // Throttle to every 500ms
                        lastProgressUpdate = now;
                        const totalBytes = (p.total && p.total > 0) ? p.total : (62 * 1024 * 1024);
                        const pct = Math.round((p.loaded / totalBytes) * 100);
                        if (!isInstalled) {
                            maxPercent = Math.max(maxPercent, Math.min(98, pct));
                            showVoiceInstallingToast("Installing voice...", maxPercent);
                        }
                    }
                }
            });
            localStorage.setItem('piper_voice_installed_' + voiceId, 'true');
            piperInitializing = false;
            if (!isInstalled) {
                showVoiceInstallingToast("Voice ready", 100);
            } else {
                hideVoiceToast();
            }
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
            piperInitializing = false;
            hideVoiceToast();
            throw e;
        }
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
            stopWaveformVisualizer(false);
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

    // Convert all-caps words (like GOD, LORD, ALLAH, HEAVEN) to Titlecase so phonemizer reads them as words, but protect |PAUSE|
    sanitizedText = sanitizedText.replace(/\b[A-Z]{2,}\b/g, (match) => {
        if (match.toUpperCase() === 'PAUSE') return 'PAUSE';
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
        const fallbackText = sanitizedText.replace(/\|PAUSE\|/gi, '... ');
        currentUtterance = new SpeechSynthesisUtterance(fallbackText);
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
                stopWaveformVisualizer(false);
            }

            clearTimeout(autoNextTimeout);
            autoNextTimeout = setTimeout(() => {
                if (currentContext === 'feed' && wasAutoMode) nextCard(true);
                else if (currentContext === 'book' && autoNextBook) advanceBookVerse();
                else if (currentContext === 'saved' && wasAutoMode) advanceSavedVerse();
                else if (currentContext === 'search' && wasAutoMode) advanceSearchVerse();
                else {
                    if (!isSpeaking) stopWaveformVisualizer(false);
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

    // Split text into sentence chunks and pause markers
    let chunks = sanitizedText.split(/([.!?,;:]+[\s]+|\|PAUSE\|\s*)/i).filter(Boolean);
    let combinedChunks = [];
    let tempChunk = "";
    for(let i = 0; i < chunks.length; i++) {
        tempChunk += chunks[i];
        if (chunks[i].match(/[.!?,;:]+[\s]+/i) || chunks[i].match(/\|PAUSE\|/i)) {
            let ch = tempChunk.replace(/\|PAUSE\|/gi, '').trim();
            if (ch) combinedChunks.push(ch);
            if (chunks[i].match(/\|PAUSE\|/i)) combinedChunks.push("|PAUSE|");
            tempChunk = "";
        }
    }
    if (tempChunk.trim()) {
        let ch = tempChunk.replace(/\|PAUSE\|/gi, '').trim();
        if (ch) combinedChunks.push(ch);
    }
    if (combinedChunks.length === 0) combinedChunks = [sanitizedText.replace(/\|PAUSE\|/gi, '')];

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
    let playbackStarted = false;
    
    for (let i = 0; i < chunks.length; i++) {
        if (generationId !== currentGenerationId) break;
        
        // Yield to let browser paint animation frames BEFORE heavy work
        await new Promise(r => requestAnimationFrame(r));
        if (generationId !== currentGenerationId) break;
        
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();

            if (chunks[i] === "|PAUSE|") {
                const sampleRate = ctx.sampleRate || 22050;
                const pauseFrames = Math.floor(sampleRate * 0.8);
                const pauseBuffer = ctx.createBuffer(1, pauseFrames, sampleRate);
                audioChunkQueue.push(pauseBuffer);
                continue;
            }

            const wavBlob = await piperSession.predict(chunks[i]);
            if (generationId !== currentGenerationId) break;

            // Yield AFTER predict so browser can paint frames between heavy CPU blocks
            await new Promise(r => setTimeout(r, 1));
            if (generationId !== currentGenerationId) break;

            const arrayBuffer = await wavBlob.arrayBuffer();
            const decodedData = await ctx.decodeAudioData(arrayBuffer);
            
            if (generationId !== currentGenerationId) break;

            const sampleRate = decodedData.sampleRate;
            const paddingFrames = Math.floor(sampleRate * 0.2);
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
            
            // START PLAYBACK IMMEDIATELY after the first chunk is ready
            // Don't wait for all chunks — remaining chunks generate while audio plays
            if (!playbackStarted && generationId === currentGenerationId) {
                playbackStarted = true;
                isGenerating = false;
                const btn = document.getElementById('speak-general');
                if (btn) btn.classList.remove('loading');
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
    // If playback never started (e.g. single chunk edge case), start it now
    if (!playbackStarted && generationId === currentGenerationId && audioChunkQueue.length > 0) {
        isGenerating = false;
        const btn = document.getElementById('speak-general');
        if (btn) btn.classList.remove('loading');
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
                stopWaveformVisualizer(false);
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
                    if (!isSpeaking) stopWaveformVisualizer(false);
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
    if (now - lastSpeakClick < 120) return; // Snappy debounce
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
        // Immediate user cancellation if tapped while generating/loading
        stopAudio(true);
        isGenerating = false;
        isSpeaking = false;
        isPaused = false;
        updateSpeakIcons();
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
            stopWaveformVisualizer(false);
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
    }, 50);
}
// --- Data Loading & Processing ---

function getReligionDataUrls(rel) {
    if (rel === 'Islam') {
        const quranFile = (currentAppLanguage === 'bn') ? './data/quran_bn.json?v=35' : './data/quran_v2.json?v=21';
        return [quranFile, './data/hadiths_v2.json?v=21'];
    }
    if (rel === 'Christianity') {
        const bibleFile = (currentAppLanguage === 'bn') ? './data/bible_bn.json?v=35' : './data/bible.json?v=21';
        return [bibleFile];
    }
    return dataUrls[rel];
}

async function loadReligionData(rel) {
    if (loadedReligions.has(rel)) return;
    try {
        const urls = getReligionDataUrls(rel);
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
    
    // Fast-path: Load primary religion first so the first card renders in <80ms
    const primaryRel = globalSelectedRels[0] || 'Christianity';
    await loadReligionData(primaryRel);
    
    // Immediately ensure feed card exists
    if (typeof initializeVerseFeed === 'function') {
        initializeVerseFeed();
    }
    
    // Gently load remaining selected religions ONE AT A TIME with delays so UI stays silky smooth at 60fps
    const remainingRels = globalSelectedRels.filter(r => r !== primaryRel);
    if (remainingRels.length > 0) {
        setTimeout(async () => {
            for (const rel of remainingRels) {
                if (!loadedReligions.has(rel)) {
                    await loadReligionData(rel);
                    await new Promise(r => setTimeout(r, 400)); // Yield thread so user gestures are zero-lag
                }
            }
            if (typeof buildSettings === 'function') buildSettings();
        }, 1500);
    }
}
async function loadUnselectedDataInBackground() {
    // Lazy loaded on demand when user accesses unselected books or changes settings
}

function toHebrewNumeral(num) {
    const n = parseInt(num, 10);
    if (isNaN(n) || n <= 0) return String(num);
    
    const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const hundreds = ['', 'ק', 'ר', 'ש', 'ת'];

    let thousands = Math.floor(n / 1000);
    let remThousands = n % 1000;
    
    let th_str = '';
    if (thousands > 0) {
        if (thousands < 10) {
            th_str = units[thousands] + "\'";
        } else {
            th_str = toHebrewNumeral(thousands) + "\'";
        }
    }
    
    let h = Math.floor(remThousands / 100);
    let rem = remThousands % 100;
    
    let t_str = '';
    if (rem === 15) {
        t_str = 'טו';
    } else if (rem === 16) {
        t_str = 'טז';
    } else {
        let t = Math.floor(rem / 10);
        let u = rem % 10;
        t_str = tens[t] + units[u];
    }
    
    let h_str = '';
    while (h > 4) {
        h_str += 'ת';
        h -= 4;
    }
    if (h > 0) {
        h_str += hundreds[h];
    }
    
    return th_str + h_str + t_str;
}

function localizeDigits(str, lang = currentAppLanguage) {
    if (!str && str !== 0) return '';
    const s = String(str);
    const baseLang = (lang || currentAppLanguage || '').split('_')[0].split('-')[0].toLowerCase();
    
    if (baseLang === 'he') {
        return s.replace(/[0-9]+/g, match => toHebrewNumeral(match));
    }
    
    const digitMaps = {
        'zh': ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
        'ja': ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
        'ko': ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'],
        'bn': ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'],
        'as': ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'],
        'ar': ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'],
        'hi': ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'],
        'mr': ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'],
        'ne': ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'],
        'sa': ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'],
        'ur': ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
        'fa': ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
        'ps': ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
        'pa': ['੦', '੧', '੨', '੩', '੪', '੫', '੬', '੭', '੮', '੯'],
        'gu': ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'],
        'ta': ['௦', '௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯'],
        'te': ['౦', '౧', '౨', '౩', '౪', '౫', '౬', '౭', '౮', '౯'],
        'kn': ['೦', '೧', '೨', '೩', '೪', '೫', '೬', '೭', '೮', '೯'],
        'ml': ['൦', '൧', '൨', '൩', '൪', '൫', '൬', '൭', '൮', '൯'],
        'or': ['୦', '୧', '୨', '୩', '୪', '୫', '୬', '୭', '୮', '୯'],
        'th': ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'],
        'lo': ['໐', '໑', '໒', '໓', '໔', '໕', '໖', '໗', '໘', '໙'],
        'my': ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'],
        'km': ['០', '១', '២', '៣', '۴', '៥', '៦', '៧', '៨', '៩'],
        'bo': ['༠', '༡', '༢', '༣', '༤', '༥', '༦', '༧', '༨', '༩']
    };
    
    const map = digitMaps[baseLang];
    if (!map) return s;
    return s.replace(/[0-9]/g, d => map[parseInt(d, 10)]);
}

function formatVerseRef(v) {
    if (!v) return '';
    const rawBook = v.book || v.religion || '';
    const chap = (v.chapter !== undefined && v.chapter !== null) ? String(v.chapter) : '';
    const verse = (v.verse !== undefined && v.verse !== null) ? String(v.verse) : '';
    
    let chapPart = (chap !== '' && chap !== null && chap !== undefined) ? ' ' + chap : '';
    let versePart = (verse !== '' && verse !== null && verse !== undefined) ? (chapPart ? ':' + verse : ' ' + verse) : '';
    
    // Auto-detect and translate textual words in chapter/structure label
    if (currentAppLanguage !== 'en_US' && currentAppLanguage !== 'en') {
        const words = chapPart.split(/(\s+|:)/);
        chapPart = words.map(w => {
            const clean = w.trim();
            if (!clean || !/[a-zA-Z]/.test(clean)) return w;
            if (typeof t === 'function') {
                const tw = t(clean);
                if (tw && tw.toLowerCase() !== clean.toLowerCase()) return tw;
            }
            const cached = getCachedVerseTranslation(clean, currentAppLanguage);
            if (cached && !isGarbageTranslation(cached, currentAppLanguage)) return cached;
            return w;
        }).join('');
    }

    // Universal Native Digit Localization (Hebrew Gematria, Arabic, Bengali, Hindi, Urdu, etc.)
    chapPart = localizeDigits(chapPart, currentAppLanguage);
    versePart = localizeDigits(versePart, currentAppLanguage);
    
    // Localize Book Name through universal dictionary & cache
    let localizedBook = rawBook;
    if (typeof t === "function") {
        localizedBook = t(rawBook);
    }
    if (currentAppLanguage !== 'en_US' && currentAppLanguage !== 'en') {
        const cachedBook = getCachedVerseTranslation(rawBook, currentAppLanguage);
        if (cachedBook && !isGarbageTranslation(cachedBook, currentAppLanguage)) {
            localizedBook = cachedBook;
        }
    }
    
    return `${localizedBook}${chapPart}${versePart}`.trim();
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
    let islamVerses = [];
    let quranChapters = {};
    const isArabic = (currentAppLanguage === 'ar');
    
    quran.forEach(surah => {
        let verses = {};
        surah.verses.forEach(v => {
            const raw = (isArabic && v.text) ? v.text : (v.translation || v.text || '');
            const cleaned = isArabic ? raw.trim() : cleanText(raw);
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

    allHadiths.forEach(h => {
        const collection = h.source;
        if (!hadithCollections[collection]) {
            hadithCollections[collection] = { chapters: {}, chapterOrder: [] };
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

            const chapter = (h.chapter_no || 1).toString();
            const verseStr = (h.hadith_no || 1).toString();

            if (!hadithCollections[collection].chapters[chapter]) {
                hadithCollections[collection].chapters[chapter] = {};
                hadithCollections[collection].chapterOrder.push(chapter);
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
        islamBooks.push({ 
            name: collection, 
            content: hadithCollections[collection].chapters,
            chapterOrder: hadithCollections[collection].chapterOrder,
            isNested: false
        });
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
                        book: bookName,
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
    let seenVerseTexts = new Set();
    
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
                    const norm = text.trim().toLowerCase();
                    if (!seenVerseTexts.has(norm)) {
                        seenVerseTexts.add(norm);
                        verses.push({ text: text, religion: relName, book: bookName, chapter: chapterName, verse: verseNum });
                    }
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
    setTimeout(() => {
        initPiper(selectedVoice).catch(err => console.log("Background voice pre-install:", err));
    }, 200);
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
    setTimeout(() => {
        initPiper(selectedVoice).catch(err => console.log("Background voice pre-install:", err));
    }, 200);
}

function buildSettings() {
    suppressFlash(() => {
        applyRandomPremiumAngle();
        if (!isPremiumUser || !globalSelectedRels || !Array.isArray(globalSelectedRels) || globalSelectedRels.length === 0) {
            globalSelectedRels = [...religions];
            localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
        }
        document.querySelectorAll('.global-rel-btn').forEach(btn => {
            if (btn.id === 'dark-mode-toggle' || btn.id === 'language-toggle-btn' || btn.getAttribute('onclick')?.includes('openLanguageModal')) return;
            const canonicalRel = btn.dataset.religion || getCanonicalReligion(btn.textContent);
            if (canonicalRel) {
                btn.dataset.religion = canonicalRel;
                if (typeof t === 'function') {
                    btn.textContent = t(canonicalRel);
                }
            }
            if (globalSelectedRels.includes(canonicalRel)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Always sync the language button with currentAppLanguage
        const currentLangObj = supportedLanguages.find(l => l.code === currentAppLanguage) || 
                               supportedLanguages.find(l => getAppBaseLanguage(l.code) === getAppBaseLanguage(currentAppLanguage)) || 
                               supportedLanguages[0];
        const langBtn = document.getElementById('language-toggle-btn');
        if (langBtn && currentLangObj) {
            langBtn.innerHTML = `<span id="settings-current-lang-label">${currentLangObj.native || currentLangObj.name}</span>`;
        }
    });
}
async function toggleGlobalReligion(rawRel) {
    const rel = getCanonicalReligion(rawRel);
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

function preloadUpcomingVerses(currentIndex = currentVerseIndex.general || 0) {
    // Keep at least 25 verses generated ahead in the pool
    const targetAhead = currentIndex + 25;
    while (verseBatches.general.length < targetAhead) {
        const lastRels = verseBatches.general.length >= 2 ? 
            [verseBatches.general[verseBatches.general.length - 2].religion, verseBatches.general[verseBatches.general.length - 1].religion] : 
            [];
        const newBatch = generateBatch('general', lastRels);
        if (newBatch.length === 0) break;
        pushVersesWithAdCheck(newBatch);
    }

    // Pre-translate upcoming 1 card gently ahead in the background (prevents network and thread lag)
    if (currentAppLanguage !== 'en_US' && currentAppLanguage !== 'en') {
        const nextIdx = currentIndex + 1;
        if (nextIdx < verseBatches.general.length) {
            const v = verseBatches.general[nextIdx];
            if (v && v.text && !getCachedVerseTranslation(v.text, currentAppLanguage)) {
                translateTextAsync(v.text, currentAppLanguage);
            }
        }
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
    let newBatch = generateBatch('general', []);
    if (newBatch.length === 0) {
        // Fallback: pick any loaded verse from any religion pool
        for (let rel of religions) {
            if (religionVerses[rel] && religionVerses[rel].length > 0) {
                newBatch = religionVerses[rel].slice(0, 10);
                break;
            }
        }
    }
    if (newBatch.length === 0) {
        newBatch = [{
            id: 'starter_verse_1',
            text: 'Peace comes from within. Do not seek it without.',
            religion: 'Buddhism',
            book: 'Dhammapada',
            chapter: '1',
            verse: '1'
        }];
    }
    pushVersesWithAdCheck(newBatch);
    renderFeedCard(0);
    preloadUpcomingVerses(0);
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
    const batch = slots.map(r => {
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

    // Verses are translated on-demand or in gentle 1-ahead preload to maintain buttery 60fps
    return batch;
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
    "Look at you, scrolling like you don't have 14 unanswered emails and a pile of laundry.",
    "I know you hate this ad. I hate this ad. Tap the button and we can both pretend it never happened.",
    "You’ve spent more on an iced coffee you didn't even finish. Just saying.",
    "Look, we both hate ads. Just tap the button and let's never speak of this again.",
    "Ad-free apps hit different when you don't have to look at someone trying to sell you car insurance.",
    "Upgrade to Premium so I can finally afford real groceries instead of instant noodles.",
    "You're still scrolling? Might as well remove the ads so we can stop making awkward eye contact.",
    "Tap to remove ads before your phone battery dies from sheer procrastination.",
    "I spent months writing this code just for an ad to ruin the mood. Tap to end its career.",
    "Imagine an app without ads interrupting your scroll. Crazy concept, I know.",
    "Your thumb has scrolled about three miles today. Reward it with zero ads.",
    "I'm a real human typing this in dark mode at 3 AM, not a corporate marketing bot. Buy Premium.",
    "Tired of ads? Same here. The button is right below. Do what you must.",
    "If you buy Premium, I promise to tell my mom someone actually paid for my app.",
    "Nothing says 'I have my life together' quite like an app with zero ads.",
    "This ad is only here because servers cost real money. Tragic, really. Tap to dismiss it forever.",
    "You could close the app right now, or you could tap Remove Ads and be an absolute legend.",
    "Statistically speaking, 100% of people who buy Premium are significantly cooler. Don't fact-check that.",
    "Another ad? Disgusting. Unacceptable. Tap below and stop the disrespect.",
    "Think of Premium as a small investment in your screen time addiction.",
    "Swipe past me all you want, but deep down you know you want that clean ad-free screen.",
    "Do you really want someone looking over your shoulder to see an ad on your screen?",
    "Support a tired indie dev who just wants to pay rent without spamming popups in your face.",
    "I could write a 500-word sales pitch, but let's be honest: you just want the ads gone.",
    "Tap Remove Ads. Treat yourself. You survived this entire week."
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

function preloadFunnyLines(lang = currentAppLanguage) {
    if (!lang || lang === 'en_US' || lang === 'en') return;
    // Only preload the first 2 funny lines gently in background, not all 25 at once
    const sample = premiumFunnyLines.slice(0, 2);
    sample.forEach(line => {
        if (line && !getCachedVerseTranslation(line, lang)) {
            translateTextAsync(line, lang);
        }
    });
}


function applyDynamicRefTranslation(refEl, verse) {
    if (!refEl || !verse) return;
    const baseLang = getAppBaseLanguage(currentAppLanguage);
    const textNow = formatVerseRef(verse);
    refEl.textContent = textNow;

    if (baseLang === 'en') {
        refEl.style.opacity = '1';
        return;
    }

    // Automatic English Detection: If English letters remain, grey out while neural engine translates
    if (/[a-zA-Z]{2,}/.test(textNow)) {
        refEl.style.opacity = '0.35'; // Grey out while translating just like verse body
        const rawBook = verse.book || verse.religion || '';
        const chap = (verse.chapter !== undefined && verse.chapter !== null) ? String(verse.chapter) : '';
        
        const tasks = [];
        if (/[a-zA-Z]/.test(rawBook)) {
            tasks.push(translateTextAsync(rawBook, currentAppLanguage).then(trans => {
                if (trans && trans.toLowerCase() !== rawBook.toLowerCase()) {
                    setCachedVerseTranslation(rawBook, currentAppLanguage, trans);
                    if (typeof i18nDict !== 'undefined') {
                        if (!i18nDict[rawBook]) i18nDict[rawBook] = {};
                        i18nDict[rawBook][baseLang] = trans;
                    }
                }
            }));
        }
        
        if (/[a-zA-Z]/.test(chap)) {
            const chapWords = chap.split(/[^a-zA-Z]+/).filter(w => w.length > 1);
            chapWords.forEach(w => {
                tasks.push(translateTextAsync(w, currentAppLanguage).then(trans => {
                    if (trans && trans.toLowerCase() !== w.toLowerCase()) {
                        setCachedVerseTranslation(w, currentAppLanguage, trans);
                        if (typeof i18nDict !== 'undefined') {
                            if (!i18nDict[w]) i18nDict[w] = {};
                            i18nDict[w][baseLang] = trans;
                        }
                    }
                }));
            });
        }
        
        Promise.all(tasks).then(() => {
            if (refEl) {
                refEl.textContent = formatVerseRef(verse);
                refEl.style.opacity = '1';
            }
        }).catch(() => {
            if (refEl) refEl.style.opacity = '1';
        });
    } else {
        refEl.style.opacity = '1';
    }
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
        card.style.position = 'relative';

        // Top-Left subtle "Sponsored" tag
        const tagEl = document.createElement('span');
        tagEl.style.cssText = 'position: absolute; top: 18px; left: 22px; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.45; font-weight: 600; color: var(--text-color); pointer-events: none;';
        tagEl.textContent = t('Sponsored');
        card.appendChild(tagEl);

        // Middle Content Container
        const textEl = document.createElement('div');
        textEl.classList.add('verse-text');
        textEl.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; flex-grow: 1; padding: 36px 18px 12px 18px; width: 100%; box-sizing: border-box;';
        
        if (verse.nativeAdData) {
            const nativeAd = verse.nativeAdData;
            textEl.style.cursor = 'pointer';
            textEl.onclick = (e) => {
                if (e) e.stopPropagation();
                if (window.AppSigner && typeof window.AppSigner.performNativeAdClick === 'function') {
                    window.AppSigner.performNativeAdClick();
                }
            };

            let iconHtml = '';
            if (nativeAd.icon) {
                iconHtml = `<img src="${nativeAd.icon}" alt="App Icon" style="width: 56px; height: 56px; border-radius: 16px; object-fit: cover; box-shadow: 0 4px 16px rgba(0,0,0,0.3); border: 1px solid var(--glass-border); flex-shrink: 0; margin-bottom: 6px;" />`;
            }

            let authorHtml = '';
            if (nativeAd.advertiser) {
                authorHtml = `<span style="font-size: 0.88rem; opacity: 0.65; color: var(--text-color); font-weight: 500; font-family: var(--font-main);">by ${nativeAd.advertiser}</span>`;
            } else if (nativeAd.rating) {
                const rounded = Math.round(Number(nativeAd.rating) || 5);
                const stars = '★'.repeat(Math.min(5, Math.max(1, rounded)));
                authorHtml = `<span style="font-size: 0.9rem; color: #f59e0b; letter-spacing: 1.5px; margin-right: 4px;">${stars}</span> <span style="font-size: 0.85rem; opacity: 0.7; color: var(--text-color); font-weight: 600;">${Number(nativeAd.rating).toFixed(1)}</span>`;
            }

            const ctaText = nativeAd.callToAction || 'Open';

            textEl.innerHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    ${iconHtml}
                    <div style="font-size: clamp(1.25rem, 4.5vw, 1.6rem); font-weight: 600; color: var(--text-color); font-family: var(--font-main); line-height: 1.35; padding: 0 4px;">
                        ${nativeAd.headline || ''}
                    </div>
                    ${authorHtml ? `<div>${authorHtml}</div>` : ''}
                </div>

                ${nativeAd.body ? `
                    <div style="font-size: clamp(0.95rem, 3.2vw, 1.1rem); font-weight: 400; color: var(--text-color); opacity: 0.82; font-family: var(--font-main); line-height: 1.6; text-align: center; padding: 8px 4px; max-height: 140px; overflow-y: auto;">
                        ${nativeAd.body}
                    </div>
                ` : '<div style="flex-grow: 1;"></div>'}

                <div style="width: 100%; display: flex; justify-content: center; margin-top: 6px;">
                    <button id="native-ad-cta-btn" style="background: var(--card-bg); color: var(--text-color); border: 1px solid var(--glass-border); padding: 12px 36px; border-radius: 24px; font-size: 0.95rem; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: var(--glass-shadow); display: inline-flex; align-items: center; justify-content: center; gap: 8px; letter-spacing: 0.3px; transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);">
                        <span>${ctaText}</span>
                        <span style="font-size: 0.85rem; opacity: 0.7;">↗</span>
                    </button>
                </div>
            `;

            setTimeout(() => {
                const ctaBtn = card.querySelector('#native-ad-cta-btn');
                if (ctaBtn) {
                    ctaBtn.onclick = (e) => {
                        if (e) e.stopPropagation();
                        if (window.AppSigner && typeof window.AppSigner.performNativeAdClick === 'function') {
                            window.AppSigner.performNativeAdClick();
                        }
                    };
                }
            }, 0);
        } else {
            textEl.style.cursor = 'pointer';
            textEl.style.justifyContent = 'center';
            textEl.style.padding = '20px 24px';
            textEl.onclick = (e) => {
                if (e) e.stopPropagation();
                openPremiumModal();
            };
            const funnyDiv = document.createElement('div');
            funnyDiv.style.cssText = 'font-size: clamp(1.2rem, 4.2vw, 1.65rem); font-weight: 600; color: var(--text-color); font-family: var(--font-main); line-height: 1.55; text-align: center; max-width: 90%;';
            applyDynamicVerseTranslation(funnyDiv, verse.funnyLine);
            textEl.appendChild(funnyDiv);
        }
        card.appendChild(textEl);

        // Bottom-Middle Remove Ads Button (Direct child of card, centered at bottom)
        const footer = document.createElement('div');
        footer.style.cssText = 'width: 100%; display: flex; justify-content: center; padding-bottom: 8px; flex-shrink: 0;';
        const removeAdsBtn = document.createElement('button');
        removeAdsBtn.style.cssText = 'background: var(--card-bg); color: var(--text-color); border: 1px solid var(--glass-border); padding: 12px 36px; border-radius: 24px; font-size: 0.95rem; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: var(--glass-shadow); transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); letter-spacing: 0.3px;';
        removeAdsBtn.textContent = t('Remove Ads');
        removeAdsBtn.onclick = () => openPremiumModal();
        footer.appendChild(removeAdsBtn);
        card.appendChild(footer);

        return card;
    }

    const textEl = document.createElement('div');
    textEl.classList.add('verse-text');
    applyDynamicVerseTranslation(textEl, verse.text || '');

    const footer = document.createElement('div');
    footer.classList.add('card-footer');
    const refEl = document.createElement('div');
    refEl.classList.add('verse-ref');
    applyDynamicRefTranslation(refEl, verse);
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
    preloadUpcomingVerses(index);
    const stage = document.getElementById('feed-stage');
    if (!stage) return;
    const verse = getVerseAtIndex(index);
    if (!verse) return;

    trackVerseDwellTime(verse);

    const oldCards = Array.from(stage.querySelectorAll('.verse-card'));

    let card = null;
    if (direction === 'next') card = createFeedCardDOM(verse, 'card-right');
    else if (direction === 'prev') card = createFeedCardDOM(verse, 'card-left');
    else card = createFeedCardDOM(verse, 'card-center');

    card.id = 'feed-card-' + index;

    if (direction !== 'none' && oldCards.length > 0) {
        stage.appendChild(card);
        oldCards.forEach(oldCard => {
            oldCard.style.transform = '';
            oldCard.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease';
            oldCard.classList.remove('card-center', 'card-right', 'card-left');
            if (direction === 'next') oldCard.classList.add('card-left');
            else oldCard.classList.add('card-right');
            oldCard.style.pointerEvents = 'none';
            setTimeout(() => {
                try { if (oldCard && oldCard.parentNode) oldCard.parentNode.removeChild(oldCard); } catch(e){}
            }, 340);
        });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                card.classList.remove('card-right', 'card-left');
                card.classList.add('card-center');
            });
        });
    } else {
        stage.innerHTML = '';
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
    if (!isAuto && typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
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
            }, 260);
        } else if (newVerse && newVerse.isAd) {
            if (!newVerse.funnyLine) {
                newVerse.funnyLine = getNextFunnyLine();
            }
            const adSpokenText = "VerseFeed Premium. " + newVerse.funnyLine;
            setTimeout(() => {
                playText(adSpokenText, 'feed');
                autoMode = true;
            }, 100);
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

            setTimeout(() => {
                playText(spokenText, 'feed');
                autoMode = true;
            }, 260);
        } else if (wasPlaying && newVerse && newVerse.isAd) {
            if (!newVerse.funnyLine) {
                newVerse.funnyLine = getNextFunnyLine();
            }
            const adSpokenText = "VerseFeed Premium. " + newVerse.funnyLine;
            setTimeout(() => {
                playText(adSpokenText, 'feed');
                autoMode = true;
            }, 100);
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
        if (isAlreadyActive) {
            verseBatches.general = [];
            currentFeedIndex = 0;
            initializeVerseFeed();
            
        } else if (verseBatches.general.length === 0) {
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
            nameSpan.textContent = albumName === 'Default' ? t('Default') : albumName;
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
    titleSpan.textContent = selectedSavedAlbum ? (selectedSavedAlbum === 'Default' ? t('Default') : selectedSavedAlbum) : t('All');
    
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
        applyDynamicVerseTranslation(text, displayVerse);
        
        const footer = document.createElement('div');
        footer.classList.add('saved-verse-footer');
        footer.style.display = 'flex';
        footer.style.justifyContent = 'space-between';
        footer.style.alignItems = 'center';
        footer.style.marginTop = '12px';
        
        const ref = document.createElement('div');
        ref.classList.add('verse-ref');
        applyDynamicRefTranslation(ref, v);
        
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
        { title: "The Holy Quran", author: "M.A.S. Abdel Haleem", asin: "0199535957" },
        { title: "Don't Be Sad", author: "Dr. Aid al-Qarni", asin: "9960850447" },
        { title: "In the Footsteps of the Prophet", author: "Tariq Ramadan", asin: "0195374765" },
        { title: "Healing and Peace in Islam", author: "A. Helwa", asin: "173423122X" },
        { title: "Muhammad: His Life Based on the Earliest Sources", author: "Martin Lings", asin: "1594771537" },
        { title: "Purification of the Heart", author: "Hamza Yusuf", asin: "193334315X" },
        { title: "The Sealed Nectar", author: "Safiur Rahman Mubarakpuri", asin: "1591440718" },
        { title: "Timeless Seeds of Advice", author: "B.B. Abdulla", asin: "1692930249" },
        { title: "The Productive Muslim", author: "Mohammed Faris", asin: "1905837681" }
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
        { title: "The Bhagavad Gita", author: "Eknath Easwaran", asin: "1586380192" },
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
    const query = encodeURIComponent(`${title} by ${author} book`);
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
        applyDynamicVerseTranslation(btn, rel);
        
        if (!religionBooks[rel]) {
            btn.style.opacity = '0.7';
            if (!loadedReligions.has(rel)) {
                loadReligionData(rel);
            }
        }

        btn.onclick = async () => {
            if (!religionBooks[rel]) {
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
        if (!t) return;
        if (t === 'pbuh' || t === 'phub') {
            expandTerms.push('pbuh', 'peace be upon him', 'ﷺ');
        } else {
            expandTerms.push(t);
        }
    });
    
    let safeTerms = expandTerms
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .filter(t => t.length > 0)
        .sort((a, b) => b.length - a.length);
        
    if (safeTerms.length === 0) return text;
    const regex = new RegExp(`(${safeTerms.join('|')})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
}

let searchDebounceTimeout = null;
window.currentSearchResultsMatches = [];
let currentSearchRenderedCount = 0;
let currentSearchHighlightTerms = [];

function debouncedPerformLibSearch() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(performLibSearch, 250);
}

function checkTermMatch(vText, vTrans, term) {
    if (term === 'pbuh' || term === 'phub') {
        return vText.includes('pbuh') || vTrans.includes('pbuh') || 
               vText.includes('peace be upon him') || vTrans.includes('peace be upon him') || 
               vText.includes('ﷺ') || vTrans.includes('ﷺ');
    }
    return vText.includes(term) || vTrans.includes(term);
}

async function performLibSearch() {
    const input = document.getElementById('lib-search-input');
    const resultsContainer = document.getElementById('lib-search-results');
    if (!input || !resultsContainer) return;
    
    const rawVal = input.value.toLowerCase().trim();
    if (rawVal.length < 2) {
        resultsContainer.innerHTML = '';
        window.currentSearchResultsMatches = [];
        currentSearchRenderedCount = 0;
        currentSearchHighlightTerms = [];
        return;
    }
    
    const tokens = rawVal.split(/\s+/).filter(t => t.length > 0);
    let allSearchTerms = [...tokens, rawVal];
    
    // Cross-language search: If user searches in English while in another language (or vice-versa), translate query!
    if (currentAppLanguage !== 'en_US' && currentAppLanguage !== 'en') {
        try {
            const transTerm = await translateTextAsync(rawVal, currentAppLanguage);
            if (transTerm && transTerm.toLowerCase() !== rawVal) {
                const transTokens = transTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);
                allSearchTerms.push(transTerm.toLowerCase(), ...transTokens);
            }
        } catch(e) {}
    }
    
    currentSearchHighlightTerms = Array.from(new Set(allSearchTerms.filter(t => t && t.length > 1)));
    
    const pool = (currentReligion && religionVerses[currentReligion]) ? religionVerses[currentReligion] : Object.values(religionVerses).flat();
    
    const matches = [];
    const seenMatchTexts = new Set();
    for (let i = 0; i < pool.length; i++) {
        const v = pool[i];
        if (!v) continue;
        const vText = (v.text || '').toLowerCase();
        const vTrans = (v.translation || '').toLowerCase();
        
        const isMatch = currentSearchHighlightTerms.some(term => {
            return checkTermMatch(vText, vTrans, term);
        });
        
        if (isMatch) {
            const normText = (vText || vTrans).trim().replace(/\s+/g, ' ');
            if (!seenMatchTexts.has(normText)) {
                seenMatchTexts.add(normText);
                matches.push(v);
            }
        }
    }
    
    window.currentSearchResultsMatches = matches;
    currentSearchRenderedCount = 0;
    
    resultsContainer.innerHTML = '';
    
    if (matches.length === 0) {
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; opacity: 0.6;">' + (typeof t === 'function' ? t('No verses found') : 'No verses found') + '</div>';
        return;
    }
    
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
        
        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'font-size: 1.1em; line-height: 1.6; margin-bottom: 8px; display: block; word-break: break-word;';
        applyDynamicVerseTranslation(textDiv, match.text, currentAppLanguage, currentSearchHighlightTerms);
        card.appendChild(textDiv);
        
        if (match.translation && match.translation !== match.text) {
            const transDiv = document.createElement('div');
            transDiv.style.cssText = 'font-size: 0.9em; opacity: 0.8; line-height: 1.5; font-style: italic; margin-bottom: 10px;';
            applyDynamicVerseTranslation(transDiv, match.translation, currentAppLanguage, currentSearchHighlightTerms);
            card.appendChild(transDiv);
        }
        
        const footer = document.createElement('div');
        footer.className = 'saved-verse-footer';
        footer.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 15px;';
        const refEl = document.createElement('div');
        refEl.className = 'verse-ref';
        refEl.style.cssText = 'font-size: 0.8em; opacity: 0.6; text-align: left;';
        applyDynamicRefTranslation(refEl, match);
        footer.appendChild(refEl);
        card.appendChild(footer);
        
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
    list.innerHTML = '';
    
    const h2 = document.createElement('h2');
    applyDynamicVerseTranslation(h2, rel);
    list.appendChild(h2);

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

    if (religionBooks[rel] && religionBooks[rel].books) {
        religionBooks[rel].books.forEach(book => {
            const btn = document.createElement('button');
            applyDynamicVerseTranslation(btn, book.name);
            btn.onclick = () => showBookContent(rel, book);
            list.appendChild(btn);
        });
    }
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
        list.innerHTML = '';
        
        const h2 = document.createElement('h2');
        applyDynamicVerseTranslation(h2, book.name);
        list.appendChild(h2);
        
        book.subBookOrder.forEach(sub => {
            const btn = document.createElement('button');
            applyDynamicVerseTranslation(btn, sub);
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
    
    // Pre-warm translations for the entire chapter in background
    if (currentAppLanguage !== 'en_US' && currentAppLanguage !== 'en') {
        sortedKeys.forEach(vKey => {
            const raw = verses[vKey];
            if (raw && !getCachedVerseTranslation(raw, currentAppLanguage)) {
                translateTextAsync(raw, currentAppLanguage);
            }
        });
    }
    
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
        applyDynamicVerseTranslation(p, displayVerse);
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
        div.innerText = localizeDigits(index + 1, currentAppLanguage);
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
    if (piperInitializing) return; // Do not overwrite active voice download progress
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
        }, 50);
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
        }, 50);
    } else {
        stopAudio();
    }
}

/* --- Audio Waveform Visualizer --- */

function updateVisualizerThemeCache() {
    try {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const rootStyle = getComputedStyle(document.body);
        const defaultRgb = isDark ? '238, 204, 180' : '48, 40, 34';
        cachedVisualizerRgb = (rootStyle && rootStyle.getPropertyValue('--visualizer-rgb').trim()) || defaultRgb;
        rebuildVisualizerGradients();
    } catch(e) {}
}

function rebuildVisualizerGradients() {
    if (!waveformCanvasCtx) return;
    try {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const alphas = [0.3, 0.55, 0.85];
        cachedGradLayers = alphas.map(alpha => {
            const grad = waveformCanvasCtx.createLinearGradient(0, visualizerLogicalHeight, 0, visualizerLogicalHeight - 120);
            const layerAlpha = isDark ? Math.min(1.0, alpha * 1.35) : alpha;
            grad.addColorStop(0, `rgba(${cachedVisualizerRgb}, ${layerAlpha})`);
            grad.addColorStop(0.6, `rgba(${cachedVisualizerRgb}, ${layerAlpha * 0.4})`);
            grad.addColorStop(1, `rgba(${cachedVisualizerRgb}, 0.0)`);
            return grad;
        });
    } catch(e) {}
}

function initVisualizerWorker() {
    updateVisualizerThemeCache();
    resizeWaveformCanvas();
}

function resizeWaveformCanvas() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    // High-performance 1.0 DPR: eliminates multi-megapixel GPU canvas overdraw while looking silky smooth
    visualizerLogicalWidth = Math.max(window.innerWidth, canvas.clientWidth || 0);
    visualizerLogicalHeight = 380;

    if (canvas.width !== visualizerLogicalWidth || canvas.height !== visualizerLogicalHeight) {
        canvas.width = visualizerLogicalWidth;
        canvas.height = visualizerLogicalHeight;
        canvas.style.width = '100vw';
        canvas.style.height = visualizerLogicalHeight + 'px';
    }
    waveformCanvasCtx = canvas.getContext('2d', { alpha: true });
    rebuildVisualizerGradients();
}
window.addEventListener('resize', resizeWaveformCanvas, { passive: true });

let visualizerDrawGeneration = 0;
let visualizerDataArray = null;

function startWaveformVisualizer() {
    clearTimeout(visualizerFadeTimeout);
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    if (!waveformCanvasCtx) resizeWaveformCanvas();
    canvas.style.display = 'block';
    
    // Double rAF ensures the browser paints display:block before starting the opacity transition
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            canvas.classList.add('active');
        });
    });

    // Bump generation to kill any orphaned draw loops
    visualizerDrawGeneration++;
    const myGeneration = visualizerDrawGeneration;

    if (waveformAnimFrame) {
        cancelAnimationFrame(waveformAnimFrame);
        waveformAnimFrame = null;
    }

    const ctx = waveformCanvasCtx || canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    updateVisualizerThemeCache();

    const bufferLength = (audioAnalyser && audioAnalyser.frequencyBinCount) || 64;
    if (!visualizerDataArray || visualizerDataArray.length !== bufferLength) {
        visualizerDataArray = new Uint8Array(bufferLength);
    }

    function draw(timestamp) {
        // Kill this loop if a newer generation started
        if (myGeneration !== visualizerDrawGeneration) return;

        waveformAnimFrame = requestAnimationFrame(draw);

        // Clear canvas buffer efficiently
        ctx.clearRect(0, 0, visualizerLogicalWidth, visualizerLogicalHeight);

        const time = (timestamp || performance.now()) * 0.001;

        // Smooth continuous audio volume & verse change respiration
        if (audioAnalyser && isSpeaking && !isPaused && !isGenerating && !isQueueGenerating) {
            audioAnalyser.getByteFrequencyData(visualizerDataArray);
            let sum = 0;
            const len = visualizerDataArray.length;
            for (let i = 0; i < len; i++) sum += visualizerDataArray[i];
            const avgVolume = sum / len / 255.0;
            visualizerSmoothedVol += (avgVolume - visualizerSmoothedVol) * 0.22;
        } else if (isGenerating || isQueueGenerating) {
            // Organic ambient breathing wave during verse transition - prevents ANY stutter, freezing, or flatlining!
            const breathTarget = 0.12 + 0.06 * Math.sin(time * 3.2);
            visualizerSmoothedVol += (breathTarget - visualizerSmoothedVol) * 0.12;
        } else {
            visualizerSmoothedVol *= 0.90;
        }

        const cw = visualizerLogicalWidth;
        const ch = visualizerLogicalHeight;
        const np = 24; // 24 control points with quadratic Bézier interpolation for liquid 60fps performance
        const sw = (cw + 20) / (np - 1);

        for (let layerIdx = 0; layerIdx < 3; layerIdx++) {
            const speed = [1.2, 1.5, 1.9][layerIdx];
            const frequency = [0.004, 0.006, 0.008][layerIdx];
            const amplitudeBase = [8, 12, 16][layerIdx];
            const audioMult = [85, 125, 170][layerIdx];

            ctx.beginPath();
            ctx.moveTo(-10, ch);
            
            let prevX = -10;
            const startWave = Math.sin(-10 * frequency + time * speed);
            let prevY = ch - Math.max(4, amplitudeBase + (startWave * 7) + (visualizerSmoothedVol * audioMult));
            ctx.lineTo(prevX, prevY);

            for (let i = 1; i < np; i++) {
                const x = -10 + (i * sw);
                const wave = Math.sin(x * frequency + time * speed);
                const height = amplitudeBase + (wave * 7) + (visualizerSmoothedVol * audioMult);
                const y = ch - Math.max(4, height);
                const midX = (prevX + x) * 0.5;
                const midY = (prevY + y) * 0.5;
                ctx.quadraticCurveTo(prevX, prevY, midX, midY);
                prevX = x;
                prevY = y;
            }
            ctx.lineTo(cw + 10, prevY);
            ctx.lineTo(cw + 10, ch);
            ctx.closePath();
            ctx.fillStyle = (cachedGradLayers && cachedGradLayers[layerIdx]) || 'rgba(238, 204, 180, 0.3)';
            ctx.fill();
        }
    }

    waveformAnimFrame = requestAnimationFrame(draw);
}

function stopWaveformVisualizer(forceHide = false) {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

    canvas.classList.remove('active');
    clearTimeout(visualizerFadeTimeout);

    if (forceHide) {
        visualizerDrawGeneration++;
        if (waveformAnimFrame) {
            cancelAnimationFrame(waveformAnimFrame);
            waveformAnimFrame = null;
        }
        if (waveformCanvasCtx) {
            try {
                waveformCanvasCtx.save();
                waveformCanvasCtx.setTransform(1, 0, 0, 1, 0, 0);
                waveformCanvasCtx.clearRect(0, 0, canvas.width, canvas.height);
                waveformCanvasCtx.restore();
            } catch(e) {}
        }
        canvas.style.display = 'none';
        return;
    }

    // Smooth slide out: keep drawing undulating wave frames during the 650ms downward transition
    visualizerFadeTimeout = setTimeout(() => {
        if (!canvas.classList.contains('active')) {
            visualizerDrawGeneration++;
            if (waveformAnimFrame) {
                cancelAnimationFrame(waveformAnimFrame);
                waveformAnimFrame = null;
            }
            if (waveformCanvasCtx) {
                try {
                    waveformCanvasCtx.save();
                    waveformCanvasCtx.setTransform(1, 0, 0, 1, 0, 0);
                    waveformCanvasCtx.clearRect(0, 0, canvas.width, canvas.height);
                    waveformCanvasCtx.restore();
                } catch(e) {}
            }
            canvas.style.display = 'none';
        }
    }, 650);
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

function updateLangItemInvertedStyle(el, isSelected) {
    if (!el) return;
    if (isSelected) {
        el.style.border = '2px solid var(--text-color)';
        el.style.background = 'var(--text-color)';
        el.style.color = 'var(--bg-grad-1)';
        el.style.opacity = '1';
        el.style.fontWeight = '600';
    } else {
        el.style.border = '2px solid var(--glass-border)';
        el.style.background = 'transparent';
        el.style.color = 'var(--text-color)';
        el.style.opacity = '0.6';
        el.style.fontWeight = '500';
    }
}

function renderLanguageList(filterQuery = '') {
    const container = document.getElementById('language-list-container');
    if (!container) return;
    container.innerHTML = '';
    const query = (filterQuery || '').toLowerCase().trim();
    
    const filtered = supportedLanguages.filter(l => 
        l.name.toLowerCase().includes(query) || 
        l.native.toLowerCase().includes(query) ||
        l.code.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 24px; opacity: 0.6; font-size: 0.9rem; color: var(--text-color);">No languages found matching "${filterQuery}"</div>`;
        return;
    }

    filtered.forEach(lang => {
        const item = document.createElement('div');
        item.className = 'lang-option-item';
        item.dataset.langCode = lang.code;
        const isSelected = currentAppLanguage === lang.code;
        
        item.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-radius: 14px; cursor: pointer; transition: all 0.18s ease;`;
        updateLangItemInvertedStyle(item, isSelected);
        
        const isSameName = lang.native.toLowerCase() === lang.name.toLowerCase();

        item.innerHTML = `
            <div style="display: flex; align-items: baseline; gap: 8px;">
                <span style="font-size: 1.02rem; font-weight: 600; color: inherit;">${lang.native}</span>
                ${!isSameName ? `<span style="font-size: 0.84rem; opacity: 0.75; color: inherit; font-weight: 400;">(${lang.name})</span>` : ''}
            </div>
        `;

        item.onclick = (e) => {
            if (e) e.stopPropagation();
            
            // 1. INSTANT visual invert selection in 0ms:
            container.querySelectorAll('.lang-option-item').forEach(el => {
                updateLangItemInvertedStyle(el, el === item);
            });
            
            if (typeof playScrollSound === 'function') {
                try { playScrollSound(); } catch(err){}
            }

            // 2. Allow user to see the crisp inverted selection, then smoothly close and switch
            setTimeout(() => {
                selectAppLanguage(lang);
            }, 180);
        };
        container.appendChild(item);
    });
}

function filterLanguages(query) {
    renderLanguageList(query);
}

function refreshActiveSectionAfterLangChange() {
    // 1. Reset and re-render feed cards in the new language
    verseBatches.general = [];
    currentFeedIndex = 0;
    if (typeof currentVerseIndex === 'object') {
        currentVerseIndex.general = 0;
    }
    initializeVerseFeed(true);

    // 2. If Book section is active, re-render book views
    const bookSection = document.getElementById('read-books');
    if (bookSection && bookSection.classList.contains('active-section')) {
        const bookContentView = document.getElementById('book-content-view');
        if (bookContentView && !bookContentView.classList.contains('hidden') && typeof currentBookObj === 'object' && currentBookObj) {
            if (typeof renderBookVerses === 'function') {
                renderBookVerses(currentBookObj, currentChapterKey);
            }
        } else {
            if (typeof showReligions === 'function') showReligions();
        }
    }

    // 3. If Saved section is active, re-render saved verses
    const savedSection = document.getElementById('saved-verses');
    if (savedSection && savedSection.classList.contains('active-section')) {
        if (typeof showSavedVerses === 'function') showSavedVerses(true);
    }

    // 4. If Search view has query, re-run search with new language
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value.trim().length > 0) {
        if (typeof performLibSearch === 'function') performLibSearch(searchInput.value.trim());
    }

    // 5. Update settings buttons
    buildSettings();
}

function selectAppLanguage(lang) {
    if (!lang || !lang.code) return;
    const prevLang = currentAppLanguage;
    currentAppLanguage = lang.code;
    localStorage.setItem('versefeed_user_language', lang.code);
    localStorage.setItem('user_language_selected', 'true');
    
    // Auto-close modal immediately with zero lag!
    closeLanguageModal();

    if (!lang.hasVoice) {
        showToast((lang.native || lang.name) + ' (Text only)');
    } else {
        showToast(lang.native || lang.name);
    }

    // Defer heavy DOM translations & data loading so modal closes at buttery 60fps
    setTimeout(() => {
        applyLanguageTranslations(lang.code);
        preloadFunnyLines(lang.code);
        buildSettings();
        
        // Only reload dataset if switching to/from Arabic or Bengali which use dedicated translation JSON files
        const prevBase = getAppBaseLanguage(prevLang);
        const newBase = getAppBaseLanguage(lang.code);
        const distinctPackLangs = ['ar', 'bn'];
        const needsDatasetReload = (distinctPackLangs.includes(prevBase) || distinctPackLangs.includes(newBase)) && (prevBase !== newBase);

        if (needsDatasetReload) {
            loadedReligions.clear();
            if (religionBooks.Islam) delete religionBooks.Islam;
            if (religionBooks.Christianity) delete religionBooks.Christianity;
            loadSelectedData().then(() => {
                refreshActiveSectionAfterLangChange();
            });
        } else {
            refreshActiveSectionAfterLangChange();
        }
    }, 40);
}

function openLanguageModal(isFirstLaunch = false) {
    const modal = document.getElementById('language-modal');
    if (!modal) return;
    const searchInput = document.getElementById('lang-search-input');
    if (searchInput) searchInput.value = '';
    renderLanguageList('');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('show'));
}

function closeLanguageModal(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const modal = document.getElementById('language-modal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

function initLanguageSettings() {
    const saved = localStorage.getItem('versefeed_user_language') || 'en_US';
    applyLanguageTranslations(saved);
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
    if (piperInitializing) return; // Do not overwrite active voice download progress
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
    if (!raw) return '';
    const maxNum = (typeof isPremiumUser !== 'undefined' && isPremiumUser) ? 49 : 9;
    const maxChars = (typeof isPremiumUser !== 'undefined' && isPremiumUser) ? 30 : 10;
    
    // Convert numbers to Roman numerals (1-9 for free, 1-49 for premium)
    let name = raw.replace(/\d+/g, (match) => {
        const num = parseInt(match, 10);
        if (num < 1 || num > maxNum) return '';
        return toRomanNumeral(num, maxNum);
    });
    // Trim and limit to max characters using Unicode character slice
    name = Array.from(name.trim()).slice(0, maxChars).join('');
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
        stopWaveformVisualizer(false);
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

function getLocalizedVerseText(verseObj) {
    if (!verseObj) return '';
    let raw = verseObj.spoken_text || verseObj.text || '';
    raw = raw.replace(/<span class='author-attr'>.*?<\/span>/gm, '');
    raw = raw.replace(/<[^>]*>?/gm, '').trim();
    if (currentAppLanguage !== 'en_US' && currentAppLanguage !== 'en') {
        const cached = getCachedVerseTranslation(raw, currentAppLanguage);
        if (cached && !isGarbageTranslation(cached)) return cached;
    }
    return raw;
}

function formatVerseForShare(verseObj) {
    if (!verseObj) return '';
    const text = getLocalizedVerseText(verseObj);
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
    let rawText = getLocalizedVerseText(verseObj);
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
    
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.id = 'inline-name-input';
    inputEl.value = currentName;
    inputEl.style.cssText = 'font-size: 1.2rem; font-family: var(--font-main); color: var(--text-color); background: rgba(0,0,0,0.1); border: 1px solid var(--accent); border-radius: 6px; padding: 2px 8px; text-align: center; width: 100%; box-sizing: border-box; outline: none;';
    nameEl.innerHTML = '';
    nameEl.appendChild(inputEl);
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

    const annualPrice = "$14.99";
    const annualPerMonth = "$1.25";
    const monthlyPrice = "$1.99";

    const saveBadge = typeof t === 'function' ? t('Save 37%') : 'Save 37%';
    const annualLabel = typeof t === 'function' ? t('Annual') : 'Annual';
    const monthlyLabel = typeof t === 'function' ? t('Monthly') : 'Monthly';
    const billedYearly = typeof t === 'function' ? t('/mo billed yearly') : '/mo billed yearly';
    const perMonth = typeof t === 'function' ? t('/ month') : '/ month';

    container.innerHTML = `
        <div class="premium-plans-grid">
            <div class="premium-plan-card ${selectedPlanType === 'annual' ? 'selected' : ''}" onclick="selectPremiumPlan('annual')">
                <span class="plan-badge">${saveBadge}</span>
                <span class="plan-name">${annualLabel}</span>
                <span class="plan-price">${annualPrice}</span>
                <span class="plan-subtext">${annualPerMonth}${billedYearly}</span>
            </div>
            <div class="premium-plan-card ${selectedPlanType === 'monthly' ? 'selected' : ''}" onclick="selectPremiumPlan('monthly')">
                <span class="plan-name">${monthlyLabel}</span>
                <span class="plan-price">${monthlyPrice}</span>
                <span class="plan-subtext">${perMonth}</span>
            </div>
        </div>
    `;

    const buyBtnText = document.querySelector('.premium-buy-pill-text');
    if (buyBtnText && !isPurchasingInProgress) {
        if (selectedPlanType === 'annual') {
            buyBtnText.innerText = typeof t === 'function' ? t('Get Annual') : 'Get Annual';
        } else {
            buyBtnText.innerText = typeof t === 'function' ? t('Get Monthly') : 'Get Monthly';
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
