import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  dashed?: boolean;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className = '', dashed = false, onClick, hover = false }: CardProps) {
  const borderClass = dashed
    ? 'border border-dashed border-indigo-200'
    : 'border border-slate-100';

  const hoverClass = hover ? 'hover:shadow-md hover:border-indigo-300 cursor-pointer' : '';
  const clickClass = onClick ? 'cursor-pointer' : '';

  return (
    <div
      className={`bg-white rounded-xl shadow-sm ${borderClass} ${hoverClass} ${clickClass} transition-all duration-150 ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-5 py-4 border-b border-slate-100 ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-5 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl ${className}`}>
      {children}
    </div>
  );
}
