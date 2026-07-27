import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode
} from 'react';
import projectLogo from '../../image.png';
import { classNames } from '../lib/ui';

export type AppRoute = 'home' | 'winners' | 'leaderboards' | 'balance' | 'journal';
export const APP_DISPLAY_NAME = 'Автосид BSS';

type PageShellProps = {
  currentRoute: AppRoute;
  vipShopUrl?: string | null;
  className?: string;
  testId?: string;
  children: ReactNode;
};

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
  headingClassName?: string;
  eyebrowClassName?: string;
  descriptionClassName?: string;
  titleTestId?: string;
  testId?: string;
  headingLead?: ReactNode;
  before?: ReactNode;
  afterDescription?: ReactNode;
  children?: ReactNode;
};

type RouteEntry = {
  route: AppRoute;
  label: string;
  testId: string;
  defaultHash: string;
};

const ROUTES: RouteEntry[] = [
  { route: 'home', label: 'Автосид', testId: 'home-nav-link', defaultHash: '#' },
  {
    route: 'winners',
    label: 'Победители',
    testId: 'winners-nav-link',
    defaultHash: '#winners'
  },
  {
    route: 'leaderboards',
    label: 'Топы',
    testId: 'leaderboards-nav-link',
    defaultHash: '#leaderboards'
  },
  {
    route: 'balance',
    label: 'Балансер',
    testId: 'balance-nav-link',
    defaultHash: '#balance'
  },
  {
    route: 'journal',
    label: 'Журнал',
    testId: 'journal-nav-link',
    defaultHash: '#journal'
  }
];

const rememberedHashes: Partial<Record<AppRoute, string>> = {};
const BRAND_STYLE = {
  '--brand-logo': `url(${projectLogo})`
} as CSSProperties;

function rememberCurrentHash(route: AppRoute): void {
  if (typeof window === 'undefined') return;
  rememberedHashes[route] = window.location.hash || '#';
}

function getRouteHref(entry: RouteEntry, currentRoute: AppRoute): string {
  if (typeof window !== 'undefined' && entry.route === currentRoute) {
    return window.location.hash || entry.defaultHash;
  }

  return rememberedHashes[entry.route] || entry.defaultHash;
}

function activateLinkWithSpace(event: KeyboardEvent<HTMLAnchorElement>): void {
  if (event.key !== ' ') return;
  event.preventDefault();
  event.currentTarget.click();
}

function AppNav({
  currentRoute,
  vipShopUrl
}: Pick<PageShellProps, 'currentRoute' | 'vipShopUrl'>) {
  const itemCount = ROUTES.length + (vipShopUrl ? 1 : 0);
  const navStyle = { '--nav-item-count': itemCount } as CSSProperties;
  const rememberRoute = (_event: MouseEvent<HTMLAnchorElement>) =>
    rememberCurrentHash(currentRoute);

  return (
    <nav
      className="app-nav"
      aria-label="Основные разделы"
      style={navStyle}
      data-testid="app-navigation"
    >
      {ROUTES.map((entry) => {
        const active = currentRoute === entry.route;
        return (
          <a
            key={entry.route}
            className={classNames('app-nav-link', active && 'app-nav-link-active')}
            href={getRouteHref(entry, currentRoute)}
            aria-current={active ? 'page' : undefined}
            data-testid={entry.testId}
            onClick={rememberRoute}
            onKeyDown={activateLinkWithSpace}
          >
            {entry.label}
          </a>
        );
      })}
      {vipShopUrl ? (
        <a
          className="app-nav-link"
          href={vipShopUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-testid="vip-shop-nav-link"
          onKeyDown={activateLinkWithSpace}
        >
          VIP
        </a>
      ) : null}
    </nav>
  );
}

export function PageShell({
  currentRoute,
  vipShopUrl,
  className,
  testId,
  children
}: PageShellProps) {
  return (
    <div
      className={classNames('shell', 'modern-shell', 'page-shell', className)}
      style={BRAND_STYLE}
      data-testid={testId}
    >
      <div className="app-topbar">
        <AppNav currentRoute={currentRoute} vipShopUrl={vipShopUrl} />
      </div>
      <main className="page-content">{children}</main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  className,
  headingClassName,
  eyebrowClassName = 'section-eyebrow',
  descriptionClassName,
  titleTestId,
  testId,
  headingLead,
  before,
  afterDescription,
  children
}: PageHeaderProps) {
  return (
    <header className={classNames('page-header', className)} data-testid={testId}>
      {before}
      <div className={classNames('page-header-heading', headingClassName)}>
        {headingLead}
        <div className="page-header-title">
          <span className={classNames('page-header-eyebrow', eyebrowClassName)}>{eyebrow}</span>
          <h1 data-testid={titleTestId}>{title}</h1>
        </div>
        <p className={classNames('page-header-description', descriptionClassName)}>
          {description}
        </p>
        {afterDescription}
      </div>
      {children}
    </header>
  );
}
