import {useEffect} from "react";
import {canonicalUrl, DEFAULT_TITLE, findPublicRoute, PUBLIC_ROUTES} from "../publicRoutes";

const ROBOTS_ATTR = "data-rt-robots";
const PUBLIC_TITLES = new Set(PUBLIC_ROUTES.map((route) => route.title));
const HOME = PUBLIC_ROUTES.find((route) => route.path === "/")!;

function setDescription(content: string) {
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.append(meta);
    }
    meta.content = content;
}

function setCanonical(href: string | null) {
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (href === null) {
        link?.remove();
        return;
    }
    if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.append(link);
    }
    link.href = href;
}

function setNoIndex(on: boolean) {
    const existing = document.head.querySelector(`meta[${ROBOTS_ATTR}]`);
    if (!on) {
        existing?.remove();
        return;
    }
    if (existing) return;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    meta.setAttribute(ROBOTS_ATTR, "");
    document.head.append(meta);
}

/**
 * Title, description and canonical link for the public pages (src/publicRoutes.ts) after client-side navigation.
 * Every other page gets a robots noindex tag while it is shown; its title is only reset when it still shows a public
 * page's title, so pages that set their own (the admin panel) keep theirs.
 */
export function usePageMeta(pathname: string) {
    useEffect(() => {
        const route = findPublicRoute(pathname);
        if (route) {
            document.title = route.title;
            setDescription(route.description);
            setCanonical(canonicalUrl(route.path));
            setNoIndex(false);
        } else {
            if (PUBLIC_TITLES.has(document.title)) document.title = DEFAULT_TITLE;
            setDescription(HOME.description);
            setCanonical(null);
            setNoIndex(true);
        }
    }, [pathname]);
}
