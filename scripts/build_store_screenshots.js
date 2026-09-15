const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const USER_DIR = 'C:/Users/ASUS/.gemini/antigravity/brain/4f6b375d-be60-4983-aac3-15c8f0df8c5d';
const ARTIFACTS_DIR = USER_DIR;
const OUTPUT_DIR = path.join(__dirname, '../store_graphics');

async function processScreenshot(sourcePath, outPath) {
  const meta = await sharp(sourcePath).metadata();
  // Crop top 42px (Android status bar) and bottom after 986px (Android system bar)
  // Clean, pure app content
  const cropTop = 42;
  const cropBottom = 986;
  const cropHeight = cropBottom - cropTop;

  await sharp(sourcePath)
    .extract({ left: 0, top: cropTop, width: meta.width, height: cropHeight })
    .png()
    .toFile(outPath);

  console.log('Processed screenshot saved to:', outPath);
}

function getHtml({ title, subtitle, imageBase64 }) {
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
      padding-top: 18px;
    }

    .header-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      height: 84px;
      justify-content: flex-start;
      padding: 0 16px;
    }

    .title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 24.5px;
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
      width: 389px;
      height: 887px;
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
      flex-direction: column;
      align-items: center;
    }

    .screenshot-img {
      width: 389px;
      height: auto;
      margin-top: 24px;
      display: block;
    }

    .home-indicator {
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      width: 125px;
      height: 4px;
      background: rgba(255, 255, 255, 0.42);
      border-radius: 4px;
      pointer-events: none;
      z-index: 10;
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
    <div class="home-indicator"></div>
  </div>
</body>
</html>`;
}

async function render() {
  const voiceRaw = path.join(USER_DIR, '.user_uploaded/media_1789473933435.jpg');
  const explRaw = path.join(USER_DIR, '.user_uploaded/media_1789473933672.jpg');

  const voiceProcessed = path.join(__dirname, 'voice_clean.png');
  const explProcessed = path.join(__dirname, 'expl_clean.png');

  await processScreenshot(voiceRaw, voiceProcessed);
  await processScreenshot(explRaw, explProcessed);

  const voiceB64 = fs.readFileSync(voiceProcessed).toString('base64');
  const explB64 = fs.readFileSync(explProcessed).toString('base64');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 473, height: 1024, deviceScaleFactor: 2 });

  // 1. Verse Explanation Showcase
  console.log('Rendering Verse Explanation mockup...');
  const explHtml = getHtml({
    title: 'Deep Verse Explanations',
    subtitle: 'Context and timeless wisdom for every scripture',
    imageBase64: explB64
  });
  await page.setContent(explHtml, { waitUntil: 'domcontentloaded', timeout: 15000 });
  try {
    await page.evaluate(() => document.fonts.ready);
  } catch(e) {}
  await new Promise(r => setTimeout(r, 800));

  const explBuffer = await page.screenshot({ type: 'jpeg', quality: 96 });
  const explOutStore = path.join(OUTPUT_DIR, 'screenshot_5_explanation.jpg');
  const explOutArtifact = path.join(ARTIFACTS_DIR, 'screenshot_5_explanation.jpg');
  fs.writeFileSync(explOutStore, explBuffer);
  fs.writeFileSync(explOutArtifact, explBuffer);

  // 2. Voice Narration Showcase
  console.log('Rendering Voice Narration mockup...');
  const voiceHtml = getHtml({
    title: 'Natural Voice Narration',
    subtitle: 'Peaceful spoken audio with ambient background music',
    imageBase64: voiceB64
  });
  await page.setContent(voiceHtml, { waitUntil: 'domcontentloaded', timeout: 15000 });
  try {
    await page.evaluate(() => document.fonts.ready);
  } catch(e) {}
  await new Promise(r => setTimeout(r, 800));

  const voiceBuffer = await page.screenshot({ type: 'jpeg', quality: 96 });
  const voiceOutStore = path.join(OUTPUT_DIR, 'screenshot_6_voice.jpg');
  const voiceOutArtifact = path.join(ARTIFACTS_DIR, 'screenshot_6_voice.jpg');
  fs.writeFileSync(voiceOutStore, voiceBuffer);
  fs.writeFileSync(voiceOutArtifact, voiceBuffer);

  await browser.close();

  // Clean up temp files
  try {
    fs.unlinkSync(voiceProcessed);
    fs.unlinkSync(explProcessed);
  } catch (e) {}

  console.log('SUCCESS! Both screenshots rendered:');
  console.log('-', explOutStore);
  console.log('-', voiceOutStore);
}

render().catch(console.error);
