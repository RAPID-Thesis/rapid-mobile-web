import type { SVGProps } from 'react';

/**
 * Icon set — one visual family: 20x20 grid, solid fills, consistent optical
 * weight. Previously these lived as raw `d` strings inside Sidebar.tsx, mixing
 * 24x24 stroked Heroicons with everything else.
 *
 * All icons are decorative: they sit next to a text label, so they are hidden
 * from assistive tech. Icon-only controls carry their name via IconButton's
 * required `label` prop instead.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const DashboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3.75A.75.75 0 013.75 3h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-.75.75h-5.5A.75.75 0 013 9.25v-5.5zM3 13.75A.75.75 0 013.75 13h5.5a.75.75 0 01.75.75v2.5a.75.75 0 01-.75.75h-5.5a.75.75 0 01-.75-.75v-2.5zM11.75 3a.75.75 0 00-.75.75v2.5c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-2.5a.75.75 0 00-.75-.75h-4.5zM11 10.75a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v5.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-5.5z" />
  </Icon>
);

export const AssessmentsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V6.621a1.5 1.5 0 00-.44-1.06l-3.12-3.122A1.5 1.5 0 0012.378 2H4.5zm1.75 6a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5zm0 3a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5zm0 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z"
      clipRule="evenodd"
    />
  </Icon>
);

export const HeatmapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M10 2a5 5 0 00-5 5c0 3.183 3.377 7.66 4.633 9.216a.47.47 0 00.734 0C11.623 14.66 15 10.183 15 7a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z"
      clipRule="evenodd"
    />
    <path d="M4.3 13.2c-1.44.53-2.3 1.24-2.3 2.05C2 16.77 5.58 18 10 18s8-1.23 8-2.75c0-.81-.86-1.52-2.3-2.05a.75.75 0 10-.52 1.41c.9.33 1.32.68 1.32.64 0 .05-.2.3-.98.6-1.19.45-3.06.75-5.52.75s-4.33-.3-5.52-.75c-.78-.3-.98-.55-.98-.6 0 .04.42-.31 1.32-.64a.75.75 0 10-.52-1.41z" />
  </Icon>
);

export const ReportsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M15.5 2A1.5 1.5 0 0117 3.5v13a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 16.5v-13A1.5 1.5 0 014.5 2h11zM6.25 6a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm0 3.5a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5zm0 3.5a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z"
      clipRule="evenodd"
    />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.97.342 1.409.587l1.25-.834a1 1 0 011.262.125l.962.962a1 1 0 01.125 1.262l-.834 1.25c.245.44.443.912.587 1.41l1.473.294a1 1 0 01.804.98v1.36a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.587 1.409l.834 1.25a1 1 0 01-.125 1.262l-.962.962a1 1 0 01-1.262.125l-1.25-.834c-.44.245-.912.443-1.41.587l-.294 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.957 6.957 0 01-1.409-.587l-1.25.834a1 1 0 01-1.262-.125l-.962-.962a1 1 0 01-.125-1.262l.834-1.25a6.957 6.957 0 01-.587-1.41l-1.473-.294A1 1 0 011 10.68V9.32a1 1 0 01.804-.98l1.473-.295c.144-.497.342-.97.587-1.409l-.834-1.25a1 1 0 01.125-1.262l.962-.962A1 1 0 015.38 3.04l1.25.834c.44-.245.912-.443 1.41-.587l.294-1.473zM13 10a3 3 0 11-6 0 3 3 0 016 0z"
      clipRule="evenodd"
    />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zM2 14.75a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
      clipRule="evenodd"
    />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
      clipRule="evenodd"
    />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
      clipRule="evenodd"
    />
  </Icon>
);

export const SignOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
      clipRule="evenodd"
    />
    <path
      fillRule="evenodd"
      d="M6 10a.75.75 0 01.75-.75h9.19l-1.72-1.72a.75.75 0 111.06-1.06l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H6.75A.75.75 0 016 10z"
      clipRule="evenodd"
    />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
      clipRule="evenodd"
    />
  </Icon>
);

export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M1 11.27c0-.246.033-.492.099-.73l1.523-5.521A2.75 2.75 0 015.273 3h9.454a2.75 2.75 0 012.651 2.019l1.523 5.52c.066.239.099.485.099.732V15a2 2 0 01-2 2H3a2 2 0 01-2-2v-3.73zm3.068-5.852A1.25 1.25 0 015.273 4.5h9.454a1.25 1.25 0 011.205.918l1.523 5.52c.006.02.01.041.015.062H14a1 1 0 00-.86.49l-.606 1.02a1 1 0 01-.86.49H8.236a1 1 0 01-.894-.553l-.448-.894A1 1 0 006 11H2.53l.015-.062 1.523-5.52z"
      clipRule="evenodd"
    />
  </Icon>
);
