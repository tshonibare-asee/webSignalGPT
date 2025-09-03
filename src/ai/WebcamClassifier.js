// Copyright 2017 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* eslint-disable camelcase, max-lines,  */
const IMAGE_SIZE_WIDTH = 270;
const IMAGE_SIZE_HEIGHT = 25;
const INPUT_SIZE = 1000;
const TOPK = 10;
const CLASS_COUNT = 3;
const MEASURE_TIMING_EVERY_NUM_FRAMES = 20;

function passThrough() {
  return 0;
}

export default class WebcamClassifier {
  /**
   * @param {Object} [opts]
   * @param {'webcam'|'kiwi'} [opts.inputType='webcam'] - Choose the input pipeline.
   * @param {Object}  [opts.kiwi] - Options for the Kiwi waterfall pipeline.
   * @param {'latest'|'sequential'} [opts.kiwi.mode='latest'] - If 'latest', always pull the newest image URL. If 'sequential', increment a frame index.
   * @param {string}  [opts.kiwi.latestUrl='/wf/latest.png'] - URL for the most recent waterfall image (when mode='latest').
   * @param {string}  [opts.kiwi.baseUrl='/wf'] - Directory containing frames (when mode='sequential').
   * @param {string}  [opts.kiwi.pattern='frame-{index}.png'] - Filename pattern for sequential frames. Use {index} placeholder.
   * @param {number}  [opts.kiwi.startIndex=0] - Starting frame index (sequential mode).
   * @param {number}  [opts.kiwi.fps=1] - Target fetch rate for images.
   * @param {boolean} [opts.kiwi.cacheBust=true] - Append a cache-busting query param when fetching images.
   *
   * Notes:
   * - The model expects IMAGE_SIZE_WIDTHxIMAGE_SIZE_HEIGHT inputs. The Kiwi frames are scaled to this size internally.
   * - Training thumbnails and prediction frames use the same rendering path for webcam or kiwi.
   */
  constructor(opts = {}) {
    // --- Input selection & Kiwi config ---
    this.inputType = opts.inputType || 'webcam';

    // Kiwi waterfall configuration
    this.kiwi = {
      mode: (opts.kiwi && opts.kiwi.mode) || 'latest',
      latestUrl: (opts.kiwi && opts.kiwi.latestUrl) || 'http://127.0.0.1:4000/wf/latest.png',
      baseUrl: (opts.kiwi && opts.kiwi.baseUrl) || '/wf',
      pattern: (opts.kiwi && opts.kiwi.pattern) || 'frame-{index}.png',
      index: (opts.kiwi && typeof opts.kiwi.startIndex === 'number') ? opts.kiwi.startIndex : 0,
      fps: (opts.kiwi && opts.kiwi.fps) || 1,
      cacheBust: (opts.kiwi && typeof opts.kiwi.cacheBust === 'boolean') ? opts.kiwi.cacheBust : true,
      timer: null,
      fetching: false,
      img: null,
      lastGoodUrl: null
    };

    this.loaded = false;

    // --- Common canvases / elements used for both webcam and kiwi ---
    // "video" is only used when inputType === 'webcam'
    this.video = document.createElement('video');
    this.video.setAttribute('autoplay', '');
    this.video.setAttribute('playsinline', '');

    // For kiwi input we draw images into this.frameCanvas and treat it like our "source"
    this.frameCanvas = document.getElementById('wf-canvas');
    this.fifoSize = 11;
    this.fifo = [];             // [{canvas, ctx}, ... newest = index 0]
    this.stripEl = document.getElementById('wf-strip');

    if (this.stripEl) {
      // build canvases, same internal size as your model input
      for (let i = 0; i < this.fifoSize; i++) {
        const c = document.createElement('canvas');
        c.width = IMAGE_SIZE_WIDTH; 
        c.height = IMAGE_SIZE_HEIGHT;
        c.className = 'wf-block';
        this.stripEl.appendChild(c);   // DOM order == visual order (top first)
        const ctx = c.getContext('2d', { willReadFrequently: false });
        ctx.imageSmoothingEnabled = false;
        this.fifo.push({ canvas: c, ctx });
      }
    }


    this.frameCanvas.width  = IMAGE_SIZE_WIDTH;
    this.frameCanvas.height = IMAGE_SIZE_HEIGHT;
    this.frameCtx = this.frameCanvas.getContext('2d');
    
    // also grab the <img> so you can see it update, and so CORS applies
    this.kiwi.imgEl = document.getElementById('wf-img');

    this.blankCanvas = document.createElement('canvas');
    this.blankCanvas.width = IMAGE_SIZE_WIDTH;
    this.blankCanvas.height = IMAGE_SIZE_HEIGHT;

    this.timer = null;
    this.active = false;
    this.wasActive = false;

    this.latestCanvas = document.createElement('canvas');
    this.latestCanvas.width = 98;
    this.latestCanvas.height = 98;
    this.latestContext = this.latestCanvas.getContext('2d');

    this.thumbCanvas = document.createElement('canvas');
    this.thumbCanvas.width = Math.floor(this.latestCanvas.width / 3) + 1;
    this.thumbCanvas.height = Math.floor(this.latestCanvas.height / 3) + 1;
    this.thumbContext = this.thumbCanvas.getContext('2d');

    this.thumbVideoX = 0;
    this.classNames = GLOBALS.classNames;
    this.images = {};
    for (let index = 0; index < this.classNames.length; index += 1) {
      this.images[this.classNames[index]] = {
        index: index,
        down: false,
        imagesCount: 0,
        images: [],
        latestImages: [],
        latestThumbs: []
      };
    }
    this.isDown = false;
    this.current = null;
    this.currentClass = null;
    this.measureTimingCounter = 0;
    this.lastFrameTimeMs = 1000;
    this.classIndices = {};
    this.currentSavedClassIndex = 0;

    this.mappedButtonIndexes = [];

    // Sizing/ratio bookkeeping that works for both webcam and kiwi
    this.sourceWidth = IMAGE_SIZE_WIDTH;
    this.sourceHeight = IMAGE_SIZE_HEIGHT;
    this.videoRatio = 1;

    this.init();

    this.activateWebcamButton = document.getElementById('input__media__activate');
    if (this.activateWebcamButton) {
      this.activateWebcamButton.addEventListener('click', () => {
        location.reload();
      });
    }

    this.lastHash = null;
    this.hashCanvas = document.createElement('canvas');
    this.hashCanvas.width = 64;   // small, fast
    this.hashCanvas.height = 6;
    this.hashCtx = this.hashCanvas.getContext('2d', { willReadFrequently: true });

  }

