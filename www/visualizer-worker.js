// visualizer-worker.js - 60fps OffscreenCanvas Waveform Visualizer
let canvas = null;
let ctx = null;
let logicalWidth = 300;
let logicalHeight = 380;
let isDark = true;
let isSpeaking = false;
let isPaused = false;
let isActive = false;
let currentTargetVolume = 0;
let smoothedVolume = 0;
let animFrame = null;
let rgbStr = '238, 204, 180';

self.onmessage = function(e) {
    const data = e.data;
    if (!data) return;
    
    if (data.type === 'init') {
        canvas = data.canvas;
        ctx = canvas.getContext('2d');
        logicalWidth = data.width || 300;
        logicalHeight = data.height || 380;
        isDark = !!data.isDark;
        rgbStr = data.rgbStr || (isDark ? '238, 204, 180' : '48, 40, 34');
        if (data.targetWidth && data.targetHeight) {
            canvas.width = data.targetWidth;
            canvas.height = data.targetHeight;
            if (ctx && data.dpr) ctx.scale(data.dpr, data.dpr);
        }
        startLoop();
    } else if (data.type === 'resize') {
        logicalWidth = data.width;
        logicalHeight = data.height;
        if (canvas) {
            canvas.width = data.targetWidth;
            canvas.height = data.targetHeight;
            if (ctx && data.dpr) ctx.scale(data.dpr, data.dpr);
        }
    } else if (data.type === 'theme') {
        isDark = !!data.isDark;
        rgbStr = data.rgbStr || (isDark ? '238, 204, 180' : '48, 40, 34');
    } else if (data.type === 'volume') {
        if (data.vol !== undefined) currentTargetVolume = data.vol;
        if (data.isSpeaking !== undefined) isSpeaking = data.isSpeaking;
        if (data.isPaused !== undefined) isPaused = data.isPaused;
        if (data.isActive !== undefined) isActive = data.isActive;
        if (!isActive || isPaused) {
            currentTargetVolume = 0;
        } else if (!animFrame) {
            startLoop();
        }
    } else if (data.type === 'start') {
        isActive = true;
        isSpeaking = true;
        isPaused = false;
        currentTargetVolume = 0;
        startLoop();
    } else if (data.type === 'stop') {
        isActive = false;
        isSpeaking = false;
        isPaused = false;
        currentTargetVolume = 0;
        smoothedVolume = 0;
        if (ctx) ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
    }
};

function startLoop() {
    if (animFrame) return;
    
    function render() {
        if (!ctx || !canvas) return;
        
        if (!isActive || isPaused) {
            smoothedVolume *= 0.82;
            if (smoothedVolume < 0.005) {
                smoothedVolume = 0;
                ctx.clearRect(0, 0, logicalWidth, logicalHeight);
                animFrame = null;
                return;
            }
        }
        
        animFrame = requestAnimationFrame(render);
        
        const targetVol = (isSpeaking && !isPaused) ? currentTargetVolume : 0;
        smoothedVolume += (targetVol - smoothedVolume) * 0.12;
        
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        
        const time = Date.now() * 0.001;
        const numPoints = Math.max(120, Math.floor(logicalWidth / 4));
        const sliceWidth = logicalWidth / (numPoints - 1);
        
        const drawLayer = (speed, frequency, amplitudeBase, audioMult, alpha) => {
            ctx.beginPath();
            ctx.moveTo(0, logicalHeight);
            for (let i = 0; i < numPoints; i++) {
                const x = i * sliceWidth;
                const wave1 = Math.sin(x * frequency + time * speed);
                const wave2 = Math.sin(x * frequency * 1.5 - time * speed * 0.8);
                
                const height = amplitudeBase + (wave1 * 14) + (wave2 * 9) + (smoothedVolume * audioMult);
                const y = logicalHeight - Math.max(5, height);
                ctx.lineTo(x, y);
            }
            ctx.lineTo(logicalWidth, logicalHeight);
            ctx.closePath();
            
            const grad = ctx.createLinearGradient(0, logicalHeight, 0, logicalHeight - 130);
            if (isDark) {
                grad.addColorStop(0, 'rgba(' + rgbStr + ', ' + Math.min(0.85, alpha * 1.3) + ')');
                grad.addColorStop(0.5, 'rgba(' + rgbStr + ', ' + Math.min(0.70, alpha * 1.0) + ')');
                grad.addColorStop(1, 'rgba(' + rgbStr + ', 0.12)');
            } else {
                grad.addColorStop(0, 'rgba(' + rgbStr + ', ' + alpha + ')');
                grad.addColorStop(0.6, 'rgba(' + rgbStr + ', ' + (alpha * 0.4) + ')');
                grad.addColorStop(1, 'rgba(' + rgbStr + ', 0.0)');
            }
            
            ctx.fillStyle = grad;
            ctx.fill();

            if (isDark && alpha > 0.5) {
                ctx.strokeStyle = 'rgba(' + rgbStr + ', 0.75)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        };

        // Draw 3 softly layered sine waves
        drawLayer(1.5, 0.005, 10, 60, 0.3);   // Back layer
        drawLayer(1.8, 0.007, 15, 80, 0.55);  // Middle layer
        drawLayer(2.2, 0.009, 20, 110, 0.85); // Front layer
    }
    
    render();
}
