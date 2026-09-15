const sharp = require('sharp');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const W = 1920;
const H = 1080;
const FPS = 30;
const DURATION = 18; // 18 seconds
const TOTAL_FRAMES = FPS * DURATION;
const OUT_FILE = path.join(__dirname, '..', 'versefeed_promo_showcase.mp4');
const AUDIO_FILE = path.join(__dirname, '..', 'music', 'ambient_meditation.mp3');

console.log(`Rendering VerseFeed Promo Video (${TOTAL_FRAMES} frames @ 30 FPS)...`);

const ffmpegArgs = [
    '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-s', `${W}x${H}`,
    '-pix_fmt', 'rgba',
    '-r', `${FPS}`,
    '-i', '-',
];

if (fs.existsSync(AUDIO_FILE)) {
    ffmpegArgs.push(
        '-i', AUDIO_FILE,
        '-filter_complex', `[1:a]atrim=0:${DURATION},afade=t=out:st=${DURATION - 2}:d=2[a]`,
        '-map', '0:v',
        '-map', '[a]',
        '-c:a', 'aac',
        '-b:a', '192k'
    );
}

ffmpegArgs.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    OUT_FILE
);

const ffmpeg = spawn('ffmpeg', ffmpegArgs);

ffmpeg.stderr.on('data', (data) => {
    // console.log(data.toString());
});

ffmpeg.on('close', (code) => {
    if (code === 0) {
        console.log(`\nSuccessfully created promotional video: ${OUT_FILE}`);
    } else {
        console.error(`\nFFmpeg process exited with code ${code}`);
    }
});

function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

