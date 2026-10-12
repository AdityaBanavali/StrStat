import React, { useRef, useEffect, useState } from 'react';
import { Activity, Radio, EyeOff, Layers } from 'lucide-react';
import { AccelSample } from '../types';

interface TelemetryGraphProps {
  history: AccelSample[];
  isConnected: boolean;
  currentAccel?: { x: number; y: number; z: number };
}

export const TelemetryGraph: React.FC<TelemetryGraphProps> = ({
  history,
  isConnected,
  currentAccel
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [channels, setChannels] = useState({
    x: true,
    y: true,
    z: true,
    total: true
  });
  const [scaleG, setScaleG] = useState<number>(2.0); // +/- g scale

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const zeroY = h / 2;

      // Dark canvas fill
      ctx.fillStyle = '#0B0D13';
      ctx.fillRect(0, 0, w, h);

      // Technical Grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#181C26';
      ctx.fillStyle = '#475569';
      ctx.font = '10px JetBrains Mono, monospace';

      // Horizontal scale lines
      const divisionsY = 6;
      for (let i = 0; i <= divisionsY; i++) {
        const y = (h / divisionsY) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        const gVal = scaleG - (i * (2 * scaleG)) / divisionsY;
        ctx.fillText(`${gVal > 0 ? '+' : ''}${gVal.toFixed(1)}g`, 8, y - 4);
      }

      // Zero baseline
      ctx.strokeStyle = '#272F40';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(w, zeroY);
      ctx.stroke();

      // Earth gravity reference (1.0g = 9.81 m/s²)
      const g1Y = zeroY - (1.0 / scaleG) * (h / 2);
      if (g1Y >= 0 && g1Y <= h) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.beginPath();
        ctx.moveTo(0, g1Y);
        ctx.lineTo(w, g1Y);
        ctx.stroke();
        ctx.fillText('1.0g STATIC DATUM', w - 120, g1Y - 4);
      }
      ctx.setLineDash([]);

      // Vertical time lines
      const divisionsX = 10;
      for (let j = 0; j <= divisionsX; j++) {
        const x = (w / divisionsX) * j;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Draw waveforms if connected and data exists
      if (isConnected && history.length > 1) {
        const len = history.length;
        const maxPoints = 100;
        const stepX = w / (maxPoints - 1);
        const startX = w - (len - 1) * stepX;

        const plot = (key: 'x' | 'y' | 'z' | 'total', color: string) => {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;

          for (let i = 0; i < len; i++) {
            const x = startX + i * stepX;
            const val = history[i][key];
            const y = zeroY - (val / scaleG) * (h / 2);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        };

        if (channels.x) plot('x', '#10B981'); // Emerald
        if (channels.y) plot('y', '#F59E0B'); // Amber
        if (channels.z) plot('z', '#38BDF8'); // Cyan
        if (channels.total) plot('total', '#EF4444'); // Crimson
      } else {
        // Flatline zero indicator when offline
        ctx.beginPath();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.moveTo(0, zeroY);
        ctx.lineTo(w, zeroY);
        ctx.stroke();
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [history, isConnected, channels, scaleG]);

  return (
    <div className="bg-[#111318] border border-[#1F2430] rounded p-4 flex flex-col justify-between relative">
      {/* Top Controls & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-[#1F2430] pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-mono font-semibold tracking-wider text-slate-200 uppercase">
            TRI-AXIAL ACCELERATION STREAM // MPU6050
          </h2>
          <span className="text-[10px] font-mono text-slate-500 bg-[#090A0F] px-2 py-0.5 rounded border border-[#1F2430]">
            100 SAMPLES ROLLING
          </span>
        </div>

        {/* Channel Selection & Scale */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <div className="flex items-center gap-1 bg-[#090A0F] border border-[#1F2430] rounded p-0.5">
            <button
              onClick={() => setChannels((p) => ({ ...p, x: !p.x }))}
              className={`px-2 py-0.5 rounded text-[11px] transition flex items-center gap-1 ${
                channels.x ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40' : 'text-slate-600'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span> X: {isConnected && currentAccel ? `${currentAccel.x.toFixed(2)}g` : '--'}
            </button>
            <button
              onClick={() => setChannels((p) => ({ ...p, y: !p.y }))}
              className={`px-2 py-0.5 rounded text-[11px] transition flex items-center gap-1 ${
                channels.y ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40' : 'text-slate-600'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span> Y: {isConnected && currentAccel ? `${currentAccel.y.toFixed(2)}g` : '--'}
            </button>
            <button
              onClick={() => setChannels((p) => ({ ...p, z: !p.z }))}
              className={`px-2 py-0.5 rounded text-[11px] transition flex items-center gap-1 ${
                channels.z ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'text-slate-600'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span> Z: {isConnected && currentAccel ? `${currentAccel.z.toFixed(2)}g` : '--'}
            </button>
            <button
              onClick={() => setChannels((p) => ({ ...p, total: !p.total }))}
              className={`px-2 py-0.5 rounded text-[11px] transition flex items-center gap-1 ${
                channels.total ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40' : 'text-slate-600'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span> |a|
            </button>
          </div>

          <div className="flex items-center bg-[#090A0F] border border-[#1F2430] rounded px-2 py-0.5 text-[11px]">
            <span className="text-slate-500 mr-1.5">SCALE:</span>
            <select
              value={scaleG}
              onChange={(e) => setScaleG(Number(e.target.value))}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value={1.5} className="bg-[#111318]">±1.5g</option>
              <option value={2.0} className="bg-[#111318]">±2.0g</option>
              <option value={4.0} className="bg-[#111318]">±4.0g</option>
              <option value={8.0} className="bg-[#111318]">±8.0g</option>
            </select>
          </div>
        </div>
      </div>

      {/* Oscilloscope Canvas Area */}
      <div className="relative w-full rounded border border-[#1F2430] bg-[#0B0D13] overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1000}
          height={260}
          className="w-full h-56 md:h-64 block"
        />

        {/* Disconnected / Zero-Data Overlay */}
        {!isConnected && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-[1px] flex flex-col items-center justify-center p-4">
            <div className="border border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444] px-4 py-2 rounded flex items-center gap-2 text-xs font-mono tracking-wider uppercase mb-2">
              <EyeOff className="w-4 h-4" />
              NO ACTIVE TELEMETRY - AWAITING SENSOR STREAM
            </div>
            <p className="text-[11px] text-slate-500 font-mono text-center max-w-md">
              Chart flatlined. Connect to an active ESP32 edge node or toggle MOCK DEV FEED for synthetic verification.
            </p>
          </div>
        )}
      </div>

      {/* Footer Info Strip */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>DYNAMIC STRIP BUFFER: 100 POINTS</span>
        </div>
        <div>CALIBRATION: ±2g FULL SCALE • 16-BIT ADC</div>
      </div>
    </div>
  );
};
