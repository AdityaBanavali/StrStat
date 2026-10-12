import { useState, useEffect, useRef, useCallback } from 'react';
import { EspTelemetryPayload, AccelSample, ConnectionStatus } from '../types';

interface UseEspTelemetryOptions {
  endpoint: string;
  mockEnabled?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export function useEspTelemetry({
  endpoint,
  mockEnabled = false,
  pollIntervalMs = 150,
  timeoutMs = 500
}: UseEspTelemetryOptions) {
  const [telemetry, setTelemetry] = useState<EspTelemetryPayload | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [history, setHistory] = useState<AccelSample[]>([]);
  const [packetCount, setPacketCount] = useState<number>(0);
  const [dropCount, setDropCount] = useState<number>(0);

  const consecutiveFailuresRef = useRef<number>(0);
  const mockPhaseRef = useRef<number>(0);

  // Command sender (REST POST/GET or WebSocket)
  const sendCommand = useCallback(
    async (path: string, body?: Record<string, unknown>): Promise<boolean> => {
      if (mockEnabled) {
        // Handle mock state locally
        if (path === '/actuator/barrier' && telemetry) {
          const nextDeployed = !(body?.deployed ?? true);
          setTelemetry((prev) =>
            prev
              ? {
                  ...prev,
                  actuator: { ...prev.actuator, safety_barrier_deployed: !prev.actuator.safety_barrier_deployed }
                }
              : null
          );
        }
        return true;
      }

      const baseUrl = endpoint.replace(/\/+$/, '');
      const fullUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

      try {
        const res = await fetch(fullUrl, {
          method: body ? 'POST' : 'GET',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          mode: 'cors'
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [endpoint, mockEnabled, telemetry]
  );

  // Process incoming telemetry sample
  const handlePayload = useCallback((payload: EspTelemetryPayload, rtt: number) => {
    consecutiveFailuresRef.current = 0;
    setConnectionStatus('CONNECTED');
    setLatencyMs(rtt);
    setTelemetry(payload);
    setPacketCount((c) => c + 1);

    const x = payload.imu.accel.x;
    const y = payload.imu.accel.y;
    const z = payload.imu.accel.z;
    const total = Math.sqrt(x * x + y * y + z * z);

    setHistory((prev) => {
      const next: AccelSample = {
        timestamp: payload.timestamp || Date.now(),
        x,
        y,
        z,
        total
      };
      const updated = [...prev, next];
      return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
    });
  }, []);

  // Polling / Stream loop
  useEffect(() => {
    let isMounted = true;
    let abortController: AbortController | null = null;

    // Reset when disconnected
    if (!mockEnabled && !endpoint) {
      setConnectionStatus('DISCONNECTED');
      setTelemetry(null);
      setLatencyMs(null);
      return;
    }

    const poll = async () => {
      // Mock Feed (Strictly only active if mockEnabled explicitly toggled ON)
      if (mockEnabled) {
        mockPhaseRef.current += 0.2;
        const phase = mockPhaseRef.current;
        const dominantFreq = 3.2 + Math.sin(phase * 0.1) * 0.6;
        const isResonant = Math.abs(dominantFreq - 3.2) < 0.3;
        const anomaly = isResonant ? 0.65 : 0.08;

        const mockPayload: EspTelemetryPayload = {
          connected: true,
          timestamp: Date.now(),
          imu: {
            accel: {
              x: Number((Math.sin(phase * dominantFreq) * (isResonant ? 0.8 : 0.08)).toFixed(3)),
              y: Number((Math.cos(phase * dominantFreq) * (isResonant ? 0.5 : 0.05)).toFixed(3)),
              z: Number((0.98 + (isResonant ? Math.sin(phase * 2) * 0.3 : 0.02)).toFixed(3))
            },
            tilt: {
              pitch: Number((1.2 + Math.sin(phase * 0.5) * 0.8).toFixed(1)),
              roll: Number((-0.4 + Math.cos(phase * 0.5) * 0.6).toFixed(1))
            }
          },
          fft: {
            dominant_freq_hz: Number(dominantFreq.toFixed(2)),
            peak_magnitude: Number((isResonant ? 0.75 : 0.14).toFixed(2))
          },
          inference: {
            anomaly_score: Number(anomaly.toFixed(2)),
            state: isResonant ? 'RESONANCE_WARNING' : 'NOMINAL',
            probability: Number(anomaly.toFixed(2)),
            inference_latency_ms: 14
          },
          actuator: {
            safety_barrier_deployed: isResonant,
            buzzer_state: isResonant
          }
        };

        if (isMounted) {
          handlePayload(mockPayload, 8);
        }
        return;
      }

      // Real ESP32 HTTP Polling
      const startTime = performance.now();
      abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController?.abort(), timeoutMs);

      const targetUrl = `${endpoint.replace(/\/+$/, '')}/telemetry`;

      try {
        const res = await fetch(targetUrl, {
          method: 'GET',
          signal: abortController.signal,
          mode: 'cors',
          cache: 'no-store'
        });
        clearTimeout(timeoutId);

        if (!isMounted) return;

        if (res.ok) {
          const data: EspTelemetryPayload = await res.json();
          const rtt = Math.round(performance.now() - startTime);
          handlePayload(data, rtt);
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        clearTimeout(timeoutId);
        if (!isMounted) return;

        consecutiveFailuresRef.current += 1;
        setDropCount((c) => c + 1);

        if (consecutiveFailuresRef.current >= 2) {
          setConnectionStatus('DISCONNECTED');
          setLatencyMs(null);
          // Zero-fake-data enforcement: do not synthesize mock waves or hold stale data
          setTelemetry(null);
        } else {
          setConnectionStatus('RECONNECTING');
        }
      }
    };

    const intervalId = setInterval(poll, pollIntervalMs);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      if (abortController) abortController.abort();
    };
  }, [endpoint, mockEnabled, pollIntervalMs, timeoutMs, handlePayload]);

  return {
    telemetry,
    connectionStatus,
    latencyMs,
    history,
    packetCount,
    dropCount,
    sendCommand
  };
}
