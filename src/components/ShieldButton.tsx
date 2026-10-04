import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

type ShieldButtonProps = {
  onPress: () => void;
  title?: string;
  subtitle?: string;
};

export function ShieldButton({
  onPress,
  title = "Acompañamiento",
  subtitle = "Pulsa para pedir ayuda",
}: ShieldButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.wrapper}
    >
      {/* ✅ Escudo con gradiente cálido */}
      <View style={styles.shieldContainer}>
        <Svg width={200} height={220} viewBox="0 0 220 240">
          <Defs>
            <LinearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FF9BA8" />
              <Stop offset="0.5" stopColor="#FF5C7C" />
              <Stop offset="1" stopColor="#D62828" />
            </LinearGradient>
            <LinearGradient id="shieldHighlight" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="rgba(255,255,255,0.35)" />
              <Stop offset="0.5" stopColor="rgba(255,255,255,0)" />
            </LinearGradient>
          </Defs>

          {/* Sombra exterior */}
          <Path
            d="M110 10 
               C 110 10, 190 40, 190 40 
               L 190 130 
               C 190 180, 155 220, 110 230 
               C 65 220, 30 180, 30 130 
               L 30 40 
               C 30 40, 110 10, 110 10 Z"
            fill="rgba(214,40,40,0.3)"
            translate={[0, 4]}
          />

          {/* Escudo principal */}
          <Path
            d="M110 10 
               C 110 10, 190 40, 190 40 
               L 190 130 
               C 190 180, 155 220, 110 230 
               C 65 220, 30 180, 30 130 
               L 30 40 
               C 30 40, 110 10, 110 10 Z"
            fill="url(#shieldGrad)"
          />

          {/* Reflejo superior (da sensación de volumen y calidez) */}
          <Path
            d="M110 10 
               C 110 10, 190 40, 190 40 
               L 190 90 
               C 150 100, 70 100, 30 90 
               L 30 40 
               C 30 40, 110 10, 110 10 Z"
            fill="url(#shieldHighlight)"
          />
        </Svg>

        {/* ✅ Ícono de checkmark sobre el escudo */}
        <View style={styles.iconOverlay}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={48} color="#FFF" />
          </View>
        </View>
      </View>

      {/* ✅ Textos */}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  shieldContainer: {
    width: 200,
    height: 220,
    position: "relative",
    shadowColor: "#D62828",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  iconOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 30,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    marginTop: 8,
    color: "#FFF",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
