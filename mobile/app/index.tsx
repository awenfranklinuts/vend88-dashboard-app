import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { Redirect } from "expo-router";
import { useAuth } from "../src/context/AuthContext";

export default function RootIndex() {
  const { token, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // Call hideAsync immediately. Using a short timer would cause the splash
    // to stay visible forever because <Redirect> unmounts this component
    // before the timer fires, triggering the cleanup that cancels it.
    SplashScreen.hideAsync().catch(() => {
      // Ignore if already hidden.
    });
  }, [loading]);

  // While auth is bootstrapping, render nothing so the native splash
  // stays visible (no white screen, no default spinner).
  if (loading) return null;

  return token ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