  // -----------------------
  // Webcam pipeline (as-is)
  // -----------------------
  startWebcam() {
    let video = true;
    if (GLOBALS.browserUtils.isMobile) {
      video = {facingMode: (GLOBALS.isBackFacingCam) ? 'environment' : 'user'};
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia(
      {
        video: video,
        audio: (GLOBALS.browserUtils.isChrome && !GLOBALS.browserUtils.isMobile)
      }).
      then((stream) => {
        GLOBALS.isCamGranted = true;
        if ((GLOBALS.browserUtils.isChrome && !GLOBALS.browserUtils.isMobile)) {
          GLOBALS.audioContext.createMediaStreamSource(stream);
          GLOBALS.stream = stream;
        }
        if (this.activateWebcamButton) {
          this.activateWebcamButton.style.display = 'none';
        }
        this.active = true;
        this.stream = stream;
        this.video.addEventListener('loadedmetadata', this.videoLoaded.bind(this));
        this.video.muted = true;
        this.video.srcObject = stream;
        this.video.width = IMAGE_SIZE_WIDTH;
        this.video.height = IMAGE_SIZE_HEIGHT;

        let event = new CustomEvent('webcam-status', {detail: {granted: true}});
        window.dispatchEvent(event);
        gtag('event', 'webcam_granted');
        this.startTimer();
      }).
      catch((error) => {
        let event = new CustomEvent('webcam-status', {
          detail: {
            granted: false,
            error: error
          }
        });
        if (this.activateWebcamButton) {
          this.activateWebcamButton.style.display = 'block';
        }
        window.dispatchEvent(event);
        gtag('event', 'webcam_denied');
      });
    }
  }