function generateSvgFrame(frameIndex) {
    const t = frameIndex / FPS;
    
    // Determine scene
    let scene = 0;
    let sProgress = 0;
    if (t < 4.0) {
        scene = 0;
        sProgress = t / 4.0;
    } else if (t < 8.0) {
        scene = 1;
        sProgress = (t - 4.0) / 4.0;
    } else if (t < 12.0) {
        scene = 2;
        sProgress = (t - 8.0) / 4.0;
    } else if (t < 15.5) {
        scene = 3;
        sProgress = (t - 12.0) / 3.5;
    } else {
        scene = 4;
        sProgress = (t - 15.5) / 2.5;
    }

    let alpha = 1;
    if (sProgress < 0.15) alpha = easeOutCubic(sProgress / 0.15);
    else if (sProgress > 0.85) alpha = 1 - easeOutCubic((sProgress - 0.85) / 0.15);

    let tag = "";
    let title = "";
    let sub = "";
    let tradition = "Bible";
    let scripture = "Peace I leave with you; my peace I give to you.";
    let citation = "John 14:27";
    let isExplanation = false;

    if (scene === 0) {
        tag = "DAILY SCRIPTURES";
        title = "A Quieter Way to Read Sacred Texts";
        sub = "Distraction-free wisdom delivered one peaceful verse at a time.";
        tradition = "Bible";
        scripture = "Peace I leave with you; my peace I give to you. Not as the world gives do I give to you.";
        citation = "John 14:27";
    } else if (scene === 1) {
        tag = "STUDIO NARRATION";
        title = "Listen in Natural Studio Voices";
        sub = "Natural offline narration accompanied by soothing ambient tracks.";
        tradition = "Quran";
        scripture = "For indeed, with hardship comes ease.";
        citation = "Surah Ash-Sharh 94:5";
    } else if (scene === 2) {
        tag = "DEEP CONTEXT";
        title = "Understand The Meaning Behind Every Line";
        sub = "Instant historical background and line-by-line spiritual context.";
        tradition = "Context";
        scripture = "Historical Context: Spoken on the battlefield of Kurukshetra, guiding on Nishkama Karma—selfless action performed without attachment.";
        citation = "Bhagavad Gita 2:47";
        isExplanation = true;
    } else if (scene === 3) {
        tag = "UNIVERSAL &amp; OFFLINE";
        title = "Every Major Tradition. Always Offline.";
        sub = "Bible, Quran, Gita, Dhammapada, Tao Te Ching, Guru Granth Sahib.";
        tradition = "Buddhism";
        scripture = "Peace comes from within. Do not seek it without.";
        citation = "Dhammapada";
    } else {
        tag = "VERSEFEED";
        title = "Begin Your Daily Mindful Routine";
        sub = "Available now on Google Play. Free to download.";
        tradition = "Peace";
        scripture = "Read. Listen. Reflect. Completely Offline.";
        citation = "VerseFeed";
    }

    // Phone floating hover
    const hoverY = Math.sin(t * 1.5) * 8;
    const phoneX = 1420;
    const phoneY = 560 + hoverY;
    const phoneW = 380;
    const phoneH = 760;

    // Audio Visualizer Wave Bars (Scene 1)
    let visualizerSvg = "";
    if (scene === 1) {
        let bars = [];
        for (let i = 0; i < 16; i++) {
            const h = 6 + (Math.sin(t * 8 + i * 0.5) * 0.5 + 0.5) * 22;
            const bx = phoneX - 70 + i * 9;
            bars.push(`<rect x="${bx}" y="${phoneY + 220 - h/2}" width="4" height="${h}" rx="2" fill="#ffffff" opacity="0.9"/>`);
        }
        visualizerSvg = bars.join('');
    }

    // Google Play Badge (Scene 4)
    let playBadgeSvg = "";
    if (scene === 4) {
        const badgeX = 180;
        const badgeY = 740;
        playBadgeSvg = `
            <g opacity="${alpha}">
                <rect x="${badgeX}" y="${badgeY}" width="220" height="58" rx="14" fill="#000000" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.25"/>
                <polygon points="${badgeX + 22},${badgeY + 18} ${badgeX + 44},${badgeY + 29} ${badgeX + 22},${badgeY + 40}" fill="#ffffff"/>
                <text x="${badgeX + 58}" y="${badgeY + 25}" font-family="Arial, sans-serif" font-weight="500" font-size="11" fill="#ffffff" letter-spacing="0.5">GET IT ON</text>
                <text x="${badgeX + 58}" y="${badgeY + 45}" font-family="Arial, sans-serif" font-weight="700" font-size="16" fill="#ffffff">Google Play</text>
            </g>
        `;
    }

    return `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stop-color="#121520" />
                <stop offset="100%" stop-color="#06070a" />
            </radialGradient>
            <radialGradient id="spotlight" cx="50%" cy="40%" r="45%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.05)" />
                <stop offset="100%" stop-color="transparent" />
            </radialGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="32" stdDeviation="40" flood-color="#000000" flood-opacity="0.75"/>
            </filter>
        </defs>

        <!-- Background -->
        <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
        <rect width="${W}" height="${H}" fill="url(#spotlight)"/>

        <!-- Left Typography Column -->
        <g opacity="${alpha}">
            <text x="180" y="380" font-family="Arial, sans-serif" font-weight="700" font-size="14" fill="#a0a8be" letter-spacing="2">${tag}</text>
            <text x="180" y="440" font-family="Arial, sans-serif" font-weight="800" font-size="44" fill="#ffffff" letter-spacing="-0.5">${title}</text>
            <text x="180" y="520" font-family="Arial, sans-serif" font-weight="400" font-size="20" fill="#8c94a6">${sub}</text>
        </g>

        ${playBadgeSvg}

        <!-- Right Side: Phone Chassis -->
        <g filter="url(#shadow)">
            <rect x="${phoneX - phoneW/2}" y="${phoneY - phoneH/2}" width="${phoneW}" height="${phoneH}" rx="46" fill="#181a24" stroke="#2e3346" stroke-width="4"/>
        </g>

        <!-- Phone Screen -->
        <g>
            <clipPath id="screenClip">
                <rect x="${phoneX - phoneW/2 + 8}" y="${phoneY - phoneH/2 + 8}" width="${phoneW - 16}" height="${phoneH - 16}" rx="40"/>
            </clipPath>
            <g clip-path="url(#screenClip)">
                <rect x="${phoneX - phoneW/2 + 8}" y="${phoneY - phoneH/2 + 8}" width="${phoneW - 16}" height="${phoneH - 16}" fill="#090a0f"/>

                <!-- Top App Bar & Notch -->
                <text x="${phoneX}" y="${phoneY - phoneH/2 + 50}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#ffffff">VerseFeed</text>
                <rect x="${phoneX - 40}" y="${phoneY - phoneH/2 + 16}" width="80" height="20" rx="10" fill="#000000"/>

                <!-- Card inside screen -->
                <rect x="${phoneX - 155}" y="${phoneY - 240}" width="310" height="460" rx="24" fill="rgba(24, 27, 38, 0.96)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.2"/>

                <!-- Category Pill -->
                <rect x="${phoneX - 130}" y="${phoneY - 215}" width="75" height="24" rx="12" fill="rgba(255, 255, 255, 0.08)"/>
                <text x="${phoneX - 92}" y="${phoneY - 199}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="10" fill="#ffffff">${tradition}</text>

                <!-- Scripture Body Text -->
                <text x="${phoneX}" y="${phoneY - 70}" text-anchor="middle" font-family="Georgia, serif" font-weight="400" font-size="${isExplanation ? 14 : 17}" fill="#f2f4f8">
                    <tspan x="${phoneX}" dy="0">"${scripture.substring(0, 36)}</tspan>
                    <tspan x="${phoneX}" dy="26">${scripture.substring(36, 75)}</tspan>
                    <tspan x="${phoneX}" dy="26">${scripture.substring(75, 115)}"</tspan>
                </text>

                <!-- Citation Reference -->
                <text x="${phoneX}" y="${phoneY + 160}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="12" fill="#7e869c">${citation}</text>

                ${visualizerSvg}

                <!-- Bottom Action Pill in Phone -->
                <rect x="${phoneX - 70}" y="${phoneY + 280}" width="140" height="38" rx="19" fill="rgba(255, 255, 255, 0.08)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1"/>
                <circle cx="${phoneX - 35}" cy="${phoneY + 299}" r="6" fill="#ffffff"/>
                <polygon points="${phoneX - 4},${phoneY + 293} ${phoneX + 6},${phoneY + 299} ${phoneX - 4},${phoneY + 305}" fill="#ffffff"/>
                <circle cx="${phoneX + 35}" cy="${phoneY + 299}" r="6" fill="#ffffff"/>
            </g>
        </g>
    </svg>
    `;
}

async function renderVideo() {
    for (let f = 0; f < TOTAL_FRAMES; f++) {
        const svg = generateSvgFrame(f);
        const buffer = await sharp(Buffer.from(svg)).raw().toBuffer();
        
        const canWrite = ffmpeg.stdin.write(buffer);
        if (!canWrite) {
            await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
        }

        if (f % 30 === 0) {
            const pct = Math.floor((f / TOTAL_FRAMES) * 100);
            process.stdout.write(`\rProgress: ${pct}% [${f}/${TOTAL_FRAMES} frames]`);
        }
    }

    process.stdout.write(`\rProgress: 100% [${TOTAL_FRAMES}/${TOTAL_FRAMES} frames]\nFinishing MP4 encoding...\n`);
    ffmpeg.stdin.end();
}

renderVideo().catch(console.error);
