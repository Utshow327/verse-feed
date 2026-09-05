// piper-worker.js — Off-thread Piper TTS Neural Synthesis Worker
self.window = self;

let ttsModule = null;
let piperSession = null;
let currentVoiceId = null;

self.onmessage = async (e) => {
    const msg = e.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'init') {
        const { voiceId, wasmPaths, speedScale } = msg;
        try {
            if (!ttsModule) {
                ttsModule = await import('./piper-bundle.js?v=25');
            }
            if (!piperSession || currentVoiceId !== voiceId) {
                if (ttsModule.TtsSession._instance) {
                    ttsModule.TtsSession._instance = null;
                }
                piperSession = await ttsModule.TtsSession.create({
                    voiceId: voiceId,
                    wasmPaths: wasmPaths,
                    progress: (p) => {
                        self.postMessage({ type: 'progress', progress: p, voiceId });
                    }
                });
                piperSession.voiceId = voiceId;
                currentVoiceId = voiceId;
            }
            if (speedScale && piperSession) {
                piperSession.speedScale = speedScale;
            }
            self.postMessage({ type: 'init_done', voiceId, success: true });
        } catch (err) {
            console.error("Worker Piper init error:", err);
            self.postMessage({ type: 'init_done', voiceId, success: false, error: (err && err.message) || String(err) });
        }
    } else if (msg.type === 'predict') {
        const { id, text, speedScale } = msg;
        try {
            if (!piperSession) {
                throw new Error("Worker Piper session not ready");
            }
            if (speedScale) {
                piperSession.speedScale = speedScale;
            }
            const wavBlob = await piperSession.predict(text);
            const arrayBuffer = await wavBlob.arrayBuffer();
            // Zero-copy transfer to main thread
            self.postMessage({ type: 'predict_done', id, buffer: arrayBuffer }, [arrayBuffer]);
        } catch (err) {
            console.error("Worker Piper predict error on id " + id, err);
            self.postMessage({ type: 'predict_done', id, error: (err && err.message) || String(err) });
        }
    }
};
