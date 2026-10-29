import type {ReactNode} from "react";
import {Navigate} from "react-router-dom";
import {ONBOARDING_PATH, useNeedsOnboarding} from "../lib/onboarding";

export default function OnboardingGate({children}: { children: ReactNode }) {
    const needsOnboarding = useNeedsOnboarding();
    return needsOnboarding ? <Navigate to={ONBOARDING_PATH} replace/> : children;
}
