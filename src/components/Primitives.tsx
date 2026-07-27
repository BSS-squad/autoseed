import type { ReactNode } from 'react';

import { classNames } from '../lib/ui';

type CommonProps = {
  className?: string;
  children?: ReactNode;
};

type MetricCardProps = CommonProps & {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
};

type NoticeProps = CommonProps & {
  title: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  testId?: string;
};

type EmptyStateProps = CommonProps & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  testId?: string;
};

type LabelledContainerProps = CommonProps & {
  label: string;
  testId?: string;
};

export function MetricCard({
  label,
  value,
  description,
  className
}: MetricCardProps) {
  return (
    <article className={classNames('ui-metric-card', className)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {description ? <p>{description}</p> : null}
    </article>
  );
}

export function Notice({
  title,
  tone = 'neutral',
  className,
  testId,
  children
}: NoticeProps) {
  return (
    <section
      className={classNames('ui-notice', `ui-notice-${tone}`, className)}
      data-testid={testId}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <strong>{title}</strong>
      {children}
    </section>
  );
}

export function EmptyState({
  eyebrow,
  title,
  description,
  className,
  testId,
  children
}: EmptyStateProps) {
  return (
    <div
      className={classNames('ui-empty-state', className)}
      data-testid={testId}
    >
      {eyebrow ? <span className="overview-label">{eyebrow}</span> : null}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  );
}

export function SegmentedControl({
  label,
  className,
  testId,
  children
}: LabelledContainerProps) {
  return (
    <div
      className={classNames('ui-segmented-control', className)}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function ServerSelector({
  label,
  className,
  testId,
  children
}: LabelledContainerProps) {
  return (
    <section
      className={classNames('ui-server-selector', className)}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

export function ResponsiveTable({
  label,
  className,
  testId,
  children
}: LabelledContainerProps) {
  return (
    <div
      className={classNames('ui-responsive-table', className)}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