  // -----------------------------
  // Kiwi Waterfall pipeline (NEW)
  // -----------------------------
  initKiwi() {
    // ❌ don't create a brand new off-screen Image() unless needed
    // this.kiwi.img = new Image();

    // ✅ reuse the DOM <img> if present, otherwise fall back to a new Image
    this.kiwi.img = this.kiwi.imgEl || new Image();
    this.kiwi.img.crossOrigin = 'anonymous';

    this.kiwi.img.onload = () => {
      const sw = this.kiwi.img.naturalWidth  || IMAGE_SIZE_WIDTH;
      const sh = this.kiwi.img.naturalHeight || IMAGE_SIZE_HEIGHT;
      this.sourceWidth = sw; this.sourceHeight = sh;
      this.videoRatio = sw / sh;

      const destW = IMAGE_SIZE_WIDTH, destH = IMAGE_SIZE_HEIGHT;
      this.frameCtx.clearRect(0, 0, destW, destH);

      let drawW = destW, drawH = Math.floor(destW / this.videoRatio);
      let dx = 0, dy = Math.floor((destH - drawH) / 2);
      if (this.videoRatio < 1) { // tall
        drawH = destH;
        drawW = Math.floor(destH * this.videoRatio);
        dx = Math.floor((destW - drawW) / 2);
        dy = 0;
      }
      this.frameCtx.drawImage(this.kiwi.img, 0, 0, sw, sh, dx, dy, drawW, drawH);

      // 🔑 Only advance when frame content actually changed
      const hash = this.computeFrameHash();
      if (hash !== this.lastHash) {
        this.lastHash = hash;
        this.advanceFifo();                  // <-- update waterfall
        this.kiwi.lastGoodUrl = this.kiwi.img.src;
      }
      this.kiwi.fetching = false;
    };

    this.kiwi.img.onerror = () => { this.kiwi.fetching = false; };
  }

  startKiwi() {
    if (!this.kiwi.img) this.initKiwi();

    // ensure it’s visible
    const box = document.getElementById('wf-container');
    if (box) box.style.display = 'block';

    // optionally move it into the webcam slot for layout:
    const slot = document.getElementById('input__media__video') || document.getElementById('input__media');
    if (slot && box && !box.isConnected) slot.appendChild(box);

    const intervalMs = Math.max(50, Math.floor(1000 / Math.max(1, this.kiwi.fps)));
    const tick = () => {
      if (!this.kiwi.fetching) {
        this.kiwi.fetching = true;
        let url = this.kiwi.latestUrl;
        if (this.kiwi.cacheBust) {
          url += (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        }
        // update whichever image object we’re using
        (this.kiwi.imgEl || this.kiwi.img).src = url;
      }
      this.kiwi.timer = setTimeout(tick, intervalMs);
    };

    this.wasActive = true;
    this.active = true;
    if (this.timer) cancelAnimationFrame(this.timer);
    this.timer = requestAnimationFrame(this.animate.bind(this));
    if (this.kiwi.timer) clearTimeout(this.kiwi.timer);
    tick();
  }

  stopKiwi() {
    if (this.kiwi.timer) {
      clearTimeout(this.kiwi.timer);
      this.kiwi.timer = null;
    }
  }

  advanceFifo() {
    if (!this.fifo || this.fifo.length === 0) return;

    // move older content down one slot (bottom-up to avoid overwrite)
    for (let i = this.fifo.length - 1; i >= 1; i--) {
      const dst = this.fifo[i];
      const src = this.fifo[i - 1];
      dst.ctx.clearRect(0, 0, IMAGE_SIZE_WIDTH, IMAGE_SIZE_HEIGHT);
      dst.ctx.drawImage(src.canvas, 0, 0);
    }

    // newest frame goes at the very top (index 0)
    const head = this.fifo[0];
    head.ctx.clearRect(0, 0, IMAGE_SIZE_WIDTH, IMAGE_SIZE_HEIGHT);
    head.ctx.drawImage(this.frameCanvas, 0, 0);
  }

  computeFrameHash() {
    // Downscale current frame for cheap hashing
    this.hashCtx.clearRect(0, 0, this.hashCanvas.width, this.hashCanvas.height);
    this.hashCtx.drawImage(this.frameCanvas, 0, 0, this.hashCanvas.width, this.hashCanvas.height);
    const data = this.hashCtx.getImageData(0, 0, this.hashCanvas.width, this.hashCanvas.height).data;

    // FNV-1a (32-bit) via shift-add (avoids precision pitfalls with big multiplies)
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < data.length; i++) {
      h ^= data[i];
      h = (h + (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24)) >>> 0; // *16777619
    }
    return h >>> 0;
  }


  // -----------------------
  // Common init / model
  // -----------------------
  async init() {
    this.useFloatTextures = !GLOBALS.browserUtils.isMobile && !GLOBALS.browserUtils.isSafari;
    tf.ENV.set('WEBGL_DOWNLOAD_FLOAT_ENABLED', false);
    this.classifier = knnClassifier.create();

    // Load mobilenet.
    this.mobilenetModule = await mobilenet.load();
  }

