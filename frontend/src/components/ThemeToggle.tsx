import {useTheme} from "../lib/theme";
import {MoonIcon} from "./icons";
import {Switch} from "./ui/Controls";

/** Light/dark switch. The choice is saved for the signed-in account (in this browser); new accounts start light. */
export default function ThemeToggle({email, compact = false}: { email: string | undefined; compact?: boolean }) {
    const [theme, setTheme] = useTheme(email);
    return (
        <Switch
            checked={theme === "dark"}
            onChange={(dark) => setTheme(dark ? "dark" : "light")}
            disabled={!email}
            icon={<MoonIcon size={compact ? 18 : 20}/>}
            compact={compact}
            label="Dark mode"
        />
    );
}
