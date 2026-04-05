/* ═══════════════════════════════════════════════
   KART DRIVER DISPLAY — Alpine.js Application
   Author: 5w0rdf15h — https://github.com/5w0rdf15h/
   ═══════════════════════════════════════════════ */

document.addEventListener('alpine:init', () => {
  Alpine.data('kartDisplay', () => ({
    view: 'settings',  // settings | connecting | race
    flashType: null,
    connectStatus: '',
    demoInterval: null,
    demoLapTimer: null,
    isFullscreen: false,

    langs: LANGS,

    settings: {
      name: localStorage.getItem('kd_name') || '',
      track: localStorage.getItem('kd_track') || 'race-on',
      lang: localStorage.getItem('kd_lang') || 'en',
      voice: true,
      announceLap: true,
      announceBest: true,
      announcePos: false,
      deltaBase: 'best',
      vibrate: true,
    },

    race: {
      flag: 'Green',
      timeToGo: 0,
      scheduledTime: 0,
      progress: 0,
      myLaps: 0,
      lastLap: 0,
      bestLap: 0,
      avgLap: 0,
      avgLast3: 0,
      prevLap: 0,
      delta: null,
      position: null,
      gapAhead: null,
      gapBehind: null,
      penaltyTime: 0,
      penaltyLaps: 0,
      isPersonalBest: false,
      consistency: 0,
      lapHistory: [],
      kartNumber: '',
    },

    // — Derived —
    get paceArrow() {
      if (!this.race.avgLast3 || !this.race.avgLap) return '';
      const diff = this.race.avgLast3 - this.race.avgLap;
      return diff < -200 ? '↗' : diff > 200 ? '↘' : '→';
    },
    get paceDelta() {
      if (!this.race.avgLast3 || !this.race.avgLap) return '—';
      const diff = (this.race.avgLast3 - this.race.avgLap) / 1000;
      return Math.abs(diff).toFixed(1);
    },
    get paceClass() {
      if (!this.race.avgLast3 || !this.race.avgLap) return 'pace-flat';
      const diff = this.race.avgLast3 - this.race.avgLap;
      return diff < -200 ? 'pace-up' : diff > 200 ? 'pace-down' : 'pace-flat';
    },
    get consistencyClass() {
      const s = this.race.consistency;
      if (s <= 0) return '';
      return s < 0.5 ? 'consistency-good' : s < 1.0 ? 'consistency-mid' : 'consistency-bad';
    },

    t(key) {
      // Reference settings.lang so Alpine re-evaluates on change
      const lang = this.settings.lang;
      return LANGS[lang]?.[key] || LANGS.en[key] || key;
    },

    setLang(code) {
      this.settings.lang = code;
      localStorage.setItem('kd_lang', code);
      this.saveSettings();
    },

    init() {
      // Restore settings
      if (localStorage.getItem('kd_settings')) {
        try {
          const saved = JSON.parse(localStorage.getItem('kd_settings'));
          Object.assign(this.settings, saved);
        } catch (e) {}
      }
      // Sync lang to localStorage for t() function
      localStorage.setItem('kd_lang', this.settings.lang);
      // Register service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }
      // Track fullscreen state
      document.addEventListener('fullscreenchange', () => {
        this.isFullscreen = !!document.fullscreenElement;
      });
      document.addEventListener('webkitfullscreenchange', () => {
        this.isFullscreen = !!document.webkitFullscreenElement;
      });
      // Request wake lock
      this.requestWakeLock();
    },

    async requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          await navigator.wakeLock.request('screen');
        }
      } catch (e) {}
    },

    saveSettings() {
      localStorage.setItem('kd_name', this.settings.name);
      localStorage.setItem('kd_track', this.settings.track);
      localStorage.setItem('kd_settings', JSON.stringify(this.settings));
    },

    requestFullscreen() {
      const el = document.documentElement;
      const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (rfs) rfs.call(el).catch(() => {});
    },

    toggleFullscreen() {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        this.requestFullscreen();
      }
    },

    saveAndStart() {
      this.saveSettings();
      this.view = 'connecting';
      this.connectToTrack();
    },

    async connectToTrack() {
      const track = this.settings.track;
      const name = this.settings.name.trim();
      const baseUrl = `https://${track}.racemann.com`;
      this.connectStatus = `${this.t('connecting')} ${track}.racemann.com...`;

      try {
        // Step 1: Connect SignalR
        this.hub = new SignalRLite(baseUrl, ['racehub']);

        // Register handlers BEFORE connecting
        this.hub.on('racehub', 'lastRaceId', (data) => {
          if (data && data.id && data.id !== this.currentRaceId) {
            this.currentRaceId = data.id;
            this.hub.invoke('racehub', 'SubscribeRace', data.id);
          }
        });

        this.hub.on('racehub', 'newCommand', (cmd) => {
          this._handleRaceCommand(cmd, name);
        });

        this.hub.on('racehub', 'setAllCommands', (data) => {
          // Full state dump on subscribe — try to find our driver
          if (data && Array.isArray(data)) {
            for (const cmd of data) {
              this._handleRaceCommand(cmd, name);
            }
          }
        });

        this.hub.on('racehub', 'monitorSettings', () => {});
        this.hub.on('racehub', 'driversDataUpdated', () => {});

        this.hub.onDisconnected = () => {
          if (this.view === 'race' || this.view === 'connecting') {
            this.connectStatus = 'Disconnected. Reconnecting...';
            setTimeout(() => this.connectToTrack(), 3000);
          }
        };

        this.hub.onError = (e) => {
          this.connectStatus = `Connection error. Retrying...`;
        };

        // lastRaceId arrives via handler, not invoke return
        this.hub.on('racehub', 'lastRaceId', async (data) => {
          if (data && data.id && data.id !== this.currentRaceId) {
            this.currentRaceId = data.id;
            console.log(`Race found: ${data.id} (time: ${data.raceTime}s)`);
            this.connectStatus = this.t('searchingName') + ` (${name})`;
            await this.hub.invoke('racehub', 'SubscribeRace', data.id);
            await this.hub.invoke('racehub', 'SubscribeMonitor', 0);
            // Switch to race view — data will populate as Comp messages arrive
            this.view = 'race';
            this.requestWakeLock();
          }
        });

        await this.hub.connect();
        this.connectStatus = this.t('findingRace');

        // Step 2: Request current race (response comes via lastRaceId handler)
        await this.hub.invoke('racehub', 'GetLastRaceId');
      } catch (e) {
        this.connectStatus = `Error: ${e.message}\n\n${this.t('demoHint')}`;
      }
    },

    _pollForRace(name) {
      this.racePoller = setInterval(async () => {
        try {
          const result = await this.hub.invoke('racehub', 'GetLastRaceId');
          if (result && result.id) {
            clearInterval(this.racePoller);
            this.currentRaceId = result.id;
            await this.hub.invoke('racehub', 'SubscribeRace', result.id);
            await this.hub.invoke('racehub', 'SubscribeMonitor', 0);
            this.view = 'race';
            this.requestWakeLock();
          }
        } catch (e) {}
      }, 5000);
    },

    _handleRaceCommand(cmd, driverName) {
      if (!cmd) return;
      const method = cmd.Method || cmd.method;
      const data = cmd.Command || cmd.command || cmd;

      // Heartbeat — update timer
      if (method === 'hb' && data) {
        this.race.timeToGo = data.tg || 0;
        this.race.flag = data.fl || 'Green';
        // Track scheduled time from first hb (largest tg seen = total duration)
        if (data.tg > this.race.scheduledTime) {
          this.race.scheduledTime = data.tg;
        }
        if (data.tg !== undefined && this.race.scheduledTime > 0) {
          this.race.progress = ((this.race.scheduledTime - data.tg) / this.race.scheduledTime) * 100;
        }
        return;
      }

      // Competitor update
      if (method === 'Comp' && data) {
        const rn = data.cs?.rn || data.rn || data.nn;
        const fn = data.fn || '';

        // Auto-detect kart by driver name (fuzzy match)
        if (!this.race.kartNumber && driverName) {
          const nameNorm = driverName.toLowerCase().trim();
          const fnNorm = fn.toLowerCase().trim();
          if (fnNorm === nameNorm || fnNorm.includes(nameNorm) || nameNorm.includes(fnNorm)) {
            this.race.kartNumber = rn;
            console.log(`Found driver "${fn}" on kart #${rn}`);
          }
        }

        // If this is our kart, update display
        if (rn && rn === this.race.kartNumber) {
          this.processLapCrossing({
            lapTime: data.cs?.ll || data.ll || 0,
            position: data.pos,
            gapAhead: data.pld ? Math.abs(data.pld / 1000) : null,
            gapBehind: null, // pld is gap to car ahead; we'd need next car's data for behind
            flag: null,
            penalty: (data.pd?.Time || 0),
          });

          // Override with accurate server data
          if (data.cs) {
            if (data.cs.bl) this.race.bestLap = data.cs.bl;
            if (data.cs.al) this.race.avgLap = data.cs.al;
            if (data.cs.al3) this.race.avgLast3 = data.cs.al3;
            if (data.lc) this.race.myLaps = data.lc;
          }
        }

        // Track all competitors for gap-behind calculation
        if (this.race.kartNumber && rn !== this.race.kartNumber) {
          // Check if this car is directly behind us
          if (data.pld !== undefined && data.cs?.rn) {
            // Store competitor positions for gap calc
            if (!this._competitors) this._competitors = {};
            this._competitors[rn] = { pos: data.pos, pld: data.pld };

            // Find car directly behind us
            const myPos = this.race.position;
            if (data.pos === myPos + 1) {
              this.race.gapBehind = Math.abs(data.pld / 1000);
            }
          }
        }
      }

      // ReloadChart — sometimes sent, ignore
      if (method === 'ReloadChart') return;
    },

    hub: null,
    currentRaceId: null,
    racePoller: null,
    _competitors: {},

    // ═══ DEMO MODE ═══
    startDemo() {
      this.saveSettings();
      this.view = 'race';
      this.requestWakeLock();

      // Initialize demo race
      const baseLap = 29000 + Math.random() * 2000; // 29-31s base
      this.race.scheduledTime = 600000;
      this.race.timeToGo = 580000;
      this.race.flag = 'Green';
      this.race.kartNumber = '10';
      this.race.position = 3;
      this.race.gapAhead = 2.1;
      this.race.gapBehind = 0.8;
      this.race.lapHistory = [];
      this.race.myLaps = 0;
      this.race.bestLap = 0;
      this.race.lastLap = 0;
      this.race.prevLap = 0;
      this.race.avgLap = 0;
      this.race.avgLast3 = 0;
      this.race.delta = null;
      this.race.isPersonalBest = false;
      this.race.penaltyTime = 0;

      // Demo: lap every 3 seconds (accelerated), countdown scaled to match
      let lapCount = 0;
      const demoLaps = this.generateDemoLaps(baseLap, 18);
      const demoRealDuration = demoLaps.length * 3; // ~54 seconds real time
      const countdownStep = Math.round(this.race.timeToGo / demoRealDuration); // ms per tick

      // Countdown ticker — 1 tick per second, scaled to fill the bar across the demo
      this.demoInterval = setInterval(() => {
        this.race.timeToGo = Math.max(0, this.race.timeToGo - countdownStep);
        this.race.progress = ((this.race.scheduledTime - this.race.timeToGo) / this.race.scheduledTime) * 100;
      }, 1000);

      // Lap crossings
      const crossLap = () => {
        if (lapCount >= demoLaps.length) {
          clearInterval(this.demoInterval);
          return;
        }
        const lapData = demoLaps[lapCount];
        this.processLapCrossing(lapData);
        lapCount++;

        // Next lap in 3-5 seconds (demo speed)
        const nextDelay = 3000 + Math.random() * 2000;
        this.demoLapTimer = setTimeout(crossLap, nextDelay);
      };

      // First lap after 2s
      this.demoLapTimer = setTimeout(crossLap, 2000);
    },

    generateDemoLaps(baseLap, count) {
      const laps = [];
      let improvement = 0;
      for (let i = 0; i < count; i++) {
        // Simulate improvement curve: fast improvement early, then plateau
        if (i < 3) improvement = i * 800; // warm-up laps
        else if (i < 8) improvement = 2400 + (i - 3) * 400; // finding pace
        else improvement = 4400 + (i - 8) * 100; // plateau

        const jitter = (Math.random() - 0.5) * 1200;
        let lapTime = baseLap - improvement + jitter;

        // Simulate incidents
        if (i === 5) lapTime += 8000; // slow lap (traffic)
        if (i === 11) lapTime += 3000; // slight off

        // Position changes
        let pos = 3;
        if (i >= 4) pos = 2;
        if (i >= 8) pos = 1;
        if (i === 5) pos = 4; // dropped during slow lap
        if (i >= 14) pos = 1;

        // Gaps
        let ahead = null, behind = null;
        if (pos > 1) ahead = 0.5 + Math.random() * 3;
        if (pos < 5) behind = 0.3 + Math.random() * 2;

        // Flag events — cycle through all RaceMann flag types
        let flag = 'Green';
        if (i === 3) flag = 'Yellow';
        if (i === 5) flag = 'Blue';
        if (i === 7) flag = 'Red';
        if (i === totalLaps - 1) flag = 'Finish';

        laps.push({
          lapTime: Math.round(lapTime),
          position: pos,
          gapAhead: ahead,
          gapBehind: behind,
          flag: flag,
          penalty: i === 5 ? 5000 : 0,
        });
      }
      return laps;
    },

    processLapCrossing(lapData) {
      const { lapTime, position, gapAhead, gapBehind, flag, penalty } = lapData;

      this.race.prevLap = this.race.lastLap;
      this.race.lastLap = lapTime;
      this.race.myLaps++;
      this.race.position = position;
      this.race.gapAhead = gapAhead;
      this.race.gapBehind = gapBehind;
      this.race.flag = flag || 'Green';
      if (penalty) this.race.penaltyTime += penalty;

      // Personal best check
      const wasBest = this.race.bestLap;
      if (this.race.bestLap === 0 || lapTime < this.race.bestLap) {
        this.race.bestLap = lapTime;
        this.race.isPersonalBest = this.race.myLaps > 1;
      } else {
        this.race.isPersonalBest = false;
      }

      // Delta calculation
      if (this.settings.deltaBase === 'best' && wasBest > 0) {
        this.race.delta = lapTime - wasBest;
      } else if (this.settings.deltaBase === 'prev' && this.race.prevLap > 0) {
        this.race.delta = lapTime - this.race.prevLap;
      } else {
        this.race.delta = null;
      }

      // Lap history
      this.race.lapHistory.push(lapTime);
      if (this.race.lapHistory.length > 15) this.race.lapHistory.shift();

      // Averages
      const validLaps = this.race.lapHistory.filter(l => l < this.race.bestLap * 1.5);
      if (validLaps.length > 0) {
        this.race.avgLap = Math.round(validLaps.reduce((a, b) => a + b, 0) / validLaps.length);
      }
      const last3 = this.race.lapHistory.slice(-3);
      if (last3.length >= 3) {
        this.race.avgLast3 = Math.round(last3.reduce((a, b) => a + b, 0) / last3.length);
      }

      // Consistency (std dev of last 5 valid laps)
      const recent = this.race.lapHistory.slice(-5).filter(l => l < this.race.bestLap * 1.5);
      if (recent.length >= 3) {
        const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
        const variance = recent.reduce((a, l) => a + Math.pow(l - mean, 2), 0) / recent.length;
        this.race.consistency = Math.sqrt(variance) / 1000;
      }

      // Flash effect
      this.triggerFlash(lapTime, wasBest);

      // Voice
      this.announceLapVoice(lapTime);

      // Vibration on PB
      if (this.race.isPersonalBest && this.settings.vibrate && navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }

      // Reset PB indicator after 5s
      if (this.race.isPersonalBest) {
        setTimeout(() => { this.race.isPersonalBest = false; }, 5000);
      }

      // Reset flag after 3s if it was a temporary flag
      if (flag && flag !== 'Green') {
        setTimeout(() => { this.race.flag = 'Green'; }, 8000);
      }
    },

    triggerFlash(lapTime, prevBest) {
      if (prevBest > 0 && lapTime < prevBest) {
        this.flashType = 'gold';
      } else if (this.race.prevLap > 0 && lapTime < this.race.prevLap) {
        this.flashType = 'green';
      } else if (this.race.prevLap > 0) {
        this.flashType = 'red';
      }
      setTimeout(() => { this.flashType = null; }, 800);
    },

    announceLapVoice(lapTime) {
      if (!this.settings.voice || !('speechSynthesis' in window)) return;
      const totalSec = lapTime / 1000;
      const whole = Math.floor(totalSec);
      const frac = Math.round((totalSec - whole) * 1000).toString().padStart(3, '0');
      // Use comma for Russian (decimal separator), dot for others
      const sep = this.settings.lang === 'ru' ? ',' : '.';
      const sec = whole + sep + frac;
      let text = '';
      if (this.settings.announceLap) text += sec;
      if (this.race.isPersonalBest && this.settings.announceBest) text += '. ' + this.t('voiceBest');
      if (this.settings.announcePos && this.race.position) text += '. ' + this.t('voicePos') + ' ' + this.race.position;
      if (text) {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.2;
        u.lang = LANGS[this.settings.lang]?._voice || 'en-US';
        speechSynthesis.speak(u);
      }
    },

    // ═══ UI HELPERS ═══
    formatTime(ms) {
      if (ms <= 0) return '0:00';
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      return `${min}:${sec.toString().padStart(2, '0')}`;
    },

    flagDotClass(i) {
      const flag = this.race.flag;
      if (flag === 'Green') return i <= 3 ? 'dot-green' : 'dot-dim';
      if (flag === 'Yellow') return 'dot-yellow';
      if (flag === 'Red') return 'dot-red';
      if (flag === 'Blue') return 'dot-blue';
      if (flag === 'Finish') return i % 2 === 0 ? 'dot-green' : 'dot-dim';
      return 'dot-dim';
    },

    lapBarHeight(lapTime) {
      if (!this.race.bestLap || lapTime <= 0) return 10;
      const ratio = this.race.bestLap / lapTime;
      return Math.max(10, Math.min(100, ratio * 100));
    },

    lapBarClass(lapTime) {
      if (!this.race.bestLap) return 'bar-good';
      const pct = ((lapTime - this.race.bestLap) / this.race.bestLap) * 100;
      if (pct <= 0.5) return 'bar-best';
      if (pct <= 3) return 'bar-good';
      if (pct <= 8) return 'bar-mid';
      return 'bar-slow';
    },

    toggleVoice() {
      this.settings.voice = !this.settings.voice;
      this.saveSettings();
    },

    goToSettings() {
      // Disconnect cleanly
      if (this.hub) { this.hub.disconnect(); this.hub = null; }
      if (this.demoInterval) { clearInterval(this.demoInterval); this.demoInterval = null; }
      if (this.demoLapTimer) { clearTimeout(this.demoLapTimer); this.demoLapTimer = null; }
      if (this.racePoller) { clearInterval(this.racePoller); this.racePoller = null; }
      // Reset race state
      this.race.lastLap = 0; this.race.bestLap = 0; this.race.avgLap = 0;
      this.race.avgLast3 = 0; this.race.delta = null; this.race.position = null;
      this.race.myLaps = 0; this.race.lapHistory = []; this.race.kartNumber = '';
      this.race.scheduledTime = 0; this.race.timeToGo = 0; this.race.progress = 0;
      this.race.penaltyTime = 0; this.race.isPersonalBest = false;
      this.race.gapAhead = null; this.race.gapBehind = null;
      this.currentRaceId = null; this._competitors = {};
      this.view = 'settings';
    },

    handleDisplayTap(e) {
      // Double-tap to toggle fullscreen
      if (e.detail === 2 && document.documentElement.requestFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      }
    },
  }));
});
