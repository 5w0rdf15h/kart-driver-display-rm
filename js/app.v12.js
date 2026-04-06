/* ═══════════════════════════════════════════════
   KART DRIVER DISPLAY — Alpine.js Application
   Author: 5w0rdf15h — https://github.com/5w0rdf15h/
   ═══════════════════════════════════════════════ */

document.addEventListener('alpine:init', () => {
  Alpine.data('kartDisplay', () => ({
    view: 'settings',  // settings | connecting | race
    displayMode: localStorage.getItem('kd_mode') || 'ta',  // ta | race
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
      trackRecord: localStorage.getItem('kd_trackRecord') || '',
    },

    race: {
      flag: 'Green',
      flagMessage: '',
      showRecordCelebration: false,
      flagType: '',
      showFlagOverlay: false,
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

    get topBarFlagClass() {
      const f = this.race.flag;
      if (f === 'Green') return '';
      if (f === 'Finish') return 'top-bar-finish';
      if (f === 'Yellow') return 'top-bar-yellow';
      if (f === 'Red') return 'top-bar-red';
      if (f === 'Blue') return 'top-bar-blue';
      return '';
    },

    get flagDisplayText() {
      if (this.race.flagMessage) return this.race.flagMessage;
      // Fallback: use flag name from i18n
      const f = this.race.flag;
      if (f === 'Finish') return this.t('flag_finish') || 'FINISH';
      if (f === 'Yellow') return this.t('flag_yellow') || 'YELLOW';
      if (f === 'Red') return this.t('flag_red') || 'RED';
      if (f === 'Blue') return this.t('flag_blue') || 'BLUE';
      return f;
    },

    get sortedCompetitors() {
      return Object.values(this._competitors)
        .filter(c => c.pos > 0)
        .sort((a, b) => a.pos - b.pos);
    },

    get visibleCompetitors() {
      const all = this.sortedCompetitors;
      if (all.length <= 5) return all;
      const myIdx = all.findIndex(c => c.rn === this.race.kartNumber);
      if (myIdx === -1) return all.slice(0, 5);
      // P1: show 0-4, P2: show 0-4, P3: show 0-4, P4+: center driver with 3 above
      let start;
      if (myIdx <= 2) {
        start = 0;
      } else if (myIdx >= all.length - 2) {
        start = all.length - 5;
      } else {
        start = myIdx - 2;
      }
      return all.slice(start, start + 5);
    },

    toggleDisplayMode() {
      this.displayMode = this.displayMode === 'ta' ? 'race' : 'ta';
      localStorage.setItem('kd_mode', this.displayMode);
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
      // Preload TTS voices (Chrome loads them asynchronously)
      this._voices = [];
      if ('speechSynthesis' in window) {
        this._voices = speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => {
          this._voices = speechSynthesis.getVoices();
        };
      }
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
      localStorage.setItem('kd_trackRecord', this.settings.trackRecord || '');
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
      this._baseUrl = baseUrl;
      this._driverName = name;
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

        // Monitor messages — flag overlays (finish, yellow, blue, etc.)
        this.hub.on('racehub', 'allMonitorMessages', (messages, compAlerts) => {
          console.log('allMonitorMessages:', JSON.stringify(messages).slice(0, 500));
          this._handleMonitorMessages(messages);
        });

        // Broadcast flag changes (finish, yellow, blue, etc.) — real-time updates
        this.hub.on('racehub', 'newWideSpreadCommand', (...args) => {
          console.log('newWideSpreadCommand:', JSON.stringify(args).slice(0, 500));
          this._handleWideSpreadCommand(args);
        });

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
            const isNewRace = this.currentRaceId !== null;
            if (isNewRace) {
              // New race detected — reset display state
              console.log(`New race detected: ${data.id} (previous: ${this.currentRaceId})`);
              this._resetRaceState();
            }
            this.currentRaceId = data.id;
            console.log(`Race found: ${data.id} (time: ${data.raceTime}s)`);
            this.connectStatus = this.t('searchingName') + ` (${name})`;
            await this.hub.invoke('racehub', 'SubscribeRace', data.id);
            await this.hub.invoke('racehub', 'SubscribeMonitor', 0);
            // Fetch race data and pre-populate display from REST API
            this._fetchRaceMetadata(baseUrl, data.id, name);
            // Switch to race view — data will populate as Comp messages arrive
            this.view = 'race';
            this.requestWakeLock();
          }
        });

        await this.hub.connect();
        this.connectStatus = this.t('findingRace');

        // Step 2: Request current race (response comes via lastRaceId handler)
        await this.hub.invoke('racehub', 'GetLastRaceId');

        // Step 3: Poll for new races every 10s (handles race transitions)
        this.racePoller = setInterval(async () => {
          try {
            await this.hub.invoke('racehub', 'GetLastRaceId');
          } catch (e) {}
        }, 10000);
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

    async _fetchRaceMetadata(baseUrl, raceId, driverName) {
      try {
        const resp = await fetch(`${baseUrl}/race/GetRaceStartData`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `raceId=${raceId}`,
        });
        const data = await resp.json();
        if (!data) return;

        // Race metadata
        if (data.raceData?.ScheduledTime) {
          this.race.scheduledTime = data.raceData.ScheduledTime;
        }
        if (data.raceData?.TimeToGo != null) {
          this.race.timeToGo = data.raceData.TimeToGo;
        }
        // Detect race end from REST data: TimeToGo=0 means race is over
        // Note: FlagStatus stays "Green" and IsComplete stays false even after
        // race ends — these fields are unreliable for finish detection
        if (data.raceData?.TimeToGo === 0 && data.raceData?.RaceTime > 0) {
          this.race.flag = 'Finish';
          this.race.flagMessage = this.t('flag_finish') || 'FINISH';
        } else if (data.raceData?.FlagStatus && data.raceData.FlagStatus !== 'Green') {
          const flag = data.raceData.FlagStatus;
          this.race.flag = flag;
          this.race.flagMessage = this.t('flag_' + flag.toLowerCase()) || flag;
        }
        if (this.race.scheduledTime > 0 && this.race.timeToGo != null) {
          this.race.progress = ((this.race.scheduledTime - this.race.timeToGo) / this.race.scheduledTime) * 100;
        }

        // Pre-populate all competitors
        if (data.comps && Array.isArray(data.comps)) {
          const nameMatches = []; // Collect all name matches (kart swaps create duplicates)

          for (const comp of data.comps) {
            const rn = comp.cs?.rn || comp.rn || comp.nn;
            if (!rn) continue;

            this._competitors[rn] = {
              rn: rn,
              fn: comp.fn || '',
              pos: comp.pos || 0,
              bestLap: comp.cs?.bl || comp.bl || 0,
              lastLap: comp.cs?.ll || comp.ll || 0,
              gap: comp.pld ? (comp.pld / 1000) : null,
            };

            // Collect name matches (may be multiple due to kart swaps)
            if (driverName) {
              const nameNorm = driverName.toLowerCase().trim();
              const fnNorm = (comp.fn || '').toLowerCase().trim();
              if (fnNorm === nameNorm || fnNorm.includes(nameNorm) || nameNorm.includes(fnNorm)) {
                nameMatches.push({ rn, comp, lastLap: comp.cs?.sll || 0, endTime: comp.cs?.se || 0 });
              }
            }
          }

          // Pick the most recently active entry (highest session last lap)
          if (nameMatches.length > 0 && !this.race.kartNumber) {
            nameMatches.sort((a, b) => b.lastLap - a.lastLap || b.endTime - a.endTime);
            const best = nameMatches[0];
            this.race.kartNumber = best.rn;
            if (nameMatches.length > 1) {
              console.log(`Driver "${driverName}" found on ${nameMatches.length} karts (swap detected): ${nameMatches.map(m => '#' + m.rn).join(', ')}. Using #${best.rn} (most recent)`);
            } else {
              console.log(`Found driver "${best.comp.fn}" on kart #${best.rn} (from REST)`);
            }
          }

          // Pre-populate our driver's stats from comps[]
          if (this.race.kartNumber) {
            const me = data.comps.find(c => (c.cs?.rn || c.rn || c.nn) === this.race.kartNumber);
            if (me) {
              this.race.position = me.pos;
              this.race.myLaps = me.lc || 0;
              this.race.bestLap = me.cs?.bl || me.bl || 0;
              this.race.avgLap = me.cs?.al || 0;
              this.race.avgLast3 = me.cs?.al3 || 0;
              this.race.lastLap = me.cs?.ll || me.ll || 0;
              this.race.penaltyTime = me.pd?.Time || 0;
              this.race.penaltyLaps = me.pd?.Laps || 0;

              // Update competitor entry too
              if (this._competitors[this.race.kartNumber]) {
                this._competitors[this.race.kartNumber].pos = me.pos;
                this._competitors[this.race.kartNumber].bestLap = this.race.bestLap;
                this._competitors[this.race.kartNumber].lastLap = this.race.lastLap;
              }

              // Pre-populate gap behind from the car one position below
              const behind = data.comps.find(c => c.pos === me.pos + 1);
              if (behind && behind.pld) {
                this.race.gapBehind = Math.abs(behind.pld / 1000);
              }
              if (me.pld) {
                this.race.gapAhead = Math.abs(me.pld / 1000);
              }
            }
          }
        }

        // Pre-populate lap history from lastLaps[]
        if (this.race.kartNumber && data.lastLaps && Array.isArray(data.lastLaps)) {
          const myLaps = data.lastLaps
            .filter(l => l.rn === this.race.kartNumber && l.lt > 0)
            .sort((a, b) => a.n - b.n);

          if (myLaps.length > 0) {
            // Build lap history (keep last 15 for chart)
            this.race.lapHistory = myLaps.slice(-15).map(l => l.lt);

            // Set prevLap for delta calculation on next live crossing
            this.race.prevLap = myLaps[myLaps.length - 1].lt;

            // Calculate consistency from recent clean laps
            const cleanLaps = myLaps.filter(l => l.ls === 0 || l.ls === 33).map(l => l.lt);
            const recent = cleanLaps.slice(-5);
            if (recent.length >= 3) {
              const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
              const variance = recent.reduce((a, l) => a + Math.pow(l - mean, 2), 0) / recent.length;
              this.race.consistency = Math.sqrt(variance) / 1000;
            }

            console.log(`Pre-populated ${myLaps.length} laps for kart #${this.race.kartNumber}`);
          }
        }
      } catch (e) {
        console.log('Could not fetch race metadata:', e.message);
      }
    },

    async _fetchFinalResults(baseUrl, raceId) {
      try {
        const resp = await fetch(`${baseUrl}/race/GetRaceStartData`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `raceId=${raceId}`,
        });
        const data = await resp.json();
        if (!data || !this.race.kartNumber) return;

        // Update our driver's stats from final comps[]
        if (data.comps && Array.isArray(data.comps)) {
          const me = data.comps.find(c => (c.cs?.rn || c.rn || c.nn) === this.race.kartNumber);
          if (me) {
            if (me.cs?.ll) this.race.lastLap = me.cs.ll;
            if (me.cs?.bl) this.race.bestLap = me.cs.bl;
            if (me.cs?.al) this.race.avgLap = me.cs.al;
            if (me.cs?.al3) this.race.avgLast3 = me.cs.al3;
            if (me.lc) this.race.myLaps = me.lc;
            if (me.pos) this.race.position = me.pos;
            console.log(`Final results updated: last=${me.cs?.ll}, best=${me.cs?.bl}, laps=${me.lc}`);
          }

          // Update all competitors
          for (const comp of data.comps) {
            const rn = comp.cs?.rn || comp.rn || comp.nn;
            if (!rn) continue;
            this._competitors[rn] = {
              rn: rn,
              fn: comp.fn || '',
              pos: comp.pos || 0,
              bestLap: comp.cs?.bl || comp.bl || 0,
              lastLap: comp.cs?.ll || comp.ll || 0,
              gap: comp.pld ? (comp.pld / 1000) : null,
            };
          }
        }

        // Update lap history from lastLaps[]
        if (data.lastLaps && Array.isArray(data.lastLaps)) {
          const myLaps = data.lastLaps
            .filter(l => l.rn === this.race.kartNumber && l.lt > 0)
            .sort((a, b) => a.n - b.n);
          if (myLaps.length > 0) {
            this.race.lapHistory = myLaps.slice(-15).map(l => l.lt);
          }
        }
      } catch (e) {
        console.log('Could not fetch final results:', e.message);
      }
    },

    _handleMonitorMessages(messages) {
      if (!messages || !Array.isArray(messages)) return;
      // Find the most relevant common flag from all monitor groups
      let activeFlag = null;
      for (const group of messages) {
        if (!group) continue;
        for (const key of Object.keys(group)) {
          const msg = group[key];
          if (msg && msg.IsCommonFlag && !msg.IsDriverMessage) {
            activeFlag = msg;
          }
        }
      }
      if (activeFlag) {
        this._applyFlag(activeFlag.MessageTypeStr, activeFlag.Text);
      }
      // Don't reset flag when no activeFlag — let heartbeat/REST/wideSpread flags stand
    },

    _handleWideSpreadCommand(args) {
      // newWideSpreadCommand may send flag data in various formats
      // Try to extract flag info from the arguments
      for (const arg of args) {
        if (!arg) continue;
        // Could be a single message object or an array
        const items = Array.isArray(arg) ? arg : [arg];
        for (const item of items) {
          if (item && item.MessageTypeStr) {
            console.log('WideSpread flag:', item.MessageTypeStr, item.Text);
            this._applyFlag(item.MessageTypeStr, item.Text);
            return;
          }
          if (item && item.IsCommonFlag) {
            console.log('WideSpread common flag:', item.MessageTypeStr, item.Text);
            this._applyFlag(item.MessageTypeStr, item.Text);
            return;
          }
          // Some messages come as {Method, Command} like race commands
          if (item && (item.Method || item.method)) {
            const method = item.Method || item.method;
            const data = item.Command || item.command || item;
            if (method === 'flag' || method === 'Flag') {
              console.log('WideSpread flag command:', data);
              const flagStr = data.fl || data.Flag || data.flag;
              if (flagStr) {
                this.race.flag = flagStr;
                this.race.flagMessage = this.t('flag_' + flagStr.toLowerCase()) || flagStr;
              }
              return;
            }
          }
        }
      }
    },

    _applyFlag(messageTypeStr, text) {
      const type = (messageTypeStr || '').toLowerCase();
      const flagMap = {
        green: 'Green', start: 'Green', restart: 'Green',
        yellow: 'Yellow', autoyellow: 'Yellow',
        red: 'Red',
        blue: 'Blue', commonblue: 'Blue',
        finish: 'Finish',
        sc: 'Yellow', wet: 'Yellow',
        warning: 'Yellow', black: 'Red', broken: 'Red',
      };
      this.race.flag = flagMap[type] || 'Green';
      this.race.flagType = type;
      this.race.flagMessage = this.t('flag_' + type) || text || '';
      this.race.showFlagOverlay = type !== 'green' && type !== 'start' && type !== 'restart';
    },

    _handleRaceCommand(cmd, driverName) {
      if (!cmd) return;
      const method = cmd.Method || cmd.method;
      const data = cmd.Command || cmd.command || cmd;

      // Heartbeat — update timer
      if (method === 'hb' && data) {
        const prevTg = this.race.timeToGo;
        this.race.timeToGo = data.tg || 0;

        // Detect ScheduledTime extension: tg jumped up (race director added time)
        if (this.race.timeToGo > prevTg + 5000 && prevTg > 0) {
          const added = this.race.timeToGo - prevTg;
          this.race.scheduledTime += added;
          console.log(`ScheduledTime extended by +${added}ms → ${this.race.scheduledTime}ms`);
        }

        // Detect race end: tg reached 0 (FlagStatus/IsComplete are unreliable)
        if (this.race.timeToGo === 0 && prevTg > 0 && this.race.flag !== 'Finish') {
          this.race.flag = 'Finish';
          this.race.flagMessage = this.t('flag_finish') || 'FINISH';
          console.log('Race finished (tg reached 0)');
          // Fetch final race data from REST to get authoritative last lap / stats
          if (this._baseUrl && this.currentRaceId) {
            setTimeout(() => {
              this._fetchFinalResults(this._baseUrl, this.currentRaceId);
            }, 3000); // Wait 3s for server to finalize
          }
        }

        // Handle flag changes from heartbeat (yellow, blue, etc.)
        const newFlag = data.fl || 'Green';
        // Don't let hb.fl downgrade Finish (hb.fl stays "Green" even after race ends)
        if (newFlag !== 'Green' && newFlag !== this.race.flag && this.race.flag !== 'Finish') {
          this.race.flag = newFlag;
          this.race.flagMessage = this.t('flag_' + newFlag.toLowerCase()) || newFlag;
        }

        if (this.race.scheduledTime > 0) {
          this.race.progress = Math.min(100, ((this.race.scheduledTime - this.race.timeToGo) / this.race.scheduledTime) * 100);
        }
        return;
      }

      // Competitor update
      if (method === 'Comp' && data) {
        const rn = data.cs?.rn || data.rn || data.nn;
        const fn = data.fn || '';

        // Auto-detect kart by driver name (fuzzy match)
        if (driverName) {
          const nameNorm = driverName.toLowerCase().trim();
          const fnNorm = fn.toLowerCase().trim();
          if (fnNorm === nameNorm || fnNorm.includes(nameNorm) || nameNorm.includes(fnNorm)) {
            if (!this.race.kartNumber) {
              this.race.kartNumber = rn;
              console.log(`Found driver "${fn}" on kart #${rn}`);
            } else if (rn !== this.race.kartNumber) {
              // Kart swap detected: same driver name, new kart number via live Comp
              console.log(`Kart swap detected: "${fn}" moved from #${this.race.kartNumber} to #${rn}`);
              this.race.kartNumber = rn;
            }
          }
        }

        // If this is our kart, update display
        if (rn && rn === this.race.kartNumber) {
          const serverLapCount = data.lc || 0;
          const isNewLap = serverLapCount > this.race.myLaps;

          if (isNewLap) {
            // New lap crossing — run full processing (flash, voice, vibrate)
            this.processLapCrossing({
              lapTime: data.cs?.ll || data.ll || 0,
              position: data.pos,
              gapAhead: data.pld ? Math.abs(data.pld / 1000) : null,
              gapBehind: null,
              flag: null,
              penalty: (data.pd?.Time || 0),
            });
          } else {
            // Stale or duplicate Comp (already loaded from REST) — just sync position/gaps
            this.race.position = data.pos;
            if (data.pld) this.race.gapAhead = Math.abs(data.pld / 1000);
          }

          // Always override with accurate server data
          if (data.cs) {
            if (data.cs.bl) this.race.bestLap = data.cs.bl;
            if (data.cs.al) this.race.avgLap = data.cs.al;
            if (data.cs.al3) this.race.avgLast3 = data.cs.al3;
          }
          if (serverLapCount > 0) this.race.myLaps = serverLapCount;
        }

        // Track all competitors
        if (rn) {
          if (!this._competitors) this._competitors = {};
          this._competitors[rn] = {
            rn: rn,
            fn: fn,
            pos: data.pos || 0,
            bestLap: data.cs?.bl || data.bl || 0,
            lastLap: data.cs?.ll || data.ll || 0,
            gap: data.pld ? (data.pld / 1000) : null,
          };
          // Gap behind: find car directly behind our position
          if (this.race.kartNumber && rn !== this.race.kartNumber) {
            const myPos = this.race.position;
            if (data.pos === myPos + 1) {
              this.race.gapBehind = data.pld ? Math.abs(data.pld / 1000) : null;
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
    _baseUrl: null,
    _driverName: null,
    _competitors: {},

    // ═══ DEMO MODE ═══
    startDemo() {
      this.saveSettings();
      this.view = 'race';
      this.requestWakeLock();

      // Set a demo track record that will be beaten mid-demo
      const baseLap = 29000 + Math.random() * 2000; // 29-31s base
      if (!this.settings.trackRecord) {
        // Set record ~2s faster than early laps but beatable at plateau
        this.settings.trackRecord = ((baseLap - 3800) / 1000).toFixed(3);
        this.saveSettings();
      }

      // Initialize demo race
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

      // Demo competitors for leaderboard
      this._competitors = {
        '1':  { rn: '1',  fn: 'Racer 01', pos: 1, bestLap: 28249, lastLap: 28670, gap: null },
        '3':  { rn: '3',  fn: 'Racer 03', pos: 2, bestLap: 28359, lastLap: 29100, gap: 1.7 },
        '10': { rn: '10', fn: this.settings.name || 'You', pos: 3, bestLap: 0, lastLap: 0, gap: 3.2 },
        '7':  { rn: '7',  fn: 'Racer 07', pos: 4, bestLap: 29878, lastLap: 31200, gap: 8.1 },
        '12': { rn: '12', fn: 'Racer 12', pos: 5, bestLap: 32211, lastLap: 34500, gap: 12.4 },
        '6':  { rn: '6',  fn: 'Racer 06', pos: 6, bestLap: 33500, lastLap: 35200, gap: 18.3 },
        '9':  { rn: '9',  fn: 'Racer 09', pos: 7, bestLap: 34100, lastLap: 36800, gap: 25.7 },
      };

      // Demo: lap every 3 seconds (accelerated), countdown scaled to match
      let lapCount = 0;
      const demoLaps = this.generateDemoLaps(baseLap, 18);
      const demoRealDuration = demoLaps.length * 4 + 4; // ~76 seconds real time (3-5s per lap + buffer)
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

        // Simulate other competitors' progress
        for (const rn of Object.keys(this._competitors)) {
          if (rn === this.race.kartNumber) continue;
          const c = this._competitors[rn];
          c.lastLap = c.bestLap + Math.round((Math.random() - 0.3) * 2000);
          if (c.lastLap < c.bestLap) c.bestLap = c.lastLap;
          if (c.gap !== null) c.gap = Math.max(0.1, c.gap + (Math.random() - 0.45) * 3);
        }
        // Update driver's gap based on improvement
        const me = this._competitors[this.race.kartNumber];
        if (me) {
          me.gap = Math.max(0, (me.gap ?? 3.2) + (Math.random() - 0.6) * 1.5);
        }
        // Recalculate positions by gap (lower gap = higher position)
        const all = Object.values(this._competitors).sort((a, b) => (a.gap ?? -1) - (b.gap ?? -1));
        all.forEach((c, i) => { c.pos = i + 1; });
        // Sync driver's position from leaderboard
        if (me) this.race.position = me.pos;

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
        if (i === count - 1) flag = 'Finish';

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

      // Keep our own competitor entry in sync
      if (this.race.kartNumber && this._competitors[this.race.kartNumber]) {
        this._competitors[this.race.kartNumber].pos = position || this._competitors[this.race.kartNumber].pos;
        this._competitors[this.race.kartNumber].lastLap = lapTime;
      }
      this.race.gapAhead = gapAhead;
      this.race.gapBehind = gapBehind;
      if (flag) {
        this.race.flag = flag;
        const flagTypeMap = { Green: 'green', Yellow: 'yellow', Blue: 'blue', Red: 'red', Finish: 'finish' };
        const type = flagTypeMap[flag] || 'green';
        if (flag !== 'Green') {
          this.race.flagType = type;
          this.race.flagMessage = this.t('flag_' + type) || flag;
          this.race.showFlagOverlay = true;
        }
      }
      if (penalty) this.race.penaltyTime += penalty;

      // Personal best check
      const wasBest = this.race.bestLap;
      if (this.race.bestLap === 0 || lapTime < this.race.bestLap) {
        this.race.bestLap = lapTime;
        this.race.isPersonalBest = this.race.myLaps > 1;
        // Update best lap in competitor entry
        if (this.race.kartNumber && this._competitors[this.race.kartNumber]) {
          this._competitors[this.race.kartNumber].bestLap = lapTime;
        }
      } else {
        this.race.isPersonalBest = false;
      }

      // Track record check
      const recordMs = parseFloat((this.settings.trackRecord || '').replace(',', '.')) * 1000;
      if (recordMs > 0 && lapTime > 0 && lapTime < recordMs && this.race.myLaps > 1) {
        this.settings.trackRecord = (lapTime / 1000).toFixed(3);
        this.saveSettings();
        this.race.showRecordCelebration = true;
        console.log(`NEW TRACK RECORD: ${this.settings.trackRecord}s`);
        setTimeout(() => { this.race.showRecordCelebration = false; }, 5000);
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

      // Hide overlay after 5s, but keep flag status in dots + label
      if (flag && flag !== 'Green') {
        setTimeout(() => { this.race.showFlagOverlay = false; }, 5000);
      }
      // Reset flag entirely after longer delay (Finish persists)
      if (flag && flag !== 'Green' && flag !== 'Finish') {
        const delay = flag === 'Red' ? 15000 : 10000;
        setTimeout(() => {
          this.race.flag = 'Green';
          this.race.flagMessage = '';
          this.race.flagType = '';
        }, delay);
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
      const min = Math.floor(totalSec / 60);
      const sec = totalSec - min * 60;
      const sep = this.settings.lang === 'ru' ? ',' : '.';

      let timeText = '';
      if (min > 0) {
        const secWhole = Math.floor(sec);
        const secFrac = Math.round((sec - secWhole) * 1000).toString().padStart(3, '0');
        timeText = min + ' ' + this.t('voiceMinute') + ' ' + secWhole + ' ' + this.t('voicePoint') + ' ' + secFrac;
      } else {
        const whole = Math.floor(sec);
        const frac = Math.round((sec - whole) * 1000).toString().padStart(3, '0');
        timeText = whole + ' ' + this.t('voicePoint') + ' ' + frac;
      }

      let text = '';
      if (this.settings.announceLap) text += timeText;
      if (this.race.isPersonalBest && this.settings.announceBest) text += '. ' + this.t('voiceBest');
      if (this.settings.announcePos && this.race.position) text += ' ... ' + this.t('voicePos') + ', ' + this.race.position;
      if (text) {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.2;
        const targetLang = LANGS[this.settings.lang]?._voice || 'en-US';
        u.lang = targetLang;
        // Explicitly set voice — Chrome ignores u.lang without this
        const voices = this._voices.length ? this._voices : speechSynthesis.getVoices();
        const langPrefix = targetLang.split('-')[0];
        const match = voices.find(v => v.lang === targetLang)
          || voices.find(v => v.lang.startsWith(langPrefix + '-'))
          || voices.find(v => v.lang.startsWith(langPrefix));
        if (match) u.voice = match;
        speechSynthesis.speak(u);
      }
    },

    // ═══ UI HELPERS ═══
    formatLap(ms) {
      if (!ms || ms <= 0) return '—';
      const totalSec = ms / 1000;
      const min = Math.floor(totalSec / 60);
      const sec = totalSec - min * 60;
      if (min > 0) {
        return `${min}:${sec.toFixed(3).padStart(6, '0')}`;
      }
      return sec.toFixed(3);
    },

    formatDelta(ms) {
      if (ms == null) return '';
      const sign = ms < 0 ? '' : '+';
      const abs = Math.abs(ms);
      const totalSec = abs / 1000;
      const min = Math.floor(totalSec / 60);
      const sec = totalSec - min * 60;
      if (min > 0) {
        return `${sign}${min}:${sec.toFixed(3).padStart(6, '0')}`;
      }
      return `${sign}${sec.toFixed(3)}`;
    },

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

    _resetRaceState() {
      this.race.lastLap = 0; this.race.bestLap = 0; this.race.avgLap = 0;
      this.race.avgLast3 = 0; this.race.delta = null; this.race.position = null;
      this.race.myLaps = 0; this.race.lapHistory = []; this.race.kartNumber = '';
      this.race.prevLap = 0; this.race.consistency = 0;
      this.race.scheduledTime = 0; this.race.timeToGo = 0; this.race.progress = 0;
      this.race.penaltyTime = 0; this.race.penaltyLaps = 0; this.race.isPersonalBest = false;
      this.race.gapAhead = null; this.race.gapBehind = null;
      this.race.flag = 'Green'; this.race.showFlagOverlay = false;
      this.race.showRecordCelebration = false;
      this.race.flagMessage = ''; this.race.flagType = '';
      this._competitors = {};
    },

    goToSettings() {
      // Disconnect cleanly
      if (this.hub) { this.hub.disconnect(); this.hub = null; }
      if (this.demoInterval) { clearInterval(this.demoInterval); this.demoInterval = null; }
      if (this.demoLapTimer) { clearTimeout(this.demoLapTimer); this.demoLapTimer = null; }
      if (this.racePoller) { clearInterval(this.racePoller); this.racePoller = null; }
      this._resetRaceState();
      this.currentRaceId = null;
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
