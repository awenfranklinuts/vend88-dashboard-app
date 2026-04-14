import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/src/context/AuthContext";
import { API_BASE_URL } from "@/src/services/api";

export default function SettingsScreen() {
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.label}>App</Text>
        <Text style={styles.value}>VEND88 Dashboard Mobile</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>API Base URL</Text>
        <Text style={styles.value}>{API_BASE_URL}</Text>
      </View>

      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f6fb",
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0a1628",
    marginBottom: 4,
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  label: {
    color: "#64748b",
    fontWeight: "600",
    marginBottom: 4,
  },
  value: {
    color: "#0f172a",
    fontWeight: "700",
  },
  button: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#b91c1c",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
});
