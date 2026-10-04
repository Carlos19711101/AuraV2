import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";

// 🔑 Ajusta la ruta si tu carpeta assets está en otro lugar
const BOTON_IMAGE = require("../../assets/images/boton-acompanamiento.png");

type ActiveSession = {
  id: string;
  user_id: string;
  accepted_by: string | null;
  status: "pending" | "accepted";
};

export default function HomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );

  // ===== Animación: desvanecerse al infinito y regresar =====
  const fadeAnim = useRef(new Animated.Value(1)).current; // opacidad
  const scaleAnim = useRef(new Animated.Value(1)).current; // escala

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        // 1) Se va al infinito: se encoge + se desvanece
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 1600,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.2,
            duration: 1600,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        // 2) Pausa breve en el "infinito"
        Animated.delay(300),
        // 3) Regresa: crece + aparece
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.out(Easing.back(1.4)), // mini rebote al llegar
            useNativeDriver: true,
          }),
        ]),
        // 4) Pausa en estado visible antes del siguiente ciclo
        Animated.delay(400),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [fadeAnim, scaleAnim]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        loadUserName(uid);
        fetchPendingRequests(uid);
        checkActiveSession(uid);

        const channel = supabase
          .channel(`home_${uid}_${Math.random().toString(36).slice(2, 8)}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "support_requests",
              filter: `contact_user_id=eq.${uid}`,
            },
            () => fetchPendingRequests(uid),
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "support_sessions",
              filter: `user_id=eq.${uid}`,
            },
            () => checkActiveSession(uid),
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "support_sessions",
              filter: `accepted_by=eq.${uid}`,
            },
            () => checkActiveSession(uid),
          )
          .subscribe();

        return () => supabase.removeChannel(channel);
      }
    });
  }, []);

  const loadUserName = async (uid: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", uid)
      .maybeSingle();

    setUserName(
      profileData?.full_name ||
        profileData?.username ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "Usuaria",
    );
  };

  const fetchPendingRequests = async (uid: string) => {
    const { count } = await supabase
      .from("support_requests")
      .select("*", { count: "exact", head: true })
      .eq("contact_user_id", uid)
      .eq("status", "pending");
    setPendingCount(count || 0);
  };

  const checkActiveSession = async (uid: string) => {
    const { data: sessions } = await supabase
      .from("support_sessions")
      .select("id, user_id, accepted_by, status")
      .in("status", ["pending", "accepted"])
      .or(`user_id.eq.${uid},accepted_by.eq.${uid}`)
      .order("created_at", { ascending: false })
      .limit(1);

    setActiveSession(sessions && sessions.length > 0 ? sessions[0] : null);
  };

  const handlePanic = () => {
    Alert.alert("Botón de pánico", "¿Necesitas ayuda inmediata?", [
      {
        text: "Llamar a emergencias",
        onPress: () => console.log("Llamar 123"),
      },
      {
        text: "Enviar mensaje a contacto",
        onPress: () => router.push("/active-support"),
      },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  return (
    <LinearGradient
      colors={["#08f5f5", "#2e078a", "#7209B7", "#ad22ee"]}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.title}>
          AURA<Text style={styles.title1}>PÚRPURA </Text>
        </Text>
        <Text style={styles.subtitle}>Pulsa Acompañamiento</Text>

        {userName ? (
          <Text style={styles.userNameText}>Hola, {userName}</Text>
        ) : null}

        {/* ===== BOTÓN CON IMAGEN + ANIMACIÓN "AL INFINITO" ===== */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            marginBottom: 30,
          }}
        >
          <TouchableOpacity
            onPress={() => router.push("./active-support")}
            activeOpacity={0.85}
          >
            <ImageBackground
              source={BOTON_IMAGE}
              style={styles.panicButton}
              // imageStyle={styles.panicButtonImage}
              resizeMode="cover"
            >
              <Text style={styles.panicText}></Text>
              <Text style={styles.panicText}>Acompañamiento</Text>
            </ImageBackground>
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickButton}
            onPress={() => router.push("/(tabs)/contactos")}
          >
            <Ionicons name="people" size={24} color="#FFF" />
            <Text style={styles.quickText}>Contactos Apoyo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickButton}
            onPress={() => router.push("././resources")}
          >
            <Ionicons name="call" size={24} color="#FFF" />
            <Text style={styles.quickText}>Líneas de ayuda</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.requestsButton}
          onPress={() => router.push("/requests-received")}
          activeOpacity={0.85}
        >
          <Ionicons name="notifications" size={24} color="#FFF" />
          <Text style={styles.requestsText}>Solicitudes recibidas</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View>
          <Text style={styles.requestsText1}>Global Solutions IA</Text>
        </View>

        {activeSession && (
          <TouchableOpacity
            style={styles.activeButtonWrapper}
            onPress={() =>
              router.push({
                pathname: "/companion-session",
                params: { session_id: activeSession.id },
              })
            }
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={["#2ECC71", "#27AE60"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.activeButtonGradient}
            >
              <View style={styles.activePulse}>
                <View style={styles.activePulseInner} />
              </View>
              <Ionicons name="heart" size={18} color="#FFF" />
              <Text style={styles.activeButtonText}>
                {activeSession.user_id === userId
                  ? "Te están acompañando"
                  : "Estás acompañando"}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFF",
    letterSpacing: 3,
    marginTop: 0,
  },
  title1: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#FFF",
    letterSpacing: 3,
    marginTop: 10,
  },
  subtitle: {
    color: "#D8B4FE",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 20,
  },
  userNameText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 20,
  },

  // ===== BOTÓN CON IMAGEN =====
  panicButton: {
    width: 200,
    height: 200,
    borderRadius: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden", // 🔑 recorta la imagen cuadrada al círculo
    // Sombra (opcional, le da profundidad al botón con imagen)
    // shadowColor: "#00fff2",
    // shadowOpacity: 0.6,
    // shadowRadius: 50,
    // shadowOffset: { width: 0, height: 0 },
    // elevation: 6,
  },
  panicButtonImage: {
    borderRadius: 100, // 🔑 también aquí para que el borde sea perfecto
  },
  panicOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)", // 🔑 oscurece un poco la imagen
    borderRadius: 100,
  },

  panicText: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 10,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  panicIconCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    marginBottom: 8,
  },
  panicSubtext: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.3,
  },

  quickActions: { flexDirection: "row", gap: 16, marginBottom: 20 },
  quickButton: {
    backgroundColor: "rgba(20, 1, 1, 0.15)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: "center",
    gap: 6,
  },
  quickText: { color: "#FFF", fontSize: 14 },
  requestsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "rgba(1, 0, 14, 0.25)",
  },
  requestsText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  badge: {
    backgroundColor: "#FF4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  requestsText1: {
    marginTop: 5,
    color: "#05f3fc",
    fontSize: 14,
    fontWeight: "700",
  },

  badgeText: { color: "#FFF", fontSize: 12, fontWeight: "bold" },
  activeButtonWrapper: {
    marginTop: 12,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#2ECC71",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  activeButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  activePulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  activePulseInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFF",
  },
  activeButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
