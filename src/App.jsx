import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Radio,
  Wifi,
  WifiOff,
  Zap,
  Gauge,
  Sliders,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  Play,
  Square,
  Flame,
  Layers,
  ChevronRight,
  Terminal,
  Cpu
} from 'lucide-react';

// Natural structural resonance frequency
const FN_RESONANCE = 3.2; // Hz

export default function App() {
  // Connection Config
  const [baseUrl, setBaseUrl] = useState('http://192.168.4.1');
  const [connectionStatus, setConnectionStatus] = useState('Offline'); // 'Connected' | 'Reconnecting' | 'Offline'
  const [mockMode, setMockMode] = useState(true);
  const [lastLatency, setLastLatency] = useState(0);

  // Telemetry Metrics
  const [telemetry, setTelemetry] = useState({
    ax: 0,
    ay: 0,
    az: 9.81,
    atotal: 9.81,
    gx: 0.01,
    gy: 0.02,
    gz: 0.01,
    gyroMag: 0.02,
    freqExc: 0.0,
    qFactor: 1.0,
    barrierState: 'RETRACTED', // 'DEPLOYED' | 'RETRACTED'
    motorSpeed: 0,
    timestamp: Date.now()
  });

  // Analytics & Peak tracking
  const [peakAtotal, setPeakAtotal] = useState(9.81);
  const [peakTimestamp, setPeakTimestamp] = useState(Date.now());

  // Motor & Controls
  const [motorSpeed, setMotorSpeed] = useState(0);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepStep, setSweepStep] = useState(70);
  const [earthquakeActive, setEarthquakeActive] = useState(false);

  // Waveform Scope Settings
  const [visibleChannels, setVisibleChannels] = useState({
    x: true,
    y: true,
    z: true,
    total: true
  });
  const [scopeScale, setScopeScale] = useState(25); // max +/- m/s² scale
  const [isScopePaused, setIsScopePaused] = useState(false);

  // Diagnostics log terminal
  const [logs, setLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString(), text: 'System boot: Structural Health Edge Node initialized.', type: 'info' },
    { id: 2, time: new Date().toLocaleTimeString(), text: `Structural fundamental mode configured: fn = ${FN_RESONANCE} Hz.`, type: 'info' }
  ]);

  // Rolling history buffer (60 samples)
  const historyRef = useRef(
    Array.from({ length: 60 }, (_, i) => ({
      index: i,
      ax: 0,
      ay: 0,
      az: 9.81,
      atotal: 9.81,
      qFactor: 1.0,
      time: Date.now() - (60 - i) * 150
    }))
  );

  const canvasRef = useRef(null);
  const sweepIntervalRef = useRef(null);
  const simEqTimeoutRef = useRef(null);
  const mockPhaseRef = useRef(0);
  const eqStartTimeRef = useRef(null);

  const addLog = useCallback((text, type = 'info') => {
    setLogs((prev) => [
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), text, type },
      ...prev.slice(0, 49)
    ]);
  }, []);

  // Determine structural health operational state
  const getSystemStatus = useCallback(() => {
    const deltaF = Math.abs(telemetry.freqExc - FN_RESONANCE);
    const isCritical =
      earthquakeActive ||
      telemetry.atotal > 22.0 ||
      telemetry.qFactor > 4.5 ||
      telemetry.barrierState === 'DEPLOYED';

    if (isCritical) {
      return {
        label: 'CRITICAL SEISMIC BREACH / BARRIER ENGAGED',
        badge: 'CRITICAL',
        color: 'border-rose-500 bg-rose-950/40 text-rose-400',
        dot: 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)] animate-pulse',
        bar: 'bg-rose-500',
        alertLevel: 4
      };
    }
    if (telemetry.freqExc > 0.8 && deltaF < 0.6) {
      return {
        label: `RESONANCE WARNING (Δf = ${deltaF.toFixed(2)} Hz from fn)`,
        badge: 'RESONANCE',
        color: 'border-amber-500 bg-amber-950/40 text-amber-300',
        dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] animate-ping',
        bar: 'bg-amber-400',
        alertLevel: 3
      };
    }
    if (telemetry.motorSpeed > 30 || telemetry.freqExc > 0.4) {
      return {
        label: 'MOTOR MECHANICAL HUM (Harmonic Excitation Active)',
        badge: 'MECHANICAL HUM',
        color: 'border-sky-500 bg-sky-950/40 text-sky-300',
        dot: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]',
        bar: 'bg-sky-400',
        alertLevel: 2
      };
    }
    return {
      label: 'NORMAL / STABLE (Quiescent Mode)',
      badge: 'STABLE',
      color: 'border-emerald-500/80 bg-emerald-950/40 text-emerald-400',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]',
      bar: 'bg-emerald-400',
      alertLevel: 1
    };
  }, [telemetry, earthquakeActive]);

  const currentStatus = getSystemStatus();

  // Send command to ESP32 or handle locally in mock
  const sendCommand = async (endpoint, param = '') => {
    const fullUrl = `${baseUrl.replace(/\/$/, '')}${endpoint}${param}`;
    addLog(`TX -> ${endpoint}${param}`, 'cmd');

    if (mockMode || connectionStatus === 'Offline') {
      // Local mock handling
      if (endpoint === '/set_speed') {
        const val = parseInt(param.replace('?val=', ''), 10) || 0;
        setMotorSpeed(val);
        setTelemetry((prev) => ({ ...prev, motorSpeed: val }));
      } else if (endpoint === '/barrier_down') {
        setTelemetry((prev) => ({ ...prev, barrierState: 'DEPLOYED' }));
        addLog('Actuator: Barrier safety deployment solenoid engaged.', 'warn');
      } else if (endpoint === '/barrier_up') {
        setTelemetry((prev) => ({ ...prev, barrierState: 'RETRACTED' }));
        addLog('Actuator: Barrier safety retracted to standby.', 'info');
      } else if (endpoint === '/sim_earthquake') {
        triggerSimulatedEarthquake();
      }
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(fullUrl, { signal: controller.signal, method: 'GET', mode: 'cors' });
      clearTimeout(timeoutId);
      if (res.ok) {
        addLog(`RX <- ${endpoint}: HTTP ${res.status}`, 'info');
      } else {
        addLog(`ERR <- ${endpoint}: HTTP ${res.status}`, 'error');
      }
    } catch (err) {
      addLog(`ERR -> ${endpoint}: ${err.name === 'AbortError' ? 'Timeout' : 'Network Failure'}`, 'error');
    }
  };

  // Simulated Earthquake Routine
  const triggerSimulatedEarthquake = () => {
    if (earthquakeActive) return;
    setEarthquakeActive(true);
    eqStartTimeRef.current = Date.now();
    addLog('CRITICAL: Seismic impulse triggered (Synthesizing P-wave & S-wave packets)', 'error');

    if (simEqTimeoutRef.current) clearTimeout(simEqTimeoutRef.current);
    simEqTimeoutRef.current = setTimeout(() => {
      setEarthquakeActive(false);
      eqStartTimeRef.current = null;
      addLog('Seismic ground motion dissipated. Restoring baseline monitoring.', 'info');
    }, 7500);
  };

  // Sweep Motor Routine
  const startSweep = () => {
    if (isSweeping) return;
    setIsSweeping(true);
    setSweepStep(70);
    sendCommand('/set_speed', `?val=70`);
    addLog('Automated Motor Sweep initiated (70 -> 255 PWM @ +10 / 250ms)', 'info');

    let currentVal = 70;
    if (sweepIntervalRef.current) clearInterval(sweepIntervalRef.current);

    sweepIntervalRef.current = setInterval(() => {
      currentVal += 10;
      if (currentVal > 255) {
        clearInterval(sweepIntervalRef.current);
        sweepIntervalRef.current = null;
        setIsSweeping(false);
        setSweepStep(255);
        sendCommand('/set_speed', `?val=255`);
        addLog('Automated Motor Sweep reached peak limit (255 PWM).', 'warn');
      } else {
        setSweepStep(currentVal);
        sendCommand('/set_speed', `?val=${currentVal}`);
      }
    }, 250);
  };

  const abortSweep = () => {
    if (sweepIntervalRef.current) {
      clearInterval(sweepIntervalRef.current);
      sweepIntervalRef.current = null;
    }
    setIsSweeping(false);
    sendCommand('/set_speed', `?val=0`);
    setMotorSpeed(0);
    addLog('Automated Motor Sweep aborted by operator. Motor ramped to 0.', 'warn');
  };

  // Generate synthetic telemetry matching structural dynamics
  const generateMockTelemetry = useCallback(() => {
    mockPhaseRef.current += 0.22;
    const t = mockPhaseRef.current;
    const currentSpeed = motorSpeed;

    // Motor frequency proportional to PWM (0 - 255 -> 0 - 5.5 Hz)
    const baseFreq = currentSpeed > 10 ? (currentSpeed / 255) * 5.2 : 0;
    const jitterF = (Math.random() - 0.5) * 0.08;
    const freqExc = Math.max(0, parseFloat((baseFreq + (baseFreq > 0 ? jitterF : 0)).toFixed(2)));

    // SDOF Dynamic Amplification model (zeta damping ~0.08)
    const r = freqExc > 0 ? freqExc / FN_RESONANCE : 0;
    const zeta = 0.085;
    let qFactor = 1.0;
    if (freqExc > 0.3) {
      const denom = Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(2 * zeta * r, 2));
      qFactor = Math.min(6.5, 1 / Math.max(denom, 0.16));
    }
    qFactor = parseFloat(qFactor.toFixed(2));

    // Base motor dynamic vibration amplitude
    const motorVib = (currentSpeed / 255) * 1.8 * (qFactor / 1.5);

    let ax = Math.sin(t * (freqExc * 1.8 + 1)) * motorVib + (Math.random() - 0.5) * 0.35;
    let ay = Math.cos(t * (freqExc * 1.8 + 1)) * (motorVib * 0.7) + (Math.random() - 0.5) * 0.35;
    let az = 9.81 + Math.sin(t * 3.2) * (motorVib * 0.4) + (Math.random() - 0.5) * 0.2;

    let gx = (Math.sin(t * 1.5) * motorVib * 0.04) + (Math.random() - 0.5) * 0.02;
    let gy = (Math.cos(t * 1.5) * motorVib * 0.04) + (Math.random() - 0.5) * 0.02;
    let gz = (Math.random() - 0.5) * 0.03;

    // Seismic wave synthesis if earthquake triggered
    let barrierState = telemetry.barrierState;
    if (earthquakeActive && eqStartTimeRef.current) {
      const elapsed = (Date.now() - eqStartTimeRef.current) / 1000;
      let eqAmp = 0;
      if (elapsed < 1.8) {
        // High frequency P-wave
        eqAmp = Math.sin(elapsed * 24.0) * 4.5 * Math.exp(-elapsed * 0.4);
        ax += eqAmp;
        ay += eqAmp * 0.6;
        az += eqAmp * 0.8;
      } else {
        // High amplitude S-wave / Surface wave (causes resonance breach)
        const sTime = elapsed - 1.8;
        eqAmp = Math.sin(sTime * 6.28 * 2.8) * 18.5 * Math.exp(-sTime * 0.55);
        ax += eqAmp;
        ay += eqAmp * 0.85;
        az += Math.cos(sTime * 4.0) * 6.0 * Math.exp(-sTime * 0.55);
        gx += eqAmp * 0.08;
        gy += eqAmp * 0.08;
      }

      // Auto-deploy barrier if seismic motion passes threshold
      if (Math.abs(eqAmp) > 9.0 && barrierState === 'RETRACTED') {
        barrierState = 'DEPLOYED';
      }
    }

    const atotal = Math.sqrt(ax * ax + ay * ay + az * az);
    const gyroMag = Math.sqrt(gx * gx + gy * gy + gz * gz);

    return {
      ax: parseFloat(ax.toFixed(2)),
      ay: parseFloat(ay.toFixed(2)),
      az: parseFloat(az.toFixed(2)),
      atotal: parseFloat(atotal.toFixed(2)),
      gx: parseFloat(gx.toFixed(3)),
      gy: parseFloat(gy.toFixed(3)),
      gz: parseFloat(gz.toFixed(3)),
      gyroMag: parseFloat(gyroMag.toFixed(3)),
      freqExc,
      qFactor,
      barrierState,
      motorSpeed: currentSpeed,
      timestamp: Date.now()
    };
  }, [motorSpeed, earthquakeActive, telemetry.barrierState]);

  // Main 150ms Telemetry Polling Loop
  useEffect(() => {
    let isSubscribed = true;
    const intervalMs = 150;

    const tick = async () => {
      const startTime = performance.now();

      if (mockMode) {
        const mockData = generateMockTelemetry();
        if (isSubscribed) {
          setConnectionStatus('Connected');
          setLastLatency(Math.round(performance.now() - startTime));
          updateTelemetryState(mockData);
        }
        return;
      }

      // Live ESP32 Request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 350);

      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/telemetry`, {
          signal: controller.signal,
          mode: 'cors'
        });
        clearTimeout(timeoutId);

        if (!isSubscribed) return;

        if (res.ok) {
          const data = await res.json();
          const latency = Math.round(performance.now() - startTime);
          setLastLatency(latency);
          setConnectionStatus('Connected');
          updateTelemetryState(data);
        } else {
          setConnectionStatus('Reconnecting');
          fallbackToSynthetic();
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (!isSubscribed) return;
        setConnectionStatus((prev) => (prev === 'Connected' ? 'Reconnecting' : 'Offline'));
        // Fallback to synthetic if hardware is unreachable
        fallbackToSynthetic();
      }
    };

    const fallbackToSynthetic = () => {
      const synthetic = generateMockTelemetry();
      updateTelemetryState(synthetic);
    };

    const updateTelemetryState = (data) => {
      setTelemetry(data);

      // Track all-time peak vector acceleration
      setPeakAtotal((prev) => {
        if (data.atotal > prev) {
          setPeakTimestamp(Date.now());
          return data.atotal;
        }
        return prev;
      });

      // Push into rolling history buffer
      if (!isScopePaused) {
        const buffer = historyRef.current;
        const nextIndex = buffer[buffer.length - 1].index + 1;
        buffer.shift();
        buffer.push({
          index: nextIndex,
          ax: data.ax,
          ay: data.ay,
          az: data.az,
          atotal: data.atotal,
          qFactor: data.qFactor,
          time: data.timestamp
        });
      }
    };

    const timerId = setInterval(tick, intervalMs);

    return () => {
      isSubscribed = false;
      clearInterval(timerId);
    };
  }, [baseUrl, mockMode, isScopePaused, generateMockTelemetry]);

  // High-performance Canvas Waveform Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId;
    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const buffer = historyRef.current;
      const len = buffer.length;

      // Dark background
      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid & Scale Lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#1e293b';
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';

      const numGridY = 6;
      for (let i = 0; i <= numGridY; i++) {
        const y = (height / numGridY) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        // Label value
        const val = scopeScale - (i * (2 * scopeScale)) / numGridY;
        ctx.fillText(`${val > 0 ? '+' : ''}${val.toFixed(0)} m/s²`, 8, y - 3);
      }

      // Zero and 1g line references
      const zeroY = height / 2;
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(width, zeroY);
      ctx.stroke();

      // Earth gravity (+9.81 m/s²) line
      const gY = zeroY - (9.81 / scopeScale) * (height / 2);
      if (gY >= 0 && gY <= height) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.beginPath();
        ctx.moveTo(0, gY);
        ctx.lineTo(width, gY);
        ctx.stroke();
        ctx.fillText('1.0g Ref (9.81 m/s²)', width - 110, gY - 4);
      }
      ctx.setLineDash([]);

      // Vertical time grid lines
      const numGridX = 10;
      for (let j = 0; j <= numGridX; j++) {
        const x = (width / numGridX) * j;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Helper for channel plotting
      const plotChannel = (key, color, glowColor) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;

        for (let i = 0; i < len; i++) {
          const sample = buffer[i];
          const x = (i / (len - 1)) * width;
          const val = sample[key] || 0;
          // Normalize to center (0 m/s² at height/2)
          const y = zeroY - (val / scopeScale) * (height / 2);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset glow
      };

      // Render Active Channels
      if (visibleChannels.x) plotChannel('ax', '#10b981', '#10b981'); // Emerald
      if (visibleChannels.y) plotChannel('ay', '#f59e0b', '#f59e0b'); // Amber
      if (visibleChannels.z) plotChannel('az', '#38bdf8', '#38bdf8'); // Cyan
      if (visibleChannels.total) plotChannel('atotal', '#f43f5e', '#f43f5e'); // Rose (Total Vector)

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [visibleChannels, scopeScale]);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Top Cyber Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-[#0e1424]/90 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Radio className="w-5 h-5 animate-pulse text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-wider text-slate-50 uppercase flex items-center gap-2">
                Aegis-SHM
                <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  ESP32 EDGE v2.4
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Structural Resonance & Dynamic Seismic Protection System
            </p>
          </div>
        </div>

        {/* Global Connection & Mock Control Bar */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {/* Base URL input */}
          <div className="flex items-center bg-[#121a2f] border border-slate-700/80 rounded-lg px-2.5 py-1">
            <span className="text-xs font-mono text-slate-400 mr-2">NODE IP:</span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="bg-transparent text-xs font-mono text-sky-300 focus:outline-none w-32 md:w-36"
              placeholder="http://192.168.4.1"
            />
          </div>

          {/* Connection Status Pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-medium ${
              connectionStatus === 'Connected'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : connectionStatus === 'Reconnecting'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            }`}
          >
            {connectionStatus === 'Connected' ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : connectionStatus === 'Reconnecting' ? (
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>{connectionStatus.toUpperCase()}</span>
            {connectionStatus === 'Connected' && (
              <span className="text-[10px] text-slate-400">({lastLatency}ms)</span>
            )}
          </div>

          {/* Mock Mode Switch */}
          <label className="flex items-center gap-2 cursor-pointer bg-[#121a2f] border border-slate-700/80 px-3 py-1 rounded-lg hover:border-slate-600 transition">
            <input
              type="checkbox"
              checked={mockMode}
              onChange={(e) => {
                setMockMode(e.target.checked);
                addLog(`Mode switched: ${e.target.checked ? 'SYNTHETIC MOCK' : 'HARDWARE PROBE'}`, 'warn');
              }}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-500 relative"></div>
            <span className="text-xs font-mono text-slate-300">MOCK SIM</span>
          </label>
        </div>
      </header>

      {/* Dynamic System Status Banner */}
      <div className="px-4 lg:px-8 pt-4">
        <div
          className={`w-full rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 ${currentStatus.color}`}
        >
          <div className="flex items-center gap-3">
            <span className={`w-3.5 h-3.5 rounded-full ${currentStatus.dot}`}></span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-black/40 border border-current">
                  {currentStatus.badge}
                </span>
                <span className="font-semibold text-sm md:text-base tracking-wide">
                  {currentStatus.label}
                </span>
              </div>
              <p className="text-xs text-slate-300/80 mt-0.5 font-mono">
                Structural Natural Target: {FN_RESONANCE} Hz | Excitation: {telemetry.freqExc.toFixed(2)} Hz | Q-Ratio: {telemetry.qFactor.toFixed(2)}x
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono bg-black/30 px-3 py-2 rounded-lg border border-white/5">
            <div>
              <span className="text-slate-400 block">SAFETY BARRIER</span>
              <span
                className={`font-bold flex items-center gap-1 ${
                  telemetry.barrierState === 'DEPLOYED' ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {telemetry.barrierState === 'DEPLOYED' ? (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" /> DEPLOYED (SAFE)
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" /> RETRACTED
                  </>
                )}
              </span>
            </div>
            <div className="h-6 w-px bg-slate-700"></div>
            <div>
              <span className="text-slate-400 block">MOTOR PWM</span>
              <span className="font-bold text-sky-300">{telemetry.motorSpeed} / 255</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <main className="flex-1 p-4 lg:p-8 space-y-6">
        {/* Row 1: Telemetry & Edge Analytics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Dominant Excitation Frequency */}
          <div className="bg-[#121a2f] border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-300">
                <Activity className="w-4 h-4 text-sky-400" /> Dominant Freq (f_exc)
              </span>
              <span className="font-mono text-slate-400">fn = {FN_RESONANCE} Hz</span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-sky-400">
                  {telemetry.freqExc.toFixed(2)}
                </span>
                <span className="text-sm font-mono text-slate-400">Hz</span>
              </div>
              <div className="mt-2 text-xs font-mono flex items-center justify-between text-slate-400">
                <span>Resonance Offset (Δf):</span>
                <span
                  className={`font-semibold ${
                    Math.abs(telemetry.freqExc - FN_RESONANCE) < 0.6
                      ? 'text-amber-400'
                      : 'text-slate-300'
                  }`}
                >
                  {Math.abs(telemetry.freqExc - FN_RESONANCE).toFixed(2)} Hz
                </span>
              </div>
            </div>
            {/* Visual Bar towards Resonance */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  Math.abs(telemetry.freqExc - FN_RESONANCE) < 0.6 ? 'bg-amber-400' : 'bg-sky-400'
                }`}
                style={{
                  width: `${Math.min(100, (telemetry.freqExc / (FN_RESONANCE * 1.5)) * 100)}%`
                }}
              ></div>
            </div>
          </div>

          {/* Card 2: Dynamic Amplification Factor (Q) */}
          <div className="bg-[#121a2f] border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-300">
                <Flame className="w-4 h-4 text-amber-400" /> Dynamic Amplification (Q)
              </span>
              <span className="font-mono text-slate-400">Ratio a_dyn / g</span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-3xl font-bold font-mono ${
                    telemetry.qFactor > 3.0 ? 'text-amber-400' : 'text-slate-100'
                  }`}
                >
                  {telemetry.qFactor.toFixed(2)}
                </span>
                <span className="text-sm font-mono text-slate-400">x</span>
              </div>
              <div className="mt-2 text-xs font-mono flex items-center justify-between text-slate-400">
                <span>Damping Ratio (ζ):</span>
                <span className="font-semibold text-slate-300">8.5% (Structure)</span>
              </div>
            </div>
            {/* Visual Bar */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  telemetry.qFactor > 4.0
                    ? 'bg-rose-500'
                    : telemetry.qFactor > 2.5
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.min(100, (telemetry.qFactor / 6.0) * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Card 3: Peak Vector Acceleration */}
          <div className="bg-[#121a2f] border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-300">
                <Gauge className="w-4 h-4 text-rose-400" /> Vector Total (a_total)
              </span>
              <button
                onClick={() => {
                  setPeakAtotal(telemetry.atotal);
                  setPeakTimestamp(Date.now());
                  addLog('Peak vector acceleration register reset.', 'info');
                }}
                className="text-slate-400 hover:text-slate-200 transition flex items-center gap-1 text-[11px]"
                title="Reset Peak Value"
              >
                <RotateCcw className="w-3 h-3" /> RESET
              </button>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-rose-400">
                  {telemetry.atotal.toFixed(2)}
                </span>
                <span className="text-sm font-mono text-slate-400">m/s²</span>
              </div>
              <div className="mt-2 text-xs font-mono flex items-center justify-between text-slate-400">
                <span>All-Time Peak Recorded:</span>
                <span className="font-semibold text-rose-300">{peakAtotal.toFixed(2)} m/s²</span>
              </div>
            </div>
            {/* Visual Acceleration gauge */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-150"
                style={{ width: `${Math.min(100, (telemetry.atotal / 30.0) * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Card 4: Tilt / Angular Velocity */}
          <div className="bg-[#121a2f] border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-300">
                <Layers className="w-4 h-4 text-emerald-400" /> Gyro Velocity & Tilt
              </span>
              <span className="font-mono text-slate-400">MPU6050</span>
            </div>
            <div className="my-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-emerald-400">
                  {telemetry.gyroMag.toFixed(3)}
                </span>
                <span className="text-sm font-mono text-slate-400">rad/s</span>
              </div>
              <div className="mt-2 text-xs font-mono grid grid-cols-3 gap-1 text-slate-400">
                <span>Gx: {telemetry.gx.toFixed(2)}</span>
                <span>Gy: {telemetry.gy.toFixed(2)}</span>
                <span>Gz: {telemetry.gz.toFixed(2)}</span>
              </div>
            </div>
            {/* Gyro bar */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-150"
                style={{ width: `${Math.min(100, (telemetry.gyroMag / 1.5) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Row 2: Live Dynamic Waveform Visualizer (Strip Chart / Oscilloscope) */}
        <div className="bg-[#0e1424] border border-slate-800 rounded-xl p-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  STRUCTURAL ACCELERATION WAVEFORM VISUALIZER
                  <span className="text-[11px] font-mono font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    60 SAMPLES ROLLING WINDOW (150ms DT)
                  </span>
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Real-time triaxial MEMS accelerometer stream calibrated in m/s²
                </p>
              </div>
            </div>

            {/* Scope Control Toolbar */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              {/* Channel Toggles */}
              <div className="flex items-center gap-1.5 bg-[#121a2f] border border-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setVisibleChannels((p) => ({ ...p, x: !p.x }))}
                  className={`px-2 py-1 rounded transition flex items-center gap-1.5 ${
                    visibleChannels.x
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Acc X: {telemetry.ax.toFixed(1)}
                </button>
                <button
                  onClick={() => setVisibleChannels((p) => ({ ...p, y: !p.y }))}
                  className={`px-2 py-1 rounded transition flex items-center gap-1.5 ${
                    visibleChannels.y
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> Acc Y: {telemetry.ay.toFixed(1)}
                </button>
                <button
                  onClick={() => setVisibleChannels((p) => ({ ...p, z: !p.z }))}
                  className={`px-2 py-1 rounded transition flex items-center gap-1.5 ${
                    visibleChannels.z
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span> Acc Z: {telemetry.az.toFixed(1)}
                </button>
                <button
                  onClick={() => setVisibleChannels((p) => ({ ...p, total: !p.total }))}
                  className={`px-2 py-1 rounded transition flex items-center gap-1.5 ${
                    visibleChannels.total
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span> Total: {telemetry.atotal.toFixed(1)}
                </button>
              </div>

              {/* Scale Selector */}
              <div className="flex items-center bg-[#121a2f] border border-slate-800 rounded-lg px-2 py-1">
                <span className="text-slate-400 mr-2 text-[11px]">RANGE:</span>
                <select
                  value={scopeScale}
                  onChange={(e) => setScopeScale(Number(e.target.value))}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value={15} className="bg-slate-900">±15 m/s²</option>
                  <option value={25} className="bg-slate-900">±25 m/s²</option>
                  <option value={50} className="bg-slate-900">±50 m/s²</option>
                </select>
              </div>

              {/* Pause / Resume Button */}
              <button
                onClick={() => setIsScopePaused((p) => !p)}
                className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
                  isScopePaused
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {isScopePaused ? <Play className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                {isScopePaused ? 'RESUME' : 'FREEZE'}
              </button>
            </div>
          </div>

          {/* HTML5 Canvas Strip Chart */}
          <div className="relative w-full rounded-lg overflow-hidden border border-slate-800 bg-[#0b1120]">
            <canvas
              ref={canvasRef}
              width={1000}
              height={320}
              className="w-full h-64 md:h-80 block"
            />
            {/* Live readout badge overlay */}
            <div className="absolute bottom-2 left-3 flex items-center gap-3 text-[11px] font-mono bg-black/60 backdrop-blur-sm px-3 py-1 rounded border border-white/10 text-slate-300">
              <span>SAMPLING: 6.67 Hz</span>
              <span>•</span>
              <span>FILTER: 4-POLE BESSEL LPF</span>
              <span>•</span>
              <span className="text-sky-400">EDGE FFT BUFFER ACTIVE</span>
            </div>
          </div>
        </div>

        {/* Row 3: Motor Frequency Sweep & Actuator Control Panel + Terminal Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Actuator & Motor Panel (2 cols) */}
          <div className="lg:col-span-2 bg-[#0e1424] border border-slate-800 rounded-xl p-5 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-sky-400" />
                <h2 className="font-bold text-base text-slate-100">
                  MOTOR FREQUENCY SWEEP & ACTUATOR CONTROL PANEL
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-sky-400" /> PWM TIMER 1 (GPIO 18 / 23)
              </span>
            </div>

            {/* Motor Speed Slider */}
            <div className="space-y-3 bg-[#121a2f] p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="motor-slider" className="font-semibold text-slate-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" /> Motor Speed PWM Duty Cycle
                </label>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-xs text-slate-400">VALUE:</span>
                  <span className="text-lg font-bold text-sky-400">{motorSpeed}</span>
                  <span className="text-xs text-slate-500">/ 255</span>
                  <span className="text-xs text-slate-400 ml-2">
                    (~{((motorSpeed / 255) * 5.2).toFixed(2)} Hz)
                  </span>
                </div>
              </div>

              <input
                id="motor-slider"
                type="range"
                min="0"
                max="255"
                value={motorSpeed}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMotorSpeed(val);
                  sendCommand('/set_speed', `?val=${val}`);
                }}
                disabled={isSweeping}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400 disabled:opacity-50"
              />

              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>0 (Stopped)</span>
                <span className="text-sky-400">~80 (1.6 Hz)</span>
                <span className="text-amber-400 font-bold">155 (fn ~3.2 Hz Resonance)</span>
                <span>255 (Max 5.2 Hz)</span>
              </div>
            </div>

            {/* Automated Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Automated Sweep Button */}
              <div className="p-4 rounded-xl bg-[#121a2f] border border-slate-800/80 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-200 mb-1 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sky-400" /> Frequency Sweep Routine
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Automated sweep ramping PWM from 70 to 255 in +10 discrete steps every 250ms to verify structural resonance curves.
                  </p>
                </div>

                {isSweeping ? (
                  <button
                    onClick={abortSweep}
                    className="w-full py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-lg shadow-rose-900/40"
                  >
                    <Square className="w-4 h-4" /> Abort Sweep (Currently: {sweepStep} PWM)
                  </button>
                ) : (
                  <button
                    onClick={startSweep}
                    className="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-lg shadow-sky-900/30"
                  >
                    <Play className="w-4 h-4" /> Sweep Frequencies (Slow → High)
                  </button>
                )}
              </div>

              {/* Seismic Earthquake Simulator */}
              <div className="p-4 rounded-xl bg-[#121a2f] border border-slate-800/80 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-200 mb-1 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-rose-400" /> Seismic Wave Emulator
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Inject synthetic earthquake P/S-wave motion packet to trigger dynamic threshold trip and test barrier deployment.
                  </p>
                </div>

                <button
                  onClick={() => sendCommand('/sim_earthquake')}
                  disabled={earthquakeActive}
                  className={`w-full py-2.5 px-4 rounded-lg font-semibold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 ${
                    earthquakeActive
                      ? 'bg-rose-950 border border-rose-500/50 text-rose-300 animate-pulse cursor-not-allowed'
                      : 'bg-gradient-to-r from-rose-700 to-amber-700 hover:from-rose-600 hover:to-amber-600 text-white shadow-lg shadow-rose-950/50'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  {earthquakeActive ? 'SEISMIC EVENT IN PROGRESS...' : 'Simulate Earthquake Impulse'}
                </button>
              </div>
            </div>

            {/* Actuator Override Buttons */}
            <div className="p-4 rounded-xl bg-[#121a2f] border border-slate-800/80">
              <h3 className="font-bold text-sm text-slate-200 mb-1 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-400" /> Physical Safety Barrier Override
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Direct manual control for physical fail-safe barrier solenoid actuator.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => sendCommand('/barrier_down')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold uppercase tracking-wider transition flex items-center justify-center gap-2 border ${
                    telemetry.barrierState === 'DEPLOYED'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 text-rose-400" /> Deploy Barrier (/barrier_down)
                </button>

                <button
                  onClick={() => sendCommand('/barrier_up')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold uppercase tracking-wider transition flex items-center justify-center gap-2 border ${
                    telemetry.barrierState === 'RETRACTED'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Retract Barrier (/barrier_up)
                </button>
              </div>
            </div>
          </div>

          {/* Diagnostics Console & Event Logs (1 col) */}
          <div className="bg-[#0e1424] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2 text-slate-200">
                <Terminal className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-sm">EDGE EVENT LOG</h3>
              </div>
              <button
                onClick={() => setLogs([])}
                className="text-[11px] font-mono text-slate-500 hover:text-slate-300"
              >
                CLEAR
              </button>
            </div>

            {/* Scrollable Log Feed */}
            <div className="flex-1 bg-[#090d16] rounded-lg p-3 font-mono text-xs overflow-y-auto max-h-[380px] space-y-1.5 border border-slate-800/80">
              {logs.length === 0 ? (
                <div className="text-slate-600 italic">No events captured.</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="leading-relaxed flex items-start gap-1.5">
                    <span className="text-slate-500 text-[10px] select-none pt-0.5">[{log.time}]</span>
                    <span
                      className={`break-all ${
                        log.type === 'error'
                          ? 'text-rose-400 font-semibold'
                          : log.type === 'warn'
                          ? 'text-amber-300'
                          : log.type === 'cmd'
                          ? 'text-sky-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Hardware Status Specs */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>MCU TARGET:</span>
                <span className="text-slate-200">ESP32-WROOM-32D (240MHz)</span>
              </div>
              <div className="flex justify-between">
                <span>IMU SENSOR:</span>
                <span className="text-slate-200">MPU6050 (I2C 400kHz FastMode)</span>
              </div>
              <div className="flex justify-between">
                <span>POLL INTERVAL:</span>
                <span className="text-sky-400">150 ms (Buffered GET /telemetry)</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Cyber Industrial Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0e1424] px-4 lg:px-8 py-3 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>STRUCTURAL HEALTH & SEISMIC MONITORING PROTOCOL ONLINE</span>
        </div>
        <div>NATURAL RESONANCE FN = 3.20 HZ • MPU6050 TELEMETRY ENGINE</div>
      </footer>
    </div>
  );
}
