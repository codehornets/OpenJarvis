import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import {
  Zap,
  Activity,
  Thermometer,
  DollarSign,
  TrendingDown,
  Cloud,
  HardDrive,
  Hash,
  X,
  Trophy,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getBase } from '../../lib/api';

interface EnergyData {
  total_energy_j?: number;
  energy_per_token_j?: number;
  avg_power_w?: number;
  cpu_temp_c?: number | null;
  gpu_temp_c?: number | null;
}

interface TelemetryStats {
  total_requests?: number;
  total_tokens?: number;
}

// Full-scale reading for the power bar — a laptop-class package ceiling, so
// typical local-inference draw lands mid-bar rather than pinned.
const MAX_POWER_W = 150;

const CLOUD_PRICING = [
  { name: 'GPT-5.6 Sol', input: 5.00, output: 30.00, primary: true },
  { name: 'Claude Fable 5', input: 10.00, output: 50.00, primary: false },
  { name: 'Gemini 3.1 Pro', input: 2.00, output: 12.00, primary: false },
];

export function SystemPanel() {
  const savings = useAppStore((s) => s.savings);
  const toggleSystemPanel = useAppStore((s) => s.toggleSystemPanel);
  const optInEnabled = useAppStore((s) => s.optInEnabled);
  const setOptInModalOpen = useAppStore((s) => s.setOptInModalOpen);
  const liveEnergy = useAppStore((s) => s.liveEnergy);
  const [energy, setEnergy] = useState<EnergyData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryStats | null>(null);
  const [lastOk, setLastOk] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const base = getBase();
      const [energyRes, telRes] = await Promise.allSettled([
        fetch(`${base}/v1/telemetry/energy`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${base}/v1/telemetry/stats`).then((r) => (r.ok ? r.json() : null)),
      ]);
      const energyData =
        energyRes.status === 'fulfilled' ? (energyRes.value as EnergyData | null) : null;
      const telData =
        telRes.status === 'fulfilled' ? (telRes.value as TelemetryStats | null) : null;
      if (energyData) {
        setEnergy(energyData);
      }
      if (telData) {
        setTelemetry(telData);
      }
      setLastOk(energyData != null || telData != null);
    } catch {
      // best-effort
      setLastOk(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Re-fetch energy/telemetry when savings updates (after a chat message)
  useEffect(() => {
    if (savings) fetchData();
  }, [savings, fetchData]);

  const promptK = (savings?.total_prompt_tokens ?? 0) / 1000;
  const completionK = (savings?.total_completion_tokens ?? 0) / 1000;
  const powerW = liveEnergy?.power_w ?? energy?.avg_power_w ?? 0;

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{
        width: 280,
        minWidth: 280,
        background: 'var(--color-bg)',
        borderLeft: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="flex items-center gap-2">
          <span
            className="hud-heartbeat"
            aria-hidden="true"
            style={
              {
                background: 'var(--color-accent-2)',
                '--color-accent-glow': 'var(--color-accent-2-glow)',
              } as CSSProperties
            }
          />
          <span className="hud-label" style={{ color: 'var(--color-text-secondary)' }}>
            System
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <StatusBadge label={lastOk ? 'Live' : 'Offline'} tone={lastOk ? 'accent' : 'neutral'} />
          <button
            onClick={toggleSystemPanel}
            className="p-1 rounded-md transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-tertiary)' }}
            title="Close panel"
          >
            <X size={14} />
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Session Stats */}
        <section>
          <h4 className="hud-label mb-2">Session</h4>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat
              icon={Hash}
              label="Requests"
              value={String(savings?.total_calls ?? telemetry?.total_requests ?? 0)}
              index={0}
            />
            <MiniStat
              icon={Hash}
              label="Output Tokens"
              value={formatNumber(savings?.total_completion_tokens ?? telemetry?.total_tokens ?? 0)}
              index={1}
            />
          </div>
        </section>

        {/* Device */}
        <section>
          <h4 className="hud-label mb-2">Device</h4>
          <div className="grid grid-cols-2 gap-2">
            {energy?.cpu_temp_c != null && (
              <MiniStat
                icon={Thermometer}
                label="CPU Temp"
                value={String(Math.round(energy.cpu_temp_c))}
                unit="°C"
                index={0}
                barPercent={tempPercent(energy.cpu_temp_c)}
                barColor={tempStatus(energy.cpu_temp_c)}
              />
            )}
            {energy?.gpu_temp_c != null && (
              <MiniStat
                icon={Thermometer}
                label="GPU Temp"
                value={String(Math.round(energy.gpu_temp_c))}
                unit="°C"
                index={1}
                barPercent={tempPercent(energy.gpu_temp_c)}
                barColor={tempStatus(energy.gpu_temp_c)}
              />
            )}
            <MiniStat
              icon={Zap}
              label="Power"
              value={powerW.toFixed(1)}
              unit="W"
              index={2}
              barPercent={loadPercent(powerW, MAX_POWER_W)}
              barColor={loadStatus(loadPercent(powerW, MAX_POWER_W))}
            />
            <MiniStat
              icon={Activity}
              label="Energy"
              value={(
                ((liveEnergy?.energy_j ?? energy?.total_energy_j ?? 0) / 1000)
              ).toFixed(1)}
              unit="kJ"
              index={3}
            />
          </div>
        </section>


        {/* Cost Comparison */}
        <section>
          <h4 className="hud-label mb-2">Cost Comparison</h4>

          {/* Local */}
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 mb-2"
            style={{ background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent)' }}
          >
            <HardDrive size={14} style={{ color: 'var(--color-accent)' }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>Local</div>
            </div>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-success)' }}>
              ${(savings?.local_cost ?? 0).toFixed(4)}
            </div>
          </div>

          {/* Cloud providers */}
          <div className="flex flex-col gap-1.5">
            {CLOUD_PRICING.map((provider) => {
              const cost = (promptK * provider.input) / 1000 + (completionK * provider.output) / 1000;
              const saved = cost - (savings?.local_cost ?? 0);
              return (
                <div
                  key={provider.name}
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{
                    background: provider.primary ? 'var(--color-bg-secondary)' : 'var(--color-bg-secondary)',
                    border: provider.primary ? '1px solid var(--color-border-accent, var(--color-accent))' : '1px solid transparent',
                  }}
                >
                  <Cloud size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs truncate"
                      style={{
                        color: provider.primary ? 'var(--color-text)' : 'var(--color-text-secondary)',
                        fontWeight: provider.primary ? 500 : 400,
                      }}
                    >
                      {provider.name}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono" style={{ color: 'var(--color-text)' }}>
                      ${cost.toFixed(4)}
                    </div>
                    {saved > 0.0001 && (
                      <div className="text-[9px] flex items-center gap-0.5 justify-end" style={{ color: 'var(--color-success)' }}>
                        <TrendingDown size={8} />
                        ${saved.toFixed(4)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>


        </section>

        {/* Leaderboard / Share */}
        <section>
          <h4 className="hud-label mb-2">Leaderboard</h4>

          <button
            onClick={() => setOptInModalOpen(true)}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors cursor-pointer"
            style={{
              background: optInEnabled
                ? 'var(--color-accent-subtle)'
                : 'var(--color-bg-secondary)',
              border: optInEnabled
                ? '1px solid var(--color-accent)'
                : '1px solid var(--color-border)',
            }}
          >
            <Trophy
              size={14}
              style={{
                color: optInEnabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              }}
            />
            <span
              className="text-xs flex-1 text-left"
              style={{
                color: optInEnabled ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >
              {optInEnabled ? 'Sharing Savings' : 'Share Your Savings'}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{
                background: optInEnabled ? 'var(--color-accent)' : 'var(--color-bg-tertiary, var(--color-bg-secondary))',
                color: optInEnabled ? 'white' : 'var(--color-text-tertiary)',
              }}
            >
              {optInEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <a
            href="https://codehornets.github.io/handymate/leaderboard"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 mt-1.5 px-3 py-1.5 text-[11px] rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          >
            <ExternalLink size={10} />
            View Leaderboard
          </a>
        </section>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  unit,
  index = 0,
  barPercent,
  barColor = 'var(--color-accent)',
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  unit?: string;
  index?: number;
  barPercent?: number;
  barColor?: string;
}) {
  return (
    <div
      className="rounded-lg px-2.5 py-2 animate-in fade-in slide-in-from-left-1"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        animationDelay: `${index * 60}ms`,
        animationDuration: '300ms',
        animationFillMode: 'both',
      }}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <Icon size={10} style={{ color: 'var(--color-accent)' }} />
        <span
          className="text-[8px] font-mono tracking-[0.15em] uppercase font-light"
          style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-hud)' }}
        >
          {label}
        </span>
      </div>
      <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
        {value}
        {unit && (
          <span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            {unit}
          </span>
        )}
      </div>
      {barPercent != null && <NeonBar percent={barPercent} color={barColor} />}
    </div>
  );
}

function NeonBar({ percent, color }: { percent: number; color: string }) {
  const safe = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="relative h-[3px] w-full overflow-hidden rounded-full mt-1.5"
      style={{ background: 'var(--color-bg-tertiary)' }}
    >
      <div
        className="absolute left-0 top-0 h-full w-full rounded-full origin-left transition-transform duration-500 ease-out will-change-transform"
        style={{
          transform: `scaleX(${safe / 100})`,
          background: color,
          boxShadow: `0 0 6px color-mix(in srgb, ${color} 70%, transparent)`,
        }}
      />
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'accent' | 'error' | 'neutral';
}) {
  const toneColor =
    tone === 'accent' ? 'var(--color-accent)' : tone === 'error' ? 'var(--color-error)' : 'var(--color-text-tertiary)';
  return (
    <span
      className="px-1.5 py-0.5 rounded border text-[7px] font-mono tracking-widest uppercase font-semibold shrink-0"
      style={{
        borderColor: `color-mix(in srgb, ${toneColor} 40%, transparent)`,
        background: `color-mix(in srgb, ${toneColor} 10%, transparent)`,
        color: toneColor,
        fontFamily: 'var(--font-hud)',
      }}
    >
      {label}
    </span>
  );
}

function loadPercent(value: number, max: number): number {
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function loadStatus(percent: number): string {
  if (percent > 85) return 'var(--color-error)';
  if (percent > 70) return 'var(--color-warning)';
  return 'var(--color-accent)';
}

function tempPercent(tempC: number): number {
  // Map ~20-90C onto a 0-100% bar, matching the reference HUD's temp scaling.
  return Math.min(100, Math.max(0, ((tempC - 20) / 70) * 100));
}

function tempStatus(tempC: number | null): string {
  if (tempC == null) return 'var(--color-accent)';
  if (tempC > 85) return 'var(--color-error)';
  if (tempC > 70) return 'var(--color-warning)';
  return 'var(--color-accent)';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
