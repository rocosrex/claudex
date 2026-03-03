#!/usr/bin/env node
// Speaker embedding extraction worker
// Runs in a separate Node.js process to avoid Electron's external buffer restrictions
'use strict';

const sherpa = require('sherpa-onnx-node');
const fs = require('fs');

const args = process.argv.slice(2);
const command = args[0];
const modelPath = args[1];
const wavFile = args[2];

if (command === 'extract' && modelPath && wavFile) {
  try {
    const ext = new sherpa.SpeakerEmbeddingExtractor({
      model: modelPath,
      numThreads: 2,
      debug: false,
    });

    const wave = sherpa.readWave(wavFile);
    const stream = ext.createStream();
    stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
    const embedding = ext.compute(stream);

    // Output as JSON to stdout
    process.stdout.write(JSON.stringify({ embedding: Array.from(embedding), dim: embedding.length }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }));
  }
} else {
  process.stdout.write(JSON.stringify({ error: 'Usage: speaker-worker.js extract <model.onnx> <audio.wav>' }));
}
