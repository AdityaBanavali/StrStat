import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Bell, BellOff, Power, RefreshCw } from 'lucide-react';
import { ActuatorData } from '../types';

interface ActuatorStatusProps {
  actuator?: ActuatorData;
  isConnected: boolean;
  onSendCommand: (path: string, body?: Record<string, unknown>) => Promise<boolean>;
  onLogEvent: (msg: string, type: 'INFO' | 'WARN' | 'CRITICAL' | 'COMMAND') => void;
}

export const ActuatorStatus: React.FC<ActuatorStatusProps> = ({
  actuator,
  isConnected,
  onSendCommand,
  onLogEvent
}) => {
  const [isPending, setIsPending] = useState(false);

  const barrierDeployed = actuator?.safety_barrier_deployed ?? false;
  const buzzerActive = actuator?.buzzer_state ?? false;

  const handleToggleBarrier = async () => {
    if (!isConnected) return;
    setIsPending(true);
    const targetState = !barrierDeployed;
    onLogEvent(
      `MANUAL COMMAND: Requesting safety barrier ${targetState ? 'DEPLOYMENT' : 'RETRACTION'}`,
      'COMMAND'
    );

    const success = await onSendCommand('/actuator/barrier', { deployed: targetState });
    setIsPending(false);

    if (success) {
      onLogEvent(`Actuator ACK: Safety barrier command confirmed.`, 'INFO');
    } else {
      onLogEvent(`Actuator FAIL: Timeout or unreachable edge solenoid.`, 'CRITICAL');
    }
  };

  const handleToggleBuzzer = async () => {
    if (!isConnected) return;
    setIsPending(true);
    const targetState = !buzzerActive;
    onLogEvent(
      `MANUAL COMMAND: Hardware buzzer alarm ${targetState ? 'ENGAGED' : 'MUTED'}`,
      'COMMAND'
    );

    const success = await onSendCommand('/actuator/buzzer', { state: targetState });
    setIsPending(false);

    if (success) {
      onLogEvent(`Actuator ACK: Buzzer state updated.`, 'INFO');
    } else {
      onLogEvent(`Actuator FAIL: Command rejected.`, 'WARN');
    }
  };

  return (
    <div className="bg-[#111318] border border-[#1F2430] rounded p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-[#1F2430] pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <h3 className="text-xs font-mono font-semibold tracking-wider text-slate-200 uppercase">
            SAFETY ACTUATOR // HARDWARE TRIP INTERFACE
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-500">RELAY GPIO 23/25</span>
      </div>

      {/* Actuator States */}
      <div className="grid grid-cols-2 gap-3 mb-3 font-mono">
        {/* Safety Barrier Gate */}
        <div
          className={`p-3 rounded border flex flex-col justify-between gap-2 ${
            !isConnected
              ? 'bg-[#090A0F] border-[#1F2430] text-slate-500'
              : barrierDeployed
              ? 'bg-[#EF4444]/15 border-[#EF4444]/50 text-[#EF4444]'
              : 'bg-[#10B981]/10 border-[#10B981]/40 text-[#10B981]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400">
              SAFETY BARRIER GATE
            </span>
            {barrierDeployed ? (
              <ShieldAlert className="w-4 h-4 text-[#EF4444]" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            )}
          </div>
          <div>
            <span className="text-xs font-bold tracking-wide">
              {isConnected ? (barrierDeployed ? 'DEPLOYED // TRIPPED' : 'RETRACTED // STANDBY') : 'OFFLINE'}
            </span>
            <span className="text-[10px] block opacity-70">
              {barrierDeployed ? 'SOLENOID FIRED' : 'ARMED'}
            </span>
          </div>
        </div>

        {/* Acoustic Buzzer Alarm */}
        <div
          className={`p-3 rounded border flex flex-col justify-between gap-2 ${
            !isConnected
              ? 'bg-[#090A0F] border-[#1F2430] text-slate-500'
              : buzzerActive
              ? 'bg-[#F59E0B]/15 border-[#F59E0B]/50 text-[#F59E0B]'
              : 'bg-[#090A0F] border-[#1F2430] text-slate-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400">
              PIEZO ACOUSTIC ALARM
            </span>
            {buzzerActive ? (
              <Bell className="w-4 h-4 text-[#F59E0B] animate-bounce" />
            ) : (
              <BellOff className="w-4 h-4 text-slate-600" />
            )}
          </div>
          <div>
            <span className="text-xs font-bold tracking-wide">
              {isConnected ? (buzzerActive ? 'AUDIBLE SIREN ACTIVE' : 'MUTED // SILENT') : 'OFFLINE'}
            </span>
            <span className="text-[10px] block opacity-70">
              {buzzerActive ? '105 dB PULSE' : 'IDLE'}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Actuator Commands */}
      <div className="border-t border-[#1F2430] pt-2.5 flex items-center justify-between gap-2 font-mono text-xs">
        <button
          onClick={handleToggleBarrier}
          disabled={!isConnected || isPending}
          className={`flex-1 py-1.5 px-3 rounded text-[11px] font-semibold tracking-wider uppercase transition flex items-center justify-center gap-1.5 border ${
            !isConnected
              ? 'bg-[#090A0F] border-[#1F2430] text-slate-600 cursor-not-allowed'
              : barrierDeployed
              ? 'bg-[#10B981]/20 border-[#10B981] text-[#10B981] hover:bg-[#10B981]/30'
              : 'bg-[#EF4444]/20 border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444]/30'
          }`}
        >
          {isPending ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Power className="w-3 h-3" />
          )}
          <span>{barrierDeployed ? 'RESET / RETRACT GATE' : 'EMERGENCY TRIP GATE'}</span>
        </button>

        <button
          onClick={handleToggleBuzzer}
          disabled={!isConnected || isPending}
          className={`py-1.5 px-3 rounded text-[11px] font-semibold tracking-wider uppercase transition flex items-center justify-center gap-1.5 border ${
            !isConnected
              ? 'bg-[#090A0F] border-[#1F2430] text-slate-600 cursor-not-allowed'
              : buzzerActive
              ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B]'
              : 'bg-[#161922] hover:bg-[#1F2430] border-[#1F2430] text-slate-300'
          }`}
        >
          <span>{buzzerActive ? 'MUTE SIREN' : 'TEST SIREN'}</span>
        </button>
      </div>
    </div>
  );
};
