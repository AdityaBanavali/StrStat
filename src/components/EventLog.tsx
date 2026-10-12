import React from 'react';
import { Terminal, Trash2, ShieldAlert, AlertTriangle, Info } from 'lucide-react';
import { EventLogItem } from '../types';

interface EventLogProps {
  logs: EventLogItem[];
  onClear: () => void;
}

export const EventLog: React.FC<EventLogProps> = ({ logs, onClear }) => {
  const getBadgeStyle = (type: EventLogItem['type']) => {
    switch (type) {
      case 'CRITICAL':
        return 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/30';
      case 'WARN':
        return 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/30';
      case 'COMMAND':
        return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
      case 'INFO':
      default:
        return 'text-slate-400 bg-slate-800/40 border-slate-700/40';
    }
  };

  return (
    <div className="bg-[#111318] border border-[#1F2430] rounded p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-[#1F2430] pb-2.5 mb-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-mono font-semibold tracking-wider text-slate-200 uppercase">
            INCIDENT AUDIT LOG // EVENT TELEMETRY
          </h3>
        </div>
        <button
          onClick={onClear}
          title="Clear Event Log"
          className="text-slate-500 hover:text-slate-300 transition flex items-center gap-1 text-[11px] font-mono"
        >
          <Trash2 className="w-3 h-3" />
          <span>PURGE</span>
        </button>
      </div>

      <div className="bg-[#090A0F] border border-[#1F2430] rounded p-2.5 font-mono text-[11px] overflow-y-auto max-h-48 space-y-1.5">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic py-2">No active incidents or telemetry warnings recorded.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="leading-relaxed flex items-start gap-2">
              <span className="text-slate-600 select-none text-[10px] pt-0.5">[{log.timestamp}]</span>
              <span className={`px-1.5 py-0.2 rounded border text-[9px] font-semibold ${getBadgeStyle(log.type)}`}>
                {log.type}
              </span>
              <span className="text-slate-300 flex-1">{log.message}</span>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[#1F2430] pt-2 text-[10px] font-mono text-slate-500 flex items-center justify-between">
        <span>LOG RETENTION: 100 RECORDS FIFO</span>
        <span>SECURITY LEVEL: IEC 62443 HARDENED</span>
      </div>
    </div>
  );
};