  /**
   *  There is an issue with mobilenetModule/knnClassifier where
   *  it returns -1 if you don't start with an index of zero
   *
   *  In these train/predict methods, we remap the index of 0-2.
   *  This way you can train the third model and have it retain
   *  the index of 2.
   *
   *  We have these super verbosely named functions
   *  so it's clear what's happening
   */

  // Return the current frame source (video or kiwi canvas) for tf.fromPixels()
  getCurrentFrameElement() {
    if (this.inputType === 'kiwi') {
      return this.frameCanvas;
    }
    return this.video;
  }

  // Draw into the thumbnail context from the active source
  drawThumbFromSource(dx, dy, dWidth, dHeight) {
    if (this.inputType === 'kiwi') {
      this.thumbContext.drawImage(this.frameCanvas, 0, 0, this.frameCanvas.width, this.frameCanvas.height, dx, dy, dWidth, dHeight);
    } else {
      // Mirror / center logic similar to webcam path
      this.thumbContext.drawImage(this.video, this.thumbVideoX, 0, this.thumbVideoWidthReal, this.thumbVideoHeight, dx, dy, dWidth, dHeight);
    }
  }

  async predict(imageEl) {
    const imgFromPixels = tf.fromPixels(imageEl);
    const logits = this.mobilenetModule.infer(imgFromPixels, 'conv_preds');
    const response = await this.classifier.predictClass(logits);
    const newOutput = {
      classIndex: this.mappedButtonIndexes[response.classIndex],
      confidences: {
        0: 0,
        1: 0,
        2: 0
      }
    };
    this.mappedButtonIndexes.forEach((index, count) => {
      newOutput.confidences[index] = response.confidences[count];
    });

    return newOutput;
  }

  train(imageEl, index) {
    if (this.mappedButtonIndexes.indexOf(index) === -1) {
      this.mappedButtonIndexes.push(index);
    }
    const newMappedIndex = this.mappedButtonIndexes.indexOf(index);
    const img = tf.fromPixels(imageEl);
    const logits = this.mobilenetModule.infer(img, 'conv_preds');
    this.classifier.addExample(logits, newMappedIndex);
  }

  clear(index) {
    const newMappedIndex = this.mappedButtonIndexes.indexOf(index);
    this.classifier.clearClass(newMappedIndex);
  }

  deleteClassData(index) {
    GLOBALS.clearing = true;
    this.clear(index);
    this.images[this.classNames[index]].imagesCount = 0;
    this.images[this.classNames[index]].latestThumbs = [];
    this.images[this.classNames[index]].latestImages = [];
    GLOBALS.soundOutput.pauseCurrentSound();

    setTimeout(() => {
      GLOBALS.clearing = false;
    }, 300);
  }

  ready() {
    this.startKiwi();
    //this.startWebcam();
    /*if (this.inputType === 'kiwi') {
      this.startKiwi();
    } else {
      this.startWebcam();
    }*/
  }

  videoLoaded() {
    if (this.inputType !== 'webcam') {
      return;
    }
    let flip = (GLOBALS.isBackFacingCam) ? 1 : -1;
    let videoRatio = this.video.videoWidth / this.video.videoHeight;
    let parent = this.video.parentNode;
    if (!parent) return;
    let parentWidth = parent.offsetWidth;
    let parentHeight = parent.offsetHeight;
    let videoWidth = parentHeight * videoRatio;
    this.video.style.width = videoWidth + 'px';
    this.video.style.height = parentHeight + 'px';
    this.video.style.transform = 'scaleX(' + flip + ') translate(' + (50 * flip * -1) + '%, -50%)';

    // If video is taller:
    if (videoRatio < 1) {
      this.video.style.transform = 'scale(' + (flip * 2) + ', 2) translate(' + (flip * 20 * -1) + '%, -30%)';
    }
  }

  blur() {
    if (this.timer) {
      this.stopTimer();
    }
  }

  focus() {
    if (this.wasActive) {
      this.startTimer();
    }
  }

