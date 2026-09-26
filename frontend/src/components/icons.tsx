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

export const CloseIcon = (p: IconProps) => (
    <Icon {...p}>
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
    </Icon>
);
