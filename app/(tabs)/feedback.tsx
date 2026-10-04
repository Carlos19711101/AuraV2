import { supabase } from "@/src/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ✅ Ruta correcta: feedback.tsx está dentro de (tabs), sube 2 niveles
const GRACIAS_IMAGE = require("../../assets/images/gracias-aura.png");

export default function FeedbackScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  // ============================================================
  // NAVEGACIÓN: volver al perfil
  // ============================================================
  const goBackToProfile = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/profile");
    }
  };

  // ============================================================
  // ANIMACIÓN DE SALTOS
  // ============================================================
  useEffect(() => {
    if (!sent) return;

    const jumpTo = (x: number, rot: number) =>
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: x,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(translateY, {
            toValue: -25,
            duration: 200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 200,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(rotate, {
          toValue: rot,
          duration: 400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]);

    const returnCenter = () =>
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 350,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(translateY, {
            toValue: -10,
            duration: 175,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 175,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(rotate, {
          toValue: 0,
          duration: 350,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        jumpTo(60, 15),
        Animated.delay(200),
        returnCenter(),
        Animated.delay(400),
        jumpTo(-60, -15),
        Animated.delay(200),
        returnCenter(),
        Animated.delay(500),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [sent, translateX, translateY, rotate]);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length < 3) {
      Alert.alert("Muy corto", "Cuéntanos un poco más 😊");
      return;
    }

    try {
      setSending(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const { error } = await supabase.from("feedback").insert({
        user_id: userId,
        message: trimmed,
        platform: Platform.OS,
      });

      if (error) throw error;

      translateX.setValue(0);
      translateY.setValue(0);
      rotate.setValue(0);
      setSent(true);
      setMessage("");
    } catch (error: any) {
      Alert.alert("Error", error?.message || "No se pudo enviar tu mensaje");
    } finally {
      setSending(false);
    }
  };

  // ============================================================
  // VISTA DE ÉXITO
  // ============================================================
  if (sent) {
    const rotateInterpolate = rotate.interpolate({
      inputRange: [-15, 15],
      outputRange: ["-15deg", "15deg"],
    });

    return (
      <LinearGradient
        colors={["#0ddbf7", "#3A0CA3", "#7209B7", "#1A0033"]}
        style={styles.container}
      >
        <SafeAreaView style={styles.successContainer}>
          <Animated.View
            style={[
              styles.animatedImageWrapper,
              {
                transform: [
                  { translateX },
                  { translateY },
                  { rotate: rotateInterpolate },
                ],
              },
            ]}
          >
            <ImageBackground
              source={GRACIAS_IMAGE}
              style={styles.animatedImage}
              resizeMode="contain"
            />
          </Animated.View>

          <Text style={styles.successTitle}>¡Gracias por tu aporte!</Text>
          <Text style={styles.successSubtitle}>
            Tu voz nos ayuda a construir una Aura Púrpura mejor para tod@s.
          </Text>

          <TouchableOpacity
            style={styles.successButton}
            onPress={goBackToProfile}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.successButtonText}>Volver al perfil</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setSent(false)}
            style={styles.successSecondary}
          >
            <Text style={styles.successSecondaryText}>Enviar otro mensaje</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================================
  // VISTA DE FORMULARIO
  // ============================================================
  return (
    <LinearGradient
      colors={["#09eeee", "#3A0CA3", "#7209B7", "#1A0033"]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={goBackToProfile}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Sugerencias</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.systemBubbleRow}>
              <View style={styles.systemBubble}>
                <Text style={styles.systemBubbleText}>
                  ¡Hola! 🤗 Este es un espacio para escucharte.
                </Text>
              </View>
            </View>

            <View style={styles.systemBubbleRow}>
              <View style={styles.systemBubble}>
                <Text style={styles.systemBubbleText}>
                  Cuéntanos ideas, sugerencias o algo que quieras que mejoremos.
                  Tu mensaje llega directo al equipo de Aura Púrpura.
                </Text>
              </View>
            </View>

            <View style={styles.systemBubbleRow}>
              <View style={styles.systemBubble}>
                <Text style={styles.systemBubbleText}>
                  Todo lo que escribas es confidencial. 😇
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.inputBar}>
            <TextInput
              style={styles.inputField}
              value={message}
              onChangeText={setMessage}
              placeholder="Escribe tu sugerencia..."
              placeholderTextColor="rgba(233,213,255,0.4)"
              multiline
              maxLength={1000}
              textAlignVertical="center"
            />
            <TouchableOpacity
              style={[styles.sendBtn, sending && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={sending || message.trim().length === 0}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Ionicons name="paper-plane" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#FFF" },
  messagesContent: { padding: 20, paddingBottom: 10, gap: 12 },
  systemBubbleRow: { alignItems: "flex-start" },
  systemBubble: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: "85%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  systemBubbleText: { color: "#E9D5FF", fontSize: 14, lineHeight: 20 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  inputField: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: "#FFF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#9D4EDD",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#9D4EDD",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  animatedImageWrapper: {
    width: 220,
    height: 220,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  animatedImage: { width: "100%", height: "100%" },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 12,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 15,
    color: "#D8B4FE",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  successButton: {
    backgroundColor: "#9D4EDD",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#9D4EDD",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  successButtonText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  successSecondary: { marginTop: 20, padding: 12 },
  successSecondaryText: {
    color: "rgba(233,213,255,0.7)",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