  buttonDown(id, canvas, learningClass) {
    this.current = this.images[id];
    this.current.down = true;
    this.isDown = true;
    this.training = this.current.index;

    // Compute ratio based on current source
    if (this.inputType === 'kiwi') {
      this.videoRatio = this.sourceWidth / this.sourceHeight;
    } else {
      this.videoRatio = this.video.videoWidth / this.video.videoHeight;
    }

    this.currentClass = learningClass;
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;
    this.videoWidth = this.canvasHeight * this.videoRatio;

    this.thumbVideoHeight = this.canvasHeight / 3;
    this.thumbVideoWidth = this.canvasWidth / 3;
    this.thumbVideoWidthReal = this.thumbVideoHeight * this.videoRatio;
    this.thumbVideoX = -(this.thumbVideoWidthReal - this.thumbVideoWidth) / 2;
    this.currentContext = this.currentClass.canvas.getContext('2d');
  }

  buttonUp(id) {
    this.images[id].down = false;
    this.isDown = false;
    this.training = -1;

    this.current = null;
    this.currentContext = null;
    this.currentClass = null;
  }

  startTimer() {
    if (this.timer) {
      this.stopTimer();
    }

    if (this.inputType === 'webcam') {
      this.video.play();
    }
    this.wasActive = true;
    this.timer = requestAnimationFrame(this.animate.bind(this));
  }

  stopTimer() {
    this.active = false;
    this.wasActive = true;
    if (this.inputType === 'webcam') {
      this.video.pause();
    } else {
      this.stopKiwi();
    }
    cancelAnimationFrame(this.timer);
    if (GLOBALS.soundOutput && GLOBALS.soundOutput.muteSounds) {
        GLOBALS.soundOutput.muteSounds();
    }
  }

  async animate() {
    // Get image source element (video for webcam, canvas for kiwi)
    const imageEl = this.getCurrentFrameElement();
    const exampleCount = Object.keys(this.classifier.getClassExampleCount()).length;

    if (this.isDown) {
      this.current.imagesCount += 1;
      this.currentClass.setSamples(this.current.imagesCount);
      if (this.current.latestThumbs.length > 8) {
        this.current.latestThumbs.shift();
      }
      if (this.current.latestImages.length > 8) {
        this.current.latestImages.shift();
      }

      // Draw a small thumb from the active source
      if (this.inputType === 'kiwi') {
        // For kiwi, draw the already letterboxed 227x227 frame into thumbCanvas size
        this.thumbContext.drawImage(this.frameCanvas, 0, 0, IMAGE_SIZE_WIDTH, IMAGE_SIZE_HEIGHT, 0, 0, this.thumbCanvas.width, this.thumbCanvas.height);
      } else {
        this.thumbContext.drawImage(
          this.video, this.thumbVideoX, 0, this.thumbVideoWidthReal,
          this.thumbVideoHeight);
      }

      let data = this.thumbContext.getImageData(
        0, 0, this.canvasWidth, this.canvasHeight);
      this.current.latestThumbs.push(data);
      let cols = 0;
      let rows = 0;
      for (let index = 0; index < this.current.latestThumbs.length; index += 1) {
        this.currentContext.putImageData(
          this.current.latestThumbs[index], (2 - cols) * this.thumbCanvas.width,
          rows * this.thumbVideoHeight, 0, 0, this.thumbCanvas.width,
          this.thumbCanvas.height);
        if (cols === 2) {
          rows += 1;
          cols = 0;
        } else {
          cols += 1;
        }
      }

      // Train class if one of the buttons is held down
      // Add current image to classifier
      if (this.training !== -1) {
        this.train(imageEl, this.training);
      }

    } else if (exampleCount > 0) {
      // If any examples have been added, run predict
      let measureTimer = false;
      let start = performance.now();
      measureTimer = this.measureTimingCounter === 0;
      if (exampleCount > 0) {
        const res = await this.predict(imageEl);
        const computeConfidences = () => {
          GLOBALS.learningSection.setConfidences(res.confidences);
          this.measureTimingCounter = (this.measureTimingCounter + 1) % MEASURE_TIMING_EVERY_NUM_FRAMES;
        };

        if (!GLOBALS.browserUtils.isSafari || measureTimer || !GLOBALS.browserUtils.isMobile) {
          this.lastFrameTimeMs = performance.now() - start;
          computeConfidences();
        } else {
          setTimeout(computeConfidences, this.lastFrameTimeMs);
        }

      } else if (imageEl.dispose) {
        imageEl.dispose();
      }
    }

    this.timer = requestAnimationFrame(this.animate.bind(this));
  }
}
/* eslint-disable keyword-spacing */
import GLOBALS from './../config.js';
import * as tf from '@tensorflow/tfjs';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
import * as mobilenet from '@tensorflow-models/mobilenet';
/* eslint-enable camelcase, max-lines, keyword-spacing */