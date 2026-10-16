import type {ReactNode, SVGProps} from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({size = 18, children, ...rest}: IconProps & { children: ReactNode }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
            {children}
        </svg>
    );
}

export const CalendarIcon = (p: IconProps) => (
    <Icon {...p}>
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
    </Icon>
);

export const HouseIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M3 10.5 12 3l9 7.5"/>
        <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>
    </Icon>
);

export const PlusIcon = (p: IconProps) => (
    <Icon {...p}>
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
    </Icon>
);

export const LogoutIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
    </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
    <Icon size={16} {...p}>
        <polyline points="15 18 9 12 15 6"/>
    </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
    <Icon size={20} {...p}>
        <polyline points="9 18 15 12 9 6"/>
    </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
    <Icon size={16} {...p}>
        <polyline points="6 9 12 15 18 9"/>
    </Icon>
);

export const CheckIcon = (p: IconProps) => (
    <Icon {...p}>
        <polyline points="20 6 9 17 4 12"/>
    </Icon>
);

export const TrashIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M3 6h18"/>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <line x1="10" y1="11" x2="10" y2="17"/>
        <line x1="14" y1="11" x2="14" y2="17"/>
    </Icon>
);

export const PersonIcon = (p: IconProps) => (
    <Icon size={13} {...p}>
        <path d="M20 21a8 8 0 0 0-16 0"/>
        <circle cx="12" cy="7" r="4"/>
    </Icon>
);

export const BedIcon = (p: IconProps) => (
    <Icon size={13} {...p}>
        <path d="M2 4v16"/>
        <path d="M2 8h18a2 2 0 0 1 2 2v10"/>
        <path d="M2 17h20"/>
        <path d="M6 8v9"/>
    </Icon>
);

export const RefreshIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/>
        <path d="M3 21v-5h5"/>
        <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/>
        <path d="M21 3v5h-5"/>
    </Icon>
);

export const MoreVerticalIcon = (p: IconProps) => (
    <Icon {...p}>
        <circle cx="12" cy="5" r="1"/>
        <circle cx="12" cy="12" r="1"/>
        <circle cx="12" cy="19" r="1"/>
    </Icon>
);

export const MenuIcon = (p: IconProps) => (
    <Icon {...p}>
        <line x1="4" y1="6" x2="20" y2="6"/>
        <line x1="4" y1="12" x2="20" y2="12"/>
        <line x1="4" y1="18" x2="20" y2="18"/>
    </Icon>
);

export const MinusIcon = (p: IconProps) => (
    <Icon {...p}>
        <line x1="5" y1="12" x2="19" y2="12"/>
    </Icon>
);

export const WarningIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
    </Icon>
);

export const CloseIcon = (p: IconProps) => (
    <Icon {...p}>
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
    </Icon>
);
export const AlertIcon = (p: IconProps) => (
    <Icon size={20} {...p}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
    </Icon>
);

export const SyncIcon = (p: IconProps) => (
    <Icon size={20} {...p}>
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
        <path d="M16 21v-5h5"/>
    </Icon>
);

export const CalendarXIcon = (p: IconProps) => (
    <Icon {...p}>
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="10" y1="14" x2="14" y2="18"/>
        <line x1="14" y1="14" x2="10" y2="18"/>
    </Icon>
);

export const BellIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </Icon>
);

export const HelpIcon = (p: IconProps) => (
    <Icon {...p}>
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/>
        <line x1="12" y1="17.5" x2="12" y2="17.5"/>
    </Icon>
);

export const InfoIcon = (p: IconProps) => (
    <Icon size={20} {...p}>
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
    </Icon>
);

export const AlertCircleIcon = (p: IconProps) => (
    <Icon size={16} {...p}>
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
    </Icon>
);

export const CheckCircleIcon = (p: IconProps) => (
    <Icon size={20} {...p}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
    </Icon>
);

export const MoreHorizontalIcon = (p: IconProps) => (
    <Icon size={20} {...p}>
        <circle cx="5" cy="12" r="1"/>
        <circle cx="12" cy="12" r="1"/>
        <circle cx="19" cy="12" r="1"/>
    </Icon>
);

export const EditIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </Icon>
);

export const CopyIcon = (p: IconProps) => (
    <Icon {...p}>
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </Icon>
);

export const SearchIcon = (p: IconProps) => (
    <Icon {...p}>
        <circle cx="11" cy="11" r="7"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </Icon>
);

export const WifiOffIcon = (p: IconProps) => (
    <Icon {...p}>
        <line x1="2" y1="2" x2="22" y2="22"/>
        <path d="M8.5 16.5a5 5 0 0 1 7 0"/>
        <path d="M2 8.82a15 15 0 0 1 4.17-2.65"/>
        <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/>
        <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/>
        <path d="M5 13a10 10 0 0 1 5.24-2.76"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
    </Icon>
);

export const CompassIcon = (p: IconProps) => (
    <Icon {...p}>
        <circle cx="12" cy="12" r="10"/>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </Icon>
);

export const LinkIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </Icon>
);
