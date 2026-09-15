const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const USER_DIR = 'C:/Users/ASUS/.gemini/antigravity/brain/4f6b375d-be60-4983-aac3-15c8f0df8c5d';
const ARTIFACTS_DIR = USER_DIR;
const OUTPUT_DIR = path.join(__dirname, '../store_graphics');

async function processExactScreenshot(sourcePath, outPath) {
  const meta = await sharp(sourcePath).metadata();
  // Cut ONLY the top thin notification bar (42px). Keep 100% of the rest down to the very bottom!
  const cropTop = 42;
  const cropHeight = meta.height - cropTop;

  await sharp(sourcePath)
    .extract({ left: 0, top: cropTop, width: meta.width, height: cropHeight })
    .png()
    .toFile(outPath);

  console.log('Processed exact screenshot (only top notification cut):', outPath);
}

function getHtml({ title, subtitle, imageBase64, showVisualizer = false }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      width: 473px;
      height: 1024px;
      background-color: #11100e;
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #fff;
      padding-top: 22px;
    }

    .header-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      height: 78px;
      justify-content: flex-start;
      padding: 0 16px;
      margin-bottom: 8px;
    }

    .title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 25px;
      font-weight: 700;
      color: #F4ECD8;
      letter-spacing: -0.2px;
      line-height: 1.15;
      margin-bottom: 7px;
    }

    .subtitle {
      font-size: 11.5px;
      color: #7D7971;
      font-weight: 400;
      letter-spacing: 0.15px;
      line-height: 1.25;
    }

    .phone-mockup {
      width: 393px;
      height: 840px;
      border-radius: 36px;
      border: 1.5px solid rgba(255, 255, 255, 0.12);
      box-shadow: 
        0 24px 60px rgba(0, 0, 0, 0.85),
        0 4px 16px rgba(0, 0, 0, 0.5),
        inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      overflow: hidden;
      position: relative;
      background: #1e1d1b;
      display: flex;
    }

    .screenshot-img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: fill;
    }

    /* Floating glowing audio visualizer wave */
    .visualizer-canvas {
      position: absolute;
      left: 0;
      width: 100%;
      bottom: 45px;
      height: 130px;
      pointer-events: none;
      z-index: 5;
    }
  </style>
</head>
<body>
  <div class="header-area">
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>
  </div>

  <div class="phone-mockup">
    <img class="screenshot-img" src="data:image/png;base64,${imageBase64}" />
    ${showVisualizer ? '<canvas id="visualizer" class="visualizer-canvas" width="393" height="130"></canvas>' : ''}
  </div>

  ${showVisualizer ? `
  <script>
    const canvas = document.getElementById('visualizer');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // Draw layered liquid glowing golden soundwaves
      const layers = [
        { amp: 18, freq: 0.016, phase: 0.2, color: 'rgba(238, 204, 180, 0.18)', stroke: 'rgba(245, 218, 192, 0.65)', lw: 1.5 },
        { amp: 26, freq: 0.022, phase: 1.4, color: 'rgba(224, 185, 150, 0.22)', stroke: 'rgba(255, 230, 205, 0.85)', lw: 2 },
        { amp: 14, freq: 0.028, phase: 2.8, color: 'rgba(210, 165, 120, 0.15)', stroke: 'rgba(238, 195, 155, 0.60)', lw: 1.5 }
      ];

      layers.forEach(layer => {
        ctx.beginPath();
        const baseCenterY = h * 0.42;

        ctx.moveTo(0, baseCenterY);
        for (let x = 0; x <= w; x += 2) {
          // Envelope: taper gently at edges, rise in center
          const envelope = Math.sin((x / w) * Math.PI);
          const wave = Math.sin(x * layer.freq + layer.phase) * layer.amp * Math.pow(envelope, 1.2);
          const y = baseCenterY + wave;
          ctx.lineTo(x, y);
        }

        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.lw;
        ctx.shadowColor = 'rgba(238, 204, 180, 0.7)';
        ctx.shadowBlur = 8;
        ctx.stroke();

        // Fill subtle glow downwards
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, baseCenterY, 0, h);
        grad.addColorStop(0, layer.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fill();
      });
    }
  </script>
  ` : ''}
</body>
</html>`;
}

async function render() {
  const voiceRaw = path.join(USER_DIR, '.user_uploaded/media_1789473933435.jpg');
  const explRaw = path.join(USER_DIR, '.user_uploaded/media_1789473933672.jpg');

  const voiceExact = path.join(__dirname, 'voice_exact.png');
  const explExact = path.join(__dirname, 'expl_exact.png');

  await processExactScreenshot(voiceRaw, voiceExact);
  await processExactScreenshot(explRaw, explExact);

  const voiceB64 = fs.readFileSync(voiceExact).toString('base64');
  const explB64 = fs.readFileSync(explExact).toString('base64');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 473, height: 1024, deviceScaleFactor: 2 });

  // 1. Verse Explanation Showcase
  console.log('Rendering Verse Explanation mockup (exact bottom, uncut blob)...');
  const explHtml = getHtml({
    title: 'Deep Verse Explanations',
    subtitle: 'Context and timeless wisdom for every scripture',
    imageBase64: explB64,
    showVisualizer: false
  });
  await page.setContent(explHtml, { waitUntil: 'domcontentloaded', timeout: 15000 });
  try { await page.evaluate(() => document.fonts.ready); } catch(e) {}
  await new Promise(r => setTimeout(r, 600));

  const explBuffer = await page.screenshot({ type: 'jpeg', quality: 96 });
  const explOutStore = path.join(OUTPUT_DIR, 'screenshot_5_explanation.jpg');
  const explOutArtifact = path.join(ARTIFACTS_DIR, 'screenshot_5_explanation.jpg');
  fs.writeFileSync(explOutStore, explBuffer);
  fs.writeFileSync(explOutArtifact, explBuffer);

  // 2. Voice Narration Showcase with Audio Visualizer
  console.log('Rendering Voice Narration mockup (with visualizer and uncut blob)...');
  const voiceHtml = getHtml({
    title: 'Natural Voice Narration',
    subtitle: 'Peaceful spoken audio with ambient background music',
    imageBase64: voiceB64,
    showVisualizer: true
  });
  await page.setContent(voiceHtml, { waitUntil: 'domcontentloaded', timeout: 15000 });
  try { await page.evaluate(() => document.fonts.ready); } catch(e) {}
  await new Promise(r => setTimeout(r, 600));

  const voiceBuffer = await page.screenshot({ type: 'jpeg', quality: 96 });
  const voiceOutStore = path.join(OUTPUT_DIR, 'screenshot_6_voice.jpg');
  const voiceOutArtifact = path.join(ARTIFACTS_DIR, 'screenshot_6_voice.jpg');
  fs.writeFileSync(voiceOutStore, voiceBuffer);
  fs.writeFileSync(voiceOutArtifact, voiceBuffer);

  await browser.close();

  // Clean up temp files
  try {
    fs.unlinkSync(voiceExact);
    fs.unlinkSync(explExact);
  } catch (e) {}

  console.log('SUCCESS! Both screenshots rendered with exact bottom and visualizer.');
}

render().catch(console.error);
