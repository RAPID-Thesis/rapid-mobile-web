import type { ReactNode } from 'react';
import { APP_NAME } from '../../lib/branding';

/**
 * Shared shell for the four auth routes.
 *
 * Replaces a dark blue gradient + translucent card that was duplicated verbatim
 * across LoginPage, RegisterPage, ForgotPasswordPage and ResetPasswordPage, and
 * which looked like a different product from the light portal behind it.
 *
 * The layout is a split: an institutional panel that establishes who operates
 * this system, and a plain white column for the form. On small screens the
 * panel collapses to a compact masthead so the form stays above the fold.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Institutional panel */}
      <div className="flex shrink-0 flex-col justify-between bg-brand-900 px-6 py-6 text-white lg:w-[420px] lg:px-10 lg:py-10">
        <div className="flex items-center gap-3">
          <img
            src="/brand/cdrrmo-seal.png"
            srcSet="/brand/cdrrmo-seal.png 1x, /brand/cdrrmo-seal@2x.png 2x"
            alt=""
            width={44}
            height={44}
            className="shrink-0 rounded-full bg-white"
          />
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight">{APP_NAME}</p>
            <p className="text-2xs text-white/60">City Disaster Risk Reduction &amp; Management Office</p>
          </div>
        </div>

        {/* Desktop-only supporting copy. Concrete about what the tool does —
            no aspirational marketing language. */}
        <div className="hidden lg:block">
          <p className="text-lg font-medium leading-snug text-white/90">
            Rapid structural assessment for San&nbsp;Jose del&nbsp;Monte, Bulacan.
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">
            Field inspectors capture building condition offline. Engineers review the
            classification and issue the official screening record.
          </p>
        </div>

        <p className="mt-6 text-2xs text-white/40 lg:mt-0">
          Screening follows FEMA P-154 (pre-earthquake) and ATC-20 (post-earthquake).
        </p>
      </div>

      {/* Form column */}
      <div className="flex flex-1 items-center justify-center bg-surface px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-ink-subtle">{description}</p>}

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-6 border-t border-line pt-4 text-sm">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
