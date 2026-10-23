import { cn } from "cn";
import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

// Icons exactly as drawn in the design prototype: lucide-like, some of them simplified, so they are
// not taken from lucide-react. Size and stroke width vary per use like in the prototype.
function createIcon(content: ReactNode) {
  return function Icon({ size = 16, strokeWidth = 2, className, ...props }: IconProps) {
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0", className)}
        {...props}
      >
        {content}
      </svg>
    );
  };
}

export const MenuIcon = createIcon(<path d="M4 7h16M4 12h16M4 17h16" />);
export const XIcon = createIcon(<path d="M18 6 6 18M6 6l12 12" />);
export const AlertTriangleIcon = createIcon(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);
export const CheckIcon = createIcon(<path d="M20 6 9 17l-5-5" />);
export const PlusIcon = createIcon(<path d="M12 5v14M5 12h14" />);
export const CalendarIcon = createIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>,
);
export const ClockIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const LayersIcon = createIcon(
  <>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </>,
);
export const MapPinIcon = createIcon(
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>,
);
export const ChevronRightIcon = createIcon(<path d="m9 18 6-6-6-6" />);
export const ChevronLeftIcon = createIcon(<path d="m15 18-6-6 6-6" />);
export const MessageSquareIcon = createIcon(
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
);
export const ExternalLinkIcon = createIcon(
  <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
);
