import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/context/AuthContext";

export default function RootIndex() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f4f6fb",
        }}
      >
        <ActivityIndicator size="large" color="#0f4cc9" />
      </View>
    );
  }

  return token ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
