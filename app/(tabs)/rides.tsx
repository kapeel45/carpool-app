import { Redirect } from 'expo-router';

// This tab never renders its own content — the tab bar press is intercepted in
// `_layout.tsx` and pushes the standalone `/myrides` screen instead. The redirect
// is only a safety net if the route is reached directly.
export default function RidesTabRedirect() {
    return <Redirect href="/myrides" />;
}
