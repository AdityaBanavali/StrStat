import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEspTelemetry } from './hooks/useEspTelemetry';
import { ConnectionBar } from './components/ConnectionBar';
import { TelemetryGraph } from './components/TelemetryGraph';
import { FrequencySpectrum } from './components/FrequencySpectrum';
import { TiltVisualizer } from './components/TiltVisualizer';
import { InferenceCard } from './components/InferenceCard';
import { ActuatorStatus } from './components/ActuatorStatus';
import { EventLog } from './components/EventLog';
import { EventLogItem, InferenceState } from './types';
import { ShieldAlert, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function App() {
  const [endpoint, setEndpoint] = useState<string>('http://192.168.4.1');
  const [mockEnabled, setMockEnabled] = useState<boolean>(false); // STRICTLY false by default

  const {
    telemetry,
    connectionStatus,
    latencyMs,
    history,
    packetCount,
    dropCount,
    sendCommand
  } = useEspTelemetry({
    endpoint,
    mockEnabled,
    pollIntervalMs: 150
  });

  const [logs, setLogs] = useState<EventLogItem[]>([
    {
      id: 'boot-1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: 'Aegis-SHM Console initialized. Target link: http://192.168.4.1'
    }
  ]);

  const prevStateRef = useRef<InferenceState | null>(null);
  const prevBarrierRef = useRef<boolean | null>(null);

  const addLog = useCallback(
    (message: string, type: EventLogItem['type'] = 'INFO') => {
      setLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString(),
          type,
          message
        },
        ...prev.slice(0, 99)
      ]);
    },
    []
  );

  // Auto-log status changes
  useEffect(() => {
    if (!telemetry) return;

    const curState = telemetry.inference.state;
    if (prevStateRef.current && prevStateRef.current !== curState) {
      if (curState === 'SEISMIC_EVENT') {
        addLog(`CRITICAL: Seismic acceleration breach detected by TinyML!`, 'CRITICAL');
      } else if (curState === 'RESONANCE_WARNING') {
        addLog(
          `WARNING: Harmonic frequency match near structural resonance (f = ${telemetry.fft.dominant_freq_hz} Hz)`,
          'WARN'
        );
      } else if (curState === 'NOMINAL') {
        addLog(`Status restored: Nominal structural vibration baseline.`, 'INFO');
      }
    }
    prevStateRef.current = curState;

    const barrier = telemetry.actuator.safety_barrier_deployed;
    if (prevBarrierRef.current !== null && prevBarrierRef.current !== barrier) {
      if (barrier) {
        addLog(`ACTUATOR EVENT: Physical safety barrier deployed via edge trip.`, 'CRITICAL');
      } else {
        addLog(`ACTUATOR EVENT: Safety barrier retracted to standby.`, 'INFO');
      }
    }
    prevBarrierRef.current = barrier;
  }, [telemetry, addLog]);

  const isConnected = connectionStatus === 'CONNECTED';

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Top Technical Status & Connection Bar */}
      <ConnectionBar
        endpoint={endpoint}
        onEndpointChange={setEndpoint}
        status={connectionStatus}
        latencyMs={latencyMs}
        inferenceLatencyMs={telemetry?.inference.inference_latency_ms ?? null}
        packetCount={packetCount}
        dropCount={dropCount}
        mockEnabled={mockEnabled}
        onToggleMock={() => {
          setMockEnabled((v) => {
            const next = !v;
            addLog(`Operator toggled Mock Dev Stream: ${next ? 'ACTIVATED' : 'DEACTIVATED'}`, 'COMMAND');
            return next;
          });
        }}
        onReconnect={() => {
          addLog(`Probing edge node at ${endpoint}...`, 'COMMAND');
        }}
      />

      {/* Main Mission Control Grid */}
      <main className="flex-1 p-4 lg:p-6 space-y-4 max-w-[1700px] w-full mx-auto">
        {/* Row 1: Primary Waveform Stream */}
        <TelemetryGraph
          history={history}
          isConnected={isConnected}
          currentAccel={telemetry?.imu.accel}
        />

        {/* Row 2: Frequency Resonance & Gyroscope Reticle */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FrequencySpectrum
            fft={telemetry?.fft}
            isConnected={isConnected}
          />
          <TiltVisualizer
            pitch={telemetry?.imu.tilt.pitch}
            roll={telemetry?.imu.tilt.roll}
            isConnected={isConnected}
          />
        </div>

        {/* Row 3: TinyML Inference & Actuator Trip Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InferenceCard
            inference={telemetry?.inference}
            isConnected={isConnected}
          />
          <ActuatorStatus
            actuator={telemetry?.actuator}
            isConnected={isConnected}
            onSendCommand={sendCommand}
            onLogEvent={addLog}
          />
        </div>

        {/* Row 4: Event & Incident Log */}
        <EventLog
          logs={logs}
          onClear={() => setLogs([])}
        />
      </main>

      {/* Technical Sub-Footer */}
      <footer className="border-t border-[#1F2430] bg-[#0B0D13] px-4 lg:px-6 py-2.5 text-[11px] font-mono text-slate-500 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-none transform rotate-45 ${
              isConnected ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          ></span>
          <span>
            {isConnected
              ? 'ESP32 TELEMETRY STREAM ACTIVE // REAL RAW HARVEST'
              : 'OFFLINE // DISCONNECTED FROM EDGE HARDWARE'}
          </span>
        </div>
        <div>TINYML RUNTIME: TFLITE MICRO • SENSOR: MPU6050 I2C 400KHZ</div>
      </footer>
    </div>
  );
}
