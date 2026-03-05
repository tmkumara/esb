import type { RouteStatus, ValidationStatus, LogLevel } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'purple';
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'neutral', size = 'sm' }: BadgeProps) {
  const variantClasses = {
    success: 'bg-green-100 text-green-700 border-green-200',
    error: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${variantClasses[variant]} ${sizeClasses[size]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: RouteStatus }) {
  const config: Record<RouteStatus, { variant: BadgeProps['variant']; dot: string }> = {
    Started: { variant: 'success', dot: 'bg-green-500' },
    Stopped: { variant: 'error', dot: 'bg-red-500' },
    Suspended: { variant: 'warning', dot: 'bg-amber-500' },
  };

  const { variant, dot } = config[status];

  return (
    <Badge variant={variant}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} mr-1.5 inline-block`} />
      {status}
    </Badge>
  );
}

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  const config: Record<ValidationStatus, BadgeProps['variant']> = {
    PASS: 'success',
    FAIL: 'error',
    WARN: 'warning',
  };
  return <Badge variant={config[status]}>{status}</Badge>;
}

export function LogLevelBadge({ level }: { level: LogLevel }) {
  const config: Record<LogLevel, BadgeProps['variant']> = {
    ERROR: 'error',
    WARN: 'warning',
    INFO: 'info',
    DEBUG: 'neutral',
  };
  return <Badge variant={config[level]}>{level}</Badge>;
}
